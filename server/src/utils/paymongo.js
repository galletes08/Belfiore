import crypto from 'node:crypto';

const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';
const DEFAULT_PAYMENT_METHOD_TYPES = ['gcash', 'paymaya', 'card'];

function getSecretKey() {
  return String(process.env.PAYMONGO_SECRET_KEY || '').trim();
}

function getWebhookSecret() {
  return String(process.env.PAYMONGO_WEBHOOK_SECRET || '').trim();
}

function getAuthHeader() {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new Error('PayMongo secret key is missing. Set PAYMONGO_SECRET_KEY in server/.env.');
  }

  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

function getFrontendUrl(origin = '') {
  const configuredUrl = String(process.env.PAYMONGO_FRONTEND_URL || '').trim();
  const resolved = configuredUrl || String(origin || '').trim();
  return resolved.replace(/\/+$/, '');
}

function getRequestedPaymentMethodTypes() {
  const configuredMethods = String(process.env.PAYMONGO_PAYMENT_METHOD_TYPES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configuredMethods.length ? configuredMethods : DEFAULT_PAYMENT_METHOD_TYPES;
}

function toCentavos(amount) {
  return Math.round(Number(amount || 0) * 100);
}

export function isPayMongoConfigured() {
  return Boolean(getSecretKey());
}

export async function createPayMongoCheckoutSession({
  orderId,
  orderCode,
  customerName,
  customerEmail,
  items,
  requestOrigin,
}) {
  const frontendUrl = getFrontendUrl(requestOrigin);
  if (!frontendUrl) {
    throw new Error('PayMongo redirect URL is missing. Set PAYMONGO_FRONTEND_URL in server/.env.');
  }

  const payload = {
    data: {
      attributes: {
        billing: {
          name: customerName,
          email: customerEmail,
        },
        cancel_url: `${frontendUrl}/orders?paymongo=cancel&orderId=${orderId}`,
        description: `Payment for ${orderCode}`,
        line_items: items.map((item) => ({
          amount: toCentavos(item.unitPrice),
          currency: 'PHP',
          description: item.productName,
          name: item.productName,
          quantity: Number(item.qty),
        })),
        payment_method_types: getRequestedPaymentMethodTypes(),
        send_email_receipt: true,
        success_url: `${frontendUrl}/orders?paymongo=success&orderId=${orderId}`,
      },
    },
  };

  const response = await fetch(`${PAYMONGO_API_URL}/checkout_sessions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.errors?.[0]?.detail ||
      data?.errors?.[0]?.code ||
      data?.message ||
      'Failed to create PayMongo checkout session.';
    throw new Error(message);
  }

  return {
    checkoutUrl: data?.data?.attributes?.checkout_url || '',
    id: data?.data?.id || '',
  };
}

function parseSignatureHeader(signatureHeader) {
  return String(signatureHeader || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((result, part) => {
      const [key, value] = part.split('=');
      if (key && value) result[key] = value;
      return result;
    }, {});
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPayMongoWebhookSignature(rawPayload, signatureHeader) {
  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) return true;

  const parsedSignature = parseSignatureHeader(signatureHeader);
  const timestamp = parsedSignature.t;
  if (!timestamp) return false;

  const signedPayload = `${timestamp}.${rawPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');

  const isMatch = safeEqual(parsedSignature.te, expectedSignature) || safeEqual(parsedSignature.li, expectedSignature);
  if (!isMatch) return false;

  const maxAgeSeconds = 300;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = Math.abs(nowSeconds - Number(timestamp));
  return Number.isFinite(ageSeconds) && ageSeconds <= maxAgeSeconds;
}
