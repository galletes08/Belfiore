import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPin, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRiderOrders, getImageUrl } from '../api/client';

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
  return !['Delivered', 'Cancelled', 'Cancellation Requested'].includes(order.status);
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
    <div className="mx-auto max-w-7xl space-y-5 font-['Montserrat']">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Assigned deliveries</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Rider Dashboard</h1>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">Orders</p>
          <p className="mt-2 text-xl font-bold tracking-tight sm:mt-3 sm:text-2xl text-slate-900">{totals.all}</p>
          <p className="mt-2 hidden text-xs text-slate-500 sm:block">All assigned deliveries</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">Active</p>
          <p className="mt-2 text-xl font-bold tracking-tight sm:mt-3 sm:text-2xl text-emerald-700">{totals.active}</p>
          <p className="mt-2 hidden text-xs text-slate-500 sm:block">Deliveries in progress</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">Delivered</p>
          <p className="mt-2 text-xl font-bold tracking-tight sm:mt-3 sm:text-2xl text-slate-900">{totals.delivered}</p>
          <p className="mt-2 hidden text-xs text-slate-500 sm:block">Completed deliveries</p>
        </article>
      </section>

      <section className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {[
          { key: 'all', label: 'All Orders', count: totals.all },
          { key: 'active', label: 'Active', count: totals.active },
          { key: 'delivered', label: 'Delivered', count: totals.delivered },
        ].map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setSelectedFilter(filter.key)}
            className={"min-h-11 shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition " + (
              selectedFilter === filter.key
                ? "bg-[#1f5a43] text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            {filter.label} <span className="ml-1 opacity-80">{filter.count}</span>
          </button>
        ))}
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
        <section className="grid gap-4 xl:grid-cols-2">
          {filteredOrders.map((order) => {
            const deliveryLink = buildDriverLink(order.driverAccessToken);
            const imageCount = order.items.length;

            return (
              <article key={order.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                <div className="border-b border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">{order.orderCode}</p>
                      <h2 className="mt-1 truncate text-base font-bold leading-tight text-gray-900">{order.customerName}</h2>
                      <p className="mt-1 text-xs text-gray-500">{order.mobileNumber || order.gmail || '-'}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusBadgeClass(order.status)}`}>
                        {order.status}
                      </span>
                      {order.trackingStatus && order.trackingStatus !== order.status ? (
                        <span className={"inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold " + trackingBadgeClass(order.trackingStatus)}>
                          {order.trackingStatus}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="p-3 sm:p-4">
                  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-2.5 py-2.5">
                    {order.items.slice(0, 1).map((item) => {
                      const imageSrc = getImageUrl(item.imageUrl);
                      return (
                        <div key={item.id} className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#eef2ea]">
                            {imageSrc ? <img src={imageSrc} alt={item.productName} className="h-full w-full object-cover" /> : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{item.productName}</p>{item.variantName&&<p className="text-xs text-gray-600">{item.variantName} | {item.variantSku} | {item.qty} {item.sellingUnit}</p>}
                            <p className="mt-0.5 text-xs text-gray-500">Qty {item.qty}</p>
                          </div>
                        </div>
                      );
                    })}
                    <p className="shrink-0 text-xs font-bold text-gray-900">{formatPhp(order.totalAmount)}</p>
                  </div>

                  <div className="mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <MapPin size={15} className="mt-0.5 shrink-0 text-emerald-700" />
                    <p className="line-clamp-2 break-words">{order.location || 'No delivery location yet'}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-slate-500">
                    <span>Accepted {formatDate(order.driverAcceptedAt)}</span>
                    <span>{imageCount > 1 ? `+${imageCount - 1} more item(s)` : 'Rider delivery'}</span>
                  </div>

                  {deliveryLink ? (
                    <Link
                      to={`/rider/delivery/${order.driverAccessToken}`}
                      className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0f4d2e] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#163f2f]"
                    >
                      View Details
                      <ExternalLink size={15} />
                    </Link>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-center text-xs font-medium text-gray-500">
                      Delivery page not ready yet.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
