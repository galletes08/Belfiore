import {registerSupplyRoutes} from './gardening-supplies.js';
import {supplyProduct} from '../utils/supplies.js';
import { pool } from '../config/db.js';
import { verifyRequestToken } from '../utils/auth.js';
import { inventoryContext, inventoryError } from '../utils/inventory.js';
import { storeUploadedImage } from '../utils/storage.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { registerHarvestRoutes } from './harvest-batches.js';
import { createHarvestBatch,readHarvest,refreshHarvest } from '../utils/harvest.js';
import { isOutOfStock } from '../../../shared/inventoryRules.js';

const PRODUCT_SELECT = `SELECT p.*, COALESCE(c.name, p.category, 'Aloe Hybrids') AS category,
  COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE oi.product_id=p.id AND o.inventory_state IN ('committed','legacy') AND o.inventory_restored_at IS NULL
    AND o.status IN ('Pending','Preparing','Cancellation Requested')),0)::int AS committed_stock,
  (SELECT reason FROM inventory_movements m WHERE m.product_id=p.id AND m.action='Product Archived'
    ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS archive_reason,
  inventory_product_status(p) AS inventory_status FROM products p
  LEFT JOIN types t ON t.id = p.type_id LEFT JOIN categories c ON c.id = t.category_id`;

function admin(req, res, next) {
  try {
    req.inventoryUser = verifyRequestToken(req);
    if (req.inventoryUser.role !== 'admin') throw inventoryError('Admin access only', 403);
    next();
  } catch (error) { res.status(error.status || 401).json({ error: error.message }); }
}
function actor(req) { return `Admin ${req.inventoryUser.email || req.inventoryUser.id}`; }
function validId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw inventoryError('Invalid product ID', 400);
  return id;
}
function productValues(body, current = null) {
  const type = body.inventoryType || current?.inventory_type || (String(body.category).toLowerCase() === 'aquaponics' ? 'edible' : 'succulent');
  if (!['succulent', 'edible'].includes(type)) throw inventoryError('Invalid product type', 400);
  if (current && type !== current.inventory_type) throw inventoryError('Product type cannot change; archive and create a new product', 400);
  const name = String(body.name ?? current?.name ?? '').trim();
  const tag = type === 'succulent' ? String(body.tag ?? current?.tag ?? '').trim() : 'aquaponics';
  const priceInput = body.price ?? current?.price;
  const price = Number(priceInput);
  const stock = Number(body.stock ?? current?.stock ?? (type === 'succulent' ? 1 : 0));
  const threshold = Number(body.lowStockThreshold ?? current?.low_stock_threshold ?? 5);
  const code = String(body.productCode ?? current?.product_code ?? '').trim();
  if (!name) throw inventoryError('Product name is required', 400);
  if (type === 'succulent' && !['white', 'green', 'red'].includes(tag.toLowerCase())) throw inventoryError('Select White, Green, or Red tag', 400);
  if (priceInput == null || String(priceInput).trim() === '' || !Number.isFinite(price) || price < 0) throw inventoryError('Enter a valid selling price', 400);
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647) throw inventoryError('Invalid quantity', 400);
  if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 2147483647) throw inventoryError('Invalid low stock threshold', 400);
  if (!current && type === 'succulent' && stock !== 1) throw inventoryError('Each succulent must have quantity one', 400);
  if (current && stock !== current.stock) throw inventoryError('Use Stock Adjustment to change quantity', 400);
  if (code.length > 80) throw inventoryError('Product code must be at most 80 characters', 400);
  return { type, name, tag, price, stock, threshold, code, category: type === 'edible' ? 'Aquaponics' : 'Aloe Hybrids',
    description: String(body.description ?? current?.description ?? '').trim() };
}

export function registerInventoryRoutes(router, { upload, ensureTypeId, mapProductRow, removeUploadedFiles, storeImage = storeUploadedImage }) {
  registerSupplyRoutes(router,{admin,actor,upload,removeUploadedFiles});
  registerHarvestRoutes(router,admin,actor);
  router.get('/api/products', async (_req, res) => {
    try {
      await refreshHarvest(pool);
      const result = await pool.query(`${PRODUCT_SELECT} WHERE p.archived_at IS NULL AND NOT p.legacy_quantity_review ORDER BY p.id DESC`);
      const batches=await readHarvest(pool);
      res.json(await Promise.all(result.rows.map(async row=>{
        const choices=batches.filter(b=>b.product_id===Number(row.id)&&b.available_stock>0);
        return supplyProduct(pool,{...mapProductRow(row),stock:row.inventory_type==='edible'?choices.reduce((sum,b)=>sum+b.available_stock,0):Number(row.stock),
          batches:choices.map(b=>({id:b.id,batch_code:b.batch_code,harvest_date:b.harvest_date,age_days:b.age_days,status:b.status,price:b.price,available_stock:b.available_stock}))},true);
      })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.get('/api/admin/inventory', admin, async (_req, res) => {
    try {
      await refreshHarvest(pool);
      const result = await pool.query(`${PRODUCT_SELECT} ORDER BY p.id DESC`);
      const batches=await readHarvest(pool);
      const products = await Promise.all(result.rows.map(async row=>supplyProduct(pool,{...mapProductRow(row),stock:row.inventory_type==='edible'?batches.filter(b=>b.product_id===Number(row.id)).reduce((sum,b)=>sum+(row.archived_at?0:b.available_stock),0):Number(row.stock), batches:batches.filter(b=>b.product_id===Number(row.id)),
        physicalStock:row.inventory_type==='edible'?batches.filter(b=>b.product_id===Number(row.id)).reduce((sum,b)=>sum+b.physical_stock,0):mapProductRow(row).physicalStock })));
      const active = products.filter(p => !p.archivedAt);
      res.json({ products, summary: {
        totalProducts: active.length,
        succulentUnits: active.filter(p => p.inventoryType === 'succulent' && p.status === 'Available').reduce((n, p) => n + p.stock, 0),
        ediblePacks: active.filter(p => p.inventoryType === 'edible').reduce((n, p) => n + p.stock, 0),
        lowStock: active.reduce((n,p)=>n+(p.inventoryType==='GARDENING_SUPPLY'?p.variants.filter(v=>v.status==='Low Stock').length:p.status==='Low Stock'?1:0),0),
        outOfStock: active.reduce((n,p)=>n+(p.inventoryType==='GARDENING_SUPPLY'?p.variants.filter(v=>v.status==='Out of Stock').length:isOutOfStock(p)?1:0),0),
        outOfStockRule: 'Active zero-sellable records requiring attention; sold and reserved succulents are excluded.',
        succulents: active.filter(p => p.inventoryType === 'succulent').length,
        ediblePlants: active.filter(p => p.inventoryType === 'edible').length,
        reservedSucculents: active.filter(p => p.inventoryType === 'succulent').reduce((n, p) => n + p.reservedStock, 0),
        reservedPacks: active.filter(p => p.inventoryType === 'edible').reduce((n, p) => n + p.reservedStock, 0),
        agingBatches:batches.filter(b=>!b.archived_at&&b.status==='Aging'&&b.physical_stock>0).length,
        onHoldPacks:batches.filter(b=>!b.archived_at&&['On Hold','Unsellable','Unverified'].includes(b.status)).reduce((sum,b)=>sum+b.physical_stock,0),
        disposalBatches:batches.filter(b=>!b.archived_at&&b.status==='For Disposal'&&b.physical_stock>0).length,
      } });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.get('/api/admin/inventory/history', admin, async (req, res) => {
    try {
      const page = req.query.page === undefined ? 1 : Number(req.query.page);
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000000) throw inventoryError('Invalid history page', 400);
      const fromDate = String(req.query.fromDate || '');
      const toDate = String(req.query.toDate || '');
      for (const value of [fromDate, toDate]) {
        if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') ||
          !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)) {
          throw inventoryError('Enter a valid date in YYYY-MM-DD format', 400);
        }
      }
      if (fromDate && toDate && fromDate > toDate) throw inventoryError('From Date must be on or before To Date', 400);
      const productId = req.query.productId ? validId(req.query.productId) : null;
      const search = String(req.query.search || '').trim();
      const action = String(req.query.action || '');
      const actions = ['Stock Initialized','Variant Archived','Product Added', 'Product Updated', 'Stock In', 'Stock Out', 'Product Reserved', 'Reservation Released', 'Product Sold', 'Product Archived', 'Product Restored', 'Inventory Adjustment','Harvest Batch Created','Condition Updated','Price Adjusted','Aging Alert','Automatically Placed On Hold','Marked For Disposal','Disposal Confirmed','Reservation Created','Batch Sold / Allocated'];
      if (action && !actions.includes(action)) throw inventoryError('Invalid activity type', 400);
      const batchId=req.query.batchId?validId(req.query.batchId):null;
      const values = [productId, `%${search}%`, action, fromDate || null, toDate || null,batchId];
      const where = `WHERE ($1::bigint IS NULL OR product_id = $1) AND
        (product_name ILIKE $2 OR product_code ILIKE $2 OR reason ILIKE $2 OR variant_name ILIKE $2) AND ($3 = '' OR action = $3)
        AND ($4::date IS NULL OR created_at >= ($4::date::timestamp AT TIME ZONE 'Asia/Manila'))
        AND ($5::date IS NULL OR created_at < (($5::date + 1)::timestamp AT TIME ZONE 'Asia/Manila'))`;
      const batchWhere=where+' AND ($6::bigint IS NULL OR batch_id=$6)';
      const count = await pool.query(`SELECT COUNT(*)::int AS count FROM inventory_movements ${batchWhere}`, values);
      const rows = await pool.query(`SELECT *, COALESCE(previous_physical_stock,previous_quantity + COALESCE(previous_reserved,0)) AS previous_recorded_stock,
        COALESCE(new_physical_stock,new_quantity + new_reserved) AS new_recorded_stock,
        CASE WHEN action IN ('Stock In','Stock Out') THEN ABS(new_quantity-previous_quantity) END AS adjustment_quantity
        FROM inventory_movements ${batchWhere} ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET $7`, [...values, (page - 1) * 50]);
      // Enrich only the current history page, using explicit order/product/batch relationships.
      const transactions = rows.rows.length ? await pool.query(`SELECT m.id AS movement_id,
        o.id AS order_id,o.customer_name,o.payment_method,o.payment_status,o.cod_status,o.status AS order_status,
        r.status AS reservation_status,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',oi.id,'productName',oi.product_name,
          'productCode',COALESCE(oi.product_code,m.product_code),'quantity',oi.qty,'unitPrice',oi.unit_price,
          'lineTotal',oi.line_total,'inventoryType',oi.inventory_type,'batchId',oi.batch_id,'batchCode',oi.batch_code,'tag',oi.product_tag)
          ORDER BY oi.id) FROM order_items oi WHERE oi.order_id=o.id AND oi.product_id=m.product_id
          AND (m.batch_id IS NULL OR oi.batch_id=m.batch_id)), '[]'::jsonb) AS items
        FROM inventory_movements m JOIN orders o ON o.id=m.order_id
        LEFT JOIN inventory_reservations r ON r.order_id=o.id
        WHERE m.id=ANY($1::bigint[]) AND m.action IN
          ('Product Sold','Product Reserved','Reservation Released','Reservation Created','Batch Sold / Allocated','Stock In','Stock Out')`, [rows.rows.map(row=>row.id)]) : {rows:[]};
      const transactionMap = new Map(transactions.rows.map(row=>[String(row.movement_id),row]));
      for (const entry of rows.rows) {
        // Actor labels may contain checkout emails; history needs the name, not contact data.
        entry.actor = String(entry.actor || '').replace(/[^\s<>]+@[^\s<>]+/g, '[email hidden]');
        const transaction = transactionMap.get(String(entry.id));
        entry.transaction = transaction && transaction.items.length ? {
          orderId:transaction.order_id, customerName:transaction.customer_name,
          paymentMethod:transaction.payment_method, paymentStatus:transaction.payment_status,
          codStatus:transaction.cod_status, orderStatus:transaction.order_status,
          reservationStatus:transaction.reservation_status, items:transaction.items,
        } : null;
        entry.canViewOrder = Boolean(entry.transaction);
      }
      res.json({ entries: rows.rows, total: count.rows[0].count, page, pageSize: 50, timeZone: 'Asia/Manila' });
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });

  const create = (bulk) => async (req, res) => {
    const files = bulk ? req.files || [] : req.file ? [req.file] : [];
    let client;
    try {
      const value = productValues(req.body);
      const requestKey = String(req.get('Idempotency-Key') || '').trim();
      if (bulk && !requestKey) throw inventoryError('Upload request key is missing. Refresh Inventory and select the images again.', 400);
      if (requestKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) throw inventoryError('Invalid upload request key', 400);
      if (bulk && (value.type !== 'succulent' || !files.length)) throw inventoryError('Bulk creation needs individual succulent images', 400);
      if (bulk && value.code) throw inventoryError('Leave code blank for automatically generated bulk codes', 400);
      const fileHashes = [];
      for (const file of files) {
        const bytes = file.buffer || await fs.readFile(file.path);
        fileHashes.push({ name: file.originalname, type: file.mimetype, hash: createHash('sha256').update(bytes).digest('hex') });
      }
      const fingerprint = createHash('sha256').update(JSON.stringify({ bulk, value, status: req.body.status || 'Available', imageUrl: req.body.imageUrl || '', files: fileHashes })).digest('hex');
      client = await pool.connect();
      await client.query('BEGIN');
      if (requestKey) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [requestKey]);
        const previous = (await client.query('SELECT * FROM inventory_product_requests WHERE request_key=$1', [requestKey])).rows[0];
        if (previous) {
          if (previous.actor !== actor(req) || previous.fingerprint !== fingerprint) throw inventoryError('This upload request key belongs to a different submission. Select the files again.', 409);
          await client.query('COMMIT');
          removeUploadedFiles(files);
          res.set('Idempotency-Replayed', 'true');
          return res.status(200).json(previous.response);
        }
      }
      // Serialize taxonomy creation; product stock operations remain independently concurrent.
      await client.query('SELECT pg_advisory_xact_lock(71600402)');
      if(value.type==='edible'&&(await client.query("SELECT id FROM products WHERE inventory_type='edible' AND LOWER(BTRIM(name))=LOWER(BTRIM($1)) LIMIT 1",[value.name])).rows.length) throw inventoryError('This lettuce variety already has a main product listing. Add a harvest batch to that listing instead.');
      const typeId = await ensureTypeId(client, value.category, value.tag);
      await inventoryContext(client, { actor: actor(req), reason: 'New inventory product' });
      const products = [];
      for (const file of bulk ? files : [req.file]) {
        let image;
        try { image = file ? await storeImage(file, 'products') : String(req.body.imageUrl || ''); }
        catch { throw inventoryError(`Could not store image "${file.originalname}". No products were created. Please retry this batch.`, 502); }
        const result = await client.query(`INSERT INTO products(type_id, category, inventory_type, name, product_code,
          tag, price, stock, low_stock_threshold, description, image_url, archived_at)
          VALUES ($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,$9,$10,$11,CASE WHEN $12 THEN NOW() ELSE NULL END) RETURNING id`,
        [typeId, value.category, value.type, value.name, value.code, value.tag, value.price, value.type==='edible'?0:value.stock,
          value.threshold, value.description, image, req.body.status === 'Archived']);
        if(value.type==='edible'&&value.stock>0) await createHarvestBatch(client,{id:result.rows[0].id,price:value.price},{quantity:value.stock,harvestDate:req.body.harvestDate,allowUnverified:true,reason:'Initial inventory',notes:'Unknown harvest dates remain unverified'},actor(req));
        const row = await client.query(`${PRODUCT_SELECT} WHERE p.id = $1`, [result.rows[0].id]);
        products.push({...mapProductRow(row.rows[0]),batches:await readHarvest(client,result.rows[0].id)});
      }
      const response = bulk ? { count: products.length, products } : products[0];
      if (requestKey) await client.query('INSERT INTO inventory_product_requests(request_key,actor,fingerprint,response) VALUES($1,$2,$3,$4::jsonb)', [requestKey, actor(req), fingerprint, JSON.stringify(response)]);
      await client.query('COMMIT');
      res.status(201).json(response);
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      removeUploadedFiles(files);
      res.status(error.code === '23505' ? 409 : error.status || 500).json({ error: error.code === '23505' ? 'Product code is already used' : error.message });
    } finally { client?.release(); }
  };
  const uploadImages = middleware => (req, res, next) => middleware(req, res, error => {
    if (!error) return next();
    removeUploadedFiles(req.files || (req.file ? [req.file] : []));
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 5MB or smaller.'
      : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE' ? 'Select up to 50 images using the correct image field.'
        : 'Only image files can be uploaded.';
    res.status(400).json({ error: `${message} No products were created.`, count: 0 });
  });
  router.post('/api/products/bulk', admin, uploadImages(upload.array('images', 50)), create(true));
  router.post('/api/products', admin, uploadImages(upload.single('image')), create(false));
  router.patch('/api/products/:id', admin, upload.single('image'), async (req, res) => {
    let client;
    try {
      const id = validId(req.params.id);
      client = await pool.connect();
      await client.query('BEGIN');
      const current = (await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!current) throw inventoryError('Product not found', 404);
      if (current.inventory_type === 'succulent') {
        const sale = await client.query(`SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id
          WHERE oi.product_id=$1 AND o.status <> 'Cancelled' AND (o.status='Delivered' OR o.payment_status IN ('Paid','Refund Pending','Refunded')) LIMIT 1`, [id]);
        if (current.sold_at || sale.rows.length) throw inventoryError('Sold succulents are read-only. Use a separately authorized, audited correction or return workflow.', 409);
      }
      const value = productValues(req.body, current);
      const image = req.file ? await storeUploadedImage(req.file, 'products') : req.body.imageUrl ?? current.image_url;
      await inventoryContext(client, { actor: actor(req), action: 'Product Updated', reason: String(req.body.reason || 'Product details updated') });
      await client.query(`UPDATE products SET name=$2, product_code=$3, tag=$4, price=$5,
        low_stock_threshold=$6, description=$7, image_url=$8 WHERE id=$1`,
      [id, value.name, value.code, value.tag, value.price, value.threshold, value.description, image]);
      const row = await client.query(`${PRODUCT_SELECT} WHERE p.id=$1`, [id]);
      await client.query('COMMIT');
      res.json(mapProductRow(row.rows[0]));
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      if (req.file) removeUploadedFiles([req.file]);
      res.status(error.code === '23505' ? 409 : error.status || 500).json({ error: error.code === '23505' ? 'Product code is already used' : error.message });
    } finally { client?.release(); }
  });
  const listingAction = restore => async (req, res) => {
    let client;
    try {
      const reason = String(req.body?.reason || '').trim();
      if (!reason || reason.length > 1000) throw inventoryError('A reason between 1 and 1000 characters is required', 400);
      const archiveReasons = ['Damaged Plant', 'Dead Plant', 'No Longer for Sale', 'Temporarily Unavailable', 'Other Reason'];
      const reasonType = String(req.body?.reasonType || '');
      if (!restore && (!archiveReasons.includes(reasonType) || (reasonType === 'Other Reason' && reason.length < 3)))
        throw inventoryError('Select an archive reason; Other Reason requires a description', 400);
      client = await pool.connect();
      await client.query('BEGIN');
      const id = validId(req.params.id);
      const product = (await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!product) throw inventoryError('Product not found', 404);
      if (restore ? !product.archived_at : product.archived_at) throw inventoryError(restore ? 'This product is already active.' : 'This product is already archived.');
      const reservation = await client.query(`SELECT 1 FROM order_items oi JOIN inventory_reservations r ON r.order_id=oi.order_id
        WHERE oi.product_id=$1 AND r.status='active' LIMIT 1`, [id]);
      if (product.reserved_stock > 0 || reservation.rows.length) throw inventoryError('This product has an active reservation.');
      const commitments = await client.query(`SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE oi.product_id=$1 AND o.status NOT IN ('Cancelled','Delivered') LIMIT 1`, [id]);
      if (commitments.rows.length) throw inventoryError('This product has an active order commitment. Resolve the order before changing its listing state.');
      if (restore) {
        if (!String(product.product_code || '').trim()) throw inventoryError('This product requires a valid unique Product Code before restoration.');
        const duplicate = await client.query('SELECT 1 FROM products WHERE LOWER(product_code)=LOWER($1) AND id<>$2 LIMIT 1', [product.product_code, id]);
        if (duplicate.rows.length) throw inventoryError('Product Code is already used by another product.');
        if (product.inventory_type === 'succulent') {
          const sold = await client.query(`SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id
            WHERE oi.product_id=$1 AND o.status <> 'Cancelled' AND (o.status='Delivered' OR o.payment_status IN ('Paid','Refund Pending','Refunded')) LIMIT 1`, [id]);
          if (product.sold_at || sold.rows.length) throw inventoryError('This product has already been sold. A separately validated return and restocking workflow is required.');
          if (product.legacy_quantity_review || product.stock !== 1) throw inventoryError('This product requires inventory validation before restoration. Verify each physical plant, create individual listings, and keep this legacy record archived.');
        }
        if (product.stock > 0 && req.body?.confirmSellable !== true) throw inventoryError('Confirm that the physical inventory has been inspected and is available and sellable.', 400);
      }
      await inventoryContext(client, { actor: actor(req), action: restore ? 'Product Restored' : 'Product Archived',
        reason: restore ? reason : reasonType === 'Other Reason' ? `Other Reason: ${reason}` : reasonType });
      await client.query('UPDATE products SET archived_at=CASE WHEN $2 THEN NULL ELSE NOW() END WHERE id=$1', [id, restore]);
      const updated = await client.query(`${PRODUCT_SELECT} WHERE p.id=$1`, [id]);
      await client.query('COMMIT');
      res.json({ product: mapProductRow(updated.rows[0]), message: restore ? 'Product restored successfully.' : 'Product archived successfully.' });
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      res.status(error.status || 500).json({ error: error.message });
    } finally { client?.release(); }
  };
  router.post('/api/admin/inventory/:id/archive', admin, listingAction(false));
  router.post('/api/admin/inventory/:id/restore', admin, listingAction(true));
  // Legacy endpoint remains a soft archive, subject to the same validations.
  router.delete('/api/products/:id', admin, listingAction(false));
}
