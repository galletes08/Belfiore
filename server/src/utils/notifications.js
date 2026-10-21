import { pool } from '../config/db.js';

export async function reconcileNotifications(db = pool) {
  // Repair a missed capture from durable order state, then deliver committed outbox events.
  await db.query(`INSERT INTO order_notification_outbox(event_key,event_type,order_id,title,message,event_at)
    SELECT c.event_key,c.event_type,c.order_id,c.title,c.message,c.event_at
    FROM orders o CROSS JOIN LATERAL order_notification_candidates(o) c
    ON CONFLICT(event_key) DO NOTHING`);
  await db.query(`INSERT INTO admin_notifications(event_key,event_type,order_id,title,message,created_at)
    SELECT event_key,event_type,order_id,title,message,event_at FROM order_notification_outbox
    WHERE delivered_at IS NULL ORDER BY event_at LIMIT 500 ON CONFLICT(event_key) DO NOTHING`);
  return db.query(`UPDATE order_notification_outbox q SET delivered_at=clock_timestamp() WHERE delivered_at IS NULL
    AND EXISTS(SELECT 1 FROM admin_notifications n WHERE n.event_key=q.event_key)`);
}
