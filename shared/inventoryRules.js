export function isSoldSucculent(product) {
  return product.inventoryType === 'succulent' && Boolean(product.soldAt || product.status === 'Sold');
}

export function isOutOfStock(product) {
  return !product.archivedAt && product.stock === 0 &&
    !['Reserved', 'Sold','Awaiting Stock Entry','Choose Stock Model'].includes(product.status) && !isSoldSucculent(product);
}

export function compareInventoryProducts(a, b) {
  const priority = product => isSoldSucculent(product) ? 4 :
    product.status === 'Available' ? 0 : product.status === 'Reserved' ? 1 :
      ['Low Stock', 'Out of Stock'].includes(product.status) ? 2 : 3;
  return priority(a) - priority(b) ||
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || Number(b.id) - Number(a.id);
}
