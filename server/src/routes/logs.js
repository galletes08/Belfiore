import { Router } from 'express';
import { pool } from '../config/db.js';
import { verifyRequestToken } from '../utils/auth.js';

const router = Router();

router.get('/api/admin/logs', async (req, res) => {
  try {
    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 25), 500) : 250;
    const result = await pool.query(`
      WITH events AS (
        SELECT
          'order-created-' || o.id AS event_id,
          'order' AS event_type,
          'Order placed' AS action,
          'Order' AS entity,
          o.id::text AS entity_id,
          COALESCE(NULLIF(o.customer_name, ''), 'Customer') AS actor,
          'Order #' || o.id || ' was placed by ' || COALESCE(NULLIF(o.customer_name, ''), 'a customer') AS description,
          o.status AS status,
          o.created_at AS occurred_at,
          o.total_amount::float AS amount
        FROM orders o

        UNION ALL

        SELECT
          'order-status-' || o.id || '-' || EXTRACT(EPOCH FROM COALESCE(o.status_updated_at, o.updated_at)),
          'order', 'Status changed', 'Order', o.id::text,
          'System', 'Order #' || o.id || ' is now ' || COALESCE(o.status, 'Unknown'),
          o.status, COALESCE(o.status_updated_at, o.updated_at, o.created_at), o.total_amount::float
        FROM orders o
        WHERE COALESCE(o.status_updated_at, o.updated_at) > o.created_at

        UNION ALL

        SELECT
          'payment-' || o.id || '-' || EXTRACT(EPOCH FROM o.paymongo_paid_at),
          'payment', 'Payment received', 'Order', o.id::text,
          COALESCE(NULLIF(o.customer_name, ''), 'Customer'),
          'Payment received for order #' || o.id || ' via ' || COALESCE(o.payment_method, 'payment gateway'),
          o.payment_status, o.paymongo_paid_at, o.total_amount::float
        FROM orders o
        WHERE o.paymongo_paid_at IS NOT NULL

        UNION ALL

        SELECT
          'tracking-' || o.id || '-' || EXTRACT(EPOCH FROM o.track123_last_synced_at),
          'delivery', 'Tracking synchronized', 'Order', o.id::text,
          'Track123', 'Tracking for order #' || o.id || ' synchronized with ' || COALESCE(o.tracking_status, 'carrier'),
          o.tracking_status, o.track123_last_synced_at, NULL::float
        FROM orders o
        WHERE o.track123_last_synced_at IS NOT NULL

        UNION ALL

        SELECT
          'assignment-' || a.id,
          'delivery', 'Rider assigned', 'Order', a.order_id::text,
          COALESCE(NULLIF(TRIM(r.first_name || ' ' || r.last_name), ''), 'Rider'),
          'Rider ' || COALESCE(NULLIF(TRIM(r.first_name || ' ' || r.last_name), ''), '#' || a.rider_id) || ' assigned to order #' || a.order_id,
          a.status, a.assigned_at, o.total_amount::float
        FROM order_rider_assignments a
        LEFT JOIN riders r ON r.id = a.rider_id
        LEFT JOIN orders o ON o.id = a.order_id

        UNION ALL

        SELECT
          'rider-location-' || rl.id,
          'delivery', 'Rider location updated', 'Order', COALESCE(rl.order_id, 0)::text,
          COALESCE(NULLIF(TRIM(r.first_name || ' ' || r.last_name), ''), 'Rider'),
          'Live location received from ' || COALESCE(NULLIF(TRIM(r.first_name || ' ' || r.last_name), ''), 'rider'),
          'Live', rl.recorded_at, NULL::float
        FROM rider_locations rl
        LEFT JOIN riders r ON r.id = rl.rider_id

        UNION ALL

        SELECT
          'customer-' || u.id || '-' || EXTRACT(EPOCH FROM u.created_at),
          'account', 'Customer registered', 'Customer', u.id::text,
          COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email),
          'Customer account created for ' || u.email,
          u.status, u.created_at, NULL::float
        FROM users u
        WHERE u.role = 'customer'

        UNION ALL

        SELECT
          'inventory-' || p.id || '-' || EXTRACT(EPOCH FROM COALESCE(p.updated_at, p.created_at)),
          'inventory', 'Inventory updated', 'Product', p.id::text,
          'System', 'Inventory record updated for ' || p.name,
          CASE WHEN COALESCE(p.stock, 0) <= 5 THEN 'Low stock' ELSE 'In stock' END,
          COALESCE(p.updated_at, p.created_at), NULL::float
        FROM products p
      )
      SELECT event_id, event_type, action, entity, entity_id, actor, description, status, occurred_at, amount
      FROM events
      WHERE occurred_at IS NOT NULL
      ORDER BY occurred_at DESC
      LIMIT $1
    `, [limit]);

    res.json({ generatedAt: new Date().toISOString(), logs: result.rows });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to load system logs' });
  }
});

export default router;
