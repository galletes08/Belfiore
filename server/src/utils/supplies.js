import {inventoryError} from './inventory.js';
export const SUPPLY='GARDENING_SUPPLY';
export const SUPPLY_SELECT=`SELECT v.*,s.unit AS stock_unit,s.stock,s.reserved_stock AS pool_reserved,
 COALESCE((SELECT SUM(oi.qty*oi.stock_factor) FROM order_items oi JOIN orders o ON o.id=oi.order_id
 WHERE oi.stock_pool_id=s.id AND o.inventory_state='committed' AND o.inventory_restored_at IS NULL
 AND o.status IN ('Pending','Preparing','Cancellation Requested')),0)::int AS committed,
 COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id
 WHERE oi.variant_id=v.id AND o.inventory_state='reserved' AND o.inventory_restored_at IS NULL),0)::int AS variant_reserved,
 COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id
 WHERE oi.variant_id=v.id AND o.inventory_state='committed' AND o.inventory_restored_at IS NULL AND o.status IN ('Pending','Preparing','Cancellation Requested')),0)::int AS variant_committed
 FROM supply_variants v LEFT JOIN supply_stock_pools s ON s.id=v.pool_id`;
export async function readSupplyVariants(c,id){return (await c.query(`${SUPPLY_SELECT} WHERE v.product_id=$1 ORDER BY v.id`,[id])).rows.map(v=>({...v,id:Number(v.id),product_id:Number(v.product_id),price:Number(v.price),weight_kg:v.weight_kg==null?null:Number(v.weight_kg),
 available_stock:v.archived_at||v.stock==null?0:Math.floor(v.stock/v.stock_factor),physical_stock:v.stock==null?null:v.stock+v.pool_reserved+v.committed,
 status:v.archived_at?'Archived':!v.pool_id?'Choose Stock Model':v.stock==null?'Awaiting Stock Entry':Math.floor(v.stock/v.stock_factor)===0?'Out of Stock':Math.floor(v.stock/v.stock_factor)<=v.low_stock_threshold?'Low Stock':'Available'}));}
export async function supplyProduct(c,p,publicOnly=false){
 if(p.inventoryType!==SUPPLY)return p;
 let variants=await readSupplyVariants(c,p.id);if(publicOnly)variants=variants.filter(v=>!v.archived_at);
 const pools=[...new Map(variants.filter(v=>v.pool_id).map(v=>[String(v.pool_id),{id:v.pool_id,unit:v.stock_unit,stock:v.stock,reserved:v.pool_reserved,physical:v.physical_stock}])).values()];
 const sellable=variants.filter(v=>!v.archived_at),ready=sellable.filter(v=>v.stock!=null&&v.pool_id);
 return {...p,variants,stockPools:pools,physicalStock:null,reservedStock:null,committedStock:null,hasAvailableVariants:sellable.some(v=>v.available_stock>0),supplyStockModel:p.supplyStockModel||'unconfigured',stock:sellable.some(v=>v.available_stock>0)?1:0,
 price:sellable.length?Math.min(...sellable.map(v=>v.price)):0,
 status:p.archivedAt?'Archived':!ready.length?'Awaiting Stock Entry':sellable.some(v=>v.status==='Low Stock')?'Low Stock':sellable.some(v=>v.available_stock>0)?'Available':'Out of Stock',
 stockLabel:p.supplyStockModel==='shared'?pools.map(s=>`${s.stock==null?'Uninitialized':s.stock} ${s.unit} (shared)`).join(', '):variants.filter(v=>!v.archived_at).map(v=>`${v.name}: ${v.stock==null?'Uninitialized':v.stock} ${v.selling_unit}`).join(', ')||'Awaiting model / stock entry'};
}
export async function supplyChoice(c,productId,variantId,qty){
 const v=(await readSupplyVariants(c,productId)).find(v=>v.id===Number(variantId));
 if(!Number.isSafeInteger(qty)||qty<1||qty>1000000||!v||v.archived_at||!v.pool_id||v.stock==null||v.available_stock<qty)throw inventoryError('Selected supply variant is unavailable or has insufficient stock.');
 return v;
}
export async function supplyMovement(c,{productId,variant,before,after,beforeReserved,afterReserved,action,reason,actor,orderId=null}){
 const p=(await c.query('SELECT name FROM products WHERE id=$1',[productId])).rows[0];
 await c.query(`INSERT INTO inventory_movements(product_id,product_code,product_name,action,previous_quantity,new_quantity,previous_reserved,new_reserved,previous_status,new_status,reason,actor,order_id,variant_id,variant_name,stock_unit)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Recorded','Recorded',$9,$10,$11,$12,$13,$14)`,[productId,variant.sku,p.name,action,before,after,beforeReserved,afterReserved,reason,actor,orderId,variant.id,variant.name,variant.stock_unit]);
}
export async function reserveSupply(c,item,orderId,online,actor){
 // Parent products are locked in deterministic order by the reservation caller.
 const p=(await c.query('SELECT archived_at,supply_stock_model FROM products WHERE id=$1',[item.productId])).rows[0];if(!p||p.archived_at||p.supply_stock_model==='unconfigured')throw inventoryError('Supply product is unavailable');
 const v=await supplyChoice(c,item.productId,item.variantId,item.qty);
 if(Number(v.price)!==item.unitPrice)throw inventoryError('Supply price changed. Review your cart.');
 const before=(await c.query('SELECT * FROM supply_stock_pools WHERE id=$1 FOR UPDATE',[v.pool_id])).rows[0];
 const amount=item.qty*v.stock_factor;
 const updated=(await c.query(`UPDATE supply_stock_pools SET stock=stock-$2,reserved_stock=reserved_stock+CASE WHEN $3 THEN $2 ELSE 0 END WHERE id=$1 AND stock>=$2 RETURNING *`,[v.pool_id,amount,online])).rows[0];
 if(!updated)throw inventoryError('Supply stock changed. Refresh your cart.');
 await supplyMovement(c,{productId:item.productId,variant:v,before:before.stock,after:updated.stock,beforeReserved:before.reserved_stock,afterReserved:updated.reserved_stock,action:online?'Product Reserved':'Product Sold',reason:online?'Online checkout reservation':'COD order accepted',actor,orderId});
}
export async function transitionSupplies(c,orderId,release,reserved,reason,actor){
 const lines=(await c.query(`SELECT oi.*,v.name,v.sku,s.unit AS stock_unit FROM order_items oi JOIN supply_variants v ON v.id=oi.variant_id JOIN supply_stock_pools s ON s.id=oi.stock_pool_id WHERE oi.order_id=$1 ORDER BY oi.product_id,oi.stock_pool_id,oi.id`,[orderId])).rows;
 for(const item of lines){
  const before=(await c.query('SELECT * FROM supply_stock_pools WHERE id=$1 FOR UPDATE',[item.stock_pool_id])).rows[0],amount=item.qty*item.stock_factor;
  const updated=(await c.query(`UPDATE supply_stock_pools SET stock=stock+CASE WHEN $3 THEN $2 ELSE 0 END,reserved_stock=reserved_stock-CASE WHEN $4 THEN $2 ELSE 0 END WHERE id=$1 AND (NOT $4 OR reserved_stock>=$2) RETURNING *`,[item.stock_pool_id,amount,release,reserved])).rows[0];
  if(!updated)throw inventoryError('Supply allocation requires reconciliation');
  await supplyMovement(c,{productId:item.product_id,variant:{id:item.variant_id,sku:item.variant_sku,name:item.variant_name,stock_unit:item.stock_unit},before:before.stock,after:updated.stock,beforeReserved:before.reserved_stock,afterReserved:updated.reserved_stock,action:release?(reserved?'Reservation Released':'Stock In'):'Product Sold',reason,actor,orderId});
 }
}
