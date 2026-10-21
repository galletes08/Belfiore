import { pool } from '../src/config/db.js';
try {
  const counts = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM products) AS products,
    (SELECT COUNT(*)::int FROM orders) AS orders,
    (SELECT COUNT(*)::int FROM orders WHERE payment_status IN ('Paid','Refund Pending','Refunded') OR status='Delivered') AS paid_refund_or_delivered_orders,
    (SELECT COUNT(*)::int FROM inventory_movements) AS inventory_history,
    (SELECT COUNT(*)::int FROM inventory_reservations) AS reservations,
    (SELECT COUNT(*)::int FROM order_items) AS order_items`);
  console.log(JSON.stringify(counts.rows[0]));
} finally { await pool.end(); }
