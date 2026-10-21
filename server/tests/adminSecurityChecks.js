import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {createStaffAuth,RESTRICTED} from '../src/utils/staffAuth.js';
import {createAdminAlertQueue,ADMIN_ALERT_SUBJECT,ADMIN_ALERT_TEXT} from '../src/utils/adminAlertQueue.js';
import {issueOfflineAdminReset} from '../src/utils/offlineAdminRecovery.js';

export async function checkAdminSecurity({t,pool,post,fetch,base}) {
  let password='Another unique garden passphrase 2026',fail=false;
  const submissions=[];
  const mail=async message=>{submissions.push(message);if(fail)throw new Error('Synthetic transport failure');return {accepted:[message.to]};};
  const auth=createStaffAuth({db:pool,mail});
  const state=async()=>(await pool.query('SELECT * FROM users WHERE id=1')).rows[0];
  const login=async(email='admin@example.test',pw=password,extra={})=>{
    const {source='192.0.2.190',...body}=extra;
    let result;const res={set(){return this;},status(status){this.code=status;return this;},json(body){result={status:this.code,body};}};
    await auth.login({body:{identifier:email,password:pw,workspace:'staff',loginContext:'admin',...body},ip:source},res);return result;
  };
  const until=async predicate=>{for(let i=0;i<300;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Synthetic queue completion timed out');};
  const expire=async()=>{await pool.query("UPDATE users SET admin_restricted_until=NOW()-INTERVAL '1 second' WHERE id=1 AND admin_restricted_until IS NOT NULL");await pool.query("UPDATE auth_security_buckets SET blocked_until=NOW()-INTERVAL '1 second' WHERE key LIKE 'login:%'");};
  const five=async()=>{for(let i=0;i<5;i++)assert.equal((await login(undefined,'wrong')).status,i===4?429:401);};
  await t.test('AUTH-001..005 Admin consecutive failures, generic text, timed expiry and one expiration audit preserve sole account status',async()=>{
    assert.equal((await login()).status,200);
    const first=await login(undefined,'wrong');assert.deepEqual(first,{status:401,body:{error:'Invalid email or password.'}});
    assert.equal((await state()).admin_failed_attempts,1);
    await pool.query("UPDATE auth_security_buckets SET window_start=NOW()-INTERVAL '2 hours' WHERE key LIKE 'login:%'");
    for(let i=1;i<5;i++)assert.equal((await login(undefined,'wrong')).status,i===4?429:401);
    const locked=await state();assert.equal(locked.admin_failed_attempts,5);assert.ok(locked.admin_restricted_until);assert.equal(locked.status,'active');assert.equal(locked.rider_security_locked,false);
    assert.equal((await login()).body.error,RESTRICTED);assert.equal((await login(undefined,password,{loginContext:'rider'})).status,429,'A UI hint cannot bypass Admin policy');
    const previous=(await pool.query("SELECT COUNT(*)::int AS n FROM auth_security_events WHERE user_id=1 AND action='Admin Login Restriction Expired'")).rows[0].n;
    await expire();const success=await Promise.all([login(),login()]);assert.ok(success.every(r=>r.status===200));assert.equal((await state()).admin_failed_attempts,0);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM auth_security_events WHERE user_id=1 AND action='Admin Login Restriction Expired'")).rows[0].n,previous+1);
  });
  await t.test('AUTH-006..007 exactly one trusted-recipient alert per incident, new incident within an hour, and transport failure cannot undo restriction',async()=>{
    await until(()=>submissions.length>=1);
    const first=submissions[0];assert.equal(first.to,(await state()).email);assert.equal(first.subject,ADMIN_ALERT_SUBJECT);assert.equal(first.text,ADMIN_ALERT_TEXT);
    const count=submissions.length;await five();await until(()=>submissions.length===count+1);
    const incident=(await state()).admin_lock_incident;
    for(let i=0;i<3;i++)assert.equal((await login()).status,429);
    assert.equal(submissions.length,count+1);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_admin_alert_queue WHERE incident=$1',[incident])).rows[0].n),1);
    await expire();assert.equal((await login()).status,200);fail=true;
    try {
      await five();const failed=(await state()).admin_lock_incident;
      await until(async()=> (await pool.query('SELECT state FROM auth_admin_alert_queue WHERE incident=$1',[failed])).rows[0]?.state==='failed');
      assert.equal((await login()).status,429);assert.equal((await state()).status,'active');
      assert.ok((await pool.query("SELECT id FROM auth_security_events WHERE action='Security Alert Failed' AND details->>'incident'=$1",[failed])).rowCount);
    }finally{fail=false;}
    await expire();assert.equal((await login()).status,200);
  });
  await t.test('Durable queue survives producer restart, concurrent workers submit once and stale ambiguous attempts are never replayed',async()=>{
    let calls=0;const email={notify:async(kind,message)=>{assert.equal(kind,'Security Alert');assert.equal(message.to,(await state()).email);calls++;return {status:'accepted'};}};
    const a=createAdminAlertQueue({db:pool,email}),b=createAdminAlertQueue({db:pool,email});
    const incident=crypto.randomUUID();const c=await pool.connect();try{await c.query('BEGIN');await a.enqueue(c,{incident,user:{id:1},subject:'test-admin-queue',ip:'synthetic-source'});await a.enqueue(c,{incident,user:{id:1},subject:'test-admin-queue',ip:'synthetic-source'});await c.query('COMMIT');}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
    await Promise.all([a.runPending(),b.runPending()]);assert.equal(calls,1);
    assert.equal((await pool.query('SELECT state FROM auth_admin_alert_queue WHERE incident=$1',[incident])).rows[0].state,'sent');
    const stale=crypto.randomUUID();await pool.query("INSERT INTO auth_admin_alert_queue(incident,user_id,subject_key,ip_key,state,attempts,claimed_at) VALUES($1,1,'test-stale','synthetic-source','sending',1,NOW()-INTERVAL '1 hour')",[stale]);
    await b.runPending();assert.equal(calls,1);assert.equal((await pool.query('SELECT state FROM auth_admin_alert_queue WHERE incident=$1',[stale])).rows[0].state,'failed');
  });
  await t.test('AUTH-008..009 disabled SMTP recovery is generic and truthful, queues no email and creates no reset token',async()=>{
    const enabled=process.env.AUTH_EMAIL_DELIVERY_ENABLED;process.env.AUTH_EMAIL_DELIVERY_ENABLED='false';
    try {
      const before=(await pool.query('SELECT COUNT(*)::int AS n FROM auth_password_resets')).rows[0].n;
      const known=await post('/api/auth/forgot-password',{email:'admin@example.test'}),unknown=await post('/api/auth/forgot-password',{email:'no-admin-such@example.test'});
      assert.deepEqual(known,unknown);assert.equal(known.body.deliveryAvailable,false);assert.match(known.body.message,/unavailable/);assert.ok(!/email (has been |was )?sent/i.test(known.body.message));
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM auth_password_resets')).rows[0].n,before);
    }finally{process.env.AUTH_EMAIL_DELIVERY_ENABLED=enabled;}
  });
  await t.test('AUTH-010..013 verified offline recovery preserves email/credentials until token use, stores hash only and revokes prior sessions',async()=>{
    const old=await login();assert.equal(old.status,200);const before=await state();
    const c=await pool.connect();let url;
    try{await c.query('BEGIN');await assert.rejects(issueOfflineAdminReset(c,{email:before.email,reference:'OWNER-REVIEW',reason:'Verified owner recovery',confirmed:false}));await c.query('ROLLBACK');
      await c.query('BEGIN');await assert.rejects(issueOfflineAdminReset(c,{email:'customer@example.test',reference:'OWNER-REVIEW',reason:'Verified owner recovery',confirmed:true}));await c.query('ROLLBACK');
      await c.query('BEGIN');url=await issueOfflineAdminReset(c,{email:before.email,reference:'OWNER-REVIEW',reason:'Verified sole administrator owner recovery',confirmed:true});await c.query('COMMIT');
    }finally{await c.query('ROLLBACK');c.release();}
    const token=new URLSearchParams(new URL(url).hash.slice(1)).get('token');assert.match(token,/^[a-f0-9]{64}$/);
    const record=(await pool.query('SELECT token_hash,expires_at>NOW()+INTERVAL \'14 minutes\' AS valid FROM auth_password_resets WHERE user_id=1 AND used_at IS NULL')).rows[0];
    assert.equal(record.token_hash,crypto.createHash('sha256').update(token).digest('hex'));assert.equal(record.valid,true);assert.equal((await state()).password_hash,before.password_hash);assert.equal((await state()).email,before.email);
    password='Verified owner new private passphrase 2026';const changed=await post('/api/auth/reset-password',{token,password});assert.equal(changed.status,200);
    assert.equal((await post('/api/auth/reset-password',{token,password})).status,400);
    assert.equal((await fetch(base+'/protected',{headers:{Authorization:'Bearer '+old.body.token}})).status,401);
    const after=await state();assert.equal(after.email,before.email);assert.equal(after.role,'admin');assert.equal(after.status,'active');assert.equal(after.admin_failed_attempts,0);assert.equal(after.admin_restricted_until,null);assert.equal((await login()).status,200);
    const serialized=JSON.stringify((await pool.query('SELECT * FROM auth_security_events')).rows);assert.ok(!serialized.includes(token));assert.ok(!serialized.includes(password));
  });
  await t.test('AUTH-014..016 Admin audit events/results appear in existing private System Logs and contain no credentials',async()=>{
    const user=await state();const token=jwt.sign({userId:1,role:'admin',sessionVersion:user.auth_version},process.env.JWT_SECRET);
    const r=await fetch(base+'/api/admin/logs?limit=500',{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);const {logs}=await r.json();
    for(const action of ['Admin Login Restriction Activated','Admin Login Restriction Expired','Security Alert Queued','Security Alert Sent','Security Alert Failed','Admin Password Reset Requested','Admin Password Reset Completed'])assert.ok(logs.some(e=>e.action===action),action);
    assert.ok(logs.some(e=>e.action==='Security Alert Sent'&&e.status.includes('SMTP accepted')));
    assert.equal((await fetch(base+'/api/admin/logs')).status,401);
    assert.ok(!JSON.stringify(logs).includes(password));
  });
  await t.test('Public login context cannot make unknown email restrictions permanent or reveal Admin existence through error text',async()=>{
    const email='unknown-admin-policy@example.test',extra={source:'192.0.2.191',loginContext:'rider'};
    for(let i=0;i<5;i++)assert.equal((await login(email,'wrong',extra)).status,i===4?429:401);
    const key='login:'+crypto.createHmac('sha256',process.env.JWT_SECRET).update('login\0'+email).digest('hex');
    assert.equal((await pool.query('SELECT rider_lock_shadow FROM auth_security_buckets WHERE key=$1',[key])).rows[0].rider_lock_shadow,false);
    await pool.query("UPDATE auth_security_buckets SET blocked_until=NOW()-INTERVAL '1 second' WHERE key=$1",[key]);
    const unknown=await login(email,'wrong',extra),known=await login('admin@example.test','wrong',{source:'192.0.2.192',loginContext:'rider'});
    assert.deepEqual(unknown,known);assert.equal(known.status,401);
    assert.equal((await login(undefined,password,{source:'192.0.2.192'})).status,200);
  });
}
