import {createElement,useId,useRef,useState} from 'react';
import {ChevronDown,LayoutDashboard,ShoppingBag,UserRound,MapPin,KeyRound,LogOut} from 'lucide-react';
import {Link,NavLink,useLocation} from 'react-router-dom';
const links=[['/dashboard','Dashboard',LayoutDashboard],['/orders','My Purchases',ShoppingBag],['/profile','My Profile',UserRound],['/addresses','My Addresses',MapPin],['/change-password','Change Password',KeyRound]];
export default function AccountSidebar({onLogout}) {
 const [open,setOpen]=useState(false),id=useId(),toggle=useRef(null);
 const {pathname}=useLocation();
 return <aside className="self-start rounded-xl border border-[#e3eadf] bg-white p-2 lg:p-3">
  <button ref={toggle} type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-sm font-semibold text-[#173d2b] focus-visible:outline-2 focus-visible:outline-emerald-700 lg:hidden"><span className="flex items-center gap-2"><UserRound size={18}/>My Account</span><ChevronDown size={18} className={open?'rotate-180':''}/></button>
  <div className="hidden px-3 pb-4 pt-2 lg:block"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Account</p><h2 className="mt-1 text-lg font-semibold text-emerald-950">User Panel</h2></div>
  <nav id={id} aria-label="Customer account" onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);toggle.current?.focus();}}} className={(open?'grid ':'hidden ')+'gap-1 text-sm lg:grid'}>
   {links.map(([to,label,Icon])=><NavLink key={to} to={to} onClick={()=>setOpen(false)} className={({isActive})=>'flex min-h-11 items-center gap-2 rounded-lg px-3 py-2.5 font-medium transition focus-visible:outline-2 focus-visible:outline-emerald-700 '+(isActive||(to==='/profile'&&pathname==='/account-details')?'bg-[#0f4d2e] text-white':'text-[#405145] hover:bg-[#edf4ea]')}>{createElement(Icon,{size:17,'aria-hidden':true})}{label}</NavLink>)}
   <Link to="/login" onClick={()=>{setOpen(false);onLogout?.();}} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border-t border-red-100 px-3 py-3 text-red-700 hover:bg-red-50 focus-visible:outline-2"><LogOut size={17}/>Logout</Link>
  </nav>
 </aside>;
}
