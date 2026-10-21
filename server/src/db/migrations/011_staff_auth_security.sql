-- Additive authentication-only storage; existing accounts/passwords/roles are untouched.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS auth_security_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  blocked_until TIMESTAMPTZ,
  alert_sent_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS auth_password_resets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject_key TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS auth_password_resets_user ON auth_password_resets(user_id);
CREATE TABLE IF NOT EXISTS auth_security_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT,
  action TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  ip_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS auth_security_events_time ON auth_security_events(created_at DESC);
