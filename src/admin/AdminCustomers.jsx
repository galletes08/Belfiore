import { useEffect, useMemo, useState } from 'react';
import { apiAdminCustomers } from '../api/client';

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

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadCustomers() {
      setLoading(true);
      try {
        const data = await apiAdminCustomers();
        if (!mounted) return;
        setCustomers(Array.isArray(data) ? data : []);
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load customers');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCustomers();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((customer) =>
      [customer.fullName, customer.email, customer.role]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [customers, search]);

  const totalCustomers = customers.length;
  const recentCustomers = customers.filter((customer) => {
    const created = new Date(customer.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    const daysAgo = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= 30;
  }).length;

  const latestCustomer = customers[0] || null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(220,252,231,0.9),_transparent_28%),linear-gradient(180deg,#f5faf7_0%,#eef5f1_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="bg-[linear-gradient(135deg,#0f4d2e_0%,#137a46_42%,#ecfdf5_100%)] px-6 py-6 text-white sm:px-8 sm:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/90">Customer Accounts</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">View customers as they sign up</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/90 sm:text-base">
              This page shows every customer account created in the system, along with the signup time.
            </p>
          </div>

          <div className="grid gap-3 border-b border-gray-100 bg-white px-6 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-8">
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Customers</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{totalCustomers}</p>
              <p className="mt-1 text-sm text-gray-500">Registered customer accounts</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Last 30 Days</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">{recentCustomers}</p>
              <p className="mt-1 text-sm text-gray-500">Recently created accounts</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Latest Account</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{latestCustomer?.fullName || 'No customers yet'}</p>
              <p className="mt-1 text-sm text-gray-500">{latestCustomer ? formatDateTime(latestCustomer.createdAt) : 'Waiting for first signup'}</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Search</p>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or email"
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/20"
              />
            </article>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading customers...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No customer accounts found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="px-5 py-4 text-sm font-semibold text-gray-600">Customer</th>
                    <th className="px-5 py-4 text-sm font-semibold text-gray-600">Email</th>
                    <th className="px-5 py-4 text-sm font-semibold text-gray-600">Role</th>
                    <th className="px-5 py-4 text-sm font-semibold text-gray-600">Created</th>
                    <th className="px-5 py-4 text-sm font-semibold text-gray-600">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b border-gray-100 transition-colors hover:bg-emerald-50/40">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{customer.fullName}</div>
                        <div className="mt-1 text-xs text-gray-500">ID #{customer.id}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-700">{customer.email || '-'}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                          {customer.role || 'customer'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{formatDateTime(customer.createdAt)}</td>
                      <td className="px-5 py-4 text-gray-600">{formatDateTime(customer.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
