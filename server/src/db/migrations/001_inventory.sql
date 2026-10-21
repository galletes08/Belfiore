-- Additive migration. Existing prices and quantities are never overwritten.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_code TEXT,
  ADD COLUMN IF NOT EXISTS inventory_type TEXT NOT NULL DEFAULT 'succulent',
  ADD COLUMN IF NOT EXISTS pack_grams INTEGER,
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legacy_quantity_review BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE products p SET inventory_type = 'edible', pack_grams = 400
WHERE EXISTS (SELECT 1 FROM types t JOIN categories c ON c.id = t.category_id
              WHERE t.id = p.type_id AND LOWER(c.name) = 'aquaponics')
   OR LOWER(COALESCE(p.category, '')) = 'aquaponics'
   OR LOWER(COALESCE(p.tag, '')) IN ('aquaponics', 'others');
UPDATE products SET product_code = 'BF-' || LPAD(id::text, GREATEST(6, LENGTH(id::text)), '0') WHERE product_code IS NULL;
UPDATE products p SET legacy_quantity_review = TRUE WHERE inventory_type = 'succulent' AND
  (stock > 1 OR stock + COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE oi.product_id=p.id AND o.status NOT IN ('Cancelled','Delivered') AND o.inventory_restored_at IS NULL),0) > 1);
UPDATE products p SET sold_at = NOW()
WHERE inventory_type = 'succulent' AND stock = 0 AND sold_at IS NULL
AND EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id AND o.status <> 'Cancelled'
              AND (o.payment_status = 'Paid' OR o.status = 'Delivered'));
CREATE UNIQUE INDEX IF NOT EXISTS products_code_unique ON products (LOWER(product_code));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_state TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS inventory_reconciliation_reason TEXT;
CREATE TABLE IF NOT EXISTS inventory_reservations (
  order_id BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'committed', 'released')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_reservations_expiry ON inventory_reservations(expires_at) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_quantity INTEGER,
  new_quantity INTEGER NOT NULL,
  previous_reserved INTEGER,
  new_reserved INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE RESTRICT,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_movements_product_date ON inventory_movements(product_id, created_at DESC);
CREATE TABLE IF NOT EXISTS paymongo_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION inventory_product_status(p products) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
SELECT CASE WHEN p.archived_at IS NOT NULL THEN 'Archived'
  WHEN p.legacy_quantity_review THEN 'Unavailable'
  WHEN p.inventory_type = 'succulent' AND p.reserved_stock > 0 THEN 'Reserved'
  WHEN p.inventory_type = 'succulent' AND p.sold_at IS NOT NULL THEN 'Sold'
  WHEN p.stock = 0 THEN 'Out of Stock'
  WHEN p.inventory_type = 'edible' AND p.stock <= p.low_stock_threshold THEN 'Low Stock'
  ELSE 'Available' END;
$$;
CREATE OR REPLACE FUNCTION inventory_validate_product() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_code IS NULL OR BTRIM(NEW.product_code) = '' THEN
    NEW.product_code := 'BF-' || LPAD(NEW.id::text, GREATEST(6, LENGTH(NEW.id::text)), '0');
  END IF;
  IF NEW.inventory_type NOT IN ('succulent', 'edible') OR NEW.stock < 0 OR NEW.reserved_stock < 0
     OR NEW.low_stock_threshold < 0 THEN RAISE EXCEPTION 'Invalid inventory quantities or type'; END IF;
  IF NEW.inventory_type = 'edible' THEN NEW.pack_grams := 400; ELSE NEW.pack_grams := NULL; END IF;
  IF NEW.inventory_type = 'succulent' AND NEW.stock + NEW.reserved_stock > 1 THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Each succulent must be an individual plant'; END IF;
    IF NOT OLD.legacy_quantity_review THEN
      RAISE EXCEPTION 'Split legacy succulent quantities into individual products before changing stock';
    END IF;
    IF (NEW.stock <> OLD.stock OR NEW.reserved_stock <> OLD.reserved_stock) AND NOT (
      current_setting('inventory.action', true) = 'Stock In'
      AND NULLIF(current_setting('inventory.order_id', true), '') IS NOT NULL
      AND NEW.stock >= OLD.stock AND NEW.reserved_stock = OLD.reserved_stock
    ) THEN RAISE EXCEPTION 'Legacy quantities can only be restored through an existing order cancellation'; END IF;
  END IF;
  IF NEW.inventory_type = 'succulent' AND NEW.sold_at IS NOT NULL AND NEW.stock > 0 THEN
    RAISE EXCEPTION 'A sold succulent cannot be made available without an authorized return';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inventory_validate ON products;
CREATE TRIGGER inventory_validate BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION inventory_validate_product();
CREATE OR REPLACE FUNCTION inventory_record_movement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE event_action TEXT; old_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  event_action := NULLIF(current_setting('inventory.action', true), '');
  IF TG_OP = 'INSERT' THEN event_action := 'Product Added';
  ELSE
    old_status := inventory_product_status(OLD);
    IF event_action IS NULL THEN
      event_action := CASE WHEN NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN 'Product Archived'
        WHEN NEW.stock <> OLD.stock THEN 'Inventory Adjustment' ELSE 'Product Updated' END;
    END IF;
  END IF;
  INSERT INTO inventory_movements(product_id, product_code, product_name, action,
    previous_quantity, new_quantity, previous_reserved, new_reserved, previous_status,
    new_status, reason, order_id, actor)
  VALUES (NEW.id, NEW.product_code, NEW.name, event_action,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.stock ELSE NULL END, NEW.stock,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.reserved_stock ELSE NULL END, NEW.reserved_stock,
    old_status, inventory_product_status(NEW),
    COALESCE(NULLIF(current_setting('inventory.reason', true), ''), event_action),
    NULLIF(current_setting('inventory.order_id', true), '')::bigint,
    COALESCE(NULLIF(current_setting('inventory.actor', true), ''), 'System'));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inventory_audit ON products;
CREATE TRIGGER inventory_audit AFTER INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION inventory_record_movement();
-- Baseline snapshot: these are imported existing records, not fabricated stock movements.
INSERT INTO inventory_movements(product_id, product_code, product_name, action, new_quantity,
  new_reserved, new_status, reason, actor)
SELECT id, product_code, name, 'Inventory Adjustment', stock, reserved_stock,
  inventory_product_status(products), 'Existing inventory baseline; original quantity and price preserved', 'Inventory migration'
FROM products;
-- Legacy pending online orders keep their existing deducted quantities and business state.
-- They are not silently adopted or expired; review them separately during deployment.
