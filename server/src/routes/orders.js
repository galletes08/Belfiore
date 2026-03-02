import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toUpperCase();
  if (method === 'COD') return 'COD';
  if (method === 'ONLINE') return 'ONLINE';
  return '';
}

router.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
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
      INSERT INTO orders (customer_name, gmail, mobile_num, location, payment_method, payment_status, status, total_amount)
      VALUES ($1, $2, $3, $4, $5, $6, 'Pending', $7)
      RETURNING id, status, total_amount, created_at
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

export default router;
