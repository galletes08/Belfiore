import { pool } from '../config/db.js';
import { verifyPayMongoWebhookSignature } from '../utils/paymongo.js';

export async function handlePayMongoWebhook(req, res) {
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
    const resource = payload?.data?.attributes?.data || {};

    if (eventType === 'checkout_session.payment.paid') {
      const checkoutSessionId = String(resource?.id || '').trim();
      const payment = Array.isArray(resource?.attributes?.payments) ? resource.attributes.payments[0] : null;
      const paymentId = String(payment?.id || '').trim() || null;
      const paymentIntentId = String(payment?.attributes?.payment_intent_id || '').trim() || null;
      const paidAt = payment?.attributes?.paid_at || new Date().toISOString();

      if (checkoutSessionId) {
        await pool.query(
          `
          UPDATE orders
          SET
            payment_status = 'Paid',
            paymongo_payment_id = COALESCE($2, paymongo_payment_id),
            paymongo_payment_intent_id = COALESCE($3, paymongo_payment_intent_id),
            paymongo_paid_at = COALESCE($4::timestamptz, paymongo_paid_at),
            updated_at = NOW()
          WHERE paymongo_checkout_session_id = $1
          `,
          [checkoutSessionId, paymentId, paymentIntentId, paidAt]
        );
      }
    }

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to process PayMongo webhook' });
  }
}
