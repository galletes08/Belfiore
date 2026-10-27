import {useRef,useState} from 'react';
import {staffApi} from './staffApi';
export default function StaffOrderActions({order,refresh,onError,onBusyChange}){
 const [busy,setBusy]=useState(false),guard=useRef(false);
 if(order.status!=='Pending')return null;
 const paymentReady=order.payment_method!=='ONLINE'||order.payment_status==='Paid';
 async function accept(){if(guard.current)return;guard.current=true;setBusy(true);onBusyChange?.(true);try{await staffApi(`/api/staff/orders/${order.id}/accept`,{});await refresh();}catch(e){onError(e.message);}finally{guard.current=false;setBusy(false);onBusyChange?.(false);}}
 return <section data-operations-editing className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-semibold">Order request</h3><p className="my-2 text-sm">Acceptance starts preparation and makes the invoice available. Payment and approved shipping checks still apply.</p><button className="min-h-11 rounded-lg bg-[#1f5a43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy||!paymentReady||order.shipping_status!=='Confirmed'||order.has_reconciliation} onClick={accept}>{busy?'Accepting...':'Accept Order'}</button>{(!paymentReady||order.shipping_status!=='Confirmed')&&<p className="mt-2 text-sm">Awaiting payment verification or shipping approval.</p>}</section>;
}
