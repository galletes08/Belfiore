import { isOutOfStock, isSoldSucculent } from '../../shared/inventoryRules.js';

// Count each affected batch once. Suppress its parent stock alert in the total:
// the details still show every reason, without counting the same shortage twice.
export function inventoryAttention(products) {
  return [...new Map(products.map(product => [product.id, product])).values()].filter(product => !product.archivedAt && !isSoldSucculent(product)).flatMap(product => {
    if(product.inventoryType==='GARDENING_SUPPLY'){const variants=(product.variants||[]).filter(v=>!v.archived_at&&['Low Stock','Out of Stock','Awaiting Stock Entry','Choose Stock Model'].includes(v.status));return variants.length?[{product,batches:[],reasons:variants.map(v=>`${v.name}: ${v.status} (${v.available_stock} ${v.selling_unit})`),count:variants.length}]:[];}
    const batches = [...new Map((product.batches || []).map(batch => [batch.id, batch])).values()].filter(batch => batch.physical_stock > 0 &&
      ['Aging', 'On Hold', 'Unsellable', 'Unverified', 'For Disposal'].includes(batch.status));
    const reasons = [];
    if (product.status === 'Low Stock') reasons.push('Low Stock');
    if (isOutOfStock(product)) reasons.push('Out of Stock');
    if (product.legacyQuantityReview) reasons.push('Individual plant validation required');
    if (!batches.length && !reasons.length) return [];
    return [{ product, batches, reasons, count: batches.length || 1 }];
  });
}
