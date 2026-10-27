import {useEffect,useState} from 'react';
import {apiInventoryHistory} from '../api/client';
import {INVENTORY_ACTIONS} from '../utils/inventory';
const inputClass='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const buttonClass='inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n);
const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Not recorded';
function Field({label,children}){return <label className="block space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;}
export default function InventoryHistory({ product,batch, initialFilters = {}, onViewOrder,historyRequest=apiInventoryHistory,refreshVersion }) {
  const [search, setSearch] = useState(initialFilters.search || '');
  const [action, setAction] = useState(initialFilters.action || '');
  const [fromDate, setFromDate] = useState(initialFilters.fromDate || '');
  const [toDate, setToDate] = useState(initialFilters.toDate || '');
  const [page, setPage] = useState(initialFilters.page || 1);
  const [data, setData] = useState({ entries: [], total: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => historyRequest({ ...(product ? { productId: product.id } : {}), ...(batch?{batchId:batch.id}:{}), search, action, fromDate, toDate, page })
      .then(result => { if (active) { setData(result); setError(''); const lastPage = Math.max(1, Math.ceil(result.total / 50)); if (page > lastPage) setPage(lastPage); } })
      .catch(err => { if (active) { setError(err.message); setData({ entries: [], total: 0 }); } })
      .finally(() => { if (active) setLoading(false); }), 200);
    return () => { active = false; clearTimeout(timer); };
  }, [product,batch, search, action, fromDate, toDate, page,historyRequest,refreshVersion]);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Search history"><input className={inputClass} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Product name, code or reason" /></Field>
      <Field label="Activity Type"><select className={inputClass} value={action} onChange={e => { setAction(e.target.value); setPage(1); }}><option value="">All Activities</option>{INVENTORY_ACTIONS.map(a => <option key={a}>{a}</option>)}</select></Field>
      <Field label="From Date"><input type="date" className={inputClass} value={fromDate} max={toDate || undefined} onChange={e => { setFromDate(e.target.value); setPage(1); }} /></Field>
      <Field label="To Date"><input type="date" className={inputClass} value={toDate} min={fromDate || undefined} onChange={e => { setToDate(e.target.value); setPage(1); }} /></Field></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Dates and times use Philippine Time (Asia/Manila). To Date includes the entire selected day. Use the same From and To date for one day.</p><button className={buttonClass} onClick={() => { setSearch(''); setAction(''); setFromDate(''); setToDate(''); setPage(1); }}>Reset Filters</button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Loading history…</p> : error ? null : data.entries.length === 0 ? <p role="status" className="text-sm text-slate-500">No activities found for the selected filters.</p> :
      <ul className="space-y-3">{data.entries.map(entry => <li key={entry.id} className="rounded-2xl border border-slate-200 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>{entry.action} · {entry.product_code}</strong><span className="text-xs text-slate-500">{date(entry.created_at)} PHT</span></div>
        <p className="mt-1">{entry.product_name}{entry.variant_name&&<span> | {entry.variant_name} ({entry.stock_unit})</span>} · Available: {entry.previous_quantity ?? '—'} → {entry.new_quantity} · Reserved: {entry.previous_reserved ?? '—'} → {entry.new_reserved}</p>
        <p className="mt-1 text-slate-600">{entry.previous_status || 'New'} → {entry.new_status} · {entry.reason}</p>
        {!entry.variant_id&&['Stock In','Stock Out'].includes(entry.action) && <p className="mt-1 text-xs text-slate-600">Recorded Physical Stock: {entry.previous_recorded_stock ?? '—'} → {entry.new_recorded_stock} {entry.stock_unit||'units'} · Adjustment: {entry.adjustment_quantity ?? '—'} packs</p>}
        {entry.notes && <p className="mt-1 text-sm text-slate-600">Notes: {entry.notes}</p>}
        {entry.batch_id&&<p className="mt-1 text-xs text-slate-500">Harvest Batch #{entry.batch_id}{entry.action==='Price Adjusted'?` · Price: ${money(entry.previous_value?.price)} → ${money(entry.new_value?.price)}`:''}{entry.new_value?.disposalDate?` · Disposal date: ${entry.new_value.disposalDate}`:''}</p>}
        {entry.transaction && <details className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-emerald-900">{entry.transaction.customerName || 'Customer name not recorded'} · Order #{entry.transaction.orderId} · Transaction details</summary>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div><dt className="text-slate-500">Customer</dt><dd>{entry.transaction.customerName || 'Not recorded'}</dd></div>
            <div><dt className="text-slate-500">Payment method</dt><dd>{entry.transaction.paymentMethod === 'COD' ? 'Cash on Delivery' : entry.transaction.paymentMethod === 'ONLINE' ? 'Online (PayMongo)' : entry.transaction.paymentMethod}</dd></div>
            <div><dt className="text-slate-500">Current payment status</dt><dd>{entry.transaction.paymentMethod === 'COD' && ['Unpaid','Pending'].includes(entry.transaction.paymentStatus) ? 'Pending Collection' : entry.transaction.paymentStatus}{entry.transaction.paymentMethod === 'COD' && entry.transaction.codStatus ? ` · ${entry.transaction.codStatus}` : ''}</dd></div>
            <div><dt className="text-slate-500">Current order / reservation status</dt><dd>{entry.transaction.orderStatus}{entry.transaction.reservationStatus ? ` · ${entry.transaction.reservationStatus}` : ''}</dd></div>
          </dl>
          <ul className="mt-3 space-y-2 border-t border-emerald-100 pt-2">{entry.transaction.items.map(item=><li key={item.id} className="text-xs"><p className="font-medium">{item.productName} · {item.productCode || 'Code not recorded'}{item.batchCode ? ` · ${item.batchCode}` : ''}</p><p>{item.quantity} {item.inventoryType === 'edible' ? '400g packs' : item.inventoryType === 'succulent' ? 'plants' : 'units'} × {money(item.unitPrice)} · Line total {money(item.lineTotal)}</p><p className="text-slate-500">{item.inventoryType === 'edible' ? `Variety: ${item.productName}` : `Tag at checkout: ${item.tag || 'Not recorded'}`}</p></li>)}</ul>
          <p className="mt-2 text-xs text-slate-500">Prices and quantities are from checkout. The inventory event timestamp above does not imply payment was collected at that time.</p>
        </details>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">{entry.actor}{entry.order_id ? ` · Order #${entry.order_id}` : ''}</p>{entry.canViewOrder ? <button className={buttonClass} onClick={()=>onViewOrder(entry.transaction.orderId,{search,action,fromDate,toDate,page})}>View Order</button> : <span className="text-xs text-slate-500">{entry.order_id ? 'Linked order unavailable or transaction details not recorded' : 'No linked order'}</span>}</div>
      </li>)}</ul>}
    <div className="flex items-center justify-between"><button disabled={page === 1 || loading || Boolean(error)} className={buttonClass} onClick={() => setPage(p => p - 1)}>Previous</button><span className="text-sm">Page {page} of {Math.max(1, Math.ceil(data.total / 50))} · {data.total} activities</span><button disabled={page * 50 >= data.total || loading || Boolean(error)} className={buttonClass} onClick={() => setPage(p => p + 1)}>Next</button></div>
  </div>;
}

