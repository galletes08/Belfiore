import { useEffect, useState } from 'react';
import { apiDeliveryHistory } from '../api/client';

export default function DeliveryHistory({orderId}) {
  const [page,setPage]=useState(1);
  const [data,setData]=useState({entries:[],total:0});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;setLoading(true);
    apiDeliveryHistory(orderId,page).then(result=>{if(active){setData(result);setError('');}}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[orderId,page]);
  return <section aria-label="Delivery history" className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-semibold">Delivery History</h3>
    {loading?<p className="mt-2 text-xs text-slate-500">Loading delivery history…</p>:error?<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>:data.entries.length===0?<p className="mt-2 text-xs text-slate-500">No delivery status changes recorded.</p>:<ol className="mt-3 space-y-3">{data.entries.map(entry=><li key={entry.id} className="border-t border-slate-100 pt-2 text-xs"><p className="font-semibold">{entry.previous_status} → {entry.new_status}</p><p>{entry.courier || 'Courier not recorded'} · {entry.tracking_number || 'No tracking number'}</p><p className="mt-1 text-slate-500">{entry.actor} · {new Date(entry.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} PHT</p>{entry.notes&&<p className="mt-1 text-slate-600">{entry.notes}</p>}</li>)}</ol>}
    <div className="mt-3 flex items-center justify-between text-xs"><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-2 py-1 disabled:opacity-40">Previous</button><span>Page {page} of {Math.max(1,Math.ceil(data.total/25))}</span><button disabled={page*25>=data.total||loading} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-2 py-1 disabled:opacity-40">Next</button></div>
  </section>;
}
