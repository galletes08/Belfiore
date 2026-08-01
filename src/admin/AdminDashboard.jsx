import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, PackageCheck, ReceiptText, ShoppingBag, TrendingUp } from 'lucide-react';
import { apiDashboard } from '../api/client';

const statusStyles = {
  shipped: 'bg-blue-50 text-blue-700 ring-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  processing: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending: 'bg-orange-50 text-orange-700 ring-orange-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const tagStyles = {
  white: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-rose-100 text-rose-700',
  aquaponics: 'bg-cyan-100 text-cyan-800',
  unassigned: 'bg-slate-100 text-slate-700',
};

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });

function formatCurrency(value) {
  return currency.format(Number(value) || 0).replace('PHP', '₱');
}

export default function AdminDashboard() {
  const [salesData, setSalesData] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [totals, setTotals] = useState({ monthlySales: 0, monthlyOrders: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    apiDashboard()
      .then((data) => {
        if (!mounted) return;
        setSalesData(Array.isArray(data.salesData) ? data.salesData : []);
        setLowStock(Array.isArray(data.lowStock) ? data.lowStock : []);
        setRecentOrders(Array.isArray(data.recentOrders) ? data.recentOrders : []);
        setTotals({ monthlySales: Number(data.totals?.monthlySales) || 0, monthlyOrders: Number(data.totals?.monthlyOrders) || 0 });
        setError('');
      })
      .catch((err) => { if (mounted) setError(err.message || 'Failed to load dashboard'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const maxSales = useMemo(() => Math.max(...salesData.map((item) => Number(item.value) || 0), 1), [salesData]);
  const chartPoints = useMemo(() => salesData.map((item, index) => {
    const x = 12 + (index / Math.max(salesData.length - 1, 1)) * 376;
    const y = 102 - ((Number(item.value) || 0) / maxSales) * 78;
    return { ...item, x, y };
  }), [salesData, maxSales]);
  const linePath = chartPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const averageOrder = totals.monthlyOrders ? totals.monthlySales / totals.monthlyOrders : 0;
  const lowStockUnits = lowStock.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  const stats = [
    { label: 'Monthly sales', value: formatCurrency(totals.monthlySales), note: 'Revenue this month', icon: <TrendingUp size={20} />, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Monthly orders', value: totals.monthlyOrders, note: 'Orders received', icon: <ShoppingBag size={20} />, tone: 'bg-blue-100 text-blue-700' },
    { label: 'Average order', value: formatCurrency(averageOrder), note: 'Per transaction', icon: <ReceiptText size={20} />, tone: 'bg-violet-100 text-violet-700' },
    { label: 'Low-stock units', value: lowStockUnits, note: `${lowStock.length} tag${lowStock.length === 1 ? '' : 's'} need attention`, icon: <PackageCheck size={20} />, tone: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Business overview</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">A quick look at sales, orders, and inventory health.</p>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, note, icon, tone }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{loading ? '—' : value}</p></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</span></div>
            <p className="mt-2 text-xs text-slate-500">{note}</p>
          </article>
        ))}
      </section>

      <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Sales performance</h2><p className="mt-1 text-sm text-slate-500">Revenue trend across the last six months</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Last 6 months</span></div>

          <div className="mt-6 h-64 w-full">
            {loading ? <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading sales data...</div> : chartPoints.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No sales data available.</div> : (
              <svg viewBox="0 0 400 150" className="h-full w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Sales for the last six months">
                <defs><linearGradient id="dashboardSalesGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1f5a43" stopOpacity="0.25" /><stop offset="100%" stopColor="#1f5a43" stopOpacity="0.02" /></linearGradient></defs>
                {[24, 50, 76, 102].map((y) => <line key={y} x1="12" x2="388" y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 4" />)}
                <path d={`${linePath} L ${chartPoints.at(-1)?.x || 388} 110 L ${chartPoints[0]?.x || 12} 110 Z`} fill="url(#dashboardSalesGradient)" />
                <path d={linePath} fill="none" stroke="#1f5a43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {chartPoints.map((point, index) => <g key={`${point.month}-${index}`}><circle cx={point.x} cy={point.y} r="4.5" fill="white" stroke="#1f5a43" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><text x={point.x} y="135" textAnchor="middle" fill="#64748b" fontSize="9">{point.month}</text></g>)}
              </svg>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Highest month in this period</p><p className="text-sm font-bold text-emerald-700">{formatCurrency(maxSales === 1 && salesData.every((item) => !Number(item.value)) ? 0 : maxSales)}</p></div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><AlertTriangle size={20} /></span><div><h2 className="text-lg font-bold text-slate-900">Stock alerts</h2><p className="mt-1 text-sm text-slate-500">Tags at or below five units</p></div></div>
          {lowStock.length === 0 ? <div className="mt-6 rounded-2xl bg-emerald-50 p-5 text-center"><PackageCheck className="mx-auto text-emerald-600" size={26} /><p className="mt-2 text-sm font-semibold text-emerald-800">Stock levels look healthy</p></div> : (
            <div className="mt-5 space-y-3">{lowStock.map((item, index) => <div key={item.tag_key || index} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tagStyles[item.tag_key] || tagStyles.unassigned}`}>{item.tag_label || 'Unassigned'}</span><span className="text-lg font-bold text-slate-900">{item.qty}</span></div><div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{item.product_count} product{Number(item.product_count) === 1 ? '' : 's'}</span><span>units left</span></div></div>)}</div>
          )}
        </aside>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="text-lg font-bold text-slate-900">Recent orders</h2><p className="mt-1 text-sm text-slate-500">Latest customer transactions</p></div><ArrowUpRight size={19} className="text-slate-400" /></div>
        {recentOrders.length === 0 ? <div className="p-12 text-center"><ReceiptText className="mx-auto text-slate-300" size={30} /><p className="mt-3 text-sm font-semibold text-slate-700">No recent orders</p><p className="mt-1 text-xs text-slate-500">New orders will appear here.</p></div> : (
          <>
            <div className="divide-y divide-slate-100 md:hidden">{recentOrders.map((order) => <article key={order.id} className="p-5"><div className="flex items-start justify-between"><div><p className="font-semibold text-slate-900">{order.customer}</p><p className="mt-1 text-xs text-slate-500">Order #{String(order.id).replace('#', '')} · {new Date(order.date).toLocaleDateString()}</p></div><p className="font-bold text-slate-900">{formatCurrency(order.total)}</p></div><span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyles[String(order.status).toLowerCase()] || 'bg-slate-50 text-slate-700 ring-slate-200'}`}>{order.status}</span></article>)}</div>
            <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead><tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><th className="px-6 py-4 font-semibold">Order</th><th className="px-6 py-4 font-semibold">Customer</th><th className="px-6 py-4 font-semibold">Date</th><th className="px-6 py-4 font-semibold">Status</th><th className="px-6 py-4 text-right font-semibold">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{recentOrders.map((order) => <tr key={order.id} className="transition hover:bg-slate-50"><td className="px-6 py-4 font-semibold text-slate-800">#{String(order.id).replace('#', '')}</td><td className="px-6 py-4 text-slate-700">{order.customer}</td><td className="px-6 py-4 text-slate-500">{new Date(order.date).toLocaleDateString()}</td><td className="px-6 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyles[String(order.status).toLowerCase()] || 'bg-slate-50 text-slate-700 ring-slate-200'}`}>{order.status}</span></td><td className="px-6 py-4 text-right font-bold text-slate-900">{formatCurrency(order.total)}</td></tr>)}</tbody></table></div>
          </>
        )}
      </section>
    </div>
  );
}
