ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS customer_account_activity (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('Account Disabled','Account Enabled')),
  previous_status TEXT NOT NULL,new_status TEXT NOT NULL,
  reason TEXT NOT NULL,actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS customer_account_activity_customer ON customer_account_activity(customer_id,created_at DESC,id DESC);
