import { inventoryError, inventoryContext } from './inventory.js';

export const BATCH_SELECT = `SELECT b.*,b.harvest_date::text AS harvest_date,harvest_batch_age(b) AS age_days,harvest_batch_status(b) AS status,
  CASE WHEN harvest_batch_sellable(b) AND p.archived_at IS NULL AND COALESCE(to_jsonb(p)->>'lettuce_stock_model','batch')<>'quantity' THEN b.stock ELSE 0 END AS available_stock,
  p.name AS product_name,p.product_code,p.archived_at,
  COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE (oi.batch_id=b.id OR (oi.batch_id IS NULL AND oi.product_id=b.product_id AND b.legacy_import AND COALESCE(to_jsonb(p)->>'lettuce_stock_model','batch')<>'quantity'))
    AND o.inventory_state IN ('reserved','committed','legacy') AND o.inventory_restored_at IS NULL
    AND o.status NOT IN ('Cancelled','Delivered')),0)::int AS unresolved_allocations,
  COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE (oi.batch_id=b.id OR (oi.batch_id IS NULL AND oi.product_id=b.product_id AND b.legacy_import AND COALESCE(to_jsonb(p)->>'lettuce_stock_model','batch')<>'quantity'))
    AND o.inventory_state IN ('committed','legacy') AND o.inventory_restored_at IS NULL
    AND o.status IN ('Pending','Preparing','Cancellation Requested')),0)::int AS allocated_stock
  FROM harvest_batches b JOIN products p ON p.id=b.product_id`;

export function batchMap(row) {
  return { ...row, id: Number(row.id), product_id: Number(row.product_id), price: Number(row.price), regular_price: Number(row.regular_price),
    harvest_date: row.harvest_date ? (typeof row.harvest_date === 'string' ? row.harvest_date.slice(0,10) : new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(row.harvest_date)) : null,
    physical_stock: row.stock + row.reserved_stock + Number(row.allocated_stock || 0) };
}
export async function batchHistory(client, batch, action, reason, actor, before = null, after = null, orderId = null, notes = '') {
  const product = (await client.query('SELECT * FROM products WHERE id=$1',[batch.product_id])).rows[0];
  await client.query(`INSERT INTO inventory_movements(product_id,product_code,product_name,action,previous_quantity,new_quantity,
    previous_reserved,new_reserved,previous_status,new_status,reason,actor,order_id,batch_id,previous_value,new_value,notes,previous_physical_stock,new_physical_stock)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19)`,
  [product.id,product.product_code,product.name,action,before?.stock ?? null,after?.stock ?? batch.stock,
    before?.reserved_stock ?? null,after?.reserved_stock ?? batch.reserved_stock,before?.status || null,after?.status || batch.status || batch.condition,
    reason,actor,orderId,batch.id,before ? JSON.stringify(before):null,after ? JSON.stringify(after):null,notes || null,
    before?before.stock+before.reserved_stock+Number(before.allocated_stock||0):null,(after||batch).stock+(after||batch).reserved_stock+Number((after||batch).allocated_stock||0)]);
}
export async function syncHarvestProduct(client, productId) {
  // Sync is a derived cache update, not a second stock-movement record.
  await inventoryContext(client,{action:'Inventory Adjustment',reason:'Harvest batch availability aggregate'});
  await client.query("SELECT set_config('inventory.skip_audit','true',true)");
  await client.query(`UPDATE products SET stock=COALESCE((SELECT SUM(stock) FROM harvest_batches b WHERE b.product_id=$1 AND harvest_batch_sellable(b)),0),
    reserved_stock=COALESCE((SELECT SUM(reserved_stock) FROM harvest_batches WHERE product_id=$1),0)
    WHERE id=$1 AND inventory_type='edible' AND COALESCE(to_jsonb(products)->>'lettuce_stock_model','batch')<>'quantity' AND (stock,reserved_stock) IS DISTINCT FROM
    (COALESCE((SELECT SUM(stock)::int FROM harvest_batches b WHERE b.product_id=$1 AND harvest_batch_sellable(b)),0),
     COALESCE((SELECT SUM(reserved_stock)::int FROM harvest_batches WHERE product_id=$1),0))`,[productId]);
  await client.query("SELECT set_config('inventory.skip_audit','false',true)");
}
export async function createHarvestBatch(client, product, input, actor) {
  const qty=Number(input.quantity);
  const date=String(input.harvestDate || '');
  const condition=String(input.condition || 'Fresh');
  const price=Number(input.batchPrice ?? product.price);
  if (!['number','string'].includes(typeof input.quantity)||!Number.isSafeInteger(qty)||qty<=0||qty>2147483647) throw inventoryError('Enter a positive whole pack quantity',400);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)) throw inventoryError('Invalid harvest date',400);
  if (!date && !input.allowUnverified) throw inventoryError('Harvest Date is required; unknown legacy dates need verification',400);
  const today=(await client.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::text AS today")).rows[0].today;
  if(date>today) throw inventoryError('Harvest Date cannot be in the future',400);
  if (!['Fresh','Aging','On Hold','Unsellable','For Disposal'].includes(condition)) throw inventoryError('Invalid initial condition',400);
  if (!Number.isFinite(price)||price<0) throw inventoryError('Invalid batch price',400);
  const inserted=(await client.query(`INSERT INTO harvest_batches(product_id,harvest_date,initial_quantity,stock,regular_price,price,condition,created_by,legacy_import)
    VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8) RETURNING *`,[product.id,date||null,qty,product.price,price,date?condition:'Unverified',actor,!date])).rows[0];
  const batch=(await client.query(`${BATCH_SELECT} WHERE b.id=$1`,[inserted.id])).rows[0];
  await batchHistory(client,batch,'Harvest Batch Created',String(input.reason||'New Harvest'),actor,null,batch,null,String(input.notes||''));
  await batchHistory(client,batch,'Stock In',String(input.reason||'New Harvest'),actor,{...batch,stock:0,reserved_stock:0,allocated_stock:0},batch,null,String(input.notes||''));
  await syncHarvestProduct(client,product.id);
  return batchMap(batch);
}
export async function reserveBatchAllocation(client,item,orderId,online,actor) {
  await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[item.productId]);
  const before=(await client.query(`${BATCH_SELECT} WHERE b.id=$1 AND b.product_id=$2 FOR UPDATE OF b`,[item.batchId,item.productId])).rows[0];
  if(!before||before.available_stock<item.qty||Number(before.price)!==item.unitPrice) throw inventoryError('Selected harvest batch availability or price changed. Refresh checkout.');
  if(!online) before.allocated_stock=Math.max(0,before.allocated_stock-item.qty);
  const allocated=await client.query('UPDATE harvest_batches SET stock=stock-$2,reserved_stock=reserved_stock+CASE WHEN $3 THEN $2 ELSE 0 END WHERE id=$1 AND harvest_batch_sellable(harvest_batches) AND stock >= $2 RETURNING id',[item.batchId,item.qty,online]);
  if(!allocated.rows.length) throw inventoryError('Batch reached its sales hold or inventory changed; refresh checkout');
  const after=(await client.query(`${BATCH_SELECT} WHERE b.id=$1`,[item.batchId])).rows[0];
  await batchHistory(client,after,online?'Reservation Created':'Batch Sold / Allocated',online?'Online checkout reservation':'COD allocation',actor,before,after,orderId);
  await syncHarvestProduct(client,item.productId);
}
export async function changeBatchAllocation(client,item,orderId,release,reserved,reason,actor) {
  await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[item.product_id]);
  if(!item.batch_id&&(await client.query("SELECT to_jsonb(p)->>'lettuce_stock_model' AS model FROM products p WHERE id=$1",[item.product_id])).rows[0]?.model==='quantity')return false;
  const id=item.batch_id||(await client.query('SELECT id FROM harvest_batches WHERE product_id=$1 AND legacy_import ORDER BY id LIMIT 1',[item.product_id])).rows[0]?.id;
  if(!id) return false;
  const before=(await client.query(`${BATCH_SELECT} WHERE b.id=$1 FOR UPDATE OF b`,[id])).rows[0];
  if(!release&&(!['Fresh','Aging'].includes(before.status)||before.archived_at)) throw inventoryError('Batch is no longer sellable; payment requires reconciliation');
  if(reserved&&before.reserved_stock<item.qty) throw inventoryError('Batch reservation requires reconciliation');
  await client.query('UPDATE harvest_batches SET stock=stock+CASE WHEN $3 THEN $2 ELSE 0 END,reserved_stock=reserved_stock-CASE WHEN $4 THEN $2 ELSE 0 END WHERE id=$1',[id,item.qty,release,reserved]);
  const after=(await client.query(`${BATCH_SELECT} WHERE b.id=$1`,[id])).rows[0];
  if(release&&!reserved) after.allocated_stock=Math.max(0,after.allocated_stock-item.qty);
  if(!release&&reserved) after.allocated_stock+=item.qty;
  await batchHistory(client,after,release?'Reservation Released':'Batch Sold / Allocated',reason,actor,before,after,orderId);
  await syncHarvestProduct(client,item.product_id);
  return true;
}
export async function batchOrderEligible(client,orderId) {
  return (await client.query('SELECT harvest_order_sellable($1) AS eligible',[orderId])).rows[0].eligible;
}
export async function readHarvest(pool, productId = null) {
  const result=await pool.query(`${BATCH_SELECT} WHERE ($1::bigint IS NULL OR b.product_id=$1) ORDER BY b.harvest_date ASC NULLS LAST,b.id`,[productId]);
  return result.rows.map(batchMap);
}
export async function refreshHarvest(pool) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const products=(await client.query("SELECT id FROM products WHERE inventory_type='edible' AND COALESCE(to_jsonb(products)->>'lettuce_stock_model','batch')<>'quantity' ORDER BY id FOR UPDATE SKIP LOCKED")).rows;
    for (const product of products) {
      const batches=(await client.query(`${BATCH_SELECT} WHERE b.product_id=$1 ORDER BY b.id FOR UPDATE OF b`,[product.id])).rows;
      for (const b of batches) {
        const stage=b.age_days>=21?21:b.age_days>=14?14:b.age_days>=8?8:0;
        if (stage>b.last_age_stage) {
          const action=stage===21?'Marked For Disposal':stage===14?'Automatically Placed On Hold':'Aging Alert';
          await client.query('UPDATE harvest_batches SET last_age_stage=$2 WHERE id=$1',[b.id,stage]);
          if(b.condition!=='Disposed'&&b.stock+b.reserved_stock+Number(b.allocated_stock||0)>0) await batchHistory(client,b,action,`Manila harvest age reached ${stage} days; inspect stock and reconcile any allocations`,'System',null,b);
        }
      }
      await syncHarvestProduct(client,product.id);
    }
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally {client.release();}
}
