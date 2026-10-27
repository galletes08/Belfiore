import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Link} from 'react-router-dom';
import {X} from 'lucide-react';

export default function MobileNavigation({onClose,isLoggedIn,children}) {
  const dialog=useRef(null);
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;},[onClose]);
  useEffect(()=>{
    const element=dialog.current,previous=document.activeElement;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    element.showModal();
    const desktop=window.matchMedia('(min-width: 1024px)');
    const resize=()=>{if(desktop.matches)close.current();};
    desktop.addEventListener('change',resize);
    return()=>{
      element.close();document.body.style.overflow=overflow;
      desktop.removeEventListener('change',resize);
      if(previous instanceof HTMLElement)previous.focus();
    };
  },[]);
  return createPortal(<dialog ref={dialog} id="mobile-navigation" className="customer-menu-drawer" aria-labelledby="navigation-title"
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}}>
    <div className="flex items-center justify-between border-b border-emerald-100 pb-4">
      <h2 id="navigation-title" className="text-lg font-semibold text-emerald-950">Belfiore Menu</h2>
      <button type="button" onClick={onClose} autoFocus aria-label="Close navigation menu" className="grid h-11 w-11 place-items-center rounded-full hover:bg-emerald-50"><X size={22}/></button>
    </div>
    <nav aria-label="Mobile navigation" className="mt-4 grid gap-2">{children}</nav>
    <div className="mt-5 grid gap-2 border-t border-emerald-100 pt-4">
      {(isLoggedIn?[['/profile','My Profile'],['/orders','My Orders'],['/addresses','Saved Addresses']]:[['/login','Login'],['/signup','Sign Up']]).map(([to,label])=><Link key={to} to={to} onClick={onClose} className="rounded-xl px-3 py-3 font-semibold text-emerald-900 hover:bg-emerald-50">{label}</Link>)}
    </div>
  </dialog>,document.body);
}
