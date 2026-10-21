CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY CHECK(id=1), enabled_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO notification_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS admin_notifications (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  recipient_role TEXT NOT NULL DEFAULT 'admin' CHECK(recipient_role='admin'),
  title TEXT NOT NULL, message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS admin_notifications_newest ON admin_notifications(created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS admin_notification_reads (
  notification_id BIGINT NOT NULL REFERENCES admin_notifications(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(notification_id,user_id)
);
CREATE TABLE IF NOT EXISTS order_notification_outbox (
  event_key TEXT PRIMARY KEY,event_type TEXT NOT NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,message TEXT NOT NULL,event_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS order_notification_outbox_pending ON order_notification_outbox(event_at) WHERE delivered_at IS NULL;

-- Candidates use durable order timestamps/states, allowing failed notifications to retry.
-- Enablement cutoff avoids generating a backlog of alerts for historical orders.
CREATE OR REPLACE FUNCTION order_notification_candidates(p orders)
RETURNS TABLE(event_key TEXT,event_type TEXT,order_id BIGINT,title TEXT,message TEXT,event_at TIMESTAMPTZ)
LANGUAGE SQL STABLE AS $$
  SELECT p.id::text||':'||v.kind||COALESCE(':'||v.suffix,''),v.kind,p.id,v.heading,
    'Order ORD-'||LPAD(p.id::text,GREATEST(3,LENGTH(p.id::text)),'0')||v.body,v.at
  FROM (VALUES
    ('cod_order',NULL::text,'New COD Order',' has been received and is awaiting review.',p.created_at,p.payment_method='COD'),
    ('online_paid',NULL,'Online Payment Confirmed',' payment has been verified.',p.paymongo_paid_at,p.payment_method='ONLINE' AND p.payment_status='Paid' AND p.paymongo_payment_id IS NOT NULL),
    ('cancellation_request',EXTRACT(EPOCH FROM p.cancellation_requested_at)::text,'Cancellation Request',' has a pending cancellation request.',p.cancellation_requested_at,p.status='Cancellation Requested'),
    ('payment_failed',NULL,'Payment Issue',' has a verified online payment failure.',p.cancelled_at,p.payment_method='ONLINE' AND p.payment_status='Failed' AND p.cancel_reason='Online payment failed'),
    ('payment_review',NULL,'Payment Issue',' requires payment reconciliation or refund review.',p.updated_at,p.payment_method='ONLINE' AND p.payment_status='Refund Pending')
  ) AS v(kind,suffix,heading,body,at,eligible)
  WHERE v.eligible AND v.at >= (SELECT enabled_at FROM notification_settings WHERE id=1)
$$;

CREATE OR REPLACE FUNCTION record_order_notifications() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO order_notification_outbox(event_key,event_type,order_id,title,message,event_at)
      SELECT event_key,event_type,order_id,title,message,event_at FROM order_notification_candidates(NEW)
      ON CONFLICT(event_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Belfiore notification outbox failed for order %, SQLSTATE %, %; retry reconciliation',NEW.id,SQLSTATE,SQLERRM;
    RETURN NEW;
  END;
  BEGIN
    INSERT INTO admin_notifications(event_key,event_type,order_id,title,message,created_at)
      SELECT event_key,event_type,order_id,title,message,event_at FROM order_notification_outbox
      WHERE order_id=NEW.id AND delivered_at IS NULL ON CONFLICT(event_key) DO NOTHING;
    UPDATE order_notification_outbox q SET delivered_at=clock_timestamp() WHERE q.order_id=NEW.id AND q.delivered_at IS NULL
      AND EXISTS(SELECT 1 FROM admin_notifications n WHERE n.event_key=q.event_key);
  EXCEPTION WHEN OTHERS THEN
    -- Outbox remains committed with the order, even if its subsequent state changes.
    RAISE LOG 'Belfiore notification delivery failed for order %, SQLSTATE %, %; outbox retry pending',NEW.id,SQLSTATE,SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_notifications ON orders;
CREATE TRIGGER order_notifications AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION record_order_notifications();
