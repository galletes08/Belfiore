import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CircleCheckBig, Clock3, MapPinned, Package, Truck, UserRound } from 'lucide-react';
import { apiCustomerOrders, clearCustomerToken, getImageUrl } from '../../api/client';
import TrackingMap from '../TrackingMap';
import { getStoredOrderIds } from '../../utils/customerOrders';

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

function formatPhp(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatDate(value) {
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

function buildDriverNote(order) {
  if (!order.courierName) return 'Waiting for admin to assign a rider.';
  if (!order.driverAcceptedAt) return `${order.courierName} has been assigned and is waiting to accept the order.`;
  if (!order.driverLatitude || !order.driverLongitude) return `${order.courierName} accepted the order and has not shared a live location yet.`;
  return `${order.courierName} is sharing a live location on the map.`;
}

function resolveItemImage(item) {
  return getImageUrl(item.imageUrl);
}

export default function Order() {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const orderIds = useMemo(() => getStoredOrderIds(), []);
  const totalOrders = orders.length;
  const activeOrdersCount = orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status)).length;
  const completedCount = orders.filter((order) => order.status === 'Delivered').length;
  const liveTrackedOrders = orders.filter((order) => order.driverLatitude != null && order.driverLongitude != null).length;
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

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    clearCustomerToken();
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f8faf9_0%,#f2f6f4_45%,#eef3f1_100%)]">
      <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-lime-100/40 blur-3xl" />

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 py-0 md:px-6 lg:grid-cols-[260px_1fr]">
        <aside className="self-start rounded-none border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur lg:sticky lg:top-0 lg:z-40 lg:h-[100dvh] lg:overflow-y-auto">
          <div className="mb-6 flex items-center gap-3">
            <Link
              to="/profile"
              aria-label="Go to Profile"
              className="rounded-full bg-emerald-100 p-2 text-emerald-700 transition hover:bg-emerald-200"
            >
              <UserRound size={18} />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Account</p>
              <h2 className="text-lg font-bold text-gray-900">User Panel</h2>
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-1">
            <Link
              to="/dashboard"
              className="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-emerald-300 hover:text-emerald-700"
            >
              Dashboard
            </Link>
            <Link to="/orders" className="rounded-lg bg-emerald-700 px-3 py-2 text-left font-semibold text-white">
              Orders
            </Link>
            <Link
              to="/profile"
              className="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-emerald-300 hover:text-emerald-700"
            >
              Profile
            </Link>
            <Link
              to="/login"
              onClick={handleLogout}
              className="col-span-2 rounded-lg border border-red-200 px-3 py-2 text-left text-red-600 hover:bg-red-50 lg:col-span-1"
            >
              Logout
            </Link>
          </nav>
        </aside>

        <main className="space-y-5 py-6">
          {paymongoStatus === 'success' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              PayMongo sent you back successfully. Your payment is being confirmed and the order status will update here once the webhook arrives.
            </div>
          ) : null}

          {paymongoStatus === 'cancel' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              PayMongo checkout was canceled. Your order was created, but it will stay unpaid until you complete the online payment.
            </div>
          ) : null}

          <section className="rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_65%)] p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Order Center</p>
                <h1 className="mt-2 text-2xl font-bold text-gray-900 md:text-3xl">Track your deliveries</h1>
                <p className="mt-2 text-sm text-gray-600">
                  Orders refresh every 15 seconds so you can see when your rider accepts and shares a live location.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Total</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{totalOrders}</p>
                </article>
                <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Active</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{activeOrdersCount}</p>
                </article>
                <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Delivered</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{completedCount}</p>
                </article>
                <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Live Map</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{liveTrackedOrders}</p>
                </article>
              </div>
            </div>
          </section>

          {status === 'loading' ? (
            <div className="rounded-2xl border border-white/80 bg-white/95 p-8 text-sm text-gray-500 shadow-sm backdrop-blur">
              Loading your orders...
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {status === 'empty' ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/95 p-8 text-center shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900">No tracked orders yet</h2>
              <p className="mt-3 text-sm text-gray-600">Place an order first, then it will appear here with rider tracking.</p>
            </div>
          ) : null}

          {status === 'success'
            ? orders.map((order) => {
              const orderStatus = statusConfig[order.status] || statusConfig.Pending;
              const customerPosition =
                  order.customerLatitude != null && order.customerLongitude != null
                    ? [order.customerLatitude, order.customerLongitude]
                    : null;
              const driverPosition =
                  order.driverLatitude != null && order.driverLongitude != null
                    ? [order.driverLatitude, order.driverLongitude]
                    : null;

              return (
                <article key={order.id} className="rounded-2xl border border-white/80 bg-white/95 p-5 shadow-sm backdrop-blur">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">{order.orderCode}</p>
                      <h2 className="mt-1 text-xl font-bold text-gray-900">{order.customerName}</h2>
                      <p className="mt-2 text-sm text-gray-500">Placed on {formatDate(order.createdAt)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${orderStatus.badgeClass}`}>
                        {orderStatus.label}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.trackingStatus)}`}>
                        {order.trackingStatus}
                      </span>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                        {order.paymentStatus}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4">
                      <div className="grid gap-4 rounded-2xl bg-gray-50/80 p-4 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Rider</p>
                          <p className="mt-2 text-sm font-semibold text-gray-900">{order.courierName || 'Waiting for assignment'}</p>
                          <p className="mt-1 text-sm text-gray-600">{order.driverPhone || 'No rider contact yet'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Latest Update</p>
                          <p className="mt-2 text-sm font-semibold text-gray-900">{formatDate(order.statusUpdatedAt || order.updatedAt)}</p>
                          <p className="mt-1 text-sm text-gray-600">{buildDriverNote(order)}</p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Delivery Address</p>
                          <p className="mt-2 text-sm text-gray-700">{order.location || 'No address provided'}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-200 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <Package size={16} className="text-emerald-700" />
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Items</h3>
                        </div>
                        <div className="space-y-3">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="h-12 w-12 overflow-hidden rounded-lg bg-[#eef2ea]">
                                  {resolveItemImage(item) ? (
                                    <img src={resolveItemImage(item)} alt={item.productName} className="h-full w-full object-cover" />
                                  ) : null}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-gray-900">{item.productName}</p>
                                  <p className="text-xs text-gray-500">Qty {item.qty}</p>
                                </div>
                              </div>
                              <p className="text-sm font-semibold text-gray-900">{formatPhp(item.lineTotal)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                          <span className="text-sm text-gray-500">Order Total</span>
                          <span className="text-lg font-bold text-gray-900">{formatPhp(order.totalAmount)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-[#f8faf8] p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <MapPinned size={16} className="text-emerald-700" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Live Tracking Map</h3>
                      </div>

                      {customerPosition || driverPosition ? (
                        <TrackingMap
                          customerPosition={customerPosition}
                          driverPosition={driverPosition}
                          customerLabel={`${order.customerName} delivery pin`}
                          driverLabel={order.courierName ? `${order.courierName} current location` : 'Rider current location'}
                        />
                      ) : (
                        <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-center text-sm text-gray-500">
                          <div className="max-w-xs">
                            <p className="font-semibold text-gray-700">Tracking map is not ready yet</p>
                            <p className="mt-2">
                              Save a checkout GPS pin and wait for the rider to accept the order and share a location.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <article className="rounded-xl border border-emerald-100 bg-white p-3">
                          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                            <Truck size={15} />
                            Rider Status
                          </p>
                          <p className="mt-2 text-sm text-gray-900">{order.driverAcceptedAt ? 'Accepted order' : 'Waiting for acceptance'}</p>
                        </article>
                        <article className="rounded-xl border border-sky-100 bg-white p-3">
                          <p className="flex items-center gap-2 text-sm font-semibold text-sky-700">
                            <Clock3 size={15} />
                            Location Update
                          </p>
                          <p className="mt-2 text-sm text-gray-900">{formatDate(order.driverLocationUpdatedAt)}</p>
                        </article>
                        <article className="rounded-xl border border-emerald-100 bg-white p-3">
                          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                            <CircleCheckBig size={15} />
                            Tracking Code
                          </p>
                          <p className="mt-2 text-sm text-gray-900">{order.trackingCode || 'Not assigned yet'}</p>
                        </article>
                      </div>
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
