CREATE TABLE IF NOT EXISTS order_delivery_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  courier TEXT, tracking_number TEXT,
  previous_status TEXT NOT NULL,new_status TEXT NOT NULL,
  actor TEXT NOT NULL,notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS order_delivery_history_order ON order_delivery_history(order_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION record_manual_delivery_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.delivery_mode='logistics' AND OLD.tracking_status IS DISTINCT FROM NEW.tracking_status
    AND NULLIF(current_setting('delivery.actor',true),'') IS NOT NULL THEN
    INSERT INTO order_delivery_history(order_id,courier,tracking_number,previous_status,new_status,actor,notes)
      VALUES(NEW.id,NEW.courier_name,NEW.tracking_code,OLD.tracking_status,NEW.tracking_status,
        current_setting('delivery.actor',true),NULLIF(current_setting('delivery.notes',true),''));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS manual_delivery_history ON orders;
CREATE TRIGGER manual_delivery_history AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION record_manual_delivery_history();
