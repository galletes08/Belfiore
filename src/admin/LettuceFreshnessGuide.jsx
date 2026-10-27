import {useState} from 'react';
import {Leaf,AlertTriangle} from 'lucide-react';

export function freshnessAttention(products=[]) {
  return products.filter(product=>product.inventoryType==='edible').flatMap(product=>(product.batches||[])
    .filter(batch=>Number(batch.physical_stock)>0&&['Aging','On Hold','For Disposal','Unsellable','Unverified'].includes(batch.status))
    .map(batch=>({product,batch}))).filter((entry,index,all)=>all.findIndex(other=>String(other.batch.id)===String(entry.batch.id))===index);
}
const stages=[
  {name:'Fresh',age:'Day 0–7',tone:'border-emerald-200 bg-emerald-50 text-emerald-950',description:'Ready for sale after quality inspection.',action:'Continue regular monitoring.',rule:'Must pass physical quality inspection. Age alone is not proof of safety.'},
  {name:'Aging',age:'Day 8–13',tone:'border-amber-200 bg-amber-50 text-amber-950',description:'Inspect quality; may qualify for manual discount.',action:'Inspect Batch · Place on Hold if unsafe · Adjust Batch Price if approved.',rule:'Price adjustments must be manual and authorized. Never discount spoiled or unsafe lettuce for sale.'},
  {name:'On Hold',age:'Day 14–20',tone:'border-orange-200 bg-orange-50 text-orange-950',description:'Temporarily unavailable for sale pending review.',action:'Review Quality · Maintain Hold · Record Stock Adjustment or Disposal where appropriate.',rule:'Automatically excluded from sellable stock and new checkout allocations. Physical stock is not automatically deleted.'},
  {name:'For Disposal',age:'Day 21+',tone:'border-red-200 bg-red-50 text-red-950',description:'Record disposal after final review.',action:'Inspect physical quantity · Record Actual Disposal · Enter reason · Save audit history.',rule:'Unavailable for sale. Actual disposal must be recorded through the authorized inventory workflow; nothing is automatically disposed of.'},
];
const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):null;
const button='min-h-11 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700';

export default function LettuceFreshnessGuide({products,loading,error,onOpenBatch,onClose}) {
  const [tab,setTab]=useState('guide');
  const affected=freshnessAttention(products);
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Understand lettuce freshness stages and review batches that need action.</p>
    <div role="tablist" aria-label="Freshness guide sections" className="flex gap-2 border-b border-slate-200 pb-3" onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'guide':event.key==='End'?'affected':tab==='guide'?'affected':'guide';setTab(next);event.currentTarget.querySelector('#freshness-tab-'+next)?.focus();}}}>
      {[['guide','Lifecycle Guide'],['affected','Affected Batches']].map(([key,label])=><button key={key} id={'freshness-tab-'+key} role="tab" aria-selected={tab===key} aria-controls={'freshness-panel-'+key} tabIndex={tab===key?0:-1} className={button+(tab===key?' !bg-emerald-900 !text-white':'')} onClick={()=>setTab(key)}>{label}{key==='affected'&&!loading&&!error?' ('+affected.length+')':''}</button>)}
    </div>
    <section role="tabpanel" id={'freshness-panel-'+tab} aria-labelledby={'freshness-tab-'+tab} tabIndex={0} className="focus-visible:outline-2 focus-visible:outline-emerald-700">
      {tab==='guide'?<>
        <div className="grid gap-3 sm:grid-cols-2">{stages.map(stage=><article key={stage.name} className={'rounded-xl border p-4 '+stage.tone}><div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><Leaf size={17}/>{stage.name}</h3><span className="text-xs font-semibold">{stage.age}</span></div><p className="mt-2 text-sm font-medium">{stage.description}</p><p className="mt-2 text-xs leading-5">{stage.action}</p><p className="mt-2 border-t border-current/10 pt-2 text-xs leading-5">{stage.rule}</p></article>)}</div>
        <aside className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><h3 className="flex items-center gap-2 font-semibold"><AlertTriangle size={17}/>Physical Quality Guidelines</h3><p className="mt-2 leading-6">Inspect leaf appearance and discoloration, wilting and texture, mold or spoilage, sliminess, abnormal odor, packaging and storage condition, and visible damage or contamination.</p><p className="mt-2 text-xs leading-5">These are inspection indicators, not a substitute for food-safety procedures. Unsafe batches may be held or marked for disposal before Day 14. A Fresh age classification never overrides an unsafe recorded condition.</p></aside>
        <p className="mt-3 text-xs text-slate-500">Ages use Asia/Manila calendar dates. Missing or unverified harvest dates remain unverified. 1 selling pack = 400g.</p>
      </>:<FreshnessAffectedBatches products={products} loading={loading} error={error} onOpenBatch={onOpenBatch}/>}
    </section>
    <div className="flex justify-end border-t border-slate-100 pt-3"><button className={button} onClick={onClose}>Close</button></div>
  </div>;
}

export function FreshnessAffectedBatches({products,loading,error,onOpenBatch}) {
 const affected=freshnessAttention(products);
 return (loading&&!products?.length?<p role="status" className="py-6 text-sm text-slate-600">Loading harvest batches…</p>:error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Unable to refresh batch records: {error}. Refresh Inventory to retry.</p>:affected.length===0?<p role="status" className="py-8 text-center text-sm text-slate-600">No lettuce batches currently require freshness attention.</p>:<div className="space-y-3">{affected.map(({product,batch})=>{
        const action=batch.status==='For Disposal'?'Record Disposal':batch.status==='Aging'?'Inspect Batch':'Review Quality';
        const mode=product.archivedAt?'details':batch.status==='For Disposal'?'dispose':'update';
        const age=batch.harvest_date&&Number.isInteger(batch.age_days)&&batch.age_days>=0?batch.age_days+' days':'Unverified';
        return <article key={batch.id} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900">{product.name}</h3><p className="mt-1 font-mono text-xs text-slate-500">{product.productCode} · {batch.batch_code} (ID {batch.id})</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{batch.status}</span></div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">{[['Harvest Date',batch.harvest_date||'Unverified'],['Age',age],['Available Packs',batch.available_stock],['Physical Quantity',batch.physical_stock],['Reserved / Allocated',String(batch.reserved_stock??0)+' / '+String(batch.allocated_stock??0)],['Condition',batch.condition],['Last Updated',date(batch.updated_at)],['Recorded By',batch.created_by]].filter(([,value])=>value!=null).map(([label,value])=><div key={label} className="min-w-0 break-words"><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-900">{value}</dd></div>)}</dl>
          <div className="mt-3"><span className="mr-2 text-xs text-slate-500">Next Action</span><button className={button} onClick={()=>onOpenBatch(product,batch,mode)}>{product.archivedAt?'View Batch Details':action}</button></div>
        </article>;
      })}</div>);
}
