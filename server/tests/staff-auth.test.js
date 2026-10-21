import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import bcrypt from 'bcryptjs';
import {newStaffPasswordError} from '../../shared/staffPasswordPolicy.js';
import {authPolicy} from '../src/utils/authPolicy.js';

test('Staff login policy is configurable with bounded safe defaults',()=>{
  const old=process.env.AUTH_MAX_FAILED_ATTEMPTS;
  try{process.env.AUTH_MAX_FAILED_ATTEMPTS='3';assert.equal(authPolicy().maxFailures,3);process.env.AUTH_MAX_FAILED_ATTEMPTS='0';assert.equal(authPolicy().maxFailures,5);}
  finally{if(old===undefined)delete process.env.AUTH_MAX_FAILED_ATTEMPTS;else process.env.AUTH_MAX_FAILED_ATTEMPTS=old;}
});

test('Staff password policy rejects short, oversized and predictable passwords without truncation',async()=>{
  for(const password of ['short','password123456789','a'.repeat(20),'x'.repeat(65),'🌿'.repeat(30)])assert.ok(newStaffPasswordError(password));
  assert.equal(newStaffPasswordError('A unique garden passphrase 2026'), '');
  assert.equal(newStaffPasswordError('🌿'.repeat(15)+' garden'), '');
});

test('PostgreSQL staff authentication, isolated SMTP recovery and revocation', {skip:!process.env.INVENTORY_TEST_DATABASE_URL},async t=>{
  const schema='staff_auth_test_'+crypto.randomBytes(6).toString('hex');
  process.env.DATABASE_URL=process.env.INVENTORY_TEST_DATABASE_URL;
  process.env.PGOPTIONS=`-c search_path=${schema},public`;
  process.env.JWT_SECRET='isolated-staff-security-test-secret';
  process.env.AUTH_EMAIL_DELIVERY_ENABLED='true';
  process.env.EMAIL_PROVIDER='smtp';process.env.EMAIL_FROM='Belfiore Test <sender@example.test>';
  process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_USER='local-test';process.env.SMTP_PASSWORD='local-test';process.env.SMTP_SECURE='false';
  process.env.FRONTEND_URL='http://localhost:5173';
  const mails=[];let failMail=false;const sockets=new Set();
  const smtp=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.write('220 local.test ESMTP\r\n');
    let pending='',dataMode=false,lines=[];
    socket.on('data',chunk=>{
      pending+=chunk.toString();let end;
      while((end=pending.indexOf('\r\n'))!==-1) {
        const line=pending.slice(0,end);pending=pending.slice(end+2);
        if(dataMode) {if(line==='.') {dataMode=false;if(failMail)socket.write('451 Test delivery failure\r\n');else{mails.push(lines.join('\r\n'));socket.write('250 Accepted by test SMTP\r\n');}lines=[];}else lines.push(line);continue;}
        if(/^EHLO|^HELO/.test(line))socket.write('250-local.test\r\n250 AUTH PLAIN\r\n');
        else if(/^AUTH/.test(line))socket.write('235 Authenticated\r\n');
        else if(/^DATA/.test(line)){dataMode=true;socket.write('354 End with dot\r\n');}
        else if(/^QUIT/.test(line)){socket.end('221 Bye\r\n');}
        else socket.write('250 OK\r\n');
      }
    });
  });
  smtp.listen(0,'127.0.0.1');await new Promise(resolve=>smtp.once('listening',resolve));process.env.SMTP_PORT=String(smtp.address().port);
  const {pool}=await import('../src/config/db.js');const {default:express}=await import('express');const {default:jwt}=await import('jsonwebtoken');
  let server;
  const waitFor=async predicate=>{for(let i=0;i<300;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Timed out waiting for isolated test mail/audit');};
  const decode=m=>m.replace(/=\r\n/g,'').replace(/=3D/g,'=');
  const resetToken=m=>{const match=decode(m).match(/#token=([a-f0-9]{64})/);assert.ok(Boolean(match),'Test reset message contains a secure token');return match[1];};
  try {
    const actualPort=(await pool.query('SELECT inet_server_port() AS port')).rows[0].port;
    assert.equal(Number(actualPort),Number(new URL(process.env.INVENTORY_TEST_DATABASE_URL).port||5432),'Use only the explicitly selected test database');
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(await fs.readFile(new URL('../src/db/schema.sql',import.meta.url),'utf8'));
    // System Logs joins the real inventory/account audit tables, even in auth-only fixtures.
    await pool.query(await fs.readFile(new URL('../src/db/migrations/001_inventory.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/009_customer_account_activity.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/010_customer_profile_addresses.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/011_staff_auth_security.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/012_auth_email_settings.sql',import.meta.url),'utf8'));
    await pool.query('UPDATE auth_email_settings SET suspicious_login_alerts=true,password_reset_emails=true WHERE id=1');
    const password='ExistingStaffPassword123!';const hash=await bcrypt.hash(password,10);
    await pool.query("INSERT INTO users(id,email,role,status,password_hash) VALUES(1,'Admin@Example.test','admin','active',$1),(2,'rider@example.test','rider','active',$1),(3,'customer@example.test','customer','active',$1)",[hash]);
    await pool.query("SELECT setval(pg_get_serial_sequence('users','id'),(SELECT MAX(id) FROM users))");
    await pool.query(await fs.readFile(new URL('../src/db/migrations/013_rider_username_recovery.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/014_rider_management.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/015_rider_security_lock.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/016_admin_auth_security.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/017_checkout_receipts.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/018_customer_verification.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/019_gardening_supplies.sql',import.meta.url),'utf8'));
    const app=express();app.use(express.json());const {rejectDisabledCustomer,verifyRequestToken}=await import('../src/utils/auth.js');app.use(rejectDisabledCustomer);
    app.use((await import('../src/routes/auth.js')).default);
    app.use((await import('../src/routes/riders.js')).default);
    app.use((await import('../src/routes/logs.js')).default);
    app.get('/protected',(req,res)=>{try{res.json({role:verifyRequestToken(req).role});}catch(e){res.status(e.status).json({error:'Denied'});}});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
    async function post(path,body,headers={}) {const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
    const login=(email='admin@example.test',pw=password,headers)=>post('/api/auth/login',{email,password:pw,workspace:'staff'},headers);
    const forgot=email=>post('/api/auth/forgot-password',{email});
    const reset=(token,password='New unique garden passphrase 2026')=>post('/api/auth/reset-password',{token,password});
    // Explicit fixture cleanup in the isolated test schema, never an application unlock path.
    const clear=async()=>{await pool.query('DELETE FROM auth_security_buckets');await pool.query("UPDATE users SET rider_failed_attempts=0,rider_security_locked=false,rider_login_after_unlock_pending=false WHERE role='rider'");await pool.query("UPDATE users SET admin_failed_attempts=0,admin_restricted_until=NULL,admin_lock_incident=NULL WHERE role='admin'");};
    app.use((await import('../src/routes/customer-account.js')).default);
    app.use((await import('../src/routes/products.js')).default);
    app.use((await import('../src/routes/orders.js')).default);
    app.use((await import('../src/routes/customers.js')).default);
    app.use((await import('../src/routes/reports.js')).default);
    const {checkRoleSeparation}=await import('./roleSeparationChecks.js');
    await checkRoleSeparation({t,pool,post,base,password,clear});
    const {checkCustomerRegistration}=await import('./customerRegistrationChecks.js');
    await checkCustomerRegistration({t,pool,post,mails,setMailFailure:value=>{failMail=value;}});
    let oldAdmin,oldRider;
    await t.test('Staff emails fail closed while disabled or SMTP is incomplete, without weakening restrictions or creating reset tokens',async()=>{
      const admin=jwt.sign({userId:1,role:'admin',sessionVersion:0},process.env.JWT_SECRET);
      const settings=async(method,body,token=admin)=>{
        const r=await fetch(base+'/api/admin/auth-email-settings',{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};
      };
      process.env.AUTH_EMAIL_DELIVERY_ENABLED='false';
      const count=mails.length;
      const existing=await forgot('admin@example.test'),unknown=await forgot('absent@example.test');assert.deepEqual(existing,unknown);assert.match(existing.body.message,/unavailable/);
      assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_password_resets')).rows[0].n),0);
      for(let i=0;i<5;i++)assert.equal((await login('rider@example.test','wrong')).status,i===4?429:401);
      assert.equal((await login('rider@example.test')).status,429);
      assert.equal((await settings('GET')).body.alertsReady,false);
      assert.equal((await settings('PATCH',{suspiciousLoginAlerts:true,passwordResetEmails:true})).status,409);
      assert.equal((await settings('GET',null,jwt.sign({userId:2,role:'rider'},process.env.JWT_SECRET))).status,403);
      assert.equal((await settings('PATCH',{suspiciousLoginAlerts:true,passwordResetEmails:true},jwt.sign({userId:3,role:'customer'},process.env.JWT_SECRET))).status,403);
      process.env.AUTH_EMAIL_DELIVERY_ENABLED='true';const host=process.env.SMTP_HOST;delete process.env.SMTP_HOST;
      assert.match((await forgot('admin@example.test')).body.message,/unavailable/);assert.equal((await settings('PATCH',{suspiciousLoginAlerts:true,passwordResetEmails:true})).status,409);
      const status=(await settings('GET')).body;assert.equal(status.configured,false);assert.ok(status.missing.includes('SMTP_HOST'));assert.ok(!JSON.stringify(status).includes('local-test'));
      process.env.SMTP_HOST=host;
      assert.equal((await settings('PATCH',{suspiciousLoginAlerts:false,passwordResetEmails:false})).status,200);
      assert.equal((await settings('GET')).body.recoveryReady,false);assert.match((await forgot('admin@example.test')).body.message,/unavailable/);
      assert.equal(mails.length,count);assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_password_resets')).rows[0].n),0);
      const audit=(await pool.query('SELECT action FROM auth_security_events')).rows;
      assert.ok(audit.some(e=>e.action==='Security Alert Email Disabled'));assert.ok(audit.some(e=>e.action==='Password Reset Email Not Configured'));
      assert.ok(!audit.some(e=>e.action.endsWith('Email Accepted')));
      await clear();await pool.query('ALTER TABLE auth_email_settings RENAME TO auth_email_settings_test_unavailable');
      try {
        for(let i=0;i<5;i++)assert.equal((await login('rider@example.test','wrong')).status,i===4?429:401);
        assert.equal((await login('rider@example.test')).status,429);
        assert.match((await forgot('admin@example.test')).body.message,/unavailable/);
      }finally{await pool.query('ALTER TABLE auth_email_settings_test_unavailable RENAME TO auth_email_settings');}
      assert.equal((await settings('PATCH',{suspiciousLoginAlerts:true,passwordResetEmails:false})).status,200);
      let enabled=(await settings('GET')).body;assert.equal(enabled.alertsReady,true);assert.equal(enabled.recoveryReady,false);
      assert.equal((await settings('PATCH',{suspiciousLoginAlerts:false,passwordResetEmails:true})).status,200);
      enabled=(await settings('GET')).body;assert.equal(enabled.alertsReady,false);assert.equal(enabled.recoveryReady,true);
      assert.equal((await settings('PATCH',{suspiciousLoginAlerts:true,passwordResetEmails:true})).status,200);
      await clear();
    });
    await t.test('Existing Admin/Rider credentials retain routing roles; successful login resets applicable failures',async()=>{
      for(const [email,role] of [[' ADMIN@EXAMPLE.TEST ','admin'],['rider@example.test','rider']]) {
        assert.equal((await login(email,'wrong')).status,401);
        const r=await login(email);assert.equal(r.status,200);assert.equal(r.body.user.role,role);assert.equal(jwt.verify(r.body.token,process.env.JWT_SECRET).sessionVersion,0);
        if(role==='admin')oldAdmin=r.body.token;else oldRider=r.body.token;
      }
      const customer=await login('customer@example.test');assert.equal(customer.status,401);assert.equal(customer.body.token,undefined);
      const counts=(await pool.query("SELECT count FROM auth_security_buckets WHERE key LIKE 'login:%'")).rows;assert.ok(counts.filter(b=>b.count===0).length>=2);
    });
    await t.test('Concurrent case-normalized failures enforce five attempts and one throttled security alert; lock does not extend',async()=>{
      await clear();const count=mails.length;
      const responses=await Promise.all(Array.from({length:8},(_,i)=>login(i%2?' Admin@Example.test ':'admin@example.test','wrong')));
      assert.equal(responses.filter(r=>r.status===401).length,4);assert.equal(responses.filter(r=>r.status===429).length,4);
      await waitFor(()=>mails.length===count+1);assert.ok(decode(mails.at(-1)).includes('Your account has been temporarily restricted'));assert.ok(!decode(mails.at(-1)).includes('#token='));
      const restriction=(await pool.query("SELECT blocked_until FROM auth_security_buckets WHERE key LIKE 'login:%'")).rows[0].blocked_until;
      assert.equal((await login()).status,429);
      assert.deepEqual((await pool.query("SELECT blocked_until FROM auth_security_buckets WHERE key LIKE 'login:%'")).rows[0].blocked_until,restriction);
      await pool.query("UPDATE auth_security_buckets SET blocked_until=NOW()-INTERVAL '1 second' WHERE key LIKE 'login:%'");await pool.query("UPDATE users SET admin_restricted_until=NOW()-INTERVAL '1 second' WHERE role='admin' AND admin_restricted_until IS NOT NULL");
      assert.equal((await login()).status,200);
      for(let i=0;i<5;i++)await login('admin@example.test','wrong');await waitFor(()=>mails.length===count+2);
    });
    await t.test('Unknown emails have identical failures/restrictions, and X-Forwarded-For cannot bypass IP limit',async()=>{
      await clear();const known=await login('admin@example.test','wrong');const unknown=await login('unknown@example.test','wrong');assert.deepEqual(unknown,known);
      for(let i=0;i<4;i++)await login('unknown@example.test','wrong');assert.equal((await login('unknown@example.test')).status,429);
      await clear();
      for(let i=0;i<31;i++){const r=await login(`unknown-${i}@example.test`,'wrong',{'X-Forwarded-For':`192.0.2.${i}`});assert.equal(r.status,i===30?429:401);}
    });
    await t.test('Forgot Password is generic, sends through isolated SMTP only for eligible staff, and throttles resends',async()=>{
      await clear();const count=mails.length;
      const known=await forgot('admin@example.test');assert.equal(known.status,200);
      assert.deepEqual(await forgot('absent@example.test'),known);assert.deepEqual(await forgot('customer@example.test'),known);
      await waitFor(()=>mails.length===count+1);const token=resetToken(mails.at(-1));
      const row=(await pool.query('SELECT * FROM auth_password_resets WHERE user_id=1 AND used_at IS NULL')).rows[0];assert.notEqual(row.token_hash,token);assert.equal(row.token_hash,crypto.createHash('sha256').update(token).digest('hex'));
      await forgot(' ADMIN@example.test ');assert.equal(mails.length,count+1);
      assert.equal((await reset(token,'short')).status,400);
    });
    await t.test('Expired tokens fail, concurrent reset is single-use, password is bcrypt-only and old Admin JWT is revoked',async()=>{
      const first=(await pool.query('SELECT id FROM auth_password_resets WHERE user_id=1 ORDER BY id DESC LIMIT 1')).rows[0];
      const expired=resetToken(mails.at(-1));await pool.query("UPDATE auth_password_resets SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[first.id]);assert.equal((await reset(expired)).status,400);
      await pool.query("UPDATE auth_security_buckets SET alert_sent_at=NOW()-INTERVAL '2 minutes' WHERE key LIKE 'reset-email:%'");const count=mails.length;await forgot('admin@example.test');await waitFor(()=>mails.length===count+1);const token=resetToken(mails.at(-1));
      const results=await Promise.all([reset(token),reset(token)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal((await reset(token)).status,400);
      const user=(await pool.query('SELECT * FROM users WHERE id=1')).rows[0];assert.equal(user.password,null);assert.ok(await bcrypt.compare('New unique garden passphrase 2026',user.password_hash));assert.equal(user.auth_version,1);assert.equal(user.role,'admin');
      assert.equal((await fetch(base+'/protected',{headers:{Authorization:'Bearer '+oldAdmin}})).status,401);
      assert.equal((await login()).status,401);assert.equal((await login('admin@example.test','New unique garden passphrase 2026')).status,200);
    });
    await t.test('Rider email recovery is never issued, while administrator mail failure stays generic and does not break login',async()=>{
      await clear();const count=mails.length;const r=await forgot('rider@example.test');assert.equal(r.status,200);
      await new Promise(resolve=>setTimeout(resolve,30));assert.equal(mails.length,count);
      assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_password_resets WHERE user_id=2')).rows[0].n),0);
      assert.equal((await fetch(base+'/protected',{headers:{Authorization:'Bearer '+oldRider}})).status,200);
      failMail=true;await clear();assert.equal((await forgot('admin@example.test')).status,200);
      await waitFor(async()=>Number((await pool.query("SELECT COUNT(*) AS n FROM auth_security_events WHERE action='Password Reset Email Failed'")).rows[0].n)>0);
      assert.equal((await login('admin@example.test','New unique garden passphrase 2026')).status,200);failMail=false;
      const logs=(await pool.query('SELECT * FROM auth_security_events')).rows;for(const action of ['Login Failed','Login Successful','Suspicious Login Attempts','Login IP Restricted','Admin Password Reset Requested','Admin Password Reset Completed'])assert.ok(logs.some(l=>l.action===action));
      const serialized=JSON.stringify(logs);assert.ok(!serialized.includes(password));assert.ok(!serialized.includes('New unique garden'));assert.ok(!serialized.includes('admin@example.test'));assert.ok(!serialized.includes('127.0.0.1'));
    });
    await t.test('Authenticated staff password changes enforce policy, invalidate outstanding reset links and revoke the old session',async()=>{
      await clear();const count=mails.length;await forgot('admin@example.test');await waitFor(()=>mails.length===count+1);const pendingToken=resetToken(mails.at(-1));
      const auth=await login('admin@example.test','New unique garden passphrase 2026');assert.equal(auth.status,200);
      const change=async newPassword=>{
        const r=await fetch(base+'/api/auth/password',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.body.token},body:JSON.stringify({currentPassword:'New unique garden passphrase 2026',newPassword})});return r.status;
      };
      assert.equal(await change('short'),400);assert.equal(await change('Another unique garden passphrase 2026'),200);
      assert.equal((await fetch(base+'/protected',{headers:{Authorization:'Bearer '+auth.body.token}})).status,401);
      assert.equal((await reset(pendingToken)).status,400);assert.equal((await reset('invalid')).status,400);
      assert.equal((await login('admin@example.test','Another unique garden passphrase 2026')).status,200);
    });
    await t.test('Administrator-managed username Riders need no email; reset requires verified confirmation, revokes sessions and enforces a personal password',async()=>{
      await clear();
      const version=(await pool.query('SELECT auth_version FROM users WHERE id=1')).rows[0].auth_version;
      const adminToken=jwt.sign({userId:1,role:'admin',sessionVersion:version},process.env.JWT_SECRET),headers={Authorization:'Bearer '+adminToken};
      const migrated=(await pool.query('SELECT username,must_change_password,password_hash FROM users WHERE id=2')).rows[0];assert.equal(migrated.username,'rider-2');assert.equal(migrated.must_change_password,false);assert.equal(migrated.password_hash,hash);
      // Alternate identifiers map to the same failure bucket, rather than five guesses per alias.
      for(let i=0;i<5;i++)assert.equal((await login(i%2?'rider@example.test':' RIDER-2 ','wrong')).status,i===4?429:401);
      assert.equal((await login('rider-2')).status,429);await clear();assert.equal((await login('rider-2')).status,200);
      const initial='Initial unique rider passphrase 2026';
      const payload={firstName:'Username',lastName:'Rider',phone:'09123456789',username:'farm-rider',password:initial,status:'active',isAvailable:true};
      assert.equal((await post('/api/admin/riders',payload)).status,401);
      const riderToken=jwt.sign({userId:2,role:'rider',sessionVersion:0},process.env.JWT_SECRET);
      assert.equal((await post('/api/admin/riders',payload,{Authorization:'Bearer '+riderToken})).status,403);
      const created=await post('/api/admin/riders',payload,headers);assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.email,'');assert.equal(created.body.username,'farm-rider');assert.equal(created.body.mustChangePassword,true);
      assert.equal(created.body.password,undefined);assert.equal(created.body.password_hash,undefined);
      const existing=(await pool.query("SELECT id,email,username FROM users WHERE username='farm-rider'")).rows[0];assert.equal(existing.email,null);
      assert.equal((await login('farm-rider',initial)).status,200);
      const resetPath=`/api/admin/riders/${created.body.id}/reset-password`;
      const temporary='Administrator issued replacement 2026';
      assert.equal((await post(resetPath,{temporaryPassword:temporary},headers)).status,400);
      assert.equal((await post(resetPath,{temporaryPassword:temporary,confirmed:true,identityVerified:true,verificationReference:'RIDER-REVIEW-001',reason:'Administrator verified recovery request'},{Authorization:'Bearer '+riderToken})).status,403);
      const beforeLogin=await login('farm-rider',initial);
      const resetBody={temporaryPassword:temporary,confirmed:true,identityVerified:true,verificationReference:'RIDER-REVIEW-001',reason:'Administrator verified recovery request'};
      const resetResult=await post(resetPath,resetBody,headers);assert.equal(resetResult.status,200,JSON.stringify(resetResult.body));assert.equal(resetResult.body.temporaryPassword,undefined);
      assert.equal((await fetch(base+'/protected',{headers:{Authorization:'Bearer '+beforeLogin.body.token}})).status,401);
      const temporaryLogin=await login(' FARM-RIDER ',temporary);assert.equal(temporaryLogin.status,200);assert.equal(temporaryLogin.body.user.mustChangePassword,true);
      let restricted=await fetch(base+'/protected',{headers:{Authorization:'Bearer '+temporaryLogin.body.token}});assert.equal(restricted.status,403);assert.equal((await restricted.json()).code,'PASSWORD_CHANGE_REQUIRED');
      const tamperedFlag=jwt.sign({...jwt.verify(temporaryLogin.body.token,process.env.JWT_SECRET),mustChangePassword:false},process.env.JWT_SECRET);assert.equal((await fetch(base+'/protected',{headers:{Authorization:'Bearer '+tamperedFlag}})).status,403);
      const personal='Personal private rider passphrase 2026';
      const change=await fetch(base+'/api/auth/password',{method:'PATCH',headers:{Authorization:'Bearer '+temporaryLogin.body.token,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:temporary,newPassword:personal})});assert.equal(change.status,200);
      assert.equal((await fetch(base+'/protected',{headers:{Authorization:'Bearer '+temporaryLogin.body.token}})).status,401);
      const finalLogin=await login('farm-rider',personal);assert.equal(finalLogin.status,200);assert.equal(finalLogin.body.user.mustChangePassword,false);assert.equal((await fetch(base+'/protected',{headers:{Authorization:'Bearer '+finalLogin.body.token}})).status,200);
      const profile=await fetch(base+'/api/rider/profile',{method:'PATCH',headers:{Authorization:'Bearer '+finalLogin.body.token,'Content-Type':'application/json'},body:JSON.stringify({firstName:'Username',lastName:'Rider',phone:'09123456789',email:''})});assert.equal(profile.status,200);assert.equal((await profile.json()).email,'');
      assert.equal((await login('farm-rider',temporary)).status,401);
      const audit=(await pool.query("SELECT * FROM auth_security_events WHERE action='Rider Password Reset' AND user_id=$1",[existing.id])).rows[0];assert.equal(Number(audit.actor_user_id),1);assert.equal(audit.details.verificationReference,'RIDER-REVIEW-001');assert.ok(!JSON.stringify(audit).includes(temporary));
      const legacyToken=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO auth_password_resets(user_id,subject_key,token_hash,expires_at) VALUES(2,'legacy', $1,NOW()+INTERVAL '15 minutes')",[crypto.createHash('sha256').update(legacyToken).digest('hex')]);assert.equal((await reset(legacyToken)).status,400);
      const r=await fetch(base+`/api/admin/riders/${created.body.id}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...payload,password:'Unauthorized direct replacement 2026'})});assert.equal(r.status,400);
      const legacyProfile=(await pool.query("INSERT INTO riders(first_name,last_name,phone,email) VALUES('Legacy','Profile','09999999999','optional-rider@example.test') RETURNING id")).rows[0];
      const provision=await post(`/api/admin/riders/${legacyProfile.id}/reset-password`,{...resetBody,username:'legacy-profile-login'},headers);assert.equal(provision.status,200);assert.equal(provision.body.username,'legacy-profile-login');
      assert.equal(Number((await pool.query("SELECT COUNT(*) AS n FROM riders WHERE phone='09999999999'")).rows[0].n),1);
      const provisionLogin=await login('legacy-profile-login',temporary);assert.equal(provisionLogin.status,200);assert.equal(provisionLogin.body.user.mustChangePassword,true);
      assert.equal((await login('optional-rider@example.test',temporary)).status,401,'New rider contact email is not a login alias');
      assert.ok((await pool.query("SELECT id FROM auth_security_events WHERE user_id=$1 AND action='Rider Password Changed'",[existing.id])).rowCount>0);
    });
    const {checkRiderLock}=await import('./riderLockChecks.js');
    await clear();
    await checkRiderLock({t,pool,post,fetch,base});
    const {checkAdminSecurity}=await import('./adminSecurityChecks.js');
    await clear();
    await checkAdminSecurity({t,pool,post,fetch,base});
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));for(const socket of sockets)socket.destroy();await new Promise(resolve=>smtp.close(resolve));
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();
  }
});
