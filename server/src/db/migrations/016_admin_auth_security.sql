ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_restricted_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_lock_incident UUID;
CREATE TABLE IF NOT EXISTS auth_admin_alert_queue (
  id BIGSERIAL PRIMARY KEY,
  incident UUID NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject_key TEXT NOT NULL,ip_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent','failed','unavailable')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  claimed_at TIMESTAMPTZ,finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS auth_admin_alert_queue_pending ON auth_admin_alert_queue(id) WHERE state='queued';
