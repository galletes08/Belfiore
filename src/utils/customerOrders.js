const STORAGE_KEY = 'customerOrders';

export function readStoredCustomerOrders() {
  if (typeof window === 'undefined') return [];

  try {
    const parsedValue = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

export function writeStoredCustomerOrders(orders) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
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
