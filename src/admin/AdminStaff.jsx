import {STAFF_PROFILE_EVENT,STAFF_PROFILE_STORAGE} from '../utils/staffProfileSync';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Eye,History,KeyRound,MoreHorizontal,Plus,Search,UserCheck,UserRoundX,Users,RefreshCw} from 'lucide-react';
import {apiStaffManagement} from '../api/client';
import NotificationBell from './NotificationBell';
import InventoryActionMenu from './InventoryActionMenu';
import {SummaryCard,WorkspacePageHeader} from './WorkspacePrimitives';
import StaffAccountDrawer,{StaffAccountAction,StaffAvatar,StaffStatusBadge} from './StaffAccountDrawer';
import {filterStaffDirectory,staffDirectoryCounts,staffName,staffTimestamp} from '../utils/staffDirectory';

const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const primary=button.replace('border-slate-200','border-emerald-900').replace('bg-white','bg-[#1f5a43]').replace('text-emerald-900','text-white').replace('hover:bg-emerald-50','hover:bg-[#174b37]');
const field='min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700';
const emptyActivity={rows:[],page:1,loading:true,error:''};

function StaffActions({staff,onOpen}){
 return <div className="flex flex-wrap items-center gap-2"><button className={button} onClick={()=>onOpen('details',staff)}><Eye size={15} aria-hidden="true"/>View / Edit</button><InventoryActionMenu label="More" productName={staffName(staff)} icon={MoreHorizontal} items={[
  {label:'View Activity',icon:History,action:()=>onOpen('details',staff,'Activity')},
  {label:'Reset Password',icon:KeyRound,action:()=>onOpen('reset',staff)},
  {label:staff.status==='active'?'Deactivate':'Activate',icon:staff.status==='active'?UserRoundX:UserCheck,action:()=>onOpen('status',staff)},
 ]}/></div>;
}
export function StaffDirectory({records,onOpen}){
 return <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600"><tr>{['Staff','Status','Last Login','Actions'].map(label=><th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{records.map(staff=><tr key={staff.id} className="hover:bg-emerald-50/30"><td className="px-4 py-3"><div className="flex items-center gap-3"><StaffAvatar key={staff.profile_image_url} staff={staff}/><div className="min-w-0"><p className="break-words font-semibold">{staffName(staff)}</p><p className="mt-1 break-words text-xs text-slate-500">@{staff.username} · #{staff.id}</p></div></div></td><td className="px-4 py-3"><StaffStatusBadge status={staff.status}/></td><td className="px-4 py-3 text-xs text-slate-500">{staffTimestamp(staff.last_login_at,'Never logged in')}</td><td className="px-4 py-3"><StaffActions staff={staff} onOpen={onOpen}/></td></tr>)}</tbody></table></div><ul className="divide-y divide-slate-100 md:hidden" aria-label="Staff directory">{records.map(staff=><li key={staff.id} className="space-y-3 p-4"><div className="flex items-start gap-3"><StaffAvatar key={staff.profile_image_url} staff={staff}/><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{staffName(staff)}</p><p className="mt-1 break-words text-xs text-slate-500">@{staff.username} · #{staff.id}</p></div><StaffStatusBadge status={staff.status}/></div><p className="text-xs text-slate-500">Last login: {staffTimestamp(staff.last_login_at,'Never logged in')}</p><StaffActions staff={staff} onOpen={onOpen}/></li>)}</ul></>;
}
export default function AdminStaff(){
 const [staff,setStaff]=useState([]),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[sort,setSort]=useState('name-asc');
 const [mode,setMode]=useState(''),[selectedId,setSelectedId]=useState(null),[tab,setTab]=useState('Profile'),[editing,setEditing]=useState(false);
 const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [activity,setActivity]=useState(emptyActivity),[activityPage,setActivityPage]=useState(1),[activityRetry,setActivityRetry]=useState(0);
 const sending=useRef(false),mounted=useRef(true),activityRequest=useRef(0);
 const load=useCallback(async()=>{setLoading(true);setLoadError('');try{const rows=await apiStaffManagement();if(mounted.current)setStaff(rows);}catch(e){if(mounted.current)setLoadError(e.message);}finally{if(mounted.current)setLoading(false);}},[]);
 useEffect(()=>{mounted.current=true;load();return()=>{mounted.current=false;};},[load]);
 useEffect(()=>{
  if(mode!=='details'||tab!=='Activity')return;
  const sequence=++activityRequest.current;let active=true;
  setActivity({rows:[],page:activityPage,loading:true,error:''});
  apiStaffManagement(`/${selectedId}/activity?page=${activityPage}`).then(data=>{if(active&&sequence===activityRequest.current)setActivity({rows:data.rows,page:data.page,loading:false,error:''});}).catch(e=>{if(active&&sequence===activityRequest.current)setActivity({rows:[],page:activityPage,loading:false,error:e.message});});
  return()=>{active=false;};
 },[mode,tab,selectedId,activityPage,activityRetry]);
 useEffect(()=>{const update=()=>{if(!document.hidden&&!editing&&!busy)load();};const storage=e=>{if(e.key===STAFF_PROFILE_STORAGE)update();};window.addEventListener(STAFF_PROFILE_EVENT,update);window.addEventListener('storage',storage);window.addEventListener('focus',update);return()=>{window.removeEventListener(STAFF_PROFILE_EVENT,update);window.removeEventListener('storage',storage);window.removeEventListener('focus',update);};},[load,editing,busy]);
 const selected=staff.find(s=>s.id===selectedId),counts=staffDirectoryCounts(staff),rows=filterStaffDirectory(staff,{query,status,sort});
 const reset=()=>{setQuery('');setStatus('all');setSort('name-asc');};
 const close=()=>{if(sending.current)return;setMode('');setError('');};
 const open=(next,person=null,initialTab='Profile')=>{if(sending.current)return;setSelectedId(person?.id??null);setTab(initialTab);setEditing(false);setError('');setNotice('');setActivity(emptyActivity);setActivityPage(1);setMode(next);};
 const save=async event=>{
  event.preventDefault();if(sending.current)return;
  const body=Object.fromEntries(new FormData(event.currentTarget));
  sending.current=true;setBusy(true);setError('');setNotice('');
  try{
   let result;
   if(mode==='create')result=await apiStaffManagement('',body);
   else if(mode==='reset')result=await apiStaffManagement(`/${selected.id}/reset-password`,{...body,confirmed:body.confirmed==='on'});
   else if(mode==='status')result=await apiStaffManagement(`/${selected.id}`,{status:selected.status==='active'?'disabled':'active',confirmed:true},'PATCH');
   else result=await apiStaffManagement(`/${selected.id}`,body,'PATCH');
   if(!mounted.current)return;
   setNotice(result.message||'Staff account updated.');setEditing(false);
   if(mode!=='details')setMode('');
   await load();
  }catch(e){if(mounted.current)setError(e.message);}finally{sending.current=false;if(mounted.current)setBusy(false);}
 };
 return <section className="min-w-0 space-y-4"><WorkspacePageHeader eyebrow="Team & Access" title="Staff Management" description="Manage operations staff and account access." notification={<NotificationBell/>}><button className={primary} disabled={busy} onClick={()=>open('create')}><Plus size={16} aria-hidden="true"/>Create Staff</button></WorkspacePageHeader>
 {notice&&!mode&&<p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
 <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3" aria-label="Staff summary">{[['Total Staff',counts.total,Users],['Active Staff',counts.active,UserCheck],['Inactive Staff',counts.inactive,UserRoundX]].map(([label,value,icon])=><SummaryCard key={label} label={label} value={loading?'—':value} icon={icon}/>)}</div>
 <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Staff filters"><div className="grid items-end gap-3 sm:grid-cols-2 md:grid-cols-[minmax(0,1fr)_130px_160px_auto]"><label className="grid min-w-0 gap-1.5 text-xs text-slate-600 sm:col-span-2 md:col-span-1">Search staff<span className="relative"><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-slate-400"/><input className={field+' pl-9'} placeholder="Search name, username, or Staff ID..." value={query} onChange={e=>setQuery(e.target.value)}/></span></label><label className="grid gap-1.5 text-xs text-slate-600">Status<select className={field} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All Staff</option><option value="active">Active</option><option value="disabled">Inactive</option></select></label><label className="grid gap-1.5 text-xs text-slate-600">Sort by<select className={field} value={sort} onChange={e=>setSort(e.target.value)}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="recent">Most Recently Created</option><option value="login">Last Login</option></select></label><button className={button} onClick={reset}>Reset Filters</button></div></section>
 <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold">Staff Directory</h2><span className="text-xs text-slate-500">{loading?'Loading…':`${rows.length} of ${counts.total} staff`}</span></header>{loadError?<div role="alert" className="space-y-3 p-5 text-sm text-red-700"><p>{loadError}</p><button className={button} onClick={load}><RefreshCw size={14}/>Retry</button></div>:loading?<p role="status" className="p-6 text-sm text-slate-500">Loading staff…</p>:rows.length?<StaffDirectory records={rows} onOpen={open}/>:<div className="space-y-3 p-7 text-center"><p className="text-sm font-semibold">{counts.total?'No staff members found.':'No Staff accounts yet.'}</p><p className="text-xs text-slate-500">{counts.total?'Try another search or reset the filters.':'Create accounts only for authorized operations personnel.'}</p><button className={counts.total?button:primary} onClick={counts.total?reset:()=>open('create')}>{counts.total?'Reset Filters':'Create Staff'}</button></div>}</section>
 {mode==='details'&&selected&&<StaffAccountDrawer key={selected.id} staff={selected} tab={tab} setTab={setTab} editing={editing} setEditing={setEditing} busy={busy} error={error} notice={notice} onClose={close} onSave={save} activity={activity} setActivityPage={setActivityPage} retryActivity={()=>setActivityRetry(n=>n+1)}/>}
 {['create','reset','status'].includes(mode)&&(mode==='create'||selected)&&<StaffAccountAction key={mode+'-'+selectedId} mode={mode} staff={selected} busy={busy} error={error} onClose={close} onSubmit={save}/>}
 </section>;
}
