ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address JSONB;
CREATE TABLE IF NOT EXISTS checkout_requests (
  customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE RESTRICT,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(customer_id,request_key)
);
