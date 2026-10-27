import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {filterStaffDirectory,staffDirectoryCounts,staffInitials,staffTimestamp} from '../../src/utils/staffDirectory.js';
import {STAFF_PERMISSIONS} from '../../shared/staffPermissions.js';

const records=[
 {id:27,role:'staff',first_name:'Alliah',last_name:'Terible',username:'alliah',status:'active',created_at:'2026-10-01T00:00:00Z',last_login_at:'2026-10-27T08:15:00Z'},
 {id:35,role:'staff',first_name:'Zoe',last_name:'Cruz',username:'zoe-c',status:'disabled',email:null,created_at:'2026-10-25T00:00:00Z',last_login_at:null},
 {id:4,role:'admin',first_name:'Admin',username:'admin',status:'active'},
];
test('Staff counts exclude other roles and combine name/username/ID search with actual status',()=>{
 assert.deepEqual(staffDirectoryCounts(records),{total:2,active:1,inactive:1});
 for(const query of ['aLLiAh','terible','@alliah'.slice(1),'#27','Staff #27'])assert.deepEqual(filterStaffDirectory(records,{query}).map(s=>s.id),[27]);
 assert.deepEqual(filterStaffDirectory(records,{query:'ZOE-C',status:'disabled'}).map(s=>s.id),[35]);
 assert.equal(filterStaffDirectory(records,{query:'Zoe',status:'active'}).length,0);
 assert.equal(filterStaffDirectory(records,{query:'missing'}).length,0);
 assert.deepEqual(staffDirectoryCounts([...records,{...records[1],id:36,status:'active'}]),{total:3,active:2,inactive:1});
 assert.deepEqual(staffDirectoryCounts(records.map(s=>s.id===27?{...s,status:'disabled'}:s)),{total:2,active:0,inactive:2});
});
test('Staff sorting is stable, never mutates input, and missing login dates sort last',()=>{
 const before=JSON.stringify(records);
 assert.deepEqual(filterStaffDirectory(records).map(s=>s.id),[27,35]);
 assert.deepEqual(filterStaffDirectory(records,{sort:'name-desc'}).map(s=>s.id),[35,27]);
 assert.deepEqual(filterStaffDirectory(records,{sort:'recent'}).map(s=>s.id),[35,27]);
 assert.deepEqual(filterStaffDirectory(records,{sort:'login'}).map(s=>s.id),[27,35]);
 assert.equal(JSON.stringify(records),before);
 assert.equal(staffInitials(records[0]),'AT');
 const time=staffTimestamp(records[0].last_login_at);assert.match(time,/4:15/);assert.match(time,/PHT$/);
 assert.equal(staffTimestamp(null,'Never logged in'),'Never logged in');
});
test('Admin Staff directory and account workflows render shared Belfiore controls and safe read-only permissions',async t=>{
 const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
 try{
  const {default:Directory,StaffDirectory}=await vite.ssrLoadModule('/src/admin/AdminStaff.jsx');
  const {default:Drawer,StaffAccountAction}=await vite.ssrLoadModule('/src/admin/StaffAccountDrawer.jsx');
  const render=element=>renderToStaticMarkup(createElement(MemoryRouter,null,element));
  const noop=()=>{};
  const props={staff:records[1],setTab:noop,setEditing:noop,onClose:noop,onSave:noop,activity:{rows:[],page:1,loading:false,error:''},setActivityPage:noop,retryActivity:noop};
  await t.test('Header, summary, loading, search and status/sort controls',()=>{
   const html=render(createElement(Directory));
   for(const text of ['Team &amp; Access','Staff Management','Manage operations staff and account access.','Create Staff','Total Staff','Active Staff','Inactive Staff','Search name, username, or Staff ID...','All Staff','Inactive','Reset Filters','Loading staff'])assert.ok(html.includes(text),text);
  });
  await t.test('Responsive rows display identity, actual status, PHT login and compact actions',()=>{
   const html=render(createElement(StaffDirectory,{records:records.slice(0,2),onOpen:noop}));
   for(const text of ['Alliah Terible','@alliah','Zoe Cruz','Inactive','Never logged in','PHT','View / Edit','aria-haspopup="menu"','md:hidden','md:block'])assert.ok(html.includes(text),text);
   assert.ok(!html.includes('password_hash'));
  });
  await t.test('Profile exposes current values, initials, optional-email empty state and no role editor',()=>{
   const html=render(createElement(Drawer,{...props,tab:'Profile'}));
   for(const text of ['Staff Account','Zoe Cruz','Staff ID #35','Profile','Access','Activity','Not provided','Operations Staff','Never logged in','Edit Profile','aria-selected="true"'])assert.ok(html.includes(text),text);
   assert.ok(!html.includes('name="role"'));
   const edit=render(createElement(Drawer,{...props,tab:'Profile',editing:true}));
   assert.ok(edit.includes('value="Zoe"'));assert.ok(edit.includes('Username (read-only)'));assert.ok(edit.includes('readOnly=""'));assert.ok(edit.includes('Save Changes'));
  });
  await t.test('Access lists the actual shared backend manifest without editable grants',()=>{
   const html=render(createElement(Drawer,{...props,tab:'Access'}));
   for(const text of ['Access &amp; Permissions','Read-only role permissions','Configure rider / logistics delivery','Authorized operational order status updates','administrator-only'])assert.ok(html.includes(text),text);
   assert.ok(STAFF_PERMISSIONS.has('orders.assign_rider'));assert.ok(!STAFF_PERMISSIONS.has('staff.manage'));
   assert.ok(!html.includes('type="checkbox"'));
  });
  await t.test('Activity reuses supplied history and has loading/error/empty/pagination states',()=>{
   assert.ok(render(createElement(Drawer,{...props,tab:'Activity'})).includes('No activity recorded yet.'));
   const rows=[{id:'operation-1',action:'Stock In',product_id:86,reason:'Verified harvest',created_at:'2026-10-27T08:15:00Z'}];
   const html=render(createElement(Drawer,{...props,tab:'Activity',activity:{rows,page:1,loading:false,error:''}}));
   for(const text of ['Stock In','Product #86','Verified harvest','PHT','Previous','Next'])assert.ok(html.includes(text),text);
   assert.ok(render(createElement(Drawer,{...props,tab:'Activity',activity:{rows:[],page:1,loading:false,error:'Service unavailable'}})).includes('Retry'));
  });
  await t.test('Create/reset/status dialogs preserve secure inputs, verification and explicit confirmation',()=>{
   const create=render(createElement(StaffAccountAction,{mode:'create',onClose:noop,onSubmit:noop}));
   for(const text of ['Assigned username','Email (optional)','Temporary password','type="password"','minLength="15"','Cancel'])assert.ok(create.includes(text),text);
   const reset=render(createElement(StaffAccountAction,{mode:'reset',staff:records[0],onClose:noop,onSubmit:noop}));
   for(const text of ['Identity verification reference','I verified this staff member','Existing sessions will be revoked','name="confirmed"'])assert.ok(reset.includes(text),text);
   const deactivate=render(createElement(StaffAccountAction,{mode:'status',staff:records[0],onClose:noop,onSubmit:noop}));
   assert.ok(deactivate.includes('Deactivate this staff account? The staff member will lose access to the Staff Portal.'));
   const activate=render(createElement(StaffAccountAction,{mode:'status',staff:records[1],onClose:noop,onSubmit:noop}));assert.ok(activate.includes('Activate this staff account?'));
  });
 }finally{await vite.close();}
});
