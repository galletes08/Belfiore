import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiCustomerOrders } from '../../../api/client';
import { formatPrice, useCustomerStore } from '../../context/CustomerStore';

const statusClasses = {
  Pending: 'bg-amber-100 text-amber-800',
  Preparing: 'bg-sky-100 text-sky-800',
  'Out for Delivery': 'bg-violet-100 text-violet-800',
  Delivered: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-rose-100 text-rose-700',
  Packed: 'bg-cyan-100 text-cyan-800',
  'In Transit': 'bg-indigo-100 text-indigo-800',
  Paid: 'bg-emerald-100 text-emerald-800',
  Unpaid: 'bg-stone-100 text-stone-700',
  Failed: 'bg-rose-100 text-rose-700',
  Refunded: 'bg-orange-100 text-orange-800',
};

function badgeClass(value) {
  return statusClasses[value] || 'bg-stone-100 text-stone-700';
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

export default function OrdersPage() {
  const { orderHistory } = useCustomerStore();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const orderIds = useMemo(
    () => orderHistory.map((entry) => Number(entry.id)).filter((id) => Number.isInteger(id) && id > 0),
    [orderHistory]
  );

  useEffect(() => {
    let mounted = true;

    async function loadOrders() {
      if (!orderIds.length) {
        setOrders([]);
        setStatus('empty');
        return;
      }

      setStatus('loading');
      try {
        const data = await apiCustomerOrders(orderIds);
        if (!mounted) return;
        setOrders(Array.isArray(data) ? data : []);
        setStatus('success');
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load your orders.');
        setStatus('error');
      }
    }

    loadOrders();
    return () => {
      mounted = false;
    };
  }, [orderIds]);

  return (
    <section className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">Orders</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-['Playfair_Display'] text-[#0f4d2e]">My orders</h2>
          <p className="mt-3 max-w-2xl text-sm sm:text-base text-[#5e6f65]">
            Track your recent Belfiore orders and check the latest delivery updates.
          </p>
        </div>
        <Link
          to="/shop"
          className="inline-flex items-center justify-center rounded-full border border-[#0b7a3c] px-5 py-3 text-xs uppercase tracking-[0.3em] text-[#0b7a3c] transition hover:bg-[#0b7a3c] hover:text-white"
        >
          Continue shopping
        </Link>
      </div>

      <div className="mt-8">
        {status === 'loading' ? (
          <div className="rounded-3xl border border-[#e1e7dc] bg-white p-10 text-center text-sm text-[#5e6f65]">
            Loading your orders...
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="rounded-3xl border border-[#ead3d3] bg-white p-10 text-center text-sm text-[#8b4a4a]">
            {error}
          </div>
        ) : null}

        {status === 'empty' ? (
          <div className="rounded-3xl border border-dashed border-[#c7d0c3] bg-white p-10 text-center">
            <h3 className="text-2xl font-['Playfair_Display'] text-[#0f4d2e]">No orders yet</h3>
            <p className="mt-3 text-sm text-[#5e6f65]">
              Once you place an order, it will appear here with tracking details.
            </p>
          </div>
        ) : null}

        {status === 'success' ? (
          <div className="space-y-5">
            {orders.map((order) => (
              <article
                key={order.id}
                className="rounded-3xl border border-[#e1e7dc] bg-white p-6 shadow-[0_20px_40px_rgba(15,77,46,0.06)]"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">{order.orderCode}</p>
                    <h3 className="mt-2 text-2xl font-['Playfair_Display'] text-[#0f4d2e]">{order.customerName}</h3>
                    <p className="mt-2 text-sm text-[#5e6f65]">Placed on {formatDate(order.createdAt)}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.status)}`}>
                      {order.status}
                    </span>
                    <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </span>
                    <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.trackingStatus)}`}>
                      {order.trackingStatus}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 rounded-2xl bg-[#f7f5f0] p-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[#5e6f65]">Courier</p>
                    <p className="mt-2 text-sm font-medium text-[#0f4d2e]">{order.courierName || 'Waiting for assignment'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[#5e6f65]">Tracking Code</p>
                    <p className="mt-2 text-sm font-medium text-[#0f4d2e]">{order.trackingCode || 'Not available yet'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[#5e6f65]">Items</p>
                    <p className="mt-2 text-sm font-medium text-[#0f4d2e]">{order.itemCount} item{order.itemCount === 1 ? '' : 's'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[#5e6f65]">Total</p>
                    <p className="mt-2 text-sm font-medium text-[#0f4d2e]">{formatPrice(order.totalAmount)}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[#e9ece5] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-[#5e6f65]">Latest update</p>
                    <p className="text-sm font-medium text-[#0f4d2e]">{formatDate(order.statusUpdatedAt || order.updatedAt)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.items.map((item) => (
                      <span key={item.id} className="rounded-full bg-[#eef2ea] px-3 py-1 text-xs text-[#355441]">
                        {item.productName} x {item.qty}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
