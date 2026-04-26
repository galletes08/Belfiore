CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  password TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));

CREATE TABLE IF NOT EXISTS riders (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT NOT NULL,
  address TEXT,
  vehicle_type TEXT,
  plate_number TEXT,
  license_number TEXT,
  emergency_contact TEXT,
  bio TEXT,
  profile_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS plate_number TEXT,
  ADD COLUMN IF NOT EXISTS license_number TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
  ADD COLUMN IF NOT EXISTS user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_riders_email ON riders(LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS types (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL,
  UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  category TEXT,
  name TEXT NOT NULL,
  tag TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  description TEXT,
  image_url TEXT,
  type_id BIGINT REFERENCES types(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS tag TEXT,
  ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS type_id BIGINT REFERENCES types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE products
SET category = 'Aloe Hybrids'
WHERE category IS NULL OR BTRIM(category) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock_qty'
  ) THEN
    EXECUTE 'UPDATE products SET stock = stock_qty WHERE stock = 0 AND stock_qty IS NOT NULL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  gmail TEXT,
  mobile_num TEXT,
  location TEXT,
  customer_latitude DOUBLE PRECISION,
  customer_longitude DOUBLE PRECISION,
  delivery_mode TEXT NOT NULL DEFAULT 'rider',
  payment_method TEXT NOT NULL DEFAULT 'COD',
  payment_status TEXT NOT NULL DEFAULT 'Unpaid',
  status TEXT NOT NULL DEFAULT 'Pending',
  rider_id BIGINT REFERENCES riders(id) ON DELETE SET NULL,
  courier_name TEXT,
  driver_phone TEXT,
  driver_access_token TEXT,
  driver_assigned_at TIMESTAMPTZ,
  driver_accepted_at TIMESTAMPTZ,
  driver_latitude DOUBLE PRECISION,
  driver_longitude DOUBLE PRECISION,
  driver_location_updated_at TIMESTAMPTZ,
  tracking_code TEXT,
  tracking_status TEXT NOT NULL DEFAULT 'Pending',
  paymongo_checkout_session_id TEXT,
  paymongo_payment_id TEXT,
  paymongo_payment_intent_id TEXT,
  paymongo_paid_at TIMESTAMPTZ,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS gmail TEXT,
  ADD COLUMN IF NOT EXISTS mobile_num TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS customer_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS customer_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'rider',
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'COD',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Unpaid',
  ADD COLUMN IF NOT EXISTS rider_id BIGINT REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS courier_name TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone TEXT,
  ADD COLUMN IF NOT EXISTS driver_access_token TEXT,
  ADD COLUMN IF NOT EXISTS driver_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS driver_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS driver_location_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS tracking_courier_code TEXT,
  ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS track123_tracking_id TEXT,
  ADD COLUMN IF NOT EXISTS track123_last_checkpoint_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS track123_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paymongo_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS paymongo_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS paymongo_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paymongo_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_driver_access_token
  ON orders(driver_access_token)
  WHERE driver_access_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_rider_assignments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id BIGINT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'assigned'
);

CREATE TABLE IF NOT EXISTS rider_locations (
  id BIGSERIAL PRIMARY KEY,
  rider_id BIGINT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('COD', 'ONLINE'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_delivery_mode_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_delivery_mode_check
      CHECK (delivery_mode IN ('rider', 'logistics'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  image_url TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_products_type_id ON products(type_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_rider_assignments_order_id ON order_rider_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_rider_assignments_rider_id ON order_rider_assignments(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_locations_rider_id ON rider_locations(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_locations_order_id ON rider_locations(order_id);
