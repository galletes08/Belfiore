import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CircleCheckBig, Clock3, MapPinned, Package, ReceiptText, Truck, UserRound } from 'lucide-react';
import { apiCustomerOrders, apiLogisticsUpdates, clearCustomerToken, getImageUrl } from '../../api/client';
import TrackingMap from '../TrackingMap';
import { getStoredOrderIds } from '../../utils/customerOrders';
import { printInvoice } from '../../utils/invoice';

const statusConfig = {
  Pending: { label: 'Pending', badgeClass: 'bg-amber-100 text-amber-800 ring-amber-200' },
  Preparing: { label: 'Preparing', badgeClass: 'bg-sky-100 text-sky-800 ring-sky-200' },
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
};

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

  const orderIds = useMemo(() => getStoredOrderIds(), []);
  const orderedOrders = useMemo(() => [...orders].sort(compareNewestOrders), [orders]);
  const totalOrders = orderedOrders.length;
  const activeOrdersCount = orderedOrders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status)).length;
  const completedCount = orderedOrders.filter((order) => order.status === 'Delivered').length;
  const liveTrackedOrders = orderedOrders.filter((order) => !isLogisticsOrder(order) && order.driverLatitude != null && order.driverLongitude != null).length;
  const orderStats = [
    { label: 'Total', value: totalOrders, icon: <Package size={17} />, accent: 'text-[#0f4d2e] bg-[#e8f3ea]' },
    { label: 'Active', value: activeOrdersCount, icon: <Truck size={17} />, accent: 'text-sky-700 bg-sky-50' },
    { label: 'Delivered', value: completedCount, icon: <CircleCheckBig size={17} />, accent: 'text-emerald-700 bg-emerald-50' },
    { label: 'Live map', value: liveTrackedOrders, icon: <MapPinned size={17} />, accent: 'text-violet-700 bg-violet-50' },
  ];
  const paymongoStatus = new URLSearchParams(location.search).get('paymongo');

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      if (!orderIds.length) {
        setOrders([]);
        setStatus('empty');
        return;
      }

      try {
        const data = await apiCustomerOrders(orderIds);
        if (!isMounted) return;
        setOrders(Array.isArray(data) ? data : []);
        setStatus('success');
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
      shippingFee: 0,
      note: 'Thank you for shopping with Belfiore Succulents PH. Please keep this invoice for your records.',
    });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8faf6] font-['Montserrat'] text-[#24372d]">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-0 px-4 md:px-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="self-start border-x border-[#e3eadf] bg-white px-5 py-6 lg:sticky lg:top-0 lg:z-40 lg:h-[100dvh] lg:overflow-y-auto">
          <div className="mb-6 flex items-center gap-3">
            <Link
              to="/profile"
              aria-label="Go to Profile"
              className="grid h-11 w-11 place-items-center rounded-full bg-[#e8f3ea] text-[#0f4d2e] transition hover:bg-[#d9ebdc]"
            >
              <UserRound size={18} />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6c786f]">Account</p>
              <h2 className="mt-1 text-lg font-semibold text-[#173d2b]">User Panel</h2>
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-1">
            <Link
              to="/dashboard"
              className="rounded-xl border border-[#e1e7dc] px-3 py-2.5 text-left text-[#405145] transition hover:border-[#b7ccb5] hover:text-[#0f4d2e]"
            >
              Dashboard
            </Link>
            <Link to="/orders" className="rounded-xl bg-[#0f4d2e] px-3 py-2.5 text-left font-semibold text-white shadow-sm">
              Orders
            </Link>
            <Link
              to="/profile"
              className="rounded-xl border border-[#e1e7dc] px-3 py-2.5 text-left text-[#405145] transition hover:border-[#b7ccb5] hover:text-[#0f4d2e]"
            >
              Profile
            </Link>
            <Link
              to="/login"
              onClick={handleLogout}
              className="col-span-2 rounded-xl border border-red-200 px-3 py-2.5 text-left text-red-600 transition hover:bg-red-50 lg:col-span-1"
            >
              Logout
            </Link>
          </nav>
        </aside>

        <main className="min-w-0 space-y-6 py-6 lg:px-6">
          {paymongoStatus === 'success' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-800">
              PayMongo sent you back successfully. Your payment is being confirmed and the order status will update here once the webhook arrives.
            </div>
          ) : null}

          {paymongoStatus === 'cancel' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
              PayMongo checkout was canceled. Your order was created, but it will stay unpaid until you complete the online payment.
            </div>
          ) : null}

          <section className="py-2">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <p className="font-['Montserrat'] text-xs font-semibold uppercase tracking-[0.35em] text-[#5e6f65]">Order Center</p>
                <h1 className="mt-3 font-['Playfair_Display'] text-4xl leading-tight text-[#0f4d2e] md:text-5xl">Track your deliveries</h1>
                <p className="mt-3 text-sm leading-7 text-[#5e6f65] md:text-base">
                  Recent purchases, payment status, and delivery progress in one clean view.
                </p>
              </div>

              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 xl:w-auto xl:min-w-[32rem]">
                {orderStats.map(({ label, value, icon, accent }) => (
                  <article key={label} className="min-w-0 rounded-2xl border border-[#e1e7dc] bg-white px-4 py-4 shadow-sm">
                    <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${accent}`}>
                      {icon}
                    </div>
                    <p className="whitespace-nowrap text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#6c786f]">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-[#173d2b]">{value}</p>
                  </article>
                ))}
              </div>
            </div>
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
              <h2 className="font-['Playfair_Display'] text-3xl text-[#0f4d2e]">No tracked orders yet</h2>
              <p className="mt-3 text-sm leading-6 text-[#5e6f65]">Place an order first, then it will appear here with rider tracking.</p>
            </div>
          ) : null}

          {status === 'success'
            ? orderedOrders.map((order) => {
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
                      <h2 className="mt-2 truncate font-['Playfair_Display'] text-3xl leading-tight text-[#0f4d2e]">{order.customerName || 'Valued Customer'}</h2>
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
                          Tracking: {trackingStatus}
                        </span>
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
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-[#e8eee6] bg-[#fbfcf8] p-5">
                        <h3 className="font-['Playfair_Display'] text-xl text-[#0f4d2e]">Delivery Details</h3>
                        <div className="mt-4 grid gap-5 md:grid-cols-2">
                          <DetailField label={logisticsOnly ? 'Courier' : 'Rider'}>
                            <p className="font-semibold">{logisticsOnly ? 'Logistics provider' : order.courierName || 'Waiting for assignment'}</p>
                            <p className="mt-1 text-[#5e6f65]">{logisticsOnly ? order.trackingCourierCode || 'External logistics tracking' : order.driverPhone || 'No rider contact yet'}</p>
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
                        <div className="mt-4 flex items-center justify-between border-t border-[#eef2ea] pt-4">
                          <span className="text-sm text-[#5e6f65]">Order Total</span>
                          <span className="text-xl font-semibold text-[#0f4d2e]">{formatPhp(order.totalAmount)}</span>
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
    </div>
  );
}
