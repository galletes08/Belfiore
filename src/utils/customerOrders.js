import { getCustomerUser, hasCustomerToken } from '../api/client';

const LEGACY_STORAGE_KEY = 'customerOrders';
const STORAGE_PREFIX = 'customerOrders-v2';

function getCustomerOrderStorageKey() {
  if (typeof window === 'undefined' || !hasCustomerToken()) return null;

  const customer = getCustomerUser();
  if (!customer || (customer.role ?? 'customer') !== 'customer') return null;

  const customerId = customer.id ?? customer.userId;
  const normalizedEmail = String(customer.email || '').trim().toLowerCase();
  const owner =
    customerId != null && String(customerId).trim()
      ? `id:${customerId}`
      : normalizedEmail
        ? `email:${normalizedEmail}`
        : '';

  return owner ? `${STORAGE_PREFIX}:${encodeURIComponent(owner)}` : null;
}

export function readStoredCustomerOrders() {
  if (typeof window === 'undefined') return [];

  try {
    // Never reuse the old browser-wide order cache for another customer.
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const storageKey = getCustomerOrderStorageKey();
    if (!storageKey) return [];

    const parsedValue = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

export function writeStoredCustomerOrders(orders) {
  if (typeof window === 'undefined') return;
  const storageKey = getCustomerOrderStorageKey();
  if (!storageKey) return;
  window.localStorage.setItem(storageKey, JSON.stringify(orders));
}

export function savePlacedOrder(order) {
  if (!order?.id) return;

  const currentOrders = readStoredCustomerOrders();
  const numericId = Number(order.id);
  const nextEntry = {
    id: Number.isInteger(numericId) && numericId > 0 ? numericId : order.id,
    orderCode: order.orderCode || '',
    createdAt: order.createdAt || new Date().toISOString(),
  };

  const dedupedOrders = currentOrders.filter((entry) => Number(entry?.id) !== Number(nextEntry.id));
  writeStoredCustomerOrders([nextEntry, ...dedupedOrders].slice(0, 100));
}

export function getStoredOrderIds() {
  return readStoredCustomerOrders()
    .map((entry) => Number(entry?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}
