import {createHash} from 'node:crypto';
import {pool} from '../config/db.js';
import {inventoryContext,inventoryError} from '../utils/inventory.js';
export function registerLettuceStock(router,admin,actor,{path='/api/admin/inventory/:id/lettuce-stock',afterStock}={}){
 router.post(path,admin,async(req,res)=>{
  let c;
  try{
   const id=Number(req.params.id),quantity=Number(req.body.quantity),direction=req.body.direction;
   const reason=String(req.body.reason||'').trim(),notes=String(req.body.notes||'').trim();
   const key=String(req.get('Idempotency-Key')||'');
   if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(quantity)||quantity<=0||quantity>2147483647||!['in','out'].includes(direction))throw inventoryError('Enter a positive whole number of 400g packs and a valid direction.',400);
   if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw inventoryError('A valid stock request key is required.',400);
   if(!(direction==='in'?['New Harvest','Stock Correction']:['Disposal / Spoiled','Damaged','Stock Correction','Other Authorized Reason']).includes(reason)||notes.length>2000)throw inventoryError('Select a valid reason and keep notes within 2000 characters.',400);
   if(reason==='Other Authorized Reason'&&notes.length<3)throw inventoryError('Describe the authorized reason in notes.',400);
   if(req.inventoryUser.role==='staff'&&(!(direction==='in'?['New Harvest']:['Disposal / Spoiled','Damaged']).includes(reason)||(direction==='out'&&notes.length<3)))throw inventoryError('Staff may record New Harvest or disposal/damage; Stock Out requires a short note.',403);
   if(req.body.confirmed!==true)throw inventoryError('Confirm that Stock In is quality-checked packaged lettuce, or that Stock Out affects only uncommitted packs.',400);
   const requestKey='lettuce-stock:'+key,owner=actor(req),fingerprint=createHash('sha256').update(JSON.stringify({id,quantity,direction,reason,notes})).digest('hex');
   c=await pool.connect();await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[requestKey]);
   const receipt=(await c.query('SELECT * FROM inventory_product_requests WHERE request_key=$1',[requestKey])).rows[0];
   if(receipt){if(receipt.actor!==owner||receipt.fingerprint!==fingerprint)throw inventoryError('Stock request key belongs to another transaction.');await c.query('COMMIT');res.set('Idempotency-Replayed','true');return res.json(receipt.response);}
   const p=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!p||p.inventory_type!=='edible')throw inventoryError('Select a lettuce product.',400);
   if(p.lettuce_stock_model!=='quantity')throw inventoryError('This lettuce balance requires migration/reconciliation before product stock changes.');
   if(p.archived_at)throw inventoryError('Restore the product before recording stock.');
   if(direction==='out'&&p.stock<quantity){
    const ids=(await c.query("SELECT DISTINCT o.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=$1 AND o.inventory_restored_at IS NULL AND o.inventory_state IN ('reserved','committed','legacy') AND o.status NOT IN ('Cancelled','Delivered')",[id])).rows.map(row=>row.id);
    const error=inventoryError('Insufficient unreserved packs. Do not deduct order commitments; reconcile affected orders separately.');
    error.reasonCode=ids.length?'FULFILLMENT_RECONCILIATION_REQUIRED':'INSUFFICIENT_AVAILABLE_STOCK';error.orderIds=ids;throw error;
   }
   if(direction==='in'&&p.stock>2147483647-quantity)throw inventoryError('Stock quantity is too large.',400);
   const allocated=Number((await c.query("SELECT COALESCE(SUM(oi.qty),0)::int AS qty FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=$1 AND oi.batch_id IS NULL AND o.inventory_state IN ('committed','legacy') AND o.inventory_restored_at IS NULL AND o.status IN ('Pending','Preparing','Cancellation Requested')",[id])).rows[0].qty);
   const before=p.stock+p.reserved_stock+allocated,change=direction==='in'?quantity:-quantity;
   const action=direction==='in'?'Stock In':reason==='Disposal / Spoiled'?'Disposal Confirmed':'Stock Out';
   await inventoryContext(c,{action,reason,actor:owner});
   await c.query('UPDATE products SET stock=stock+$2 WHERE id=$1',[id,change]);
   await c.query("UPDATE inventory_movements SET notes=$2,previous_physical_stock=$3,new_physical_stock=$4 WHERE id=currval(pg_get_serial_sequence('inventory_movements','id')) AND product_id=$1",[id,notes,before,before+change]);
   const response={message:direction==='in'?'Stock In recorded.':'Stock Out recorded.',productId:id,availableStock:p.stock+change,physicalStock:before+change,reservedStock:p.reserved_stock,allocatedStock:allocated};
   await c.query('INSERT INTO inventory_product_requests(request_key,actor,fingerprint,response) VALUES($1,$2,$3,$4::jsonb)',[requestKey,owner,fingerprint,JSON.stringify(response)]);
   if(afterStock)await afterStock(c,req,{productId:id,before:p.stock,after:p.stock+change,reason,notes,direction});
   await c.query('COMMIT');res.json(response);
  }catch(error){if(c)await c.query('ROLLBACK');res.status(error.status||500).json({error:error.status?error.message:'Stock transaction failed; no changes saved.',...(error.reasonCode?{code:error.reasonCode,affectedOrderIds:error.orderIds}:{})});}finally{c?.release();}
 });
}
