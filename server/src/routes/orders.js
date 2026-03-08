import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();
let ensureOrdersAdminColumnsPromise;

const ORDER_STATUSES = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
const TRACKING_STATUSES = ['Pending', 'Preparing', 'Packed', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'];
const PAYMENT_STATUSES = ['Pending', 'Paid', 'Unpaid', 'Failed', 'Refunded'];

function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toUpperCase();
  if (method === 'COD') return 'COD';
  if (method === 'ONLINE') return 'ONLINE';
  return '';
}

function normalizeOption(value, allowedValues) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowedValues.find((option) => option.toLowerCase() === normalized) || '';
}

function deriveTrackingStatus(orderStatus) {
  switch (orderStatus) {
    case 'Preparing':
      return 'Preparing';
    case 'Out for Delivery':
      return 'Out for Delivery';
    case 'Delivered':
      return 'Delivered';
    case 'Cancelled':
      return 'Cancelled';
    default:
      return 'Pending';
  }
}

function formatOrderRow(row) {
  return {
    id: Number(row.id),
    orderCode: `ORD-${String(row.id).padStart(3, '0')}`,
    customerName: row.customer_name,
    gmail: row.gmail || '',
    mobileNumber: row.mobile_num || '',
    location: row.location || '',
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    courierName: row.courier_name || '',
    trackingCode: row.tracking_code || '',
    trackingStatus: row.tracking_status || deriveTrackingStatus(row.status),
    totalAmount: Number(row.total_amount || 0),
    itemCount: Number(row.item_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.status_updated_at || row.created_at,
    statusUpdatedAt: row.status_updated_at || row.updated_at || row.created_at,
    items: Array.isArray(row.items) ? row.items.map((item) => ({
      id: Number(item.id),
      productId: item.productId == null ? null : Number(item.productId),
      productName: item.productName,
      imageUrl: item.imageUrl || '',
      qty: Number(item.qty || 0),
      unitPrice: Number(item.unitPrice || 0),
      lineTotal: Number(item.lineTotal || 0),
    })) : [],
  };
}

async function ensureOrderAdminColumns() {
  if (!ensureOrdersAdminColumnsPromise) {
    ensureOrdersAdminColumnsPromise = pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS courier_name TEXT,
        ADD COLUMN IF NOT EXISTS tracking_code TEXT,
        ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'Pending',
        ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);
  }
  await ensureOrdersAdminColumnsPromise;
}

router.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureOrderAdminColumns();

    const fullName = String(req.body?.fullName || '').trim();
    const gmail = String(req.body?.gmail || '').trim();
    const mobileNumber = String(req.body?.mobileNumber || '').trim();
    const location = String(req.body?.location || '').trim();
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!fullName) return res.status(400).json({ error: 'Full name is required' });
    if (!gmail || !/^[^\s@]+@gmail\.com$/i.test(gmail)) {
      return res.status(400).json({ error: 'Valid Gmail is required' });
    }
    if (!mobileNumber || !/^[0-9+\-\s()]{7,15}$/.test(mobileNumber)) {
      return res.status(400).json({ error: 'Valid mobile number is required' });
    }
    if (!location) return res.status(400).json({ error: 'Location is required' });
    if (!paymentMethod) return res.status(400).json({ error: 'Payment method must be COD or ONLINE' });
    if (!items.length) return res.status(400).json({ error: 'Order items are required' });

    const requestedItems = items
      .map((item) => ({
        productId: Number(item?.id),
        qty: Number(item?.qty),
      }))
      .filter((item) => Number.isInteger(item.productId) && item.productId > 0 && Number.isInteger(item.qty) && item.qty > 0);

    if (!requestedItems.length) return res.status(400).json({ error: 'Invalid order items payload' });

    const qtyById = new Map();
    for (const item of requestedItems) {
      qtyById.set(item.productId, (qtyById.get(item.productId) || 0) + item.qty);
    }

    const productIds = [...qtyById.keys()];
    const productsResult = await client.query(
      `
      SELECT id, name, price, stock, image_url
      FROM products
      WHERE id = ANY($1::bigint[])
      `,
      [productIds]
    );

    if (productsResult.rows.length !== productIds.length) {
      return res.status(400).json({ error: 'One or more products no longer exist' });
    }

    const productsById = new Map(productsResult.rows.map((row) => [Number(row.id), row]));
    const orderItems = [];
    let totalAmount = 0;

    for (const [productId, qty] of qtyById.entries()) {
      const product = productsById.get(productId);
      const stock = Number(product.stock);
      const unitPrice = Number(product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: `Invalid product price for product ${productId}` });
      }
      if (!Number.isInteger(stock) || stock < qty) {
        return res.status(400).json({ error: `${product.name} has insufficient stock` });
      }
      const lineTotal = unitPrice * qty;
      totalAmount += lineTotal;
      orderItems.push({
        productId,
        productName: product.name,
        imageUrl: product.image_url || null,
        qty,
        unitPrice,
        lineTotal,
      });
    }

    await client.query('BEGIN');

    const orderResult = await client.query(
      `
      INSERT INTO orders (
        customer_name, gmail, mobile_num, location, payment_method,
        payment_status, status, tracking_status, total_amount, status_updated_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'Pending', 'Pending', $7, NOW(), NOW())
      RETURNING id, status, tracking_status, total_amount, created_at, updated_at, status_updated_at
      `,
      [fullName, gmail, mobileNumber, location, paymentMethod, paymentMethod === 'ONLINE' ? 'Pending' : 'Unpaid', totalAmount]
    );

    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `
        INSERT INTO order_items (order_id, product_id, product_name, image_url, qty, unit_price, line_total)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [order.id, item.productId, item.productName, item.imageUrl, item.qty, item.unitPrice, item.lineTotal]
      );

      const stockUpdate = await client.query(
        `
        UPDATE products
        SET stock = stock - $1
        WHERE id = $2 AND stock >= $1
        RETURNING id
        `,
        [item.qty, item.productId]
      );
      if (!stockUpdate.rows.length) {
        throw new Error(`Stock changed for product ${item.productName}. Please retry checkout.`);
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      id: Number(order.id),
      status: order.status,
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message || 'Failed to place order' });
  } finally {
    client.release();
  }
});

router.post('/api/orders/lookup', async (req, res) => {
  try {
    await ensureOrderAdminColumns();

    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    if (!ids.length) {
      return res.json([]);
    }

    const uniqueIds = [...new Set(ids)];
    const result = await pool.query(`
      SELECT
        o.id,
        o.customer_name,
        o.gmail,
        o.mobile_num,
        o.location,
        o.payment_method,
        o.payment_status,
        o.status,
        o.courier_name,
        o.tracking_code,
        o.tracking_status,
        o.total_amount,
        o.created_at,
        o.updated_at,
        o.status_updated_at,
        COALESCE(SUM(oi.qty), 0)::int AS item_count,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'productId', oi.product_id,
              'productName', oi.product_name,
              'imageUrl', oi.image_url,
              'qty', oi.qty,
              'unitPrice', oi.unit_price,
              'lineTotal', oi.line_total
            )
            ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ANY($1::bigint[])
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [uniqueIds]);

    res.json(result.rows.map(formatOrderRow));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load customer orders' });
  }
});

router.get('/api/admin/orders', async (_req, res) => {
  try {
    await ensureOrderAdminColumns();

    const result = await pool.query(`
      SELECT
        o.id,
        o.customer_name,
        o.gmail,
        o.mobile_num,
        o.location,
        o.payment_method,
        o.payment_status,
        o.status,
        o.courier_name,
        o.tracking_code,
        o.tracking_status,
        o.total_amount,
        o.created_at,
        o.updated_at,
        o.status_updated_at,
        COALESCE(SUM(oi.qty), 0)::int AS item_count,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'productId', oi.product_id,
              'productName', oi.product_name,
              'imageUrl', oi.image_url,
              'qty', oi.qty,
              'unitPrice', oi.unit_price,
              'lineTotal', oi.line_total
            )
            ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);

    res.json(result.rows.map(formatOrderRow));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load orders' });
  }
});

router.patch('/api/admin/orders/:id', async (req, res) => {
  try {
    await ensureOrderAdminColumns();

    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const status = normalizeOption(req.body?.status, ORDER_STATUSES);
    const trackingStatus = normalizeOption(req.body?.trackingStatus, TRACKING_STATUSES);
    const paymentStatus = normalizeOption(req.body?.paymentStatus, PAYMENT_STATUSES);
    const courierName = String(req.body?.courierName || '').trim();
    const trackingCode = String(req.body?.trackingCode || '').trim();

    if (!status) {
      return res.status(400).json({ error: 'Valid order status is required' });
    }

    if (req.body?.trackingStatus && !trackingStatus) {
      return res.status(400).json({ error: 'Valid tracking status is required' });
    }

    if (req.body?.paymentStatus && !paymentStatus) {
      return res.status(400).json({ error: 'Valid payment status is required' });
    }

    const finalTrackingStatus = trackingStatus || deriveTrackingStatus(status);

    const result = await pool.query(
      `
      UPDATE orders
      SET
        status = $2,
        payment_status = COALESCE(NULLIF($3, ''), payment_status),
        courier_name = $4,
        tracking_code = $5,
        tracking_status = $6,
        status_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        customer_name,
        gmail,
        mobile_num,
        location,
        payment_method,
        payment_status,
        status,
        courier_name,
        tracking_code,
        tracking_status,
        total_amount,
        created_at,
        updated_at,
        status_updated_at
      `,
      [orderId, status, paymentStatus, courierName, trackingCode, finalTrackingStatus]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const itemsResult = await pool.query(
      `
      SELECT
        id,
        product_id AS "productId",
        product_name AS "productName",
        image_url AS "imageUrl",
        qty,
        unit_price AS "unitPrice",
        line_total AS "lineTotal"
      FROM order_items
      WHERE order_id = $1
      ORDER BY id
      `,
      [orderId]
    );

    res.json(formatOrderRow({
      ...result.rows[0],
      item_count: itemsResult.rows.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      items: itemsResult.rows,
    }));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update order' });
  }
});

export default router;
