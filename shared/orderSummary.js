export function orderSummary(orders) {
  const unique = [...new Map(orders.map(order => [order.id, order])).values()];
  return {
    total: unique.length,
    pending: unique.filter(o => ['Pending','Cancellation Requested'].includes(o.status) || o.paymentStatus === 'Refund Pending' || o.codStatus === 'Remittance Pending' || Boolean(o.inventoryReconciliationReason)).length,
    progress: unique.filter(o => !['Delivered','Cancelled'].includes(o.status) && (['Preparing','Out for Delivery'].includes(o.status) || ['Packed','In Transit','Out for Delivery'].includes(o.trackingStatus))).length,
    delivered: unique.filter(o => o.status === 'Delivered').length,
  };
}
