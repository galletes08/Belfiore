-- Preserve future checkout tags. Historical tags cannot safely be reconstructed.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_tag TEXT;
