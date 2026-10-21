-- Reuse the existing pending-registration staging area; do not alter existing users.
CREATE TABLE IF NOT EXISTS pending_registrations (
 id BIGSERIAL PRIMARY KEY,first_name TEXT NOT NULL,last_name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS customer_registration_limits (
 subject_key TEXT PRIMARY KEY,window_start TIMESTAMPTZ NOT NULL,attempts INTEGER NOT NULL
);
