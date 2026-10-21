import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardRefresh} from '../../src/utils/dashboardRefresh.js';
import {dashboardPeriod} from '../src/routes/dashboard.js';

test('Dashboard period validation uses Manila dates and exact month/year endpoints',()=>{
  const at=new Date('2026-12-31T16:00:00Z');
  assert.deepEqual(dashboardPeriod({},at),{period:'month',year:2027,month:1,from:'2027-01-01',to:'2027-01-31'});
  assert.equal(dashboardPeriod({period:'year',year:'2024'},at).to,'2024-12-31');
  assert.equal(dashboardPeriod({year:'2024',month:'2'},at).to,'2024-02-29');
  for(const q of [{period:'invalid'},{year:'2001;DROP'},{month:13},{month:0},{year:10000}])assert.throws(()=>dashboardPeriod(q,at));
});

test('Dashboard polling loads initially, ticks at 60s, pauses hidden, avoids overlap and retains valid data on failure',async()=>{
  const visibility=new EventTarget();visibility.hidden=false;
  let tick,interval,cleared=false,resolve,reject,calls=0,signal,lastData=null,error=null,busy=false;
  const lifecycle=dashboardRefresh({visibility,schedule:(fn,ms)=>{tick=fn;interval=ms;return 42;},cancel:id=>{assert.equal(id,42);cleared=true;},
    load:s=>{signal=s;calls++;return new Promise((yes,no)=>{resolve=yes;reject=no;});},onSuccess:d=>{lastData=d;error=null;},onError:e=>{error=e.message;},onBusy:b=>{busy=b;}});
  const flush=()=>new Promise(done=>setImmediate(done));
  assert.equal(calls,1);assert.equal(interval,60000);assert.equal(busy,true);
  tick();void lifecycle.refresh();assert.equal(calls,1);
  resolve({value:123,generatedAt:'success-1'});await flush();assert.equal(lastData.value,123);assert.equal(busy,false);
  visibility.hidden=true;tick();assert.equal(calls,1);
  visibility.hidden=false;visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,2);
  reject(new Error('Offline'));await flush();assert.equal(lastData.generatedAt,'success-1');assert.equal(error,'Offline');assert.equal(busy,false);
  void lifecycle.refresh();assert.equal(calls,3);resolve({value:124,generatedAt:'success-2'});await flush();assert.equal(lastData.value,124);
  tick();assert.equal(calls,4);lifecycle.dispose();assert.equal(signal.aborted,true);assert.equal(cleared,true);
  resolve({value:999});await flush();tick();visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,4);assert.equal(lastData.value,124);
});
