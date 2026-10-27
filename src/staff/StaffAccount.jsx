import StaffNotificationBell from './StaffNotificationBell';
import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Camera,Eye,EyeOff,KeyRound,Save,ShieldCheck,UserRound} from 'lucide-react';
import {staffApi,clearStaff} from './staffApi';
import {WorkspacePageHeader} from '../admin/WorkspacePrimitives';
import {StaffStatusBadge} from '../admin/StaffAccountDrawer';
import StaffAvatar from '../components/StaffAvatar';
import StaffPhotoDialog from './StaffPhotoDialog';
import {staffName,staffTimestamp} from '../utils/staffDirectory';
import {notifyStaffProfileChanged,STAFF_PROFILE_EVENT} from '../utils/staffProfileSync';
import {staffPasswordFormError} from '../utils/staffAccountValidation';
const panel='rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5';
const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
function PasswordField({name,label,current=false}){
 const [show,setShow]=useState(false);
 return <label className="grid gap-1.5 text-sm font-medium">{label}<span className="relative"><input className="staff-field pr-12" name={name} type={show?'text':'password'} autoComplete={current?'current-password':'new-password'} minLength={current?undefined:15} maxLength={current?undefined:64} required/><button type="button" aria-label={`${show?'Hide':'Show'} ${label.toLowerCase()}`} aria-pressed={show} className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-xl text-slate-500" onClick={()=>setShow(!show)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label>;
}
export function StaffPasswordForm({compact=false}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),pending=useRef(false),navigate=useNavigate();
 return <form className={(compact?'':panel)+' space-y-4'} onSubmit={async e=>{
  e.preventDefault();if(pending.current)return;
  const body=Object.fromEntries(new FormData(e.currentTarget)),problem=staffPasswordFormError(body);setMessage('');if(problem){setMessage(problem);return;}
  pending.current=true;setBusy(true);
  try{await staffApi('/api/auth/password',{currentPassword:body.currentPassword,newPassword:body.newPassword},'PATCH');clearStaff();navigate('/staff/login',{replace:true,state:{passwordChanged:true}});}catch(error){setMessage(error.message);}finally{pending.current=false;setBusy(false);}
 }}><h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={18} className="text-emerald-700"/>Change Password</h2><p className="text-xs leading-5 text-slate-500">Use a unique passphrase of 15–64 characters, up to 72 UTF-8 bytes. Changing it signs out your existing Staff sessions.</p><fieldset disabled={busy} className="space-y-4"><PasswordField name="currentPassword" label="Current password" current/><PasswordField name="newPassword" label="New password"/><PasswordField name="confirmPassword" label="Confirm new password"/><button className="staff-primary w-full sm:w-auto" disabled={busy}>{busy?'Changing password...':'Change Password'}</button></fieldset>{message&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}</form>;
}
export default function StaffAccount({data,refresh}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[photoOpen,setPhotoOpen]=useState(false),[localProfile,setLocalProfile]=useState(null),pending=useRef(false);
 useEffect(()=>{const changed=e=>{if(e.detail?.role==='staff'&&Number(e.detail.id)===Number(data.id))setLocalProfile(e.detail);};window.addEventListener(STAFF_PROFILE_EVENT,changed);return()=>window.removeEventListener(STAFF_PROFILE_EVENT,changed);},[data.id]);
 const profile=localProfile&&Date.parse(localProfile.updated_at)>=Date.parse(data.updated_at)?localProfile:data;
 const photoSaved=(updated,message)=>{setLocalProfile(updated);setNotice(message);setError('');};
 return <><WorkspacePageHeader notification={<StaffNotificationBell/>} eyebrow="Account & Security" title="My Account" description="Manage your personal information and account security."/>
 <section className={panel+' flex flex-wrap items-center gap-4'} aria-label="Staff profile summary"><StaffAvatar staff={profile} large/><div className="min-w-0 flex-1"><h2 className="break-words text-xl font-bold">{staffName(profile)}</h2><p className="mt-1 break-words text-sm text-slate-500">@{profile.username}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">Operations Staff</span><StaffStatusBadge status={profile.status}/></div></div><button className={button+' w-full sm:w-auto'} disabled={busy} onClick={()=>{setNotice('');setError('');setPhotoOpen(true);}}><Camera size={16}/>Change Photo</button></section>
 {notice&&<p role="status" className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
 <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]"><div className="space-y-4"><form className={panel+' space-y-4'} onSubmit={async e=>{
  e.preventDefault();if(pending.current)return;pending.current=true;const body=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);setError('');setNotice('');
  try{const result=await staffApi('/api/staff/profile',body,'PATCH');if(result.profile){setLocalProfile(result.profile);notifyStaffProfileChanged(result.profile);}await refresh({quiet:true});setNotice('Profile updated.');}catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);}
 }}><h2 className="flex items-center gap-2 text-sm font-semibold"><UserRound size={18} className="text-emerald-700"/>Profile Information</h2><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">First name<input className="staff-field" name="firstName" defaultValue={data.first_name} maxLength={120} required/></label><label className="grid gap-1.5 text-sm font-medium">Last name<input className="staff-field" name="lastName" defaultValue={data.last_name} maxLength={120}/></label><label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Email (optional, read-only)<input className="staff-field bg-slate-50" value={profile.email||''} placeholder="Not provided" readOnly/></label><p className="text-xs leading-5 text-slate-500 sm:col-span-2">Contact an administrator to update your username or optional email.</p><button className="staff-primary inline-flex items-center justify-center gap-2 sm:col-span-2 sm:justify-self-start" disabled={busy}><Save size={15}/>{busy?'Saving...':'Save Changes'}</button></fieldset>{error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}</form>
 <section className={panel}><h2 className="text-sm font-semibold">Password &amp; Security</h2><p className="mt-2 text-xs leading-5 text-slate-500">Protect your account with a strong password.</p><details className="mt-3"><summary className="min-h-11 cursor-pointer rounded-lg text-sm font-semibold text-emerald-900">Change Password</summary><StaffPasswordForm compact/></details></section></div>
 <section className={panel}><h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={18} className="text-emerald-700"/>Account Details</h2><dl className="mt-4 grid gap-4 text-sm min-[480px]:grid-cols-2 xl:grid-cols-1">{[['Staff ID','#'+profile.id],['Username',profile.username],['Role','Operations Staff'],['Account status',<StaffStatusBadge key="status" status={profile.status}/>],['Registration date',staffTimestamp(profile.created_at)],['Last login',staffTimestamp(profile.last_login_at,'Never logged in')]].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium">{value||'Not recorded'}</dd></div>)}</dl></section></div>
 {photoOpen&&<StaffPhotoDialog profile={profile} onClose={()=>setPhotoOpen(false)} onSaved={photoSaved}/>}
 </>;
}
