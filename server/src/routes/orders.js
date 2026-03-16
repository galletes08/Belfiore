import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../config/db.js';
import { ensureRidersTable } from './riders.js';
import { createPayMongoCheckoutSession, isPayMongoConfigured } from '../utils/paymongo.js';

const router = Router();
let ensureOrdersAdminColumnsPromise;

const ORDER_STATUSES = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
const TRACKING_STATUSES = ['Pending', 'Preparing', 'Packed', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'];
const PAYMENT_STATUSES = ['Pending', 'Paid', 'Unpaid', 'Failed', 'Refunded'];

const BASE_ORDER_SELECT = `
  SELECT
    o.id,
    o.customer_name,
    o.gmail,
    o.mobile_num,
    o.location,
    o.customer_latitude,
    o.customer_longitude,
    o.payment_method,
    o.payment_status,
    o.status,
    o.rider_id,
    COALESCE(NULLIF(TRIM(o.courier_name), ''), CONCAT_WS(' ', r.first_name, r.last_name)) AS courier_name,
    COALESCE(NULLIF(TRIM(o.driver_phone), ''), r.phone) AS driver_phone,
    o.driver_access_token,
    o.driver_assigned_at,
    o.driver_accepted_at,
    o.driver_latitude,
    o.driver_longitude,
    o.driver_location_updated_at,
    o.tracking_code,
    o.tracking_status,
    o.paymongo_checkout_session_id,
    o.paymongo_payment_id,
    o.paymongo_payment_intent_id,
    o.paymongo_paid_at,
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
  LEFT JOIN riders r ON r.id = o.rider_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
`;

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

function normalizeCoordinate(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return Number.NaN;
  return numeric;
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

function formatOrderRow(row, options = {}) {
  const { includeDriverAccessToken = false } = options;

  return {
    id: Number(row.id),
    orderCode: `ORD-${String(row.id).padStart(3, '0')}`,
    customerName: row.customer_name,
    gmail: row.gmail || '',
    mobileNumber: row.mobile_num || '',
    location: row.location || '',
    customerLatitude: row.customer_latitude == null ? null : Number(row.customer_latitude),
    customerLongitude: row.customer_longitude == null ? null : Number(row.customer_longitude),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    riderId: row.rider_id == null ? null : Number(row.rider_id),
    courierName: row.courier_name || '',
    driverPhone: row.driver_phone || '',
    driverAssignedAt: row.driver_assigned_at || null,
    driverAcceptedAt: row.driver_accepted_at || null,
    driverLatitude: row.driver_latitude == null ? null : Number(row.driver_latitude),
    driverLongitude: row.driver_longitude == null ? null : Number(row.driver_longitude),
    driverLocationUpdatedAt: row.driver_location_updated_at || null,
    trackingCode: row.tracking_code || '',
    trackingStatus: row.tracking_status || deriveTrackingStatus(row.status),
    paymongoCheckoutSessionId: row.paymongo_checkout_session_id || '',
    paymongoPaymentId: row.paymongo_payment_id || '',
    paymongoPaymentIntentId: row.paymongo_payment_intent_id || '',
    paymongoPaidAt: row.paymongo_paid_at || null,
    totalAmount: Number(row.total_amount || 0),
    itemCount: Number(row.item_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.status_updated_at || row.created_at,
    statusUpdatedAt: row.status_updated_at || row.updated_at || row.created_at,
    items: Array.isArray(row.items)
      ? row.items.map((item) => ({
        id: Number(item.id),
        productId: item.productId == null ? null : Number(item.productId),
        productName: item.productName,
        imageUrl: item.imageUrl || '',
        qty: Number(item.qty || 0),
        unitPrice: Number(item.unitPrice || 0),
        lineTotal: Number(item.lineTotal || 0),
      }))
      : [],
    ...(includeDriverAccessToken ? { driverAccessToken: row.driver_access_token || '' } : {}),
  };
}

async function ensureOrderAdminColumns() {
  if (!ensureOrdersAdminColumnsPromise) {
    ensureOrdersAdminColumnsPromise = pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS courier_name TEXT,
        ADD COLUMN IF NOT EXISTS driver_phone TEXT,
        ADD COLUMN IF NOT EXISTS driver_access_token TEXT,
        ADD COLUMN IF NOT EXISTS driver_assigned_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS driver_accepted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS customer_latitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS customer_longitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS driver_latitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS driver_longitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS driver_location_updated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS rider_id BIGINT REFERENCES riders(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS tracking_code TEXT,
        ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'Pending',
        ADD COLUMN IF NOT EXISTS paymongo_checkout_session_id TEXT,
        ADD COLUMN IF NOT EXISTS paymongo_payment_id TEXT,
        ADD COLUMN IF NOT EXISTS paymongo_payment_intent_id TEXT,
        ADD COLUMN IF NOT EXISTS paymongo_paid_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `).then(() =>
      pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_driver_access_token
        ON orders(driver_access_token)
        WHERE driver_access_token IS NOT NULL
      `)
    );
  }
  await ensureOrdersAdminColumnsPromise;
}

async function fetchOrderById(orderId, options = {}) {
  const result = await pool.query(
    `
    ${BASE_ORDER_SELECT}
    WHERE o.id = $1
    GROUP BY o.id, r.first_name, r.last_name, r.phone
    `,
    [orderId]
  );

  if (!result.rows.length) return null;
  return formatOrderRow(result.rows[0], options);
}

router.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const fullName = String(req.body?.fullName || '').trim();
    const gmail = String(req.body?.gmail || '').trim();
    const mobileNumber = String(req.body?.mobileNumber || '').trim();
    const location = String(req.body?.location || '').trim();
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const customerLatitude = normalizeCoordinate(req.body?.customerLatitude, -90, 90);
    const customerLongitude = normalizeCoordinate(req.body?.customerLongitude, -180, 180);

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
    if (paymentMethod === 'ONLINE' && !isPayMongoConfigured()) {
      return res.status(503).json({ error: 'Online payment is not configured yet. Please set PayMongo credentials on the server.' });
    }
    if (Number.isNaN(customerLatitude) || Number.isNaN(customerLongitude)) {
      return res.status(400).json({ error: 'Invalid customer map coordinates' });
    }
    if ((customerLatitude == null) !== (customerLongitude == null)) {
      return res.status(400).json({ error: 'Customer latitude and longitude must be provided together' });
    }

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
        customer_name, gmail, mobile_num, location, customer_latitude, customer_longitude,
        payment_method, payment_status, status, tracking_status, total_amount, status_updated_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending', 'Pending', $9, NOW(), NOW())
      RETURNING id, status, tracking_status, total_amount, created_at, updated_at, status_updated_at
      `,
      [
        fullName,
        gmail,
        mobileNumber,
        location,
        customerLatitude,
        customerLongitude,
        paymentMethod,
        paymentMethod === 'ONLINE' ? 'Pending' : 'Unpaid',
        totalAmount,
      ]
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

    let checkoutSession = null;

    if (paymentMethod === 'ONLINE') {
      checkoutSession = await createPayMongoCheckoutSession({
        orderId: Number(order.id),
        orderCode: `ORD-${String(order.id).padStart(3, '0')}`,
        customerName: fullName,
        customerEmail: gmail,
        items: orderItems,
        requestOrigin: req.get('origin'),
      });

      if (!checkoutSession.checkoutUrl || !checkoutSession.id) {
        throw new Error('PayMongo did not return a valid checkout URL.');
      }

      await client.query(
        `
        UPDATE orders
        SET
          paymongo_checkout_session_id = $2,
          updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, checkoutSession.id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      id: Number(order.id),
      orderCode: `ORD-${String(order.id).padStart(3, '0')}`,
      paymentMethod,
      paymentStatus: paymentMethod === 'ONLINE' ? 'Pending' : 'Unpaid',
      checkoutUrl: checkoutSession?.checkoutUrl || '',
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
    await ensureRidersTable();

    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    if (!ids.length) {
      return res.json([]);
    }

    const uniqueIds = [...new Set(ids)];
    const result = await pool.query(
      `
      ${BASE_ORDER_SELECT}
      WHERE o.id = ANY($1::bigint[])
      GROUP BY o.id, r.first_name, r.last_name, r.phone
      ORDER BY o.created_at DESC
      `,
      [uniqueIds]
    );

    res.json(result.rows.map((row) => formatOrderRow(row)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load customer orders' });
  }
});

router.get('/api/admin/orders', async (_req, res) => {
  try {
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const result = await pool.query(`
      ${BASE_ORDER_SELECT}
      GROUP BY o.id, r.first_name, r.last_name, r.phone
      ORDER BY o.created_at DESC
    `);

    res.json(result.rows.map((row) => formatOrderRow(row, { includeDriverAccessToken: true })));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load orders' });
  }
});

router.patch('/api/admin/orders/:id', async (req, res) => {
  try {
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const status = normalizeOption(req.body?.status, ORDER_STATUSES);
    const trackingStatus = normalizeOption(req.body?.trackingStatus, TRACKING_STATUSES);
    const paymentStatus = normalizeOption(req.body?.paymentStatus, PAYMENT_STATUSES);
    const riderId = req.body?.riderId == null || req.body?.riderId === ''
      ? null
      : Number(req.body.riderId);
    const courierName = String(req.body?.courierName || '').trim();
    const driverPhone = String(req.body?.driverPhone || '').trim();
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
    if (riderId !== null && (!Number.isInteger(riderId) || riderId <= 0)) {
      return res.status(400).json({ error: 'Valid rider is required' });
    }

    let resolvedRiderName = courierName;
    let resolvedDriverPhone = driverPhone;

    if (riderId) {
      const riderResult = await pool.query(
        `
        SELECT id, first_name, last_name, phone
        FROM riders
        WHERE id = $1
        LIMIT 1
        `,
        [riderId]
      );

      if (!riderResult.rows.length) {
        return res.status(404).json({ error: 'Selected rider was not found' });
      }

      const rider = riderResult.rows[0];
      resolvedRiderName = `${rider.first_name || ''} ${rider.last_name || ''}`.trim();
      resolvedDriverPhone = rider.phone || '';
    }

    const existingResult = await pool.query(
      `
      SELECT rider_id, courier_name, driver_phone, driver_access_token, driver_assigned_at
      FROM orders
      WHERE id = $1
      LIMIT 1
      `,
      [orderId]
    );

    if (!existingResult.rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const existing = existingResult.rows[0];
    const assignmentChanged =
      riderId !== (existing.rider_id == null ? null : Number(existing.rider_id)) ||
      resolvedRiderName !== String(existing.courier_name || '') ||
      resolvedDriverPhone !== String(existing.driver_phone || '');

    const nextDriverAccessToken = resolvedRiderName
      ? assignmentChanged
        ? randomUUID()
        : String(existing.driver_access_token || randomUUID())
      : null;

    const finalTrackingStatus = trackingStatus || deriveTrackingStatus(status);

    await pool.query(
      `
      UPDATE orders
      SET
        status = $2,
        payment_status = COALESCE(NULLIF($3, ''), payment_status),
        rider_id = $4,
        courier_name = $5,
        driver_phone = $6,
        driver_access_token = $7,
        driver_assigned_at = CASE
          WHEN NULLIF($5, '') IS NULL THEN NULL
          WHEN $8::boolean OR driver_assigned_at IS NULL THEN NOW()
          ELSE driver_assigned_at
        END,
        driver_accepted_at = CASE
          WHEN NULLIF($5, '') IS NULL OR $8::boolean THEN NULL
          ELSE driver_accepted_at
        END,
        driver_latitude = CASE
          WHEN NULLIF($5, '') IS NULL OR $8::boolean THEN NULL
          ELSE driver_latitude
        END,
        driver_longitude = CASE
          WHEN NULLIF($5, '') IS NULL OR $8::boolean THEN NULL
          ELSE driver_longitude
        END,
        driver_location_updated_at = CASE
          WHEN NULLIF($5, '') IS NULL OR $8::boolean THEN NULL
          ELSE driver_location_updated_at
        END,
        tracking_code = $9,
        tracking_status = $10,
        status_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        orderId,
        status,
        paymentStatus,
        riderId,
        resolvedRiderName,
        resolvedDriverPhone,
        nextDriverAccessToken,
        assignmentChanged,
        trackingCode,
        finalTrackingStatus,
      ]
    );

    const updatedOrder = await fetchOrderById(orderId, { includeDriverAccessToken: true });
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update order' });
  }
});

router.get('/api/driver/orders/:token', async (req, res) => {
  try {
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Driver token is required' });
    }

    const result = await pool.query(
      `
      ${BASE_ORDER_SELECT}
      WHERE o.driver_access_token = $1
      GROUP BY o.id, r.first_name, r.last_name, r.phone
      LIMIT 1
      `,
      [token]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Driver order link is invalid or expired' });
    }

    res.json(formatOrderRow(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load driver order' });
  }
});

router.patch('/api/driver/orders/:token', async (req, res) => {
  try {
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Driver token is required' });
    }

    const acceptOrder = Boolean(req.body?.acceptOrder);
    const markDelivered = Boolean(req.body?.markDelivered);
    const driverLatitude = normalizeCoordinate(req.body?.driverLatitude, -90, 90);
    const driverLongitude = normalizeCoordinate(req.body?.driverLongitude, -180, 180);

    if (Number.isNaN(driverLatitude) || Number.isNaN(driverLongitude)) {
      return res.status(400).json({ error: 'Invalid driver location coordinates' });
    }
    if ((driverLatitude == null) !== (driverLongitude == null)) {
      return res.status(400).json({ error: 'Driver latitude and longitude must be provided together' });
    }
    if (!acceptOrder && !markDelivered && driverLatitude == null && driverLongitude == null) {
      return res.status(400).json({ error: 'No driver update was provided' });
    }

    const result = await pool.query(
      `
      UPDATE orders
      SET
        driver_accepted_at = CASE
          WHEN $2::boolean THEN COALESCE(driver_accepted_at, NOW())
          ELSE driver_accepted_at
        END,
        driver_latitude = COALESCE($3, driver_latitude),
        driver_longitude = COALESCE($4, driver_longitude),
        driver_location_updated_at = CASE
          WHEN $3 IS NOT NULL AND $4 IS NOT NULL THEN NOW()
          ELSE driver_location_updated_at
        END,
        status = CASE
          WHEN $5::boolean THEN 'Delivered'
          WHEN $2::boolean AND status NOT IN ('Delivered', 'Cancelled') THEN 'Out for Delivery'
          ELSE status
        END,
        tracking_status = CASE
          WHEN $5::boolean THEN 'Delivered'
          WHEN $2::boolean AND tracking_status NOT IN ('Delivered', 'Cancelled') THEN 'Out for Delivery'
          ELSE tracking_status
        END,
        status_updated_at = CASE
          WHEN $2::boolean OR $5::boolean THEN NOW()
          ELSE status_updated_at
        END,
        updated_at = NOW()
      WHERE driver_access_token = $1
      RETURNING id
      `,
      [token, acceptOrder, driverLatitude, driverLongitude, markDelivered]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Driver order link is invalid or expired' });
    }

    const updatedOrder = await fetchOrderById(result.rows[0].id);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update driver order' });
  }
});

export default router;
