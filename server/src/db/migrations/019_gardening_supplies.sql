ALTER TABLE products ADD COLUMN IF NOT EXISTS supply_stock_model TEXT NOT NULL DEFAULT 'unconfigured'
 CHECK(supply_stock_model IN ('unconfigured','prepacked','shared'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS supply_catalog_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS supply_catalog_parent_unique ON products(supply_catalog_key) WHERE supply_catalog_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS supply_stock_pools (
 id BIGSERIAL PRIMARY KEY,product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 unit TEXT NOT NULL,stock INTEGER CHECK(stock>=0),reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK(reserved_stock>=0)
);
CREATE TABLE IF NOT EXISTS supply_variants (
 id BIGSERIAL PRIMARY KEY,product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 name TEXT NOT NULL,sku TEXT NOT NULL,catalog_key TEXT UNIQUE,price NUMERIC(12,2) NOT NULL CHECK(price>=0),
 selling_unit TEXT NOT NULL CHECK(selling_unit IN ('Pack','Bag','Set')),
 pieces_per_unit INTEGER CHECK(pieces_per_unit>0),weight_kg NUMERIC(9,3) CHECK(weight_kg>0),
 pool_id BIGINT REFERENCES supply_stock_pools(id) ON DELETE RESTRICT,stock_factor INTEGER NOT NULL DEFAULT 1 CHECK(stock_factor>0),
 low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK(low_stock_threshold>=0),image_url TEXT,
 archived_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS supply_sku_unique ON supply_variants(LOWER(BTRIM(sku)));
CREATE UNIQUE INDEX IF NOT EXISTS supply_name_unique ON supply_variants(product_id,LOWER(BTRIM(name)));
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES supply_variants(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS variant_name TEXT,ADD COLUMN IF NOT EXISTS variant_sku TEXT,
 ADD COLUMN IF NOT EXISTS selling_unit TEXT,ADD COLUMN IF NOT EXISTS pieces_per_unit INTEGER,
 ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(9,3),ADD COLUMN IF NOT EXISTS stock_pool_id BIGINT REFERENCES supply_stock_pools(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS stock_factor INTEGER;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES supply_variants(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS variant_name TEXT,ADD COLUMN IF NOT EXISTS stock_unit TEXT;
CREATE TABLE IF NOT EXISTS supply_stock_requests (
 request_key TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,response JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Extend only the accepted type list. Retain every existing succulent safeguard verbatim.
DO $$ DECLARE definition TEXT; BEGIN
 SELECT pg_get_functiondef('inventory_validate_product()'::regprocedure) INTO definition;
 IF position('GARDENING_SUPPLY' IN definition)=0 THEN
  definition:=replace(definition,'''succulent'', ''edible''','''succulent'', ''edible'', ''GARDENING_SUPPLY''');
  IF position('GARDENING_SUPPLY' IN definition)=0 THEN RAISE EXCEPTION 'Inventory validation extension requires review'; END IF;
  EXECUTE definition;
 END IF;
END $$;
