import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {apiResendVerification} from '../../api/client';
export default function VerificationPending(){
 const {state}=useLocation(),busy=useRef(false);
 const [email,setEmail]=useState(state?.email||''),[message,setMessage]=useState(state?.message||'Verify your email before signing in. You can request another verification link below.'),[seconds,setSeconds]=useState(state?.cooldown||0),[loading,setLoading]=useState(false);
 useEffect(()=>{if(!seconds)return;const id=setTimeout(()=>setSeconds(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(id);},[seconds]);
 async function resend(e){e.preventDefault();if(busy.current||seconds)return;busy.current=true;setLoading(true);try{const data=await apiResendVerification(email);setMessage(data.message);setSeconds(data.retryAfterSeconds||60);}catch(error){setMessage(error.message);setSeconds(60);}finally{busy.current=false;setLoading(false);}}
 return <main className="mx-auto my-12 max-w-lg rounded-3xl border border-emerald-100 bg-white p-8"><h1 className="text-2xl font-bold text-emerald-950">Verification pending</h1><p role="status" className="my-4 text-sm text-gray-700">{message}</p><form onSubmit={resend}><label htmlFor="verification-email" className="block text-sm">Email address</label><input id="verification-email" autoComplete="email" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="my-2 w-full rounded-xl border p-3"/><button disabled={loading||seconds>0} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm text-white disabled:opacity-60">{loading?'Requesting...':seconds?`Try again in ${seconds}s`:'Resend verification email'}</button></form><div className="mt-5 flex gap-4 text-sm text-emerald-800"><Link to="/login">Login</Link><Link to="/signup">Back to registration</Link></div></main>;
}
