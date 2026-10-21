import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, AlertTriangle, Truck, CheckCircle, Search, Eye, MoreHorizontal, History, CreditCard } from 'lucide-react';
import OrderDetailsDrawer from './OrderDetailsDrawer';
import NotificationBell from './NotificationBell';
import InventoryActionMenu from './InventoryActionMenu';
import { orderSummary, filterOrders } from '../utils/orderDisplay';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiAdminOrders, apiAdminRiders, apiConfirmCodRemittance, apiConfirmOrder, apiUpdateOrder, apiReadNotification } from '../api/client';

const STATUS_FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Preparing', label: 'Preparing' },
  { key: 'Out for Delivery', label: 'Out for Delivery' },
  { key: 'Cancellation Requested', label: 'Cancel Requests' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'Delivered', label: 'Delivered' },
];

const ORDER_STATUS_OPTIONS = ['Pending', 'Preparing', 'Cancellation Requested', 'Out for Delivery', 'Delivered', 'Cancelled'];
const TRACKING_STATUS_OPTIONS = ['Pending', 'Preparing', 'Packed', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'];

const badgeStyles = {
  Pending: 'bg-amber-100 text-amber-800',
  Preparing: 'bg-sky-100 text-sky-800',
  'Out for Delivery': 'bg-violet-100 text-violet-800',
  Delivered: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-rose-100 text-rose-700',
  'Cancellation Requested': 'bg-orange-100 text-orange-800',
  Packed: 'bg-cyan-100 text-cyan-800',
  'In Transit': 'bg-indigo-100 text-indigo-800',
};

const emptyForm = {
  status: 'Pending',
  deliveryMode: 'rider',
  courierName: '',
  riderId: '',
  trackingCode: '',
  trackingStatus: 'Pending',
  cancelReason: '',
  deliveryNotes: '',
};

function orderForm(order) {
  return {status:order.status || 'Pending',deliveryMode:order.deliveryMode || 'rider',courierName:order.courierName || '',
    riderId:order.riderId ? String(order.riderId) : '',trackingCode:order.trackingCode || '',
    trackingStatus:order.trackingStatus || 'Pending',cancelReason:order.cancelReason || '',deliveryNotes:''};
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPhp(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function badgeClass(value) {
  return badgeStyles[value] || 'bg-gray-100 text-gray-700';
}

function buildDriverPortalUrl(token) {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/driver/${token}`;
}

export default function AdminOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOrderId = searchParams.get('orderId');
  const requestedNotificationId = searchParams.get('notificationId');
  const [fromDate,setFromDate]=useState('');
  const [toDate,setToDate]=useState('');
  const [page,setPage]=useState(1);
  const [drawerTab,setDrawerTab]=useState('Overview');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState(null);
  const [remittingOrderId, setRemittingOrderId] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      setLoading(true);
      try {
        const [ordersData, ridersData] = await Promise.all([apiAdminOrders(), apiAdminRiders()]);
        if (!isMounted) return;
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setRiders(Array.isArray(ridersData) ? ridersData : []);
        if (requestedOrderId) {
          const linked = /^\d+$/.test(requestedOrderId) && ordersData.find(order=>String(order.id)===requestedOrderId);
          if (linked) {
            setDrawerTab('Overview');setSelectedOrder(linked);setForm(orderForm(linked));setError('');
            if(requestedNotificationId) {
              try{await apiReadNotification(requestedNotificationId);window.dispatchEvent(new Event('belfiore-notifications-changed'));}
              catch{if(isMounted)setError('Order opened, but its notification could not be marked read. Retry from the notification bell.');}
            }
          }
          else {setSelectedOrder(null);setError('The linked order is unavailable or you do not have access.');}
        } else setError('');
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load orders');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOrders();
    return () => {
      isMounted = false;
    };
  }, [requestedOrderId,requestedNotificationId]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (document.hidden || inFlight || saving || confirmingOrderId || remittingOrderId) return;
      inFlight = true;
      try {
        const latest = await apiAdminOrders();
        if (!active || !Array.isArray(latest)) return;
        setOrders(latest);
        if (selectedOrder) {
          const fresh = latest.find(order => order.id === selectedOrder.id);
          if (fresh) {
            const dirty = JSON.stringify(form) !== JSON.stringify(orderForm(selectedOrder));
            if (!dirty) setForm(orderForm(fresh));
            else if (fresh.status !== selectedOrder.status) setError('This order was updated by the rider or another administrator. Your unsaved changes were kept. Close and reopen the details before saving.');
            setSelectedOrder(fresh);
          }
        }
      } catch (err) {
        if (active) setError(`Unable to refresh orders: ${err.message}`);
      } finally { inFlight = false; }
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [selectedOrder, form, saving, confirmingOrderId, remittingOrderId]);

  const counts = useMemo(() => {
    const next = { All: orders.length };
    for (const filter of STATUS_FILTERS) {
      if (filter.key === 'All') continue;
      next[filter.key] = orders.filter((order) => order.status === filter.key).length;
    }
    return next;
  }, [orders]);

  const filteredOrders = useMemo(() => filterOrders(orders,{search,status:activeFilter,fromDate,toDate}),[orders,search,activeFilter,fromDate,toDate]);
  const summary=orderSummary(orders);
  const pages=Math.max(1,Math.ceil(filteredOrders.length/20));
  useEffect(()=>{setPage(1);},[search,activeFilter,fromDate,toDate]);
  useEffect(()=>{setPage(current=>Math.min(current,pages));},[pages]);

  const openEditor = (order, tab = 'Overview') => {
    setDrawerTab(tab);
    setSelectedOrder(order);
    setForm(orderForm(order));
    setError('');
  };

  const closeEditor = () => {
    if (saving || confirmingOrderId || remittingOrderId) return;
    if (selectedOrder && JSON.stringify(form)!==JSON.stringify(orderForm(selectedOrder)) && !window.confirm('Discard unsaved order changes?')) return;
    if (requestedOrderId) {const next = new URLSearchParams(searchParams);next.delete('orderId');setSearchParams(next,{replace:true,state:location.state});}
    setSelectedOrder(null);
    setForm(emptyForm);
    setSaving(false);
    setRemittingOrderId(null);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedOrder) return;
    if (['Delivered','Cancelled'].includes(selectedOrder.status) && form.status !== selectedOrder.status) {
      setError('This order has already been completed or cancelled. Close and reopen its details to load the current status.');
      return;
    }
    if (form.status !== selectedOrder.status && !window.confirm(`Change order status from ${selectedOrder.status} to ${form.status}?`)) return;

    setSaving(true);
    setError('');

    try {
      const updatedOrder = await apiUpdateOrder(selectedOrder.id, form);
      setOrders((current) => current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
      setSelectedOrder(updatedOrder);
      setForm(orderForm(updatedOrder));
    } catch (err) {
      setError(err.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOrder = async (order) => {
    if (!order || order.status !== 'Pending') return;
    const shouldConfirm = window.confirm(
      `Confirm ${order.orderCode}? This will notify the customer and move the order to Preparing.`
    );
    if (!shouldConfirm) return;

    setConfirmingOrderId(order.id);
    setError('');
    try {
      const updatedOrder = await apiConfirmOrder(order.id);
      setOrders((current) =>
        current.map((entry) => (entry.id === updatedOrder.id ? updatedOrder : entry))
      );
      if (selectedOrder?.id === updatedOrder.id) {
        setSelectedOrder(updatedOrder);
        setForm(orderForm(updatedOrder));
      }
    } catch (err) {
      setError(err.message || 'Failed to confirm order');
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const handleConfirmCodRemittance = async (order) => {
    if (!order || order.codStatus !== 'Remittance Pending') return;
    const shouldConfirm = window.confirm(
      `Confirm that Belfiore received the COD payment for ${order.orderCode}? Payment Status will become Paid.`
    );
    if (!shouldConfirm) return;

    setRemittingOrderId(order.id);
    setError('');
    try {
      const updatedOrder = await apiConfirmCodRemittance(order.id);
      setOrders((current) =>
        current.map((entry) => (entry.id === updatedOrder.id ? updatedOrder : entry))
      );
      if (selectedOrder?.id === updatedOrder.id) {
        setSelectedOrder(updatedOrder);
      }
    } catch (err) {
      setError(err.message || 'Failed to confirm COD payment received');
    } finally {
      setRemittingOrderId(null);
    }
  };


  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-4">
      {location.state?.customerReturn && <button type="button" className="mb-4 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800" onClick={()=>navigate('/admin/customers',{state:{customerReturn:location.state.customerReturn}})}>Back to Customer Management</button>}
      {location.state?.inventoryHistory && <button type="button" className="mb-4 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800" onClick={()=>navigate('/admin/inventory',{state:{inventoryHistory:location.state.inventoryHistory}})}>Back to Inventory History</button>}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Orders &amp; fulfillment</p>
        <div className="mt-1 flex items-center justify-between gap-4">
          <h1 className="min-w-0 text-2xl font-bold text-slate-900">Order Management</h1>
          <div className="shrink-0"><NotificationBell /></div>
        </div>
        <p className="mt-2 text-sm text-slate-500">View and manage customer orders.</p>
      </header>

      <section aria-label="Order summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ['Total Orders',summary.total,'All recorded orders',ShoppingBag],['Pending Action',summary.pending,'Confirmation, cancellations or payment issues',AlertTriangle],['In Progress',summary.progress,'Preparing or on the way',Truck],['Delivered',summary.delivered,'Successfully completed deliveries',CheckCircle],
      ].map(card=>{const [label,value,note]=card;const Icon=card[3];return <article key={label} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Icon size={18} aria-hidden="true"/></span><div><h2 className="text-xs font-semibold text-slate-500">{label}</h2><p className="mt-1 text-2xl font-bold text-[#1f5a43]">{loading?'—':value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div></article>;})}</section>
      {error && !selectedOrder ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="w-full max-w-md">
            <span className="sr-only">Search orders</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by customer, order ID, courier, or tracking code"
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#2d5a45] focus:bg-white"
            />
          </label>

          <div className="text-sm text-gray-500">
            Showing {filteredOrders.length} of {orders.length} orders
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-medium text-slate-600">From Date<input type="date" value={fromDate} max={toDate||undefined} onChange={e=>setFromDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"/></label><label className="text-xs font-medium text-slate-600">To Date<input type="date" value={toDate} min={fromDate||undefined} onChange={e=>setToDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"/></label><button onClick={()=>{setSearch('');setActiveFilter('All');setFromDate('');setToDate('');setPage(1);}} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-medium">Reset</button><span className="pb-2 text-xs text-slate-500">Order creation dates | Philippine Time | Entire end date included</span></div>
        <div aria-label="Order status filters" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          {STATUS_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition ${
                  isActive
                    ? 'bg-[#1f5a43] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.label} <span className="ml-1 opacity-80">{counts[filter.key] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading orders...</p> : filteredOrders.length===0 ? <p className="p-8 text-center text-sm text-slate-500">No orders match the selected filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr>{['Order ID','Customer','Total Amount','Order Status','Payment Status','Order Date','Actions'].map(label=><th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
          {filteredOrders.slice((page-1)*20,page*20).map(order=><tr key={order.id} className="hover:bg-emerald-50/30"><td className="px-4 py-3 font-semibold text-slate-900">{order.orderCode}</td><td className="px-4 py-3"><p className="font-medium">{order.customerName}</p>{order.gmail&&<p className="mt-0.5 text-xs text-slate-500">{order.gmail}</p>}</td><td className="whitespace-nowrap px-4 py-3 font-semibold">{formatPhp(order.totalAmount)}</td><td className="px-4 py-3"><span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${badgeClass(order.status)}`}>{order.status}</span></td><td className="px-4 py-3"><span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${order.paymentStatus==='Paid'?'bg-emerald-50 text-emerald-800':['Refund Pending','Failed'].includes(order.paymentStatus)?'bg-amber-50 text-amber-800':'bg-slate-100 text-slate-600'}`}>{order.paymentMethod==='COD'&&['Unpaid','Pending'].includes(order.paymentStatus)?'Pending Collection':order.paymentStatus || 'Not recorded'}</span></td><td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(order.createdAt)} PHT</td><td className="px-4 py-3"><div className="flex items-center gap-2 whitespace-nowrap"><button className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-emerald-800" onClick={()=>openEditor(order)}><Eye size={14} aria-hidden="true"/>View Details</button><InventoryActionMenu label="More" productName={order.orderCode} icon={MoreHorizontal} items={[
            {label:'Payment details',icon:CreditCard,action:()=>openEditor(order,'Payment')},
            {label:'Delivery & status',icon:Truck,action:()=>openEditor(order,'Delivery')},
            {label:'Order history',icon:History,action:()=>openEditor(order,'History')},
          ]}/></div></td></tr>)}
        </tbody></table></div>}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 text-xs text-slate-500"><span>{filteredOrders.length} orders | Page {page} of {pages}</span><div className="flex gap-2"><button disabled={loading||page===1} onClick={()=>setPage(p=>p-1)} className="min-h-9 rounded-lg border border-slate-200 px-3 disabled:opacity-40">Previous</button><button disabled={loading||page===pages} onClick={()=>setPage(p=>p+1)} className="min-h-9 rounded-lg border border-slate-200 px-3 disabled:opacity-40">Next</button></div></footer>
      </section>

      {selectedOrder && <OrderDetailsDrawer key={selectedOrder.id + drawerTab} order={selectedOrder} initialTab={drawerTab} onClose={closeEditor}
        busy={saving || Boolean(confirmingOrderId) || Boolean(remittingOrderId)} error={error}
        onConfirm={handleConfirmOrder} confirming={confirmingOrderId===selectedOrder.id} onRemit={handleConfirmCodRemittance} remitting={remittingOrderId===selectedOrder.id}
        backLabel={location.state?.customerReturn?'Back to Customer Management':'Back to Inventory History'}
        backToHistory={location.state?.customerReturn ? ()=>{if(JSON.stringify(form)!==JSON.stringify(orderForm(selectedOrder))&&!window.confirm('Discard unsaved order changes?'))return;navigate('/admin/customers',{state:{customerReturn:location.state.customerReturn}});} : location.state?.inventoryHistory ? ()=>{if(JSON.stringify(form)!==JSON.stringify(orderForm(selectedOrder))&&!window.confirm('Discard unsaved changes and return to Inventory History?'))return;navigate('/admin/inventory',{state:{inventoryHistory:location.state.inventoryHistory}});} : undefined}>
              <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">Delivery Management</h3>
                  <p className="mt-1 text-sm text-gray-500">{form.deliveryMode==='logistics'?'Courier statuses update automatically when carrier data is available. Enter the courier tracking number to begin.':'Manage rider assignment and the existing delivery workflow.'}</p>
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Order Status</span>
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                  >
                    {ORDER_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option} disabled={['Delivered','Cancelled'].includes(selectedOrder.status) && option !== selectedOrder.status}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedOrder.status === 'Cancellation Requested' ? (
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                    <p className="font-semibold">Customer requested cancellation</p>
                    <p className="mt-1">{selectedOrder.cancelReason || 'No reason provided.'}</p>
                    <p className="mt-2 text-xs text-orange-700">
                      Select Cancelled to approve and restore stock, or Preparing to reject and continue the order.
                    </p>
                  </div>
                ) : null}

                {form.status === 'Cancelled' ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Cancellation Reason</span>
                    <textarea
                      value={form.cancelReason}
                      onChange={(event) => setForm((current) => ({ ...current, cancelReason: event.target.value }))}
                      rows={3}
                      placeholder="Reason for cancelling this order"
                      className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                    />
                    <p className="mt-1 text-xs text-gray-500">Cancelling restores inventory once. Paid orders become Refund Pending.</p>
                  </label>
                ) : null}

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Delivery Mode</span>
                  <select
                    value={form.deliveryMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        deliveryMode: event.target.value,
                        riderId: event.target.value === 'logistics' ? '' : current.riderId,
                        courierName: event.target.value === 'logistics' ? current.courierName : '',
                      }))
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                  >
                    <option value="rider">Rider delivery</option>
                    <option value="logistics">Logistics only</option>
                  </select>
                </label>

                {form.deliveryMode === 'rider' ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Assigned Rider</span>
                    <select
                      value={form.riderId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          riderId: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                    >
                      <option value="">No rider assigned</option>
                      {riders.map((rider) => (
                        <option key={rider.id} value={rider.id} disabled={!rider.isAvailable && String(form.riderId)!==String(rider.id)}>
                          {rider.fullName} {`(${rider.availability || 'Offline'})`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Courier</span>
                      <select
                        value={form.courierName}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            courierName: event.target.value,
                          }))
                        }
                        required
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                      >
                        <option value="">Select J&T or LBC</option>
                        <option value="J&T Express">J&T Express</option>
                        <option value="LBC">LBC</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Tracking Number</span>
                      <input
                        type="text"
                        value={form.trackingCode}
                        onChange={(event) => setForm(current=>({...current,trackingCode:event.target.value}))}
                        placeholder="LBC123456789PH"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        A tracking reference does not confirm dispatch. Courier events determine shipment progress.
                      </p>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Delivery Status</span>
                      <select
                        value={form.trackingStatus}
                        disabled={selectedOrder.automaticTracking && form.deliveryMode==='logistics'}
                        onChange={(event) => setForm((current) => ({ ...current, trackingStatus: event.target.value }))}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                      >
                        {TRACKING_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {form.deliveryMode === 'rider' ? (
                  <div className="rounded-2xl border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fcfa_100%)] px-4 py-3 text-sm text-gray-600">
                    <div className="flex items-center justify-between gap-3">
                      <span>Order status</span>
                      <span className="font-medium text-gray-900">{form.status}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span>Assigned rider</span>
                      <span className="text-right font-medium text-gray-900">
                        {riders.find((rider) => String(rider.id) === String(form.riderId))?.fullName || 'Not assigned'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span>Rider accepted</span>
                      <span className="text-right">{selectedOrder.driverAcceptedAt ? formatDateTime(selectedOrder.driverAcceptedAt) : 'Waiting for rider'}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span>Live GPS update</span>
                      <span className="text-right">{formatDateTime(selectedOrder.driverLocationUpdatedAt)}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-sky-100 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] px-4 py-3 text-sm text-gray-600">
                      <div className="flex items-center justify-between gap-3">
                        <span>Order status</span>
                        <span className="font-medium text-gray-900">{form.status}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span>Delivery status</span>
                        <span className="font-medium text-gray-900">{form.trackingStatus || 'Pending'}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span>Payment status</span>
                        <span className="font-medium text-gray-900">{selectedOrder.paymentStatus}</span>
                      </div>
                      {selectedOrder.paymentMethod === 'COD' ? (
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span>COD status</span>
                          <span className="text-right font-medium text-gray-900">{selectedOrder.codStatus || 'Awaiting Payment'}</span>
                        </div>
                      ) : null}
                    </div>

                    {selectedOrder.paymentMethod === 'COD' && selectedOrder.codStatus === 'Remittance Pending' ? (
                      <button
                        type="button"
                        disabled={remittingOrderId === selectedOrder.id}
                        onClick={() => handleConfirmCodRemittance(selectedOrder)}
                        className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {remittingOrderId === selectedOrder.id ? 'Confirming Payment...' : 'Confirm COD Payment Received'}
                      </button>
                    ) : null}


                  </>
                )}
                {form.deliveryMode === 'rider' && selectedOrder.driverAccessToken ? (
                  <div className="rounded-2xl border border-dashed border-[#1f5a43]/25 bg-white px-4 py-3 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">Private Driver Link</p>
                    <p className="mt-2 break-all text-xs text-gray-500">{buildDriverPortalUrl(selectedOrder.driverAccessToken)}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        const driverUrl = buildDriverPortalUrl(selectedOrder.driverAccessToken);
                        if (!driverUrl) return;
                        await navigator.clipboard.writeText(driverUrl);
                      }}
                      className="mt-3 rounded-full border border-[#1f5a43]/20 px-4 py-2 text-xs font-medium text-[#1f5a43] transition hover:bg-[#1f5a43] hover:text-white"
                    >
                      Copy Driver Link
                    </button>
                  </div>
                ) : form.deliveryMode === 'logistics' ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                    Logistics orders do not create rider links or live GPS tracking.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                    Save the order with an assigned rider first to generate the private driver link.
                  </div>
                )}

                {form.deliveryMode==='logistics'&&<label className="block text-sm font-medium text-slate-700">Delivery notes (optional)<textarea value={form.deliveryNotes || ''} maxLength={1000} rows={2} onChange={event=>setForm(current=>({...current,deliveryNotes:event.target.value}))} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"/></label>}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-[#1f5a43] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#163f2f] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? 'Saving Changes...' : (form.deliveryMode === 'logistics' ? 'Save Delivery Details' : 'Update Status')}
                </button>
              </form>
      </OrderDetailsDrawer>}
    </div>
  );
}
