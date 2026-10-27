import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { verifyPayMongoWebhookSignature } from '../src/utils/paymongo.js';
import { reservationMinutes } from '../src/utils/inventory.js';
import { displayProductName, newInventoryForm, matchesInventoryFilter } from '../../src/utils/inventory.js';

test('Webhook signatures fail closed, reject tampering and expired signatures', () => {
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_inventory';
  process.env.PAYMONGO_WEBHOOK_SECRET = 'inventory_test_secret';
  const raw = '{"event":"test"}';
  const sign = timestamp => `t=${timestamp},te=${crypto.createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex')}`;
  const now = Math.floor(Date.now() / 1000);
  assert.equal(verifyPayMongoWebhookSignature(raw, sign(now)), true);
  assert.equal(verifyPayMongoWebhookSignature(raw + ' ', sign(now)), false);
  assert.equal(verifyPayMongoWebhookSignature(raw, sign(now - 301)), false);
  process.env.PAYMONGO_WEBHOOK_SECRET = '';
  assert.equal(verifyPayMongoWebhookSignature(raw, sign(now)), false);
});
test('Reservation duration is configurable with a safe default', () => {
  process.env.INVENTORY_RESERVATION_MINUTES = 'invalid';
  assert.equal(reservationMinutes(), 15);
  process.env.INVENTORY_RESERVATION_MINUTES = '20';
  assert.equal(reservationMinutes(), 20);
  process.env.INVENTORY_RESERVATION_MINUTES = '15';
});
test('Naming defaults are editable and display codes only for individual plants', () => {
  const form = newInventoryForm();
  assert.equal(form.name, 'Aloe Hybrid');
  form.name = 'Haworthia';
  assert.equal(form.name, 'Haworthia');
  assert.equal(newInventoryForm('edible').name, '');
  const plant = { name: 'Existing sad', productCode: 'BF-000055', inventoryType: 'succulent' };
  assert.equal(displayProductName(plant), 'Existing sad — BF-000055');
  assert.equal(plant.name, 'Existing sad');
  assert.equal(displayProductName({ name: 'Crystal Lettuce (Lalique)', productCode: 'BF-000056', inventoryType: 'edible' }), 'Crystal Lettuce (Lalique)');
});
test('Summary filters separate archived and reserved plants from active zero-stock records', () => {
  assert.equal(matchesInventoryFilter({ stock: 0, status: 'Reserved' }, 'Out of Stock'), false);
  assert.equal(matchesInventoryFilter({ inventoryType: 'succulent', stock: 0, status: 'Sold' }, 'Out of Stock'), false);
  assert.equal(matchesInventoryFilter({ archivedAt: '2026-10-13', stock: 0, status: 'Archived' }, 'All Products'), false);
  assert.equal(matchesInventoryFilter({ archivedAt: '2026-10-13', stock: 0, status: 'Archived' }, 'Archived'), true);
});

test('PostgreSQL inventory and existing order integration', { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async t => {
  // Never fall back to DATABASE_URL: only an explicitly selected test database is used.
  const schema = `inventory_test_${crypto.randomBytes(6).toString('hex')}`;
  process.env.DATABASE_URL = process.env.INVENTORY_TEST_DATABASE_URL;
  process.env.PGOPTIONS = `-c search_path=${schema},public`;
  process.env.JWT_SECRET = 'inventory-test-jwt-secret';
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_inventory';
  process.env.PAYMONGO_WEBHOOK_SECRET = 'inventory_test_secret';
  process.env.PAYMONGO_FRONTEND_URL = 'http://localhost:5173';
  process.env.STORAGE_DRIVER = 'local';
  process.env.TRACK123_ENABLED = 'false';
  const { pool } = await import('../src/config/db.js');
  const { default: express } = await import('express');
  const { default: jwt } = await import('jsonwebtoken');
  const { reserveOrderInventory, expireReservations } = await import('../src/utils/inventory.js');
  let server;
  const createdImageUrls = new Set();
  const originalFetch = globalThis.fetch;
  let session = 0;
  const sessionPayments = new Map();
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.paymongo.com/')) {
      if (options?.method === 'POST') {
        const id = `cs_test_${++session}`;
        return Response.json({ data: { id, attributes: { checkout_url: 'https://checkout.paymongo.com/' + id, payment_intent: { id: `pi_${id}` } } } });
      }
      const id = String(url).split('/').at(-1);
      return Response.json({ data: { id, attributes: { payments: sessionPayments.get(id) || [] } } });
    }
    return originalFetch(url, options);
  };
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(await fs.readFile(new URL('../src/db/schema.sql', import.meta.url), 'utf8'));
    // Verify migration preservation against real legacy fixtures.
    await pool.query(`INSERT INTO products(name,tag,stock,price,category) VALUES
      ('Legacy grouped plants','Green',7,555,'Aloe Hybrids'),('Legacy lettuce','aquaponics',12,199,'Aquaponics')`);
    const legacyAllocated = (await pool.query("INSERT INTO products(name,tag,stock,price,category) VALUES('Legacy allocated plants','Green',1,222,'Aloe Hybrids') RETURNING id")).rows[0];
    const legacyOrder = (await pool.query("INSERT INTO orders(customer_name,gmail) VALUES('Legacy Test','inventory-test@gmail.com') RETURNING id")).rows[0];
    await pool.query("INSERT INTO order_items(order_id,product_id,product_name,qty,unit_price,line_total) VALUES($1,$2,'Legacy allocated plants',2,222,444)", [legacyOrder.id, legacyAllocated.id]);
    await pool.query(await fs.readFile(new URL('../src/db/migrations/001_inventory.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/002_product_uploads.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/003_adjustment_notes.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/004_harvest_batches.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/005_order_item_tag.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/006_order_notifications.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/007_manual_delivery_history.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/008_courier_tracking_cache.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/009_customer_account_activity.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/010_customer_profile_addresses.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/011_staff_auth_security.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/012_auth_email_settings.sql', import.meta.url), 'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/013_rider_username_recovery.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/014_rider_management.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/015_rider_security_lock.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/016_admin_auth_security.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/017_checkout_receipts.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/018_customer_verification.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/019_gardening_supplies.sql',import.meta.url),'utf8'));
    await pool.query("INSERT INTO users(id,first_name,last_name,email,role,status) VALUES(123,'Inventory','Test','inventory-test@gmail.com','customer','active')");
    await pool.query("INSERT INTO users(id,first_name,last_name,email,role,status) VALUES(321,'Other','Customer','other@example.com','customer','active')");
    await pool.query("INSERT INTO users(id,email,role,status) VALUES(124,'staff-test@example.com','admin','active'),(125,'rider-test@example.com','rider','active'),(126,'second-admin@example.com','admin','active')");
    const app = express();
    const { handlePayMongoWebhook } = await import('../src/routes/paymongo.js');
    app.post('/api/paymongo/webhook', express.raw({ type: 'application/json' }), handlePayMongoWebhook);
    app.use('/api/customer/account',express.json({limit:'2mb'}));
    app.use(express.json());
    const {rejectDisabledCustomer}=await import('../src/utils/auth.js');
    app.use(rejectDisabledCustomer);
    app.use('/uploads', express.static(new URL('../uploads/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')));
    for (const route of ['products', 'orders', 'dashboard', 'logs', 'notifications', 'customers', 'customer-account', 'auth', 'reports', 'riders']) {
      app.use((await import(`../src/routes/${route}.js`)).default);
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = role => jwt.sign({ role, email: 'inventory-test@gmail.com', userId: role==='admin'?124:role==='rider'?125:123 }, process.env.JWT_SECRET);
    async function request(path, method = 'GET', body, role = 'admin') {
      if(path.endsWith('/adjust')&&body&&!body.batchId&&path.startsWith('/api/admin/inventory/')) {
        const productId=Number(path.split('/')[4]);
        const b=(await pool.query('SELECT id FROM harvest_batches WHERE product_id=$1 ORDER BY harvest_date NULLS LAST,id LIMIT 1',[productId])).rows[0];
        if(b) body={...body,batchId:Number(b.id)};
      }
      const res = await originalFetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(role)}`, ...(path.endsWith('/adjust') ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }
    let createCounter=0;
    const businessToday=(await pool.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::text AS date")).rows[0].date;
    async function create(type = 'succulent', stock = 1, extra = {}) {
      const result = await request('/api/products', 'POST', { inventoryType: type, name: `Test ${type} ${++createCounter}`, tag: 'Green', stock, price: 130, harvestDate:businessToday,...extra });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      return result.body;
    }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz0AAAAASUVORK5CYII=', 'base64');
    function imageForm(count, overrides = {}) {
      const form = new FormData();
      for (const [key, value] of Object.entries({ inventoryType: 'succulent', category: 'Aloe Hybrids', name: 'Aloe Hybrid', tag: 'Green', price: 1200, stock: 1, ...overrides })) form.append(key, value);
      for (let i = 0; i < count; i++) form.append(count === 1 ? 'image' : 'images', new Blob([png], { type: 'image/png' }), `inventory-test-${i}.png`);
      return form;
    }
    async function upload(form, count, key = crypto.randomUUID(), prefix = '') {
      const response = await originalFetch(base + prefix + (count > 1 ? '/api/products/bulk' : '/api/products'), {
        method: 'POST', headers: { Authorization: `Bearer ${token('admin')}`, 'Idempotency-Key': key }, body: form });
      const body = await response.json();
      if (!prefix && response.ok) {
        for (const p of body.products || [body]) if (p.imageUrl) createdImageUrls.add(p.imageUrl);
      }
      return { status: response.status, body, replayed: response.headers.get('Idempotency-Replayed') };
    }
    async function checkout(product, qty = 1, method = 'ONLINE') {
      return request('/api/orders', 'POST', { fullName: 'Inventory Test', gmail: 'inventory-test@gmail.com', mobileNumber: '09123456789',
        location: 'Test address', country: 'Philippines', province: 'Laguna', city: 'Calamba', barangay: 'Test', postalCode: '4027',
        paymentMethod: method, items: [{ id: product.id, qty,batchId:product.inventoryType==='edible'?product.batches?.[0]?.id:undefined,expectedUnitPrice:product.inventoryType==='edible'?product.batches?.[0]?.price:undefined }] }, 'customer');
    }
    const productRow = async id => (await pool.query('SELECT *, inventory_product_status(products) AS state FROM products WHERE id=$1', [id])).rows[0];
    const orderRow = async id => (await pool.query('SELECT * FROM orders WHERE id=$1', [id])).rows[0];
    async function webhook(order, eventId, eventType = 'checkout_session.payment.paid') {
      const row = await orderRow(order.id);
      const payment = { id: `pay_${order.id}`, attributes: { status: 'paid',amount:Math.round(Number(row.total_amount)*100),currency:'PHP', paid_at: Math.floor(Date.now() / 1000), payment_intent_id: row.paymongo_payment_intent_id } };
      const resource = eventType === 'payment.failed' ? { attributes: { payment_intent_id: row.paymongo_payment_intent_id } }
        : { id: row.paymongo_checkout_session_id, attributes: { payments: [payment] } };
      const raw = JSON.stringify({ data: { id: eventId, attributes: { type: eventType, data: resource } } });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto.createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
      const res = await originalFetch(base + '/api/paymongo/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': `t=${timestamp},te=${signature}` }, body: raw });
      assert.equal(res.status, 200, await res.text());
    }
    await t.test('Migration preserves prices and stock, quarantines legacy grouped succulents', async () => {
      const legacy = (await pool.query("SELECT * FROM products WHERE name LIKE 'Legacy%' ORDER BY id")).rows;
      assert.equal(legacy[0].stock, 7); assert.equal(Number(legacy[0].price), 555); assert.equal(legacy[0].legacy_quantity_review, true);
      assert.equal(legacy[1].stock, 0); assert.equal(Number(legacy[1].price), 199); assert.equal(legacy[1].pack_grams, 400);
      const preserved=(await pool.query('SELECT * FROM harvest_batches WHERE product_id=$1',[legacy[1].id])).rows[0];
      assert.equal(preserved.stock,12);assert.equal(preserved.harvest_date,null);assert.equal(preserved.condition,'Unverified');
    });
    await t.test('Legacy grouped order cancellation preserves old allocations without enabling grouped checkout', async () => {
      assert.equal((await productRow(legacyAllocated.id)).legacy_quantity_review, true);
      const cancelled = await request(`/api/orders/${legacyOrder.id}/cancel`, 'POST', { reason: 'Legacy cancellation' }, 'customer');
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      assert.equal((await productRow(legacyAllocated.id)).stock, 3);
      assert.equal((await productRow(legacyAllocated.id)).state, 'Unavailable');
      assert.equal((await request('/api/products')).body.some(p => p.id === legacyAllocated.id), false);
    });
    await t.test('Generated codes remain unique beyond six-digit product IDs', async () => {
      const a = (await pool.query("INSERT INTO products(id,name,stock) VALUES(1000000,'Large ID plant',1) RETURNING product_code")).rows[0];
      const b = (await pool.query("INSERT INTO products(id,name,stock) VALUES(1000001,'Other large ID plant',1) RETURNING product_code")).rows[0];
      assert.equal(a.product_code, 'BF-1000000'); assert.notEqual(a.product_code, b.product_code);
    });
    await t.test('Creates distinct succulent records with unique codes and one plant each', async () => {
      const a = await create(); const b = await create();
      assert.notEqual(a.productCode, b.productCode); assert.equal(a.stock, 1); assert.equal(a.status, 'Available');
    });
    await t.test('One image creates one plant, preserves the editable name and serves its actual image', async () => {
      const result = await upload(imageForm(1, { name: 'Haworthia' }), 1);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal(result.body.name, 'Haworthia'); assert.equal(result.body.stock, 1);
      const image = await originalFetch(base + result.body.imageUrl);
      assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /image\/png/);
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    });
    await t.test('Ten simultaneous images create ten independent plants; retry replays without duplicates', async () => {
      const before = (await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n;
      const key = crypto.randomUUID();
      const result = await upload(imageForm(10), 10, key);
      assert.equal(result.status, 201, JSON.stringify(result.body)); assert.equal(result.body.count, 10);
      const products = result.body.products;
      assert.equal(new Set(products.map(p => p.productCode)).size, 10);
      assert.equal(new Set(products.map(p => p.imageUrl)).size, 10);
      assert.ok(products.every(p => p.stock === 1 && p.name === 'Aloe Hybrid' && p.tag === 'Green' && p.price === 1200));
      for (const product of products) assert.equal((await originalFetch(base + product.imageUrl)).status, 200);
      const retry = await upload(imageForm(10), 10, key);
      assert.equal(retry.status, 200); assert.equal(retry.replayed, 'true'); assert.deepEqual(retry.body, result.body);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n, before + 10);
      const wrongRetry = await upload(imageForm(10, { price: 999 }), 10, key);
      assert.equal(wrongRetry.status, 409);
    });
    await t.test('Concurrent retry requests produce one batch, even before either returns', async () => {
      const key = crypto.randomUUID();
      const before = (await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n;
      const results = await Promise.all([upload(imageForm(10), 10, key), upload(imageForm(10), 10, key)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
      assert.deepEqual(results[0].body.products.map(p => p.id), results[1].body.products.map(p => p.id));
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n, before + 10);
    });
    await t.test('Missing required information and non-image uploads create no incomplete records', async () => {
      const before = (await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n;
      assert.equal((await upload(imageForm(10, { price: '' }), 10)).status, 400);
      assert.equal((await upload(imageForm(10, { name: '' }), 10)).status, 400);
      const invalid = imageForm(10);
      invalid.append('images', new Blob(['not image'], { type: 'text/plain' }), 'invalid.txt');
      const result = await upload(invalid, 10);
      assert.equal(result.status, 400); assert.match(result.body.error, /No products were created/);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n, before);
    });
    await t.test('A storage failure identifies the failed image and rolls back the entire batch and audit', async () => {
      const { registerInventoryRoutes } = await import('../src/routes/inventory-products.js');
      const { default: multer } = await import('multer');
      const router = express.Router();
      registerInventoryRoutes(router, { upload: multer({ storage: multer.memoryStorage() }), ensureTypeId: async () => null,
        mapProductRow: row => row, removeUploadedFiles: () => {}, storeImage: async file => {
          if (file.originalname === 'inventory-test-1.png') throw new Error('Injected storage outage');
          return '/uploads/test-storage.png';
        } });
      app.use('/fault-test', router);
      const before = (await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n;
      const historyBefore = (await pool.query('SELECT COUNT(*)::int AS n FROM inventory_movements')).rows[0].n;
      const result = await upload(imageForm(10), 10, crypto.randomUUID(), '/fault-test');
      assert.equal(result.status, 502); assert.match(result.body.error, /inventory-test-1.png/); assert.match(result.body.error, /No products were created/);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n, before);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM inventory_movements')).rows[0].n, historyBefore);
    });
    await t.test('Existing product codes, names and lettuce prices are not automatically changed', async () => {
      const rows = (await pool.query("SELECT name,price,stock,product_code FROM products WHERE name LIKE 'Legacy%' ORDER BY id")).rows;
      assert.equal(rows[0].name, 'Legacy grouped plants'); assert.equal(Number(rows[0].price), 555);
      assert.equal(rows[1].name, 'Legacy lettuce'); assert.equal(Number(rows[1].price), 199); assert.equal(rows[1].stock, 0);
      assert.equal(rows[0].product_code, 'BF-000001'); assert.equal(rows[1].product_code, 'BF-000002');
    });
    await t.test('Rejects succulent quantity greater than one through API and database', async () => {
      assert.equal((await request('/api/products', 'POST', { inventoryType: 'succulent', name: 'Invalid', tag: 'Green', price: 130, stock: 2 })).status, 400);
      await assert.rejects(pool.query("INSERT INTO products(name,stock,price) VALUES('Invalid',2,130)"), /individual plant/);
    });
    await t.test('Duplicate product codes are rejected', async () => {
      await create('succulent', 1, { productCode: 'UNIQUE-TEST' });
      assert.equal((await request('/api/products', 'POST', { name: 'Duplicate', tag: 'Green', stock: 1, price: 130, productCode: 'unique-test' })).status, 409);
    });
    await t.test('Lettuce packs, thresholds, stock in/out and audit quantities', async () => {
      const p = await create('edible', 8, { lowStockThreshold: 3 });
      assert.equal(p.packGrams, 400);
      assert.equal((await request(`/api/admin/inventory/${p.id}/adjust`, 'POST', { direction: 'in', quantity: 4, reason: 'Harvest' })).body.stock, 12);
      assert.equal((await request(`/api/admin/inventory/${p.id}/adjust`, 'POST', { direction: 'out', quantity: 9, reason: 'Damage' })).body.status, 'Low Stock');
      assert.equal((await request(`/api/admin/inventory/${p.id}/adjust`, 'POST', { direction: 'out', quantity: 4, reason: 'Too many' })).status, 409);
      const history = (await request(`/api/admin/inventory/history?productId=${p.id}`)).body.entries;
      assert.equal(history[0].action, 'Stock Out'); assert.equal(history[0].previous_quantity, 12); assert.equal(history[0].new_quantity, 3);
      assert.match(history[0].actor, /Admin/); assert.equal(history[0].reason, 'Damage');
    });
    await t.test('Inventory APIs require administrator authentication', async () => {
      assert.equal((await request('/api/admin/inventory', 'GET', undefined, 'customer')).status, 403);
      assert.equal((await originalFetch(base + '/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    });
    await t.test('Reserves last succulent and prevents editing from restocking it', async () => {
      const p = await create(); const order = await checkout(p); assert.equal(order.status, 201, JSON.stringify(order.body));
      assert.equal((await productRow(p.id)).state, 'Reserved');
      assert.equal((await request(`/api/products/${p.id}`, 'PATCH', { price: 140 })).status, 200);
      assert.equal((await productRow(p.id)).stock, 0);
      assert.equal((await request(`/api/products/${p.id}`, 'PATCH', { stock: 1 })).status, 400);
      assert.equal((await request(`/api/admin/inventory/${p.id}/archive`, 'POST', { reasonType: 'Temporarily Unavailable', reason: 'Temporarily Unavailable' })).status, 409);
      assert.equal((await request(`/api/admin/orders/${order.body.id}/confirm`, 'POST', {})).status, 409);
    });
    await t.test('Two customers cannot reserve the last succulent simultaneously', async () => {
      const p = await create(); const results = await Promise.all([checkout(p), checkout(p)]);
      assert.equal(results.filter(r => r.status === 201).length, 1);
      assert.equal((await productRow(p.id)).reserved_stock, 1);
    });
    await t.test('Two customers cannot reserve the final lettuce packs simultaneously', async () => {
      const p = await create('edible', 2); const results = await Promise.all([checkout(p, 2), checkout(p, 2)]);
      assert.equal(results.filter(r => r.status === 201).length, 1);
      assert.equal((await productRow(p.id)).stock, 0); assert.equal((await productRow(p.id)).reserved_stock, 2);
    });
    await t.test('Backend refuses multi-quantity succulent orders and excessive packs', async () => {
      assert.equal((await checkout(await create(), 2)).status, 409);
      assert.equal((await checkout(await create('edible', 2), 3)).status, 409);
    });
    await t.test('Paid webhook commits stock once, repeated event and repeated payment are harmless', async () => {
      const p = await create(); const order = (await checkout(p)).body;
      await webhook(order, 'evt_paid_once'); await webhook(order, 'evt_paid_once'); await webhook(order, 'evt_same_payment_new_event');
      const row = await productRow(p.id); assert.equal(row.state, 'Sold'); assert.equal(row.stock, 0); assert.equal(row.reserved_stock, 0);
      assert.equal((await orderRow(order.id)).payment_status, 'Paid');
      assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM inventory_movements WHERE product_id=$1 AND action='Product Sold'", [p.id])).rows[0].n, 1);
      assert.equal((await request(`/api/admin/orders/${order.id}/confirm`, 'POST', {})).status, 200);
      const before = await productRow(p.id);
      assert.equal((await request(`/api/products/${p.id}`, 'PATCH', {status:'Available',stock:1,productCode:'RESELL',price:1})).status, 409);
      assert.equal((await request(`/api/products/${p.id}`, 'PATCH', {name:'Ordinary correction'})).status, 409);
      assert.deepEqual(await productRow(p.id), before);
      assert.equal((await orderRow(order.id)).payment_status, 'Paid');
      assert.equal((await checkout(p)).status, 409);
    });
    await t.test('Authenticated server verification uses the same inventory transition', async () => {
      const p = await create('edible', 5); const order = (await checkout(p, 2)).body;
      const row = await orderRow(order.id);
      sessionPayments.set(row.paymongo_checkout_session_id, [{ id: 'pay_verify', attributes: { status: 'paid',amount:Math.round(Number(row.total_amount)*100),currency:'PHP' } }]);
      assert.equal((await request(`/api/orders/${order.id}/payment/verify`, 'POST', {}, 'customer')).body.paymentStatus, 'Paid');
      assert.equal((await productRow(p.id)).stock, 3); assert.equal((await productRow(p.id)).reserved_stock, 0);
    });
    await t.test('Failed payment and repeated failure release reserved packs only once', async () => {
      const p = await create('edible', 4); const order = (await checkout(p, 3)).body;
      await webhook(order, 'evt_failure', 'payment.failed'); await webhook(order, 'evt_failure', 'payment.failed');
      assert.equal((await productRow(p.id)).stock, 4); assert.equal((await productRow(p.id)).reserved_stock, 0);
      assert.equal((await orderRow(order.id)).status, 'Cancelled');
    });
    await t.test('Stock Out cannot consume reserved packs and stock replenishment keeps reservations intact', async () => {
      const p = await create('edible', 4); await checkout(p, 3);
      assert.equal((await request(`/api/admin/inventory/${p.id}/adjust`, 'POST', { direction: 'out', quantity: 2, reason: 'Reserved stock protection' })).status, 409);
      assert.equal((await request(`/api/admin/inventory/${p.id}/adjust`, 'POST', { direction: 'in', quantity: 2, reason: 'New harvest' })).status, 200);
      assert.equal((await productRow(p.id)).stock, 3); assert.equal((await productRow(p.id)).reserved_stock, 3);
    });
    await t.test('Customer cancellation returns succulent availability, idempotently', async () => {
      const p = await create(); const order = (await checkout(p)).body;
      for (let i = 0; i < 2; i++) assert.equal((await request(`/api/orders/${order.id}/cancel`, 'POST', { reason: 'Cancelled checkout' }, 'customer')).status, 200);
      assert.equal((await productRow(p.id)).stock, 1); assert.equal((await productRow(p.id)).reserved_stock, 0);
    });
    await t.test('Server expiry releases inventory without a browser', async () => {
      const p = await create(); const order = (await checkout(p)).body;
      await pool.query("UPDATE inventory_reservations SET expires_at=NOW()-INTERVAL '1 minute' WHERE order_id=$1", [order.id]);
      assert.equal(await expireReservations(pool), 1); assert.equal(await expireReservations(pool), 0);
      assert.equal((await productRow(p.id)).state, 'Available'); assert.equal((await orderRow(order.id)).status, 'Cancelled');
    });
    await t.test('Late payment never steals a newly reserved plant and requires refund', async () => {
      const p = await create(); const oldOrder = (await checkout(p)).body;
      await pool.query("UPDATE inventory_reservations SET expires_at=NOW()-INTERVAL '1 minute' WHERE order_id=$1", [oldOrder.id]);
      await expireReservations(pool);
      const newOrder = (await checkout(p)).body;
      await webhook(oldOrder, 'evt_late');
      assert.equal((await orderRow(oldOrder.id)).payment_status, 'Refund Pending');
      assert.match((await orderRow(oldOrder.id)).inventory_reconciliation_reason, /refund/);
      assert.equal((await productRow(p.id)).reserved_stock, 1);
      assert.equal((await orderRow(newOrder.id)).inventory_state, 'reserved');
    });
    await t.test('Late confirmation before expiry sweep also releases and requires refund', async () => {
      const p = await create('edible', 2); const order = (await checkout(p, 2)).body;
      await pool.query("UPDATE inventory_reservations SET expires_at=NOW()-INTERVAL '1 minute' WHERE order_id=$1", [order.id]);
      await webhook(order, 'evt_late_unswept');
      assert.equal((await productRow(p.id)).stock, 2); assert.equal((await orderRow(order.id)).payment_status, 'Refund Pending');
    });
    await t.test('COD continues existing fulfillment and pre-shipment cancellation rules', async () => {
      const p = await create('edible', 5); const order = (await checkout(p, 2, 'COD')).body;
      assert.equal((await productRow(p.id)).stock, 3); assert.equal((await productRow(p.id)).reserved_stock, 0);
      assert.equal((await request(`/api/admin/orders/${order.id}/confirm`, 'POST', {})).status, 200);
      assert.equal((await request(`/api/orders/${order.id}/cancel`, 'POST', { reason: 'Changed mind' }, 'customer')).body.status, 'Cancellation Requested');
      assert.equal((await productRow(p.id)).stock, 3);
      await pool.query("UPDATE orders SET status='Out for Delivery' WHERE id=$1", [order.id]);
      assert.equal((await request(`/api/orders/${order.id}/cancel`, 'POST', { reason: 'Changed mind' }, 'customer')).status, 409);
      assert.equal((await productRow(p.id)).stock, 3);
    });
    await t.test('Rider proof delivery reaches admin reads and stale admin edits cannot regress it', async () => {
      const p=await create(); const order=(await checkout(p,1,'COD')).body;
      const driverToken=crypto.randomUUID();
      await pool.query("UPDATE orders SET status='Out for Delivery',tracking_status='Out for Delivery',driver_access_token=$2 WHERE id=$1",[order.id,driverToken]);
      const before=await productRow(p.id);
      const proof=new FormData();proof.append('markDelivered','true');proof.append('proof',new Blob([png],{type:'image/png'}),'delivery-test.png');
      const deliveredResponse=await originalFetch(`${base}/api/driver/orders/${driverToken}`,{method:'PATCH',body:proof});
      const delivered=await deliveredResponse.json();
      if(delivered.deliveryProofUrl)createdImageUrls.add(delivered.deliveryProofUrl);
      assert.equal(deliveredResponse.status,200,JSON.stringify(delivered));
      assert.equal(delivered.status,'Delivered');assert.equal(delivered.trackingStatus,'Delivered');
      const adminOrder=(await request('/api/admin/orders')).body.find(row=>row.id===Number(order.id));
      assert.equal(adminOrder.status,'Delivered');assert.equal(adminOrder.trackingStatus,'Delivered');
      const saved=await orderRow(order.id);
      for(const status of ['Pending','Preparing','Out for Delivery']) {
        assert.equal((await request(`/api/admin/orders/${order.id}`,'PATCH',{status,deliveryMode:'rider',trackingStatus:status})).status,409);
      }
      assert.equal((await request(`/api/admin/orders/${order.id}`,'PATCH',{status:'Delivered',deliveryMode:'rider',trackingStatus:'Out for Delivery'})).status,409);
      assert.deepEqual(await orderRow(order.id),saved);
      assert.deepEqual(await productRow(p.id),before);
    });
    await t.test('Archive hides products while retaining order lines and movement history', async () => {
      const p = await create(); const order = (await checkout(p, 1, 'COD')).body;
      await pool.query("UPDATE orders SET status='Delivered' WHERE id=$1", [order.id]);
      assert.equal((await request(`/api/admin/inventory/${p.id}/archive`, 'POST', { reasonType: 'No Longer for Sale', reason: 'No Longer for Sale' })).status, 200);
      assert.equal((await request('/api/products')).body.some(row => row.id === p.id), false);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM order_items WHERE order_id=$1', [order.id])).rows[0].n, 1);
      assert.equal((await request(`/api/admin/inventory/history?productId=${p.id}`)).body.entries[0].action, 'Product Archived');
    });
    await t.test('Reports use edible thresholds and separate plants from pack counts', async () => {
      const inventory = (await request('/api/admin/inventory')).body;
      const active = inventory.products.filter(p => !p.archivedAt);
      assert.equal(inventory.summary.ediblePacks, active.filter(p => p.inventoryType === 'edible').reduce((n, p) => n + p.stock, 0));
      assert.equal(inventory.summary.succulentUnits, active.filter(p => p.inventoryType === 'succulent' && !p.legacyQuantityReview).reduce((n, p) => n + p.stock, 0));
      assert.equal(inventory.summary.totalProducts, active.length);
      assert.equal(inventory.summary.lowStock, active.filter(p => p.inventoryType === 'edible' && p.stock > 0 && p.stock <= p.lowStockThreshold).length);
      assert.equal(inventory.summary.outOfStock, active.filter(p => p.stock === 0 && !['Reserved','Sold'].includes(p.status)).length);
      assert.ok(active.some(p => p.status === 'Sold'));
      const dashboard = (await request('/api/admin/dashboard')).body;
      assert.ok(Array.isArray(dashboard.lowStock)); assert.ok(dashboard.lowStock.every(p => p.unit === '400g packs' && p.qty <= p.threshold));
      const logs = (await request('/api/admin/logs')).body;
      assert.ok(logs.logs.some(entry => entry.event_type === 'inventory'));
    });
    await t.test('Multi-product checkout rolls back completely when one stock update fails', async () => {
      const a = await create(); const b = await create();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const order = (await client.query("INSERT INTO orders(customer_name) VALUES('Atomic Test') RETURNING id")).rows[0];
        await assert.rejects(reserveOrderInventory(client, order.id, [{ productId: Number(a.id), qty: 1 }, { productId: Number(b.id), qty: 2 }], true, 'Test'), /Stock changed/);
        await client.query('ROLLBACK');
        assert.equal((await productRow(a.id)).stock, 1); assert.equal((await productRow(b.id)).stock, 1);
      } finally { client.release(); }
    });
    await t.test('New order snapshots keep names and codes separate even after an administrator edits a plant', async () => {
      const p = await create('succulent', 1, { name: 'Aloe Hybrid' });
      const order = (await checkout(p, 1, 'COD')).body;
      await request(`/api/products/${p.id}`, 'PATCH', { name: 'Edited plant', productCode: 'EDITED-TEST-PLANT' });
      const snapshot = (await pool.query('SELECT product_name,product_code,inventory_type FROM order_items WHERE order_id=$1', [order.id])).rows[0];
      assert.equal(snapshot.product_name, 'Aloe Hybrid'); assert.equal(snapshot.product_code, p.productCode); assert.equal(snapshot.inventory_type, 'succulent');
      const orders = (await request('/api/admin/orders')).body;
      assert.equal(orders.find(o => o.id === order.id).items[0].productCode, p.productCode);
    });
    await t.test('History dates include Manila midnight and the complete end date, across activity types', async () => {
      const p = await create('edible', 5, { name: 'Date boundary fixture' });
      const stamps = [
        ['2024-05-09T15:59:59.999Z', 'Stock In'],
        ['2024-05-09T16:00:00.000Z', 'Stock In'],
        ['2024-05-10T15:59:59.999Z', 'Stock Out'],
        ['2024-05-10T16:00:00.000Z', 'Product Updated'],
        ['2024-05-11T15:59:59.999Z', 'Stock In'],
        ['2024-05-11T16:00:00.000Z', 'Stock Out'],
      ];
      for (const [stamp, action] of stamps) await pool.query(`INSERT INTO inventory_movements
        (product_id,product_code,product_name,action,new_quantity,new_reserved,new_status,reason,actor,created_at)
        VALUES($1,$2,$3,$4,5,0,'Available','Date test fixture','Test process',$5)`, [p.id, p.productCode, p.name, action, stamp]);
      const history = params => request('/api/admin/inventory/history?' + new URLSearchParams({ productId: p.id, ...params }));
      const day = (await history({ fromDate: '2024-05-10', toDate: '2024-05-10' })).body;
      assert.equal(day.total, 2);
      assert.deepEqual(day.entries.map(e => e.created_at), ['2024-05-10T15:59:59.999Z', '2024-05-09T16:00:00.000Z']);
      const range = (await history({ fromDate: '2024-05-10', toDate: '2024-05-11' })).body;
      assert.equal(range.total, 4); assert.equal(range.timeZone, 'Asia/Manila');
      const type = (await history({ fromDate: '2024-05-10', toDate: '2024-05-11', action: 'Stock In' })).body;
      assert.equal(type.total, 2); assert.ok(type.entries.every(e => e.action === 'Stock In'));
      assert.equal((await history({ toDate: '2024-05-10' })).body.total, 3);
      assert.equal((await history({ fromDate: '2024-05-11', toDate: '2024-05-11' })).body.total, 2);
      assert.equal((await history({ fromDate: '2024-01-01', toDate: '2024-01-01' })).body.total, 0);
      const unchanged = (await pool.query("SELECT created_at FROM inventory_movements WHERE product_id=$1 AND reason='Date test fixture' ORDER BY created_at", [p.id])).rows;
      assert.deepEqual(unchanged.map(e => e.created_at.toISOString()), stamps.map(([stamp]) => stamp));
    });
    await t.test('History date and activity filters paginate the full database result and reset independently', async () => {
      const p = await create('edible', 5, { name: 'History pagination fixture' });
      await pool.query(`INSERT INTO inventory_movements(product_id,product_code,product_name,action,new_quantity,new_reserved,new_status,reason,actor,created_at)
        SELECT $1,$2,$3,'Product Updated',5,0,'Available','Pagination date fixture','Test process',
          '2024-07-19 16:00:00+00'::timestamptz + n * INTERVAL '1 minute' FROM generate_series(0,54) n`, [p.id, p.productCode, p.name]);
      const params = { productId: p.id, fromDate: '2024-07-20', toDate: '2024-07-20', action: 'Product Updated', search: 'Pagination date fixture' };
      const first = (await request('/api/admin/inventory/history?' + new URLSearchParams(params))).body;
      const second = (await request('/api/admin/inventory/history?' + new URLSearchParams({ ...params, page: 2 }))).body;
      assert.equal(first.total, 55); assert.equal(first.entries.length, 50); assert.equal(second.entries.length, 5);
      assert.equal(new Set([...first.entries, ...second.entries].map(e => e.id)).size, 55);
      assert.equal((await request('/api/admin/inventory/history?' + new URLSearchParams({ ...params, action: 'Stock Out' }))).body.total, 0);
      assert.equal((await request('/api/admin/inventory/history?' + new URLSearchParams({ productId: p.id }))).body.total, 58);
      assert.ok(first.entries.every(e => e.product_code === p.productCode && e.actor === 'Test process'));
    });
    await t.test('History rejects invalid dates, reversed ranges, activities and pages', async () => {
      for (const params of [{ fromDate: '2024-02-30' }, { toDate: '10/13/2026' }, { fromDate: '2024-05-11', toDate: '2024-05-10' },
        { fromDate: '0000-01-01' }, { action: 'Unknown activity' }, { page: 0 }, { page: 1.5 }]) {
        assert.equal((await request('/api/admin/inventory/history?' + new URLSearchParams(params))).status, 400);
      }
    });
    await t.test('Backend timestamps new activities without accepting client timestamp edits', async () => {
      const before = Date.now();
      const p = await create('succulent', 1, { name: 'Timestamp fixture', created_at: '2000-01-01', createdAt: '2000-01-01' });
      const history = (await request(`/api/admin/inventory/history?productId=${p.id}`)).body;
      assert.equal(history.total, 1);
      const actual = Date.parse(history.entries[0].created_at);
      assert.ok(actual >= before - 1000 && actual <= Date.now());
      assert.equal((await request(`/api/admin/inventory/history/${history.entries[0].id}`, 'PATCH', { created_at: '2000-01-01' })).status, 404);
      assert.equal((await request(`/api/admin/inventory/history/${history.entries[0].id}`, 'DELETE')).status, 404);
      assert.equal((await request(`/api/admin/inventory/history?productId=${p.id}`)).body.entries[0].created_at, history.entries[0].created_at);
    });
    const archive = (p, reasonType = 'Temporarily Unavailable', reason = reasonType) => request(`/api/admin/inventory/${p.id}/archive`, 'POST', { reasonType, reason });
    const restore = (p, confirmSellable = true) => request(`/api/admin/inventory/${p.id}/restore`, 'POST', { reason: 'Physically inspected and verified sellable', confirmSellable });
    await t.test('Archive and restore plant preserve quantities and identity, require inspection, and audit once', async () => {
      const p = await create();
      const beforeSummary = (await request('/api/admin/inventory')).body.summary;
      const archived = await archive(p, 'Damaged Plant');
      assert.equal(archived.status, 200); assert.equal(archived.body.product.stock, 1);
      assert.equal((await request('/api/products')).body.some(row => row.id === p.id), false);
      const inventory = (await request('/api/admin/inventory')).body;
      assert.equal(inventory.summary.succulentUnits, beforeSummary.succulentUnits - 1);
      assert.equal(inventory.summary.totalProducts, beforeSummary.totalProducts - 1);
      const record = inventory.products.find(row => row.id === p.id);
      assert.equal(record.status, 'Archived'); assert.equal(matchesInventoryFilter(record, 'Archived'), true);
      assert.equal(record.archiveReason, 'Damaged Plant');
      assert.equal((await restore(p, false)).status, 400);
      const restored = await restore(p);
      assert.equal(restored.status, 200); assert.equal(restored.body.product.status, 'Available');
      assert.equal(restored.body.product.productCode, p.productCode); assert.equal(restored.body.product.price, p.price); assert.equal(restored.body.product.name, p.name);
      assert.equal((await restore(p)).status, 409);
      const history = (await request(`/api/admin/inventory/history?productId=${p.id}`)).body.entries;
      assert.equal(history.filter(e => e.action === 'Product Archived').length, 1);
      assert.equal(history.filter(e => e.action === 'Product Restored').length, 1);
      assert.equal(history[0].previous_status, 'Archived'); assert.equal(history[0].new_status, 'Available');
      assert.equal(history.find(e => e.action === 'Product Archived').reason, 'Damaged Plant'); assert.match(history[0].actor, /Admin/);
    });
    await t.test('Active COD commitments block archive, and sold plants cannot be restored or have orders rewritten', async () => {
      const p = await create(); const order = (await checkout(p, 1, 'COD')).body;
      const blocked = await archive(p); assert.equal(blocked.status, 409); assert.match(blocked.body.error, /active order commitment/);
      await pool.query("UPDATE orders SET status='Delivered' WHERE id=$1", [order.id]);
      const before = (await pool.query('SELECT * FROM order_items WHERE order_id=$1', [order.id])).rows;
      assert.equal((await archive(p)).status, 200);
      const result = await restore(p); assert.equal(result.status, 409); assert.match(result.body.error, /already been sold/);
      assert.deepEqual((await pool.query('SELECT * FROM order_items WHERE order_id=$1', [order.id])).rows, before);
      assert.equal((await productRow(p.id)).stock, 0);
    });
    await t.test('Restoring lettuce preserves available packs and zero stock remains out of stock', async () => {
      for (const stock of [0, 7]) {
        const p = await create('edible', stock, { name: 'Crystal Lettuce (Lalique) '+stock, price: 130 });
        assert.equal((await archive(p)).status, 200);
        const result = await restore(p, stock > 0);
        assert.equal(result.status, 200); assert.equal(result.body.product.stock, stock);
        assert.equal(result.body.product.status, stock === 0 ? 'Out of Stock' : 'Available');
        assert.equal(result.body.product.price, 130); assert.equal(result.body.product.name, p.name);
      }
    });
    await t.test('Concurrent archive and restore submissions do not duplicate audit records', async () => {
      const p = await create();
      assert.deepEqual((await Promise.all([archive(p), archive(p)])).map(r => r.status).sort(), [200, 409]);
      assert.deepEqual((await Promise.all([restore(p), restore(p)])).map(r => r.status).sort(), [200, 409]);
      const history = (await request(`/api/admin/inventory/history?productId=${p.id}`)).body.entries;
      assert.equal(history.filter(e => e.action === 'Product Archived').length, 1); assert.equal(history.filter(e => e.action === 'Product Restored').length, 1);
    });
    await t.test('Legacy grouped quantities remain archived for physical review without data loss', async () => {
      const p = { id: legacyAllocated.id };
      const before = await productRow(p.id);
      assert.equal((await archive(p)).status, 200);
      const result = await restore(p); assert.equal(result.status, 409); assert.match(result.body.error, /inventory validation/);
      assert.equal((await productRow(p.id)).stock, before.stock); assert.equal((await productRow(p.id)).product_code, before.product_code);
    });
    await t.test('Archive/restore require admin authentication and valid reasons', async () => {
      const p = await create();
      assert.equal((await request(`/api/admin/inventory/${p.id}/archive`, 'POST', { reason: 'Test' }, 'customer')).status, 403);
      assert.equal((await request(`/api/admin/inventory/${p.id}/restore`, 'POST', { reason: 'Test', confirmSellable: true }, 'customer')).status, 403);
      assert.equal((await archive(p, 'Other Reason', '')).status, 400);
      assert.equal((await archive(p, 'Invalid reason')).status, 400);
      assert.equal((await archive(p, 'Other Reason', 'Seasonal display change')).status, 200);
    });
    async function adjustment(p, direction, quantity, key = crypto.randomUUID(), extra = {}, role = 'admin') {
      const batchId=(await pool.query('SELECT id FROM harvest_batches WHERE product_id=$1 ORDER BY harvest_date NULLS LAST,id LIMIT 1',[p.id])).rows[0]?.id;
      const response = await originalFetch(base + `/api/admin/inventory/${p.id}/adjust`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(role)}`, 'Idempotency-Key': key },
        body: JSON.stringify({ direction, quantity,batchId:batchId?Number(batchId):null, reasonType: direction === 'in' ? 'Inventory Correction' : 'Damaged / Spoiled', ...extra }) });
      return { status: response.status, body: await response.json(), replayed: response.headers.get('Idempotency-Replayed') };
    }
    await t.test('Stock In 10 and Stock Out 3 persist pack totals, notes and physical audit snapshots', async () => {
      const p = await create('edible', 10);
      assert.equal((await adjustment(p, 'in', 10, undefined, { notes: 'Harvest prepared into 400g packs' })).body.stock, 20);
      assert.equal((await adjustment(p, 'out', 3)).body.stock, 17);
      const product = (await request('/api/products')).body.find(row => row.id === p.id);
      assert.equal(product.stock, 17); assert.equal(product.packGrams, 400); assert.equal(product.price, p.price);
      const entries = (await request(`/api/admin/inventory/history?productId=${p.id}`)).body.entries;
      const input = entries.find(e => e.action === 'Stock In');
      assert.equal(input.previous_physical_stock, 10); assert.equal(input.new_physical_stock, 20); assert.equal(input.adjustment_quantity, 10);
      assert.equal(input.reason, 'Inventory Correction'); assert.equal(input.notes, 'Harvest prepared into 400g packs');
      const output = entries.find(e => e.action === 'Stock Out');
      assert.equal(output.previous_physical_stock, 20); assert.equal(output.new_physical_stock, 17); assert.equal(output.adjustment_quantity, 3);
    });
    await t.test('Stock adjustment rejects invalid pack values, unsupported products and insufficient Other notes', async () => {
      const p = await create('edible', 5);
      for (const value of [-1, 0, 1.5, 'NaN', 'invalid', true, [1]]) assert.equal((await adjustment(p, 'in', value)).status, 400);
      assert.equal((await adjustment(p, 'out', 6)).status, 409);
      assert.equal((await adjustment(p, 'in', 1, undefined, { reasonType: 'Other', notes: '' })).status, 400);
      assert.equal((await adjustment(p, 'in', 1, undefined, { reasonType: 'Damaged / Spoiled' })).status, 400);
      assert.equal((await adjustment(await create(), 'in', 1)).status, 400);
      await archive(p);
      assert.equal((await adjustment(p, 'in', 1)).status, 409);
      assert.equal((await adjustment(p, 'in', 1, undefined, {}, 'customer')).status, 403);
    });
    await t.test('Repeated and simultaneous keyed adjustments apply once and cannot change their payload', async () => {
      const p = await create('edible', 10); const key = crypto.randomUUID();
      const results = await Promise.all([adjustment(p, 'in', 10, key), adjustment(p, 'in', 10, key)]);
      assert.ok(results.every(r => r.status === 200)); assert.equal(results.filter(r => r.replayed === 'true').length, 1);
      assert.equal((await productRow(p.id)).stock, 20);
      assert.equal((await adjustment(p, 'in', 10, key)).replayed, 'true');
      assert.equal((await adjustment(p, 'in', 3, key)).status, 409);
      assert.equal((await request(`/api/admin/inventory/history?productId=${p.id}&action=Stock+In`)).body.total, 2);
    });
    await t.test('Concurrent different Stock In and Stock Out requests serialize without lost totals', async () => {
      const p = await create('edible', 10);
      const results = await Promise.all([adjustment(p, 'in', 10), adjustment(p, 'out', 3)]);
      assert.ok(results.every(r => r.status === 200)); assert.equal((await productRow(p.id)).stock, 17);
    });
    await t.test('Stock Out excludes reservations and paid/COD allocations without double-deducting them', async () => {
      const p = await create('edible', 10);
      const online = (await checkout(p, 3)).body;
      await checkout(p, 2, 'COD');
      const product = (await request('/api/products')).body.find(row => row.id === p.id);
      assert.equal(product.stock, 5); assert.equal(product.reservedStock, 3); assert.equal(product.committedStock, 2); assert.equal(product.physicalStock, 10);
      assert.equal((await adjustment(p, 'out', 6)).status, 409);
      const result = await adjustment(p, 'out', 3);
      assert.equal(result.body.stock, 2); assert.equal(result.body.reservedStock, 3); assert.equal(result.body.adjustment.previousRecorded, 10); assert.equal(result.body.adjustment.newRecorded, 7);
      await webhook(online, 'evt_stock_adjust_paid');
      const paidProduct = (await request('/api/products')).body.find(row => row.id === p.id);
      assert.equal(paidProduct.stock, 2); assert.equal(paidProduct.reservedStock, 0); assert.equal(paidProduct.committedStock, 5); assert.equal(paidProduct.physicalStock, 7);
      assert.equal((await adjustment(p, 'out', 3)).status, 409);
    });
    await t.test('Failed history insertion rolls back stock and request receipt; unchanged retry succeeds', async () => {
      const p = await create('edible', 10); const key = crypto.randomUUID();
      await pool.query(`CREATE FUNCTION inventory_test_fail_movement() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected history failure'; END $$;
        CREATE TRIGGER inventory_test_fail BEFORE INSERT ON inventory_movements FOR EACH ROW WHEN (NEW.action='Stock In') EXECUTE FUNCTION inventory_test_fail_movement()`);
      try {
        assert.equal((await adjustment(p, 'in', 10, key)).status, 500);
        assert.equal((await productRow(p.id)).stock, 10);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM inventory_product_requests WHERE request_key=$1', ['harvest:' + key])).rows[0].n, 0);
      } finally { await pool.query('DROP TRIGGER inventory_test_fail ON inventory_movements; DROP FUNCTION inventory_test_fail_movement()'); }
      assert.equal((await adjustment(p, 'in', 10, key)).body.stock, 20);
    });
    const harvestDate=async age=>(await pool.query("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Manila')::date - $1::int)::text AS date",[age])).rows[0].date;
    async function harvest(p,action,body,b=null,key=crypto.randomUUID(),role='admin') {
      const path=`/api/admin/inventory/${p.id}/batches`+(b?'/'+b.id:'')+(['adjust','dispose'].includes(action)?'/'+action:'');
      const result=await originalFetch(base+path,{method:action==='update'?'PATCH':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token(role)}`,'Idempotency-Key':key},body:JSON.stringify(body)});
      return {status:result.status,body:await result.json(),replayed:result.headers.get('Idempotency-Replayed')};
    }
    const batchRow=async id=>(await pool.query("SELECT *,harvest_batch_age(harvest_batches) AS age_days,harvest_batch_status(harvest_batches) AS status FROM harvest_batches WHERE id=$1",[id])).rows[0];
    async function batchCheckout(p,b,qty=1,method='COD',price=b.price) {
      return request('/api/orders','POST',{fullName:'Inventory Test',gmail:'inventory-test@gmail.com',mobileNumber:'09123456789',location:'Test address',country:'Philippines',province:'Laguna',city:'Calamba',barangay:'Test',postalCode:'4027',paymentMethod:method,items:[{id:p.id,qty,batchId:b.id,expectedUnitPrice:price}]},'customer');
    }
    await t.test('Two harvests retain independent quantities, dates and prices under one product',async()=>{
      const p=await create('edible',0);
      const first=await harvest(p,'create',{quantity:10,harvestDate:await harvestDate(10),reason:'New Harvest'});
      const second=await harvest(p,'create',{quantity:20,harvestDate:await harvestDate(0),reason:'New Harvest'});
      assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(second.status,200);
      assert.notEqual(first.body.batch.batch_code,second.body.batch.batch_code);
      const batches=(await request(`/api/admin/inventory/${p.id}/batches`)).body.batches;
      assert.equal(batches.length,2);assert.equal(batches[0].stock,10);assert.equal(batches[1].stock,20);
      const product=(await request('/api/admin/inventory')).body.products.find(row=>row.id===p.id);
      assert.equal(product.stock,30);assert.equal(product.physicalStock,30);
      assert.equal((await request('/api/products','POST',{inventoryType:'edible',name:p.name,stock:0,price:130})).status,409);
    });
    await t.test('Manila calendar ages enforce Day 7/8/13/14/20/21 without automatic markdown',async()=>{
      const p=await create('edible',0);
      for(const [age,status,available] of [[0,'Fresh',10],[7,'Fresh',10],[8,'Aging',10],[13,'Aging',10],[14,'On Hold',0],[20,'On Hold',0],[21,'For Disposal',0]]) {
        const result=await harvest(p,'create',{quantity:10,harvestDate:await harvestDate(age),reason:'New Harvest'});
        assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.batch.status,status);assert.equal(result.body.batch.available_stock,available);assert.equal(result.body.batch.price,130);assert.equal(result.body.batch.stock,10);
      }
      const product=(await request('/api/admin/inventory')).body.products.find(row=>row.id===p.id);
      assert.equal(product.physicalStock,70);assert.equal(product.stock,40);
      assert.equal((await productRow(p.id)).price,'130.00');
    });
    await t.test('Batch prices are explicit at checkout, FEFO is the default option, and order prices stay immutable',async()=>{
      const p=await create('edible',0);
      const old=(await harvest(p,'create',{quantity:5,harvestDate:await harvestDate(10),reason:'New Harvest'})).body.batch;
      const fresh=(await harvest(p,'create',{quantity:5,harvestDate:await harvestDate(0),reason:'New Harvest'})).body.batch;
      const order=(await batchCheckout(p,old)).body;
      assert.ok(order.id);
      assert.equal((await harvest(p,'update',{price:100,reason:'Client-approved aging markdown',notes:'Inspected quality'},old)).status,200);
      const catalog=(await request('/api/products')).body.find(row=>row.id===p.id);
      assert.equal(catalog.batches[0].id,old.id);assert.equal(catalog.batches[0].price,100);assert.equal(catalog.batches[1].price,130);
      assert.equal((await batchRow(fresh.id)).price,'130.00');assert.equal((await productRow(p.id)).price,'130.00');
      assert.equal((await batchCheckout(p,old,1,'COD',130)).status,409);
      assert.equal((await batchCheckout(p,{...old,price:100})).status,201);
      const snapshot=(await pool.query('SELECT * FROM order_items WHERE order_id=$1',[order.id])).rows[0];
      assert.equal(snapshot.unit_price,'130.00');assert.equal(Number(snapshot.batch_id),old.id);assert.equal(snapshot.batch_code,old.batch_code);
      const history=(await request(`/api/admin/inventory/history?productId=${p.id}&batchId=${old.id}&action=Price+Adjusted`)).body.entries;
      assert.equal(history.length,1);assert.equal(Number(history[0].previous_value.price),130);assert.equal(Number(history[0].new_value.price),100);
    });
    await t.test('Age holds cannot be bypassed by price, condition, stock correction or changing verified dates',async()=>{
      const p=await create('edible',0);
      const b=(await harvest(p,'create',{quantity:5,harvestDate:await harvestDate(14),reason:'New Harvest'})).body.batch;
      assert.equal((await harvest(p,'update',{price:50,condition:'Fresh',reason:'Price review'},b)).status,200);
      assert.equal((await batchRow(b.id)).status,'On Hold');
      assert.equal((await harvest(p,'update',{harvestDate:businessToday,reason:'Attempt to reset age'},b)).status,409);
      assert.equal((await batchCheckout(p,{...b,price:50})).status,409);
      assert.equal((await harvest(p,'adjust',{quantity:2,direction:'in',reason:'Inventory Correction'},b)).status,200);
      assert.equal((await batchRow(b.id)).stock,7);assert.equal((await request('/api/products')).body.find(row=>row.id===p.id).stock,0);
    });
    await t.test('Partial and full early disposal remove only uncommitted physical packs and preserve newer harvests',async()=>{
      const p=await create('edible',0);
      const bad=(await harvest(p,'create',{quantity:5,harvestDate:await harvestDate(2),condition:'Unsellable',reason:'Quality inspection'},null)).body.batch;
      const fresh=(await harvest(p,'create',{quantity:8,harvestDate:await harvestDate(0),reason:'New Harvest'})).body.batch;
      const disposal={quantity:2,reason:'Spoiled / Rotten',confirmDisposed:true,disposalDate:businessToday};
      assert.equal((await harvest(p,'dispose',disposal,bad)).status,200);assert.equal((await batchRow(bad.id)).stock,3);
      assert.equal((await harvest(p,'dispose',{...disposal,quantity:3},bad)).status,200);assert.equal((await batchRow(bad.id)).condition,'Disposed');
      assert.equal((await batchRow(fresh.id)).stock,8);assert.equal((await request('/api/products')).body.find(row=>row.id===p.id).stock,8);
      assert.equal((await batchCheckout(p,bad)).status,409);
      assert.equal((await harvest(p,'update',{condition:'Fresh',reason:'Attempt to reactivate'},bad)).status,409);
      const events=(await request(`/api/admin/inventory/history?productId=${p.id}&batchId=${bad.id}&action=Disposal+Confirmed`)).body.entries;
      assert.equal(events.length,2);assert.equal(events[0].new_value.disposalDate,businessToday);
    });
    await t.test('Batch retries, stock corrections, disposal and customer authorization protect reservations',async()=>{
      const p=await create('edible',0);const key=crypto.randomUUID();
      const payload={quantity:5,harvestDate:businessToday,reason:'New Harvest'};
      const a=await harvest(p,'create',payload,null,key);const replay=await harvest(p,'create',payload,null,key);
      assert.equal(replay.replayed,'true');assert.equal(a.body.batch.id,replay.body.batch.id);
      assert.equal((await harvest(p,'create',payload,null,crypto.randomUUID(),'customer')).status,403);
      assert.equal((await harvest(await create(),'create',payload)).status,400);
      const b=a.body.batch;const order=(await batchCheckout(p,b,3,'ONLINE')).body;
      assert.ok(order.id);assert.equal((await batchRow(b.id)).reserved_stock,3);
      assert.equal((await harvest(p,'dispose',{quantity:3,reason:'Spoiled / Rotten',confirmDisposed:true,disposalDate:businessToday},b)).status,409);
      assert.equal((await harvest(p,'dispose',{quantity:2,reason:'Spoiled / Rotten',confirmDisposed:true,disposalDate:businessToday},b)).status,200);
      assert.notEqual((await batchRow(b.id)).condition,'Disposed');
      await webhook(order,'evt_batch_unsellable_paid');
      assert.equal((await orderRow(order.id)).payment_status,'Refund Pending');assert.equal((await batchRow(b.id)).reserved_stock,0);assert.equal((await batchRow(b.id)).stock,3);
      assert.equal((await request('/api/products')).body.find(row=>row.id===p.id).stock,0);
    });
    await t.test('Day-threshold alerts are deduplicated while physical stock remains unchanged',async()=>{
      const p=await create('edible',0);
      const b=(await harvest(p,'create',{quantity:5,harvestDate:await harvestDate(21),reason:'New Harvest'})).body.batch;
      for(let i=0;i<3;i++)await request(`/api/admin/inventory/${p.id}/batches`);
      const alerts=(await request(`/api/admin/inventory/history?productId=${p.id}&batchId=${b.id}&action=Marked+For+Disposal`)).body.entries;
      assert.equal(alerts.length,1);assert.equal(alerts[0].actor,'System');assert.equal((await batchRow(b.id)).stock,5);
    });
    await t.test('Legacy edible stock is preserved without a date and requires verified inspection before sale',async()=>{
      const legacy=(await pool.query("SELECT * FROM products WHERE name='Legacy lettuce'")).rows[0];
      const b=(await pool.query('SELECT * FROM harvest_batches WHERE product_id=$1',[legacy.id])).rows[0];
      assert.equal(b.harvest_date,null);assert.equal(b.stock,12);assert.equal((await productRow(legacy.id)).stock,0);
      assert.equal((await harvest(legacy,'update',{harvestDate:businessToday,condition:'Fresh',reason:'Verify legacy date'},b)).status,400);
      assert.equal((await harvest(legacy,'update',{harvestDate:businessToday,condition:'Fresh',confirmInspected:true,reason:'Verified harvest records and physical packs'},b)).status,200);
      assert.equal((await productRow(legacy.id)).stock,12);assert.equal((await batchRow(b.id)).legacy_import,true);
    });
    await t.test('Manual courier reference never dispatches automatically, status audit is atomic and COD stays unpaid',async()=>{
      const p=await create('edible',5);const order=(await checkout(p,2,'COD')).body;
      const before=await productRow(p.id);
      const patch=body=>request(`/api/admin/orders/${order.id}`,'PATCH',body);
      const saved=await patch({status:'Pending',deliveryMode:'logistics',courierName:'J&T Express',trackingCode:'MANUAL-JT-123',trackingStatus:'Pending'});
      assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.status,'Pending');assert.equal(saved.body.trackingStatus,'Pending');
      assert.equal(saved.body.trackingCode,'MANUAL-JT-123');assert.notEqual(saved.body.paymentStatus,'Paid');
      assert.equal((await orderRow(order.id)).tracking_code,'MANUAL-JT-123');
      assert.equal((await request(`/api/admin/orders/${order.id}/delivery-history`)).body.total,0);
      assert.equal((await request(`/api/admin/orders/${order.id}/confirm`,'POST',{})).status,200);
      const prepared=await patch({status:'Preparing',deliveryMode:'logistics',courierName:'LBC',trackingCode:'MANUAL-LBC-123',trackingStatus:'Packed',deliveryNotes:'Parcel packed and ready for pickup'});
      assert.equal(prepared.status,200,JSON.stringify(prepared.body));assert.equal(prepared.body.status,'Preparing');
      assert.equal((await patch({status:'Preparing',deliveryMode:'logistics',courierName:'LBC',trackingCode:'MANUAL-LBC-123',trackingStatus:'In Transit'})).status,409);
      const transit={status:'Out for Delivery',deliveryMode:'logistics',courierName:'LBC',trackingCode:'MANUAL-LBC-123',trackingStatus:'In Transit',deliveryNotes:'Courier accepted parcel'};
      assert.equal((await patch(transit)).status,200);assert.equal((await patch(transit)).status,200);
      const history=await request(`/api/admin/orders/${order.id}/delivery-history`);
      assert.equal(history.status,200);assert.equal(history.body.total,2);
      assert.equal(history.body.entries[0].previous_status,'Packed');assert.equal(history.body.entries[0].new_status,'In Transit');
      assert.equal(history.body.entries[0].actor,'Admin #124');assert.equal(history.body.entries[0].notes,'Courier accepted parcel');assert.ok(history.body.entries[0].created_at);
      assert.equal((await patch({...transit,status:'Preparing',trackingStatus:'Packed'})).status,409);
      assert.equal((await patch({...transit,trackingStatus:'Ready for Pickup'})).status,400);
      assert.equal((await patch({...transit,status:'Delivered',trackingStatus:'In Transit'})).status,409);
      const delivered=await patch({...transit,status:'Delivered',trackingStatus:'Delivered'});
      assert.equal(delivered.status,200,JSON.stringify(delivered.body));assert.equal(delivered.body.paymentStatus,'Unpaid');assert.equal(delivered.body.codStatus,'Remittance Pending');
      assert.deepEqual(await productRow(p.id),before);
      assert.equal((await request(`/api/admin/orders/${order.id}/delivery-history`,'GET',undefined,'customer')).status,403);
      const {isTrack123Configured}=await import('../src/utils/track123.js');assert.equal(isTrack123Configured(),false);
      assert.equal((await request(`/api/admin/orders/${order.id}/track123/sync`,'POST',{})).status,503);
    });
    await t.test('Automatic carrier events synchronize order/customer history without marking courier COD paid',async()=>{
      const p=await create('edible',5),order=(await checkout(p,1,'COD')).body;
      await pool.query("UPDATE orders SET status='Preparing',tracking_status='Preparing',delivery_mode='logistics',courier_name='J&T Express',tracking_code='JT-REAL-TEST' WHERE id=$1",[order.id]);
      const before=await productRow(p.id);
      const {syncCourierOrder}=await import('../src/utils/courierTracking.js');
      const previousFetch=globalThis.fetch,previousKey=process.env.TRACK123_API_KEY;
      let status='IN_TRANSIT',checkpoint='2026-10-15T08:00:00Z';
      process.env.TRACK123_ENABLED='true';process.env.TRACK123_API_KEY='mock-carrier-key';
      globalThis.fetch=async(url,options)=>{
        if(!String(url).startsWith('https://api.track123.com/'))return previousFetch(url,options);
        const payload=JSON.parse(options.body);
        if(String(url).endsWith('/query'))assert.equal(payload.trackNoInfos[0].trackNo,'JT-REAL-TEST');
        return Response.json({code:'00000',data:{accepted:[{trackNo:'JT-REAL-TEST',transitStatus:status,localLogisticsInfo:{trackingDetails:[{eventTimeZeroUTC:checkpoint,transitSubStatus:status,eventDetail:'Verified carrier event'}]}}]}});
      };
      try{
        await syncCourierOrder(order.id,pool);
        let row=await orderRow(order.id);assert.equal(row.status,'Out for Delivery');assert.equal(row.tracking_status,'In Transit');assert.notEqual(row.payment_status,'Paid');
        const history=(await request(`/api/admin/orders/${order.id}/delivery-history`)).body;
        assert.equal(history.entries[0].actor,'Courier tracking service');
        const customer=await request(`/api/orders/${order.id}/logistics-updates`,'GET',undefined,'customer');
        assert.equal(customer.status,200);assert.equal(customer.body.updates.length,1);assert.equal(customer.body.trackingStatus,'In Transit');
        const stranger=jwt.sign({role:'customer',email:'other@example.com',userId:321},process.env.JWT_SECRET);
        assert.equal((await originalFetch(`${base}/api/orders/${order.id}/logistics-updates`,{headers:{Authorization:`Bearer ${stranger}`}})).status,404);
        assert.equal((await originalFetch(`${base}/api/orders/${order.id}/logistics-updates`)).status,401);
        const snapshot=await orderRow(order.id);
        await request(`/api/orders/${order.id}/logistics-updates`,'GET',undefined,'customer');
        assert.deepEqual(await orderRow(order.id),snapshot,'Viewing carrier history must be read-only');
        status='DELIVERED';checkpoint='2026-10-15T09:00:00Z';await syncCourierOrder(order.id,pool);await syncCourierOrder(order.id,pool);
        row=await orderRow(order.id);assert.equal(row.status,'Delivered');assert.equal(row.tracking_status,'Delivered');assert.equal(row.cod_status,'Remittance Pending');assert.notEqual(row.payment_status,'Paid');
        assert.equal((await request(`/api/admin/orders/${order.id}/delivery-history`)).body.total,2);
        assert.deepEqual(await productRow(p.id),before);
      }finally{globalThis.fetch=previousFetch;process.env.TRACK123_ENABLED='false';if(previousKey===undefined)delete process.env.TRACK123_API_KEY;else process.env.TRACK123_API_KEY=previousKey;}
    });
    await t.test('Order notifications are transactional, distinct, persistent and private per administrator',async()=>{
      const cod=await checkout(await create(),1,'COD');assert.equal(cod.status,201);
      const notices=async id=>(await pool.query('SELECT * FROM admin_notifications WHERE order_id=$1 ORDER BY id',[id])).rows;
      assert.deepEqual((await notices(cod.body.id)).map(n=>n.event_type),['cod_order']);
      assert.notEqual((await orderRow(cod.body.id)).payment_status,'Paid');
      const pending=await checkout(await create());
      assert.equal((await notices(pending.body.id)).length,0);
      await webhook(pending.body,'evt_notice_paid');await webhook(pending.body,'evt_notice_paid');await webhook(pending.body,'evt_notice_paid_retry');
      assert.deepEqual((await notices(pending.body.id)).map(n=>n.event_type),['online_paid']);
      const cancelling=await checkout(await create(),1,'COD');
      assert.equal((await request(`/api/admin/orders/${cancelling.body.id}/confirm`,'POST',{})).status,200);
      assert.equal((await request(`/api/orders/${cancelling.body.id}/cancel`,'POST',{reason:'Request review'},'customer')).status,200);
      assert.ok((await notices(cancelling.body.id)).some(n=>n.event_type==='cancellation_request'));
      const failed=await checkout(await create());await webhook(failed.body,'evt_notice_failed','payment.failed');await webhook(failed.body,'evt_notice_failed','payment.failed');
      assert.deepEqual((await notices(failed.body.id)).map(n=>n.event_type),['payment_failed']);
      const expired=await checkout(await create());
      await pool.query("UPDATE inventory_reservations SET expires_at=NOW()-INTERVAL '1 minute' WHERE order_id=$1",[expired.body.id]);
      await expireReservations(pool);
      assert.equal((await notices(expired.body.id)).length,0,'Ordinary abandonment must not notify');
      await webhook(expired.body,'evt_notice_late_paid');
      assert.ok((await notices(expired.body.id)).some(n=>n.event_type==='payment_review'));
      const first=await request('/api/admin/notifications');
      assert.equal(first.status,200,JSON.stringify(first.body));assert.ok(first.body.unread>0);
      assert.ok(first.body.throughId);
      const n=(await notices(cod.body.id))[0];
      assert.equal((await request(`/api/admin/notifications/${n.id}/read`,'POST',{})).status,200);
      const readBefore=(await pool.query('SELECT read_at FROM admin_notification_reads WHERE notification_id=$1 AND user_id=124',[n.id])).rows[0].read_at;
      await request(`/api/admin/notifications/${n.id}/read`,'POST',{});
      assert.deepEqual((await pool.query('SELECT read_at FROM admin_notification_reads WHERE notification_id=$1 AND user_id=124',[n.id])).rows[0].read_at,readBefore);
      assert.ok((await request('/api/admin/notifications?limit=25')).body.notifications.some(row=>row.id===n.id&&row.is_read));
      const admin2=jwt.sign({role:'admin',userId:126},process.env.JWT_SECRET);
      const secondResponse=await originalFetch(base+'/api/admin/notifications/unread-count',{headers:{Authorization:`Bearer ${admin2}`}});
      assert.ok((await secondResponse.json()).unread>(await request('/api/admin/notifications/unread-count')).body.unread);
      for(const path of ['/api/admin/notifications','/api/admin/notifications/unread-count']) {
        assert.equal((await request(path,'GET',undefined,'customer')).status,403);
        assert.equal((await originalFetch(base+path)).status,401);
      }
      assert.equal((await request('/api/admin/notifications/read-all','POST',{throughId:first.body.throughId},'customer')).status,403);
      assert.equal((await request('/api/admin/notifications/read-all','POST',{throughId:first.body.throughId})).status,200);
      assert.equal((await request('/api/admin/notifications/unread-count')).body.unread,0);
      assert.equal((await request('/api/admin/notifications?page=0')).status,400);
      assert.equal((await request('/api/admin/notifications/999999999/read','POST',{})).status,404);
      const json=JSON.stringify(first.body);for(const secret of ['inventory-test@gmail.com','Test address','09123456789','driverAccessToken','paymongoPaymentIntentId'])assert.ok(!json.includes(secret));
      const {reconcileNotifications}=await import('../src/utils/notifications.js');
      const countBefore=Number((await pool.query('SELECT COUNT(*) AS n FROM admin_notifications')).rows[0].n);
      await Promise.all([reconcileNotifications(pool),reconcileNotifications(pool)]);
      assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM admin_notifications')).rows[0].n),countBefore);
    });
    await t.test('Notification failure cannot block COD commits and reconciliation retries without duplicates',async()=>{
      await pool.query(`CREATE FUNCTION fail_notification_test() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Forced notification storage failure'; END; $$;
        CREATE TRIGGER fail_notification_test BEFORE INSERT ON admin_notifications FOR EACH ROW EXECUTE FUNCTION fail_notification_test()`);
      let result;
      try{result=await checkout(await create(),1,'COD');assert.equal(result.status,201,JSON.stringify(result.body));}
      finally{await pool.query('DROP TRIGGER fail_notification_test ON admin_notifications; DROP FUNCTION fail_notification_test()');}
      assert.equal((await pool.query('SELECT id FROM admin_notifications WHERE order_id=$1',[result.body.id])).rows.length,0);
      const {reconcileNotifications}=await import('../src/utils/notifications.js');await reconcileNotifications(pool);await reconcileNotifications(pool);
      assert.equal((await pool.query('SELECT id FROM admin_notifications WHERE order_id=$1',[result.body.id])).rows.length,1);
      const client=await pool.connect();let rolledBackId;
      try{
        await client.query('BEGIN');
        rolledBackId=(await client.query("INSERT INTO orders(customer_name,payment_method) VALUES('Notification rollback test','COD') RETURNING id")).rows[0].id;
        assert.equal((await pool.query('SELECT id FROM admin_notifications WHERE order_id=$1',[rolledBackId])).rows.length,0,'Uncommitted notice cannot be read');
        await client.query('ROLLBACK');
      }finally{client.release();}
      assert.equal((await pool.query('SELECT id FROM admin_notifications WHERE order_id=$1',[rolledBackId])).rows.length,0);
    });
    await t.test('History buyer enrichment uses order snapshots, minimizes private data and is read-only/admin-only',async()=>{
      const p=await create('succulent',1,{name:'Buyer snapshot plant',tag:'Red',price:17000});
      const order=(await checkout(p,1,'COD')).body;
      const before=await productRow(p.id);
      const orderBefore=await orderRow(order.id);
      const history=await request(`/api/admin/inventory/history?productId=${p.id}&action=Product+Sold`);
      assert.equal(history.status,200,JSON.stringify(history.body));
      const entry=history.body.entries[0];
      assert.equal(entry.transaction.customerName,'Inventory Test');
      assert.equal(Number(entry.transaction.orderId),Number(order.id));
      assert.equal(entry.transaction.paymentMethod,'COD');
      assert.notEqual(entry.transaction.paymentStatus,'Paid');
      assert.equal(entry.transaction.items[0].productName,'Buyer snapshot plant');
      assert.equal(entry.transaction.items[0].productCode,p.productCode);
      assert.equal(entry.transaction.items[0].tag,'Red');
      assert.equal(Number(entry.transaction.items[0].unitPrice),17000);
      assert.equal(entry.transaction.items[0].quantity,1);
      assert.equal(entry.canViewOrder,true);
      assert.ok(!JSON.stringify(history.body).includes('inventory-test@gmail.com'));
      for(const forbidden of ['gmail','mobile_num','location','driver_access_token','paymongo_checkout_session_id']) assert.ok(!(forbidden in entry.transaction));
      assert.equal((await request('/api/admin/inventory/history','GET',undefined,'customer')).status,403);
      assert.equal((await request('/api/admin/orders','GET',undefined,'customer')).status,403);
      const orders=await request('/api/admin/orders');
      assert.ok(orders.body.some(o=>Number(o.id)===Number(order.id)));
      assert.deepEqual(await productRow(p.id),before);
      assert.deepEqual(await orderRow(order.id),orderBefore);
      const added=(await request(`/api/admin/inventory/history?productId=${p.id}&action=Product+Added`)).body.entries[0];
      assert.equal(added.transaction,null);assert.equal(added.canViewOrder,false);
      // A permitted correction before online payment must not replace checkout snapshots.
      const other=await create('succulent',1,{price:777,tag:'White'});
      const online=(await checkout(other)).body;
      assert.equal((await request(`/api/products/${other.id}`,'PATCH',{price:999,tag:'Green',name:'Changed later'})).status,200);
      await webhook(online,'evt_buyer_snapshot');
      const paid=(await request(`/api/admin/inventory/history?productId=${other.id}&action=Product+Sold`)).body.entries[0];
      assert.equal(paid.transaction.paymentStatus,'Paid');
      assert.equal(Number(paid.transaction.items[0].unitPrice),777);
      assert.equal(paid.transaction.items[0].tag,'White');
      assert.equal(paid.transaction.items[0].productName,other.name);
    });
    await t.test('Customer management filters full data, preserves paid history, audits changes and revokes old sessions',async()=>{
      const {default:bcrypt}=await import('bcryptjs');const passwordHash=await bcrypt.hash('CustomerTest123!',4);
      const user=(await pool.query("INSERT INTO users(first_name,last_name,email,role,status,password_hash) VALUES('Customer','Management','account-management@example.com','customer','active',$1) RETURNING *",[passwordHash])).rows[0];
      const rider=(await pool.query("INSERT INTO users(first_name,email,role,status) VALUES('Rider','exclude-rider@example.com','rider','active') RETURNING id")).rows[0];
      await pool.query("INSERT INTO orders(customer_name,gmail,status,payment_status,total_amount) VALUES('Customer Management',$1,'Delivered','Paid',100),('Customer Management',$1,'Delivered','Unpaid',200),('Customer Management',$1,'Cancelled','Refunded',300),('Customer Management',$1,'Pending','Unpaid',400)",[user.email]);
      const own=async(path,sessionVersion=0)=>{
        const token=jwt.sign({role:'customer',userId:Number(user.id),email:user.email,sessionVersion},process.env.JWT_SECRET);
        const response=await originalFetch(base+path,{headers:{Authorization:`Bearer ${token}`}});return {status:response.status,body:await response.json()};
      };
      const all=await request('/api/admin/customers/manage');assert.equal(all.status,200,JSON.stringify(all.body));
      const expected=(await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role='customer'")).rows[0].total;
      assert.equal(all.body.summary.total,expected);assert.ok(all.body.customers.every(row=>row.id!==Number(rider.id)));
      const found=await request(`/api/admin/customers/manage?search=${user.id}&status=active`);assert.ok(found.body.customers.some(row=>row.id===Number(user.id)&&row.totalOrders===4));
      assert.equal((await request('/api/admin/customers/manage?fromDate=2026-02-30')).status,400);
      const details=(await request(`/api/admin/customers/${user.id}/details`)).body;
      assert.deepEqual(details.statistics,{total:4,delivered:2,cancelled:1,pending:1,spent:100});
      assert.ok(!JSON.stringify(details).includes(passwordHash));
      const login=await request('/api/auth/login','POST',{email:user.email,password:'CustomerTest123!'});assert.equal(login.status,200,JSON.stringify(login.body));
      const purchases=(await request(`/api/admin/customers/${user.id}/orders`)).body;assert.equal(purchases.total,4);
      assert.equal((await request(`/api/admin/customers/${user.id}/orders?status=Cancelled`)).body.total,1);
      assert.equal((await request(`/api/admin/customers/${user.id}/activity`)).body.entries[0].action,'Account Created');
      assert.equal((await own('/api/admin/customers/manage')).status,403);
      assert.equal((await originalFetch(base+'/api/admin/customers/manage')).status,401);
      const snapshots=(await pool.query('SELECT * FROM orders WHERE LOWER(gmail)=LOWER($1) ORDER BY id',[user.email])).rows;
      const statusPath=`/api/admin/customers/${user.id}/status`;
      assert.equal((await request(statusPath,'PATCH',{status:'inactive',confirmed:true,reasonType:'Other'})).status,400);
      assert.equal((await request(statusPath,'PATCH',{status:'inactive',reasonType:'Customer Request'})).status,400);
      assert.equal((await request(statusPath,'PATCH',{status:'inactive',confirmed:true,reasonType:'Customer Request'},'customer')).status,403);
      const disable={status:'inactive',confirmed:true,reasonType:'Customer Request'};
      const results=await Promise.all([request(statusPath,'PATCH',disable),request(statusPath,'PATCH',disable)]);assert.ok(results.every(result=>result.status===200));
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM customer_account_activity WHERE customer_id=$1',[user.id])).rows[0].n,1);
      assert.equal((await own('/api/orders')).status,403,'Existing customer JWT must stop working while disabled');
      assert.equal((await request('/api/auth/login','POST',{email:user.email,password:'CustomerTest123!'})).status,401,'Disabled accounts receive the same generic login failure as invalid credentials');
      assert.equal((await request(`/api/admin/customers/${user.id}/orders`)).body.total,4);
      assert.equal((await request(statusPath,'PATCH',{status:'active',confirmed:true})).status,200);
      assert.equal((await own('/api/orders')).status,401,'Re-enabling must not reactivate an old JWT');
      const current=(await pool.query('SELECT * FROM users WHERE id=$1',[user.id])).rows[0];
      assert.equal(current.password_hash,passwordHash);assert.equal(current.auth_version,2);
      const newLogin=await request('/api/auth/login','POST',{email:user.email,password:'CustomerTest123!'});assert.equal(newLogin.status,200);
      assert.equal(jwt.verify(newLogin.body.token,process.env.JWT_SECRET).sessionVersion,2);
      assert.equal((await own('/api/admin/customers/manage',2)).status,403,'Fresh customer session still cannot access admin APIs');
      const activity=(await request(`/api/admin/customers/${user.id}/activity`)).body;
      assert.equal(activity.total,3);assert.ok(activity.entries.some(entry=>entry.action==='Account Disabled'&&entry.actor==='Admin #124'));
      assert.deepEqual((await pool.query('SELECT * FROM orders WHERE LOWER(gmail)=LOWER($1) ORDER BY id',[user.email])).rows,snapshots);
      assert.ok((await request('/api/admin/logs')).body.logs.some(entry=>entry.action==='Account Enabled'));
      const verificationToken=crypto.randomBytes(32).toString('hex');
      await pool.query("INSERT INTO pending_registrations(first_name,last_name,email,password_hash,token_hash,expires_at) VALUES('Verified','Customer','verified-new@example.com',$1,$2,NOW()+INTERVAL '1 hour')",[passwordHash,crypto.createHash('sha256').update(verificationToken).digest('hex')]);
      assert.equal((await request('/api/auth/verify-email?token='+verificationToken)).status,200);
      assert.equal((await request('/api/auth/login','POST',{email:'verified-new@example.com',password:'CustomerTest123!'})).status,200);
      await pool.query("INSERT INTO users(first_name,email,role,status,created_at) SELECT 'Page Customer '||g,'page-customer-'||g||'@example.com','customer','active','2026-10-18T04:00:00Z'::timestamptz FROM generate_series(1,25) g");
      const page1=await request('/api/admin/customers/manage?search=page-customer-&fromDate=2026-10-18&toDate=2026-10-18');
      const page2=await request('/api/admin/customers/manage?search=page-customer-&fromDate=2026-10-18&toDate=2026-10-18&page=2');
      assert.equal(page1.body.total,25);assert.equal(page1.body.customers.length,20);assert.equal(page2.body.customers.length,5);
      assert.ok(page1.body.customers[0].id>page2.body.customers[0].id);
      await pool.query("INSERT INTO users(first_name,email,role,status,created_at) VALUES('Boundary Start','customer-boundary-start@example.com','customer','active','2026-10-17T16:00:00Z'),('Boundary End','customer-boundary-end@example.com','customer','inactive','2026-10-18T15:59:59.999Z'),('Next Day','customer-boundary-next@example.com','customer','active','2026-10-18T16:00:00Z')");
      const boundaries=await request('/api/admin/customers/manage?search=customer-boundary-&fromDate=2026-10-18&toDate=2026-10-18');
      assert.equal(boundaries.body.total,2);
      assert.equal((await request('/api/admin/customers/manage?search=customer-boundary-&status=inactive')).body.total,1);
    });
    await t.test('Customer avatars and saved addresses are owned, private and independent of historical order snapshots',async()=>{
      const before=(await pool.query('SELECT id,location,mobile_num,customer_name FROM orders WHERE LOWER(gmail)=LOWER($1) ORDER BY id',['inventory-test@gmail.com'])).rows;
      const empty=(await request('/api/admin/customers/321/details')).body;assert.deepEqual(empty.addresses,[]);assert.equal(empty.customer.profileImageUrl,'');
      const profile=await request('/api/customer/account/profile','PATCH',{name:'Updated Profile Name',email:'must-not-change@example.com',phone:'09112223333',image:'data:image/png;base64,'+png.toString('base64')},'customer');
      assert.equal(profile.status,200,JSON.stringify(profile.body));createdImageUrls.add(profile.body.profile.image);
      assert.equal(profile.body.profile.email,'inventory-test@gmail.com');assert.match(profile.body.profile.image,/^\/uploads\/profile-/);
      const photo=await originalFetch(base+profile.body.profile.image);assert.equal(photo.status,200);
      const first={id:'address-home',name:'Saved Recipient',phone:'09112223333',addressLine:'12 Sample Street',barangay:'Barangay One',city:'Calamba',province:'Laguna',postalCode:'4027',landmark:'Near the park',latitude:14.2,longitude:121.1,isDefault:false};
      const second={...first,id:'address-default',addressLine:'88 Default Street',label:'Home',isDefault:true};
      assert.equal((await request('/api/customer/account/addresses','PUT',{userId:321,addresses:[first,second]},'customer')).status,200);
      const loaded=(await request('/api/customer/account','GET',undefined,'customer')).body;
      assert.equal(loaded.addresses.length,2);assert.equal(loaded.profile.phone,'09112223333');
      const details=(await request('/api/admin/customers/123/details')).body;
      assert.equal(details.customer.fullName,'Updated Profile Name');assert.equal(details.customer.profileImageUrl,profile.body.profile.image);assert.equal(details.customer.phone,'09112223333');
      assert.equal(details.addresses.length,2);assert.equal(details.addresses[0].id,'address-default');assert.equal(details.addresses[0].isDefault,true);
      assert.deepEqual((await request('/api/admin/customers/321/details')).body.addresses,[]);
      const list=(await request('/api/admin/customers/manage?search=Updated+Profile+Name')).body;
      assert.equal(list.customers.length,1);assert.equal(list.customers[0].profileImageUrl,profile.body.profile.image);
      assert.ok(!JSON.stringify(list).includes('88 Default Street'));
      assert.equal((await request('/api/admin/customers/123/details','GET',undefined,'customer')).status,403);
      assert.equal((await originalFetch(base+'/api/customer/account')).status,401);
      assert.equal((await request('/api/customer/account/addresses','PUT',{addresses:[]})).status,403);
      assert.equal((await request('/api/customer/account/addresses','PUT',{addresses:[first,{...first,id:'duplicate'}]},'customer')).status,400);
      assert.equal((await request('/api/customer/account/addresses','PUT',{addresses:[{...first,isDefault:true},second]},'customer')).status,400);
      assert.equal((await request('/api/customer/account/profile','PATCH',{image:'data:image/png;base64,aW52YWxpZA=='},'customer')).status,400);
      assert.equal((await request('/api/customer/account/addresses','PUT',{addresses:[{...second,addressLine:'New current default address'}]},'customer')).status,200);
      assert.deepEqual((await pool.query('SELECT id,location,mobile_num,customer_name FROM orders WHERE LOWER(gmail)=LOWER($1) ORDER BY id',['inventory-test@gmail.com'])).rows,before);
      assert.equal((await request('/api/admin/customers/123/orders')).body.total,before.length);
    });
    await t.test('Exact multi-batch prices are separate order lines, and mismatched payment cannot commit inventory',async()=>{
      const p=await create('edible',0);
      const a=(await harvest(p,'create',{quantity:2,harvestDate:await harvestDate(8),batchPrice:100,reason:'New Harvest'})).body.batch;
      const b=(await harvest(p,'create',{quantity:2,harvestDate:businessToday,batchPrice:130,reason:'New Harvest'})).body.batch;
      const result=await request('/api/orders','POST',{fullName:'Inventory Test',gmail:'inventory-test@gmail.com',mobileNumber:'09123456789',location:'Test address',country:'Philippines',province:'Laguna',city:'Calamba',barangay:'Test',postalCode:'4027',paymentMethod:'ONLINE',items:[{id:p.id,batchId:a.id,qty:2,expectedUnitPrice:100},{id:p.id,batchId:b.id,qty:1,expectedUnitPrice:130}]},'customer');
      assert.equal(result.status,201,JSON.stringify(result.body));assert.equal(result.body.subtotalAmount,330);
      const lines=(await pool.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id',[result.body.id])).rows;
      assert.equal(lines.length,2);assert.equal(lines[0].unit_price,'100.00');assert.equal(lines[1].unit_price,'130.00');
      const reservedHistory=(await request(`/api/admin/inventory/history?productId=${p.id}&action=Reservation+Created`)).body.entries;
      assert.equal(reservedHistory.length,2);
      for(const entry of reservedHistory){
        assert.equal(entry.transaction.items.length,1);
        assert.equal(Number(entry.transaction.items[0].batchId),Number(entry.batch_id));
        assert.equal(Number(entry.transaction.items[0].unitPrice),Number(entry.batch_id)===a.id?100:130);
      }
      const row=await orderRow(result.body.id);sessionPayments.set(row.paymongo_checkout_session_id,[{id:'pay_wrong_amount',attributes:{status:'paid',amount:1,currency:'PHP'}}]);
      assert.equal((await request(`/api/orders/${row.id}/payment/verify`,'POST',{},'customer')).body.paymentStatus,'Refund Pending');
      assert.equal((await batchRow(a.id)).reserved_stock,0);assert.equal((await batchRow(a.id)).stock,2);
    });
    const {checkReports}=await import('./reportChecks.js');
    await checkReports({t,pool,request,fetch:originalFetch,base,token});
    const {checkCheckout}=await import('./checkoutChecks.js');
    await checkCheckout({t,pool,request,create,fetch:originalFetch,base});
    const {checkSupplies}=await import('./supplyChecks.js');
    await checkSupplies({t,pool,request,create,webhook,expireReservations,fetch:originalFetch,base});
    const {checkRiderManagement}=await import('./riderManagementChecks.js');
    await checkRiderManagement({t,pool,request,fetch:originalFetch,base});
    await t.test('Authentication events appear in admin-only System Logs without credentials or reset tokens',async()=>{
      assert.equal((await request('/api/auth/login','POST',{email:'staff-test@example.com',password:'audit-fixture-wrong',workspace:'staff'})).status,401);
      const logs=await request('/api/admin/logs');assert.equal(logs.status,200);
      assert.ok(logs.body.logs.some(row=>row.event_type==='security'&&row.action==='Login Failed'));
      const serialized=JSON.stringify(logs.body);assert.ok(!serialized.includes('audit-fixture-wrong'));assert.ok(!serialized.includes('token_hash'));
      assert.equal((await request('/api/admin/logs','GET',undefined,'rider')).status,403);
      assert.equal((await request('/api/admin/logs','GET',undefined,'customer')).status,403);
    });
    const {checkLettuceQuantity}=await import('./lettuceQuantityChecks.js');
    await checkLettuceQuantity({t,pool,request,create,checkout,base,token,originalFetch,webhook,expireReservations});
  } finally {
    globalThis.fetch = originalFetch;
    if (server) await new Promise(resolve => server.close(resolve));
    for (const url of createdImageUrls) {
      assert.match(url, /^\/uploads\/[a-zA-Z0-9._-]+$/);
      await fs.unlink(new URL('../' + url.slice(1), import.meta.url)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    // Only the randomly generated test schema is removed; no production tables are touched.
    assert.match(schema, /^inventory_test_[a-f0-9]{12}$/);
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
