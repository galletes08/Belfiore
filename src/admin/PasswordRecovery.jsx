import {useEffect,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {apiPasswordRecovery} from '../api/client';
import {newStaffPasswordError} from '../../shared/staffPasswordPolicy';

const input='mt-2 h-12 w-full rounded-xl border border-[#d7e2da] bg-white px-4 text-sm text-[#173d2b] focus:outline-2 focus:outline-emerald-700';
export default function PasswordRecovery() {
  const location=useLocation();
  const navigate=useNavigate();
  const reset=location.pathname==='/reset-password';
  const [token]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||'');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirmation,setConfirmation]=useState('');
  const [show,setShow]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [deliveryAvailable,setDeliveryAvailable]=useState(true);
  useEffect(()=>{
    const previous=document.querySelector('meta[name="referrer"]');const meta=document.createElement('meta');meta.name='referrer';meta.content='no-referrer';document.head.appendChild(meta);
    if(reset&&window.location.hash)window.history.replaceState(window.history.state,'',window.location.pathname);
    return()=>{meta.remove();if(previous)document.head.appendChild(previous);};
  },[reset]);
  useEffect(()=>{if(!reset||!message)return;const timer=setTimeout(()=>navigate('/admin/login',{replace:true,state:{passwordChanged:true}}),2500);return()=>clearTimeout(timer);},[reset,message,navigate]);
  async function submit(e) {
    e.preventDefault();setError('');
    if(reset&&password!==confirmation){setError('Passwords do not match.');return;}
    if(reset&&newStaffPasswordError(password)){setError(newStaffPasswordError(password));return;}
    setBusy(true);
    try{const result=await apiPasswordRecovery(reset?'reset-password':'forgot-password',reset?{token,password}:{email});setDeliveryAvailable(result.deliveryAvailable!==false);setMessage(result.message);setPassword('');setConfirmation('');}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <div className="flex min-h-screen items-center justify-center bg-[#0f3225] px-4 py-10"><div className="w-full max-w-[440px] rounded-[2rem] border border-white/10 bg-[#fffef9] p-7 shadow-xl sm:p-10"><h1 className="text-2xl font-semibold text-[#173d2b]">{reset?'Reset password':'Forgot password?'}</h1><p className="mt-2 text-sm text-slate-500">{reset?'Choose a new password for your Administrator account.':'Administrator email recovery only. Riders must contact an authorized administrator for account verification and a temporary password.'}</p>
    {message?<p role="status" className={`mt-5 rounded-xl p-4 text-sm ${deliveryAvailable?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`}>{message}</p>:reset&&!token?<p role="alert" className="mt-5 text-sm text-red-700">This reset link is invalid or has expired. Request a new link below.</p>:<form className="mt-6 space-y-4" onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
      {reset?<><p className="text-xs text-slate-600">Use 15–64 characters and a unique passphrase. Spaces are allowed. Maximum 72 UTF-8 bytes; avoid common or repeated passwords.</p><label className="block text-sm text-[#294b3a]">New Password<input className={input} type={show?'text':'password'} autoComplete="new-password" required minLength={15} maxLength={64} value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="block text-sm text-[#294b3a]">Confirm New Password<input className={input} type={show?'text':'password'} autoComplete="new-password" required minLength={15} maxLength={64} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><button type="button" aria-pressed={show} className="text-xs text-emerald-800 underline" onClick={()=>setShow(v=>!v)}>{show?'Hide passwords':'Show passwords'}</button></>:<label className="block text-sm text-[#294b3a]">Registered Email<input className={input} type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      <button className="h-12 w-full rounded-xl bg-[#176b4d] text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>{busy?'Processing…':reset?'Reset Password':'Send Reset Instructions'}</button></fieldset></form>}
    {error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-between gap-3 text-xs text-emerald-800"><Link to="/admin/login" className="underline">Back to Sign In</Link>{reset&&<Link to="/forgot-password" className="underline">Request New Link</Link>}</div>
  </div></div>;
}
