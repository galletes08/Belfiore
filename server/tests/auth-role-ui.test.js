import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';

test('Customer sessions reject cached staff tokens after reload and validate login responses',async()=>{
  const storage=new Map();
  const previous={localStorage:globalThis.localStorage,window:globalThis.window,fetch:globalThis.fetch};
  globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  globalThis.window={dispatchEvent:()=>{}};
  const token=(role,exp=Math.floor(Date.now()/1000)+3600)=>'e30.'+Buffer.from(JSON.stringify({role,exp})).toString('base64url')+'.test';
  const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try{
    const client=await vite.ssrLoadModule('/src/api/client.js');
    const {default:CustomerProtectedRoute}=await vite.ssrLoadModule('/src/components/Signup/CustomerProtectedRoute.jsx');
    const protectedPage=()=>renderToStaticMarkup(createElement(MemoryRouter,null,createElement(CustomerProtectedRoute,null,'Private customer profile')));
    assert.equal(client.hasCustomerToken(),false,'clean browser has no customer session');
    assert.ok(!protectedPage().includes('Private customer profile'));
    for(const invalid of [token('admin'),token('rider'),token('customer',1),'malformed']) {
      storage.set('customerToken',invalid);storage.set('customerUser',JSON.stringify({role:'admin'}));storage.set('isLoggedIn','true');storage.set('customerEmail','staff@example.test');
      storage.set('adminToken','independent-staff-session');
      assert.equal(client.hasCustomerToken(),false);assert.equal(client.getCustomerUser(),null);
      assert.equal(storage.has('customerToken'),false);assert.equal(storage.has('customerEmail'),false);
      assert.equal(storage.get('adminToken'),'independent-staff-session');
      assert.ok(!protectedPage().includes('Private customer profile'));
    }
    client.setCustomerToken(token('customer'));client.setCustomerUser({id:123,role:'customer'});
    assert.equal(client.hasCustomerToken(),true);assert.equal(client.getCustomerUser().id,123);
    assert.ok(protectedPage().includes('Private customer profile'));
    for(const role of ['admin','rider']) {
      globalThis.fetch=async()=>({ok:true,json:async()=>({token:token(role),user:{role}})});
      await assert.rejects(()=>client.apiLogin('staff@example.test','irrelevant'),/Invalid email or password/);
      assert.equal(client.hasCustomerToken(),false);
    }
    globalThis.fetch=async()=>({ok:true,json:async()=>({token:token('customer'),user:{role:'customer'}})});
    await assert.rejects(()=>client.apiLogin('customer@example.test','irrelevant','staff'),/Invalid email or password/);
    assert.equal((await client.apiLogin('customer@example.test','irrelevant')).user.role,'customer');
  }finally{
    await vite.close();
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
});
