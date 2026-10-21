CREATE TABLE IF NOT EXISTS harvest_batches (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_code TEXT UNIQUE,
  harvest_date DATE,
  initial_quantity INTEGER NOT NULL CHECK(initial_quantity >= 0),
  stock INTEGER NOT NULL CHECK(stock >= 0),
  reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK(reserved_stock >= 0),
  regular_price NUMERIC(10,2) NOT NULL CHECK(regular_price >= 0),
  price NUMERIC(10,2) NOT NULL CHECK(price >= 0),
  condition TEXT NOT NULL DEFAULT 'Fresh' CHECK(condition IN ('Fresh','Aging','On Hold','Unsellable','For Disposal','Disposed','Unverified')),
  last_age_stage INTEGER NOT NULL DEFAULT 0,
  legacy_import BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS harvest_batches_product_harvest ON harvest_batches(product_id,harvest_date,id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS batch_id BIGINT REFERENCES harvest_batches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS batch_code TEXT;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS batch_id BIGINT REFERENCES harvest_batches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS previous_value JSONB,
  ADD COLUMN IF NOT EXISTS new_value JSONB;
CREATE OR REPLACE FUNCTION harvest_batch_age(b harvest_batches) RETURNS INTEGER LANGUAGE SQL VOLATILE AS $$
 SELECT (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date - b.harvest_date;
$$;
CREATE OR REPLACE FUNCTION harvest_batch_status(b harvest_batches) RETURNS TEXT LANGUAGE SQL VOLATILE AS $$
 SELECT CASE WHEN b.condition='Disposed' THEN 'Disposed'
  WHEN b.harvest_date IS NULL THEN 'Unverified'
  WHEN harvest_batch_age(b)>=21 THEN 'For Disposal'
  WHEN harvest_batch_age(b)>=14 THEN 'On Hold'
  WHEN b.condition IN ('On Hold','Unsellable','For Disposal','Unverified') THEN b.condition
  WHEN harvest_batch_age(b)>=8 OR b.condition='Aging' THEN 'Aging' ELSE 'Fresh' END;
$$;
CREATE OR REPLACE FUNCTION harvest_batch_sellable(b harvest_batches) RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
 SELECT b.harvest_date IS NOT NULL AND harvest_batch_age(b)>=0 AND harvest_batch_status(b) IN ('Fresh','Aging');
$$;
-- Preserve physical stock without inventing a harvest date or modifying historical order lines.
INSERT INTO harvest_batches(product_id,initial_quantity,stock,reserved_stock,regular_price,price,condition,created_by,legacy_import)
SELECT id,stock+reserved_stock,stock,reserved_stock,price,price,'Unverified','Inventory migration',TRUE
FROM products WHERE inventory_type='edible';
UPDATE harvest_batches SET batch_code='HB-'||LPAD(id::text,GREATEST(6,LENGTH(id::text)),'0') WHERE batch_code IS NULL;
SELECT set_config('inventory.reason','Legacy edible stock preserved in unverified harvest batches; excluded from sale',true);
UPDATE products SET stock=0 WHERE inventory_type='edible' AND stock<>0;
CREATE OR REPLACE FUNCTION harvest_validate_batch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.batch_code IS NULL THEN NEW.batch_code:='HB-'||LPAD(NEW.id::text,GREATEST(6,LENGTH(NEW.id::text)),'0'); END IF;
  IF NEW.harvest_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date THEN RAISE EXCEPTION 'Harvest date cannot be in the future'; END IF;
  IF TG_OP='UPDATE' AND OLD.harvest_date IS NOT NULL AND NEW.harvest_date IS DISTINCT FROM OLD.harvest_date THEN
    RAISE EXCEPTION 'A verified harvest date cannot be changed to reset shelf life'; END IF;
  NEW.updated_at:=NOW(); RETURN NEW;
END $$;
CREATE TRIGGER harvest_validate BEFORE INSERT OR UPDATE ON harvest_batches FOR EACH ROW EXECUTE FUNCTION harvest_validate_batch();
CREATE OR REPLACE FUNCTION harvest_order_sellable(order_key BIGINT) RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM order_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN harvest_batches b ON b.id=oi.batch_id
  WHERE oi.order_id=order_key AND p.inventory_type='edible' AND
   CASE WHEN oi.batch_id IS NOT NULL THEN NOT harvest_batch_sellable(b)
   ELSE NOT EXISTS(SELECT 1 FROM harvest_batches legacy WHERE legacy.product_id=oi.product_id AND legacy.legacy_import AND harvest_batch_sellable(legacy)) END);
$$;
-- Suppress only derived aggregate cache writes; actual batch events are audited separately.
DO $$ DECLARE definition TEXT; BEGIN
  definition:=pg_get_functiondef('inventory_record_movement()'::regprocedure);
  definition:=replace(definition,'IF TG_OP = ''UPDATE'' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;',
    'IF current_setting(''inventory.skip_audit'',true)=''true'' THEN RETURN NEW; END IF; IF TG_OP = ''UPDATE'' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;');
  EXECUTE definition;
END $$;
