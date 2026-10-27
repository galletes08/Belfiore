import {staffEvent} from '../utils/staffPermissions.js';
import {riderManagementSelect,riderAvailability} from '../utils/riderManagement.js';
import {ORDER_STATUSES} from '../../../shared/orderStatus.js';
import {attachOrderPreparation} from '../utils/orderPreparation.js';
import {acceptOrder} from '../utils/orderAcceptance.js';
import {SUPPLY,supplyChoice} from '../utils/supplies.js';
import { randomUUID,createHash } from 'node:crypto';
import { Router } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';
import { ensureRidersTable } from './riders.js';
import { verifyRequestToken } from '../utils/auth.js';
import { createPayMongoCheckoutSession, isPayMongoConfigured, retrievePayMongoCheckoutSession } from '../utils/paymongo.js';
import { isTrack123Configured } from '../utils/track123.js';
import { syncCourierOrder } from '../utils/courierTracking.js';
import { getShippingQuote } from '../utils/shipping.js';
import { storeUploadedImage, usesSupabaseStorage } from '../utils/storage.js';
import { reserveOrderInventory, releaseOrderInventory, confirmInventoryPayment, expireReservations } from '../utils/inventory.js';
import { BATCH_SELECT,refreshHarvest,batchOrderEligible } from '../utils/harvest.js';
import { validateManualDelivery } from '../utils/manualDelivery.js';

import {resolveCheckoutAddress,addressSnapshot} from '../utils/checkout.js';

const router = Router();
const deliveryProofsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
if (!fs.existsSync(deliveryProofsDir)) fs.mkdirSync(deliveryProofsDir, { recursive: true });
const deliveryProofUpload = multer({
  storage: usesSupabaseStorage ? multer.memoryStorage() : multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, deliveryProofsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${file.originalname.match(/\.[a-z0-9]+$/i)?.[0] || '.jpg'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Only JPG, PNG, or WEBP proof photos are allowed'));
  },
});
let ensureOrdersAdminColumnsPromise;

const TRACKING_STATUSES = ['Pending', 'Preparing', 'Packed', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'];
const PAYMENT_STATUSES = ['Pending', 'Paid', 'Unpaid', 'Failed', 'Refund Pending', 'Refunded'];
const DELIVERY_MODES = ['rider', 'logistics'];
const LOGISTICS_COURIERS = ['J&T Express', 'LBC'];

const BASE_ORDER_SELECT = `
  SELECT
    o.id,
    o.customer_name,
    o.gmail,
    o.mobile_num,
    o.contact_email,
    o.delivery_address,
    o.location,
    o.customer_latitude,
    o.customer_longitude,
    o.delivery_mode,
    o.payment_method,
    o.payment_status,
    o.cod_status,
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
    o.delivery_proof_url,
    o.tracking_code,
    o.tracking_courier_code,
    o.tracking_status,
    o.track123_tracking_id,
    o.track123_last_checkpoint_at,
    o.track123_last_synced_at,
    o.paymongo_checkout_session_id,
    o.paymongo_payment_id,
    o.paymongo_payment_intent_id,
    o.paymongo_paid_at,
    o.subtotal_amount,
    o.shipping_fee,
    o.shipping_status,
    o.parcel_weight_kg,
    o.total_amount,
    o.created_at,
    o.updated_at,
    o.status_updated_at,
    o.admin_confirmed_at,
    o.cancel_reason,
    o.cancellation_requested_at,
    o.cancelled_at,
    o.cancelled_by,
    o.inventory_restored_at,
    o.inventory_state,
    o.inventory_reconciliation_reason,
    COALESCE(SUM(oi.qty), 0)::int AS item_count,
    COALESCE(
      json_agg(
        json_build_object(
          'id', oi.id,
          'productId', oi.product_id,
          'productName', oi.product_name,
          'productCode', COALESCE(oi.product_code, p.product_code),
          'inventoryType', COALESCE(oi.inventory_type, p.inventory_type),
          'variantId',oi.variant_id,'variantName',oi.variant_name,'variantSku',oi.variant_sku,'sellingUnit',oi.selling_unit,'piecesPerUnit',oi.pieces_per_unit,'weightKg',oi.weight_kg,
          'batchId',oi.batch_id,'batchCode',oi.batch_code,'productTag',oi.product_tag,
          'imageUrl', COALESCE(NULLIF(oi.image_url, ''), p.image_url),
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
  LEFT JOIN products p ON p.id = oi.product_id
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

function normalizeDeliveryMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return DELIVERY_MODES.includes(normalized) ? normalized : 'rider';
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

export function deriveCodStatus(row) {
  if (row.payment_method !== 'COD') return 'Not Applicable';
  if (row.cod_status && row.cod_status !== 'Not Applicable') return row.cod_status;
  if (row.payment_status === 'Paid') {
    return row.delivery_mode === 'logistics' ? 'Remitted' : 'Collected';
  }
  if (row.delivery_mode === 'logistics' && row.tracking_status === 'Delivered') {
    return 'Remittance Pending';
  }
  return 'Awaiting Payment';
}

function formatOrderRow(row, options = {}) {
  const { includeDriverAccessToken = false } = options;

  return {
    id: Number(row.id),
    orderCode: `ORD-${String(row.id).padStart(3, '0')}`,
    customerName: row.customer_name,
    gmail: row.gmail || '',
    mobileNumber: row.mobile_num || '',
    contactEmail:row.contact_email||row.gmail||'',
    deliveryAddress:row.delivery_address||null,
    location: row.location || '',
    customerLatitude: row.customer_latitude == null ? null : Number(row.customer_latitude),
    customerLongitude: row.customer_longitude == null ? null : Number(row.customer_longitude),
    deliveryMode: row.delivery_mode || 'rider',
    automaticTracking: row.delivery_mode==='logistics' && isTrack123Configured(),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    codStatus: deriveCodStatus(row),
    status: row.status,
    riderId: row.rider_id == null ? null : Number(row.rider_id),
    courierName: row.courier_name || '',
    driverPhone: row.driver_phone || '',
    driverAssignedAt: row.driver_assigned_at || null,
    driverAcceptedAt: row.driver_accepted_at || null,
    driverLatitude: row.driver_latitude == null ? null : Number(row.driver_latitude),
    driverLongitude: row.driver_longitude == null ? null : Number(row.driver_longitude),
    driverLocationUpdatedAt: row.driver_location_updated_at || null,
    deliveryProofUrl: row.delivery_proof_url || '',
    trackingCode: row.tracking_code || '',
    trackingCourierCode: row.tracking_courier_code || '',
    trackingStatus:
      row.status === 'Delivered' ||
      ['Remittance Pending', 'Remitted'].includes(deriveCodStatus(row))
        ? 'Delivered'
        : row.tracking_status || deriveTrackingStatus(row.status),
    track123TrackingId: row.track123_tracking_id || '',
    track123LastCheckpointAt: row.track123_last_checkpoint_at || null,
    track123LastSyncedAt: row.track123_last_synced_at || null,
    paymongoCheckoutSessionId: row.paymongo_checkout_session_id || '',
    paymongoPaymentId: row.paymongo_payment_id || '',
    paymongoPaymentIntentId: row.paymongo_payment_intent_id || '',
    paymongoPaidAt: row.paymongo_paid_at || null,
    subtotalAmount: Number(row.subtotal_amount) > 0 ? Number(row.subtotal_amount) : Number(row.total_amount || 0),
    shippingFee: row.shipping_fee == null ? null : Number(row.shipping_fee),
    shippingStatus: row.shipping_status || 'To be confirmed',
    parcelWeightKg: row.parcel_weight_kg == null ? null : Number(row.parcel_weight_kg),
    totalAmount: Number(row.total_amount || 0),
    itemCount: Number(row.item_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.status_updated_at || row.created_at,
    statusUpdatedAt: row.status_updated_at || row.updated_at || row.created_at,
    adminConfirmedAt: row.admin_confirmed_at || null,
    cancelReason: row.cancel_reason || '',
    cancellationRequestedAt: row.cancellation_requested_at || null,
    cancelledAt: row.cancelled_at || null,
    cancelledBy: row.cancelled_by || '',
    inventoryRestoredAt: row.inventory_restored_at || null,
    inventoryState: row.inventory_state,
    inventoryReconciliationReason: row.inventory_reconciliation_reason || '',
    items: Array.isArray(row.items)
      ? row.items.map((item) => ({
        id: Number(item.id),
        productId: item.productId == null ? null : Number(item.productId),
        productName: item.productName,
        productCode: item.productCode || '',
        productTag: item.productTag || '',
        inventoryType: item.inventoryType || '',
        variantId:item.variantId,variantName:item.variantName,variantSku:item.variantSku,sellingUnit:item.sellingUnit,piecesPerUnit:item.piecesPerUnit,weightKg:item.weightKg,
        batchId:item.batchId?Number(item.batchId):null,batchCode:item.batchCode||'',
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
        ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'rider',
        ADD COLUMN IF NOT EXISTS driver_latitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS driver_longitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS driver_location_updated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delivery_proof_url TEXT,
        ADD COLUMN IF NOT EXISTS rider_id BIGINT REFERENCES riders(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS tracking_code TEXT,
        ADD COLUMN IF NOT EXISTS tracking_courier_code TEXT,
        ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'Pending',
        ADD COLUMN IF NOT EXISTS track123_tracking_id TEXT,
        ADD COLUMN IF NOT EXISTS track123_last_checkpoint_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS track123_last_synced_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS paymongo_checkout_session_id TEXT,
        ADD COLUMN IF NOT EXISTS paymongo_payment_id TEXT,
        ADD COLUMN IF NOT EXISTS paymongo_payment_intent_id TEXT,
        ADD COLUMN IF NOT EXISTS paymongo_paid_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cod_status TEXT NOT NULL DEFAULT 'Not Applicable',
        ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS shipping_status TEXT NOT NULL DEFAULT 'To be confirmed',
        ADD COLUMN IF NOT EXISTS parcel_weight_kg NUMERIC(10, 3),
        ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS admin_confirmed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
        ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
        ADD COLUMN IF NOT EXISTS inventory_restored_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `).then(() =>
      pool.query(`
        ALTER TABLE order_items
          ADD COLUMN IF NOT EXISTS image_url TEXT
      `)
    ).then(() =>
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
  const queryClient = options.queryClient || pool;
  const result = await queryClient.query(
    `
    ${BASE_ORDER_SELECT}
    WHERE o.id = $1
    GROUP BY o.id, r.first_name, r.last_name, r.phone
    `,
    [orderId]
  );

  if (!result.rows.length) return null;
  const order=formatOrderRow(result.rows[0],options);
  return options.includeDriverAccessToken?(await attachOrderPreparation(queryClient,[order]))[0]:order;
}

async function cancelOrderAndRestoreInventory(client, orderId, { reason, cancelledBy }) {
  const orderResult = await client.query(
    'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
    [orderId]
  );
  if (!orderResult.rows.length) return null;

  const order = orderResult.rows[0];
  if (['Delivered', 'Out for Delivery'].includes(order.status)) {
    const error = new Error(
      order.status === 'Delivered'
        ? 'Delivered orders must use the return/refund process'
        : 'This order is already with the rider. Complete the return process before restoring inventory.'
    );
    error.status = 409;
    throw error;
  }
  if (!String(reason || order.cancel_reason || '').trim()) {
    const error = new Error('A cancellation reason is required');
    error.status = 400;
    throw error;
  }

  if (!order.inventory_restored_at) {
    await releaseOrderInventory(client, order, reason, cancelledBy);
  }

  await client.query(
    `
    UPDATE orders
    SET
      status = 'Cancelled',
      tracking_status = 'Cancelled',
      payment_status = CASE
        WHEN payment_status = 'Paid' THEN 'Refund Pending'
        WHEN payment_status = 'Pending' THEN 'Failed'
        ELSE payment_status
      END,
      cod_status = CASE
        WHEN payment_method = 'COD' THEN 'Cancelled'
        ELSE cod_status
      END,
      cancel_reason = COALESCE(NULLIF($2, ''), cancel_reason),
      cancelled_by = $3,
      cancelled_at = COALESCE(cancelled_at, NOW()),
      inventory_restored_at = COALESCE(inventory_restored_at, NOW()),
      driver_access_token = NULL,
      driver_latitude = NULL,
      driver_longitude = NULL,
      driver_location_updated_at = NULL,
      status_updated_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    `,
    [orderId, reason, cancelledBy]
  );

  return fetchOrderById(orderId, {
    includeDriverAccessToken: cancelledBy === 'Admin',
    queryClient: client,
  });
}

router.post('/api/orders', (req,res,next)=>{
  try {
    if(verifyRequestToken(req).role!=='customer')return res.status(403).json({error:'Customer access only'});
    next();
  }catch(error){res.status(error.status||401).json({error:'Customer authentication required'});}
}, async (req, res) => {
  await refreshHarvest(pool);
  await expireReservations(pool);
  const client = await pool.connect();
  let checkoutKey=null,checkoutHash=null,structuredAddress=null;
  try {
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const authUser = req.headers.authorization ? verifyRequestToken(req) : null;
    if (authUser && authUser.role !== 'customer') {
      return res.status(403).json({ error: 'Customer access only' });
    }
    if(req.body?.checkoutRequestId){
      if(!authUser?.userId)return res.status(401).json({error:'Sign in before placing this order'});
      checkoutKey=String(req.body.checkoutRequestId);if(!/^[a-zA-Z0-9-]{16,100}$/.test(checkoutKey))return res.status(400).json({error:'Invalid checkout request ID'});
      checkoutHash=createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['checkout:'+authUser.userId+':'+checkoutKey]);
      const previous=(await client.query('SELECT * FROM checkout_requests WHERE customer_id=$1 AND request_key=$2',[authUser.userId,checkoutKey])).rows[0];
      if(previous){if(previous.payload_hash!==checkoutHash)return res.status(409).json({error:'Checkout request changed. Review your order before submitting again.'});return res.status(201).json(previous.response);}
    }
    if(req.body?.deliveryAddress||req.body?.savedAddressId){
      const a=await resolveCheckoutAddress(client,authUser?.userId,req.body);structuredAddress=a;
      req.body={...req.body,country:a.country,province:a.province,city:a.city,barangay:a.barangay,postalCode:a.postalCode,location:addressSnapshot(a),customerLatitude:a.latitude,customerLongitude:a.longitude};
    }
    const fullName = String(req.body?.fullName || '').trim();
    const gmail = String(authUser?.email || req.body?.gmail || '').trim();
    const mobileNumber = String(req.body?.mobileNumber || '').trim();
    const location = String(req.body?.location || '').trim();
    const country = String(req.body?.country || '').trim();
    const province = String(req.body?.province || '').trim();
    const city = String(req.body?.city || '').trim();
    const barangay = String(req.body?.barangay || '').trim();
    const postalCode = String(req.body?.postalCode || req.body?.zipCode || '').trim();
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
    if (!country || !province || !city || !barangay || !postalCode) {
      return res.status(400).json({ error: 'Country, province, city, barangay, and postal code are required' });
    }
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
        batchId:item?.batchId?Number(item.batchId):null,variantId:item?.variantId?Number(item.variantId):null,
        expectedUnitPrice:item?.expectedUnitPrice,
      }))
      .filter((item) => Number.isInteger(item.productId) && item.productId > 0 && Number.isInteger(item.qty) && item.qty > 0);

    if (!requestedItems.length || requestedItems.length !== items.length) return res.status(400).json({ error: 'Invalid order items payload' });

    const qtyById = new Map();
    const requestedByKey=new Map();
    for (const item of requestedItems) {
      const key=item.productId+':'+(item.batchId||'')+':'+(item.variantId||'');
      if(requestedByKey.has(key)&&Number(requestedByKey.get(key).expectedUnitPrice)!==Number(item.expectedUnitPrice)&&item.batchId) return res.status(409).json({error:'Conflicting prices for the same batch; review checkout.'});
      qtyById.set(key,(qtyById.get(key)||0)+item.qty);
      requestedByKey.set(key,item);
    }

    const productIds = [...new Set(requestedItems.map(item=>item.productId))];
    const productsResult = await client.query(
      `
      SELECT id, name, tag, category, price, stock, image_url, inventory_type, product_code, archived_at, legacy_quantity_review, sold_at, to_jsonb(products)->>'lettuce_stock_model' AS lettuce_stock_model
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
    let subtotalAmount = 0;

    for (const [key, qty] of qtyById.entries()) {
      const requested=requestedByKey.get(key);
      const productId=requested.productId;
      const product = productsById.get(productId);
      const stock = Number(product.stock);
      let unitPrice = Number(product.price);
      let batch=null,variant=null;
      if(product.inventory_type===SUPPLY){
        if(requested.batchId)return res.status(400).json({error:'Supplies do not use harvest batches'});
        variant=await supplyChoice(client,productId,requested.variantId,qty);unitPrice=variant.price;
        if(requested.expectedUnitPrice==null||Number(requested.expectedUnitPrice)!==unitPrice)return res.status(409).json({error:'Supply price changed. Review the selected variant price.'});
      } else if(requested.variantId)return res.status(400).json({error:'This product does not use supply variants'});
      else if(product.inventory_type==='edible'&&product.lettuce_stock_model==='quantity') {
        if(requested.batchId)return res.status(409).json({error:'Lettuce no longer uses batch selection. Remove the old cart entry and add the lettuce again.'});
        if(stock<qty)return res.status(409).json({error:'Insufficient available lettuce packs. Refresh your cart.'});
        if(requested.expectedUnitPrice==null||Number(requested.expectedUnitPrice)!==unitPrice)return res.status(409).json({error:'Lettuce price changed. Review your cart.'});
      }else if(product.inventory_type==='edible') {
        if(product.lettuce_stock_model==='batch')return res.status(409).json({error:'Lettuce stock requires administrator reconciliation before new orders.'});
        if(!Number.isSafeInteger(requested.batchId)||requested.batchId<=0) return res.status(409).json({error:'Select a harvest batch and its price before checkout.'});
        batch=(await client.query(`${BATCH_SELECT} WHERE b.id=$1 AND b.product_id=$2`,[requested.batchId,productId])).rows[0];
        if(!batch||batch.available_stock<qty) return res.status(409).json({error:'Selected batch is unavailable, held, or has insufficient packs. Refresh checkout.'});
        unitPrice=Number(batch.price);
        if(requested.expectedUnitPrice===undefined||Number(requested.expectedUnitPrice)!==unitPrice) return res.status(409).json({error:'Batch price changed. Review the current batch price before paying.'});
      } else if(requested.batchId) return res.status(400).json({error:'Succulents do not use harvest batches'});
      if(structuredAddress&&requested.expectedUnitPrice!=null&&Number(requested.expectedUnitPrice)!==unitPrice)return res.status(409).json({error:'Product price changed. Review your cart before placing the order.'});
      if (product.archived_at || product.legacy_quantity_review || (product.inventory_type === 'succulent' && (qty !== 1 || product.sold_at))) {
        return res.status(409).json({ error: `${product.name} is unavailable or must be ordered individually` });
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: `Invalid product price for product ${productId}` });
      }
      if (!variant && (!Number.isInteger(stock) || stock < qty)) {
        return res.status(400).json({ error: `${product.name} has insufficient stock` });
      }
      const lineTotal = unitPrice * qty;
      subtotalAmount += lineTotal;
      orderItems.push({
        productId,
        productName: product.name,
        productCode: product.product_code,
        productTag: product.inventory_type===SUPPLY?product.category:product.tag,
        inventoryType: product.inventory_type,
        variantId:variant?.id||null,variantName:variant?.name||null,variantSku:variant?.sku||null,sellingUnit:variant?.selling_unit||null,piecesPerUnit:variant?.pieces_per_unit||null,weightKg:variant?.weight_kg||null,stockPoolId:variant?.pool_id||null,stockFactor:variant?.stock_factor||null,
        batchId:batch?Number(batch.id):null,batchCode:batch?.batch_code||'',
        imageUrl: product.image_url || null,
        qty,
        unitPrice,
        lineTotal,
      });
    }

    const shippingQuote = getShippingQuote({
      country,
      province,
      city,
      barangay,
      postalCode,
      subtotal: subtotalAmount,
    });
    const deliveryMode = shippingQuote.deliveryMode;
    const totalAmount = subtotalAmount + (shippingQuote.fee ?? 0);
    const orderCustomerLatitude = deliveryMode === 'rider' ? customerLatitude : null;
    const orderCustomerLongitude = deliveryMode === 'rider' ? customerLongitude : null;

    if (paymentMethod === 'ONLINE' && shippingQuote.fee == null) {
      return res.status(400).json({
        error: 'Online payment is unavailable until the J&T Express/LBC shipping fee is confirmed. Please use COD.',
      });
    }

    if(!checkoutKey)await client.query('BEGIN');

    const orderResult = await client.query(
      `
      INSERT INTO orders (
        customer_name, gmail, mobile_num, location, customer_latitude, customer_longitude,
        delivery_mode, courier_name, payment_method, payment_status, cod_status, status, tracking_status,
        subtotal_amount, shipping_fee, shipping_status, parcel_weight_kg, total_amount, status_updated_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pending', 'Pending', $12, $13, $14, $15, $16, NOW(), NOW())
      RETURNING id, delivery_mode, courier_name, payment_status, cod_status, subtotal_amount, shipping_fee, shipping_status, status, tracking_status, total_amount, created_at, updated_at, status_updated_at
      `,
      [
        fullName,
        gmail,
        mobileNumber,
        location,
        orderCustomerLatitude,
        orderCustomerLongitude,
        deliveryMode,
        shippingQuote.courierName,
        paymentMethod,
        paymentMethod === 'ONLINE' ? 'Pending' : 'Unpaid',
        paymentMethod === 'COD' ? 'Awaiting Payment' : 'Not Applicable',
        subtotalAmount,
        shippingQuote.fee,
        shippingQuote.status,
        shippingQuote.parcelWeightKg,
        totalAmount,
      ]
    );

    const order = orderResult.rows[0];
    if(structuredAddress){
      const contactEmail=String(req.body.gmail||gmail).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))throw Object.assign(new Error('Valid contact email is required'),{status:400});
      await client.query('UPDATE orders SET delivery_address=$2::jsonb,contact_email=$3 WHERE id=$1',[order.id,JSON.stringify(structuredAddress),contactEmail]);
    }

    for (const item of orderItems) {
      await client.query(
        `
        INSERT INTO order_items (order_id, product_id, product_name, image_url, qty, unit_price, line_total, product_code, inventory_type,batch_id,batch_code,product_tag)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,$10,$11,$12)
        `,
        [order.id, item.productId, item.productName, item.imageUrl, item.qty, item.unitPrice, item.lineTotal, item.productCode, item.inventoryType,item.batchId,item.batchCode,item.productTag]
      );
      if(item.variantId)await client.query(`UPDATE order_items SET variant_id=$3,variant_name=$4,variant_sku=$5,selling_unit=$6,pieces_per_unit=$7,weight_kg=$8,stock_pool_id=$9,stock_factor=$10 WHERE order_id=$1 AND product_id=$2 AND variant_id IS NULL`,[order.id,item.productId,item.variantId,item.variantName,item.variantSku,item.sellingUnit,item.piecesPerUnit,item.weightKg,item.stockPoolId,item.stockFactor]);

    }

    await reserveOrderInventory(client, order.id, orderItems, paymentMethod === 'ONLINE', `Customer ${gmail}`);

    let checkoutSession = null;

    if (paymentMethod === 'ONLINE') {
      checkoutSession = await createPayMongoCheckoutSession({
        orderId: Number(order.id),
        orderCode: `ORD-${String(order.id).padStart(3, '0')}`,
        customerName: fullName,
        customerEmail: gmail,
        items: orderItems,
        shippingFee: shippingQuote.fee,
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
          paymongo_payment_intent_id = $3,
          updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, checkoutSession.id, checkoutSession.paymentIntentId]
      );
    }

    const response={
      id: Number(order.id),
      orderCode: `ORD-${String(order.id).padStart(3, '0')}`,
      deliveryMode: order.delivery_mode || deliveryMode,
      courierName: order.courier_name || shippingQuote.courierName,
      paymentMethod,
      paymentStatus: paymentMethod === 'ONLINE' ? 'Pending' : 'Unpaid',
      codStatus: order.cod_status,
      checkoutUrl: checkoutSession?.checkoutUrl || '',
      status: order.status,
      totalAmount: Number(order.total_amount),
      subtotalAmount: Number(order.subtotal_amount),
      shippingFee: order.shipping_fee == null ? null : Number(order.shipping_fee),
      shippingStatus: order.shipping_status,
      createdAt: order.created_at,
    };
    if(checkoutKey)await client.query('INSERT INTO checkout_requests(customer_id,request_key,payload_hash,order_id,response) VALUES($1,$2,$3,$4,$5::jsonb)',[authUser.userId,checkoutKey,checkoutHash,order.id,JSON.stringify(response)]);
    await client.query('COMMIT');
    res.status(201).json(response);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(error.status || 500).json({ error: error.message || 'Failed to place order' });
  } finally {
    await client.query('ROLLBACK').catch(()=>{});
    client.release();
  }
});

router.post('/api/orders/lookup', async (req, res) => {
  try {
    await ensureOrderAdminColumns();
    await ensureRidersTable();
    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'customer') {
      return res.status(403).json({ error: 'Customer access only' });
    }

    const result = await pool.query(
      `
      ${BASE_ORDER_SELECT}
      WHERE LOWER(COALESCE(o.gmail, '')) = LOWER($1)
      GROUP BY o.id, r.first_name, r.last_name, r.phone
      ORDER BY o.created_at DESC
      `,
      [String(authUser.email || '').trim()]
    );

    res.json(result.rows.map((row) => formatOrderRow(row)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load customer orders' });
  }
});

router.post('/api/orders/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureOrderAdminColumns();
    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'customer') {
      return res.status(403).json({ error: 'Customer access only' });
    }

    const orderId = Number(req.params.id);
    const reason = String(req.body?.reason || '').trim();
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    if (reason.length < 3 || reason.length > 500) {
      return res.status(400).json({ error: 'Please provide a cancellation reason (3 to 500 characters)' });
    }

    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, gmail, status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = result.rows[0];
    if (String(order.gmail || '').trim().toLowerCase() !== String(authUser.email || '').trim().toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This order does not belong to your account' });
    }
    if (order.status === 'Cancelled') {
      await client.query('COMMIT');
      return res.json(await fetchOrderById(orderId, { queryClient: client }));
    }
    if (order.status === 'Delivered' || order.status === 'Out for Delivery') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: order.status === 'Delivered'
          ? 'Delivered orders must use the return/refund process'
          : 'This order is already out for delivery. Please contact Belfiore support.',
      });
    }

    let updatedOrder;
    if (order.status === 'Pending') {
      updatedOrder = await cancelOrderAndRestoreInventory(client, orderId, {
        reason,
        cancelledBy: 'Customer',
      });
    } else {
      await client.query(
        `
        UPDATE orders
        SET status = 'Cancellation Requested', cancel_reason = $2,
            cancellation_requested_at = NOW(), status_updated_at = NOW(), updated_at = NOW()
        WHERE id = $1
        `,
        [orderId, reason]
      );
      updatedOrder = await fetchOrderById(orderId, { queryClient: client });
    }

    await client.query('COMMIT');
    return res.json(updatedOrder);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(error.status || 500).json({ error: error.message || 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

router.post('/api/orders/:id/payment/verify', async (req, res) => {
  try {
    await ensureOrderAdminColumns();

    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'customer') {
      return res.status(403).json({ error: 'Customer access only' });
    }

    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const orderResult = await pool.query(
      'SELECT id, gmail, status, payment_method, payment_status, paymongo_checkout_session_id FROM orders WHERE id = $1 LIMIT 1',
      [orderId]
    );

    if (!orderResult.rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    if (String(order.gmail || '').trim().toLowerCase() !== String(authUser.email || '').trim().toLowerCase()) {
      return res.status(403).json({ error: 'This order does not belong to your account' });
    }
    if (order.payment_method !== 'ONLINE') {
      return res.status(400).json({ error: 'This order does not use online payment' });
    }
    if (order.payment_status === 'Paid') {
      return res.json({ verified: true, paymentStatus: 'Paid' });
    }
    if (!order.paymongo_checkout_session_id) {
      return res.status(409).json({ error: 'PayMongo checkout session is not ready yet' });
    }

    const checkoutSession = await retrievePayMongoCheckoutSession(order.paymongo_checkout_session_id);
    const payments = Array.isArray(checkoutSession?.attributes?.payments)
      ? checkoutSession.attributes.payments
      : [];
    const paidPayment = payments.find((payment) => payment?.attributes?.status === 'paid');

    if (!paidPayment) {
      return res.json({ verified: false, paymentStatus: order.payment_status || 'Pending' });
    }

    const client = await pool.connect();
    let paymentStatus;
    try {
      await client.query('BEGIN');
      const locked = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      paymentStatus = await confirmInventoryPayment(client, locked.rows[0], paidPayment);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    res.json({ verified: paymentStatus === 'Paid', paymentStatus });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to verify online payment' });
  }
});
router.get('/api/admin/orders', async (req, res) => {
  try {
    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const result = await pool.query(`
      ${BASE_ORDER_SELECT}
      GROUP BY o.id, r.first_name, r.last_name, r.phone
      ORDER BY o.created_at DESC
    `);

    res.json(await attachOrderPreparation(pool,result.rows.map(row=>formatOrderRow(row,{includeDriverAccessToken:true}))));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load orders' });
  }
});

router.delete('/api/admin/orders/:orderId/items/:itemId', async (req, res) => {
  let client;
  try {
    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }

    const orderId = Number(req.params.orderId);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Invalid order item id' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const itemResult = await client.query(
      `
      SELECT oi.id, oi.product_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.id = $1 AND oi.id = $2 AND o.status = 'Delivered'
      FOR UPDATE OF o, oi
      `,
      [orderId, itemId]
    );
    if (!itemResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivered order item not found' });
    }

    // Completed order lines are accounting records; removal is no longer supported.
    await client.query('ROLLBACK');
    return res.status(409).json({ error: 'Completed order history cannot be removed. Archive the product through Inventory instead.' });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return res.status(error.status || 500).json({ error: error.message || 'Failed to remove sold product' });
  } finally {
    if (client) client.release();
  }
});

router.post('/api/admin/orders/:id/confirm', async (req, res) => {
  try {
    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    await acceptOrder(pool,orderId);

    const updatedOrder = await fetchOrderById(orderId, { includeDriverAccessToken: true });
    return res.json(updatedOrder);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Failed to confirm order' });
  }
});

router.post('/api/admin/orders/:id/confirm-cod-remittance', async (req, res) => {
  try {
    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const result = await pool.query(
      `
      UPDATE orders
      SET
        cod_status = 'Remitted',
        payment_status = 'Paid',
        status_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND payment_method = 'COD'
        AND delivery_mode = 'logistics'
        AND tracking_status = 'Delivered'
        AND cod_status IN ('Remittance Pending', 'Not Applicable')
      RETURNING id
      `,
      [orderId]
    );

    if (!result.rows.length) {
      const existingResult = await pool.query(
        `
        SELECT payment_method, delivery_mode, tracking_status, cod_status
        FROM orders
        WHERE id = $1
        LIMIT 1
        `,
        [orderId]
      );
      if (!existingResult.rows.length) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = existingResult.rows[0];
      if (order.payment_method !== 'COD' || order.delivery_mode !== 'logistics') {
        return res.status(409).json({ error: 'COD remittance applies only to J&T/LBC COD orders' });
      }
      if (order.tracking_status !== 'Delivered') {
        return res.status(409).json({ error: 'Mark the Delivery Status as Delivered first' });
      }
      return res.status(409).json({
        error: `COD remittance cannot be confirmed from status: ${order.cod_status}`,
      });
    }

    const updatedOrder = await fetchOrderById(orderId, { includeDriverAccessToken: true });
    return res.json(updatedOrder);
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || 'Failed to confirm COD remittance',
    });
  }
});

router.get('/api/admin/orders/:id/delivery-history',async(req,res)=>{
  try{
    const user=verifyRequestToken(req);
    if(user.role!=='admin')return res.status(403).json({error:'Admin access only'});
    const id=Number(req.params.id),page=Number(req.query.page||1);
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(page)||page<1||page>1000000)return res.status(400).json({error:'Invalid order or history page'});
    if(!(await pool.query('SELECT id FROM orders WHERE id=$1',[id])).rows.length)return res.status(404).json({error:'Order unavailable'});
    const entries=await pool.query('SELECT * FROM order_delivery_history WHERE order_id=$1 ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET $2',[id,(page-1)*25]);
    const count=await pool.query('SELECT COUNT(*)::int AS total FROM order_delivery_history WHERE order_id=$1',[id]);
    res.json({entries:entries.rows,total:count.rows[0].total,page,pageSize:25});
  }catch(error){res.status(error.status||500).json({error:error.message||'Unable to load delivery history'});}
});

export async function updateOrderHandler(req,res) {
  let deliveryClient;
  try {
    const authUser = req.operationsUser || verifyRequestToken(req);
    const staffAssignment=authUser.role==='staff'&&(req.staffRiderAssignment===true||req.staffDeliveryUpdate===true);
    if (authUser.role !== 'admin'&&!staffAssignment) {
      return res.status(403).json({ error: 'Admin access only' });
    }
    await ensureOrderAdminColumns();
    await ensureRidersTable();

    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const status = normalizeOption(req.body?.status, ORDER_STATUSES);
    const trackingStatus = normalizeOption(req.body?.trackingStatus, TRACKING_STATUSES);
    const paymentStatus = normalizeOption(req.body?.paymentStatus, PAYMENT_STATUSES);
    const deliveryMode = normalizeDeliveryMode(req.body?.deliveryMode);
    const riderId = req.body?.riderId == null || req.body?.riderId === ''
      ? null
      : Number(req.body.riderId);
    const courierName = String(req.body?.courierName || '').trim();
    const driverPhone = String(req.body?.driverPhone || '').trim();
    const trackingCode = String(req.body?.trackingCode || '').trim();
    const trackingCourierCode = req.body?.trackingCourierCode == null ? null : String(req.body.trackingCourierCode).trim();

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
    if (deliveryMode === 'logistics' && !LOGISTICS_COURIERS.includes(courierName)) {
      return res.status(400).json({ error: 'Select J&T Express or LBC for courier delivery' });
    }
    if (
      deliveryMode === 'logistics' &&
      !['Pending', 'Preparing'].includes(trackingStatus || deriveTrackingStatus(status)) &&
      !trackingCode
    ) {
      return res.status(400).json({ error: 'Tracking number is required before shipping the order' });
    }

    if (status === 'Cancelled') {
      const cancelClient = await pool.connect();
      try {
        await cancelClient.query('BEGIN');
        const updatedOrder = await cancelOrderAndRestoreInventory(cancelClient, orderId, {
          reason: String(req.body?.cancelReason || '').trim(),
          cancelledBy: 'Admin',
        });
        if (!updatedOrder) {
          await cancelClient.query('ROLLBACK');
          return res.status(404).json({ error: 'Order not found' });
        }
        await cancelClient.query('COMMIT');
        return res.json(updatedOrder);
      } catch (error) {
        await cancelClient.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        cancelClient.release();
      }
    }

    let resolvedRiderName = courierName;
    let resolvedDriverPhone = driverPhone;

    if (deliveryMode === 'rider' && riderId) {
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
      SELECT rider_id, delivery_mode,tracking_code,courier_name, driver_phone, driver_access_token, driver_assigned_at,
             status, payment_method, payment_status, cod_status, tracking_status, admin_confirmed_at,updated_at,updated_at::text AS update_version
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
    if(staffAssignment&&existing.update_version!==req.assignmentVersion)return res.status(409).json({error:'Order changed. Refresh before assigning rider.'});
    if (['Delivered','Cancelled'].includes(existing.status) && status !== existing.status) {
      return res.status(409).json({error:'This order is already completed or cancelled. Refresh its details; normal editing cannot reopen it.'});
    }
    if(['Preparing','Out for Delivery','Delivered'].includes(status)&&!await batchOrderEligible(pool,orderId)) return res.status(409).json({error:'An allocated harvest batch is on hold or unsellable. Reconcile this order; do not substitute a different batch or price.'});
    if (existing.payment_method === 'ONLINE') {
      if (paymentStatus && paymentStatus !== existing.payment_status) {
        return res.status(409).json({ error: 'Online payment status is controlled by verified PayMongo confirmation' });
      }
      if (existing.payment_status !== 'Paid' && (['Preparing', 'Out for Delivery', 'Delivered'].includes(status) || riderId || trackingCode)) {
        return res.status(409).json({ error: 'Verify online payment before fulfillment' });
      }
    }
    if (existing.status === 'Cancelled') {
      return res.status(409).json({ error: 'Cancelled orders cannot be reopened' });
    }
    if (
      existing.payment_method === 'COD' &&
      deliveryMode === 'logistics' &&
      paymentStatus === 'Paid' &&
      existing.cod_status !== 'Remitted'
    ) {
      return res.status(409).json({
        error: 'Courier COD can only be marked Paid after Belfiore confirms the remittance',
      });
    }
    const finalRiderId = deliveryMode === 'logistics' ? null : riderId;
    if (deliveryMode === 'logistics') {
      resolvedDriverPhone = '';
    }

    const assignmentChanged =
      finalRiderId !== (existing.rider_id == null ? null : Number(existing.rider_id)) ||
      resolvedRiderName !== String(existing.courier_name || '') ||
      resolvedDriverPhone !== String(existing.driver_phone || '');

    const nextDriverAccessToken = deliveryMode === 'rider' && resolvedRiderName
      ? assignmentChanged
        ? randomUUID()
        : String(existing.driver_access_token || randomUUID())
      : null;

    let finalStatus = status;
    let finalTrackingStatus = trackingStatus || (deliveryMode==='logistics' ? existing.tracking_status : null) || deriveTrackingStatus(status);
    if (deliveryMode === 'logistics') {
      const issue=validateManualDelivery(finalStatus,finalTrackingStatus,existing.tracking_status);
      if(issue)return res.status(409).json({error:issue});
    }
    const deliveryNotes=String(req.body?.deliveryNotes||'').trim();
    if(deliveryNotes.length>1000)return res.status(400).json({error:'Delivery notes must be at most 1000 characters'});
    deliveryClient=await pool.connect();
    await deliveryClient.query('BEGIN');
    if(staffAssignment){
      await deliveryClient.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[orderId]);
      if(!(await deliveryClient.query("SELECT id FROM users WHERE id=$1 AND role='staff' AND status='active' AND auth_version=$2 FOR SHARE",[authUser.userId,Number(authUser.sessionVersion||0)])).rowCount)throw Object.assign(new Error('Session revoked'),{status:401});
      if(finalRiderId){
      await deliveryClient.query('SELECT id FROM riders WHERE id=$1 FOR UPDATE',[finalRiderId]);
      await deliveryClient.query('SELECT id FROM users WHERE id=(SELECT user_id FROM riders WHERE id=$1) FOR SHARE',[finalRiderId]);
      const target=(await deliveryClient.query(riderManagementSelect+' WHERE r.id=$1',[finalRiderId])).rows[0];
      if(!target||!target.account_enabled||target.must_change_password||target.rider_security_locked||!target.is_available||(Number(existing.rider_id)!==finalRiderId&&riderAvailability(target)!=='Available'))throw Object.assign(new Error('Selected rider is unavailable or requires administrator review.'),{status:409});
      }
    }
    await deliveryClient.query("SELECT set_config('delivery.actor',$1,true),set_config('delivery.notes',$2,true)",[`${staffAssignment?'Staff':'Admin'} #${authUser.userId}`,deliveryNotes]);

    const updateResult = await deliveryClient.query(
      `
      UPDATE orders
      SET
        status = $2,
        payment_status = CASE
          WHEN $16::boolean THEN payment_status
          WHEN payment_method = 'ONLINE' THEN payment_status
          WHEN payment_method = 'COD'
            AND $4 = 'logistics'
            AND cod_status <> 'Remitted'
          THEN 'Unpaid'
          ELSE COALESCE(NULLIF($3, ''), payment_status)
        END,
        cod_status = CASE
          WHEN $16::boolean THEN cod_status
          WHEN payment_method = 'COD'
            AND $4 = 'logistics'
            AND $12 = 'Delivered'
            AND cod_status <> 'Remitted'
          THEN 'Remittance Pending'
          ELSE cod_status
        END,
        delivery_mode = $4,
        rider_id = $5,
        courier_name = $6,
        driver_phone = $7,
        driver_access_token = $8,
        driver_assigned_at = CASE
          WHEN $4 = 'logistics' OR NULLIF($6, '') IS NULL THEN NULL
          WHEN $9::boolean OR driver_assigned_at IS NULL THEN NOW()
          ELSE driver_assigned_at
        END,
        driver_accepted_at = CASE
          WHEN $4 = 'logistics' OR NULLIF($6, '') IS NULL OR $9::boolean THEN NULL
          ELSE driver_accepted_at
        END,
        driver_latitude = CASE
          WHEN $4 = 'logistics' OR NULLIF($6, '') IS NULL OR $9::boolean THEN NULL
          ELSE driver_latitude
        END,
        driver_longitude = CASE
          WHEN $4 = 'logistics' OR NULLIF($6, '') IS NULL OR $9::boolean THEN NULL
          ELSE driver_longitude
        END,
        driver_location_updated_at = CASE
          WHEN $4 = 'logistics' OR NULLIF($6, '') IS NULL OR $9::boolean THEN NULL
          ELSE driver_location_updated_at
        END,
        tracking_code = $10,
        tracking_courier_code = COALESCE($11,tracking_courier_code),
        tracking_status = $12,
        admin_confirmed_at = CASE
          WHEN $2 IN ('Preparing', 'Out for Delivery') AND admin_confirmed_at IS NULL THEN NOW()
          ELSE admin_confirmed_at
        END,
        status_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND updated_at IS NOT DISTINCT FROM $15::timestamptz AND status <> 'Cancelled' AND status=$14 AND tracking_status IS NOT DISTINCT FROM $13
        AND (status <> 'Delivered' OR ($2 = 'Delivered' AND $12 = 'Delivered'))
        AND (payment_method <> 'ONLINE' OR payment_status = 'Paid' OR $2 IN ('Pending', 'Cancellation Requested'))
        AND ($2 NOT IN ('Preparing','Out for Delivery','Delivered') OR harvest_order_sellable(id))
      RETURNING id
      `,
      [
        orderId,
        finalStatus,
        paymentStatus,
        deliveryMode,
        finalRiderId,
        resolvedRiderName,
        resolvedDriverPhone,
        nextDriverAccessToken,
        assignmentChanged,
        trackingCode,
        trackingCourierCode,
        finalTrackingStatus,
        existing.tracking_status,
        existing.status,
        existing.update_version,
        staffAssignment,
      ]
    );

    if (!updateResult.rows.length) {await deliveryClient.query('ROLLBACK');return res.status(409).json({ error: 'Order state changed; refresh before updating fulfillment' });}
    if(staffAssignment)await staffEvent(deliveryClient,authUser,req.staffDeliveryUpdate?'Delivery Details Updated':'Rider Assigned',{orderId,oldValue:{riderId:existing.rider_id,status:existing.status,deliveryMode:existing.delivery_mode,courier:existing.courier_name,trackingCode:existing.tracking_code},newValue:{riderId:finalRiderId,status:finalStatus,deliveryMode,courier:resolvedRiderName,trackingCode},reason:req.staffDeliveryUpdate?'Staff delivery update':'Staff rider assignment'});
    await deliveryClient.query('COMMIT');
    if(deliveryMode==='logistics'&&trackingCode)syncCourierOrder(orderId).catch(()=>console.error('Courier tracking retry pending for order',orderId));
    if(staffAssignment)return res.json({id:orderId,message:req.staffDeliveryUpdate?'Delivery details saved.':'Rider assignment saved.'});
    const updatedOrder = await fetchOrderById(orderId, { includeDriverAccessToken: true });
    res.json(updatedOrder);
  } catch (error) {
    if(deliveryClient)await deliveryClient.query('ROLLBACK').catch(()=>{});
    res.status(error.code==='P0001'?409:error.status||500).json({ error: error.message || 'Failed to update order' });
  } finally {deliveryClient?.release();}
}
router.patch('/api/admin/orders/:id',updateOrderHandler);

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

router.patch('/api/driver/orders/:token', deliveryProofUpload.single('proof'), async (req, res) => {
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
    if (markDelivered && !req.file) {
      return res.status(400).json({ error: 'Take a proof-of-delivery photo before marking this order as delivered' });
    }

    const proofUrl = markDelivered ? await storeUploadedImage(req.file, 'delivery-proofs') : null;

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
        delivery_proof_url = COALESCE($6, delivery_proof_url),
        status = CASE
          WHEN $5::boolean THEN 'Delivered'
          WHEN $2::boolean AND status NOT IN ('Delivered', 'Cancelled') THEN 'Out for Delivery'
          ELSE status
        END,
        payment_status = CASE
          WHEN $5::boolean AND payment_method = 'COD' AND delivery_mode = 'rider' THEN 'Paid'
          ELSE payment_status
        END,
        cod_status = CASE
          WHEN $5::boolean AND payment_method = 'COD' AND delivery_mode = 'rider' THEN 'Collected'
          ELSE cod_status
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
        AND status NOT IN ('Cancelled', 'Cancellation Requested')
      RETURNING id
      `,
      [token, acceptOrder, driverLatitude, driverLongitude, markDelivered, proofUrl]
    );

    if (!result.rows.length) {
      const blockedResult = await pool.query(
        'SELECT status FROM orders WHERE driver_access_token = $1 LIMIT 1',
        [token]
      );
      if (blockedResult.rows[0]?.status === 'Cancellation Requested') {
        return res.status(409).json({ error: 'The customer requested cancellation. Wait for the admin decision.' });
      }
      return res.status(404).json({ error: 'Driver order link is invalid or expired' });
    }

    const updatedOrder = await fetchOrderById(result.rows[0].id);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update driver order' });
  }
});

router.post('/api/admin/orders/:id/track123/sync',async(req,res)=>{
  try {
    const user=verifyRequestToken(req);if(user.role!=='admin')return res.status(403).json({error:'Admin access only'});
    if(!isTrack123Configured())return res.status(503).json({error:'Automatic courier tracking is not configured yet.'});
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid order ID'});
    await syncCourierOrder(id);const order=await fetchOrderById(id,{includeDriverAccessToken:true});
    if(!order)return res.status(404).json({error:'Order unavailable'});res.json(order);
  }catch(error){res.status(error.status||502).json({error:'Carrier tracking is temporarily unavailable. Please retry later.'});}
});

router.get('/api/orders/:id/logistics-updates',async(req,res)=>{
  try {
    const user=verifyRequestToken(req);
    if(!['admin','customer'].includes(user.role))return res.status(403).json({error:'Access denied'});
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid order ID'});
    const order=(await pool.query(`SELECT o.*,c.updates,c.synced_at AS cached_at,c.tracking_number AS cached_number
      FROM orders o LEFT JOIN order_courier_tracking c ON c.order_id=o.id
      WHERE o.id=$1 AND ($2::boolean OR LOWER(o.gmail)=LOWER($3))`,[id,user.role==='admin',user.email||''])).rows[0];
    if(!order)return res.status(404).json({error:'Order unavailable'});
    if(order.delivery_mode!=='logistics')return res.status(400).json({error:'This order uses Belfiore rider tracking'});
    const matched=order.cached_number===order.tracking_code;
    res.json({trackingCode:order.tracking_code,trackingStatus:order.tracking_status,
      lastCheckpointAt:order.track123_last_checkpoint_at,lastSyncedAt:matched?order.cached_at:null,
      updates:matched&&Array.isArray(order.updates)?order.updates:[],automaticTracking:isTrack123Configured(),
      message:isTrack123Configured()?'Awaiting carrier updates.':'Automatic courier tracking is not configured yet.'});
  }catch(error){res.status(error.status||500).json({error:error.status?'Authentication required':'Carrier updates are temporarily unavailable.'});}
});

export default router;
