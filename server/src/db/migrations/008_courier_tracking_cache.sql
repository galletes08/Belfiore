CREATE TABLE IF NOT EXISTS order_courier_tracking (
  order_id BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  tracking_number TEXT NOT NULL,
  updates JSONB NOT NULL DEFAULT '[]',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
