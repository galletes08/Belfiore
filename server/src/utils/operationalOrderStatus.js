import {staffNextOrderStatuses} from '../../../shared/orderStatus.js';
import {acceptOrder} from './orderAcceptance.js';
import {batchOrderEligible} from './harvest.js';
import {inventoryError} from './inventory.js';
import {validateManualDelivery} from './manualDelivery.js';

// Caller holds the transaction and the order lock; no assignment/payment/GPS writes.
export async function updateOperationalOrderStatus(c,orderId,body){
 if(!body||Object.keys(body).some(k=>!['status','expectedUpdatedAt'].includes(k)))throw inventoryError('Only operational order status may be changed.',403);
 if(!['Preparing','Out for Delivery'].includes(body.status))throw inventoryError('This status requires an administrator or the official delivery workflow.',403);
 if(typeof body.expectedUpdatedAt!=='string'||!body.expectedUpdatedAt)throw inventoryError('Refresh the order before updating its status.',400);
 const order=(await c.query('SELECT *,updated_at::text AS update_version FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
 if(!order)throw inventoryError('Order not found',404);
 if(order.update_version!==body.expectedUpdatedAt)throw inventoryError('Order changed. Refresh its details before updating.',409);
 if(!staffNextOrderStatuses(order.status).includes(body.status))throw inventoryError('This operational status transition is not allowed.',409);
 if(order.shipping_status!=='Confirmed'||order.inventory_restored_at||order.inventory_reconciliation_reason)throw inventoryError('Approved shipping and valid inventory are required.',409);
 if(order.payment_method==='ONLINE'&&order.payment_status!=='Paid')throw inventoryError('Verify online payment before fulfillment.',409);
 if(!await batchOrderEligible(c,orderId))throw inventoryError('Allocated inventory is on hold or unsellable. Administrator review is required.',409);
 if(body.status==='Preparing'){
  await acceptOrder(c,orderId,{requireApprovedShipping:true});
 }else{
  if(!order.admin_confirmed_at)throw inventoryError('Accept the order before dispatch.',409);
  let tracking='Out for Delivery';
  if(order.delivery_mode==='rider'){
   if(!order.rider_id||!order.driver_assigned_at||!order.driver_access_token)throw inventoryError('An administrator must assign a rider before dispatch.',409);
   const rider=(await c.query(`SELECT r.status,r.is_available,u.status AS account_status,u.role,u.must_change_password,u.rider_security_locked
    FROM riders r JOIN users u ON u.id=r.user_id WHERE r.id=$1 FOR SHARE OF r,u`,[order.rider_id])).rows[0];
   if(!rider||rider.status!=='active'||rider.account_status!=='active'||rider.role!=='rider'||!rider.is_available||rider.must_change_password||rider.rider_security_locked)throw inventoryError('Assigned rider is unavailable. Ask an administrator to review.',409);
   if(['Delivered','Cancelled'].includes(order.tracking_status))throw inventoryError('Shipment state requires administrator review.',409);
  }else if(order.delivery_mode==='logistics'){
   if(!['J&T Express','LBC'].includes(order.courier_name)||!order.tracking_code?.trim())throw inventoryError('An administrator must configure the courier and tracking number before dispatch.',409);
   tracking=order.tracking_status==='Out for Delivery'?'Out for Delivery':'In Transit';
   const issue=validateManualDelivery(body.status,tracking,order.tracking_status);if(issue)throw inventoryError(issue,409);
  }else throw inventoryError('An administrator must configure the delivery method.',409);
  const changed=await c.query(`UPDATE orders SET status=$2,tracking_status=$3,status_updated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1 AND harvest_order_sellable(id)`,[orderId,body.status,tracking]);
  if(!changed.rowCount)throw inventoryError('Allocated inventory changed. Refresh before dispatch.',409);
 }
 return {previousStatus:order.status,...(await c.query('SELECT id,status,updated_at FROM orders WHERE id=$1',[orderId])).rows[0]};
}
