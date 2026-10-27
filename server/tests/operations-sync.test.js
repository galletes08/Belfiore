import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyOperationsChanged,subscribeOperationsRefresh,OPERATIONS_EVENT,OPERATIONS_STORAGE_KEY} from '../../src/utils/operationsSync.js';

test('Operational refresh handles cross-tab invalidation/focus/polling without draft loss, private payloads or overlapping requests',async()=>{
 const previous={window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 let tick,editing=false,count=0,cleared=false,release,dispose;
 const stored=[];globalThis.window=new EventTarget();window.localStorage={setItem:(key,value)=>stored.push({key,value})};
 globalThis.document=new EventTarget();document.hidden=false;document.activeElement={closest:()=>editing?{}:null};
 globalThis.setInterval=fn=>{tick=fn;return 1;};globalThis.clearInterval=()=>{cleared=true;};
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  dispose=subscribeOperationsRefresh(async options=>{assert.equal(options.quiet,true);count++;if(count===1)await new Promise(r=>{release=r;});});
  window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event(OPERATIONS_EVENT));assert.equal(count,1);release();await flush();
  window.dispatchEvent(Object.assign(new Event('storage'),{key:'unrelated-session-key'}));assert.equal(count,1);
  window.dispatchEvent(Object.assign(new Event('storage'),{key:OPERATIONS_STORAGE_KEY}));await flush();assert.equal(count,2);
  editing=true;notifyOperationsChanged();await tick();assert.equal(count,2);assert.equal(stored[0].key,OPERATIONS_STORAGE_KEY);assert.match(stored[0].value,/^\d+-/);
  editing=false;document.hidden=true;window.dispatchEvent(new Event('focus'));await tick();assert.equal(count,2);
  document.hidden=false;await tick();assert.equal(count,3);
  dispose();window.dispatchEvent(new Event(OPERATIONS_EVENT));await tick();assert.equal(count,3);assert.equal(cleared,true);
 }finally{dispose?.();for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
