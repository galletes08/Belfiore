import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Package, UserRound, Truck, MapPinned } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRiderOrders, getImageUrl, getRiderUser } from '../api/client';

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

function formatPhp(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function statusBadgeClass(status) {
  const map = {
    Pending: 'bg-amber-100 text-amber-800',
    Preparing: 'bg-sky-100 text-sky-800',
    'Out for Delivery': 'bg-violet-100 text-violet-800',
    Delivered: 'bg-emerald-100 text-emerald-800',
    Cancelled: 'bg-rose-100 text-rose-700',
  };

  return map[status] || 'bg-gray-100 text-gray-700';
}

function trackingBadgeClass(status) {
  const map = {
    Pending: 'bg-amber-100 text-amber-800',
    Preparing: 'bg-sky-100 text-sky-800',
    Packed: 'bg-cyan-100 text-cyan-800',
    'In Transit': 'bg-indigo-100 text-indigo-800',
    'Out for Delivery': 'bg-violet-100 text-violet-800',
    Delivered: 'bg-emerald-100 text-emerald-800',
    Cancelled: 'bg-rose-100 text-rose-700',
  };

  return map[status] || 'bg-gray-100 text-gray-700';
}

function isActiveOrder(order) {
  return !['Delivered', 'Cancelled'].includes(order.status);
}

function buildDriverLink(token) {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/rider/delivery/${token}`;
}

export default function RiderHomePage() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const riderUser = getRiderUser();

  useEffect(() => {
    let mounted = true;

    async function loadOrders() {
      try {
        const data = await apiRiderOrders();
        if (!mounted) return;
        setOrders(Array.isArray(data) ? data : []);
        setStatus('success');
        setError('');
      } catch (err) {
        if (!mounted) return;
        setStatus('error');
        setError(err.message || 'Failed to load rider orders.');
      }
    }

    loadOrders();
    const intervalId = window.setInterval(loadOrders, 15000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const filteredOrders = useMemo(() => {
    if (selectedFilter === 'all') return orders;
    if (selectedFilter === 'active') return orders.filter(isActiveOrder);
    if (selectedFilter === 'delivered') return orders.filter((order) => order.status === 'Delivered');
    return orders;
  }, [orders, selectedFilter]);

  const totals = useMemo(() => {
    return {
      all: orders.length,
      active: orders.filter(isActiveOrder).length,
      delivered: orders.filter((order) => order.status === 'Delivered').length,
    };
  }, [orders]);

  const emptyMessage =
    selectedFilter === 'active'
      ? 'No active deliveries right now.'
      : selectedFilter === 'delivered'
        ? 'No delivered orders yet.'
        : 'No orders are assigned to this rider account yet.';

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 font-['Montserrat'] sm:space-y-7">
      <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-sm">
        <div className="bg-green-900 px-5 py-7 text-white sm:px-8 sm:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-100/90">Rider Dashboard</p>
              <h1 className="mt-3 font-['Playfair_Display'] text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                {riderUser?.name || 'Assigned Deliveries'}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-50/90 sm:text-base">
                Compact order cards with the essentials only, so the page stays quick and readable on mobile.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:min-w-[300px]">
              <article className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50/80">Orders</p>
                <p className="mt-2 text-3xl font-semibold leading-none">{totals.all}</p>
              </article>
              <article className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50/80">Active</p>
                <p className="mt-2 text-3xl font-semibold leading-none">{totals.active}</p>
              </article>
              <article className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50/80">Done</p>
                <p className="mt-2 text-3xl font-semibold leading-none">{totals.delivered}</p>
              </article>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-b border-gray-100 bg-white px-5 py-4 sm:px-8 sm:py-5">
          {[
            { key: 'all', label: 'All Orders', count: totals.all },
            { key: 'active', label: 'Active', count: totals.active },
            { key: 'delivered', label: 'Delivered', count: totals.delivered },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setSelectedFilter(filter.key)}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                selectedFilter === filter.key
                  ? 'bg-[#0f4d2e] text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label} <span className="ml-1.5 opacity-80">{filter.count}</span>
            </button>
          ))}
        </div>
      </section>

      {status === 'loading' ? (
        <section className="rounded-3xl border border-white/80 bg-white p-8 text-sm font-medium text-gray-500 shadow-sm">
          Loading rider orders...
        </section>
      ) : null}

      {status === 'error' ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
          {error}
        </section>
      ) : null}

      {status === 'success' && filteredOrders.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm font-medium text-gray-500 shadow-sm">
          {emptyMessage}
        </section>
      ) : null}

      {status === 'success' && filteredOrders.length > 0 ? (
        <section className="grid gap-5 xl:grid-cols-2">
          {filteredOrders.map((order) => {
            const deliveryLink = buildDriverLink(order.driverAccessToken);
            const imageCount = order.items.length;

            return (
              <article key={order.id} className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">{order.orderCode}</p>
                      <h2 className="mt-2 truncate font-['Playfair_Display'] text-2xl font-semibold leading-tight text-gray-900">{order.customerName}</h2>
                      <p className="mt-2 text-sm text-gray-500">{formatDate(order.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className={`inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold ${statusBadgeClass(order.status)}`}>
                        {order.status}
                      </span>
                      <span className={`inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold ${trackingBadgeClass(order.trackingStatus)}`}>
                        {order.trackingStatus}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 px-5 py-5 sm:px-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-gray-50 p-5">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                        <UserRound size={14} />
                        Customer
                      </p>
                      <p className="mt-3 text-sm font-semibold text-gray-900">{order.customerName}</p>
                      <p className="mt-1 text-sm leading-6 text-gray-600">{order.mobileNumber || order.gmail || '-'}</p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-5">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                        <Package size={14} />
                        Items
                      </p>
                      <div className="mt-4 space-y-3">
                        {order.items.slice(0, 2).map((item) => {
                          const imageSrc = getImageUrl(item.imageUrl);

                          return (
                            <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3">
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[#eef2ea]">
                                {imageSrc ? (
                                  <img src={imageSrc} alt={item.productName} className="h-full w-full object-cover" />
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-900">{item.productName}</p>
                                <p className="mt-1 text-xs text-gray-500">Qty {item.qty}</p>
                              </div>
                              <p className="shrink-0 text-sm font-semibold text-gray-900">{formatPhp(item.lineTotal)}</p>
                            </div>
                          );
                        })}
                        {imageCount > 2 ? (
                          <p className="px-1 text-xs font-medium text-gray-500">+{imageCount - 2} more item(s)</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                        <Truck size={14} />
                        Delivery
                      </p>
                      <div className="mt-3 space-y-2.5 text-sm leading-6 text-gray-700">
                        <p>
                          <span className="font-semibold text-gray-900">Mode:</span>{' '}
                          {order.deliveryMode === 'logistics' ? 'Logistics only' : 'Rider delivery'}
                        </p>
                        <p>
                          <span className="font-semibold text-gray-900">Courier:</span>{' '}
                          {order.courierName || 'Not assigned yet'}
                        </p>
                        <p>
                          <span className="font-semibold text-gray-900">Total:</span> {formatPhp(order.totalAmount)}
                        </p>
                        <p className="text-xs font-medium text-gray-500">{order.driverAccessToken ? 'Delivery page ready' : 'Delivery page not ready yet'}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-5">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                        <MapPinned size={14} />
                        Quick details
                      </p>
                      <div className="mt-3 space-y-2.5 text-sm leading-6 text-gray-700">
                        <p>
                          <span className="font-semibold text-gray-900">Address:</span> {order.location || 'No delivery location yet'}
                        </p>
                        <p>
                          <span className="font-semibold text-gray-900">Accepted:</span> {formatDate(order.driverAcceptedAt)}
                        </p>
                        <p>
                          <span className="font-semibold text-gray-900">Live GPS:</span> {formatDate(order.driverLocationUpdatedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      {deliveryLink ? (
                        <Link
                          to={`/rider/delivery/${order.driverAccessToken}`}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#0f4d2e] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#163f2f]"
                        >
                          Open Delivery Page
                          <ExternalLink size={16} />
                        </Link>
                      ) : (
                        <div className="flex-1 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-500">
                          Delivery page not ready yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
