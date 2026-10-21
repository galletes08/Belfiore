import { pool } from '../config/db.js';
import { verifyPayMongoWebhookSignature } from '../utils/paymongo.js';
import { confirmInventoryPayment, releaseOrderInventory } from '../utils/inventory.js';

export async function handlePayMongoWebhook(req, res) {
  let client;
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!rawBody) {
      return res.status(400).json({ error: 'Missing webhook payload' });
    }

    const signatureHeader = req.get('Paymongo-Signature');
    if (!verifyPayMongoWebhookSignature(rawBody, signatureHeader)) {
      return res.status(400).json({ error: 'Invalid PayMongo webhook signature' });
    }

    const payload = JSON.parse(rawBody);
    const eventType = String(payload?.data?.attributes?.type || '').trim();
    const eventId = String(payload?.data?.id || '');
    if (!eventId || !eventType) return res.status(400).json({ error: 'Invalid event' });
    const resource = payload?.data?.attributes?.data || {};

    if (eventType === 'payment.failed') {
      const intentId = resource.attributes?.payment_intent_id;
      if (intentId) {
        client = await pool.connect();
        await client.query('BEGIN');
        const inserted = await client.query(`INSERT INTO paymongo_webhook_events(event_id,event_type)
          VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id`, [eventId, eventType]);
        if (inserted.rows.length) {
          const order = (await client.query(`SELECT * FROM orders WHERE paymongo_payment_intent_id=$1
            AND payment_method='ONLINE' FOR UPDATE`, [intentId])).rows[0];
          if (order?.inventory_state === 'reserved' && order.payment_status === 'Pending') {
            await releaseOrderInventory(client, order, 'Verified PayMongo payment failure');
            await client.query(`UPDATE orders SET status='Cancelled', tracking_status='Cancelled', payment_status='Failed',
              cancel_reason='Online payment failed', cancelled_at=NOW(), cancelled_by='System',
              status_updated_at=NOW(), updated_at=NOW() WHERE id=$1`, [order.id]);
          }
        }
        await client.query('COMMIT');
      }
    }

    if (eventType === 'checkout_session.payment.paid') {
      const checkoutSessionId = String(resource?.id || '').trim();
      const payment = resource?.attributes?.payments?.find(p => p.attributes?.status === 'paid');
      if (!checkoutSessionId || !payment) return res.status(400).json({ error: 'Paid checkout payment is missing' });

      if (checkoutSessionId) {
        client = await pool.connect();
        await client.query('BEGIN');
        const inserted = await client.query(`INSERT INTO paymongo_webhook_events(event_id,event_type)
          VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id`, [eventId, eventType]);
        if (inserted.rows.length) {
          const order = (await client.query(`SELECT * FROM orders WHERE paymongo_checkout_session_id=$1
            AND payment_method='ONLINE' FOR UPDATE`, [checkoutSessionId])).rows[0];
          if (!order) throw new Error('Checkout order is not ready; retry webhook');
          await confirmInventoryPayment(client, order, payment);
        }
        await client.query('COMMIT');
      }
    }

    res.json({ received: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: error.message || 'Failed to process PayMongo webhook' });
  } finally { client?.release(); }
}
