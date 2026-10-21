import { useCallback,useEffect,useRef,useState } from 'react';
import { apiHarvestBatches,apiHarvestAction } from '../api/client';

const input='w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm';
const button='rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-emerald-50 disabled:opacity-50';
const primary='rounded-xl bg-[#1f5a43] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const money=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(v);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
const conditions=['Fresh','Aging','On Hold','Unsellable','For Disposal'];
function Field({label,children}) {return <label className="block space-y-1 text-sm font-medium"><span>{label}</span>{children}</label>;}

export default function HarvestBatches({product,initialMode,initialBatchId,onChanged,onHistory}) {
  const [batches,setBatches]=useState([]);
  const [mode,setMode]=useState(initialMode==='in'?'create':null);
  const [selected,setSelected]=useState(null);
  const [form,setForm]=useState({quantity:'',harvestDate:today(),condition:'Fresh',price:product.price,reason:'New Harvest',notes:'',direction:initialMode==='out'?'out':'in',disposalDate:today(),confirmInspected:false,confirmDisposed:false});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const key=useRef(crypto.randomUUID());
  const openedBatch=useRef(null);
  const load=useCallback(async()=>{try{setBatches((await apiHarvestBatches(product.id)).batches);}catch(e){setError(e.message);}},[product.id]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    if(!initialBatchId||openedBatch.current===initialBatchId||!batches.length)return;
    const batch=batches.find(b=>Number(b.id)===Number(initialBatchId));
    openedBatch.current=initialBatchId;
    if(batch){setSelected(batch);setMode('details');}
    else setNotice('The linked harvest batch is no longer available.');
  },[initialBatchId,batches]);
  const open=(next,b=null)=>{
    setMode(next);setSelected(b);setError('');key.current=crypto.randomUUID();
    setForm({quantity:'',harvestDate:b?.harvest_date||today(),condition:b?.condition==='Unverified'?'Fresh':b?.condition||'Fresh',price:b?.price??product.price,
      reason:next==='create'?'New Harvest':next==='dispose'?'Exceeded Storage Life':'Inventory Correction',notes:'',direction:initialMode==='out'?'out':'in',disposalDate:today(),confirmInspected:false,confirmDisposed:false});
  };
  const update=(name,value)=>{key.current=crypto.randomUUID();setForm(f=>({...f,[name]:value}));};
  const submit=async e=>{
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    try {
      const payload={...form,batchPrice:form.price};
      if(mode==='update'&&selected.harvest_date) delete payload.harvestDate;
      const result=await apiHarvestAction(product.id,selected?.id,mode,payload,key.current);
      setNotice(result.message);setMode(null);await load();await onChanged();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const q=Number(form.quantity);
  const validQuantity=Number.isSafeInteger(q)&&q>0&&(mode==='create'||mode==='adjust'&&form.direction==='in'||selected&&q<=selected.stock);
  const disposalReasons=['Exceeded Storage Life','Spoiled / Rotten','Dried / Wilted','Failed Quality Inspection','Other'];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{product.name} · {product.productCode}</strong><p className="mt-1 text-xs text-slate-500">Regular price: {money(product.price)} / 400g pack. Dates and age use Asia/Manila. Batch dates do not reset when stock is corrected.</p></div>{!product.archivedAt&&<button className={primary} disabled={busy} onClick={()=>open('create')}>New Harvest / Stock In</button>}</div>
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {batches.filter(b=>b.physical_stock>0&&['Aging','On Hold','For Disposal','Unsellable','Unverified'].includes(b.status)).map(b=><p key={b.id} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{b.batch_code}: {b.status} · {b.age_days===null?'harvest date requires verification':`${b.age_days} days old`} · {b.physical_stock} recorded packs. {b.status==='Aging'?'Inspect condition and review pricing.':b.reserved_stock+b.allocated_stock>0?'Reconcile existing allocations; do not substitute another batch.':'Inspect, verify, or confirm disposal. Held quantities are excluded from new sales.'}</p>)}
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-slate-50"><tr>{['Batch','Harvest Date','Age','Initial','Physical','Available','Reserved / Allocated','Condition','Regular / Batch Price','Status','Actions'].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{batches.map(b=><tr key={b.id} className={`border-t border-slate-100 ${Number(b.id)===Number(initialBatchId)?'bg-emerald-50 ring-1 ring-inset ring-emerald-300':''}`}><td className="p-3 font-mono">{b.batch_code}</td><td className="p-3">{b.harvest_date||'Unverified'}</td><td className="p-3">{b.age_days??'—'}</td><td className="p-3">{b.initial_quantity}</td><td className="p-3">{b.physical_stock}</td><td className="p-3">{b.available_stock}</td><td className="p-3">{b.reserved_stock} / {b.allocated_stock}</td><td className="p-3">{b.condition}</td><td className="p-3">{money(b.regular_price)} / {money(b.price)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 ${b.status==='Fresh'?'bg-emerald-100 text-emerald-900':'bg-amber-100 text-amber-900'}`}>{b.status}</span></td><td className="p-3"><div className="flex flex-wrap gap-1"><button className={button} onClick={()=>open('details',b)}>Details</button><button className={button} onClick={()=>onHistory(b)}>History</button>{!product.archivedAt&&b.condition!=='Disposed'&&<><button className={button} onClick={()=>open('update',b)}>Adjust Price / Condition</button><button className={button} onClick={()=>open('adjust',b)}>Stock Adjustment</button><button className={button} disabled={b.stock===0} onClick={()=>open('dispose',b)}>Record Disposal</button></>}</div></td></tr>)}</tbody></table>{batches.length===0&&<p className="p-4 text-sm text-slate-500">No harvest batches yet. Create a dated harvest under this product.</p>}</div>
    {mode==='details'&&selected&&<div className="rounded-2xl border border-slate-200 p-4 text-sm"><strong>{selected.batch_code}</strong><p>Created: {new Date(selected.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} PHT</p><p>Last Updated: {new Date(selected.updated_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} PHT</p><p>Responsible Administrator: {selected.created_by}</p><button className={button} onClick={()=>setMode(null)}>Close Details</button></div>}
    {mode&&mode!=='details'&&<form onSubmit={submit} className="space-y-4 rounded-2xl border border-emerald-200 p-4"><h3 className="font-bold">{mode==='create'?'New Harvest Batch':mode==='dispose'?'Confirm Physical Disposal':mode==='update'?'Adjust Batch Price / Condition':'Adjust Existing Batch Stock'} {selected?.batch_code}</h3>
      {selected&&<p className="text-sm text-slate-600">Harvest: {selected.harvest_date||'Unverified'} · Age: {selected.age_days??'Unknown'} · Condition: {selected.status} · Current price: {money(selected.price)} · Uncommitted physical packs: {selected.stock}</p>}
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {mode==='adjust'&&<Field label="Operation"><select className={input} value={form.direction} onChange={e=>update('direction',e.target.value)}><option value="in">Stock In — correction / sellable return</option><option value="out">Stock Out — removal</option></select></Field>}
        {mode!=='update'&&<Field label={mode==='dispose'?'Quantity to Dispose (packs)':'Adjustment Quantity (packs)'}><input className={input} type="number" min="1" step="1" required max={mode==='dispose'||mode==='adjust'&&form.direction==='out'?selected?.stock:2147483647} value={form.quantity} onChange={e=>update('quantity',e.target.value)} /></Field>}
        {(mode==='create'||mode==='update'&&!selected.harvest_date)&&<Field label="Verified Harvest Date"><input className={input} type="date" required max={today()} value={form.harvestDate} onChange={e=>update('harvestDate',e.target.value)} /></Field>}
        {mode==='dispose'&&<Field label="Physical Disposal Date"><input className={input} type="date" required max={today()} min={selected.harvest_date||undefined} value={form.disposalDate} onChange={e=>update('disposalDate',e.target.value)} /></Field>}
        {(mode==='create'||mode==='update')&&<><Field label="Condition"><select className={input} value={form.condition} onChange={e=>update('condition',e.target.value)}>{conditions.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="Batch Price / 400g Pack (PHP)"><input className={input} type="number" min="0" step="0.01" required value={form.price} onChange={e=>update('price',e.target.value)} /></Field><p className="text-xs text-slate-500">Regular product price stays {money(product.price)}. Day 14 hold and Day 21 disposal review cannot be bypassed by condition or price changes.</p></>}
        <Field label="Reason">{mode==='dispose'?<select className={input} value={form.reason} onChange={e=>update('reason',e.target.value)}>{disposalReasons.map(r=><option key={r}>{r}</option>)}</select>:<input className={input} required maxLength={1000} value={form.reason} onChange={e=>update('reason',e.target.value)} />}</Field>
        <Field label={form.reason==='Other'?'Notes (required)':'Administrator Notes'}><textarea className={input} required={form.reason==='Other'} maxLength={2000} value={form.notes} onChange={e=>update('notes',e.target.value)} /></Field>
        {mode==='update'&&!selected.harvest_date&&<label className="flex gap-2 text-sm"><input type="checkbox" required checked={form.confirmInspected} onChange={e=>update('confirmInspected',e.target.checked)} />I inspected this stock and verified its actual harvest date.</label>}
        {mode==='dispose'&&<label className="flex gap-2 text-sm"><input type="checkbox" required checked={form.confirmDisposed} onChange={e=>update('confirmDisposed',e.target.checked)} />I confirm these uncommitted packs have physically been disposed.</label>}
      </fieldset>
      {mode!=='update'&&<p className="text-sm">Preview: {validQuantity?mode==='create'?q+' packs in a new traceable batch':selected.stock+(mode==='adjust'&&form.direction==='in'?q:-q)+' uncommitted physical packs remaining':'Enter a valid pack quantity'}.</p>}
      <div className="flex gap-2"><button className={button} type="button" disabled={busy} onClick={()=>setMode(null)}>Cancel</button><button className={primary} disabled={busy||(mode!=='update'&&!validQuantity)}>{busy?'Saving…':'Confirm'}</button></div>
    </form>}
  </div>;
}
