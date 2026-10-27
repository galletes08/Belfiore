export const inventoryTypeLabel=p=>p.inventory_type==='GARDENING_SUPPLY'?'Gardening Supplies':p.inventory_type==='edible'?'Lettuce':'Succulent';
export const inventoryStatus=p=>p.alert||(p.variants?(p.variants.some(v=>v.status==='Low Stock')?'Low Stock':p.variants.some(v=>v.available>0)?'Available':p.variants[0]?.status||'Awaiting Stock Entry'):p.current_status||'Available');
export function staffInventorySummary(products){
 const alerts=products.flatMap(p=>p.variants?p.variants.filter(v=>['Low Stock','Out of Stock','Awaiting Stock Entry','Choose Stock Model'].includes(v.status)).map(v=>({product:p,name:`${p.name} / ${v.name}`,status:v.status})):p.alert?[{product:p,name:p.name,status:p.alert}]:[]);
 return {total:products.length,plants:products.filter(p=>p.inventory_type==='succulent').reduce((n,p)=>n+Number(p.stock||0),0),packs:products.filter(p=>p.inventory_type==='edible'&&p.lettuce_stock_model==='quantity').reduce((n,p)=>n+Number(p.stock||0),0),alerts};
}
export function filterStaffInventory(products,search,filter){
 const query=search.trim().toLowerCase();return products.filter(p=>{
  if(![p.name,p.product_code,p.tag,p.category,...(p.variants||[]).flatMap(v=>[v.name,v.sku])].join(' ').toLowerCase().includes(query))return false;
  if(filter==='All Products')return true;
  if(filter==='Needs Attention')return staffInventorySummary([p]).alerts.length>0;
  return filter===inventoryTypeLabel(p)||inventoryStatus(p)===filter||Boolean(p.variants?.some(v=>v.status===filter));
 });
}
