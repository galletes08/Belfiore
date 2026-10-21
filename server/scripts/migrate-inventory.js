import fs from 'node:fs/promises';
import { pool } from '../src/config/db.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(71600401)');
  await client.query('CREATE TABLE IF NOT EXISTS inventory_schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for (const name of ['001_inventory', '002_product_uploads', '003_adjustment_notes', '004_harvest_batches', '005_order_item_tag', '006_order_notifications', '007_manual_delivery_history', '008_courier_tracking_cache', '009_customer_account_activity', '010_customer_profile_addresses','011_staff_auth_security','012_auth_email_settings','013_rider_username_recovery','014_rider_management','015_rider_security_lock','016_admin_auth_security','017_checkout_receipts','018_customer_verification','019_gardening_supplies']) {
    const existing = await client.query('SELECT name FROM inventory_schema_migrations WHERE name = $1', [name]);
    if (!existing.rows.length) {
      await client.query(await fs.readFile(new URL(`../src/db/migrations/${name}.sql`, import.meta.url), 'utf8'));
      await client.query('INSERT INTO inventory_schema_migrations(name) VALUES ($1)', [name]);
    }
  }
  await client.query('COMMIT');
  console.log('Inventory migration ready. Existing prices and quantities preserved.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
