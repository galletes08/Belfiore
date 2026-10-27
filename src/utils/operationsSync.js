export const OPERATIONS_EVENT='belfiore-operations-changed';
export const OPERATIONS_STORAGE_KEY='belfiore-operations-version';
// Invalidation only: no account, product, order or customer data enters browser events.
export function notifyOperationsChanged(){
 if(typeof window==='undefined')return;
 try{window.localStorage.setItem(OPERATIONS_STORAGE_KEY,`${Date.now()}-${Math.random()}`);}catch{/* Storage may be disabled; focus/polling still refreshes. */}
 window.dispatchEvent(new Event(OPERATIONS_EVENT));
}
export function operationsViewIsEditing(){return Boolean(document.activeElement?.closest('form,dialog,[data-operations-editing]'));}
export function subscribeOperationsRefresh(refresh,{interval=15000}={}){
 let running=false,active=true;
 const update=async()=>{if(!active||document.hidden||running||operationsViewIsEditing())return;running=true;try{await refresh({quiet:true});}catch{/* The view owns its error state; a later refresh remains possible. */}finally{running=false;}};
 const storage=e=>{if(e.key===OPERATIONS_STORAGE_KEY)update();};
 const timer=setInterval(update,interval);
 window.addEventListener('focus',update);window.addEventListener(OPERATIONS_EVENT,update);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',update);
 return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener(OPERATIONS_EVENT,update);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',update);};
}
