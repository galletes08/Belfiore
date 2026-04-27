import { useEffect, useMemo, useState } from 'react';
import { apiAdminCustomers, apiAdminOrders, apiAdminRiders, apiDashboard } from '../api/client';

const statusLabelMap = {
  Pending: 'Pending',
  Preparing: 'Preparing',
  'Out for Delivery': 'Out for Delivery',
  Delivered: 'Delivered',
  Cancelled: 'Cancelled',
};

const tagStyles = {
  white: 'bg-gray-100 text-gray-700 ring-gray-200',
  green: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  red: 'bg-rose-100 text-rose-700 ring-rose-200',
  aquaponics: 'bg-amber-100 text-amber-800 ring-amber-200',
  unassigned: 'bg-slate-100 text-slate-700 ring-slate-200',
};

function normalizeCustomer(customer) {
  const firstName = String(customer?.firstName || customer?.first_name || '').trim();
  const lastName = String(customer?.lastName || customer?.last_name || '').trim();
  const fullName =
    String(customer?.fullName || customer?.full_name || `${firstName} ${lastName}` || customer?.email || 'Customer').trim() ||
    'Customer';

  return {
    ...customer,
    firstName,
    lastName,
    fullName,
    email: String(customer?.email || '').trim(),
    createdAt: customer?.createdAt || customer?.created_at || null,
    updatedAt: customer?.updatedAt || customer?.updated_at || null,
  };
}

function normalizeLowStockItem(item) {
  const tagKey = String(item?.tag_key || item?.tagKey || item?.tag || '').trim().toLowerCase() || 'unassigned';
  const tagLabel = String(item?.tag_label || item?.tagLabel || item?.name || item?.tag || 'Tag').trim() || 'Tag';

  return {
    ...item,
    tag_key: tagKey,
    tag_label: tagLabel,
    product_count: Number(item?.product_count ?? item?.productCount ?? 0) || 0,
    qty: Number(item?.qty ?? item?.stock ?? 0) || 0,
  };
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatDateTime(value) {
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

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState({ salesData: [], lowStock: [], recentOrders: [], totals: {} });
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function loadReports() {
      setLoading(true);
      try {
        const [dashboardResult, ordersResult, ridersResult, customersResult] = await Promise.allSettled([
          apiDashboard(),
          apiAdminOrders(),
          apiAdminRiders(),
          apiAdminCustomers(),
        ]);

        if (!mounted) return;

        const dashboardData = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null;
        const ordersData = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
        const ridersData = ridersResult.status === 'fulfilled' ? ridersResult.value : [];
        const customersData = customersResult.status === 'fulfilled' ? customersResult.value : [];

        setDashboard({
          salesData: Array.isArray(dashboardData?.salesData) ? dashboardData.salesData : [],
          lowStock: Array.isArray(dashboardData?.lowStock) ? dashboardData.lowStock.map(normalizeLowStockItem) : [],
          recentOrders: Array.isArray(dashboardData?.recentOrders) ? dashboardData.recentOrders : [],
          totals: dashboardData?.totals || {},
        });
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setRiders(Array.isArray(ridersData) ? ridersData : []);
        setCustomers(Array.isArray(customersData) ? customersData.map(normalizeCustomer) : []);

        const failures = [
          dashboardResult,
          ordersResult,
          ridersResult,
          customersResult,
        ].filter((result) => result.status === 'rejected');
        setError(
          failures.length > 0
            ? failures.map((result) => result.reason?.message || 'One section failed to load').join(' ')
            : ''
        );
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load reports');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadReports();
    return () => {
      mounted = false;
    };
  }, []);

  const orderCounts = useMemo(() => {
    const counts = {
      Pending: 0,
      Preparing: 0,
      'Out for Delivery': 0,
      Delivered: 0,
      Cancelled: 0,
    };

    for (const order of orders) {
      if (counts[order.status] != null) counts[order.status] += 1;
    }

    return counts;
  }, [orders]);

  const activeRiders = riders.filter((rider) => rider.isAvailable).length;
  const inactiveRiders = riders.filter((rider) => !rider.isAvailable).length;
  const customerGrowth = customers.filter((customer) => {
    const created = new Date(customer.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    const ageDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays <= 30;
  }).length;

  const topSalesMonth = dashboard.salesData.reduce(
    (best, item) => (Number(item.value) > Number(best?.value || 0) ? item : best),
    null
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(220,252,231,0.9),_transparent_28%),linear-gradient(180deg,#f5faf7_0%,#eef5f1_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="bg-[linear-gradient(135deg,#0f4d2e_0%,#137a46_42%,#ecfdf5_100%)] px-6 py-6 text-white sm:px-8 sm:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/90">Reports</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Business overview</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/90 sm:text-base">
              A quick snapshot of sales, orders, riders, customers, and low-stock products.
            </p>
          </div>

          <div className="grid gap-3 border-b border-gray-100 bg-white px-6 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-8">
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">This Month Sales</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(dashboard.totals?.monthlySales)}</p>
              <p className="mt-1 text-sm text-gray-500">Sales from the current month</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">This Month Orders</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">{dashboard.totals?.monthlyOrders || 0}</p>
              <p className="mt-1 text-sm text-gray-500">Orders placed this month</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Customers</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{customers.length}</p>
              <p className="mt-1 text-sm text-gray-500">{customerGrowth} joined in the last 30 days</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Riders</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{riders.length}</p>
              <p className="mt-1 text-sm text-gray-500">{activeRiders} available, {inactiveRiders} busy or inactive</p>
            </article>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="border-b border-gray-100 px-6 py-5 sm:px-8">
              <h2 className="text-xl font-bold text-gray-900">Sales Trend</h2>
              <p className="mt-1 text-sm text-gray-500">Monthly revenue trend from the dashboard data.</p>
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-500">Loading reports...</div>
            ) : (
              <div className="px-6 py-6 sm:px-8">
                <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
                  <span>Trend</span>
                  <span>{topSalesMonth ? `${topSalesMonth.month} best month` : 'No sales yet'}</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-[#f8fbf8] p-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {dashboard.salesData.map((item) => {
                      const value = Number(item.value) || 0;
                      const maxValue = Math.max(...dashboard.salesData.map((entry) => Number(entry.value) || 0), 1);
                      const barWidth = `${Math.max(12, (value / maxValue) * 100)}%`;

                      return (
                        <div key={item.month} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-700">{item.month}</p>
                            <p className="text-sm font-semibold text-emerald-700">{formatCurrency(value)}</p>
                          </div>
                          <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f4d2e_0%,#16a34a_100%)]" style={{ width: barWidth }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="border-b border-gray-100 px-6 py-5 sm:px-8">
                <h2 className="text-xl font-bold text-gray-900">Order Status Breakdown</h2>
              </div>
              <div className="grid gap-3 px-6 py-6 sm:px-8">
                {Object.entries(orderCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                    <span className="text-sm font-medium text-gray-700">{statusLabelMap[status] || status}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-gray-900 ring-1 ring-gray-200">{count}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="border-b border-gray-100 px-6 py-5 sm:px-8">
                <h2 className="text-xl font-bold text-gray-900">Low Stock</h2>
              </div>
              {dashboard.lowStock.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">No tags are currently at low stock.</div>
              ) : (
                <div className="grid gap-3 px-6 py-6 sm:px-8">
                  {dashboard.lowStock.map((item) => (
                    <div key={item.tag_key || item.tag_label} className="flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3">
                      <div>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tagStyles[item.tag_key] || tagStyles.unassigned}`}>
                          {item.tag_label || item.tag_key || 'Tag'}
                        </span>
                        <p className="mt-2 text-sm font-medium text-gray-900">{item.qty} total stock</p>
                        <p className="text-xs text-gray-500">{item.product_count} product(s) in this tag</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="border-b border-gray-100 px-6 py-5 sm:px-8">
              <h2 className="text-xl font-bold text-gray-900">Recent Orders</h2>
            </div>
            {dashboard.recentOrders.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No recent orders yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <th className="px-5 py-3 text-sm font-semibold text-gray-600">Order</th>
                      <th className="px-5 py-3 text-sm font-semibold text-gray-600">Customer</th>
                      <th className="px-5 py-3 text-sm font-semibold text-gray-600">Date</th>
                      <th className="px-5 py-3 text-sm font-semibold text-gray-600">Status</th>
                      <th className="px-5 py-3 text-sm font-semibold text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recentOrders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-100 hover:bg-emerald-50/40">
                        <td className="px-5 py-3 font-medium text-gray-900">#{order.id}</td>
                        <td className="px-5 py-3 text-gray-700">{order.customer}</td>
                        <td className="px-5 py-3 text-gray-600">{formatDateTime(order.date)}</td>
                        <td className="px-5 py-3 text-gray-700">{order.status}</td>
                        <td className="px-5 py-3 text-gray-700">{formatCurrency(order.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="border-b border-gray-100 px-6 py-5 sm:px-8">
              <h2 className="text-xl font-bold text-gray-900">Customer Snapshot</h2>
            </div>
            <div className="grid gap-3 px-6 py-6 sm:px-8">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Newest Account</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{customers[0]?.fullName || 'No customer accounts yet'}</p>
                <p className="mt-1 text-sm text-gray-500">{customers[0] ? formatDateTime(customers[0].createdAt) : 'Waiting for signups'}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Signup Window</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{customerGrowth} new customer(s) in the last 30 days</p>
                <p className="mt-1 text-sm text-gray-500">Based on customer account creation dates</p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Active Riders</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{activeRiders} available out of {riders.length}</p>
                <p className="mt-1 text-sm text-gray-500">Useful for dispatch planning</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
