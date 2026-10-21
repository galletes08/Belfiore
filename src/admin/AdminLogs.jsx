import NotificationBell from './NotificationBell';
import { createElement, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  UserRound,
} from 'lucide-react';
import { apiAdminLogs } from '../api/client';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'order', label: 'Orders' },
  { value: 'payment', label: 'Payments' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'account', label: 'Accounts' },
  { value: 'security', label: 'Authentication Security' },
];

const iconByType = { order: ShoppingCart, payment: CircleDollarSign, delivery: Truck, inventory: Package, account: UserRound };
const toneByType = {
  order: 'bg-blue-50 text-blue-700 ring-blue-100',
  payment: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  delivery: 'bg-violet-50 text-violet-700 ring-violet-100',
  inventory: 'bg-amber-50 text-amber-700 ring-amber-100',
  account: 'bg-slate-100 text-slate-700 ring-slate-200',
};

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-PH', { timeZone:'Asia/Manila',month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })+' PHT';
}

function formatAmount(value) {
  if (value == null || value === '') return '-';
  return `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function downloadCsv(logs) {
  const headers = ['Time', 'Type', 'Action', 'Entity', 'Actor', 'Description', 'Status', 'Amount'];
  const rows = logs.map((log) => [log.occurred_at, log.event_type, log.action, `${log.entity} #${log.entity_id}`, log.actor, log.description, log.status || '', log.amount ?? '']);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `belfiore-system-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await apiAdminLogs();
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setLastUpdated(data?.generatedAt || new Date().toISOString());
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load system logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, []);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (type !== 'all' && log.event_type !== type) return false;
      if (!query) return true;
      return [log.action, log.entity, log.entity_id, log.actor, log.description, log.status].join(' ').toLowerCase().includes(query);
    });
  }, [logs, search, type]);

  const counts = useMemo(() => logs.reduce((result, log) => ({ ...result, [log.event_type]: (result[log.event_type] || 0) + 1 }), {}), [logs]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Operations & audit trail</p>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-4"><div className="min-w-0"><h1 className="text-3xl font-bold tracking-tight text-slate-900">System logs</h1></div><div className="shrink-0"><NotificationBell /></div></div>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Monitor orders, payments, delivery updates, inventory changes, and customer activity from one timeline.</p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => downloadCsv(filteredLogs)} disabled={!filteredLogs.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Download size={16} /> Export CSV</button>
          <button type="button" onClick={loadLogs} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#1f5a43] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#163f2f] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={loading ? 'animate-spin' : ''} size={16} /> Refresh</button>
        </div>
      </header>

      {error ? <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={17} /> {error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[['Total events', logs.length, Activity], ['Orders', counts.order || 0, ShoppingCart], ['Payments', counts.payment || 0, CircleDollarSign], ['Delivery', counts.delivery || 0, Truck], ['Inventory', counts.inventory || 0, Package]].map(([label, value, Icon]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>{createElement(Icon, { size: 18, className: 'text-emerald-700' })}</div><p className="mt-3 text-2xl font-bold text-slate-900">{loading ? '—' : value}</p><p className="mt-1 text-xs text-slate-500">Live from system records</p></article>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div><h2 className="text-lg font-bold text-slate-900">Activity timeline</h2><p className="mt-1 text-xs text-slate-500">{lastUpdated ? `Last synced ${formatDate(lastUpdated)}` : 'Loading latest activity...'}</p></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto"><label className="relative min-w-[220px] flex-1 sm:flex-none"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search logs" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-600" /></label><select value={type} onChange={(event) => setType(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-600">{TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        </div>

        {loading ? <div className="p-14 text-center text-sm text-slate-500">Loading system activity...</div> : filteredLogs.length === 0 ? <div className="p-14 text-center"><CheckCircle2 className="mx-auto text-emerald-500" size={30} /><p className="mt-3 text-sm font-semibold text-slate-800">No matching activity</p><p className="mt-1 text-xs text-slate-500">Try another category or search term.</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead><tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><th className="px-6 py-3 font-semibold">Event</th><th className="px-6 py-3 font-semibold">Activity</th><th className="px-6 py-3 font-semibold">Actor</th><th className="px-6 py-3 font-semibold">Status</th><th className="px-6 py-3 font-semibold">Time</th><th className="px-6 py-3 text-right font-semibold">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredLogs.map((log) => { const Icon = iconByType[log.event_type] || Activity; return <tr key={log.event_id} className="transition hover:bg-slate-50"><td className="px-6 py-4"><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl ring-1 ${toneByType[log.event_type] || 'bg-slate-50 text-slate-600 ring-slate-200'}`}><Icon size={16} /></span><div><p className="font-semibold text-slate-900">{log.action}</p><p className="mt-0.5 text-xs text-slate-500">{log.entity} #{log.entity_id}</p></div></div></td><td className="max-w-[320px] px-6 py-4"><p className="truncate text-slate-700" title={log.description}>{log.description}</p></td><td className="px-6 py-4 text-slate-600">{log.actor || 'System'}</td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{log.status || 'Recorded'}</span></td><td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">{formatDate(log.occurred_at)}</td><td className="px-6 py-4 text-right font-semibold text-slate-800">{formatAmount(log.amount)}</td></tr>; })}</tbody></table></div>
        )}
        {!loading && filteredLogs.length > 0 ? <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">Showing {filteredLogs.length} of {logs.length} events</div> : null}
      </section>
    </div>
  );
}
