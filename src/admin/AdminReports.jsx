import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Download,RefreshCw} from 'lucide-react';
import NotificationBell from './NotificationBell';
import {apiAdminReport,apiExportReport} from '../api/client';

const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value)||0);
const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PHT':'Unavailable';
const button='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const panel='rounded-xl border border-slate-200 bg-white shadow-sm';
const presets=[['today','Today'],['week','Last 7 Days'],['month','This Month'],['lastMonth','Last Month'],['year','This Year'],['custom','Custom Range']];

function ReportTable({table,onPage}) {
  const orderLinks=['orders','shipments'].includes(table.key);
  return <section className={panel} aria-label={table.title}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><h2 className="font-semibold text-slate-900">{table.title}</h2><span className="text-xs text-slate-500">{table.total} records</span></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr>{table.columns.map(c=><th key={c.key} scope="col" className="px-4 py-3">{c.label}</th>)}{orderLinks&&<th scope="col" className="px-4 py-3">Action</th>}</tr></thead>
    <tbody>{table.rows.map((row,i)=><tr key={row.id||i} className="border-t border-slate-100 align-top hover:bg-emerald-50/30">{table.columns.map(c=><td key={c.key} className={`px-4 py-3 ${c.type==='money'||c.type==='date'?'whitespace-nowrap':''}`}><span className={c.key==='codes'?'block max-w-72 break-words text-xs':''}>{c.key==='codes'?<details><summary className="cursor-pointer text-emerald-800">View code references</summary><span className="mt-2 block">{row[c.key]||'Unavailable'}</span></details>:row[c.key]==null?'Unavailable':c.type==='money'?money(row[c.key]):c.type==='date'?date(row[c.key]):String(row[c.key])}</span></td>)}{orderLinks&&<td className="whitespace-nowrap px-4 py-3"><Link className="font-medium text-emerald-800 underline underline-offset-2" to={`/admin/orders?orderId=${row.id}`}>View Order<span className="sr-only"> {row.order_code}</span></Link></td>}</tr>)}</tbody></table>
    {!table.rows.length&&<p className="p-8 text-center text-sm text-slate-500">No records found for the selected period.</p>}</div>
    {table.total>table.pageSize&&<div className="flex items-center justify-end gap-3 border-t border-slate-100 p-3"><button className={button} disabled={table.page<=1} onClick={()=>onPage(table.key,table.page-1)}>Previous</button><span className="text-xs text-slate-600">Page {table.page} of {Math.ceil(table.total/table.pageSize)}</span><button className={button} disabled={table.page*table.pageSize>=table.total} onClick={()=>onPage(table.key,table.page+1)}>Next</button></div>}
  </section>;
}

function SalesChart({series}) {
  if(!series.length) return <p className="p-8 text-center text-sm text-slate-500">No records found for the selected period.</p>;
  const max=Math.max(1,...series.map(s=>s.revenue));
  // Horizontally scroll long daily ranges; exact values are visible to keyboard and pointer users.
  return <div className="overflow-x-auto px-4 pb-4"><div className="flex min-w-full items-end gap-3 pt-6" style={{width:Math.max(500,series.length*65)}}>{series.map(s=><div key={s.date} className="flex min-w-12 flex-1 flex-col items-center justify-end"><div className="flex h-40 w-full items-end justify-center"><div tabIndex={0} role="img" aria-label={`${s.date}: ${money(s.revenue)}`} title={`${s.date}: ${money(s.revenue)}`} className="w-8 rounded-t bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2" style={{height:`${Math.max(1,s.revenue/max*100)}%`}} /></div><span className="mt-2 whitespace-nowrap text-[10px] text-slate-500">{s.date}</span><span className="mt-1 whitespace-nowrap text-[10px] text-emerald-900">{money(s.revenue)}</span></div>)}</div><p className="mt-3 text-xs text-slate-500">Y: Sales amount (PHP) · X: Order creation date (PHT)</p></div>;
}

export default function AdminReports() {
  const [filters,setFilters]=useState({preset:'month',tab:'sales'});
  const [custom,setCustom]=useState({fromDate:'',toDate:''});
  const [report,setReport]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [exporting,setExporting]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [customMode,setCustomMode]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    apiAdminReport(filters,controller.signal).then(data=>{setReport(data);setLoading(false);}).catch(err=>{if(err.name!=='AbortError'){setError(err.message);setReport(null);setLoading(false);}});
    return ()=>controller.abort();
  },[filters,refresh]);
  function choosePreset(preset) {
    setCustomMode(preset==='custom');
    if(preset!=='custom') setFilters({preset,tab:filters.tab});
  }
  function applyCustom(event) {
    event.preventDefault();
    if(!custom.fromDate||!custom.toDate||custom.fromDate>custom.toDate) {setError('Enter a valid date range. From Date must be on or before To Date.');return;}
    setFilters({preset:'custom',tab:filters.tab,...custom});
  }
  async function download(format) {
    setExporting(format);setError('');
    try{await apiExportReport(filters,format);}catch(err){setError(err.message);}finally{setExporting('');}
  }
  const s=report?.summary;
  return <div className="mx-auto min-w-0 max-w-7xl space-y-4">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Analytics &amp; Reporting</p>
      <div className="mt-1 flex items-center justify-between gap-4">
        <h1 className="min-w-0 text-2xl font-bold text-slate-900">Reports &amp; Analytics</h1>
        <div className="shrink-0"><NotificationBell /></div>
      </div>
      <p className="mt-2 text-sm text-slate-500">Monitor business performance, sales, inventory, orders, and deliveries.</p>
    </header>
    <section className={`${panel} flex flex-wrap items-end gap-3 p-4`} aria-label="Report filters"><label className="text-xs font-medium text-slate-600">Reporting period<select className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={customMode?'custom':filters.preset} onChange={e=>choosePreset(e.target.value)}>{presets.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {customMode&&<form onSubmit={applyCustom} className="flex flex-wrap items-end gap-3"><label className="text-xs text-slate-600">From Date<input className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" type="date" required value={custom.fromDate} max={custom.toDate||undefined} onChange={e=>setCustom({...custom,fromDate:e.target.value})} /></label><label className="text-xs text-slate-600">To Date<input className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" type="date" required value={custom.toDate} min={custom.fromDate||undefined} onChange={e=>setCustom({...custom,toDate:e.target.value})} /></label><button className={button}>Apply</button></form>}
      <button className={button} disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15}/>Refresh</button><div className="flex flex-wrap gap-2 sm:ml-auto">{['pdf','xlsx'].map(f=><button key={f} className={button} disabled={loading||!report||!!exporting} onClick={()=>download(f)}><Download size={15}/>{exporting===f?'Exporting…':f==='pdf'?'Export PDF':'Export Excel (.xlsx)'}</button>)}</div>
      {report&&!loading&&<p className="w-full text-xs text-slate-500">Selected period: {report.period.from} through {report.period.to} · Philippine Time · Entire end date included</p>}
    </section>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading&&<p role="status" className="p-8 text-center text-slate-500">Loading reports…</p>}
    {!loading&&report&&<>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Report summary">
        {[['Total Sales',money(s.sales),'Delivered + verified Paid · creation cohort'],['Total Orders',s.orders,'Distinct orders created · includes cancelled'],['Available Inventory',`${s.plants} plants`,`${s.packs} sellable 400g packs · Current Inventory`],['Completed Deliveries',s.completed,'Recorded completion date within selected period']].map(([label,value,note])=><article key={label} className={`${panel} p-4`}><h2 className="text-sm text-slate-600">{label}</h2><p className="mt-2 text-2xl font-semibold text-emerald-900">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></article>)}
      </section>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Report tabs">{['sales','inventory','orders','delivery'].map(tab=><button key={tab} aria-current={filters.tab===tab?'page':undefined} className={`px-5 py-3 text-sm font-medium capitalize ${filters.tab===tab?'border-b-2 border-emerald-700 text-emerald-800':'text-slate-500 hover:text-emerald-800'}`} onClick={()=>setFilters(({preset,fromDate,toDate})=>({preset,...(fromDate?{fromDate,toDate}:{}),tab}))}>{tab}</button>)}</nav>
      <p className="text-xs leading-5 text-slate-600">{filters.tab==='inventory'?'Movements use backend recording dates; availability and alerts show current stock. Historical physical stock and undated fulfillment quantities are unavailable.':filters.tab==='delivery'?`Shipment details use the order-creation cohort and current statuses. Completion card uses recorded completion dates. ${s.undated_deliveries} delivered orders in the creation cohort have no reliable completion date. Failed/returned counts and delivery duration: unavailable.`:'Orders created in the selected period, evaluated using their current statuses. Sales include recorded delivery fees and require verified payment plus delivery.'}</p>
      {filters.tab==='sales'&&<><section className={panel}><h2 className="px-4 pt-4 font-semibold text-slate-900">Sales performance</h2><SalesChart series={report.series}/></section><section className={`${panel} grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5`}>{[['Gross sales before discounts','Unavailable'],['Separate discounts','Unavailable'],['Refund amounts','Unavailable'],['Net eligible sales',money(s.sales)],['Valid transactions',s.transactions]].map(([l,v])=><div key={l}><p className="text-xs text-slate-500">{l}</p><p className="mt-1 font-semibold text-slate-900">{v}</p></div>)}<p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-5">Stored selling prices include batch pricing. Original-price discounts and actual refund amounts are not separately recorded; excluded refund orders are not presented as zero refunds.</p></section></>}
      {report.breakdowns.length>0&&<section className={`${panel} p-4`}><h2 className="mb-3 font-semibold text-slate-900">{filters.tab==='delivery'?'Delivery method and current status':'Current order status breakdown'}</h2><div className="flex flex-wrap gap-2">{report.breakdowns.map(b=><span key={b.label} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{b.label} <strong className="ml-2">{b.count}</strong></span>)}</div></section>}
      {report.deliverySummary&&<section className={`${panel} p-4`}><h2 className="font-semibold">Shipment creation cohort</h2><p className="mt-2 text-sm text-slate-600">Total shipments: {report.deliverySummary.shipments} · Currently delivered: {report.deliverySummary.delivered} · In progress: {report.deliverySummary.in_progress} · Failed / returned: Unavailable</p><div className="mt-3 flex flex-wrap gap-3">{report.carriers.map(c=><p key={c.carrier} className="rounded-lg bg-slate-50 p-3 text-xs">{c.carrier}: {c.assigned} assigned orders · {c.completed} currently delivered</p>)}</div></section>}
      {report.tables.map(t=><ReportTable key={t.key} table={t} onPage={(key,page)=>setFilters({...filters,[`${key}Page`]:page})}/>)}
      <details className={`${panel} p-4 text-xs text-slate-600`}><summary className="cursor-pointer font-medium text-emerald-900">Metric definitions and data limitations</summary><div className="mt-3 space-y-2">{report.notes.map(note=><p key={note}>{note}</p>)}<p>Snapshot generated: {date(report.generatedAt)}. Refresh to include subsequent changes.</p></div></details>
    </>}
  </div>;
}
