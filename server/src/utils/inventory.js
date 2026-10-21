import {reserveSupply,transitionSupplies,SUPPLY} from './supplies.js';
import { reserveBatchAllocation,changeBatchAllocation,batchOrderEligible } from './harvest.js';
export function inventoryError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

export function reservationMinutes() {
  const value = Number(process.env.INVENTORY_RESERVATION_MINUTES || 15);
  return Number.isFinite(value) && value > 0 && value <= 1440 ? value : 15;
}

export async function inventoryContext(client, { action = '', reason = '', actor = 'System', orderId = null } = {}) {
  await client.query(`SELECT set_config('inventory.action', $1, true), set_config('inventory.reason', $2, true),
    set_config('inventory.actor', $3, true), set_config('inventory.order_id', $4, true)`,
  [action, reason, actor, orderId == null ? '' : String(orderId)]);
}

export async function reserveOrderInventory(client, orderId, items, online, actor) {
  await client.query('UPDATE orders SET inventory_state=$2 WHERE id=$1',[orderId,online?'reserved':'committed']);
  await inventoryContext(client, { action: online ? 'Product Reserved' : 'Product Sold',
    reason: online ? 'Online checkout reservation' : 'COD order accepted', actor, orderId });
  await client.query('SELECT id FROM products WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[[...new Set(items.map(i=>i.productId))]]);
  // Deterministic lock ordering also prevents multi-product checkout deadlocks.
  for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
    if(item.variantId){await reserveSupply(client,item,orderId,online,actor);continue;}
    if(item.batchId) {await reserveBatchAllocation(client,item,orderId,online,actor);continue;}
    await inventoryContext(client,{action:online?'Product Reserved':'Product Sold',reason:online?'Online checkout reservation':'COD order accepted',actor,orderId});
    const result = await client.query(`UPDATE products SET stock = stock - $2,
      reserved_stock = reserved_stock + CASE WHEN $3 THEN $2 ELSE 0 END,
      sold_at = CASE WHEN NOT $3 AND inventory_type = 'succulent' THEN NOW() ELSE sold_at END
      WHERE id = $1 AND stock >= $2 AND archived_at IS NULL AND NOT legacy_quantity_review
      AND (inventory_type = 'edible' OR ($2 = 1 AND sold_at IS NULL AND reserved_stock = 0)) RETURNING id`,
    [item.productId, item.qty, online]);
    if (!result.rows.length) throw inventoryError(`Stock changed for ${item.productName}. Refresh your cart.`);
  }
  await client.query('UPDATE orders SET inventory_state = $2 WHERE id = $1', [orderId, online ? 'reserved' : 'committed']);
  if (online) await client.query(`INSERT INTO inventory_reservations(order_id, status, expires_at)
    VALUES ($1, 'active', NOW() + $2 * INTERVAL '1 minute')`, [orderId, reservationMinutes()]);
}

// Caller holds the order lock; products are always locked in ascending ID order.
export async function releaseOrderInventory(client, order, reason, actor = 'System') {
  if (order.inventory_restored_at || order.inventory_state === 'released') return;
  const reserved = order.inventory_state === 'reserved';
  await client.query('SELECT id FROM products WHERE id IN (SELECT product_id FROM order_items WHERE order_id=$1) ORDER BY id FOR UPDATE',[order.id]);
  await transitionSupplies(client,order.id,true,reserved,reason,actor);
  const items = await client.query(`SELECT oi.product_id,oi.batch_id,p.inventory_type, SUM(oi.qty)::int AS qty FROM order_items oi JOIN products p ON p.id=oi.product_id
    WHERE oi.order_id = $1 GROUP BY oi.product_id,oi.batch_id,p.inventory_type ORDER BY oi.product_id,oi.batch_id`, [order.id]);
  await inventoryContext(client, { action: reserved ? 'Reservation Released' : 'Stock In', reason, actor, orderId: order.id });
  for (const item of items.rows) {
    if(item.inventory_type===SUPPLY)continue;
    if(item.inventory_type==='edible'&&await changeBatchAllocation(client,item,order.id,true,reserved,reason,actor)) continue;
    await inventoryContext(client,{action:reserved?'Reservation Released':'Stock In',reason,actor,orderId:order.id});
    const result = await client.query(`UPDATE products SET stock = stock + $2,
      reserved_stock = reserved_stock - CASE WHEN $3 THEN $2 ELSE 0 END,
      sold_at = CASE WHEN inventory_type = 'succulent' THEN NULL ELSE sold_at END
      WHERE id = $1 AND (NOT $3 OR reserved_stock >= $2) RETURNING id`, [item.product_id, item.qty, reserved]);
    if (!result.rows.length) throw inventoryError('Inventory release requires reconciliation');
  }
  await client.query(`UPDATE inventory_reservations SET status = 'released', updated_at = NOW()
    WHERE order_id = $1 AND status = 'active'`, [order.id]);
  await client.query(`UPDATE orders SET inventory_state = 'released', inventory_restored_at = NOW() WHERE id = $1`, [order.id]);
}

export async function expireReservations(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query(`SELECT o.* FROM orders o JOIN inventory_reservations r ON r.order_id = o.id
      WHERE r.status = 'active' AND r.expires_at <= NOW() ORDER BY o.id FOR UPDATE OF o SKIP LOCKED LIMIT 100`);
    for (const order of expired.rows) {
      await releaseOrderInventory(client, order, 'Payment reservation expired');
      await client.query(`UPDATE orders SET status = 'Cancelled', tracking_status = 'Cancelled',
        payment_status = CASE WHEN payment_status = 'Paid' THEN 'Refund Pending' ELSE 'Failed' END,
        cancelled_at = NOW(), cancelled_by = 'System', cancel_reason = 'Payment reservation expired',
        status_updated_at = NOW(), updated_at = NOW() WHERE id = $1`, [order.id]);
    }
    await client.query('COMMIT');
    return expired.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// Both signed webhooks and authenticated server-to-server verification use this transition.
export async function confirmInventoryPayment(client, order, payment) {
  if (order.payment_status === 'Refunded') return 'Refunded';
  if (order.payment_status === 'Paid' && order.inventory_state !== 'released') return 'Paid';
  await client.query('SELECT id FROM products WHERE id IN (SELECT product_id FROM order_items WHERE order_id=$1) ORDER BY id FOR UPDATE',[order.id]);
  const amount=Number(payment?.attributes?.amount);
  const currency=String(payment?.attributes?.currency||'').toUpperCase();
  const amountMatches=Number.isFinite(amount)&&amount===Math.round(Number(order.total_amount)*100)&&currency==='PHP';
  const result = await client.query('SELECT *, expires_at > NOW() AS within_window FROM inventory_reservations WHERE order_id = $1 FOR UPDATE', [order.id]);
  const reservation = result.rows[0];
  let refundRequired = order.status === 'Cancelled' || order.inventory_state === 'released';
  if(!await batchOrderEligible(client,order.id)) refundRequired=true;
  if (order.inventory_state === 'reserved') {
    if (!reservation || reservation.status !== 'active' || !reservation.within_window || !amountMatches || !await batchOrderEligible(client,order.id)) {
      await releaseOrderInventory(client, order, 'Late payment after reservation expiration');
      refundRequired = true;
    } else {
      const items = await client.query(`SELECT oi.product_id,oi.batch_id,p.inventory_type,SUM(oi.qty)::int AS qty FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id = $1
        GROUP BY oi.product_id,oi.batch_id,p.inventory_type ORDER BY oi.product_id,oi.batch_id`, [order.id]);
      await transitionSupplies(client,order.id,false,true,'Verified PayMongo payment','System');
      await inventoryContext(client, { action: 'Product Sold', reason: 'Verified PayMongo payment', orderId: order.id });
      for (const item of items.rows) {
        if(item.inventory_type===SUPPLY)continue;
        if(item.inventory_type==='edible'&&await changeBatchAllocation(client,item,order.id,false,true,'Verified PayMongo payment','System')) continue;
        await inventoryContext(client,{action:'Product Sold',reason:'Verified PayMongo payment',orderId:order.id});
        const updated = await client.query(`UPDATE products SET reserved_stock = reserved_stock - $2,
          sold_at = CASE WHEN inventory_type = 'succulent' THEN NOW() ELSE sold_at END
          WHERE id = $1 AND reserved_stock >= $2 RETURNING id`, [item.product_id, item.qty]);
        if (!updated.rows.length) throw inventoryError('Reserved inventory requires reconciliation');
      }
      await client.query(`UPDATE inventory_reservations SET status = 'committed', updated_at = NOW() WHERE order_id = $1`, [order.id]);
      await client.query(`UPDATE orders SET inventory_state = 'committed' WHERE id = $1`, [order.id]);
    }
  }
  if(!amountMatches) refundRequired=true;
  const status = refundRequired ? 'Refund Pending' : 'Paid';
  const rawPaidAt = payment?.attributes?.paid_at;
  const paidAt = typeof rawPaidAt === 'number' ? new Date(rawPaidAt * 1000).toISOString() : rawPaidAt || new Date().toISOString();
  await client.query(`UPDATE orders SET payment_status = $2,
    paymongo_payment_id = COALESCE($3, paymongo_payment_id),
    paymongo_payment_intent_id = COALESCE($4, paymongo_payment_intent_id),
    paymongo_paid_at = COALESCE(paymongo_paid_at, $5::timestamptz),
    inventory_reconciliation_reason = CASE WHEN $6 THEN 'Payment amount mismatch, released reservation, or held harvest batch; manual reconciliation/refund required' ELSE NULL END,
    status = CASE WHEN $6 THEN 'Cancelled' ELSE status END,
    tracking_status = CASE WHEN $6 THEN 'Cancelled' ELSE tracking_status END,
    updated_at = NOW() WHERE id = $1`,
  [order.id, status, payment?.id || null, payment?.attributes?.payment_intent_id || null, paidAt, refundRequired]);
  return status;
}
