-- Additive transition. Existing batch/order/audit records are never rewritten.
ALTER TABLE products ADD COLUMN IF NOT EXISTS lettuce_stock_model TEXT NOT NULL DEFAULT 'batch' CHECK(lettuce_stock_model IN ('batch','quantity'));
ALTER TABLE products ALTER COLUMN lettuce_stock_model SET DEFAULT 'quantity';
CREATE TABLE IF NOT EXISTS lettuce_balance_transitions (
 product_id BIGINT PRIMARY KEY REFERENCES products(id),status TEXT NOT NULL,
 available_packs INTEGER,reason TEXT NOT NULL,before_product JSONB NOT NULL,before_batches JSONB NOT NULL,
 migrated_at TIMESTAMPTZ,checked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION reconcile_lettuce_quantity() RETURNS SETOF lettuce_balance_transitions LANGUAGE plpgsql AS $$
DECLARE p products; free_packs INTEGER; held_packs INTEGER; reserved_packs INTEGER; problems TEXT; snapshot JSONB;
BEGIN
 PERFORM pg_advisory_xact_lock(71600420);
 FOR p IN SELECT * FROM products WHERE inventory_type='edible' ORDER BY id FOR UPDATE LOOP
  IF p.lettuce_stock_model='quantity' THEN CONTINUE; END IF;
  PERFORM id FROM harvest_batches WHERE product_id=p.id ORDER BY id FOR UPDATE;
  SELECT COALESCE(SUM(b.stock) FILTER(WHERE harvest_batch_sellable(b)),0),
   COALESCE(SUM(b.stock) FILTER(WHERE NOT harvest_batch_sellable(b)),0),COALESCE(SUM(b.reserved_stock),0),
   COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.id),'[]') INTO free_packs,held_packs,reserved_packs,snapshot FROM harvest_batches b WHERE b.product_id=p.id;
  problems:='';
  IF held_packs>0 THEN problems:=problems||'Held, unverified or unusable physical stock requires reconciliation. '; END IF;
  IF reserved_packs>0 OR p.reserved_stock>0 OR EXISTS(SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.inventory_restored_at IS NULL AND o.inventory_state IN ('reserved','committed','legacy') AND o.status NOT IN ('Cancelled','Delivered')) THEN problems:=problems||'Active order commitments must finish or be explicitly reconciled first. '; END IF;
  IF p.stock<>free_packs THEN problems:=problems||'Product cache differs from verified batch stock. '; END IF;
  IF EXISTS(SELECT 1 FROM harvest_batches b WHERE b.product_id=p.id AND b.stock>0 AND b.price<>p.price) THEN problems:=problems||'Active manual batch price differs from product price; administrator review required. '; END IF;
  INSERT INTO lettuce_balance_transitions(product_id,status,available_packs,reason,before_product,before_batches,migrated_at)
   VALUES(p.id,CASE WHEN problems='' THEN 'migrated' ELSE 'blocked' END,free_packs,CASE WHEN problems='' THEN 'Verified free packs transferred to product accounting; batch records retained as history.' ELSE problems END,to_jsonb(p),snapshot,CASE WHEN problems='' THEN clock_timestamp() ELSE NULL END)
   ON CONFLICT(product_id) DO UPDATE SET status=EXCLUDED.status,available_packs=EXCLUDED.available_packs,reason=EXCLUDED.reason,before_product=EXCLUDED.before_product,before_batches=EXCLUDED.before_batches,migrated_at=EXCLUDED.migrated_at,checked_at=clock_timestamp() WHERE lettuce_balance_transitions.status<>'migrated';
  IF problems='' THEN
   PERFORM set_config('inventory.action','Initial Balance Migration',true);
   PERFORM set_config('inventory.reason','Verified free lettuce balance; no physical stock added or removed. Historical batches retained.',true);
   PERFORM set_config('inventory.actor','Lettuce quantity migration',true);
   UPDATE products SET lettuce_stock_model='quantity' WHERE id=p.id;
  END IF;
 END LOOP;
 RETURN QUERY SELECT * FROM lettuce_balance_transitions ORDER BY product_id;
END $$;
CREATE OR REPLACE FUNCTION harvest_order_sellable(order_key BIGINT) RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM order_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN harvest_batches b ON b.id=oi.batch_id
 WHERE oi.order_id=order_key AND p.inventory_type='edible' AND
 CASE WHEN oi.batch_id IS NOT NULL THEN NOT harvest_batch_sellable(b)
 WHEN p.lettuce_stock_model='quantity' THEN FALSE
 ELSE NOT EXISTS(SELECT 1 FROM harvest_batches legacy WHERE legacy.product_id=oi.product_id AND legacy.legacy_import AND harvest_batch_sellable(legacy)) END);
$$;
