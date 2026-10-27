import {staffInventoryProduct} from '../utils/inventoryPresentation';
import Activities from './StaffActivity';
import StaffLayout from './StaffLayout';
import StaffDashboard from './StaffDashboard';
import StaffAccount,{StaffPasswordForm} from './StaffAccount';
import {WorkspacePageHeader} from '../admin/WorkspacePrimitives';
import useOperationsSync from '../hooks/useOperationsSync';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Navigate,useLocation,useNavigate} from 'react-router-dom';
import {staffApi,staffSession,clearStaff} from './staffApi';
import StaffInventory from './StaffInventory';
import StaffOrders from './StaffOrders';

const sections=[['dashboard','Dashboard'],['inventory','Inventory'],['orders','Orders']];
const input='staff-field';
const button='staff-primary';
function StockForm({products,refresh,initialProductId,onBusyChange,initialDirection='in'}){
 const [productId,setProductId]=useState(initialProductId?String(initialProductId):''),[variantId,setVariantId]=useState(''),[direction,setDirection]=useState(initialDirection),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const sending=useRef(false),receipt=useRef({});const product=products.find(p=>String(p.id)===productId),supply=product?.inventory_type==='GARDENING_SUPPLY';
 const unavailable=product&&(supply?product.supply_stock_model==='unconfigured'||!product.variants?.length||(!product.can_initialize_stock&&!product.variants?.some(v=>!['Awaiting Stock Entry','Choose Stock Model'].includes(v.status))):product.lettuce_stock_model!=='quantity');
 return <form className="grid max-w-xl gap-3 rounded-xl border bg-white p-4" onSubmit={async e=>{e.preventDefault();if(sending.current)return;sending.current=true;setBusy(true);onBusyChange?.(true);setMessage('');const b=Object.fromEntries(new FormData(e.currentTarget)),signature=JSON.stringify(b);if(receipt.current.signature!==signature)receipt.current={signature,key:crypto.randomUUID()};try{const body={direction,quantity:Number(b.quantity),reason:b.reason,notes:b.notes};await staffApi(supply?`/api/staff/supplies/${productId}/stock`:`/api/staff/inventory/${productId}/lettuce-stock`,supply?{...body,variantId:Number(variantId),confirm:true,requestId:receipt.current.key}:{...body,confirmed:true},'POST',{'Idempotency-Key':receipt.current.key});receipt.current={};setMessage('Stock transaction recorded.');e.target.reset();await refresh();}catch(e){setMessage(e.message);}finally{sending.current=false;setBusy(false);onBusyChange?.(false);}}}>
 <h2 className="text-lg font-semibold">Record verified stock</h2><label>Product<select className={input} name="product" value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('');setDirection('in');}} required><option value="">Select product</option>{products.filter(p=>p.inventory_type!=='succulent').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 {supply&&<label>Variant<select className={input} name="variant" value={variantId} onChange={e=>{setVariantId(e.target.value);const v=product.variants.find(v=>String(v.id)===e.target.value);setDirection(current=>product.can_initialize_stock&&v?.status==='Awaiting Stock Entry'?'initial':current==='initial'?'in':current);}} required><option value="">Select exact variant</option>{product.variants.map(v=><option key={v.id} value={v.id}>{v.name} · {v.sku} · {v.available} {v.unit} available</option>)}</select></label>}
 {unavailable&&<p role="status">Stock setup or reconciliation is incomplete. Contact an administrator to configure verified opening stock. Staff cannot override setup.</p>}
 <label>Movement<select className={input} name="direction" value={direction} onChange={e=>setDirection(e.target.value)}>{supply&&product?.can_initialize_stock&&product.variants.some(v=>String(v.id)===variantId&&v.status==='Awaiting Stock Entry')&&<option value="initial">Verified Opening Stock</option>}<option value="in">Stock In</option><option value="out">Stock Out</option></select></label><label>Quantity {supply?'in selected selling units':'in 400g packs'}<input className={input} type="number" min="1" step="1" name="quantity" required/></label><label>Reason<select key={direction+String(supply)} className={input} name="reason">{(direction==='initial'?['Initial Stock']:direction==='in'?[supply?'Stock In':'New Harvest']:['Disposal / Spoiled','Damaged']).map(r=><option key={r}>{r}</option>)}</select></label><label>{!supply&&direction==='in'?'Notes (optional)':'Short note'}<textarea className={input} name="notes" minLength={supply||direction!=='in'?3:undefined} maxLength={800} required={supply||direction!=='in'}/></label><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="confirmed" required className="mt-1"/>I confirm ready-to-sell, quality-approved Stock In, or verified disposal/damage of unreserved available stock only.</label><button className={button} disabled={busy||!product||unavailable||(supply&&!variantId)}>{busy?'Recording…':'Record Stock Movement'}</button><p role="status">{message}</p></form>;
}
export default function StaffPortal(){
 const location=useLocation(),navigate=useNavigate(),session=staffSession(),section=location.pathname.split('/')[2]||'dashboard',ordersView=new URLSearchParams(location.search).get('view')==='shipments'?'shipments':'preparation';
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[loadedSection,setLoadedSection]=useState(''),[page,setPage]=useState(1);
 const loadSequence=useRef(0),logoutPending=useRef(false);
 const [signingOut,setSigningOut]=useState(false);
 const signOut=async()=>{if(logoutPending.current)return;logoutPending.current=true;setSigningOut(true);try{await staffApi('/api/staff/logout',{});}finally{clearStaff();navigate('/staff/login',{replace:true});logoutPending.current=false;setSigningOut(false);}};
 const refresh=useCallback(async({quiet=false}={})=>{
  const sequence=++loadSequence.current;if(!quiet){setLoading(true);setError('');}
  try{
   const path=section==='orders'?'orders/overview':section==='inventory'?'inventory/overview':section;
   const result=await staffApi('/api/staff/'+path+(path==='activity'?'?page='+page:''));
   if(sequence===loadSequence.current){setData(result);setError('');}
  }catch(e){if(sequence===loadSequence.current){if(!quiet)setData(null);setError(e.message);}}
  finally{if(sequence===loadSequence.current){setLoadedSection(section);setLoading(false);}}
 },[section,page]);
 useEffect(()=>{if(session&&!session.mustChangePassword)refresh();},[refresh,session?.token,session?.mustChangePassword]); // eslint-disable-line react-hooks/exhaustive-deps
 useOperationsSync(refresh,Boolean(session&&!session.mustChangePassword&&['dashboard','inventory','orders'].includes(section)));
 if(location.pathname==='/staff'||location.pathname==='/staff/')return <Navigate to="/staff/dashboard" replace/>;
 if(['packing','stock','shipments'].includes(section))return <Navigate to={section==='stock'?'/staff/inventory':section==='shipments'?'/staff/orders?view=shipments':'/staff/orders'} replace/>;
 if(![...sections.map(([path])=>path),'profile','activity'].includes(section))return <Navigate to="/staff/dashboard" replace/>;
 if(!session)return <Navigate to="/staff/login" replace/>;
 if(session.mustChangePassword)return <main className="staff-shell grid min-h-screen place-items-center bg-[#f4f7f5] px-4 py-8"><div className="w-full max-w-lg space-y-5"><WorkspacePageHeader eyebrow="Account Security" title="Secure your Staff account" description="Change your temporary credential to continue to your workspace."/><StaffPasswordForm/></div></main>;
 return <StaffLayout session={session} account={section==='profile'?data:null} onSignOut={signOut} signingOut={signingOut}>
  {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button className="min-h-11 px-2 font-semibold underline" disabled={loading} onClick={refresh}>Retry</button></div>}
  {loadedSection!==section||(!data&&loading)?<div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading operations...</div>:<>
   {section==='dashboard'&&data&&<StaffDashboard data={data} refresh={refresh} busy={loading}/>}
   {section==='orders'&&Array.isArray(data)&&<StaffOrders orders={data} refresh={refresh} onError={setError} shipmentsOnly={ordersView==='shipments'}/>}
   {section==='inventory'&&data?.products&&<StaffInventory overview={data} products={data.products.map(p=>staffInventoryProduct(p,data.initializableSupplyIds))} refresh={refresh} stockFormComponent={StockForm}/>}
   {section==='activity'&&data&&<><WorkspacePageHeader eyebrow="Personal Activity" title="My Activity" description="Your recorded account and operational actions."/><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Activities data={{rows:data.rows.slice(0,30)}}/><div className="mt-4 flex flex-wrap items-center gap-3"><button className={button} disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span className="text-xs text-slate-500">Page {page}</span><button className={button} disabled={data.rows.length<31} onClick={()=>setPage(p=>p+1)}>Next</button></div></section></>}
   {section==='profile'&&data&&<StaffAccount data={data} refresh={refresh} onSignOut={signOut} signingOut={signingOut}/>}
  </>}
 </StaffLayout>;
}
