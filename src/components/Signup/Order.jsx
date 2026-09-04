import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CircleCheckBig, Clock3, MapPinned, Package, ReceiptText, Search, Truck } from 'lucide-react';
import { apiCancelCustomerOrder, apiCustomerOrders, apiLogisticsUpdates, apiVerifyOnlinePayment, clearCustomerToken, getImageUrl } from '../../api/client';
import TrackingMap from '../TrackingMap';
import { getStoredOrderIds } from '../../utils/customerOrders';
import AccountSidebar from './AccountSidebar';
import { printInvoice } from '../../utils/invoice';

const statusConfig = {
  Pending: { label: 'Pending', badgeClass: 'bg-amber-100 text-amber-800 ring-amber-200' },
  Preparing: { label: 'Preparing', badgeClass: 'bg-sky-100 text-sky-800 ring-sky-200' },
  'Cancellation Requested': { label: 'Cancellation Requested', badgeClass: 'bg-orange-100 text-orange-800 ring-orange-200' },
  'Out for Delivery': { label: 'Out for Delivery', badgeClass: 'bg-violet-100 text-violet-800 ring-violet-200' },
  Delivered: { label: 'Delivered', badgeClass: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  Cancelled: { label: 'Cancelled', badgeClass: 'bg-rose-100 text-rose-700 ring-rose-200' },
};

const trackingConfig = {
  Pending: 'bg-amber-100 text-amber-800',
  Preparing: 'bg-sky-100 text-sky-800',
  Packed: 'bg-cyan-100 text-cyan-800',
  'In Transit': 'bg-indigo-100 text-indigo-800',
  'Out for Delivery': 'bg-violet-100 text-violet-800',
  Delivered: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-rose-100 text-rose-700',
};

const paymentConfig = {
  Pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  Paid: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  Unpaid: 'bg-stone-100 text-stone-700 ring-stone-200',
  Failed: 'bg-rose-100 text-rose-700 ring-rose-200',
  Refunded: 'bg-orange-100 text-orange-800 ring-orange-200',
  'Refund Pending': 'bg-orange-100 text-orange-800 ring-orange-200',
};

const cancellationReasons = [
  'Changed my mind',
  'Ordered by mistake',
  'Need to change the items or address',
  'Delivery is taking too long',
  'Other',
];

const purchaseTabs = [
  { id: 'all', label: 'All' }, { id: 'to-pay', label: 'To Pay' }, { id: 'to-ship', label: 'To Ship' }, { id: 'to-receive', label: 'To Receive' }, { id: 'completed', label: 'Completed' }, { id: 'refund', label: 'Return / Refund' }, { id: 'cancelled', label: 'Cancelled' },
];
function matchesPurchaseStatus(order, tab) {
  if (tab === 'all') return true;
  const orderStatus = order.status || 'Pending'; const paymentStatus = order.paymentStatus || 'Pending'; const trackingStatus = order.trackingStatus || 'Pending';
  if (tab === 'to-pay') return ['Pending', 'Unpaid', 'Failed'].includes(paymentStatus) && !['Cancelled', 'Cancellation Requested'].includes(orderStatus);
  if (tab === 'to-ship') return ['Pending', 'Preparing'].includes(orderStatus) && ['Paid', 'Pending'].includes(paymentStatus);
  if (tab === 'to-receive') return ['Packed', 'In Transit', 'Out for Delivery'].includes(trackingStatus) || orderStatus === 'Out for Delivery';
  if (tab === 'completed') return orderStatus === 'Delivered';
  if (tab === 'refund') return ['Refund Pending', 'Refunded'].includes(paymentStatus) || ['Cancellation Requested', 'Refunded', 'Returned'].includes(orderStatus);
  return orderStatus === 'Cancelled';
}
function formatPhp(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function badgeClass(value) {
  return trackingConfig[value] || 'bg-stone-100 text-stone-700';
}

function paymentBadgeClass(value) {
  return paymentConfig[value] || 'bg-stone-100 text-stone-700 ring-stone-200';
}

function codBadgeClass(value) {
  if (value === 'Remitted' || value === 'Collected') {
    return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  }
  if (value === 'Cancelled') {
    return 'bg-rose-100 text-rose-700 ring-rose-200';
  }
  if (value === 'Remittance Pending') {
    return 'bg-orange-100 text-orange-800 ring-orange-200';
  }
  return 'bg-amber-100 text-amber-800 ring-amber-200';
}

function isLogisticsOrder(order) {
  return order?.deliveryMode === 'logistics';
}

function getOrderCode(order) {
  return order?.orderCode || `ORD-${String(order?.id || 0).padStart(3, '0')}`;
}

function getTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function compareNewestOrders(a, b) {
  const createdDifference = getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
  if (createdDifference !== 0) return createdDifference;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

function buildDriverNote(order) {
  if (isLogisticsOrder(order)) {
    return 'This order is tracked through logistics status updates only.';
  }
  if (!order.courierName) return 'Waiting for admin to assign a rider.';
  if (!order.driverAcceptedAt) return `${order.courierName} has been assigned and is waiting to accept the order.`;
  if (!order.driverLatitude || !order.driverLongitude) return `${order.courierName} accepted the order and has not shared a live location yet.`;
  return `${order.courierName} is sharing a live location on the map.`;
}

function resolveItemImage(item) {
  return getImageUrl(item.imageUrl);
}

function createInvoiceNumber(order) {
  const orderDate = new Date(order.createdAt);
  const year = Number.isNaN(orderDate.getTime()) ? new Date().getFullYear() : orderDate.getFullYear();
  return `INV-${year}-${String(order.id).padStart(5, '0')}`;
}

function LogisticsUpdatesPanel({ order, logisticsData }) {
  if (!order.trackingCode) {
    return (
      <div className="rounded-2xl border border-dashed border-[#cbd5c6] bg-white/80 px-4 py-5 text-sm leading-6 text-[#5e6f65]">
        <p className="font-semibold text-[#173d2b]">Waiting for tracking number</p>
        <p className="mt-2">Carrier updates will appear here once the courier tracking code is assigned.</p>
      </div>
    );
  }

  if (logisticsData?.status === 'error') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm leading-6 text-rose-700">
        {logisticsData.error || 'Carrier updates are not available right now.'}
      </div>
    );
  }

  if (logisticsData?.status === 'success') {
    const updates = Array.isArray(logisticsData.data?.updates) ? logisticsData.data.updates : [];

    if (!updates.length) {
      return (
        <div className="rounded-2xl border border-dashed border-[#cbd5c6] bg-white/80 px-4 py-5 text-sm leading-6 text-[#5e6f65]">
          No carrier events were returned for this tracking number yet.
        </div>
      );
    }

    return (
      <ol className="space-y-3">
        {updates.slice(0, 8).map((update, index) => (
          <li
            key={update.id || `${update.status}-${update.happenedAt}-${index}`}
            className="relative rounded-2xl border border-[#e6ece2] bg-white px-4 py-3 pl-8 shadow-sm"
          >
            <span className="absolute left-4 top-5 h-2.5 w-2.5 rounded-full bg-emerald-600" />
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm font-semibold text-[#173d2b]">{update.status || 'Carrier update'}</p>
              <p className="text-xs text-[#6c786f]">{formatDate(update.happenedAt)}</p>
            </div>
            {update.description ? <p className="mt-2 text-sm leading-6 text-[#37483f]">{update.description}</p> : null}
            {update.location ? <p className="mt-1 text-xs text-[#6c786f]">{update.location}</p> : null}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-[#cbd5c6] bg-white/80 px-4 py-5 text-sm leading-6 text-[#5e6f65]">
      Loading carrier updates...
    </div>
  );
}

function DetailField({ label, children }) {
  return (
    <div>
      <p className="font-['Montserrat'] text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#6c786f]">{label}</p>
      <div className="mt-2 text-sm leading-6 text-[#24372d]">{children}</div>
    </div>
  );
}

function TrackingSummaryCard({ icon, label, value, tone = 'emerald' }) {
  const toneClass = tone === 'sky' ? 'border-sky-100 text-sky-700' : 'border-emerald-100 text-emerald-700';

  return (
    <article className={`rounded-2xl border bg-white p-3 ${toneClass}`}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
        {icon}
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium leading-6 text-[#173d2b]">{value}</p>
    </article>
  );
}

export default function Order() {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [logisticsUpdatesByOrder, setLogisticsUpdatesByOrder] = useState({});
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState(cancellationReasons[0]);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const orderIds = useMemo(() => getStoredOrderIds(), []);
  const orderedOrders = useMemo(() => [...orders].sort(compareNewestOrders), [orders]);
  const filteredOrders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return orderedOrders.filter((order) => {
      if (!matchesPurchaseStatus(order, activeTab)) return false;
      if (!query) return true;
      const items = Array.isArray(order.items) ? order.items : [];
      return [getOrderCode(order), order.customerName, ...items.map((item) => item.productName)].filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }, [activeTab, orderedOrders, searchTerm]);
  const paymongoParams = new URLSearchParams(location.search);
  const paymongoStatus = paymongoParams.get('paymongo');
  const paymongoOrderId = Number(paymongoParams.get('orderId'));
  const [paymentVerification, setPaymentVerification] = useState('idle');

  useEffect(() => {
    if (paymongoStatus !== 'success' || !Number.isInteger(paymongoOrderId) || paymongoOrderId <= 0) {
      return undefined;
    }

    let isMounted = true;
    setPaymentVerification('checking');

    apiVerifyOnlinePayment(paymongoOrderId)
      .then((result) => {
        if (!isMounted) return;
        const isPaid = result.paymentStatus === 'Paid';
        setPaymentVerification(isPaid ? 'paid' : 'pending');
        if (isPaid) {
          setOrders((current) =>
            current.map((order) => (order.id === paymongoOrderId ? { ...order, paymentStatus: 'Paid' } : order))
          );
        }
      })
      .catch(() => {
        if (isMounted) setPaymentVerification('error');
      });

    return () => {
      isMounted = false;
    };
  }, [paymongoOrderId, paymongoStatus]);

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      try {
        const data = await apiCustomerOrders(orderIds);
        if (!isMounted) return;
        const nextOrders = Array.isArray(data) ? data : [];
        setOrders(nextOrders);
        setStatus(nextOrders.length ? 'success' : 'empty');
        setError('');
      } catch (err) {
        if (!isMounted) return;
        setStatus('error');
        setError(err.message || 'Failed to load your orders.');
      }
    }

    loadOrders();
    const intervalId = window.setInterval(loadOrders, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [orderIds]);

  useEffect(() => {
    const logisticsOrders = orders.filter((order) => isLogisticsOrder(order) && order.trackingCode);
    if (!logisticsOrders.length) return undefined;

    let isMounted = true;

    async function loadLogisticsUpdates() {
      const results = await Promise.all(
        logisticsOrders.map(async (order) => {
          try {
            const data = await apiLogisticsUpdates(order.id);
            return [order.id, { status: 'success', data }];
          } catch (err) {
            return [order.id, { status: 'error', error: err.message || 'Failed to load logistics updates.' }];
          }
        })
      );

      if (!isMounted) return;
      setLogisticsUpdatesByOrder((current) => ({
        ...current,
        ...Object.fromEntries(results),
      }));
    }

    loadLogisticsUpdates();
    return () => {
      isMounted = false;
    };
  }, [orders]);

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    clearCustomerToken();
  };

  const handlePrintInvoice = (order) => {
    printInvoice({
      invoiceNumber: createInvoiceNumber(order),
      orderId: order.orderCode || `ORD-${String(order.id).padStart(3, '0')}`,
      invoiceDate: order.createdAt ? new Date(order.createdAt) : new Date(0),
      buyerName: order.customerName || 'Valued Customer',
      buyerEmail: order.gmail || 'No email provided',
      buyerPhone: order.mobileNumber || '',
      buyerAddress: order.location || '',
      status: order.status || 'Pending',
      paymentMethod: order.paymentMethod || '',
      paymentStatus: order.paymentStatus || '',
      storeName: 'Belfiore Succulents PH',
      items: order.items,
      shippingFee: order.shippingFee,
      note: 'Thank you for shopping with Belfiore Succulents PH. Please keep this invoice for your records.',
    });
  };

  const handleCancelOrder = async (event) => {
    event.preventDefault();
    if (!orderToCancel) return;

    setCancelling(true);
    setCancelError('');
    try {
      const updatedOrder = await apiCancelCustomerOrder(orderToCancel.id, cancelReason);
      setOrders((current) => current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
      setOrderToCancel(null);
      setCancelReason(cancellationReasons[0]);
    } catch (err) {
      setCancelError(err.message || 'Unable to cancel this order.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8faf6] font-['Montserrat'] text-[#24372d]">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-0 px-4 md:px-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <AccountSidebar onLogout={handleLogout} />

        <main className="min-w-0 space-y-6 py-6 lg:px-6">
          {paymongoStatus === 'success' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-800">
              {paymentVerification === 'paid'
                ? 'Online payment confirmed. Your payment status is now Paid.'
                : paymentVerification === 'error'
                  ? 'We could not verify the payment yet. Please refresh in a moment or contact support if the payment was deducted.'
                  : paymentVerification === 'pending'
                    ? 'PayMongo has not confirmed a paid transaction yet. Your payment will remain Pending.'
                    : 'Verifying your completed PayMongo payment...'}
            </div>
          ) : null}
          {paymongoStatus === 'cancel' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
              PayMongo checkout was canceled. Your order was created, but it will stay unpaid until you complete the online payment.
            </div>
          ) : null}

          <section className="py-2">
            <div className="max-w-2xl">
              <p className="font-['Montserrat'] text-xs font-semibold uppercase tracking-[0.35em] text-[#5e6f65]">Purchase Center</p>
              <h1 className="mt-3 font-['Playfair_Display'] text-3xl leading-tight text-[#0f4d2e] md:text-4xl">My Purchases</h1>
              <p className="mt-3 text-sm leading-7 text-[#5e6f65] md:text-base">
                Find and sort every purchase by payment, shipping, delivery, and refund status.
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-[1.35rem] border border-[#e1e7dc] bg-white shadow-sm">
            <div className="flex overflow-x-auto border-b border-[#e7ece4] px-2">
              {purchaseTabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`shrink-0 border-b-2 px-4 py-4 text-sm font-medium transition sm:px-5 ${activeTab === tab.id ? 'border-[#f04b2f] text-[#e44227]' : 'border-transparent text-[#405145] hover:text-[#0f4d2e]'}`}>{tab.label}</button>)}
            </div>
            <div className="p-4"><label className="flex items-center gap-3 rounded-xl bg-[#f1f3f0] px-4 py-3 text-sm text-[#405145] focus-within:ring-2 focus-within:ring-[#b9d7c3]"><Search size={20} className="shrink-0 text-[#7b867d]" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by product name or Order ID" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#7b867d]" /></label></div>
          </section>
          {status === 'loading' ? (
            <div className="rounded-2xl border border-[#e1e7dc] bg-white p-8 text-sm text-[#5e6f65] shadow-sm">
              Loading your orders...
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm leading-6 text-rose-700">
              {error}
            </div>
          ) : null}

          {status === 'empty' ? (
            <div className="rounded-2xl border border-dashed border-[#c7d0c3] bg-white p-10 text-center shadow-sm">
              <h2 className="font-['Playfair_Display'] text-2xl text-[#0f4d2e]">No tracked orders yet</h2>
              <p className="mt-3 text-sm leading-6 text-[#5e6f65]">Place an order first, then it will appear here with rider tracking.</p>
            </div>
          ) : null}

                    {status === 'success' && filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#c7d0c3] bg-white p-10 text-center shadow-sm"><h2 className="font-['Playfair_Display'] text-2xl text-[#0f4d2e]">No matching purchases</h2><p className="mt-3 text-sm text-[#5e6f65]">Try another status or search term.</p></div>
          ) : null}

          {status === 'success'
            ? filteredOrders.map((order) => {
              const orderStatus = statusConfig[order.status] || statusConfig.Pending;
              const trackingStatus = order.trackingStatus || 'Pending';
              const paymentStatus = order.paymentStatus || 'Pending';
              const logisticsOnly = isLogisticsOrder(order);
              const logisticsData = logisticsUpdatesByOrder[order.id];
              const orderItems = Array.isArray(order.items) ? order.items : [];
              const customerPosition =
                  !logisticsOnly && order.customerLatitude != null && order.customerLongitude != null
                    ? [order.customerLatitude, order.customerLongitude]
                    : null;
              const driverPosition =
                  !logisticsOnly && order.driverLatitude != null && order.driverLongitude != null
                    ? [order.driverLatitude, order.driverLongitude]
                    : null;

              return (
                <article key={order.id} className="rounded-[1.35rem] border border-[#e1e7dc] bg-white p-5 shadow-[0_18px_45px_rgba(15,77,46,0.06)] md:p-6">
                  <div className="flex flex-col gap-5 border-b border-[#eef2ea] pb-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-['Montserrat'] text-xs font-semibold uppercase tracking-[0.28em] text-[#5e6f65]">{getOrderCode(order)}</p>
                        <span className="rounded-full bg-[#eef2ea] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#405145]">
                          {logisticsOnly ? 'Logistics' : 'Rider delivery'}
                        </span>
                      </div>
                      <h2 className="mt-2 truncate font-['Playfair_Display'] text-2xl leading-tight text-[#0f4d2e]">{order.customerName || 'Valued Customer'}</h2>
                      <p className="mt-2 text-sm text-[#6c786f]">Placed on {formatDate(order.createdAt)}</p>
                    </div>

                    <div className="flex flex-col gap-3 sm:items-end">
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ring-1 ${orderStatus.badgeClass}`}>
                          Order: {orderStatus.label}
                        </span>
                        <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ring-1 ${paymentBadgeClass(paymentStatus)}`}>
                          Payment: {paymentStatus}
                        </span>
                        <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(trackingStatus)}`}>
                          Delivery: {trackingStatus}
                        </span>
                        {order.paymentMethod === 'COD' ? (
                          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ring-1 ${codBadgeClass(order.codStatus)}`}>
                            COD: {order.codStatus || 'Awaiting Payment'}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                        <div className="sm:text-right">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Total</p>
                          <p className="text-lg font-semibold text-[#173d2b]">{formatPhp(order.totalAmount)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePrintInvoice(order)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#b9d7c3] bg-white px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#0f6b45] shadow-sm transition hover:border-[#0f6b45] hover:bg-[#f1faf3]"
                        >
                          <ReceiptText size={15} />
                          Invoice
                        </button>
                        {['Pending', 'Preparing'].includes(order.status) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOrderToCancel(order);
                              setCancelReason(cancellationReasons[0]);
                              setCancelError('');
                            }}
                            className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-white px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700 shadow-sm transition hover:bg-rose-50"
                          >
                            Cancel order
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {order.adminConfirmedAt ? (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                      <p className="font-semibold">Checkout confirmed by admin</p>
                      <p className="mt-1">
                        Your order has been confirmed and is now being prepared.
                        {' '}Confirmed {formatDate(order.adminConfirmedAt)}.
                      </p>
                    </div>
                  ) : null}

                  {order.paymentMethod === 'COD' ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                      <p className="font-semibold">Cash on Delivery · {order.codStatus || 'Awaiting Payment'}</p>
                      <p className="mt-1">
                        {logisticsOnly
                          ? order.codStatus === 'Cancelled'
                            ? 'This COD order was cancelled.'
                            : order.codStatus === 'Remittance Pending'
                            ? 'Your order was delivered and paid to the courier. Belfiore is waiting for the courier remittance; Payment Status remains Unpaid.'
                            : order.codStatus === 'Remitted'
                              ? 'Belfiore received the courier COD remittance. Payment Status is Paid.'
                              : `Pay ${order.courierName || 'the J&T/LBC courier'} when your order is delivered.`
                          : order.codStatus === 'Cancelled'
                            ? 'This COD order was cancelled.'
                            : order.codStatus === 'Collected'
                            ? 'Payment was received by the Belfiore Rider upon delivery.'
                            : 'Pay cash directly to the Belfiore Rider when your order is delivered.'}
                      </p>
                    </div>
                  ) : null}

                  {order.cancelReason ? (
                    <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                      <span className="font-semibold">Cancellation reason:</span> {order.cancelReason}
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-[#e8eee6] bg-[#fbfcf8] p-5">
                        <h3 className="font-['Playfair_Display'] text-xl text-[#0f4d2e]">Delivery Details</h3>
                        <div className="mt-4 grid gap-5 md:grid-cols-2">
                          <DetailField label={logisticsOnly ? 'Courier' : 'Rider'}>
                            <p className="font-semibold">{logisticsOnly ? order.courierName || 'Waiting for courier selection' : order.courierName || 'Waiting for assignment'}</p>
                            <p className="mt-1 text-[#5e6f65]">{logisticsOnly ? order.trackingCode || 'Waiting for tracking number' : order.driverPhone || 'No rider contact yet'}</p>
                          </DetailField>
                          <DetailField label="Latest Update">
                            <p className="font-semibold">{formatDate(order.statusUpdatedAt || order.updatedAt)}</p>
                            <p className="mt-1 text-[#5e6f65]">{buildDriverNote(order)}</p>
                          </DetailField>
                          <div className="md:col-span-2">
                            <DetailField label="Delivery Address">
                              <p>{order.location || 'No address provided'}</p>
                            </DetailField>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#e1e7dc] bg-white p-5">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f3ea] text-[#0f4d2e]">
                            <Package size={16} />
                          </span>
                          <div>
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#6c786f]">Items</p>
                            <h3 className="font-['Playfair_Display'] text-xl text-[#0f4d2e]">Order Summary</h3>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {orderItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f7f5f0] px-3 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#eef2ea]">
                                  {resolveItemImage(item) ? (
                                    <img src={resolveItemImage(item)} alt={item.productName} className="h-full w-full object-cover" />
                                  ) : null}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#173d2b]">{item.productName}</p>
                                  <p className="mt-1 text-xs text-[#6c786f]">Qty {item.qty}</p>
                                </div>
                              </div>
                              <p className="shrink-0 text-sm font-semibold text-[#173d2b]">{formatPhp(item.lineTotal)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 space-y-2 border-t border-[#eef2ea] pt-4 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[#5e6f65]">Subtotal</span>
                            <span className="font-medium text-[#173d2b]">{formatPhp(order.subtotalAmount ?? order.totalAmount)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-[#5e6f65]">Shipping Fee</span>
                            <span className="text-right font-medium text-[#173d2b]">{order.shippingFee == null ? 'Shipping fee to be confirmed' : formatPhp(order.shippingFee)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4 border-t border-[#eef2ea] pt-3">
                            <span className="text-[#5e6f65]">Total</span>
                            <span className="text-right text-xl font-semibold text-[#0f4d2e]">{order.shippingFee == null ? 'To be confirmed' : formatPhp(order.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#e1e7dc] bg-[#f7f5f0] p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#0f4d2e] shadow-sm">
                          <MapPinned size={16} />
                        </span>
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#6c786f]">Tracking</p>
                          <h3 className="font-['Playfair_Display'] text-xl text-[#0f4d2e]">{logisticsOnly ? 'Carrier Updates' : 'Live Map'}</h3>
                        </div>
                      </div>

                      {logisticsOnly ? null : customerPosition || driverPosition ? (
                        <TrackingMap
                          className="border-[#e1e7dc] shadow-sm"
                          customerPosition={customerPosition}
                          driverPosition={driverPosition}
                          customerLabel={`${order.customerName} delivery pin`}
                          driverLabel={order.courierName ? `${order.courierName} current location` : 'Rider current location'}
                        />
                      ) : (
                        <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-[#cbd5c6] bg-white/80 text-center text-sm leading-6 text-[#5e6f65]">
                          <div className="max-w-xs">
                            <p className="font-semibold text-[#173d2b]">Tracking map is not ready yet</p>
                            <p className="mt-2">
                              Save a checkout GPS pin and wait for the rider to accept the order and share a location.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className={`${logisticsOnly ? '' : 'mt-4'} grid gap-3 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3`}>
                        <TrackingSummaryCard
                          icon={<Truck size={15} />}
                          label={logisticsOnly ? 'Mode' : 'Rider'}
                          value={logisticsOnly ? 'Logistics only' : order.driverAcceptedAt ? 'Accepted order' : 'Waiting for acceptance'}
                        />
                        <TrackingSummaryCard
                          icon={<Clock3 size={15} />}
                          label={logisticsOnly ? 'Last Sync' : 'Location'}
                          value={formatDate(logisticsOnly ? order.track123LastSyncedAt : order.driverLocationUpdatedAt)}
                          tone="sky"
                        />
                        <TrackingSummaryCard
                          icon={<CircleCheckBig size={15} />}
                          label="Code"
                          value={order.trackingCode || 'Not assigned yet'}
                        />
                      </div>

                      {logisticsOnly ? (
                        <div className="mt-4">
                          <LogisticsUpdatesPanel order={order} logisticsData={logisticsData} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
            : null}
        </main>
      </div>

      {orderToCancel ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="purchase-cancel-title">
          <form onSubmit={handleCancelOrder} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="purchase-cancel-title" className="font-['Playfair_Display'] text-2xl text-[#0f4d2e]">
              Cancel {getOrderCode(orderToCancel)}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#5e6f65]">
              {orderToCancel.status === 'Pending'
                ? 'The order will be cancelled immediately and its reserved stock will be returned.'
                : 'Preparation has started, so this will be sent to the admin as a cancellation request.'}
            </p>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-semibold text-[#294b39]">Reason for cancellation</span>
              <select
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                className="w-full rounded-xl border border-[#d7dfd3] bg-white px-3 py-3 text-sm text-[#294b39] outline-none focus:border-[#0b7a3c]"
              >
                {cancellationReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </label>

            {cancelError ? <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{cancelError}</p> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setOrderToCancel(null)}
                className="rounded-full border border-[#d7dfd3] px-5 py-2.5 text-sm font-semibold text-[#355441]"
              >
                Keep order
              </button>
              <button
                type="submit"
                disabled={cancelling}
                className="rounded-full bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {cancelling ? 'Processing...' : 'Confirm cancellation'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
