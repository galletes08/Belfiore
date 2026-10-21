-- Required for persistent retry protection and future order-code snapshots.
-- Existing names, prices, product codes and order snapshots are not rewritten.
CREATE TABLE IF NOT EXISTS inventory_product_requests (
  request_key TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_code TEXT,
  ADD COLUMN IF NOT EXISTS inventory_type TEXT;
