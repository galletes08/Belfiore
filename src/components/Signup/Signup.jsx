import {useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Leaf} from 'lucide-react';
import {apiRegister,clearCustomerToken} from '../../api/client';
import {registrationErrors,customerPasswordError,PASSWORD_GUIDANCE} from '../../../shared/customerRegistration';
export default function Signup(){
 const navigate=useNavigate(),busy=useRef(false);
 const [form,setForm]=useState({firstName:'',lastName:'',email:'',password:'',confirmPassword:''});
 const [errors,setErrors]=useState({}),[message,setMessage]=useState(''),[submitting,setSubmitting]=useState(false),[visible,setVisible]=useState({});
 async function submit(event){event.preventDefault();if(busy.current)return;const problems=registrationErrors(form);setErrors(problems);setMessage('');if(Object.keys(problems).length)return;
 busy.current=true;setSubmitting(true);try{const response=await apiRegister(form);clearCustomerToken();navigate('/verification-pending',{replace:true,state:{email:form.email.trim().toLowerCase(),message:response.message,cooldown:response.retryAfterSeconds}});}catch(error){setErrors(error.fields||{});setMessage(error.message);}finally{busy.current=false;setSubmitting(false);}}
 const fields=[['firstName','First Name'],['lastName','Last Name'],['email','Email Address'],['password','Password'],['confirmPassword','Confirm Password']];
 return <div className="bg-[linear-gradient(180deg,#f3f8f3_0%,#ffffff_40%,#f4f7f3_100%)] px-6 py-10"><div className="mx-auto grid min-h-[72vh] max-w-6xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm lg:grid-cols-2">
        <aside className="hidden bg-[linear-gradient(145deg,#0f766e_0%,#047857_45%,#065f46_100%)] p-8 text-white lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">Create Account</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            Grow your plant
            <br />
            collection with us
          </h1>
          <p className="mt-4 max-w-sm text-sm text-emerald-50/90">
            Sign up to track orders, manage your profile, and get updates for new drops and restocks.
          </p>

          <div className="mt-8 rounded-2xl border border-emerald-300/30 bg-emerald-950/20 p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <Leaf size={16} />
              Belfiore Succulents PH
            </p>
            <p className="mt-2 text-sm text-emerald-50/85">Healthy plants, reliable delivery, and practical support.</p>
          </div>
        </aside>

<main className="p-6 sm:p-8 md:p-10"><h2 className="text-3xl font-bold text-gray-900">Sign Up</h2>
<form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate aria-busy={submitting}>
{fields.map(([field,label])=>{const password=field.toLowerCase().includes('password');return <div key={field} className={field==='firstName'||field==='lastName'?'':'sm:col-span-2'}><label htmlFor={field} className="mb-1 block text-sm text-gray-700">{label}</label><div className="flex gap-2"><input id={field} name={field} autoComplete={password?'new-password':field==='email'?'email':field==='firstName'?'given-name':'family-name'} type={password&&!visible[field]?'password':field==='email'?'email':'text'} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})} required maxLength={password?72:field==='email'?254:100} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field]?field+'-error':password?'password-guidance':undefined} className="min-w-0 flex-1 rounded-xl border border-gray-300 p-2.5 text-sm focus:outline-emerald-600"/>{password&&<button type="button" onClick={()=>setVisible({...visible,[field]:!visible[field]})} aria-label={(visible[field]?'Hide ':'Show ')+label} aria-pressed={Boolean(visible[field])} className="rounded-lg border border-emerald-200 px-3 text-sm text-emerald-800">{visible[field]?'Hide':'Show'}</button>}</div>{errors[field]&&<p id={field+'-error'} className="mt-1 text-sm text-rose-700">{errors[field]}</p>}{field==='password'&&<><p id="password-guidance" className="mt-1 text-xs text-gray-600">{PASSWORD_GUIDANCE}</p>{form.password&&<p className="mt-1 text-xs text-emerald-800" role="status">{customerPasswordError(form.password)?'Does not yet meet requirements':Array.from(form.password).length>=24?'Long passphrase; avoid reuse':'Meets length requirements; use a unique passphrase'}</p>}</>}</div>;})}
{message&&<p role="alert" className="text-sm text-rose-700 sm:col-span-2">{message}</p>}
<p className="text-xs text-gray-600 sm:col-span-2"><Link className="underline" to="/terms">Terms of Service</Link> and <Link className="underline" to="/privacy">Privacy Notice</Link> (not yet published).</p>
<button disabled={submitting} className="rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">{submitting?'Submitting...':'Create Account'}</button></form><p className="mt-4 text-sm"><Link to="/verification-pending" state={{email:form.email}} className="text-emerald-800 underline">Waiting for verification? Request a new link</Link></p><p className="mt-5 text-sm text-gray-600">Already have an account? <Link className="font-semibold text-emerald-700" to="/login">Login</Link></p></main></div></div>;
}
