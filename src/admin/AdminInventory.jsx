import InventoryOverview,{InventoryProductImage as ProductImage,InventoryAttentionDetails,InventoryProductDetails} from './InventoryOverview';
import {inventoryRows} from '../utils/inventoryPresentation';
import History from './InventoryHistory';
import Modal from './InventoryModal';
import {OPERATIONS_EVENT,OPERATIONS_STORAGE_KEY,operationsViewIsEditing} from '../utils/operationsSync';
import LettuceStock from './LettuceStock';
import GardeningSupplies from './GardeningSupplies';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, History as HistoryIcon, RefreshCw, Plus, Eye, Pencil, MoreHorizontal, Archive, RotateCcw, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import InventoryActionMenu from './InventoryActionMenu';
import { isSoldSucculent } from '../../shared/inventoryRules.js';
import HarvestBatches from './HarvestBatches';
import NotificationBell from './NotificationBell';
import { apiSupply,apiInventory, apiCreateProduct, apiCreateProductsBulk,
  apiUpdateProduct, apiArchiveProduct, apiRestoreProduct } from '../api/client';
import { LETTUCE_VARIETIES, newInventoryForm } from '../utils/inventory';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const primaryClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1f5a43] px-3 py-2 text-xs font-semibold text-white hover:bg-[#174b37] focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const initialForm = newInventoryForm();
const money = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

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
  const rows=useMemo(()=>inventoryRows(data.products,{filter,search}),[data.products,filter,search]);
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
  return <div className="mx-auto min-w-0 max-w-7xl space-y-4">
    <InventoryOverview products={data.products} summary={data.summary} rows={rows} page={page} pages={pages} setPage={setPage} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} loading={loading} error={!modal?(error||loadError):''} notice={notice} notification={<NotificationBell/>} onAttention={()=>setModal({mode:'attention'})} headerActions={<><button className={buttonClass} onClick={()=>setModal({mode:'history'})}><HistoryIcon size={14}/>History</button><button className={buttonClass} onClick={reload}><RefreshCw size={14}/>Refresh</button><button className={primaryClass} onClick={()=>openForm(null)}><Plus size={14}/>Add Product</button></>} renderActions={p=><>            <button className={buttonClass} onClick={() => setModal({ mode: p.inventoryType==='GARDENING_SUPPLY'?'supplies':'details', product: p })}><Eye size={14} aria-hidden="true" />Details</button>
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
</>}/>
    <details className="text-sm text-slate-600"><summary className="w-fit cursor-pointer rounded-lg px-2 py-2 font-medium focus-visible:outline-2 focus-visible:outline-emerald-700">Admin inventory setup</summary><div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white p-4"><p>{data.products.filter(p=>p.inventoryType==='GARDENING_SUPPLY'&&p.variants?.some(v=>v.catalog_key)).length} catalog products / {data.products.flatMap(p=>p.variants||[]).filter(v=>v.catalog_key).length} catalog variants already present. Import only adds missing catalog records; existing prices and stock are preserved.</p><button type="button" className={buttonClass} disabled={busy||loading} onClick={()=>{if(window.confirm('Import missing gardening supply catalog entries? Existing products, prices and stock will be preserved.'))run(()=>apiSupply('import-catalog','POST',{}));}}>Import Supply Catalog</button></div></details>
    {modal && <Modal key={modal.mode} freshness={modal.mode==='freshness'} title={modal.mode==='lettuceStock'?(modal.direction==='out'?'Stock Out':'Stock In'):modal.mode === 'form' ? modal.product ? 'Edit Product' : 'Add Product' : modal.mode === 'history' ? 'Inventory History' : modal.mode === 'adjust' ? modal.direction === 'in' ? 'Stock In' : 'Stock Out' : modal.mode === 'archive' ? 'Archive Product' : modal.mode === 'restore' ? 'Restore Product' : modal.mode==='supplies'?'Gardening Supplies':modal.mode==='harvest'?'Harvest Batch Management':modal.mode==='attention'?'Inventory Alerts':'Product Details'} busy={busy} onClose={close}>
      {modal.mode==='lettuceStock'&&<LettuceStock product={data.products.find(p=>p.id===modal.product.id)||modal.product} direction={modal.direction} onBusyChange={supplyBusy} onChanged={reload} onClose={close}/>}
      {modal.mode==='attention'&&<InventoryAttentionDetails products={data.products} onDetails={product=>setModal({mode:product.inventoryType==='edible'?'harvest':product.inventoryType==='GARDENING_SUPPLY'?'supplies':'details',product})}/>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {modal.mode === 'supplies' && <GardeningSupplies product={data.products.find(p=>p.id===modal.product?.id)||modal.product} initialTab={modal.tab||'variants'} externalBusy={busy} onBusyChange={supplyBusy} onChanged={reload} onClose={close} onHistory={()=>setModal({mode:'history',product:modal.product})}/>}
      {modal.mode === 'history' && <History product={modal.product} batch={modal.batch} initialFilters={modal.filters} onViewOrder={(orderId,filters)=>navigate(`/admin/orders?orderId=${encodeURIComponent(orderId)}`,{state:{inventoryHistory:{productId:modal.product?.id,batchId:modal.batch?.id,filters,inventoryFilter:filter,inventorySearch:search,inventoryPage:page}}})} />}
      {modal.mode === 'harvest' && <HarvestBatches product={modal.product} initialMode={modal.direction} initialBatchId={modal.batchId} initialAction={modal.batchAction} onChanged={reload} onHistory={batch=>setModal({mode:'history',product:modal.product,batch})} />}
      {modal.mode==='details'&&<InventoryProductDetails product={modal.product}/>}
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
