import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {summarizeCustomerOrders} from '../../src/utils/customerDashboard.js';

test('Customer dashboard counts unique real orders, excludes stale terminal tracking and selects the latest date',()=>{
  const orders=[{id:1,status:'Delivered',trackingStatus:'Out for Delivery',createdAt:'2026-01-01'},
    {id:2,status:'Cancelled',trackingStatus:'In Transit',createdAt:'2026-01-05'},
    {id:3,status:'Preparing',trackingStatus:'Packed',createdAt:'2026-01-03'},
    {id:4,status:'Out for Delivery',trackingStatus:'In Transit',createdAt:'2026-01-04'}];
  const summary=summarizeCustomerOrders([...orders,orders[0]]);
  assert.equal(summary.total,4);assert.equal(summary.delivered,1);assert.equal(summary.inTransit,1);assert.equal(summary.latest.id,2);
  assert.deepEqual(summarizeCustomerOrders(),{latest:null,total:0,inTransit:0,delivered:0});
});

test('Flat account navigation and password form preserve routes, collapse by default and omit unsupported payment entry',async t=>{
  const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try{
    const {default:Sidebar}=await vite.ssrLoadModule('/src/components/Signup/AccountSidebar.jsx');
    const {default:Settings}=await vite.ssrLoadModule('/src/components/Signup/AccountSettings.jsx');
    const render=(Component,path,props={})=>renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[path]},createElement(Component,props)));
    for(const path of ['/dashboard','/orders','/profile','/addresses','/change-password'])await t.test(path+' has a current link and all six flat destinations',()=>{
      const html=render(Sidebar,path,{onLogout:()=>{}});
      for(const href of ['/dashboard','/orders','/profile','/addresses','/change-password','/login'])assert.ok(html.includes('href="'+href+'"'));
      assert.match(html,/aria-current="page"/);assert.match(html,/aria-expanded="false"/);assert.ok(!html.includes('Bank &amp; Cards'));assert.ok(!html.includes('/banks-cards'));
    });
    await t.test('Password fields are secure by default with independent reveal controls and no saved-card fields',()=>{
      const html=render(Settings,'/change-password',{section:'password'});
      assert.equal((html.match(/type="password"/g)||[]).length,3);
      assert.match(html,/current-password/);assert.match(html,/new-password/);assert.match(html,/Show confirm new password/);
      assert.match(html,/Update Password/);assert.ok(!html.includes('CreditCard'));
    });
  }finally{await vite.close();}
});
