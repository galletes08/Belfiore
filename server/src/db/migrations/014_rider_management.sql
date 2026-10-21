-- No historical rows are backfilled. Existing manual is_available is the duty preference.
CREATE INDEX IF NOT EXISTS orders_active_rider ON orders(rider_id) WHERE status NOT IN ('Delivered','Cancelled');
-- Older orders may have no recorded assignment time; never replace that with a made-up date.
ALTER TABLE order_rider_assignments ALTER COLUMN assigned_at DROP NOT NULL;
CREATE OR REPLACE FUNCTION guard_rider_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target RECORD;
BEGIN
  IF NEW.rider_id IS NOT NULL
     AND (TG_OP='INSERT' OR NEW.rider_id IS DISTINCT FROM OLD.rider_id
       OR (OLD.status IN ('Delivered','Cancelled') AND NEW.status NOT IN ('Delivered','Cancelled'))) THEN
    SELECT r.status,r.is_available,u.status AS login_status,u.role,u.must_change_password
      INTO target FROM riders r LEFT JOIN users u ON u.id=r.user_id WHERE r.id=NEW.rider_id FOR UPDATE OF r;
    IF NOT FOUND OR target.status<>'active' OR target.login_status IS DISTINCT FROM 'active'
       OR target.role IS DISTINCT FROM 'rider' OR target.must_change_password OR NOT target.is_available THEN
      RAISE EXCEPTION 'Selected rider is offline, disabled, or not eligible for assignment' USING ERRCODE='P0001';
    END IF;
    IF EXISTS(SELECT 1 FROM orders WHERE rider_id=NEW.rider_id AND id<>NEW.id AND status NOT IN ('Delivered','Cancelled')) THEN
      RAISE EXCEPTION 'Selected rider already has an ongoing assignment' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rider_assignment_guard ON orders;
CREATE TRIGGER rider_assignment_guard BEFORE INSERT OR UPDATE OF rider_id,status ON orders FOR EACH ROW EXECUTE FUNCTION guard_rider_assignment();

CREATE OR REPLACE FUNCTION record_rider_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.rider_id IS NOT NULL AND OLD.rider_id IS DISTINCT FROM NEW.rider_id THEN
    UPDATE order_rider_assignments SET status='reassigned',completed_at=clock_timestamp()
      WHERE order_id=NEW.id AND rider_id=OLD.rider_id AND status IN ('assigned','accepted','Pending','Preparing','Out for Delivery','Cancellation Requested');
    IF NOT EXISTS(SELECT 1 FROM order_rider_assignments WHERE order_id=NEW.id AND rider_id=OLD.rider_id) THEN
      INSERT INTO order_rider_assignments(order_id,rider_id,assigned_at,accepted_at,completed_at,status)
        VALUES(NEW.id,OLD.rider_id,OLD.driver_assigned_at,OLD.driver_accepted_at,clock_timestamp(),'reassigned');
    END IF;
  END IF;
  IF NEW.rider_id IS NOT NULL THEN
    IF TG_OP='INSERT' OR NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
      INSERT INTO order_rider_assignments(order_id,rider_id,assigned_at,accepted_at,completed_at,status)
        VALUES(NEW.id,NEW.rider_id,clock_timestamp(),NEW.driver_accepted_at,
          CASE WHEN NEW.status IN ('Delivered','Cancelled') THEN clock_timestamp() END,NEW.status);
    ELSE
      UPDATE order_rider_assignments SET status=NEW.status,accepted_at=COALESCE(accepted_at,NEW.driver_accepted_at),
        completed_at=CASE WHEN NEW.status IN ('Delivered','Cancelled') THEN COALESCE(completed_at,clock_timestamp()) ELSE completed_at END
        WHERE order_id=NEW.id AND rider_id=NEW.rider_id AND status IN ('assigned','accepted','Pending','Preparing','Out for Delivery','Cancellation Requested');
      IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.driver_accepted_at IS DISTINCT FROM OLD.driver_accepted_at)
        AND NOT EXISTS(SELECT 1 FROM order_rider_assignments WHERE order_id=NEW.id AND rider_id=NEW.rider_id) THEN
        INSERT INTO order_rider_assignments(order_id,rider_id,assigned_at,accepted_at,completed_at,status)
          VALUES(NEW.id,NEW.rider_id,OLD.driver_assigned_at,NEW.driver_accepted_at,
            CASE WHEN NEW.status IN ('Delivered','Cancelled') THEN clock_timestamp() END,NEW.status);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rider_assignment_history ON orders;
CREATE TRIGGER rider_assignment_history AFTER INSERT OR UPDATE OF rider_id,status,driver_accepted_at ON orders FOR EACH ROW EXECUTE FUNCTION record_rider_assignment();
