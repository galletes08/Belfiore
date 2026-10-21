import {useEffect,useRef,useState} from 'react';
import {apiCustomerManagement} from '../api/client';
import './orderDrawer.css';
import CustomerAvatar from './CustomerAvatar';

const tabs=['Overview','Purchase History','Account Activity'];
const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value);
const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'})+' PHT':'Not recorded';
const control='rounded-lg border border-slate-200 px-3 py-2 text-sm';
export default function CustomerDetailsDrawer({id,onClose,onViewOrder,initial={}}){
  const dialog=useRef(null);
  const [tab,setTab]=useState(initial.tab||'Overview');
  const [data,setData]=useState(null);
  const [records,setRecords]=useState({orders:[],entries:[],total:0});
  const [page,setPage]=useState(initial.page||1),[search,setSearch]=useState(initial.search||''),[status,setStatus]=useState(initial.status||'');
  const [error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{const node=dialog.current,old=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();return()=>{node.close();document.body.style.overflow=old;};},[]);
  useEffect(()=>{let active=true;apiCustomerManagement(`${id}/details`).then(result=>{if(active)setData(result);}).catch(err=>{if(active)setError(err.message);});return()=>{active=false;};},[id,refresh]);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    const timer=setTimeout(()=>{
      if(tab==='Overview'){if(active)setLoading(false);return;}
      apiCustomerManagement(`${id}/${tab==='Purchase History'?'orders':'activity'}`,{page,search,status}).then(result=>{if(active)setRecords(result);}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});
    },200);return()=>{active=false;clearTimeout(timer);};
  },[id,tab,page,search,status,refresh]);
  const customer=data?.customer;
  return <dialog ref={dialog} aria-labelledby="customer-drawer-title" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}
    className="order-details-drawer fixed inset-y-0 right-0 m-0 ml-auto h-dvh max-h-none w-full max-w-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/40">
    <div className="flex h-full flex-col"><header className="flex items-start justify-between gap-3 border-b border-slate-200 p-5"><div><p className="text-xs font-semibold uppercase text-emerald-700">Customer Details</p><h2 id="customer-drawer-title" className="mt-1 text-xl font-bold">{customer?.fullName||'Customer account'}</h2><p className="mt-1 text-xs text-slate-500">Customer #{id} · {customer?(customer.status==='active'?'Active':'Disabled'):'Loading…'}</p></div><div className="flex shrink-0 gap-2"><button onClick={()=>setRefresh(value=>value+1)} className={control}>Refresh</button><button onClick={onClose} className={control}>Close</button></div></header>
    <div role="tablist" aria-label="Customer details sections" className="flex overflow-x-auto border-b border-slate-200 px-3">{tabs.map((name,index)=><button key={name} role="tab" id={`customer-tab-${index}`} aria-controls="customer-tab-panel" aria-selected={tab===name} tabIndex={tab===name?0:-1} onClick={()=>{setTab(name);setPage(1);}} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:null;if(next!==null){event.preventDefault();setTab(tabs[next]);setPage(1);document.getElementById(`customer-tab-${next}`)?.focus();}}} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm ${tab===name?'border-emerald-700 font-semibold text-emerald-800':'border-transparent text-slate-500'}`}>{name}</button>)}</div>
    <section id="customer-tab-panel" role="tabpanel" aria-labelledby={`customer-tab-${tabs.indexOf(tab)}`} tabIndex={0} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {tab==='Overview'&&(!data&&!error?<p className="text-sm text-slate-500">Loading customer details…</p>:data&&<>
        <div className="flex items-center gap-3"><CustomerAvatar customer={customer} large/><h3 className="text-sm font-semibold">Customer Profile</h3></div><dl className="grid gap-4 text-sm sm:grid-cols-2">{[['Full name',customer.fullName],['Email',customer.email],['Contact number',customer.phone||'Not recorded'],['Customer ID',customer.id],['Date registered',date(customer.createdAt)],['Last updated',date(customer.updatedAt)],['Status',customer.status==='active'?'Active':'Disabled']].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
        <section className="space-y-3 border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold">Saved Addresses</h3>{!data.addresses?.length?<p className="text-sm text-slate-500">No saved address.</p>:<>{data.addresses.map((address,index)=><article key={address.id||index} className="rounded-lg border border-slate-200 p-3 text-sm">{(address.isDefault||index===(data.addresses[0]?.isDefault?1:0))&&<h4 className="mb-2 text-xs font-semibold text-emerald-800">{address.isDefault?'Default Address':'Additional Saved Addresses'}</h4>}{address.label&&<p className="font-semibold">{address.label}</p>}{address.name&&<p className="font-medium">{address.name}</p>}{address.phone&&<p className="text-xs text-slate-500">{address.phone}</p>}<p className="mt-1">{[address.addressLine,address.barangay,address.city,address.province,address.postalCode].filter(Boolean).join(', ')}</p>{address.landmark&&<p className="mt-1 text-xs text-slate-500">Landmark: {address.landmark}</p>}</article>)}</>}</section>
        <h3 className="border-t border-slate-200 pt-4 text-sm font-semibold">Customer Order Statistics</h3><dl className="grid grid-cols-2 gap-3 text-sm">{[['Total Orders',data.statistics.total],['Delivered Orders',data.statistics.delivered],['Cancelled Orders',data.statistics.cancelled],['Total Amount Spent',money(data.statistics.spent)]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><p className="text-xs text-slate-500">Amount spent includes Delivered + Paid orders only. Unpaid COD, cancelled, refunded and refund-pending orders are excluded.</p>
        {data.statistics.pending>0&&<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{data.statistics.pending} open orders require separate order management. Changing account access does not cancel them.</p>}
      </>)}
      {tab==='Purchase History'&&<div className="flex flex-wrap gap-2"><input aria-label="Search customer orders" placeholder="Search Order ID" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}} className={control}/><select aria-label="Order status filter" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}} className={control}><option value="">All statuses</option>{['Pending','Preparing','Out for Delivery','Cancellation Requested','Cancelled','Delivered'].map(value=><option key={value}>{value}</option>)}</select></div>}
      {tab!=='Overview'&&(loading?<p className="text-sm text-slate-500">Loading records…</p>:!error&&records.total===0?<p className="text-sm text-slate-500">{tab==='Purchase History'?'No purchase history available.':'No account administration activity recorded.'}</p>:!error&&<>
        {tab==='Purchase History'?<div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="bg-slate-50"><tr>{['Order ID','Order Date','Total','Order Status','Payment Status','Action'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{(records.orders||[]).map(order=><tr key={order.id} className="border-t border-slate-100"><td className="p-2">ORD-{String(order.id).padStart(3,'0')}</td><td className="p-2">{date(order.created_at)}</td><td className="p-2">{money(order.total_amount)}</td><td className="p-2">{order.status}</td><td className="p-2">{order.payment_status}</td><td className="p-2"><button className="whitespace-nowrap font-semibold text-emerald-800 underline" onClick={()=>onViewOrder(order.id,{tab,page,search,status})}>View Order</button></td></tr>)}</tbody></table></div>:<ol className="space-y-3">{(records.entries||[]).map(entry=><li key={entry.id} className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-semibold">{entry.action}</p><p className="mt-1 text-xs text-slate-500">{date(entry.created_at)} · {entry.actor}</p><p className="mt-1 text-xs">{entry.reason}</p></li>)}</ol>}
        <div className="flex items-center justify-between text-xs"><button className={control} disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(records.total/20))}</span><button className={control} disabled={page*20>=records.total} onClick={()=>setPage(p=>p+1)}>Next</button></div>
      </>)}
    </section></div>
  </dialog>;
}
