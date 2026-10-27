import History from './InventoryHistory';
import Modal from './InventoryModal';
import {OPERATIONS_EVENT,OPERATIONS_STORAGE_KEY,operationsViewIsEditing} from '../utils/operationsSync';
import LettuceStock from './LettuceStock';
import GardeningSupplies from './GardeningSupplies';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, Sprout, Leaf, AlertTriangle, Activity, History as HistoryIcon, RefreshCw, Plus, Search, Eye, Pencil, MoreHorizontal, Archive, RotateCcw, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import InventoryActionMenu from './InventoryActionMenu';
import { compareInventoryProducts, isSoldSucculent } from '../../shared/inventoryRules.js';
import HarvestBatches from './HarvestBatches';
import NotificationBell from './NotificationBell';
import { inventoryAttention } from '../utils/inventoryAttention';
import { apiSupply,apiInventory, apiCreateProduct, apiCreateProductsBulk,
  apiUpdateProduct, apiArchiveProduct, apiRestoreProduct, getImageUrl } from '../api/client';
import { LETTUCE_VARIETIES, matchesInventoryFilter, newInventoryForm } from '../utils/inventory';

const FILTERS = ['All Products', 'Succulents', 'Edible Plants', 'Gardening Supplies', 'White Tag', 'Green Tag', 'Red Tag', 'Aquaponics',
  'Available', 'Reserved', 'Sold', 'Low Stock', 'Out of Stock', 'Archived', 'Unavailable'];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const primaryClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1f5a43] px-3 py-2 text-xs font-semibold text-white hover:bg-[#174b37] focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const initialForm = newInventoryForm();
const money = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);
const date = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—';

function ProductImage({ product, large = false }) {
  const [broken, setBroken] = useState(false);
  const url = getImageUrl(product.imageUrl);
  useEffect(() => { setBroken(false); }, [url]);
  return url && !broken ? <img src={url} alt={product.name} onError={() => setBroken(true)}
    className={large ? 'h-56 w-full rounded-2xl object-contain bg-slate-50' : 'h-11 w-11 rounded-xl object-cover'} />
    : <div role="img" aria-label="Product image unavailable" className={`flex items-center justify-center rounded-xl bg-emerald-50 text-xs text-emerald-800 ${large ? 'h-56 w-full' : 'h-11 w-11'}`}>No image</div>;
}
function Field({ label, children }) {
  return <label className="block space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;
}
function ListingConfirmation({ product, restore, busy, onCancel, onConfirm }) {
  const [reasonType, setReasonType] = useState('Temporarily Unavailable');
  const [reason, setReason] = useState('');
  const [confirmSellable, setConfirmSellable] = useState(false);
  const needsReview = restore && product.inventoryType === 'succulent' && (product.legacyQuantityReview || product.stock !== 1);
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); onConfirm({ reasonType, reason: restore || reasonType === 'Other Reason' ? reason : reasonType, confirmSellable }); }}>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Product Name', product.name], ['Product Code', product.productCode], ['Product Type', product.inventoryType==='GARDENING_SUPPLY'?'Gardening Supplies':product.inventoryType === 'succulent' ? 'Succulent' : 'Edible Plant'], ['Tag / Variety', product.inventoryType === 'succulent' ? product.tag : product.name], ['Current Status', product.status]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-900">{value}</dd></div>)}</dl>
    <p className="text-sm text-slate-600">{restore ? 'Are you sure you want to restore this product? It will return to active inventory only after availability and inventory validation. Restoring a listing does not create new stock.' : 'Archive this product and hide it from active selling? Recorded quantities, images, orders and history will be preserved.'}</p>
    {restore && product.archiveReason && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><strong>Archive Reason:</strong> {product.archiveReason}</p>}
    {needsReview && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This record requires inventory validation. Verify each physical plant and create individual listings with their own images and codes; keep the grouped record archived to retain its history. Its quantity will not be changed automatically.</p>}
    {!restore && <Field label="Archive Reason"><select className={inputClass} disabled={busy} value={reasonType} onChange={e => setReasonType(e.target.value)}>{['Damaged Plant', 'Dead Plant', 'No Longer for Sale', 'Temporarily Unavailable', 'Other Reason'].map(r => <option key={r}>{r}</option>)}</select></Field>}
    {(restore || reasonType === 'Other Reason') && <Field label={restore ? 'Restore Reason / Inspection Details' : 'Reason Description'}><textarea required minLength={3} maxLength={1000} className={inputClass} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></Field>}
    {restore && product.stock > 0 && <label className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><input type="checkbox" required disabled={busy || needsReview} checked={confirmSellable} onChange={e => setConfirmSellable(e.target.checked)} className="mt-1 accent-emerald-700" /><span>I have physically inspected the {product.inventoryType==='GARDENING_SUPPLY'?'gardening supplies':product.inventoryType === 'succulent' ? 'individual plant' : '400g lettuce packs'} and confirm the inventory is still available and sellable, including checking any previous damage or unavailability.</span></label>}
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={onCancel}>Cancel</button><button className={primaryClass} disabled={busy || needsReview}>{busy ? 'Saving…' : restore ? 'Confirm Restore' : 'Confirm Archive'}</button></div>
  </form>;
}
export default function AdminInventory() {
  const location = useLocation();
  const navigate = useNavigate();
  const returnState = location.state?.inventoryHistory;
  const [data, setData] = useState({ products: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(() => returnState ? {mode:'history',product:returnState.productId?{id:returnState.productId}:undefined,batch:returnState.batchId?{id:returnState.batchId}:undefined,filters:returnState.filters} : null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const requestKeyRef = useRef('');
  const mutationRef = useRef(false);
  const supplyBusy = value => { mutationRef.current=value; setBusy(value); };
  const dashboardTargetRef = useRef('');
  const [filter, setFilter] = useState(returnState?.inventoryFilter || 'All Products');
  const [search, setSearch] = useState(returnState?.inventorySearch || '');
  const [page, setPage] = useState(returnState?.inventoryPage || 1);
  const readSequence=useRef(0);
  const reload = useCallback(async () => {
    const sequence=++readSequence.current;
    try { const result=await apiInventory();if(sequence===readSequence.current){setData(result);setLoadError('');} }
    catch (err) { if(sequence===readSequence.current)setLoadError(err.message); }
    finally { if(sequence===readSequence.current)setLoading(false); }
  }, []);
  useEffect(() => {
    reload();
    const refresh = () => { if (!document.hidden&&!operationsViewIsEditing()) reload(); };
    const storage=e=>{if(e.key===OPERATIONS_STORAGE_KEY)refresh();};
    window.addEventListener(OPERATIONS_EVENT,refresh);window.addEventListener('storage',storage);window.addEventListener('focus',refresh);
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh);window.removeEventListener(OPERATIONS_EVENT,refresh);window.removeEventListener('storage',storage);window.removeEventListener('focus',refresh); };
  }, [reload]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const productId = params.get('productId');
    if (!productId || loading || loadError || dashboardTargetRef.current === location.key) return;
    dashboardTargetRef.current = location.key;
    const product = data.products.find(p => String(p.id) === productId);
    const batchId = params.get('batchId');
    if (!product || (batchId && !product.batches?.some(b => String(b.id) === batchId))) {
      setNotice('The linked inventory product or batch is no longer available or accessible.');
      return;
    }
    setSearch(product.productCode);
    setFilter(product.archivedAt ? 'Archived' : isSoldSucculent(product) ? 'Sold' : 'All Products');
    setPage(1);
    setModal({mode:product.inventoryType==='GARDENING_SUPPLY'?'supplies':'details', product, batchId:batchId ? Number(batchId) : undefined});
    setNotice(batchId ? `Located ${product.productCode}, batch ${product.batches.find(b => String(b.id) === batchId).batch_code}.` : `Located ${product.productCode}.`);
  }, [location.search, location.key, loading, loadError, data.products]);
  const rows = useMemo(() => {
    const matching = data.products.filter(p => matchesInventoryFilter(p, filter) &&
      `${p.name} ${p.productCode}`.toLowerCase().includes(search.toLowerCase().trim()));
    return filter === 'All Products' ? matching.sort(compareInventoryProducts) : matching;
  }, [data.products, filter, search]);
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  useEffect(() => { if (!loading) setPage(p => Math.min(p, pages)); }, [pages, loading]);
  const close = () => { if(mutationRef.current)return; setModal(null); setError(''); };
  const openForm = product => {
    if(mutationRef.current)return;
    if (product && isSoldSucculent(product)) { setError('Sold succulents are read-only. Details and history remain available.'); return; }
    setForm(product ? { ...initialForm, ...product, tag: ['White', 'Green', 'Red'].find(tag => tag.toLowerCase() === product.tag?.toLowerCase()) || 'Green', files: [], stock: product.stock } : { ...initialForm, files: [] });
    requestKeyRef.current = crypto.randomUUID();
    setError(''); setNotice(''); setUploadProgress(null); setModal({ mode: 'form', product });
  };
  const update = (key, value) => { requestKeyRef.current = crypto.randomUUID(); setUploadProgress(null); setForm(f => ({ ...f, [key]: value })); };
  const run = async operation => {
    if(mutationRef.current)return;
    mutationRef.current=true;
    setBusy(true); setError('');
    try { await operation(); setModal(null); await reload(); }
    catch (err) { setError(err.message); if (err.confirmedFailure) setUploadProgress(null); }
    finally { mutationRef.current=false; setBusy(false); }
  };
  const submit = e => {
    e.preventDefault();
    if (busy) return;
    if (form.files.length > 50 || form.files.some(file => file.size > 5 * 1024 * 1024 || !file.type.startsWith('image/'))) {
      setError('Select up to 50 image files, each 5MB or smaller. No products were created.');
      return;
    }
    run(async () => {
      const payload = new FormData();
      ['inventoryType', 'name', 'productCode', 'tag', 'price', 'lowStockThreshold', 'description', 'status'].forEach(key => payload.append(key, form[key]??''));
      payload.append('category', form.inventoryType === 'edible' ? 'Aquaponics' : 'Aloe Hybrids');
      if (!modal.product) payload.append('stock', form.inventoryType === 'succulent' ? '1' : form.stock);
      const bulk = !modal.product && form.inventoryType === 'succulent' && form.files.length > 1;
      form.files.forEach(file => payload.append(bulk ? 'images' : 'image', file));
      if (modal.product) { await apiUpdateProduct(modal.product.id, payload); setNotice('Product updated.'); }
      else {
        const total = bulk ? form.files.length : 1;
        setUploadProgress({ percent: 0, total });
        const options = { requestKey: requestKeyRef.current, onProgress: percent => setUploadProgress({ percent, total }) };
        const result = bulk ? await apiCreateProductsBulk(payload, options) : await apiCreateProduct(payload, options);
        const count = bulk ? result.count : 1;
        setNotice(`${count} product${count === 1 ? '' : 's'} successfully created.${form.inventoryType === 'succulent' ? ' Each succulent has its own code and image.' : ' Lettuce inventory is measured in 400g packs.'}`);
        setUploadProgress(null);
      }
    });
  };
  const summary = data.summary;
  const attention = inventoryAttention(data.products);
  const attentionCount = attention.reduce((total, entry) => total + entry.count, 0);
  const cards = [
    ['Total Products', summary.totalProducts ?? 0, 'Active product records'],
    ['Available Succulents', `${summary.succulentUnits ?? 0} plants`, 'Individual plants available for sale'],
    ['Available Lettuce Packs', `${summary.ediblePacks ?? 0} packs`, 'Sellable packs · 400g per pack'],
    ['Needs Attention', attentionCount, 'Distinct products or supply variants requiring action'],
  ];
  return <div className="mx-auto min-w-0 max-w-7xl space-y-4">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Products & stock</p>
      <div className="mt-1 flex items-center justify-between gap-4"><h1 className="min-w-0 text-2xl font-bold text-slate-900">Inventory Management</h1><div className="shrink-0"><NotificationBell /></div></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Manage succulents, lettuce packs and gardening supplies.</p>
        <div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => setModal({ mode: 'history' })}><HistoryIcon size={14} aria-hidden="true" />History</button><button className={buttonClass} onClick={reload}><RefreshCw size={14} aria-hidden="true" />Refresh</button><button className={primaryClass} onClick={() => openForm(null)}><Plus size={14} aria-hidden="true" />Add Product</button></div>
      </div>
    </header>
    <section aria-label="Inventory summary" aria-busy={loading} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, note], index) => {
      const Icon = [Package, Sprout, Leaf, AlertTriangle][index];
      return <article key={label} className="relative flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{index===3&&<button type="button" aria-label="View inventory items needing attention" aria-haspopup="dialog" disabled={loading} onClick={()=>setModal({mode:"attention"})} className="absolute inset-0 z-10 cursor-pointer rounded-xl transition hover:bg-emerald-50/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait"/>}<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${index === 3 && attentionCount ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon size={18} aria-hidden="true" /></span><div><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold text-[#1f5a43]">{loading ? '?' : value}</p><p className="mt-1 text-xs leading-4 text-slate-500">{note}</p></div></article>;
    })}</section>
    <section aria-label="Inventory alerts" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 align-middle shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Activity size={16}/>Inventory Alerts</h2><button className={buttonClass} disabled={loading} onClick={()=>setModal({mode:'attention'})}>View Details</button></div>
      <p className="mt-2 text-xs text-slate-600">Low Stock: {summary.lowStock??0} ? Out of Stock: {summary.outOfStock??0}. {attentionCount?'Review affected products and stock availability.':'No inventory issues requiring attention.'}</p>
    </section>
    {(error || loadError) && !modal && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error || loadError}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_240px]"><Field label="Search products"><div className="relative"><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search product name or code" className={inputClass + " pl-9"} /></div></Field><Field label="Inventory filter"><select className={inputClass} value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>{FILTERS.map(f => <option key={f}>{f}</option>)}</select></Field></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Image', 'Product Code', 'Product Name', 'Product Type', 'Tag / Variety', 'Price', 'Available Quantity', 'Status', 'Actions'].map(col => <th key={col} className="px-3 py-3">{col}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {loading ? <tr><td colSpan={9} className="p-8 text-center text-slate-500">Loading inventory…</td></tr> : rows.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-slate-500">No products match this view.</td></tr> : rows.slice((page - 1) * 20, page * 20).map(p => <tr key={p.id} className="hover:bg-emerald-50/30">
          <td className="px-3 py-2.5 align-middle"><ProductImage product={p} /></td><td className="px-3 py-2.5 align-middle font-mono text-xs">{p.productCode}</td><td className="px-3 py-2.5 align-middle font-semibold text-slate-900">{p.name}</td><td className="px-3 py-2.5 align-middle">{p.inventoryType==='GARDENING_SUPPLY'?'Gardening Supplies':p.inventoryType === 'edible' ? 'Edible Plant' : 'Succulent'}</td><td className="px-3 py-2.5 align-middle">{p.inventoryType==='GARDENING_SUPPLY'?`${p.category} | ${p.variants?.length||0} variants`:p.inventoryType === 'edible' ? p.name : p.tag}</td><td className="px-3 py-2.5 align-middle whitespace-nowrap">{money(p.price)}{p.inventoryType === 'edible' && <span className="block text-xs text-slate-500">per 400g pack</span>}</td><td className="px-3 py-2.5 align-middle">{p.inventoryType==='GARDENING_SUPPLY'?p.stockLabel:p.archivedAt ? <><span className="block">Recorded: {p.physicalStock ?? p.stock} {p.inventoryType === 'edible' ? 'packs' : 'plants'}</span><span className="block text-xs text-slate-500">Available for Sale: 0</span>{p.legacyQuantityReview && <span className="block text-xs text-amber-700">Individual plant validation required</span>}</> : <>{p.inventoryType==='GARDENING_SUPPLY'?p.stockLabel:`${p.stock} ${p.inventoryType === 'edible' ? 'packs' : 'plant'}`}</>}<span className="block text-xs text-slate-500">{p.inventoryType==='GARDENING_SUPPLY'?'Reservations by variant':`${p.reservedStock} reserved / ${p.committedStock||0} allocated`}</span></td><td className="px-3 py-2.5 align-middle"><span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === 'Available' ? 'bg-emerald-50 text-emerald-800' : p.status === 'Reserved' ? 'bg-blue-50 text-blue-800' : ['Low Stock', 'On Hold'].includes(p.status) ? 'bg-amber-50 text-amber-800' : p.status === 'Out of Stock' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{p.status}</span></td>
          <td className="px-3 py-2.5 align-middle"><div className="flex items-center gap-1.5 whitespace-nowrap">
            <button className={buttonClass} onClick={() => setModal({ mode: p.inventoryType==='GARDENING_SUPPLY'?'supplies':'details', product: p })}><Eye size={14} aria-hidden="true" />Details</button>
            {isSoldSucculent(p) ? <button className={buttonClass} onClick={() => setModal({mode:'history',product:p})}><HistoryIcon size={14} aria-hidden="true" />History</button> : p.inventoryType==='GARDENING_SUPPLY'?<InventoryActionMenu label="Stock" productName={p.name} icon={Package} items={[{label:'Stock In / Stock Out',icon:ArrowDownToLine,action:()=>setModal({mode:'supplies',product:p,tab:'stock'})},{label:'Manage Variants',icon:Package,action:()=>setModal({mode:'supplies',product:p})},{label:'View Stock History',icon:HistoryIcon,action:()=>setModal({mode:'history',product:p})}]}/> : p.inventoryType === 'edible' ? <InventoryActionMenu label="Stock" productName={p.name} icon={Package} items={[
              {label:'Stock In',icon:ArrowDownToLine,disabled:Boolean(p.archivedAt),explanation:'Restore the product before adding stock.',action:()=>{setError('');setModal({mode:'lettuceStock',direction:'in',product:p});}},
              {label:'Stock Out',icon:ArrowUpFromLine,disabled:Boolean(p.archivedAt),explanation:'Restore the product before removing stock.',action:()=>{setError('');setModal({mode:'lettuceStock',direction:'out',product:p});}},
              {label:'View Stock History',icon:HistoryIcon,action:()=>setModal({mode:'history',product:p})},
            ]} /> : <button className={buttonClass} onClick={() => openForm(p)}><Pencil size={14} aria-hidden="true" />Edit</button>}
            {!isSoldSucculent(p) && <InventoryActionMenu label="More" productName={p.name} icon={MoreHorizontal} items={[
              ...(p.inventoryType==='GARDENING_SUPPLY'?[{label:'Edit Product / Variants',icon:Pencil,action:()=>setModal({mode:'supplies',product:p,tab:'product'})}]:[]),
              ...(p.inventoryType === 'edible' ? [{label:'Edit',icon:Pencil,action:()=>openForm(p)}] : []),
              {label:'History',icon:HistoryIcon,action:()=>setModal({mode:'history',product:p})},
              p.archivedAt ? {label:'Restore',icon:RotateCcw,action:()=>{setError('');setModal({mode:'restore',product:p});}} : {label:'Archive',icon:Archive,disabled:p.reservedStock>0,explanation:'Active reservations must be resolved before archiving.',action:()=>setModal({mode:'archive',product:p})},
            ]} />}
          </div></td>
        </tr>)}
      </tbody></table></div><div className="flex items-center justify-between gap-3 p-4"><span className="text-xs text-slate-500">{rows.length} products · Page {page} of {pages} · Updates every 30 seconds</span><div className="flex gap-2"><button className={buttonClass} disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className={buttonClass} disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</button></div></div>
    </section>
    <details className="text-sm text-slate-600"><summary className="w-fit cursor-pointer rounded-lg px-2 py-2 font-medium focus-visible:outline-2 focus-visible:outline-emerald-700">Admin inventory setup</summary><div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white p-4"><p>{data.products.filter(p=>p.inventoryType==='GARDENING_SUPPLY'&&p.variants?.some(v=>v.catalog_key)).length} catalog products / {data.products.flatMap(p=>p.variants||[]).filter(v=>v.catalog_key).length} catalog variants already present. Import only adds missing catalog records; existing prices and stock are preserved.</p><button type="button" className={buttonClass} disabled={busy||loading} onClick={()=>{if(window.confirm('Import missing gardening supply catalog entries? Existing products, prices and stock will be preserved.'))run(()=>apiSupply('import-catalog','POST',{}));}}>Import Supply Catalog</button></div></details>
    {modal && <Modal key={modal.mode} freshness={modal.mode==='freshness'} title={modal.mode==='lettuceStock'?(modal.direction==='out'?'Stock Out':'Stock In'):modal.mode === 'form' ? modal.product ? 'Edit Product' : 'Add Product' : modal.mode === 'history' ? 'Inventory History' : modal.mode === 'adjust' ? modal.direction === 'in' ? 'Stock In' : 'Stock Out' : modal.mode === 'archive' ? 'Archive Product' : modal.mode === 'restore' ? 'Restore Product' : modal.mode==='supplies'?'Gardening Supplies':modal.mode==='harvest'?'Harvest Batch Management':modal.mode==='attention'?'Inventory Alerts':'Product Details'} busy={busy} onClose={close}>
      {modal.mode==='lettuceStock'&&<LettuceStock product={data.products.find(p=>p.id===modal.product.id)||modal.product} direction={modal.direction} onBusyChange={supplyBusy} onChanged={reload} onClose={close}/>}
      {modal.mode === 'attention' && <div className="space-y-3"><h3 className="font-semibold">Inventory issues requiring attention</h3><p className="text-xs text-slate-500">Stock alerts use available sellable quantities. Historical batch records remain available in Inventory History.</p>{attention.length ? attention.map(({product, batches, reasons}) => <article key={product.id} className="rounded-xl border border-slate-200 p-3"><p className="text-sm font-semibold">{product.name} <span className="font-mono text-xs text-slate-500">{product.productCode}</span></p>{reasons.length > 0 && <p className="mt-1 text-xs text-amber-800">{reasons.join(' · ')}</p>}{batches.map(batch => <p key={batch.id} className="mt-1 text-xs text-slate-600">{batch.batch_code} · {batch.status} · {batch.physical_stock} physical packs</p>)}<button className={buttonClass + ' mt-2'} onClick={() => setModal({ mode: product.inventoryType === 'edible' ? 'harvest' : 'details', product })}>View Product Details</button></article>) : <p className="text-sm text-slate-500">No inventory issues requiring attention.</p>}</div>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {modal.mode === 'supplies' && <GardeningSupplies product={data.products.find(p=>p.id===modal.product?.id)||modal.product} initialTab={modal.tab||'variants'} externalBusy={busy} onBusyChange={supplyBusy} onChanged={reload} onClose={close} onHistory={()=>setModal({mode:'history',product:modal.product})}/>}
      {modal.mode === 'history' && <History product={modal.product} batch={modal.batch} initialFilters={modal.filters} onViewOrder={(orderId,filters)=>navigate(`/admin/orders?orderId=${encodeURIComponent(orderId)}`,{state:{inventoryHistory:{productId:modal.product?.id,batchId:modal.batch?.id,filters,inventoryFilter:filter,inventorySearch:search,inventoryPage:page}}})} />}
      {modal.mode === 'harvest' && <HarvestBatches product={modal.product} initialMode={modal.direction} initialBatchId={modal.batchId} initialAction={modal.batchAction} onChanged={reload} onHistory={batch=>setModal({mode:'history',product:modal.product,batch})} />}
      {modal.mode === 'details' && <div className="space-y-4"><ProductImage product={modal.product} large /><h3 className="text-lg font-bold">{modal.product.name}</h3><dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Code', modal.product.productCode], ['Status', modal.product.status], ['Price', money(modal.product.price)], ['Unit', modal.product.inventoryType === 'edible' ? '1 Pack = 400g' : '1 individual plant'], ['Recorded Quantity', modal.product.stock], ['Available for Sale', modal.product.archivedAt ? 0 : modal.product.stock], ['Reserved', modal.product.reservedStock], ['Date Added', date(modal.product.createdAt)], ['Tag / Variety', modal.product.inventoryType === 'edible' ? modal.product.name : modal.product.tag]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl><p className="text-sm text-slate-600">{modal.product.description || 'No description added.'}</p>{modal.product.legacyQuantityReview && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Legacy record contains multiple plants. Create individual listings after verifying each plant; this record is excluded from checkout.</p>}</div>}
      {['archive', 'restore'].includes(modal.mode) && <ListingConfirmation product={modal.product} restore={modal.mode === 'restore'} busy={busy} onCancel={close} onConfirm={payload => run(async () => {
        const result = modal.mode === 'restore' ? await apiRestoreProduct(modal.product.id, payload) : await apiArchiveProduct(modal.product.id, payload);
        setNotice(result.message);
      })} />}
      {modal.mode === 'form' && <Field label="Product Type"><select className={inputClass} aria-label="Product Type" value={form.inventoryType} disabled={busy||Boolean(modal.product)} onChange={e=>{if(mutationRef.current)return;requestKeyRef.current=crypto.randomUUID();setError('');setUploadProgress(null);setForm(newInventoryForm(e.target.value));}}><option value="succulent">Succulent</option><option value="edible">Lettuce</option><option value="GARDENING_SUPPLY">Gardening Supply</option></select></Field>}
      {modal.mode==='form'&&form.inventoryType==='GARDENING_SUPPLY'&&<div className="mt-4"><GardeningSupplies onChanged={reload} onClose={close} externalBusy={busy} onBusyChange={supplyBusy} onCreated={product=>{setNotice('Product created. Add variants and choose the stock model; opening inventory still requires verification.');setModal({mode:'supplies',product});}}/></div>}
      {modal.mode === 'form' && form.inventoryType!=='GARDENING_SUPPLY' && <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
        {form.inventoryType === 'edible' && !modal.product && <Field label="Lettuce Variety (suggested prices)"><select className={inputClass} value={LETTUCE_VARIETIES.some(v => v.name === form.name) ? form.name : ''} onChange={e => { const variety = LETTUCE_VARIETIES.find(v => v.name === e.target.value); if (variety) { requestKeyRef.current = crypto.randomUUID(); setForm(f => ({ ...f, name: variety.name, price: variety.price })); } }}><option value="">Select variety</option>{LETTUCE_VARIETIES.map(v => <option key={v.name} value={v.name}>{v.name} · {money(v.price)}</option>)}</select></Field>}
        <Field label={form.inventoryType === 'edible' ? 'Product / Variety Name' : 'Product Name'}><input className={inputClass} required value={form.name} onChange={e => update('name', e.target.value)} /></Field>
        <Field label="Unique Product Code"><input className={inputClass} value={form.productCode} maxLength={80} onChange={e => update('productCode', e.target.value)} placeholder="Auto-generated when blank" disabled={form.files.length > 1} /></Field>
        {form.inventoryType === 'succulent' && <Field label="Tag Category"><select className={inputClass} value={form.tag} onChange={e => update('tag', e.target.value)}>{['White', 'Green', 'Red'].map(tag => <option key={tag}>{tag}</option>)}</select></Field>}
        <Field label={form.inventoryType === 'edible' ? 'Price per 400g Pack (PHP)' : 'Selling Price (PHP)'}><input className={inputClass} required type="number" min="0" step="0.01" value={form.price} onChange={e => update('price', e.target.value)} /></Field>
        <Field label={form.inventoryType === 'edible' ? 'Available Packs' : 'Quantity'}><input className={inputClass} required type="number" min="0" step="1" value={form.stock} readOnly={Boolean(modal.product) || form.inventoryType === 'succulent' || form.inventoryType==='edible'} onChange={e => update('stock', e.target.value)} /></Field>
        {form.inventoryType === 'edible' && <Field label="Minimum Stock Threshold (packs)"><input className={inputClass} required type="number" min="0" step="1" value={form.lowStockThreshold} onChange={e => update('lowStockThreshold', e.target.value)} /></Field>}
        <Field label="Availability Status">{modal.product ? <input className={inputClass} readOnly value={modal.product.status} /> : <select className={inputClass} value={form.status} onChange={e => update('status', e.target.value)}><option>Available</option><option>Archived</option></select>}</Field>
      </div><p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{form.inventoryType === 'edible' ? '1 Pack = 400g. Record quality-checked packaged lettuce with Stock In / Stock Out.' : 'Each succulent has its own code and quantity of one. Multiple uploaded images create separate individual products.'}</p>
      <Field label="Description"><textarea className={inputClass} rows={3} value={form.description} onChange={e => update('description', e.target.value)} /></Field>
      <Field label="Product Image"><input key={form.inventoryType} className={inputClass} type="file" accept="image/*" multiple={!modal.product && form.inventoryType === 'succulent'} onChange={e => { const files = Array.from(e.target.files || []); requestKeyRef.current = crypto.randomUUID(); setUploadProgress(null); setError(''); setForm(f => ({ ...f, files, productCode: files.length > 1 ? '' : f.productCode })); }} /></Field>
      {modal.product && <ProductImage product={modal.product} />}{form.files.length > 1 && <p className="text-sm text-slate-500">{form.files.length} individual succulent products will be created.</p>}
      <button className={primaryClass} disabled={busy || form.files.length > 50}>{busy ? 'Saving…' : modal.product ? 'Save Changes' : form.files.length > 1 ? `Add ${form.files.length} Products` : 'Add Product'}</button>
      </fieldset>
      {uploadProgress && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><label className="block">{busy ? uploadProgress.percent < 100 ? `Uploading ${uploadProgress.total} product image${uploadProgress.total === 1 ? '' : 's'}: ${uploadProgress.percent}%` : 'Images uploaded. Saving products…' : 'Upload result not confirmed. Retry this unchanged submission safely.'}<progress aria-label="Image upload progress" className="mt-2 h-2 w-full" max={100} value={uploadProgress.percent} /></label><p className="mt-1 text-xs">0 of {uploadProgress.total} products confirmed. The full count appears after the batch is saved.</p></div>}
      </form>}
    </Modal>}
  </div>;
}
