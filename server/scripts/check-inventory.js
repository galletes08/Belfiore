import { pool } from '../src/config/db.js';

try {
  const result = await pool.query(`SELECT current_schema() AS schema,
    to_regprocedure('inventory_product_status(products)') IS NOT NULL AS status_function,
    to_regclass('inventory_schema_migrations') IS NOT NULL AS migration_ledger,
    to_regclass('inventory_reservations') IS NOT NULL AS reservations,
    to_regclass('inventory_movements') IS NOT NULL AS movements,
    to_regclass('inventory_product_requests') IS NOT NULL AS retry_protection,
    to_regclass('harvest_batches') IS NOT NULL AS harvest_batches,
    to_regprocedure('harvest_order_sellable(bigint)') IS NOT NULL AS harvest_order_validation`);
  console.log(JSON.stringify(result.rows[0]));
  const columns = await pool.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='products'
    AND column_name IN ('inventory_type','reserved_stock','product_code') ORDER BY column_name`);
  console.log('Inventory columns:', columns.rows.map(row => row.column_name).join(', ') || 'missing');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await pool.end(); }
