import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { orderTimeline } from '../utils/orderDisplay';
import { getImageUrl } from '../api/client';
import './orderDrawer.css';
import DeliveryHistory from './DeliveryHistory';

const tabs = ['Overview','Items','Payment','Delivery','History'];
const money = value => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value);
const date = value => value ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})+' PHT' : 'Not recorded';
function Info({ values }) {
  return <dl className="grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2">{values.map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium text-slate-900">{value ?? 'Not recorded'}</dd></div>)}</dl>;
}

export default function OrderDetailsDrawer({order,onClose,busy,initialTab='Overview',error,onConfirm,confirming,onRemit,remitting,backToHistory,backLabel='Back to Inventory History',children}) {
  const ref = useRef(null);
  const [tab,setTab] = useState(initialTab);
  const [showDeliveryHistory,setShowDeliveryHistory]=useState(false);
  useEffect(()=>{
    const dialog=ref.current;
    const original=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog.showModal();
    return ()=>{dialog.close();document.body.style.overflow=original;};
  },[]);
  const paymentStatus = order.paymentMethod==='COD' && ['Unpaid','Pending'].includes(order.paymentStatus) ? 'Pending Collection' : order.paymentStatus;
  return <dialog ref={ref} aria-labelledby="order-drawer-heading" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}
    onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}} className="order-details-drawer fixed inset-y-0 right-0 m-0 ml-auto h-dvh max-h-none w-full max-w-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/40">
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-slate-200 px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Order Details</p><h2 id="order-drawer-heading" className="mt-1 text-xl font-bold text-slate-900">{order.orderCode}</h2><p className="mt-1 text-xs text-slate-500">{date(order.createdAt)}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close order details" className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs disabled:opacity-50"><X size={16} aria-hidden="true" />Close</button></div>
        <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">{order.status}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{paymentStatus}</span>{backToHistory&&<button disabled={busy} className="text-xs font-semibold text-emerald-800 underline disabled:opacity-50" onClick={backToHistory}>{backLabel}</button>}</div>
      </header>
      <div role="tablist" aria-label="Order details sections" className="flex shrink-0 overflow-x-auto border-b border-slate-200 px-3">{tabs.map(name=><button key={name} id={`order-tab-${name}`} role="tab" aria-selected={tab===name} aria-controls={`order-panel-${name}`} tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={event=>{const index=tabs.indexOf(name);const next=event.key==='ArrowRight'?(index+1)%5:event.key==='ArrowLeft'?(index+4)%5:event.key==='Home'?0:event.key==='End'?4:null;if(next!==null){event.preventDefault();setTab(tabs[next]);document.getElementById(`order-tab-${tabs[next]}`)?.focus();}}} className={`min-h-11 border-b-2 px-3 text-sm ${tab===name?'border-emerald-700 font-semibold text-emerald-800':'border-transparent text-slate-500'}`}>{name}</button>)}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {error&&<p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {order.inventoryReconciliationReason&&<p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{order.inventoryReconciliationReason}</p>}
        {tabs.map(name=><section key={name} id={`order-panel-${name}`} role="tabpanel" aria-labelledby={`order-tab-${name}`} hidden={tab!==name} tabIndex={0}>
          {name==='Overview'&&<div className="space-y-5">
            <section aria-labelledby="order-customer-heading"><h3 id="order-customer-heading" className="mb-3 text-sm font-semibold text-slate-900">Customer Information</h3><Info values={[
              ['Name',order.customerName],['Email',order.contactEmail || order.gmail || 'Not recorded'],['Phone',order.mobileNumber || 'Not recorded'],['Shipping address',order.location || 'Not recorded'],
            ]}/></section>
            <section aria-labelledby="order-information-heading" className="border-t border-slate-200 pt-4"><h3 id="order-information-heading" className="mb-3 text-sm font-semibold text-slate-900">Order Information</h3><Info values={[
              ['Order ID',order.orderCode],['Order date',date(order.createdAt)],['Order status',order.status],['Payment method',order.paymentMethod],['Payment status',paymentStatus],['Courier / rider',order.courierName || order.riderName || 'Not assigned'],['Tracking code',order.trackingCode || 'Not recorded'],
            ]}/></section>
            <div className="flex flex-wrap gap-2">{order.status==='Pending'&&<button disabled={busy||(order.paymentMethod==='ONLINE'&&order.paymentStatus!=='Paid')} onClick={()=>onConfirm(order)} className="rounded-lg bg-[#1f5a43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{confirming?'Confirming…':'Confirm Order'}</button>}<button onClick={()=>setTab('Delivery')} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Update Status</button></div>
          </div>}
          {name==='Items'&&<div className="space-y-3">{order.items.map(item=><article key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-50">{item.imageUrl?<img src={getImageUrl(item.imageUrl)} alt={item.productName} className="h-full w-full object-cover"/>:<span className="text-[10px] text-slate-400">No image</span>}</div><div className="min-w-0 flex-1 text-sm"><p className="font-semibold">{item.productName}</p><p className="text-xs text-slate-500">{item.productCode || 'Code not recorded'} · {item.inventoryType==='edible'?`Variety: ${item.productName}`:`Tag: ${item.productTag || 'Not recorded'}`}</p>{item.batchId&&<p className="text-xs text-slate-500">{item.batchCode || `Batch #${item.batchId}`}</p>}<p className="mt-1 text-xs">{item.variantName&&<span className="block">{item.variantName} | {item.variantSku} | {item.piecesPerUnit?`${item.piecesPerUnit} pieces`:`${item.weightKg} kg`}</span>}{item.qty} {item.sellingUnit||(item.inventoryType==='edible'?'400g packs':'plants')} × {money(item.unitPrice)}</p><p className="mt-1 font-semibold">{money(item.lineTotal)}</p></div></article>)}<div className="border-t border-slate-200 pt-4"><Info values={ [['Subtotal',money(order.subtotalAmount)],['Delivery fee',order.shippingFee==null?'To be confirmed':money(order.shippingFee)],['Grand total',money(order.totalAmount)]]}/></div></div>}
          {name==='Payment'&&<div className="space-y-4"><Info values={[
            ['Payment method',order.paymentMethod==='COD'?'Cash on Delivery':'Online (PayMongo)'],['Payment status',paymentStatus],['Order amount',money(order.totalAmount)],['Amount paid','Not separately recorded'],['Payment reference',order.paymongoPaymentId || 'Not recorded'],['Online confirmation date',date(order.paymongoPaidAt)],['COD collection',order.paymentMethod==='COD'?order.codStatus:'Not applicable'],['Refund information',['Refunded','Refund Pending'].includes(order.paymentStatus)?order.paymentStatus:'No refund status recorded'],
          ]}/>{order.paymentMethod==='COD'&&order.deliveryMode==='logistics'&&order.codStatus==='Remittance Pending'&&<button disabled={busy} onClick={()=>onRemit(order)} className="rounded-lg bg-[#1f5a43] px-4 py-2 text-sm text-white disabled:opacity-50">{remitting?'Confirming…':'Confirm COD Payment Received'}</button>}<p className="text-xs text-slate-500">Order acceptance does not confirm collection. Payment changes use the existing authorized backend workflow.</p></div>}
          {name==='Delivery'&&<div className="space-y-4"><Info values={[
            ['Delivery method',order.deliveryMode==='logistics'?'Third-party courier':'Belfiore rider'],['Delivery status',order.trackingStatus],['Assigned rider / courier',order.courierName || order.riderName || 'Not assigned'],['Tracking code',order.trackingCode || 'Not recorded'],['Rider accepted',date(order.driverAcceptedAt)],['Last GPS update',date(order.driverLocationUpdatedAt)],['Last updated',date(order.updatedAt)],
          ]}/>{order.deliveryMode!=='logistics'&&order.driverLatitude!=null&&order.driverLongitude!=null&&<a href={`https://www.google.com/maps?q=${encodeURIComponent(`${order.driverLatitude},${order.driverLongitude}`)}`} target="_blank" rel="noreferrer" className="inline-block rounded-lg border border-emerald-200 px-3 py-2 text-sm text-emerald-800">View last recorded rider location</a>}{order.deliveryProofUrl&&<img src={getImageUrl(order.deliveryProofUrl)} alt="Proof of delivery" className="max-h-56 rounded-xl"/>}{order.deliveryMode==='logistics'&&<><p className="text-xs text-slate-500">Courier tracking updates are fetched automatically when available. COD remittance is confirmed separately.</p><button onClick={()=>setShowDeliveryHistory(value=>!value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">{showDeliveryHistory?'Hide Delivery History':'View Delivery History'}</button>{showDeliveryHistory&&<DeliveryHistory key={order.updatedAt} orderId={order.id}/>}</>}{children}</div>}
          {name==='History'&&<div><p className="mb-4 text-xs text-slate-500">Recorded order timestamps and latest status snapshot. Missing transitions and responsible users are not inferred.</p><ol className="space-y-4 border-l border-emerald-200 pl-4">{orderTimeline(order).map(([activity,time,actor,description],index)=><li key={`${activity}-${index}`} className="text-sm"><p className="font-semibold">{activity}</p><p className="text-xs text-slate-500">{date(time)} · {actor}</p><p className="mt-1 text-xs text-slate-600">{description}</p></li>)}</ol></div>}
        </section>)}
      </div>
    </div>
  </dialog>;
}
