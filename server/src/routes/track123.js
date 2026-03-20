import { Router } from 'express';
import { pool } from '../config/db.js';
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

    await pool.query(
      `
      UPDATE orders
      SET
        tracking_code = COALESCE(NULLIF($2, ''), tracking_code),
        tracking_courier_code = COALESCE(NULLIF($3, ''), tracking_courier_code),
        tracking_status = COALESCE(NULLIF($4, ''), tracking_status),
        track123_tracking_id = COALESCE(NULLIF($5, ''), track123_tracking_id),
        track123_last_checkpoint_at = COALESCE($6::timestamptz, track123_last_checkpoint_at),
        track123_last_synced_at = NOW(),
        updated_at = NOW()
      WHERE tracking_code = $1
      `,
      [
        update.trackingNumber,
        update.trackingNumber,
        update.courierCode,
        update.trackingStatus,
        update.trackingId,
        update.checkpointTime,
      ]
    );

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to process Track123 webhook' });
  }
});

export default router;
