import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {staffPhotoFileError,staffPasswordFormError} from '../../src/utils/staffAccountValidation.js';
import {STAFF_PHOTO_MAX_BYTES} from '../../shared/staffPhotoPolicy.js';
import {notifyStaffProfileChanged,publishStaffProfile,STAFF_PROFILE_EVENT,STAFF_PROFILE_STORAGE} from '../../src/utils/staffProfileSync.js';

test('Profile synchronization shares the confirmed profile locally and only an invalidation marker across tabs',()=>{
 const previous=globalThis.window,events=[],writes=[];
 globalThis.window={dispatchEvent:event=>events.push(event),localStorage:{setItem:(key,value)=>writes.push({key,value})}};
 try{
  const profile={id:26,role:'staff',profile_image_url:'/uploads/staff/photo.jpg',email:'staff@example.test'};
  notifyStaffProfileChanged(profile);assert.equal(events[0].type,STAFF_PROFILE_EVENT);assert.equal(events[0].detail,profile);assert.equal(writes[0].key,STAFF_PROFILE_STORAGE);assert.match(writes[0].value,/^\d+$/);assert.ok(!JSON.stringify(writes).includes(profile.email));
  publishStaffProfile(profile);assert.equal(events.length,2);assert.equal(writes.length,1);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});

test('Client image limits match the shared backend policy and password confirmation retains Staff policy',()=>{
 for(const type of ['image/jpeg','image/png','image/webp'])assert.equal(staffPhotoFileError({type,size:STAFF_PHOTO_MAX_BYTES}),'');
 for(const file of [null,{type:'image/svg+xml',size:20},{type:'image/png',size:0},{type:'image/jpeg',size:STAFF_PHOTO_MAX_BYTES+1}])assert.match(staffPhotoFileError(file),/2 MB/);
 assert.match(staffPasswordFormError({newPassword:'Strong garden passphrase',confirmPassword:'different'}),/do not match/);
 assert.match(staffPasswordFormError({newPassword:'short',confirmPassword:'short'}),/15/);
 assert.equal(staffPasswordFormError({newPassword:'Strong garden passphrase',confirmPassword:'Strong garden passphrase'}),'');
 assert.match(staffPasswordFormError({newPassword:'🌿'.repeat(30),confirmPassword:'🌿'.repeat(30)}),/UTF-8/);
});
test('Staff photo/profile presentation reuses the same avatar and preserves compact secure account controls',async t=>{
 const vite=await createServer({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),appType:'custom',esbuild:{jsx:'automatic'},server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
 try{
  const {default:Account,StaffPasswordForm}=await vite.ssrLoadModule('/src/staff/StaffAccount.jsx'),{default:PhotoDialog}=await vite.ssrLoadModule('/src/staff/StaffPhotoDialog.jsx'),{default:Avatar}=await vite.ssrLoadModule('/src/components/StaffAvatar.jsx'),{default:Layout}=await vite.ssrLoadModule('/src/staff/StaffLayout.jsx'),{StaffDirectory}=await vite.ssrLoadModule('/src/admin/AdminStaff.jsx');
  const staff={id:26,role:'staff',username:'kevin_1',first_name:'Kevin',last_name:'Reyes',status:'active',email:null,profile_image_url:'/uploads/staff/11111111-1111-1111-1111-111111111111.jpg',staff_profile_image_path:'staff/11111111-1111-1111-1111-111111111111.jpg'};
  const render=element=>renderToStaticMarkup(createElement(MemoryRouter,null,element)),noop=()=>{};
  await t.test('Header has the real identity, photo, role, status and Change Photo with no duplicate Sign Out card',()=>{
   const html=render(createElement(Account,{data:staff,refresh:noop}));
   for(const text of ['Kevin Reyes','kevin_1','Operations Staff','Active','Change Photo','h-24 w-24','object-cover','Password &amp; Security','<details','<summary','Confirm new password'])assert.ok(html.includes(text),text);
   assert.ok(!html.includes('Sign Out'));assert.ok(!html.includes('<details open'));
   assert.ok(html.includes('Email (optional, read-only)'));assert.ok(!html.includes('name="role"'));assert.ok(!html.includes('name="email"'));
  });
  await t.test('Photo editor has a circular current image, accepted types, Save/Cancel and conditional Remove Photo',()=>{
   const html=render(createElement(PhotoDialog,{profile:staff,onClose:noop,onSaved:noop}));
   for(const text of ['Update Profile Picture','Current photo','Select Photo','image/jpeg,image/png,image/webp','Save Photo','Cancel','Remove Photo','2 MB'])assert.ok(html.includes(text),text);
   assert.ok(!html.includes('Selected profile picture preview'));
   const empty=render(createElement(PhotoDialog,{profile:{...staff,profile_image_url:'',staff_profile_image_path:null},onClose:noop,onSaved:noop}));assert.ok(!empty.includes('Remove Photo'));
  });
  await t.test('Sidebar and Admin directory reuse the same stored image; absent photos use the same initials',()=>{
   const account=render(createElement(Avatar,{staff})),directory=render(createElement(StaffDirectory,{records:[staff],onOpen:noop})),sidebar=render(createElement(Layout,{session:{token:'test',userId:26},account:staff,onSignOut:noop}));
   for(const html of [account,directory,sidebar])assert.ok(html.includes(staff.profile_image_url));
   assert.ok(sidebar.includes('Sign Out'));
   const fallback=render(createElement(Avatar,{staff:{...staff,profile_image_url:''}}));assert.ok(fallback.includes('KR'));assert.ok(!fallback.includes('<img'));
  });
  await t.test('Password form has confirmation and Show/Hide controls and uses existing password API input names',()=>{
   const html=render(createElement(StaffPasswordForm));
   for(const text of ['name="currentPassword"','name="newPassword"','name="confirmPassword"','Show current password','Show new password','Show confirm new password','15–64','72 UTF-8'])assert.ok(html.includes(text),text);
  });
 }finally{await vite.close();}
});
