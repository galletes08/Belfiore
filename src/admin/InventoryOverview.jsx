import {useEffect,useState} from 'react';
import {Package,Sprout,Leaf,AlertTriangle,Activity,Search,Filter,X} from 'lucide-react';
import {getImageUrl} from '../api/client';
import {inventoryAttention} from '../utils/inventoryAttention';
import {INVENTORY_FILTERS} from '../utils/inventoryPresentation';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';

const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n);
export function InventoryProductImage({ product, large = false }) {
  const [broken, setBroken] = useState(false);
  const url = getImageUrl(product.imageUrl);
  useEffect(() => { setBroken(false); }, [url]);
  return url && !broken ? <img src={url} alt={product.name} onError={() => setBroken(true)}
    className={large ? 'h-56 w-full rounded-2xl object-contain bg-slate-50' : 'h-11 w-11 rounded-xl object-cover'} />
    : <div role="img" aria-label="Product image unavailable" className={`flex items-center justify-center rounded-xl bg-emerald-50 text-xs text-emerald-800 ${large ? 'h-56 w-full' : 'h-11 w-11'}`}>No image</div>;
}

function Field({label,children}){return <label className="block space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;}
export default function InventoryOverview({products,summary,rows,page,pages,setPage,search,setSearch,filter,setFilter,advancedFilters={type:'',status:'',tag:'',stock:''},setAdvancedFilters=()=>{},loading=false,error='',notice='',notification,headerActions,renderActions,onAttention}){
 const attentionCount=inventoryAttention(products).reduce((n,entry)=>n+entry.count,0);
 const [advancedOpen,setAdvancedOpen]=useState(false);
 const filterLabels={type:'Product type',status:'Status',tag:'Tag',stock:'Stock condition'};
 const filterOptions={type:['Gardening Supplies','Succulents','Aquaponics'],status:['Sold','Archived'],tag:['White','Green','Red'],stock:['Low Stock','Out of Stock']};
 const activeAdvanced=Object.entries(advancedFilters).filter(([,value])=>value);
 const updateAdvanced=(key,value)=>{setAdvancedFilters(current=>({...current,[key]:value}));setPage(1);};
  const cards = [
    ['Total Products', summary.totalProducts ?? 0, 'Active product records'],
    ['Available Succulents', `${summary.succulentUnits ?? 0} plants`, 'Individual plants available for sale'],
    ['Available Lettuce Packs', `${summary.ediblePacks ?? 0} packs`, 'Sellable packs · 400g per pack'],
    ['Needs Attention', attentionCount, 'Distinct products or supply variants requiring action'],
  ];

 return <>    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Products & stock</p>
      <div className="mt-1 flex items-center justify-between gap-4"><h1 className="min-w-0 text-2xl font-bold text-slate-900">Inventory Management</h1><div className="shrink-0">{notification}</div></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Manage succulents, lettuce packs and gardening supplies.</p>
        <div className="flex flex-wrap gap-2">{headerActions}</div>
      </div>
    </header>
    <section aria-label="Inventory summary" aria-busy={loading} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, note], index) => {
      const Icon = [Package, Sprout, Leaf, AlertTriangle][index];
      return <article key={label} className="relative flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{index===3&&<button type="button" aria-label="View inventory items needing attention" aria-haspopup="dialog" disabled={loading} onClick={()=>onAttention()} className="absolute inset-0 z-10 cursor-pointer rounded-xl transition hover:bg-emerald-50/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait"/>}<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${index === 3 && attentionCount ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon size={18} aria-hidden="true" /></span><div><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold text-[#1f5a43]">{loading ? '?' : value}</p><p className="mt-1 text-xs leading-4 text-slate-500">{note}</p></div></article>;
    })}</section>
    <section aria-label="Inventory alerts" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 align-middle shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Activity size={16}/>Inventory Alerts</h2><button className={buttonClass} disabled={loading} onClick={()=>onAttention()}>View Details</button></div>
      <p className="mt-2 text-xs text-slate-600">Low Stock: {summary.lowStock??0} ? Out of Stock: {summary.outOfStock??0}. {attentionCount?'Review affected products and stock availability.':'No inventory issues requiring attention.'}</p>
    </section>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-end"><div className="min-w-0 flex-1"><Field label="Search products"><div className="relative"><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search product name, code, SKU or variant" className={inputClass + " pl-9"} /></div></Field></div><div className="w-full md:w-60"><Field label="Quick filter"><select className={inputClass} value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>{INVENTORY_FILTERS.map(f => <option key={f}>{f}</option>)}</select></Field></div><button type="button" className={buttonClass+(advancedOpen||activeAdvanced.length?' border-emerald-500 bg-emerald-50 text-emerald-900':'')} onClick={()=>setAdvancedOpen(open=>!open)} aria-expanded={advancedOpen}><Filter size={14}/>Advanced Filters{activeAdvanced.length>0&&<span className="rounded-full bg-emerald-700 px-1.5 text-[10px] text-white">{activeAdvanced.length}</span>}</button></div>
        {activeAdvanced.length>0&&<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-slate-500">Active filters:</span>{activeAdvanced.map(([key,value])=><button type="button" key={key} onClick={()=>updateAdvanced(key,'')} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100">{filterLabels[key]}: {value}<X size={12}/></button>)}<button type="button" className="text-xs font-medium text-slate-500 underline hover:text-slate-900" onClick={()=>{setAdvancedFilters({type:'',status:'',tag:'',stock:''});setPage(1);}}>Clear all</button></div>}
        {advancedOpen&&<div className="mt-4 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(filterOptions).map(([key,options])=><Field key={key} label={filterLabels[key]}><select className={inputClass} value={advancedFilters[key]} onChange={e=>updateAdvanced(key,e.target.value)}><option value="">Any</option>{options.map(option=><option key={option}>{option}</option>)}</select></Field>)}</div>}
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Image', 'Product Code', 'Product Name', 'Product Type', 'Tag / Variety', 'Price', 'Available Quantity', 'Status', 'Actions'].map(col => <th key={col} scope="col" className="px-3 py-3">{col}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {loading ? <tr><td colSpan={9} className="p-8 text-center text-slate-500">Loading inventory…</td></tr> : rows.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-slate-500">No products match this view.</td></tr> : rows.slice((page - 1) * 20, page * 20).map(p => <tr key={p.id} className="hover:bg-emerald-50/30">
          <td className="px-3 py-2.5 align-middle"><InventoryProductImage product={p} /></td><td className="px-3 py-2.5 align-middle font-mono text-xs">{p.productCode}</td><td className="px-3 py-2.5 align-middle font-semibold text-slate-900">{p.name}</td><td className="px-3 py-2.5 align-middle">{p.inventoryType==='GARDENING_SUPPLY'?'Gardening Supplies':p.inventoryType === 'edible' ? 'Aquaponics' : 'Succulent'}</td><td className="px-3 py-2.5 align-middle">{p.inventoryType==='GARDENING_SUPPLY'?`${p.category} | ${p.variants?.length||0} variants`:p.inventoryType === 'edible' ? p.name : p.tag}</td><td className="px-3 py-2.5 align-middle whitespace-nowrap">{money(p.price)}{p.inventoryType === 'edible' && <span className="block text-xs text-slate-500">per 400g pack</span>}</td><td className="px-3 py-2.5 align-middle">{p.inventoryType==='GARDENING_SUPPLY'?p.stockLabel:p.archivedAt ? <><span className="block">Recorded: {p.physicalStock ?? p.stock} {p.inventoryType === 'edible' ? 'packs' : 'plants'}</span><span className="block text-xs text-slate-500">Available for Sale: 0</span>{p.legacyQuantityReview && <span className="block text-xs text-amber-700">Individual plant validation required</span>}</> : <>{p.inventoryType==='GARDENING_SUPPLY'?p.stockLabel:`${p.stock} ${p.inventoryType === 'edible' ? 'packs' : 'plant'}`}</>}<span className="block text-xs text-slate-500">{p.inventoryType==='GARDENING_SUPPLY'?'Reservations by variant':`${p.reservedStock} reserved / ${p.committedStock||0} allocated`}</span></td><td className="px-3 py-2.5 align-middle"><span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === 'Available' ? 'bg-emerald-50 text-emerald-800' : p.status === 'Reserved' ? 'bg-blue-50 text-blue-800' : ['Low Stock', 'On Hold'].includes(p.status) ? 'bg-amber-50 text-amber-800' : p.status === 'Out of Stock' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{p.status}</span></td>
          <td className="px-3 py-2.5 align-middle"><div className="flex items-center gap-1.5 whitespace-nowrap">
            {renderActions(p)}
          </div></td>
        </tr>)}
      </tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 p-4"><span className="text-xs text-slate-500">{rows.length} products · Page {page} of {pages} · Updates automatically</span><div className="flex gap-2"><button className={buttonClass} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button className={buttonClass} disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button></div></div>
    </section>
</>;
}
export function InventoryAttentionDetails({products,onDetails}){
 const attention=inventoryAttention(products);
 return <div className="space-y-3"><h3 className="font-semibold">Inventory issues requiring attention</h3><p className="text-xs text-slate-500">Stock alerts use available sellable quantities. Historical batch records remain available in Inventory History.</p>{attention.length?attention.map(({product,batches,reasons})=><article key={product.id} className="rounded-xl border border-slate-200 p-3"><p className="text-sm font-semibold">{product.name} <span className="font-mono text-xs text-slate-500">{product.productCode}</span></p>{reasons.length>0&&<p className="mt-1 text-xs text-amber-800">{reasons.join(' ? ')}</p>}{batches.map(batch=><p key={batch.id} className="mt-1 text-xs text-slate-600">{batch.batch_code} ? {batch.status} ? {batch.physical_stock} physical packs</p>)}<button className={buttonClass+' mt-2'} onClick={()=>onDetails(product)}>View Product Details</button></article>):<p className="text-sm text-slate-500">No inventory issues requiring attention.</p>}</div>;
}

export function InventoryProductDetails({product}){
 const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Not recorded';
 return <div className="space-y-4"><InventoryProductImage product={product} large /><h3 className="text-lg font-bold">{product.name}</h3><dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Code', product.productCode], ['Status', product.status], ['Price', money(product.price)], ['Unit', product.inventoryType==='GARDENING_SUPPLY'?'By variant':product.inventoryType === 'edible' ? '1 Pack = 400g' : '1 individual plant'], ['Recorded Quantity', product.inventoryType==='GARDENING_SUPPLY'?product.stockLabel:product.stock], ['Available for Sale', product.archivedAt ? 0 : product.inventoryType==='GARDENING_SUPPLY'?product.stockLabel:product.stock], ['Reserved', product.inventoryType==='GARDENING_SUPPLY'?'By variant':product.reservedStock], ['Date Added', date(product.createdAt)], ['Tag / Variety', product.inventoryType === 'edible' ? product.name : product.tag]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl><p className="text-sm text-slate-600">{product.description || 'No description added.'}</p>{product.inventoryType==='GARDENING_SUPPLY'&&(product.variants||[]).map(v=><article key={v.id} className="rounded-xl border border-slate-200 p-3 text-sm"><p className="font-semibold">{v.name} ? {v.sku}</p><p>{money(v.price)} ? {v.available_stock} {v.selling_unit} available</p><p className="text-xs text-slate-500">{v.status}</p></article>)}{product.legacyQuantityReview && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Legacy record contains multiple plants. Create individual listings after verifying each plant; this record is excluded from checkout.</p>}</div>;
}
