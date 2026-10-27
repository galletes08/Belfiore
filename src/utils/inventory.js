import { isOutOfStock } from '../../shared/inventoryRules.js';

export const LETTUCE_VARIETIES = [
  { name: 'Crystal Lettuce (Lalique)', price: 130 },
  { name: 'Lollo Bionda (Evelyn)', price: 120 },
  { name: 'Red Oak Leaf (Rouxai)', price: 140 },
  { name: 'Romaine (Tiberius RZ)', price: 130 },
  { name: 'Batavia (Ruby Sky RZ)', price: 140 },
];
export const INVENTORY_ACTIONS = ['Initial Balance Migration','Stock Initialized','Variant Archived','Product Added', 'Product Updated', 'Stock In', 'Stock Out', 'Product Reserved',
  'Reservation Released', 'Product Sold', 'Product Archived', 'Product Restored', 'Inventory Adjustment','Harvest Batch Created','Condition Updated','Price Adjusted','Aging Alert','Automatically Placed On Hold','Marked For Disposal','Disposal Confirmed','Reservation Created','Batch Sold / Allocated'];
export function displayProductName(product) {
  const name = product?.name || product?.productName || product?.product_name || 'Unnamed product';
  const code = product?.productCode || product?.product_code;
  const type = product?.inventoryType || product?.inventory_type;
  if(product?.variantName)return `${name} - ${product.variantName} | ${product.variantSku||''} | ${product.sellingUnit||''}`;
  return type === 'succulent' && code ? `${name} — ${code}` : product?.batchCode ? `${name} — ${product.batchCode}` : name;
}
export function newInventoryForm(type = 'succulent') {
  return { inventoryType: type, name: type === 'succulent' ? 'Aloe Hybrid' : '', productCode: '', tag: 'Green',
    price: '', stock: type === 'succulent' ? 1 : 0, lowStockThreshold: 5, description: '', status: 'Available', files: [] };
}
export function matchesInventoryFilter(product, filter) {
  if (filter === 'Archived') return Boolean(product.archivedAt);
  if (product.archivedAt) return false;
  if (filter === 'All Products') return true;
  if (filter === 'Gardening Supplies') return product.inventoryType === 'GARDENING_SUPPLY';
  if (filter === 'Succulents') return product.inventoryType === 'succulent';
  if (filter === 'Edible Plants' || filter === 'Aquaponics') return product.inventoryType === 'edible';
  if (filter.endsWith(' Tag')) return product.tag?.toLowerCase() === filter.split(' ')[0].toLowerCase();
  if (filter === 'Reserved') return product.reservedStock > 0;
  if (filter === 'Available') return product.stock > 0 && !product.archivedAt && !product.legacyQuantityReview;
  if (filter === 'Out of Stock') return isOutOfStock(product);
  return product.status === filter;
}
