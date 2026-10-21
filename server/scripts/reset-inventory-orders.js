import fs from 'node:fs/promises';
import { pool } from '../src/config/db.js';

if (!process.argv.includes('--confirm-all')) {
  console.error('Explicit --confirm-all is required to clear all inventory and orders.');
  await pool.end();
  process.exit(1);
}
const tables = ['orders', 'products', 'order_items', 'inventory_movements', 'inventory_reservations', 'inventory_product_requests', 'order_rider_assignments'];
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='15s'");
  await client.query(`LOCK TABLE ${tables.join(', ')} IN ACCESS EXCLUSIVE MODE`);
  const backup = { createdAt: new Date().toISOString(), tables: {} };
  for (const table of tables) backup.tables[table] = (await client.query(`SELECT * FROM ${table}`)).rows;
  backup.tables.rider_locations = (await client.query('SELECT * FROM rider_locations WHERE order_id IS NOT NULL')).rows;
  const directory = new URL('../backups/', import.meta.url);
  await fs.mkdir(directory, { recursive: true });
  const filename = `inventory-orders-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await fs.writeFile(new URL(filename, directory), JSON.stringify(backup, null, 2), { flag: 'wx' });
  // Do not reuse IDs: older external checkout sessions must never point to new test orders.
  for (const table of ['inventory_movements', 'inventory_reservations', 'inventory_product_requests', 'order_items', 'order_rider_assignments', 'orders', 'products']) {
    await client.query(`DELETE FROM ${table}`);
  }
  const counts = (await client.query(`SELECT (SELECT COUNT(*)::int FROM products) AS products,
    (SELECT COUNT(*)::int FROM orders) AS orders, (SELECT COUNT(*)::int FROM inventory_movements) AS inventory_history`)).rows[0];
  if (Object.values(counts).some(value => value !== 0)) throw new Error('Reset verification failed');
  await client.query('COMMIT');
  console.log(JSON.stringify({ cleared: counts, backup: `server/backups/${filename}`, removedProducts: backup.tables.products.length, removedOrders: backup.tables.orders.length }));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
