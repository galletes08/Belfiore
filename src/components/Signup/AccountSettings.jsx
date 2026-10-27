import {useRef,useState} from 'react';
import {Navigate} from 'react-router-dom';
import {Eye,EyeOff,KeyRound,ShieldCheck} from 'lucide-react';
import {apiChangePassword,clearCustomerToken} from '../../api/client';
import AccountSidebar from './AccountSidebar';
export default function AccountSettings({section}){
 const [passwords,setPasswords]=useState({current:'',next:'',confirm:''}),[visible,setVisible]=useState({}),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
 const busy=useRef(false);
 const submit=async event=>{
  event.preventDefault();if(busy.current)return;
  setFailed(true);setMessage('');
  if(passwords.next.length<6){setMessage('New password must be at least 6 characters.');return;}
  if(passwords.next!==passwords.confirm){setMessage('New passwords do not match.');return;}
  if(passwords.next===passwords.current){setMessage('Choose a new password different from your current password.');return;}
  busy.current=true;setSaving(true);
  try{const result=await apiChangePassword(passwords.current,passwords.next);setPasswords({current:'',next:'',confirm:''});setVisible({});setFailed(false);setMessage(result.message||'Password updated successfully.');}
  catch(error){setMessage(error.message||'Unable to update password.');}
  finally{busy.current=false;setSaving(false);}
 };
 if(section==='cards')return <Navigate to="/dashboard" replace/>;
 return <div className="min-h-screen bg-[#f8faf6] font-['Montserrat'] text-[#24372d]"><div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-0 px-4 md:px-6 lg:grid-cols-[230px_minmax(0,1fr)]">
  <AccountSidebar onLogout={clearCustomerToken}/><main className="min-w-0 space-y-4 py-4 lg:px-5"><header><p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-500">Account Security</p><h1 className="mt-1 font-['Playfair_Display'] text-2xl text-emerald-950 sm:text-3xl">Change Password</h1><p className="mt-2 text-sm text-slate-600">Use a strong, unique password to keep your account protected.</p></header>
   <form onSubmit={submit} className="max-w-2xl rounded-xl border border-[#e1e7dc] bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center gap-3 border-b border-slate-100 pb-4"><ShieldCheck size={22} className="text-emerald-800"/><div><h2 className="font-semibold">Password security</h2><p className="mt-1 text-xs text-slate-500">Your current password is verified securely before any change.</p></div></div>
    <div className="mt-4 grid gap-4">{[['current','Current Password'],['next','New Password'],['confirm','Confirm New Password']].map(([key,label])=><label key={key} className="block text-sm font-medium text-emerald-950">{label}<span className="relative mt-2 block"><input type={visible[key]?'text':'password'} required autoComplete={key==='current'?'current-password':'new-password'} value={passwords[key]} onChange={event=>setPasswords({...passwords,[key]:event.target.value})} className="min-h-11 w-full rounded-lg border border-[#dce5d8] bg-white py-3 pl-3 pr-12 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"/><button type="button" aria-label={(visible[key]?'Hide ':'Show ')+label.toLowerCase()} aria-pressed={!!visible[key]} onClick={()=>setVisible({...visible,[key]:!visible[key]})} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-lg focus-visible:outline-2">{visible[key]?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>)}</div>
    <button type="submit" disabled={saving} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0f4d2e] px-4 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 sm:w-auto"><KeyRound size={16}/>{saving?'Updating?':'Update Password'}</button>
    {message&&<p role={failed?'alert':'status'} className={'mt-3 text-sm '+(failed?'text-red-700':'text-emerald-800')}>{message}</p>}
   </form>
  </main>
 </div></div>;
}
