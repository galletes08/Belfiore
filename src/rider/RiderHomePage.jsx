import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPinned, Package, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRiderOrders, getImageUrl, getRiderUser } from '../api/client';

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

function formatPhp(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

export default function RiderHomePage() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
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

  const activeOrders = useMemo(
    () => orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status)),
    [orders]
  );
  const deliveredOrders = useMemo(
    () => orders.filter((order) => order.status === 'Delivered'),
    [orders]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[10px] bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2d5a45]">Rider Dashboard</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">{riderUser?.name || 'Assigned Deliveries'}</h1>
        <p className="mt-2 text-sm text-gray-500">
          Manage orders assigned to your rider account and open live delivery pages from here.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <article className="rounded-[10px] bg-white p-6 shadow-sm">
          <h2 className="text-[0.95rem] font-semibold text-gray-500">Assigned Orders</h2>
          <p className="mt-2 text-2xl font-bold text-gray-800">{orders.length}</p>
          <p className="mt-1 text-sm text-gray-500">All orders linked to your rider profile</p>
        </article>
        <article className="rounded-[10px] bg-white p-6 shadow-sm">
          <h2 className="text-[0.95rem] font-semibold text-gray-500">Active Deliveries</h2>
          <p className="mt-2 text-2xl font-bold text-[#2d5a45]">{activeOrders.length}</p>
          <p className="mt-1 text-sm text-gray-500">Orders still in progress</p>
        </article>
        <article className="rounded-[10px] bg-white p-6 shadow-sm">
          <h2 className="text-[0.95rem] font-semibold text-gray-500">Delivered</h2>
          <p className="mt-2 text-2xl font-bold text-gray-800">{deliveredOrders.length}</p>
          <p className="mt-1 text-sm text-gray-500">Completed deliveries</p>
        </article>
      </section>

      {status === 'loading' ? (
        <section className="rounded-[10px] bg-white p-8 text-sm text-gray-500 shadow-sm">
          Loading rider orders...
        </section>
      ) : null}

      {status === 'error' ? (
        <section className="rounded-[10px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
          {error}
        </section>
      ) : null}

      {status === 'success' && orders.length === 0 ? (
        <section className="rounded-[10px] border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          No orders are assigned to this rider account yet.
        </section>
      ) : null}

      {status === 'success' && orders.length > 0 ? (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.95fr]">
          <div className="overflow-hidden rounded-[10px] bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-[1.1rem] font-bold text-gray-800">Assigned Orders</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-500">Order ID</th>
                    <th className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-500">Customer</th>
                    <th className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-500">Location</th>
                    <th className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-500">Status</th>
                    <th className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{order.orderCode}</td>
                      <td className="px-4 py-3 text-gray-700">{order.customerName}</td>
                      <td className="px-4 py-3 text-gray-600">{order.location || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                            {order.status}
                          </span>
                          <span className="inline-block rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">
                            {order.trackingStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatPhp(order.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            {orders.map((order) => (
              <article key={`detail-${order.id}`} className="rounded-[10px] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{order.orderCode}</p>
                    <h3 className="mt-2 text-lg font-semibold text-gray-900">{order.customerName}</h3>
                    <p className="mt-1 text-sm text-gray-500">{order.location || 'No delivery location yet'}</p>
                  </div>
                  <span className="rounded-full bg-[#eaf3ef] px-3 py-1 text-xs font-semibold text-[#2d5a45]">
                    {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 overflow-hidden rounded-md bg-[#eef2ea]">
                          {getImageUrl(item.imageUrl) ? (
                            <img src={getImageUrl(item.imageUrl)} alt={item.productName} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{item.productName}</p>
                          <p className="text-xs text-gray-500">Qty {item.qty}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-800">{formatPhp(item.lineTotal)}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-lg border border-gray-200 bg-[#f8faf8] p-4">
                  <div className="space-y-2 text-sm text-gray-700">
                    <p className="flex items-center gap-2"><Truck size={15} className="text-[#2d5a45]" /> Assigned: {formatDate(order.driverAssignedAt)}</p>
                    <p className="flex items-center gap-2"><MapPinned size={15} className="text-[#2d5a45]" /> Accepted: {formatDate(order.driverAcceptedAt)}</p>
                    <p className="flex items-center gap-2"><Package size={15} className="text-[#2d5a45]" /> Total: {formatPhp(order.totalAmount)}</p>
                  </div>

                  {order.driverAccessToken ? (
                    <Link
                      to={`/driver/${order.driverAccessToken}`}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#2d5a45] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1a3d2e]"
                    >
                      Open Delivery Page
                      <ExternalLink size={16} />
                    </Link>
                  ) : (
                    <div className="mt-4 rounded-md border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
                      Driver link is not ready for this order yet.
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
