import {orderSummary} from '../../../shared/orderSummary.js';
import {inventoryHistoryHandler} from './inventory-products.js';
import {Router} from 'express';
import {acceptOrder} from '../utils/orderAcceptance.js';
import {updateOperationalOrderStatus} from '../utils/operationalOrderStatus.js';
import {updateOrderHandler,deriveCodStatus} from './orders.js';
import {riderManagementSelect,riderAvailability} from '../utils/riderManagement.js';
import bcrypt from 'bcryptjs';
import {pool} from '../config/db.js';
import {requirePermission,operationsActor,staffEvent,ownsNewSupply} from '../utils/staffPermissions.js';
import {inventoryError} from '../utils/inventory.js';
import {readSupplyVariants,supplyProduct} from '../utils/supplies.js';
import {newStaffPasswordError} from '../utils/staffAuth.js';
import {registerLettuceStock} from './lettuce-stock.js';
import {registerSupplyStock} from './gardening-supplies.js';

const router=Router();
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw inventoryError('Invalid record ID',400);return n;};
const text=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const ownProfile=`SELECT id,first_name,last_name,username,email,role,status,created_at,updated_at,last_login_at,must_change_password FROM users`;
// Admin acceptance and shipping approval remain authoritative. Packing does not accept orders.
export const eligibleOrderSql=`o.status='Preparing' AND o.admin_confirmed_at IS NOT NULL AND o.shipping_status='Confirmed'
 AND (o.payment_method='COD' OR (o.payment_method='ONLINE' AND o.payment_status='Paid'))
 AND o.inventory_restored_at IS NULL AND o.inventory_reconciliation_reason IS NULL AND harvest_order_sellable(o.id)`;
function route(fn){return async(req,res)=>{try{res.set('Cache-Control','no-store');res.json(await fn(req));}catch(e){res.status(e.code==='23505'?409:e.status||500).json({error:e.code==='23505'?'Username or email already exists.':e.status?e.message:'Unable to complete this operation.'});}};}
async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function activeActor(c,req){const u=(await c.query('SELECT status,auth_version FROM users WHERE id=$1 FOR SHARE',[req.operationsUser.userId])).rows[0];if(!u||u.status!=='active'||Number(u.auth_version)!==Number(req.operationsUser.sessionVersion||0))throw inventoryError('Session revoked',401);}

async function orders(shipments=false,overview=false){return (await pool.query(`SELECT o.id,o.created_at,o.status,o.delivery_mode,o.customer_name AS recipient,o.mobile_num AS phone,
 ${overview?`o.updated_at,o.updated_at::text AS assignment_version,o.rider_id,o.driver_accepted_at,o.driver_location_updated_at,o.shipping_status,o.total_amount,o.subtotal_amount,o.shipping_fee,o.admin_confirmed_at,o.payment_status,o.payment_method,to_jsonb(o)->>'cod_status' AS cod_status,o.gmail,o.inventory_reconciliation_reason,(o.inventory_reconciliation_reason IS NOT NULL) AS has_reconciliation,(${eligibleOrderSql}) AS operational_eligible,`:''}
 o.location AS address,o.courier_name,o.tracking_code,o.tracking_status,
 f.stage,f.version,f.checklist,f.verified_items,f.notes,f.handler_id,f.started_at,f.packed_at,f.ready_at,
 CONCAT_WS(' ',u.first_name,u.last_name) AS handler_name,
 (SELECT json_agg(json_build_object(${overview?`'unitPrice',oi.unit_price,'lineTotal',oi.line_total,'imageUrl',oi.image_url,`:''}'id',oi.id,'productId',oi.product_id,'name',oi.product_name,'code',oi.product_code,'type',oi.inventory_type,'quantity',oi.qty,'variant',oi.variant_name,'sku',oi.variant_sku,'unit',CASE WHEN oi.inventory_type='edible' THEN '400g pack' ELSE COALESCE(oi.selling_unit,'plant') END) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.id) AS items
 FROM orders o LEFT JOIN staff_fulfillment f ON f.order_id=o.id LEFT JOIN users u ON u.id=f.handler_id WHERE ${overview?'TRUE':`(${eligibleOrderSql})`} ${shipments&&!overview?"OR o.status IN ('Out for Delivery','Delivered')":''} ORDER BY o.created_at,o.id` )).rows.map(o=>overview?{...o,cod_status:deriveCodStatus(o)}:o);}
async function inventory(user){
 const rows=(await pool.query(`SELECT p.id,p.name,p.description,p.tag,p.category,p.price,p.product_code,p.inventory_type,p.image_url,p.stock,p.reserved_stock,p.low_stock_threshold,p.lettuce_stock_model,p.supply_stock_model,inventory_product_status(p) AS current_status,
 COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.inventory_state IN ('committed','legacy') AND o.inventory_restored_at IS NULL AND o.status IN ('Pending','Preparing','Cancellation Requested')),0)::int AS allocated_stock
 FROM products p WHERE p.archived_at IS NULL ORDER BY p.name,p.id`)).rows;
 for(const p of rows){
  p.can_initialize_stock=user?.role==='staff'&&p.inventory_type==='GARDENING_SUPPLY'&&await ownsNewSupply(pool,{inventoryUser:user},p.id);
  if(p.inventory_type==='GARDENING_SUPPLY')p.variants=(await readSupplyVariants(pool,p.id)).filter(v=>!v.archived_at).map(v=>({id:v.id,name:v.name,sku:v.sku,price:v.price,unit:v.selling_unit,available:v.available_stock,reserved:Number(v.variant_reserved)+Number(v.variant_committed),status:v.status}));
  else {p.alert=p.inventory_type==='succulent'?null:p.lettuce_stock_model!=='quantity'?'Reconciliation Required':p.stock===0?'Out of Stock':p.stock<=p.low_stock_threshold?'Low Stock':null;}
 }
 return rows;
}
const ownActivitySql=`SELECT 'operation-'||id AS id,action,order_id,product_id,old_value,new_value,reason,created_at FROM staff_activity WHERE staff_id=$1
 UNION ALL SELECT 'auth-'||id,action,NULL::bigint,NULL::bigint,NULL::jsonb,NULL::jsonb,''::text,created_at FROM auth_security_events WHERE user_id=$1 AND subject_key NOT LIKE 'staff-operation:%'`;
async function activity(userId,page,stockOnly=false){return {page,rows:(await pool.query(`SELECT * FROM (${ownActivitySql}) a ${stockOnly?'WHERE product_id IS NOT NULL':''} ORDER BY created_at DESC,id DESC LIMIT 31 OFFSET $2`,[userId,(page-1)*30])).rows};}

router.get('/api/staff/dashboard',requirePermission('staff.dashboard.read'),route(async req=>{
 const [list,stock,recent]=await Promise.all([orders(false,true),inventory(),activity(req.operationsUser.userId,1)]);
 const alerts=stock.flatMap(p=>p.variants?p.variants.filter(v=>['Low Stock','Out of Stock','Awaiting Stock Entry','Choose Stock Model'].includes(v.status)).map(v=>({productId:p.id,name:p.name+' / '+v.name,status:v.status})):p.alert?[{productId:p.id,name:p.name,status:p.alert}]:[]);
 return {summary:orderSummary(list.map(o=>({...o,paymentStatus:o.payment_status,codStatus:o.cod_status,trackingStatus:o.tracking_status,inventoryReconciliationReason:o.inventory_reconciliation_reason}))),counts:{pending:list.filter(o=>o.status==='Pending').length,preparing:list.filter(o=>o.status==='Preparing').length,delivery:list.filter(o=>o.status==='Out for Delivery').length,alerts:alerts.length},orders:list.slice(-8).reverse(),alerts,activity:recent.rows.slice(0,8)};
}));
router.get('/api/staff/orders/overview',requirePermission('orders.operational.read'),route(()=>orders(false,true)));
router.post('/api/staff/orders/:id/accept',requirePermission('orders.accept'),route(req=>transaction(async c=>{
 await activeActor(c,req);const orderId=id(req.params.id);await acceptOrder(c,orderId,{requireApprovedShipping:true});
 await staffEvent(c,req.operationsUser,'Order Accepted',{orderId,oldValue:{status:'Pending'},newValue:{status:'Preparing'}});return {id:orderId,message:'Order accepted.'};
})));
router.patch('/api/staff/orders/:id/status',requirePermission('orders.status.update'),route(req=>transaction(async c=>{
 await activeActor(c,req);
 await c.query("SELECT set_config('delivery.actor',$1,true),set_config('delivery.notes',$2,true)",[operationsActor(req),'Operational order status updated']);
 const result=await updateOperationalOrderStatus(c,id(req.params.id),req.body);
 await staffEvent(c,req.operationsUser,'Order Status Updated',{orderId:result.id,oldValue:{status:result.previousStatus},newValue:{status:result.status},reason:result.previousStatus+' -> '+result.status});
 return result;
})));
router.get('/api/staff/riders',requirePermission('orders.assign_rider'),route(async()=> (await pool.query(riderManagementSelect)).rows.map(r=>({id:r.id,name:[r.first_name,r.last_name].filter(Boolean).join(' '),availability:riderAvailability(r)}))));
router.patch('/api/staff/orders/:id/rider',requirePermission('orders.assign_rider'),async(req,res)=>{
 try{
  const b=req.body||{};if(Object.keys(b).some(k=>!['riderId','status','expectedUpdatedAt'].includes(k)))throw inventoryError('Only rider assignment and operational status fields are allowed.',403);
  const target=id(b.riderId),orderId=id(req.params.id);
  const o=(await pool.query('SELECT *,updated_at::text AS update_version FROM orders WHERE id=$1',[orderId])).rows[0];
  if(!o)throw inventoryError('Order not found',404);
  if(o.delivery_mode!=='rider'||o.status!=='Preparing'||!o.admin_confirmed_at||o.shipping_status!=='Confirmed'||o.inventory_restored_at||o.inventory_reconciliation_reason||(o.payment_method==='ONLINE'&&o.payment_status!=='Paid'))throw inventoryError('Rider assignment requires an accepted Preparing order with approved rider shipping, payment and inventory.',409);
  if(!b.expectedUpdatedAt||o.update_version!==b.expectedUpdatedAt)throw inventoryError('Order changed. Refresh before assigning a rider.',409);
  const status=b.status||'Preparing';if(!['Preparing','Out for Delivery'].includes(status))throw inventoryError('This status is not allowed for Staff.',403);
  if(Number(o.rider_id)===target&&status===o.status)throw inventoryError('This rider is already assigned. No changes were recorded.',409);
  if(['Delivered','Cancelled'].includes(o.tracking_status))throw inventoryError('Shipment state requires administrator review.',409);
  req.staffRiderAssignment=true;req.assignmentVersion=b.expectedUpdatedAt;
  req.body={status,deliveryMode:'rider',riderId:target,trackingCode:o.tracking_code||'',trackingStatus:status==='Out for Delivery'?'Out for Delivery':o.tracking_status||'Preparing'};
  return updateOrderHandler(req,res);
 }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Unable to assign rider.'});}
});
router.patch('/api/staff/orders/:id/delivery',requirePermission('orders.delivery.manage'),async(req,res)=>{
 try{
  const b=req.body;if(Object.keys(b).some(k=>!['deliveryMode','riderId','courierName','trackingCode','deliveryNotes','dispatch','expectedUpdatedAt'].includes(k)))throw inventoryError('Only delivery assignment fields are allowed.',403);
  const o=(await pool.query('SELECT *,updated_at::text AS assignment_version FROM orders WHERE id=$1',[id(req.params.id)])).rows[0];
  if(!o)throw inventoryError('Order not found',404);
  if(o.status!=='Preparing'||!o.admin_confirmed_at||o.shipping_status!=='Confirmed'||o.inventory_restored_at||o.inventory_reconciliation_reason||(o.payment_method==='ONLINE'&&o.payment_status!=='Paid'))throw inventoryError('Accept and approve the order before assigning delivery. Completed or dispatched orders cannot be reassigned by Staff.',409);
  if(!b.expectedUpdatedAt||o.assignment_version!==b.expectedUpdatedAt)throw inventoryError('Order changed. Refresh before assigning delivery.',409);
  if(b.deliveryMode!==o.delivery_mode&&(o.payment_method==='COD'&&(o.payment_status==='Paid'||['Collected','Remitted','Remittance Pending'].includes(o.cod_status))))throw inventoryError('Delivery method changes after COD collection require administrator review.',409);
  if(['In Transit','Out for Delivery','Delivered','Cancelled'].includes(o.tracking_status))throw inventoryError('Shipment is already dispatched or closed. Administrator review is required.',409);
  if(!['rider','logistics'].includes(b.deliveryMode))throw inventoryError('Choose Rider or Logistics.',400);
  if(b.deliveryMode==='rider'&&!b.riderId)throw inventoryError('Select an eligible rider.',400);
  
  if(o.payment_method==='COD'&&o.payment_status==='Paid'&&b.deliveryMode!==o.delivery_mode)throw inventoryError('Paid COD delivery changes require administrator review.',409);
  req.staffDeliveryUpdate=true;req.assignmentVersion=b.expectedUpdatedAt;
  req.body={status:b.dispatch===true?'Out for Delivery':'Preparing',deliveryMode:b.deliveryMode,riderId:b.deliveryMode==='rider'?b.riderId:null,courierName:b.deliveryMode==='logistics'?b.courierName:'',trackingCode:b.trackingCode||'',trackingStatus:b.dispatch===true?(b.deliveryMode==='logistics'?'In Transit':'Out for Delivery'):(b.deliveryMode!==o.delivery_mode?'Preparing':o.tracking_status),deliveryNotes:b.deliveryNotes||''};
  return updateOrderHandler(req,res);
 }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Unable to assign delivery.'});}
});
router.get('/api/staff/orders',requirePermission('orders.operational.read'),route(()=>orders()));
router.get('/api/staff/shipments',requirePermission('orders.operational.read'),route(()=>orders(true)));
// Retired workflow: keep historical fulfillment rows and audit entries intact.
router.post('/api/staff/orders/:id/fulfillment',requirePermission('orders.operational.read'),(_req,res)=>res.status(410).json({error:'The packing workflow has been retired. Use the existing order actions.'}));
router.get('/api/staff/inventory/history',requirePermission('inventory.history.read'),inventoryHistoryHandler);
router.get('/api/staff/inventory',requirePermission('inventory.read'),route(req=>inventory(req.operationsUser)));
router.get('/api/staff/supplies/:id/setup',requirePermission('products.create'),route(async req=>{
 const p=(await pool.query("SELECT id,name,category,description,image_url,archived_at,supply_stock_model FROM products WHERE id=$1 AND inventory_type='GARDENING_SUPPLY'",[id(req.params.id)])).rows[0];
 if(!p||!await ownsNewSupply(pool,req,p.id))throw inventoryError('Only your newly created supplies can be configured here.',403);
 return supplyProduct(pool,{id:p.id,name:p.name,category:p.category,description:p.description,imageUrl:p.image_url,archivedAt:p.archived_at,supplyStockModel:p.supply_stock_model,inventoryType:'GARDENING_SUPPLY'});
}));
const stockPermission=(kind)=>(req,res,next)=>requirePermission(`inventory.${kind}.${req.body.direction==='in'?'stock_in':'dispose'}`)(req,res,next);
const stockAudit=async(c,req,data)=>{await activeActor(c,req);await staffEvent(c,req.operationsUser,req.body.direction==='initial'?'Stock Initialized':req.body.direction==='in'?'Stock In':req.body.reason==='Disposal / Spoiled'?'Disposal Recorded':'Stock Out',{productId:data.productId,oldValue:{quantity:data.before,variantId:data.variantId||null,unit:data.unit||'400g packs'},newValue:{quantity:data.after,variantId:data.variantId||null,unit:data.unit||'400g packs'},reason:[data.reason,data.notes].filter(Boolean).join(': ')});};
registerLettuceStock(router,stockPermission('lettuce'),operationsActor,{path:'/api/staff/inventory/:id/lettuce-stock',afterStock:stockAudit});
registerSupplyStock(router,{admin:stockPermission('supplies'),actor:operationsActor,path:'/api/staff/supplies/:id/stock',afterStock:stockAudit});
router.get('/api/staff/activity',requirePermission('activity.own.read'),route(req=>activity(req.operationsUser.userId,Math.max(1,Math.min(10000,Math.floor(Number(req.query.page))||1)),req.query.type==='stock')));
router.get('/api/staff/profile',requirePermission('profile.own.update',{allowTemporary:true}),route(async req=>(await pool.query(`${ownProfile} WHERE id=$1`,[req.operationsUser.userId])).rows[0]));
router.patch('/api/staff/profile',requirePermission('profile.own.update'),route(req=>transaction(async c=>{
 await activeActor(c,req);const first=text(req.body.firstName),last=text(req.body.lastName);if(!first)throw inventoryError('Name is required',400);
 await c.query('UPDATE users SET first_name=$2,last_name=$3,updated_at=clock_timestamp() WHERE id=$1',[req.operationsUser.userId,first,last]);await staffEvent(c,req.operationsUser,'Profile Updated');return {message:'Profile saved'};
})));
router.post('/api/staff/logout',requirePermission('profile.own.update',{allowTemporary:true}),route(req=>transaction(async c=>{await activeActor(c,req);await c.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[req.operationsUser.userId]);await staffEvent(c,req.operationsUser,'Logout');return {message:'Signed out'};})));

router.get('/api/admin/staff',requirePermission('staff.manage'),route(async()=> (await pool.query(`${ownProfile} WHERE role='staff' ORDER BY id DESC`)).rows));
router.post('/api/admin/staff',requirePermission('staff.manage'),route(req=>transaction(async c=>{
 const b=req.body,first=text(b.firstName),last=text(b.lastName),username=text(b.username).toLowerCase(),email=text(b.email,254).toLowerCase()||null;
 const problem=newStaffPasswordError(b.password);if(problem)throw inventoryError(problem,400);
 if(!first||! /^[a-z0-9][a-z0-9._-]{2,59}$/.test(username)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw inventoryError('Provide a name, valid unique username and optional valid email.',400);
 const user=(await c.query(`INSERT INTO users(first_name,last_name,username,email,password_hash,password,role,status,must_change_password) VALUES($1,$2,$3,$4,$5,NULL,'staff','active',true) RETURNING id`,[first,last,username,email,await bcrypt.hash(b.password,12)])).rows[0];
 await staffEvent(c,req.operationsUser,'Staff Created',{staffId:user.id});return {id:user.id,message:'Staff created. The temporary password must be changed on first login.'};
})));
router.patch('/api/admin/staff/:id',requirePermission('staff.manage'),route(req=>transaction(async c=>{
 const target=id(req.params.id),old=(await c.query("SELECT id,first_name,last_name,email,status FROM users WHERE id=$1 AND role='staff' FOR UPDATE",[target])).rows[0];if(!old)throw inventoryError('Staff not found',404);
 const b=req.body,first=text(b.firstName??old.first_name),last=text(b.lastName??old.last_name),email=text(b.email??old.email,254).toLowerCase()||null,status=b.status??old.status;
 if(!first||!['active','disabled'].includes(status)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw inventoryError('Invalid account details',400);
 if(status!==old.status&&b.confirmed!==true)throw inventoryError('Confirm account activation/deactivation.',400);
 await c.query('UPDATE users SET first_name=$2,last_name=$3,email=$4,status=$5,auth_version=auth_version+CASE WHEN status<>$5 THEN 1 ELSE 0 END,updated_at=clock_timestamp() WHERE id=$1',[target,first,last,email,status]);
 await staffEvent(c,req.operationsUser,'Staff Account Updated',{staffId:target,oldValue:old,newValue:{firstName:first,lastName:last,email,status}});return {message:'Staff updated'};
})));
router.post('/api/admin/staff/:id/reset-password',requirePermission('staff.manage'),route(req=>transaction(async c=>{
 const target=id(req.params.id),problem=newStaffPasswordError(req.body.password);if(problem)throw inventoryError(problem,400);
 if(req.body.confirmed!==true||text(req.body.verificationReference).length<3)throw inventoryError('Confirm administrator identity verification and provide its reference.',400);
 const updated=await c.query("UPDATE users SET password_hash=$2,password=NULL,must_change_password=true,auth_version=auth_version+1,updated_at=clock_timestamp() WHERE id=$1 AND role='staff' RETURNING id",[target,await bcrypt.hash(req.body.password,12)]);if(!updated.rowCount)throw inventoryError('Staff not found',404);
 await c.query('UPDATE auth_password_resets SET used_at=clock_timestamp() WHERE user_id=$1 AND used_at IS NULL',[target]);
 await staffEvent(c,req.operationsUser,'Staff Password Reset',{staffId:target,reason:text(req.body.verificationReference)});return {message:'Temporary password set. Existing sessions revoked.'};
})));
router.get('/api/admin/staff/:id/activity',requirePermission('staff.manage'),route(req=>activity(id(req.params.id),Math.max(1,Math.min(10000,Number(req.query.page)||1)))));
export default router;
