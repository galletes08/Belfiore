import { DELIVERY_CONFIG, getConfiguredDeliveryQuote } from '../../delivery.config.js';

export const FREE_SHIPPING_THRESHOLD = DELIVERY_CONFIG.freeShippingThreshold;

export function getParcelWeightKg(items = []) {
  if (!Array.isArray(items) || items.length === 0) return null;

  let totalWeight = 0;
  for (const item of items) {
    const weightKg = Number(item?.weightKg);
    const qty = Number(item?.qty);
    if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(qty) || qty <= 0) {
      return null;
    }
    totalWeight += weightKg * qty;
  }

  return totalWeight;
}

export function getShippingQuote({ country, province, city, barangay, postalCode, subtotal, items }) {
  const parcelWeightKg = getParcelWeightKg(items);

  return getConfiguredDeliveryQuote({
    country,
    province,
    city,
    barangay,
    postalCode,
    subtotal,
    parcelWeightKg,
  });
}
