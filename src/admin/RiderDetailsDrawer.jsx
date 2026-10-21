import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {apiRiderManagement} from '../api/client';
import CustomerAvatar from './CustomerAvatar';
import './orderDrawer.css';

const tabs=['Overview','Delivery History','Account Activity'];
export const riderDate=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'})+' PHT':'Not recorded';
const button='rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40';
export default function RiderDetailsDrawer({id,onClose}) {
  const dialog=useRef(null),navigate=useNavigate();
  const [tab,setTab]=useState(0),[data,setData]=useState(null),[records,setRecords]=useState({records:[],total:0});
  const [page,setPage]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{const node=dialog.current,old=document.body.style.overflow;node.showModal();document.body.style.overflow='hidden';return()=>{node.close();document.body.style.overflow=old;};},[]);
  useEffect(()=>{let active=true;setLoading(true);setError('');
    const path=tab===0?'details':tab===1?'deliveries':'activity';
    apiRiderManagement(`${id}/${path}`,{page}).then(result=>{if(active){if(tab===0)setData(result);else setRecords(result);}})
      .catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[id,tab,page,revision]);
  const rider=data?.rider;
  const viewOrder=id=>{onClose();navigate(`/admin/orders?orderId=${id}`);};
  return <dialog ref={dialog} aria-labelledby="rider-details-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    className="order-details-drawer fixed inset-y-0 right-0 m-0 ml-auto h-dvh max-h-none w-full max-w-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/40">
    <div className="flex h-full flex-col"><header className="flex items-start justify-between gap-3 border-b p-5"><div className="flex min-w-0 items-center gap-3">{rider&&<CustomerAvatar customer={rider} large/>}<div className="min-w-0"><p className="text-xs uppercase text-emerald-700">Rider Details</p><h2 id="rider-details-title" className="break-words text-xl font-bold">{rider?.fullName||`Rider #${id}`}</h2><p className="text-xs">{rider?.username||'No linked login'} · #{id}</p>{rider&&<p className="mt-1 text-xs">{rider.accountEnabled?'Active':'Disabled'} · {rider.availability}</p>}</div></div><div className="flex shrink-0 gap-1"><button className={button} onClick={()=>setRevision(r=>r+1)} aria-label="Refresh rider details">↻</button><button className={button} onClick={onClose}>Close</button></div></header>
    <div role="tablist" aria-label="Rider details sections" className="flex overflow-x-auto border-b px-3">{tabs.map((name,index)=><button key={name} role="tab" id={`rider-tab-${index}`} aria-controls="rider-tab-panel" aria-selected={tab===index} tabIndex={tab===index?0:-1}
      onClick={()=>{setTab(index);setPage(1);}} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:null;if(next!==null){event.preventDefault();setTab(next);setPage(1);document.getElementById(`rider-tab-${next}`)?.focus();}}}
      className={`min-h-11 shrink-0 border-b-2 px-3 text-sm ${tab===index?'border-emerald-700 font-semibold text-emerald-800':'border-transparent text-slate-500'}`}>{name}</button>)}</div>
    <section id="rider-tab-panel" role="tabpanel" aria-labelledby={`rider-tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading?<p role="status" className="text-sm text-slate-500">Loading rider records...</p>:!error&&(tab===0&&rider?<>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">{[['Full name',rider.fullName],['Username',rider.username||'No linked login'],['Phone',rider.phone],['Email (optional)',rider.email||'Not provided'],['Account',rider.accountEnabled?'Active':'Disabled'],['Availability',rider.availability],['Duty preference',rider.isOnDuty?'On Duty':'Off Duty'],['Created',riderDate(rider.createdAt)],['Updated',riderDate(rider.updatedAt)]].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
        {rider.securityLocked&&<p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Security Locked. An authorized administrator must review and unlock the account.{rider.assignmentReviewRequired?' Existing assignments require administrator review; they have not been cancelled.':''}</p>}
        {rider.mustChangePassword&&<p className="rounded-lg bg-amber-50 p-3 text-sm">Password change required before delivery workspace access.</p>}
        <h3 className="border-t pt-4 text-sm font-semibold">Delivery Summary</h3><dl className="grid grid-cols-2 gap-3 text-sm">{[['Total assigned',data.statistics.total],['Active',data.statistics.active],['Completed',data.statistics.completed],['Failed (recorded)',data.statistics.failed]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
        {data.currentAssignments.map(order=><button key={order.id} className={button+' block text-emerald-800'} onClick={()=>viewOrder(order.id)}>View Current Assignment · ORD-{String(order.id).padStart(3,'0')}</button>)}
        <p className="text-xs text-slate-500">Availability uses manual duty preference and ongoing assignments, not GPS presence. Older reassignment events may not have been recorded.</p>
      </>:tab!==0?<>
        {records.total===0?<p className="text-sm text-slate-500">{tab===1?'No delivery records available.':'No account activity recorded.'}</p>:tab===1?<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr>{['Order ID','Assigned','Status','Delivered','Customer','Action'].map(label=><th key={label} className="bg-slate-50 p-2">{label}</th>)}</tr></thead><tbody>{records.records.map(record=><tr key={record.record_id} className="border-t"><td className="p-2">ORD-{String(record.order_id).padStart(3,'0')}</td><td className="p-2">{riderDate(record.assigned_at)}</td><td className="p-2">{record.status}</td><td className="p-2">{riderDate(record.delivered_at)}</td><td className="p-2">{record.customer_name}</td><td className="p-2"><button className="font-semibold text-emerald-800 underline" onClick={()=>viewOrder(record.order_id)}>View Order</button></td></tr>)}</tbody></table></div>:<ol className="space-y-3">{records.records.map(record=><li key={record.id} className="rounded-lg border p-3 text-sm"><p className="font-semibold">{record.action}</p><p className="mt-1 text-xs text-slate-500">{riderDate(record.created_at)} · {record.actor}</p>{record.reason&&<p className="mt-1 text-xs">{record.reason}</p>}{record.verification_reference&&<p className="mt-1 text-xs">Verification: {record.verification_reference}</p>}</li>)}</ol>}
        {records.total>0&&<div className="flex items-center justify-between gap-2 text-xs"><button className={button} disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(records.total/20))}</span><button className={button} disabled={page*20>=records.total} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
      </>:null)}
    </section></div>
  </dialog>;
}
