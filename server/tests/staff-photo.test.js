import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import sharp from 'sharp';

test('Staff photo storage, ownership, validation and account security',{skip:!process.env.INVENTORY_TEST_DATABASE_URL},async t=>{
 const schema='staff_photo_'+crypto.randomBytes(6).toString('hex'),root=await fs.mkdtemp(path.join(os.tmpdir(),'belfiore-staff-photo-'));
 process.env.DATABASE_URL=process.env.INVENTORY_TEST_DATABASE_URL;process.env.PGOPTIONS=`-c search_path=${schema},public`;process.env.JWT_SECRET='isolated-staff-photo-tests';process.env.TRACK123_ENABLED='false';process.env.STORAGE_DRIVER='local';
 const {pool}=await import('../src/config/db.js'),{default:express}=await import('express'),{default:jwt}=await import('jsonwebtoken'),{default:bcrypt}=await import('bcryptjs');
 const {registerStaffPhoto}=await import('../src/routes/staff-photo.js'),{createStaffAvatarStorage}=await import('../src/utils/storage.js');
 let server;let storageFailure=false;const persistentStorage=createStaffAvatarStorage({root,remote:false});
 try{
  await pool.query(`CREATE SCHEMA ${schema}`);await pool.query(await fs.readFile(new URL('../src/db/schema.sql',import.meta.url),'utf8'));
  for(const name of (await fs.readdir(new URL('../src/db/migrations/',import.meta.url))).filter(n=>/^\d+.*\.sql$/.test(n)).sort())await pool.query(await fs.readFile(new URL('../src/db/migrations/'+name,import.meta.url),'utf8'));
  const pass='Photo ownership unique passphrase',hash=await bcrypt.hash(pass,12),ids={};
  for(const role of ['staff','admin','customer','rider'])ids[role]=(await pool.query("INSERT INTO users(first_name,last_name,username,email,role,status,password_hash,must_change_password) VALUES('Photo','Tester',$1,$2,$1,'active',$3,false) RETURNING id",[role,role+'@example.test',hash])).rows[0].id;
  ids.other=(await pool.query("INSERT INTO users(first_name,username,role,status,password_hash) VALUES('Other','other-staff','staff','active',$1) RETURNING id",[hash])).rows[0].id;
  const app=express();app.use(express.json());registerStaffPhoto(app,{db:pool,storage:{save:buffer=>{if(storageFailure)throw Error("Isolated storage failure");return persistentStorage.save(buffer);}}});app.use('/uploads',express.static(root));
  app.use((await import('../src/routes/operations-staff.js')).default);app.use((await import('../src/routes/auth.js')).default);
  const start=async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return `http://127.0.0.1:${server.address().port}`;};let base=await start();
  const token=(role='staff',id=ids[role],version=0)=>jwt.sign({role,userId:id,sessionVersion:version},process.env.JWT_SECRET,{expiresIn:'1h'});
  const request=async(url,{role='staff',bearer=token(role),method='GET',body}={})=>{const response=await fetch(base+url,{method,headers:{...(bearer?{Authorization:'Bearer '+bearer}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json().catch(()=>({}))};};
  const row=async(id=ids.staff)=>(await pool.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];
  const upload=async(buffer,type='image/jpeg',opts={})=>{const data=new FormData();data.append('photo',new Blob([buffer],{type}),'../../untrusted.php');data.append('expectedPhoto',opts.expected??((await row()).staff_profile_image_path||''));return request('/api/staff/profile/photo',{method:'POST',body:data,...opts});};
  const image=async(format)=>sharp({create:{width:48,height:32,channels:3,background:'#0e7850'}})[format]().toBuffer();
  const jpeg=await image('jpeg');
  const resetLimit=()=>pool.query("DELETE FROM auth_security_buckets WHERE key LIKE 'staff-photo:%'");
  await t.test('JPEG, PNG and WebP normalize to managed 512px JPEGs, persist and match Admin/Staff references',async()=>{
   const before=await row();let previous='';
   for(const [format,mime] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']]){
    const result=await upload(await image(format),mime);assert.equal(result.status,200,JSON.stringify(result));const profile=result.data.profile;
    assert.match(profile.staff_profile_image_path,/^staff\/[a-f0-9-]{36}\.jpg$/);assert.notEqual(profile.staff_profile_image_path,previous);
    const bytes=await fs.readFile(path.join(root,profile.staff_profile_image_path)),meta=await sharp(bytes).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.exif,undefined);
    assert.equal((await request('/api/staff/profile')).data.profile_image_url,profile.profile_image_url);
    const admin=await request('/api/admin/staff',{role:'admin'});assert.equal(admin.data.find(s=>String(s.id)===String(ids.staff)).profile_image_url,profile.profile_image_url);
    if(previous)await fs.access(path.join(root,previous));previous=profile.staff_profile_image_path;
   }
   const after=await row();for(const field of ['id','username','password_hash','role','status','auth_version','last_login_at'])assert.deepEqual(after[field],before[field]);
   assert.equal((await row(ids.other)).staff_profile_image_path,null);
  });
  await t.test('Content spoofing, SVG, damaged files, oversized files and excessive dimensions preserve the existing photo',async()=>{
   await resetLimit();const before=(await row()).staff_profile_image_path;
   const cases=[[Buffer.from('<svg onload="alert(1)"/>'),'image/png'],[Buffer.from('not an image'),'image/jpeg'],[jpeg.subarray(0,40),'image/jpeg'],[jpeg,'image/gif'],[await image('png'),'image/jpeg'],[Buffer.alloc(2*1024*1024+1),'image/jpeg']];
   for(const [buffer,mime] of cases)assert.equal((await upload(buffer,mime)).status,400);
   const big=await sharp({create:{width:17000,height:1000,channels:3,background:'#ffffff'}}).png().toBuffer();assert.equal((await upload(big,'image/png')).status,400);
   assert.equal((await row()).staff_profile_image_path,before);
  });
  await t.test('Only current active Staff can mutate their own picture; no IDs or arbitrary paths are trusted',async()=>{
   await resetLimit();for(const role of ['admin','rider','customer'])assert.equal((await upload(jpeg,'image/jpeg',{role})).status,403);
   assert.equal((await upload(jpeg,'image/jpeg',{bearer:''})).status,401);
   assert.equal((await upload(jpeg,'image/jpeg',{bearer:token('staff',ids.staff,1)})).status,401);
   const before=(await row()).staff_profile_image_path;
   const form=new FormData();form.append('photo',new Blob([jpeg],{type:'image/jpeg'}),'photo.jpg');form.append('expectedPhoto',before);form.append('staffId',String(ids.other));
   assert.equal((await request('/api/staff/profile/photo',{method:'POST',body:form})).status,400);
   assert.equal((await upload(jpeg,'image/jpeg',{expected:'../../another-account.jpg'})).status,409);
   await pool.query('UPDATE users SET must_change_password=true WHERE id=$1',[ids.staff]);assert.equal((await upload(jpeg)).status,403);await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[ids.staff]);
   await pool.query("UPDATE users SET status='disabled' WHERE id=$1",[ids.staff]);assert.equal((await upload(jpeg)).status,401);await pool.query("UPDATE users SET status='active' WHERE id=$1",[ids.staff]);
   assert.equal((await row()).staff_profile_image_path,before);assert.equal((await row(ids.other)).staff_profile_image_path,null);
  });
  await t.test('Concurrent duplicate saves have one winner and one audit event; restarts retain the saved image',async()=>{
   await resetLimit();const expected=(await row()).staff_profile_image_path;
   const before=Number((await pool.query("SELECT COUNT(*) FROM staff_activity WHERE action='Profile Photo Updated'")).rows[0].count);
   const results=await Promise.all([upload(jpeg,'image/jpeg',{expected}),upload(jpeg,'image/jpeg',{expected})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
   assert.equal(Number((await pool.query("SELECT COUNT(*) FROM staff_activity WHERE action='Profile Photo Updated'")).rows[0].count),before+1);
   const saved=await row();await new Promise(resolve=>server.close(resolve));base=await start();
   assert.equal((await request('/api/staff/profile')).data.staff_profile_image_path,saved.staff_profile_image_path);
   const response=await fetch(base+'/uploads/'+saved.staff_profile_image_path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/jpeg/);
   assert.equal((await fetch(base+'/uploads/staff/')).status,404);
   assert.equal((await request('/api/auth/login',{method:'POST',bearer:'',body:{identifier:'staff',password:pass,workspace:'staff'}})).status,200);
   assert.equal((await row()).staff_profile_image_path,saved.staff_profile_image_path);
  });
  await t.test('Name edits preserve the photo and permissions; confirmed removal clears only its reference and keeps historical files',async()=>{
   await resetLimit();const before=await row();
   assert.equal((await request('/api/staff/profile',{method:'PATCH',body:{firstName:'Updated',lastName:'Staff',role:'admin',status:'disabled',username:'changed',staff_profile_image_path:'arbitrary'}})).status,200);
   const after=await row();assert.equal(after.staff_profile_image_path,before.staff_profile_image_path);for(const field of ['role','status','username'])assert.equal(after[field],before[field]);
   assert.equal((await request('/api/staff/profile/photo',{method:'DELETE',body:{expectedPhoto:before.staff_profile_image_path}})).status,400);
   assert.equal((await request('/api/staff/profile/photo',{method:'DELETE',body:{confirmed:true,expectedPhoto:'old-version'}})).status,409);
   const removed=await request('/api/staff/profile/photo',{method:'DELETE',body:{confirmed:true,expectedPhoto:before.staff_profile_image_path}});assert.equal(removed.status,200);assert.equal(removed.data.profile.profile_image_url,'');assert.equal((await row()).staff_profile_image_path,null);
   await fs.access(path.join(root,before.staff_profile_image_path));assert.equal((await row(ids.other)).staff_profile_image_path,null);
   const logs=(await pool.query("SELECT * FROM staff_activity WHERE action LIKE 'Profile Photo %'")).rows;assert.ok(logs.every(l=>String(l.staff_id)===String(ids.staff)&&String(l.actor_id)===String(ids.staff)));assert.ok(!JSON.stringify(logs).includes('Bearer'));
  });
  await t.test('Storage failure preserves the old photo and additive migration is repeatable',async()=>{
   await resetLimit();assert.equal((await upload(jpeg)).status,200);const before=(await row()).staff_profile_image_path;
   storageFailure=true;const failed=await upload(jpeg);storageFailure=false;assert.equal(failed.status,503);assert.equal((await row()).staff_profile_image_path,before);
   await pool.query(await fs.readFile(new URL('../src/db/migrations/022_staff_profile_photo.sql',import.meta.url),'utf8'));assert.equal((await row()).staff_profile_image_path,before);
  });
  await t.test('Upload rate limiting is independent of authentication and enforces a bounded mutation window',async()=>{
   await resetLimit();for(let n=0;n<20;n++)assert.equal((await upload(Buffer.from('invalid'))).status,400);assert.equal((await upload(jpeg)).status,429);await resetLimit();
  });
  await t.test('Existing Staff password policy and session revocation remain intact',async()=>{
   assert.equal((await request('/api/auth/password',{method:'PATCH',body:{currentPassword:pass,newPassword:'short'}})).status,400);
   assert.equal((await request('/api/auth/password',{method:'PATCH',body:{currentPassword:pass,newPassword:pass+' changed'}})).status,200);
   assert.equal((await request('/api/staff/profile')).status,401);
   assert.equal((await request('/api/auth/login',{method:'POST',bearer:'',body:{identifier:'staff',password:pass+' changed',workspace:'staff'}})).status,200);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();
  // Only the test-owned directory returned by mkdtemp is removed.
  if(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('belfiore-staff-photo-'))await fs.rm(root,{recursive:true,force:true});
 }
});
