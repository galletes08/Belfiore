import {createElement,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Package,Truck,CircleCheckBig,ArrowRight} from 'lucide-react';
import {apiCustomerOrders,apiCustomerAccount,clearCustomerToken,getImageUrl} from '../../api/client';
import AccountSidebar from './AccountSidebar';
import {summarizeCustomerOrders} from '../../utils/customerDashboard';
const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value)||0);
const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}):'Date unavailable';
export default function UserDashboard(){
 const [orders,setOrders]=useState([]),[profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[profileError,setProfileError]=useState('');
 useEffect(()=>{let active=true;
  Promise.allSettled([apiCustomerOrders([]),apiCustomerAccount()]).then(([o,p])=>{if(!active)return;if(o.status==='fulfilled')setOrders(Array.isArray(o.value)?o.value:[]);else setError(o.reason.message||'Unable to load orders.');if(p.status==='fulfilled')setProfile(p.value.profile);else setProfileError(p.reason.message||'Account information unavailable.');setLoading(false);});
  return()=>{active=false;};
 },[]);
 const summary=summarizeCustomerOrders(orders),latest=summary.latest;
 const stats=[['Total Orders',summary.total,Package],['In Transit',summary.inTransit,Truck],['Delivered',summary.delivered,CircleCheckBig]];
 const orderLink=latest?'/orders?orderId='+latest.id:'/orders';
 return <div className="min-h-screen bg-[#f8faf6] font-['Montserrat'] text-[#24372d]"><div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-0 px-4 md:px-6 lg:grid-cols-[230px_minmax(0,1fr)]">
  <AccountSidebar onLogout={clearCustomerToken}/>
  <main className="min-w-0 space-y-4 py-4 lg:px-5">
   <header><p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-500">Dashboard</p><h1 className="mt-1 font-['Playfair_Display'] text-2xl text-emerald-950 sm:text-3xl">Welcome back, {profile?.name?.trim()||'Belfiore Customer'}</h1><p className="mt-2 text-sm text-slate-600">A quick overview of your orders, deliveries, and latest updates.</p></header>
   <section aria-label="Order statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-3">{stats.map(([label,value,Icon])=><article key={label} className="min-w-0 rounded-xl border border-[#e1e7dc] bg-white p-3 shadow-sm sm:p-4"><span className="inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-800">{createElement(Icon,{size:18})}</span><p className="mt-2 text-xs text-slate-600">{label}</p><p className="mt-1 text-2xl font-semibold text-emerald-950">{loading||error?'?':value}</p></article>)}</section>
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
    <section className="min-w-0 rounded-xl border border-[#e1e7dc] bg-white p-4 shadow-sm"><h2 className="font-semibold text-emerald-950">Latest Order</h2>{loading?<p role="status" className="py-5 text-sm text-slate-500">Loading your orders?</p>:error?null:latest?<>
     <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold">{latest.orderCode||'ORD-'+String(latest.id).padStart(3,'0')}</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-900">{latest.status}</span></div><p className="mt-2 text-xs text-slate-500">{date(latest.createdAt)}</p>
     <div className="mt-4 flex items-center gap-3"><img className="h-16 w-16 shrink-0 rounded-lg object-cover" src={getImageUrl(latest.items?.[0]?.imageUrl)||'/product-placeholder.svg'} alt=""/><div className="min-w-0"><p className="line-clamp-2 text-sm font-semibold">{latest.items?.[0]?.productName||'Order items'}</p><p className="mt-1 text-xs text-slate-500">{latest.items?.length||0} item lines</p><p className="mt-1 font-semibold text-emerald-900">{money(latest.totalAmount)}</p></div></div>
     <div className="mt-4 flex flex-wrap gap-2"><Link to={orderLink} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-900 px-3 text-sm font-semibold text-white">View Order Details<ArrowRight size={15}/></Link>{!['Delivered','Cancelled'].includes(latest.status)&&<Link to={orderLink} className="inline-flex min-h-11 items-center rounded-lg border border-emerald-200 px-3 text-sm text-emerald-900">Track Delivery</Link>}</div>
    </>:<div className="py-6 text-sm text-slate-600"><p>No purchases yet. Your latest order will appear here.</p><Link to="/products" className="mt-3 inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Browse Products</Link></div>}</section>
    <section className="min-w-0 rounded-xl border border-[#e1e7dc] bg-white p-4 shadow-sm"><h2 className="font-semibold text-emerald-950">Account Information</h2>{profileError?<p role="alert" className="mt-3 text-sm text-red-700">{profileError}</p>:<div className="mt-3 space-y-2 break-words text-sm"><p>{profile?.name||'Name not yet saved'}</p><p className="text-slate-600">{profile?.email||'Loading account?'}</p>{profile?.phone&&<p className="text-slate-600">{profile.phone}</p>}</div>}<Link to="/profile" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">Edit Profile</Link><nav aria-label="Account shortcuts" className="mt-3 grid gap-2 border-t border-slate-100 pt-3">{[['/orders','My Purchases'],['/addresses','Addresses'],['/change-password','Account Security']].map(([to,label])=><Link key={to} to={to} className="flex min-h-11 items-center justify-between rounded-lg bg-[#f4f7f1] px-3 text-sm text-emerald-950">{label}<ArrowRight size={14}/></Link>)}</nav></section>
   </div>
  </main>
 </div></div>;
}
