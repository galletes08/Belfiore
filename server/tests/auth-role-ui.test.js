import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';

test('Shared workforce login preserves simultaneous role sessions, request credentials and independent logout',async()=>{
  const storage=new Map();
  const previous={localStorage:globalThis.localStorage,fetch:globalThis.fetch};
  globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  const token=role=>'e30.'+Buffer.from(JSON.stringify({role,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
  const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try{
    const client=await vite.ssrLoadModule('/src/api/client.js');
    const staff=await vite.ssrLoadModule('/src/staff/staffApi.js');
    const {default:AdminGuard}=await vite.ssrLoadModule('/src/admin/AdminProtectedRoute.jsx');
    const {default:Login}=await vite.ssrLoadModule('/src/admin/AdminLogin.jsx');
    for(const path of ['/admin/login','/staff/login'])assert.match(renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[path]},createElement(Login))),/operations staff or rider account/);
    client.setCustomerToken(token('customer'));client.setCustomerUser({id:30,role:'customer'});
    for(const roles of [['admin','staff','rider'],['rider','staff','admin']]){
      for(const role of roles)client.saveWorkforceSession({token:token(role),user:{id:role==='admin'?1:2,role}});
      assert.equal(client.hasToken(),true);assert.equal(client.getAdminUser().role,'admin');
      assert.equal(staff.staffSession().token,token('staff'));assert.equal(client.hasRiderToken(),true);assert.equal(client.hasCustomerToken(),true);
      assert.match(renderToStaticMarkup(createElement(MemoryRouter,null,createElement(AdminGuard,null,'Admin workspace'))),/Admin workspace/);
      const requests=[];
      globalThis.fetch=async(url,options)=>{requests.push([String(url),options.headers.Authorization]);return Response.json([]);};
      await client.apiAdminOrders();await staff.staffApi('/api/staff/orders');await client.apiRiderOrders();
      assert.deepEqual(requests.map(row=>row[1]),['Bearer '+token('admin'),'Bearer '+token('staff'),'Bearer '+token('rider')]);
    }
    const before=[...storage];
    assert.throws(()=>client.saveWorkforceSession({token:token('customer'),user:{role:'customer'}}),/workforce/);
    assert.deepEqual([...storage],before,'invalid responses must not replace existing sessions');
    staff.clearStaff();assert.equal(staff.staffSession(),null);assert.equal(client.hasToken(),true);assert.equal(client.hasRiderToken(),true);
    client.saveWorkforceSession({token:token('staff'),user:{role:'staff'}});
    client.clearToken();assert.equal(client.hasToken(),false);assert.ok(staff.staffSession());assert.equal(client.hasCustomerToken(),true);
    client.clearRiderToken();assert.ok(staff.staffSession());assert.equal(client.hasCustomerToken(),true);
  }finally{
    await vite.close();
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
});

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
