import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiNotifications, apiNotificationCount, apiReadNotification, apiReadAllNotifications } from '../api/client';

const button='rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-emerald-800 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-40';
const defaultApi={list:apiNotifications,count:apiNotificationCount,read:apiReadNotification,readAll:apiReadAllNotifications};
export default function NotificationBell({api=defaultApi,ordersPath='/admin/orders'}) {
  const navigate=useNavigate();
  const [unread,setUnread]=useState(0);
  const [open,setOpen]=useState(false);
  const [all,setAll]=useState(false);
  const [page,setPage]=useState(1);
  const [data,setData]=useState({notifications:[],total:0,throughId:'0'});
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const dialog=useRef(null);
  const inFlight=useRef(new Set());
  const version=useRef('');
  const mounted=useRef(true);
  const load=useCallback(async()=>{
    const key=open?`list:${page}:${all}`:'count';
    version.current=key;
    if(inFlight.current.has(key))return;
    inFlight.current.add(key);
    const requestVersion=key;
    if(open)setLoading(true);
    try {
      const result=open?await api.list({page,limit:all?25:10}):await api.count();
      if(!mounted.current||requestVersion!==version.current)return;
      setUnread(result.unread);if(open)setData(result);setError('');
    } catch(err){if(mounted.current&&requestVersion===version.current)setError(err.message);}
    finally{inFlight.current.delete(key);if(mounted.current&&requestVersion===version.current)setLoading(false);}
  },[open,page,all,api]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    // Closed polling fetches only a count; opening loads a bounded current page.
    const initial=setTimeout(load,50);
    const refresh=()=>{if(!document.hidden)load();};
    const timer=setInterval(refresh,20000);
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('belfiore-notifications-changed',refresh);
    return()=>{clearTimeout(initial);clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('belfiore-notifications-changed',refresh);};
  },[load]);
  useEffect(()=>{
    if(!open)return;
    dialog.current.showModal();
  },[open]);
  const mark=async id=>{
    setBusy(true);
    try{await api.read(id);await load();}catch(err){setError(err.message);}finally{setBusy(false);}
  };
  return <div className="relative">
    <button type="button" aria-label={`Order notifications, ${unread} unread`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);setPage(1);setAll(false);}} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-emerald-800 shadow-sm focus-visible:outline-2 focus-visible:outline-emerald-700">
      <Bell size={19} aria-hidden="true"/>{unread>0&&<span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-emerald-700 px-1 text-[10px] font-bold leading-4 text-white">{unread>99?'99+':unread}</span>}
    </button>
    {!open&&error&&<span role="status" className="sr-only">{error}</span>}
    {open&&<dialog ref={dialog} aria-labelledby="notifications-heading" onCancel={event=>{event.preventDefault();if(!busy)setOpen(false);}} onClick={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false);}}
      className="fixed bottom-auto left-auto right-3 top-16 m-0 max-h-[calc(100dvh_-_5rem)] w-[calc(100%_-_1.5rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/10 sm:right-6">
      <header className="flex items-center justify-between border-b border-slate-100 p-4"><h2 id="notifications-heading" className="text-sm font-bold">{all?'All Notifications':'Notifications'} <span className="text-xs font-normal text-slate-500">{unread} unread</span></h2><button aria-label="Close notifications" disabled={busy} className="rounded-lg p-2" onClick={()=>setOpen(false)}><X size={16}/></button></header>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2"><button className={button} disabled={busy||loading||!unread||data.throughId==='0'} onClick={async()=>{setBusy(true);try{await api.readAll(data.throughId);await load();}catch(err){setError(err.message);}finally{setBusy(false);}}}>Mark All as Read</button>{!all&&<button className={button} onClick={()=>{setAll(true);setPage(1);}}>View All Notifications</button>}</div>
      {error&&<p role="alert" className="p-3 text-xs text-red-700">{error} <button className="underline" onClick={load}>Retry</button></p>}
      {loading?<p className="p-5 text-sm text-slate-500">Loading notifications…</p>:!error&&data.notifications.length===0?<p className="p-5 text-sm text-slate-500">No new notifications.</p>:<ul className="divide-y divide-slate-100">{data.notifications.map(item=><li key={item.id} className={`p-4 ${item.is_read?'bg-white':'bg-emerald-50/60'}`}><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{item.title}</h3><span className="text-[10px] text-slate-500">{item.is_read?'Read':'Unread'}</span></div><p className="mt-1 text-xs text-slate-600">{item.message}</p><time dateTime={item.created_at} className="mt-1 block text-[11px] text-slate-500">{new Date(item.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} PHT</time><div className="mt-2 flex gap-2">{item.order_id?<button className={button} onClick={()=>{setOpen(false);navigate(`${ordersPath}?orderId=${encodeURIComponent(item.order_id)}&notificationId=${encodeURIComponent(item.id)}`);}}>View Order #{item.order_id}</button>:<span className="text-xs text-slate-500">Linked order unavailable</span>}{!item.is_read&&<button disabled={busy} className={button} onClick={()=>mark(item.id)}>Mark as Read</button>}</div></li>)}</ul>}
      {all&&<footer className="flex items-center justify-between border-t border-slate-100 p-3 text-xs"><button className={button} disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(data.total/25))}</span><button className={button} disabled={page*25>=data.total||loading} onClick={()=>setPage(p=>p+1)}>Next</button></footer>}
    </dialog>}
  </div>;
}
