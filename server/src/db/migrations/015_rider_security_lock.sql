ALTER TABLE users ADD COLUMN IF NOT EXISTS rider_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rider_security_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rider_security_locked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rider_security_unlocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rider_login_after_unlock_pending BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE auth_security_buckets ADD COLUMN IF NOT EXISTS rider_lock_shadow BOOLEAN NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION guard_rider_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target RECORD;
BEGIN
  IF NEW.rider_id IS NOT NULL
     AND (TG_OP='INSERT' OR NEW.rider_id IS DISTINCT FROM OLD.rider_id
       OR (OLD.status IN ('Delivered','Cancelled') AND NEW.status NOT IN ('Delivered','Cancelled'))) THEN
    -- Serialize assignment eligibility with login lock/unlock without touching deliveries.
    PERFORM 1 FROM riders WHERE id=NEW.rider_id FOR UPDATE;
    PERFORM 1 FROM users WHERE id=(SELECT user_id FROM riders WHERE id=NEW.rider_id) FOR UPDATE;
    SELECT r.status,r.is_available,u.status AS login_status,u.role,u.must_change_password,u.rider_security_locked
      INTO target FROM riders r LEFT JOIN users u ON u.id=r.user_id WHERE r.id=NEW.rider_id FOR UPDATE OF r;
    IF NOT FOUND OR target.status<>'active' OR target.login_status IS DISTINCT FROM 'active'
       OR target.rider_security_locked OR target.role IS DISTINCT FROM 'rider' OR target.must_change_password OR NOT target.is_available THEN
      RAISE EXCEPTION 'Selected rider is offline, disabled, or not eligible for assignment' USING ERRCODE='P0001';
    END IF;
    IF EXISTS(SELECT 1 FROM orders WHERE rider_id=NEW.rider_id AND id<>NEW.id AND status NOT IN ('Delivered','Cancelled')) THEN
      RAISE EXCEPTION 'Selected rider already has an ongoing assignment' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
