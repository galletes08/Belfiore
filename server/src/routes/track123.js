import { Router } from 'express';
import { pool } from '../config/db.js';
import {syncCourierOrder} from '../utils/courierTracking.js';
import { extractTrack123WebhookUpdate, verifyTrack123WebhookRequest } from '../utils/track123.js';

const router = Router();

router.post('/api/track123/webhook', async (req, res) => {
  try {
    if (!verifyTrack123WebhookRequest(req)) {
      return res.status(401).json({ error: 'Invalid Track123 webhook token' });
    }

    const update = extractTrack123WebhookUpdate(req.body);
    if (!update) {
      return res.json({ received: true, ignored: true });
    }

    const orders=await pool.query("SELECT id FROM orders WHERE tracking_code=$1 AND delivery_mode='logistics'",[update.trackingNumber]);
    for(const order of orders.rows)await syncCourierOrder(Number(order.id));

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to process Track123 webhook' });
  }
});

export default router;
