// Small dependency-free lifecycle so polling behavior can be tested with a fake clock.
export function dashboardRefresh({load,onSuccess,onError,onBusy,visibility=document,schedule=setInterval,cancel=clearInterval}) {
  let disposed=false,inFlight=false;
  const controller=new AbortController();
  async function refresh() {
    if(disposed||inFlight)return;
    inFlight=true;onBusy(true);
    try{const data=await load(controller.signal);if(!disposed)onSuccess(data);}
    catch(error){if(!disposed&&error.name!=='AbortError')onError(error);}
    finally{inFlight=false;if(!disposed)onBusy(false);}
  }
  const visibleRefresh=()=>{if(!visibility.hidden)void refresh();};
  const timer=schedule(visibleRefresh,60000);
  visibility.addEventListener('visibilitychange',visibleRefresh);
  void refresh();
  return {refresh,dispose(){disposed=true;controller.abort();cancel(timer);visibility.removeEventListener('visibilitychange',visibleRefresh);}};
}
