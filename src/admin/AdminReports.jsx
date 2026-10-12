import { useEffect, useMemo, useState } from 'react';
import { apiAdminCustomers, apiAdminOrders, apiAdminRiders, apiDashboard } from '../api/client';

const statusLabelMap = {
  Pending: 'Pending',
  Preparing: 'Preparing',
  'Cancellation Requested': 'Cancellation Requested',
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
  const [salesPeriod, setSalesPeriod] = useState('month');
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));

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
        setOrders(Array.isArray(ordersData) ? ordersData.filter(Boolean) : []);
        setRiders(Array.isArray(ridersData) ? ridersData.filter(Boolean) : []);
        setCustomers(Array.isArray(customersData) ? customersData.filter(Boolean).map(normalizeCustomer) : []);

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
      'Cancellation Requested': 0,
      'Out for Delivery': 0,
      Delivered: 0,
      Cancelled: 0,
    };

    for (const order of orders) {
      if (counts[order?.status] != null) counts[order.status] += 1;
    }

    return counts;
  }, [orders]);

  const activeRiders = riders.filter((rider) => Boolean(rider?.isAvailable)).length;
  const inactiveRiders = riders.filter((rider) => !rider?.isAvailable).length;
  const customerGrowth = customers.filter((customer) => {
    const created = new Date(customer.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    const ageDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays <= 30;
  }).length;

  const bestSellingSeries = useMemo(() => {
    const grouped = new Map();
    const safeOrders = Array.isArray(orders) ? orders : [];

    safeOrders
      .filter((order) => order?.status === 'Delivered')
      .forEach((order) => {
        const date = new Date(order.createdAt || order.created_at);
        if (Number.isNaN(date.getTime())) return;
        if (String(date.getFullYear()) !== selectedYear) return;
        if (salesPeriod === 'month' && String(date.getMonth() + 1) !== selectedMonth) return;
        const periodKey = salesPeriod === 'year'
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const periodLabel = salesPeriod === 'year'
          ? date.toLocaleDateString([], { month: 'short' })
          : date.toLocaleDateString([], { day: 'numeric' });
        const products = grouped.get(periodKey)?.products || new Map();

        (Array.isArray(order.items) ? order.items : []).forEach((item) => {
          if (!item) return;
          const name = String(item.productName || item.product_name || 'Unknown product');
          products.set(name, (products.get(name) || 0) + (Number(item.qty) || 0));
        });
        grouped.set(periodKey, { label: periodLabel, products });
      });

    return [...grouped.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([, entry]) => {
        const best = [...entry.products.entries()].sort(([, firstQty], [, secondQty]) => secondQty - firstQty)[0];
        return { label: entry.label, product: best?.[0] || 'No product sales', quantity: best?.[1] || 0 };
      })
      .slice(-12);
  }, [orders, salesPeriod, selectedMonth, selectedYear]);

  const chartMax = Math.max(...bestSellingSeries.map((entry) => entry.quantity), 1);
  const chartPoints = bestSellingSeries.map((entry, index) => {
    const x = 12 + (index / Math.max(bestSellingSeries.length - 1, 1)) * 376;
    const y = 102 - (entry.quantity / chartMax) * 78;
    return { ...entry, x, y };
  });
  const chartLine = chartPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');

  const salesSeries = useMemo(() => {
    const totals = new Map();
    orders.filter((order) => order?.status === 'Delivered').forEach((order) => {
      const date = new Date(order.createdAt || order.created_at);
      if (Number.isNaN(date.getTime()) || String(date.getFullYear()) !== selectedYear) return;
      if (salesPeriod === 'month' && String(date.getMonth() + 1) !== selectedMonth) return;
      const key = salesPeriod === 'year'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const label = salesPeriod === 'year' ? date.toLocaleDateString([], { month: 'short' }) : date.toLocaleDateString([], { day: 'numeric' });
      const entry = totals.get(key) || { label, value: 0 };
      entry.value += Number(order.totalAmount || order.total_amount) || 0;
      totals.set(key, entry);
    });
    return [...totals.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([, entry]) => entry);
  }, [orders, salesPeriod, selectedMonth, selectedYear]);
  const salesMax = Math.max(...salesSeries.map((entry) => entry.value), 1);
  const salesPoints = salesSeries.map((entry, index) => ({ ...entry, x: 12 + (index / Math.max(salesSeries.length - 1, 1)) * 376, y: 102 - (entry.value / salesMax) * 78 }));
  const salesLine = salesPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');

  const productSalesTotals = useMemo(() => {
    const totals = new Map();
    orders
      .filter((order) => order?.status === 'Delivered')
      .forEach((order) => {
        const date = new Date(order.createdAt || order.created_at);
        if (Number.isNaN(date.getTime()) || String(date.getFullYear()) !== selectedYear) return;
        if (salesPeriod === 'month' && String(date.getMonth() + 1) !== selectedMonth) return;
        (Array.isArray(order.items) ? order.items : []).forEach((item) => {
          if (!item) return;
          const name = String(item.productName || item.product_name || 'Unknown product');
          totals.set(name, (totals.get(name) || 0) + (Number(item.qty) || 0));
        });
      });
    return [...totals.entries()]
      .map(([product, quantity]) => ({ product, quantity }))
      .sort((first, second) => second.quantity - first.quantity || first.product.localeCompare(second.product));
  }, [orders, salesPeriod, selectedMonth, selectedYear]);

  const availableYears = useMemo(() => {
    const years = new Set(orders.filter((order) => order?.status === 'Delivered').map((order) => {
      const date = new Date(order.createdAt || order.created_at);
      return Number.isNaN(date.getTime()) ? null : String(date.getFullYear());
    }).filter(Boolean));
    years.add(String(new Date().getFullYear()));
    return [...years].sort((first, second) => Number(second) - Number(first));
  }, [orders]);

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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Best-Selling Product</h2>
                  <p className="mt-1 text-sm text-gray-500">Top product by units sold from delivered orders.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-emerald-600">
                    {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                  {salesPeriod === 'month' ? (
                    <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-emerald-600">
                      {Array.from({ length: 12 }, (_, index) => (
                        <option key={index + 1} value={String(index + 1)}>{new Date(2000, index, 1).toLocaleDateString([], { month: 'long' })}</option>
                      ))}
                    </select>
                  ) : null}
                  <div className="flex rounded-xl bg-gray-100 p-1">
                  {['month', 'year'].map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setSalesPeriod(period)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${salesPeriod === period ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      {period}
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-500">Loading reports...</div>
            ) : (
              <div className="px-6 py-6 sm:px-8">
                {bestSellingSeries.length === 0 && salesSeries.length === 0 ? (
                  <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
                    No delivered product sales yet.
                  </div>
                ) : (
                  <>
                    <div className="border-b border-gray-100 pb-6">
                      <h3 className="mb-3 text-sm font-bold text-gray-900">Sales Performance</h3>
                      {salesSeries.length === 0 ? <div className="flex h-40 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-500">No sales for this period.</div> : (
                        <svg viewBox="0 0 400 150" className="h-56 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Sales performance">
                          <defs><linearGradient id="reportsRevenueGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1f5a43" stopOpacity="0.25" /><stop offset="100%" stopColor="#1f5a43" stopOpacity="0.02" /></linearGradient></defs>
                          {[24, 50, 76, 102].map((y) => <line key={y} x1="12" x2="388" y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 4" />)}
                          <path d={`${salesLine} L ${salesPoints.at(-1)?.x || 388} 110 L ${salesPoints[0]?.x || 12} 110 Z`} fill="url(#reportsRevenueGradient)" />
                          <path d={salesLine} fill="none" stroke="#1f5a43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                          {salesPoints.map((point, index) => <g key={`${point.label}-${index}`}><circle cx={point.x} cy={point.y} r="4.5" fill="white" stroke="#1f5a43" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><text x={point.x} y="135" textAnchor="middle" fill="#64748b" fontSize="9">{point.label}</text></g>)}
                        </svg>
                      )}
                      <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-3"><span className="text-xs text-gray-500">Highest sales in this period</span><span className="text-sm font-bold text-emerald-700">{formatCurrency(salesMax === 1 && salesSeries.every((entry) => !Number(entry.value)) ? 0 : salesMax)}</span></div>
                    </div>
                    <h3 className="mb-3 pt-1 text-sm font-bold text-gray-900">Best-Selling Product</h3>
                    <div className="h-64 w-full">
                      <svg viewBox="0 0 400 150" className="h-full w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Best-selling product units by period">
                        <defs><linearGradient id="reportsSalesGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1f5a43" stopOpacity="0.25" /><stop offset="100%" stopColor="#1f5a43" stopOpacity="0.02" /></linearGradient></defs>
                        {[24, 50, 76, 102].map((y) => <line key={y} x1="12" x2="388" y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 4" />)}
                        <path d={`${chartLine} L ${chartPoints.at(-1)?.x || 388} 110 L ${chartPoints[0]?.x || 12} 110 Z`} fill="url(#reportsSalesGradient)" />
                        <path d={chartLine} fill="none" stroke="#1f5a43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        {chartPoints.map((point) => (
                          <g key={`${point.label}-${point.product}`}>
                            <circle cx={point.x} cy={point.y} r="4.5" fill="white" stroke="#1f5a43" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                            <text x={point.x} y="135" textAnchor="middle" fill="#64748b" fontSize="9">{point.label}</text>
                          </g>
                        ))}
                      </svg>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {bestSellingSeries.slice(-4).map((entry) => (
                        <div key={`${entry.label}-${entry.product}`} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-xs">
                          <span className="truncate pr-3 text-gray-600">{entry.label}: <span className="font-semibold text-gray-900">{entry.product}</span></span>
                          <span className="shrink-0 font-semibold text-emerald-700">{entry.quantity} sold</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900">Product Sales</h3>
                        <span className="text-xs text-gray-500">All delivered orders</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {productSalesTotals.map((entry) => (
                          <div key={entry.product} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-sm">
                            <span className="truncate pr-3 font-medium text-gray-700">{entry.product}</span>
                            <span className="shrink-0 font-bold text-emerald-700">{entry.quantity} sold</span>
                          </div>
                        ))}
                        {productSalesTotals.length === 0 ? <p className="text-sm text-gray-500">No delivered product sales yet.</p> : null}
                      </div>
                    </div>
                  </>
                )}
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
                    {dashboard.recentOrders.filter(Boolean).map((order) => (
                      <tr key={order.id} className="border-b border-gray-100 hover:bg-emerald-50/40">
                        <td className="px-5 py-3 font-medium text-gray-900">#{order.id}</td>
                        <td className="px-5 py-3 text-gray-700">{order.customer || '-'}</td>
                        <td className="px-5 py-3 text-gray-600">{formatDateTime(order.date)}</td>
                        <td className="px-5 py-3 text-gray-700">{order.status || '-'}</td>
                        <td className="px-5 py-3 text-gray-700">{formatCurrency(order.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </section>
      </div>
    </div>
  );
}
