import InventoryOverview,{InventoryAttentionDetails,InventoryProductDetails} from '../admin/InventoryOverview';
import {inventoryRows,staffProductView} from '../utils/inventoryPresentation';
import {isOutOfStock,isSoldSucculent} from '../../shared/inventoryRules.js';
import StaffNotificationBell from './StaffNotificationBell';
import InventoryHistory from '../admin/InventoryHistory';
import {useNavigate,useSearchParams} from 'react-router-dom';
import Modal from '../admin/InventoryModal';
import InventoryActionMenu from '../admin/InventoryActionMenu';
import LettuceStock from '../admin/LettuceStock';
import StaffProductCreate from './StaffProductCreate';
import {useState} from 'react';
import {Eye,History,Package,RefreshCw,Plus,MoreHorizontal,ArrowDownToLine,ArrowUpFromLine} from 'lucide-react';
import {staffApi} from './staffApi';

const button='inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const staffHistoryRequest=params=>staffApi('/api/staff/inventory/history?'+new URLSearchParams(params));
export default function StaffInventory({products,overview,refresh,stockFormComponent}){
 const StockForm=stockFormComponent,navigate=useNavigate();
 const [params]=useSearchParams();
 const [search,setSearch]=useState(''),[filter,setFilter]=useState(()=>params.get('filter')==='Needs Attention'?'Needs Attention':'All Products'),[page,setPage]=useState(1),[details,setDetails]=useState(null),[stock,setStock]=useState(null),[stockBusy,setStockBusy]=useState(false),[creating,setCreating]=useState(null),[createBusy,setCreateBusy]=useState(false),[history,setHistory]=useState(false),[attentionOpen,setAttentionOpen]=useState(false);
 const viewProducts=overview?.products||products.map(staffProductView),active=viewProducts.filter(p=>!p.archivedAt);
 const summary=overview?.summary||{totalProducts:active.length,succulentUnits:active.filter(p=>p.inventoryType==='succulent'&&p.status==='Available').reduce((n,p)=>n+Number(p.stock||0),0),ediblePacks:active.filter(p=>p.inventoryType==='edible'&&p.lettuceStockModel==='quantity').reduce((n,p)=>n+Number(p.stock||0),0),lowStock:active.reduce((n,p)=>n+(p.variants?p.variants.filter(v=>v.status==='Low Stock').length:p.status==='Low Stock'?1:0),0),outOfStock:active.reduce((n,p)=>n+(p.variants?p.variants.filter(v=>v.status==='Out of Stock').length:isOutOfStock(p)?1:0),0)};
 const rows=inventoryRows(viewProducts,{search,filter}),pages=Math.max(1,Math.ceil(rows.length/20)),currentPage=Math.min(page,pages);
 return <div className="mx-auto min-w-0 max-w-7xl space-y-4"><InventoryOverview products={viewProducts} summary={summary} rows={rows} page={currentPage} pages={pages} setPage={setPage} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} notification={<StaffNotificationBell/>} onAttention={()=>setAttentionOpen(true)} headerActions={<><button className={button} onClick={()=>setHistory(true)}><History size={14}/>History</button><button className={button} onClick={refresh} disabled={stockBusy||createBusy}><RefreshCw size={14}/>Refresh</button><button className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1f5a43] px-3 py-2 text-xs font-semibold text-white hover:bg-[#174b37] focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50" disabled={stockBusy||createBusy} onClick={()=>setCreating({})}><Plus size={14}/>Add Product</button></>} renderActions={p=><>
 <button className={button} onClick={()=>setDetails(p.id)}><Eye size={14}/>Details</button>
 {isSoldSucculent(p)?<button className={button} onClick={()=>setHistory(p)}><History size={14}/>History</button>:<>
 {p.inventoryType!=='succulent'&&<InventoryActionMenu label="Stock" productName={p.name} icon={Package} items={[{label:'Stock In',icon:ArrowDownToLine,disabled:Boolean(p.archivedAt),explanation:'Restore the product before adding stock.',action:()=>setStock({id:p.id,direction:'in'})},{label:'Stock Out',icon:ArrowUpFromLine,disabled:Boolean(p.archivedAt),explanation:'Restore the product before removing stock.',action:()=>setStock({id:p.id,direction:'out'})},{label:'View Stock History',icon:History,action:()=>setHistory(p)}]}/>}
 <InventoryActionMenu label="More" productName={p.name} icon={MoreHorizontal} items={[{label:'History',icon:History,action:()=>setHistory(p)}]}/>
 {products.find(raw=>raw.id===p.id)?.can_initialize_stock&&!p.archivedAt&&p.inventoryType==='GARDENING_SUPPLY'&&(p.variants||[]).every(v=>['Awaiting Stock Entry','Choose Stock Model'].includes(v.status))&&<button className={button} disabled={stockBusy||createBusy} onClick={()=>setCreating({id:p.id})}>Configure New Supply</button>}
 </>}
 </>}/>
 {creating&&<Modal title="Add Product" busy={createBusy} onClose={()=>setCreating(null)}><StaffProductCreate embedded key={creating.id||'new'} initialSupplyId={creating.id} refresh={refresh} onBusyChange={setCreateBusy} onClose={()=>setCreating(null)}/></Modal>}
 {attentionOpen&&<Modal title="Inventory Alerts" onClose={()=>setAttentionOpen(false)}><InventoryAttentionDetails products={viewProducts} onDetails={p=>{setAttentionOpen(false);setDetails(p.id);}}/></Modal>}
 {history&&<Modal title="Inventory History" onClose={()=>setHistory(false)}><InventoryHistory product={typeof history==='object'?history:undefined} historyRequest={staffHistoryRequest} refreshVersion={products} onViewOrder={id=>navigate('/staff/orders?orderId='+id)}/></Modal>}
 {details&&viewProducts.find(p=>p.id===details)&&<Modal title="Product Details" onClose={()=>setDetails(null)}><InventoryProductDetails product={viewProducts.find(p=>p.id===details)}/></Modal>} {stock&&<Modal title={stock.direction==='in'?'Stock In':'Stock Out'} busy={stockBusy} onClose={()=>setStock(null)}>{(()=>{const product=products.find(p=>p.id===stock.id);return product?.inventory_type==='edible'?<LettuceStock key={stock.id+stock.direction} product={{id:product.id,name:product.name,productCode:product.product_code,lettuceStockModel:product.lettuce_stock_model,stock:product.stock,reservedStock:product.reserved_stock,committedStock:product.allocated_stock,physicalStock:Number(product.stock)+Number(product.reserved_stock||0)+Number(product.allocated_stock||0)}} direction={stock.direction} notesRequired={stock.direction==='out'} allowedReasons={['New Harvest','Disposal / Spoiled','Damaged']} stockRequest={(id,body,key)=>staffApi('/api/staff/inventory/'+id+'/lettuce-stock',body,'POST',{'Idempotency-Key':key})} orderBasePath="/staff/orders" onChanged={()=>refresh({quiet:true})} onClose={()=>setStock(null)} onBusyChange={setStockBusy}/>:<StockForm key={stock.id+stock.direction} products={products.filter(p=>!p.archived_at)} refresh={()=>refresh({quiet:true})} initialProductId={stock.id} initialDirection={stock.direction} onBusyChange={setStockBusy}/>;})()}</Modal>}
 </div>;
}
