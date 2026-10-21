import NotificationBell from './NotificationBell';
import RiderResetDialog from './RiderResetDialog';
import InventoryActionMenu from './InventoryActionMenu';
import CustomerAvatar from './CustomerAvatar';
import RiderDetailsDrawer from './RiderDetailsDrawer';
import RiderStatusDialog from './RiderStatusDialog';
import RiderUnlockDialog from './RiderUnlockDialog';
import { useEffect, useRef, useState } from 'react';
import { Camera, Search, UserRound, UsersRound, MoreHorizontal, Pencil, KeyRound, Power, LockKeyholeOpen } from 'lucide-react';
import { apiRiderManagement, apiCreateRider, apiUpdateRider, getImageUrl } from '../api/client';

const emptyForm = { firstName: '', lastName: '', email: '', username:'', password: '', phone: '', status: 'active', isAvailable: false, profileImage: null };





export default function AdminRiders() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter,setFilter]=useState('All'),[page,setPage]=useState(1),[total,setTotal]=useState(0),[summary,setSummary]=useState({total:0,active:0,available:0});
  const [revision,setRevision]=useState(0),[details,setDetails]=useState(null),[statusRider,setStatusRider]=useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedRider, setSelectedRider] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetRider,setResetRider]=useState(null);
  const [unlockRider,setUnlockRider]=useState(null);
  const [notice,setNotice]=useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const editorRef = useRef(null);

  useEffect(() => {
    let mounted=true;setLoading(true);setError('');
    const timer=setTimeout(()=>apiRiderManagement('manage',{search,filter,page}).then(data=>{if(mounted){setRiders(data.riders);setSummary(data.summary);setTotal(data.total);}}).catch(err=>{if(mounted)setError(err.message);}).finally(()=>{if(mounted)setLoading(false);}),200);
    return()=>{mounted=false;clearTimeout(timer);};
  },[search,filter,page,revision]);
  useEffect(()=>()=>{if(photoPreview.startsWith('blob:'))URL.revokeObjectURL(photoPreview);},[photoPreview]);
  useEffect(()=>{const refresh=()=>{if(!document.hidden)setRevision(r=>r+1);};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);

  function focusEditor() {
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function openCreateForm() {
    setSelectedRider(null);
    setForm(emptyForm);
    setPhotoPreview('');
    setError('');
    setEditorOpen(true);
    focusEditor();
  }

  function closeEditor() {
    setEditorOpen(false);
    setSelectedRider(null);
    setForm(emptyForm);
    setPhotoPreview('');
    setError('');
  }
  function openEditForm(rider) {
    setSelectedRider(rider);
    setForm({ firstName: rider.firstName || '', lastName: rider.lastName || '', email: rider.email || '', username:rider.username||'', password: '', phone: rider.phone || '', status: rider.status || 'active', isAvailable: Boolean(rider.isOnDuty), profileImage: null });
    setPhotoPreview(rider.profileImageUrl ? getImageUrl(rider.profileImageUrl) : '');
    setError('');
    setEditorOpen(true);
    focusEditor();
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
      payload.append('username',form.username);
      if(!selectedRider)payload.append('password', form.password);
      payload.append('phone', form.phone);
      payload.append('status', form.status);
      payload.append('isAvailable', String(form.isAvailable));
      if (form.profileImage) payload.append('profileImage', form.profileImage);

      if (selectedRider) {
        const updated = await apiUpdateRider(selectedRider.id, payload);
        setRiders((current) => current.map((rider) => rider.id === updated.id ? updated : rider));
        closeEditor();setNotice('Rider profile updated.');setRevision(r=>r+1);
      } else {
        const created = await apiCreateRider(payload);
        setRiders((current) => [created, ...current]);
        closeEditor();setNotice('Rider account created. A password change is required at first sign-in.');setRevision(r=>r+1);
      }
    } catch (err) {
      setError(err.message || 'Failed to save rider');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-4">
      {unlockRider&&<RiderUnlockDialog rider={unlockRider} onClose={()=>setUnlockRider(null)} onDone={message=>{setUnlockRider(null);setNotice(message);setRevision(r=>r+1);}}/>}
      {details&&<RiderDetailsDrawer key={details} id={details} onClose={()=>setDetails(null)}/>}
      {statusRider&&<RiderStatusDialog rider={statusRider} onClose={()=>setStatusRider(null)} onDone={message=>{setStatusRider(null);setNotice(message);setRevision(r=>r+1);}}/>}
      {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {resetRider&&<RiderResetDialog rider={resetRider} onClose={()=>setResetRider(null)} onDone={(message,username)=>{setRiders(rows=>rows.map(r=>r.id===resetRider.id?{...r,username:username||r.username,mustChangePassword:true}:r));setResetRider(null);setNotice(message);setRevision(r=>r+1);}}/>}
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Delivery team</p>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-4"><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-slate-900">Rider Management</h1></div><div className="shrink-0"><NotificationBell /></div></div>
          <p className="mt-2 text-sm text-slate-500">Manage rider accounts, availability, and delivery assignments.</p>
        </div>
        <div className="flex justify-end gap-2"><button type="button" disabled={loading} onClick={()=>setRevision(r=>r+1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50">Refresh</button><button type="button" onClick={openCreateForm} className="rounded-xl bg-[#1f5a43] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#174533]">+ Add New Rider</button></div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {[[summary.total, 'Total Riders'], [summary.active, 'Active Accounts'], [summary.available, 'Available Now']].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-2xl font-bold text-slate-900">{loading?'...':value}</p><p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p></div>
        ))}
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className={"grid items-start gap-6 " + (editorOpen ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]" : "")}>
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
            <div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input aria-label="Search riders" type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search name, username, phone or email" className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm"/></div>
            <select aria-label="Rider availability filter" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">{['All','Available','Busy','Offline','Disabled','Security Locked'].map(value=><option key={value}>{value}</option>)}</select>
          </div>
          <div className="divide-y divide-slate-100">
            {loading?<p role="status" className="p-8 text-center text-sm text-slate-500">Loading riders...</p>:error?null:riders.length===0?<div className="p-8 text-center text-sm text-slate-500"><UsersRound className="mx-auto mb-2" size={24}/>No riders found.</div>:riders.map(rider=><article key={rider.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-emerald-50/30">
              <CustomerAvatar customer={rider}/><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{rider.fullName}</h3><p className="break-words text-xs text-slate-500">{rider.username||'No linked login'} | {rider.phone||'No phone'}</p><div className="mt-1 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-0.5">{rider.accountEnabled?'Active':'Disabled'}</span>{rider.securityLocked&&<span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800">Security Locked</span>}<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">{rider.availability}</span></div>{rider.assignmentReviewRequired&&<p className="mt-1 text-xs text-amber-800">Administrator review required: security-locked rider has ongoing deliveries.</p>}</div>
              <div className="ml-auto flex items-center gap-2"><button type="button" onClick={()=>setDetails(rider.id)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs text-emerald-900">View Details</button><InventoryActionMenu label="More" productName={rider.fullName} icon={MoreHorizontal} items={[
                ...(rider.securityLocked?[{label:'Unlock Account',icon:LockKeyholeOpen,action:()=>setUnlockRider(rider)}]:[]),
                {label:'Edit Profile',icon:Pencil,action:()=>openEditForm(rider)},
                {label:'Reset Password',icon:KeyRound,action:()=>setResetRider(rider)},
                {label:rider.status==='inactive'?'Enable Account':'Disable Account',icon:Power,action:()=>setStatusRider(rider)}
              ]}/></div>
            </article>)}
          </div>
          {!error&&<div className="flex items-center justify-between gap-2 border-t p-4 text-xs"><button type="button" disabled={loading||page===1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>{total} riders | Page {page} of {Math.max(1,Math.ceil(total/20))}</span><button type="button" disabled={loading||page*20>=total} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}
        </section>

        {editorOpen ? (
        <form ref={editorRef} onSubmit={handleSubmit} className="scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{selectedRider ? 'Edit rider' : 'New rider'}</h2>
              <p className="mt-1 text-sm text-slate-500">Profile and login information</p>
            </div>
            <div className="flex flex-wrap justify-end gap-3 text-sm font-semibold">
              {selectedRider ? <button type="button" onClick={openCreateForm} className="text-emerald-700 hover:text-emerald-900">Create new</button> : null}
              <button type="button" onClick={closeEditor} className="text-slate-500 hover:text-slate-800">Close</button>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-white bg-emerald-100 shadow-sm">{photoPreview ? <img src={photoPreview} alt="Rider preview" onError={()=>setPhotoPreview('')} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center"><UserRound size={30} className="text-emerald-700" /></span>}</div>
            <div><p className="text-sm font-semibold text-slate-800">Rider photo</p><p className="mt-1 text-xs text-slate-500">JPG, PNG or WEBP, up to 2 MB</p><label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-slate-200 hover:ring-emerald-500"><Camera size={14} />Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} className="sr-only" /></label></div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">First name</span><input required value={form.firstName} onChange={(e) => setForm((c) => ({...c, firstName:e.target.value}))} className={fieldClass} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">Last name</span><input required value={form.lastName} onChange={(e) => setForm((c) => ({...c, lastName:e.target.value}))} className={fieldClass} /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Email address (optional)</span><input type="email" value={form.email} onChange={(e) => setForm((c) => ({...c, email:e.target.value}))} className={fieldClass} /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Assigned Username</span><input required={!selectedRider} disabled={Boolean(selectedRider&&!selectedRider.username)} autoComplete="off" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" value={form.username} onChange={e=>setForm(c=>({...c,username:e.target.value}))} className={fieldClass}/></label>
            {!selectedRider&&<label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Initial Temporary Password</span><input type="password" required minLength={15} maxLength={64} value={form.password} onChange={e=>setForm(c=>({...c,password:e.target.value}))} autoComplete="new-password" className={fieldClass}/><span className="mt-1 block text-xs text-slate-500">The rider must choose a new password at first sign-in. Use 15-64 characters.</span></label>}
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">Phone</span><input required value={form.phone} onChange={(e) => setForm((c) => ({...c, phone:e.target.value}))} className={fieldClass} /></label>

          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><input type="checkbox" disabled={selectedRider?.status==='inactive'} checked={form.isAvailable} onChange={(e) => setForm((c) => ({...c, isAvailable:e.target.checked}))} className="h-4 w-4 accent-[#1f5a43]" /><span><strong className="block font-semibold">On Duty</strong><span className="text-xs text-slate-500">Manual duty preference. Availability also requires an eligible account and no ongoing assignment.</span></span></label>
          <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-[#1f5a43] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#163f2f] disabled:opacity-60">{saving ? 'Saving...' : selectedRider ? 'Save changes' : 'Create rider'}</button>
        </form>
        ) : null}
      </div>
    </div>
  );
}
