import {compareInventoryProducts,isOutOfStock} from '../../shared/inventoryRules.js';
import {matchesInventoryFilter} from './inventory.js';
import {inventoryAttention} from './inventoryAttention.js';

export const INVENTORY_FILTERS=['All Products','Succulents','Aquaponics','Gardening Supplies','White Tag','Green Tag','Red Tag','Sold','Low Stock','Out of Stock','Archived'];
export function matchesAdvancedInventoryFilters(product,{type='',status='',tag='',stock=''}={}){
 if(type && ((type==='Gardening Supplies' && product.inventoryType!=='GARDENING_SUPPLY') || (type==='Succulents' && product.inventoryType!=='succulent') || (type==='Aquaponics' && product.inventoryType!=='edible')))return false;
 if(status && (status==='Archived' ? !product.archivedAt : product.archivedAt || product.status!==status))return false;
 if(tag && product.tag?.toLowerCase()!==tag.toLowerCase())return false;
 if(stock==='Low Stock' && product.status!=='Low Stock')return false;
 if(stock==='Out of Stock' && !isOutOfStock(product))return false;
 if(stock==='Needs Attention' && inventoryAttention([product]).length===0)return false;
 return true;
}
export function inventoryRows(products,{search='',filter='All Products',advancedFilters={}}={}){
 const query=search.toLowerCase().trim();
 const rows=products.filter(p=>(filter==='Needs Attention'?inventoryAttention([p]).length>0:matchesInventoryFilter(p,filter))&&matchesAdvancedInventoryFilters(p,advancedFilters)&&[p.name,p.productCode,...(p.variants||[]).flatMap(v=>[v.name,v.sku])].join(' ').toLowerCase().includes(query));
 return filter==='All Products'?rows.sort(compareInventoryProducts):rows;
}
export function staffInventoryProduct(p,initializableIds=[]){
 return {...p,product_code:p.productCode,inventory_type:p.inventoryType,image_url:p.imageUrl,reserved_stock:p.reservedStock,allocated_stock:p.committedStock,lettuce_stock_model:p.lettuceStockModel,supply_stock_model:p.supplyStockModel,current_status:p.status,archived_at:p.archivedAt,can_initialize_stock:initializableIds.includes(Number(p.id)),variants:p.inventoryType==='GARDENING_SUPPLY'?(p.variants||[]).filter(v=>!v.archived_at).map(v=>({...v,available:v.available_stock,reserved:Number(v.variant_reserved||0)+Number(v.variant_committed||0),unit:v.selling_unit})):undefined};
}
// Compatibility for existing Staff forms/tests; the live page receives the shared overview DTO.
export function staffProductView(p){
 if(p.inventoryType)return p;
 return {...p,productCode:p.product_code,inventoryType:p.inventory_type,imageUrl:p.image_url,reservedStock:p.reserved_stock,committedStock:p.allocated_stock,lettuceStockModel:p.lettuce_stock_model,supplyStockModel:p.supply_stock_model,archivedAt:p.archived_at,createdAt:p.created_at,status:p.current_status||p.alert||'Available',variants:p.variants?.map(v=>({...v,available_stock:v.available_stock??v.available,selling_unit:v.selling_unit||v.unit})),stockLabel:p.variants?.map(v=>`${v.name}: ${v.available} ${v.unit}`).join(', ')};
}
