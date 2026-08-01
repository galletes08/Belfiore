import { useEffect, useMemo, useState } from 'react';
import { Camera, Mail, Phone, Search, UserRound, UsersRound } from 'lucide-react';
import { apiAdminRiders, apiCreateRider, apiUpdateRider, getImageUrl } from '../api/client';

const emptyForm = { firstName: '', lastName: '', email: '', password: '', phone: '', status: 'active', isAvailable: true, profileImage: null };

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(rider) {
  return `${rider?.firstName?.[0] || ''}${rider?.lastName?.[0] || ''}`.toUpperCase() || 'R';
}

export default function AdminRiders() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [selectedRider, setSelectedRider] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');

  useEffect(() => {
    let mounted = true;
    apiAdminRiders()
      .then((data) => { if (mounted) { setRiders(Array.isArray(data) ? data : []); setError(''); } })
      .catch((err) => { if (mounted) setError(err.message || 'Failed to load riders'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => () => { if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const filteredRiders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return riders;
    return riders.filter((rider) => [rider.fullName, rider.email, rider.phone, rider.status, rider.isAvailable ? 'available' : 'busy'].join(' ').toLowerCase().includes(query));
  }, [riders, search]);

  const activeCount = riders.filter((rider) => rider.status === 'active').length;
  const availableCount = riders.filter((rider) => rider.isAvailable).length;

  function openCreateForm() {
    setSelectedRider(null);
    setForm(emptyForm);
    setPhotoPreview('');
    setError('');
  }

  function openEditForm(rider) {
    setSelectedRider(rider);
    setForm({ firstName: rider.firstName || '', lastName: rider.lastName || '', email: rider.email || '', password: '', phone: rider.phone || '', status: rider.status || 'active', isAvailable: Boolean(rider.isAvailable), profileImage: null });
    setPhotoPreview(rider.profileImageUrl ? getImageUrl(rider.profileImageUrl) : '');
    setError('');
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0] || null;
    setForm((current) => ({ ...current, profileImage: file }));
    setPhotoPreview(file ? URL.createObjectURL(file) : (selectedRider?.profileImageUrl ? getImageUrl(selectedRider.profileImageUrl) : ''));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = new FormData();
      payload.append('firstName', form.firstName);
      payload.append('lastName', form.lastName);
      payload.append('email', form.email);
      payload.append('password', form.password);
      payload.append('phone', form.phone);
      payload.append('status', form.status);
      payload.append('isAvailable', String(form.isAvailable));
      if (form.profileImage) payload.append('profileImage', form.profileImage);

      if (selectedRider) {
        const updated = await apiUpdateRider(selectedRider.id, payload);
        setRiders((current) => current.map((rider) => rider.id === updated.id ? updated : rider));
        openEditForm(updated);
      } else {
        const created = await apiCreateRider(payload);
        setRiders((current) => [created, ...current]);
        openEditForm(created);
      }
    } catch (err) {
      setError(err.message || 'Failed to save rider');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Delivery team</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Riders</h1>
          <p className="mt-2 text-sm text-slate-500">Manage rider profiles, availability, and account access.</p>
        </div>
        <button type="button" onClick={openCreateForm} className="rounded-xl bg-[#1f5a43] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#174533]">+ Add new rider</button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {[[riders.length, 'Total riders'], [activeCount, 'Active accounts'], [availableCount, 'Available now']].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p></div>
        ))}
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, phone, or email" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-100" /></div>
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? <div className="p-12 text-center text-slate-500">Loading riders...</div> : filteredRiders.length === 0 ? (
              <div className="flex flex-col items-center p-12 text-center"><UsersRound size={32} className="text-slate-300" /><p className="mt-3 font-medium text-slate-700">No riders found</p><p className="mt-1 text-sm text-slate-500">Try another search or add a rider.</p></div>
            ) : filteredRiders.map((rider) => (
              <article key={rider.id} className={`p-5 transition hover:bg-emerald-50/40 ${selectedRider?.id === rider.id ? 'bg-emerald-50/70' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-emerald-100">
                    {rider.profileImageUrl ? <img src={getImageUrl(rider.profileImageUrl)} alt={rider.fullName} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-emerald-800">{initials(rider)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="font-semibold text-slate-900">{rider.fullName}</h3><p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500"><Mail size={13} />{rider.email || 'No email'}</p></div>
                      <button type="button" onClick={() => openEditForm(rider)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-600">Edit profile</button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-slate-600"><Phone size={13} />{rider.phone || 'No phone'}</span>
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${rider.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{rider.status}</span>
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${rider.isAvailable ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{rider.isAvailable ? 'Available' : 'Busy'}</span>
                      <span className="ml-auto text-slate-400">Updated {formatDateTime(rider.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">{selectedRider ? 'Edit rider' : 'New rider'}</h2><p className="mt-1 text-sm text-slate-500">Profile and login information</p></div>{selectedRider ? <button type="button" onClick={openCreateForm} className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">Create new</button> : null}</div>

          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-emerald-100 shadow-sm">{photoPreview ? <img src={photoPreview} alt="Rider preview" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center"><UserRound size={30} className="text-emerald-700" /></span>}</div>
            <div><p className="text-sm font-semibold text-slate-800">Rider photo</p><p className="mt-1 text-xs text-slate-500">JPG or PNG, up to 5 MB</p><label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-slate-200 hover:ring-emerald-500"><Camera size={14} />Choose photo<input type="file" accept="image/*" onChange={handlePhotoChange} className="sr-only" /></label></div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">First name</span><input required value={form.firstName} onChange={(e) => setForm((c) => ({...c, firstName:e.target.value}))} className={fieldClass} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">Last name</span><input required value={form.lastName} onChange={(e) => setForm((c) => ({...c, lastName:e.target.value}))} className={fieldClass} /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Email address</span><input type="email" required value={form.email} onChange={(e) => setForm((c) => ({...c, email:e.target.value}))} className={fieldClass} /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Password {selectedRider ? <span className="font-normal text-slate-400">— leave blank to keep</span> : null}</span><input type="password" required={!selectedRider} value={form.password} onChange={(e) => setForm((c) => ({...c, password:e.target.value}))} placeholder={selectedRider ? 'Optional new password' : 'Create a secure password'} autoComplete="new-password" className={fieldClass} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">Phone</span><input required value={form.phone} onChange={(e) => setForm((c) => ({...c, phone:e.target.value}))} className={fieldClass} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">Account status</span><select value={form.status} onChange={(e) => setForm((c) => ({...c, status:e.target.value}))} className={fieldClass}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><input type="checkbox" checked={form.isAvailable} onChange={(e) => setForm((c) => ({...c, isAvailable:e.target.checked}))} className="h-4 w-4 accent-[#1f5a43]" /><span><strong className="block font-semibold">Available for orders</strong><span className="text-xs text-slate-500">Rider can be assigned to a new delivery.</span></span></label>
          <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-[#1f5a43] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#163f2f] disabled:opacity-60">{saving ? 'Saving...' : selectedRider ? 'Save changes' : 'Create rider'}</button>
        </form>
      </div>
    </div>
  );
}
