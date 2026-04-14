import { useEffect, useMemo, useState } from 'react';
import { apiAdminRiders, apiCreateRider, apiUpdateRider } from '../api/client';

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  status: 'active',
  isAvailable: true,
};

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

export default function AdminRiders() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [selectedRider, setSelectedRider] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadRiders() {
      setLoading(true);
      try {
        const data = await apiAdminRiders();
        if (!mounted) return;
        setRiders(Array.isArray(data) ? data : []);
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load riders');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadRiders();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredRiders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return riders;

    return riders.filter((rider) =>
      [rider.fullName, rider.email, rider.phone, rider.status, rider.isAvailable ? 'available' : 'busy']
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [riders, search]);

  function openCreateForm() {
    setSelectedRider(null);
    setForm(emptyForm);
    setError('');
  }

  function openEditForm(rider) {
    setSelectedRider(rider);
    setForm({
      firstName: rider.firstName || '',
      lastName: rider.lastName || '',
      email: rider.email || '',
      password: '',
      phone: rider.phone || '',
      status: rider.status || 'active',
      isAvailable: Boolean(rider.isAvailable),
    });
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        phone: form.phone,
        status: form.status,
        isAvailable: form.isAvailable,
      };

      if (selectedRider) {
        const updated = await apiUpdateRider(selectedRider.id, payload);
        setRiders((current) => current.map((rider) => (rider.id === updated.id ? updated : rider)));
        setSelectedRider(updated);
      } else {
        const created = await apiCreateRider(payload);
        setRiders((current) => [created, ...current]);
        setSelectedRider(created);
      }
    } catch (err) {
      setError(err.message || 'Failed to save rider');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Riders</h1>
          <p className="mt-2 text-sm text-gray-500">Create rider records here, then assign them from the Orders page.</p>
        </div>
      </div>

      {error && !saving ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search rider by name, phone, or email"
              className="w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43] focus:bg-white"
            />
          </div>

          {loading ? (
            <div className="p-10 text-center text-gray-500">Loading riders...</div>
          ) : filteredRiders.length === 0 ? (
            <div className="p-10 text-center text-gray-500">No riders found yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#1f5a43] text-white">
                  <tr>
                    <th className="px-5 py-4 font-medium">Name</th>
                    <th className="px-5 py-4 font-medium">Phone</th>
                    <th className="px-5 py-4 font-medium">Status</th>
                    <th className="px-5 py-4 font-medium">Availability</th>
                    <th className="px-5 py-4 font-medium">Updated</th>
                    <th className="px-5 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRiders.map((rider) => (
                    <tr key={rider.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{rider.fullName}</div>
                        <div className="mt-1 text-xs text-gray-500">{rider.email || 'No email'}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-700">{rider.phone}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rider.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                          {rider.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rider.isAvailable ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                          {rider.isAvailable ? 'Available' : 'Busy'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{formatDateTime(rider.updatedAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditForm(rider)}
                          className="rounded-full border border-[#1f5a43]/20 px-4 py-2 text-sm font-medium text-[#1f5a43] transition hover:bg-[#1f5a43] hover:text-white"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{selectedRider ? 'Edit Rider' : 'New Rider'}</h2>
              <p className="mt-2 text-sm text-gray-500">Riders created here will appear as assignable options in Admin Orders.</p>
            </div>
            {selectedRider ? (
              <button
                type="button"
                onClick={openCreateForm}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Back
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">First Name</span>
              <input
                type="text"
                value={form.firstName}
                onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Last Name</span>
              <input
                type="text"
                value={form.lastName}
                onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                required
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Password {selectedRider ? '(leave blank to keep current password)' : ''}
              </span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={selectedRider ? 'Optional new password' : 'Create rider password'}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                autoComplete="new-password"
                required={!selectedRider}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Phone</span>
              <input
                type="text"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(event) => setForm((current) => ({ ...current, isAvailable: event.target.checked }))}
              className="h-4 w-4 accent-[#1f5a43]"
            />
            Rider is currently available for new orders
          </label>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 w-full rounded-xl bg-[#1f5a43] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#163f2f] disabled:cursor-not-allowed disabled:opacity-70"
            >
            {saving ? 'Saving Rider...' : selectedRider ? 'Update Rider' : 'Create Rider'}
            </button>
          </form>
        </div>
    </div>
  );
}
