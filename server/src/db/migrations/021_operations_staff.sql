-- Additive operational storage. No accounts or business records are seeded.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_restored_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS staff_fulfillment (
 order_id BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
 stage TEXT NOT NULL CHECK(stage IN ('Preparing','Packed','Ready for Pickup')),
 handler_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 checklist JSONB NOT NULL DEFAULT '[]',
 verified_items JSONB NOT NULL DEFAULT '[]',
 notes TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1,
 started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 packed_at TIMESTAMPTZ,
 ready_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS staff_activity (
 id BIGSERIAL PRIMARY KEY,
 staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 action TEXT NOT NULL,
 order_id BIGINT REFERENCES orders(id) ON DELETE RESTRICT,
 product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
 old_value JSONB,
 new_value JSONB,
 reason TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS staff_activity_personal ON staff_activity(staff_id,created_at DESC,id DESC);
