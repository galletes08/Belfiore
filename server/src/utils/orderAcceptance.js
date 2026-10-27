import {inventoryError} from './inventory.js';
export async function acceptOrder(c,orderId,{requireApprovedShipping=false}={}){
 const result=await c.query(`UPDATE orders SET status='Preparing',tracking_status='Preparing',admin_confirmed_at=COALESCE(admin_confirmed_at,NOW()),status_updated_at=NOW(),updated_at=NOW()
 WHERE id=$1 AND status='Pending' AND (payment_method<>'ONLINE' OR payment_status='Paid') AND harvest_order_sellable(id)
 AND (NOT $2::boolean OR (shipping_status='Confirmed' AND inventory_restored_at IS NULL AND inventory_reconciliation_reason IS NULL)) RETURNING id`,[orderId,requireApprovedShipping]);
 if(!result.rowCount){const exists=(await c.query('SELECT id FROM orders WHERE id=$1',[orderId])).rowCount;throw inventoryError(exists?'Only Pending orders with approved payment, shipping and valid inventory can be accepted.':'Order not found',exists?409:404);}
 return result.rows[0];
}
