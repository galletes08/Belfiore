import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import {createStaffAuth,RIDER_RESTRICTED} from '../src/utils/staffAuth.js';

export async function checkRiderLock({t,pool,post,fetch,base}) {
  const version=(await pool.query('SELECT auth_version FROM users WHERE id=1')).rows[0].auth_version;
  const headers={Authorization:'Bearer '+jwt.sign({userId:1,role:'admin',sessionVersion:version},process.env.JWT_SECRET)};
  const initial='Initial lockout test credential 2026',personal='Private lockout personal credential 2026';
  let rider,userId,riderToken,orderId;
  const auth=createStaffAuth({db:pool});
  // Different trusted request contexts model different devices/networks, not spoofable HTTP headers.
  const login=async(identifier,password=personal,source='192.0.2.80')=>{
    let result;const res={set(){return this;},status(status){this.code=status;return this;},json(body){result={status:this.code,body};}};
    await auth.login({body:{identifier,password,workspace:'staff'},ip:source},res);return result;
  };
  const state=async()=>(await pool.query('SELECT * FROM users WHERE id=$1',[userId])).rows[0];
  const unlockBody={confirmed:true,identityVerified:true,confirmation:'',reason:'Administrator reviewed account and verified rider request',verificationReference:'ADMIN-RIDER-ACCOUNT-REVIEW'};
  const unlock=extra=>post(`/api/admin/riders/${rider.id}/unlock`,{...unlockBody,confirmation:String(rider.id),...extra},headers);
  const get=async path=>{const r=await fetch(base+path,{headers});return {status:r.status,body:await r.json()};};
  const lock=async()=>{for(let i=0;i<5;i++)assert.equal((await login(rider.username,'incorrect','198.51.100.'+(i+1))).status,i===4?429:401);};
  await t.test('Rider consecutive failures survive windows/devices, successful login resets them and threshold five persists indefinitely',async()=>{
    const result=await post('/api/admin/riders',{firstName:'Security',lastName:'Lock Rider',username:'security-lock-rider',phone:'09991112222',password:initial,isAvailable:true},headers);
    assert.equal(result.status,201,JSON.stringify(result.body));rider=result.body;
    userId=(await pool.query('SELECT user_id FROM riders WHERE id=$1',[rider.id])).rows[0].user_id;
    const first=await login(rider.username,initial);assert.equal(first.status,200);
    const changed=await fetch(base+'/api/auth/password',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+first.body.token},body:JSON.stringify({currentPassword:initial,newPassword:personal})});assert.equal(changed.status,200);
    const signed=await login(rider.username);assert.equal(signed.status,200);riderToken=signed.body.token;
    assert.equal((await login(rider.username,'wrong')).status,401);assert.equal((await state()).rider_failed_attempts,1);
    assert.equal((await login(rider.username)).status,200);assert.equal((await state()).rider_failed_attempts,0);
    for(let i=0;i<5;i++) {
      const response=await login(i%2?' SECURITY-LOCK-RIDER ':rider.username,'wrong','203.0.113.'+(i+1));
      assert.equal(response.status,i===4?429:401);assert.equal((await state()).rider_failed_attempts,i+1);
      if(i===1)await pool.query("UPDATE auth_security_buckets SET window_start=NOW()-INTERVAL '2 hours',blocked_until=NULL WHERE key LIKE 'login:%'");
    }
    const locked=await state();assert.equal(locked.rider_security_locked,true);assert.ok(locked.rider_security_locked_at);assert.equal(locked.status,'active');
    await pool.query("UPDATE auth_security_buckets SET blocked_until=NOW()-INTERVAL '1 hour',window_start=NOW()-INTERVAL '2 hours' WHERE key LIKE 'login:%'");
    const correct=await login(rider.username);assert.equal(correct.status,429);assert.equal(correct.body.error,RIDER_RESTRICTED);assert.equal(correct.body.token,undefined);
    assert.equal((await state()).rider_failed_attempts,5);
  });
  await t.test('Only verified and confirmed administrator unlock clears security state; duplicate unlock is rejected and successful sign-in is audited once',async()=>{
    const url=`/api/admin/riders/${rider.id}/unlock`;
    assert.equal((await post(url,unlockBody)).status,401);
    assert.equal((await post(url,unlockBody,{Authorization:'Bearer '+riderToken})).status,403);
    assert.equal((await post(url,unlockBody,{Authorization:'Bearer '+jwt.sign({role:'staff',userId:999},process.env.JWT_SECRET)})).status,403);
    assert.equal((await fetch(base+`/api/admin/riders/${rider.id}/security`)).status,401);
    const customer=jwt.sign({userId:3,role:'customer',sessionVersion:0},process.env.JWT_SECRET);assert.equal((await post(url,unlockBody,{Authorization:'Bearer '+customer})).status,403);
    for(const extra of [{confirmed:false},{identityVerified:false},{reason:''},{verificationReference:''},{confirmation:'wrong'}])assert.equal((await unlock(extra)).status,400);
    const review=await get(`/api/admin/riders/${rider.id}/security`);assert.equal(review.status,200);assert.equal(review.body.rider.securityLocked,true);assert.ok(review.body.records.some(e=>e.action==='Login Failed'));
    assert.equal((await unlock()).status,200);assert.equal((await state()).rider_security_locked,false);assert.equal((await state()).rider_failed_attempts,0);
    assert.equal((await unlock()).status,409);
    assert.equal((await login(rider.username)).status,200);assert.equal((await login(rider.username)).status,200);
    const events=(await pool.query("SELECT * FROM auth_security_events WHERE user_id=$1 AND action IN ('Administrator Unlock','Successful Login After Unlock') ORDER BY id",[userId])).rows;
    assert.equal(events.filter(e=>e.action==='Successful Login After Unlock').length,1);
    const adminEvent=events.find(e=>e.action==='Administrator Unlock');assert.equal(Number(adminEvent.actor_user_id),1);assert.equal(adminEvent.details.reason,unlockBody.reason);assert.ok(adminEvent.created_at);
  });
  await t.test('Security lock blocks new assignments, flags ongoing deliveries and preserves existing orders, GPS and duty preferences',async()=>{
    orderId=(await pool.query("INSERT INTO orders(customer_name,rider_id,status) VALUES('Security rider assignment',$1,'Preparing') RETURNING id",[rider.id])).rows[0].id;
    await pool.query('INSERT INTO rider_locations(rider_id,order_id,latitude,longitude) VALUES($1,$2,14.55,121.02)',[rider.id,orderId]);
    const before=(await pool.query('SELECT to_jsonb(o) AS snapshot FROM orders o WHERE id=$1',[orderId])).rows[0].snapshot;
    const locations=(await pool.query('SELECT * FROM rider_locations WHERE rider_id=$1',[rider.id])).rows;
    await lock();
    const details=await get(`/api/admin/riders/${rider.id}/details`);assert.equal(details.body.rider.securityLocked,true);assert.equal(details.body.rider.assignmentReviewRequired,true);assert.equal(details.body.rider.availability,'Busy');assert.equal(details.body.rider.isAvailable,false);
    assert.equal((await get('/api/admin/riders/manage?filter=Security+Locked&search=security-lock-rider')).body.total,1);
    const candidate=(await pool.query("INSERT INTO orders(customer_name) VALUES('Locked rider must not be assigned') RETURNING id")).rows[0];
    await assert.rejects(pool.query('UPDATE orders SET rider_id=$1 WHERE id=$2',[rider.id,candidate.id]),error=>error.code==='P0001');
    assert.deepEqual((await pool.query('SELECT to_jsonb(o) AS snapshot FROM orders o WHERE id=$1',[orderId])).rows[0].snapshot,before);
    assert.deepEqual((await pool.query('SELECT * FROM rider_locations WHERE rider_id=$1',[rider.id])).rows,locations);
    const gps=await fetch(base+'/api/riders/location',{method:'POST',headers:{Authorization:'Bearer '+riderToken,'Content-Type':'application/json'},body:JSON.stringify({orderId:Number(orderId),latitude:14.56,longitude:121.03})});assert.equal(gps.status,200,'Pre-existing authenticated rider sessions retain the current delivery/GPS workflow');
    assert.equal((await unlock()).status,200);assert.equal((await get(`/api/admin/riders/${rider.id}/details`)).body.rider.isOnDuty,true);
    await pool.query("UPDATE orders SET status='Cancelled' WHERE id=$1",[orderId]);
  });
  await t.test('Password reset, profile saves and Enable/Disable cannot clear a security lock; temporary credential still requires change after explicit unlock',async()=>{
    await lock();
    const temporary='Replacement lockout temporary credential 2026';
    const reset=await post(`/api/admin/riders/${rider.id}/reset-password`,{temporaryPassword:temporary,identityVerified:true,confirmed:true,reason:'Verified forgotten credential request',verificationReference:'RIDER-RESET-REVIEW'},headers);assert.equal(reset.status,200);
    assert.equal((await state()).rider_security_locked,true);assert.equal((await state()).rider_failed_attempts,5);
    assert.equal((await login(rider.username,temporary)).status,429);
    const saved=await fetch(base+`/api/admin/riders/${rider.id}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({firstName:'Security',lastName:'Lock Rider',phone:'09991112222',username:rider.username,status:'active',isAvailable:true})});assert.equal(saved.status,200);assert.equal((await state()).rider_security_locked,true);
    const setStatus=async status=>{const r=await fetch(base+`/api/admin/riders/${rider.id}/status`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({status,confirmed:true,confirmation:String(rider.id),reason:'Administrator verified account access change'})});assert.equal(r.status,200);};
    await setStatus('inactive');assert.equal((await state()).rider_security_locked,true);
    await setStatus('active');assert.equal((await state()).rider_security_locked,true);
    await setStatus('inactive');
    assert.equal((await unlock()).status,200);assert.equal((await state()).status,'inactive');
    assert.equal((await login(rider.username,temporary)).status,401,'Unlock never enables a disabled account');
    await setStatus('active');
    const signed=await login(rider.username,temporary);assert.equal(signed.status,200);assert.equal(signed.body.user.mustChangePassword,true);
    assert.equal((await fetch(base+'/api/rider/profile',{headers:{Authorization:'Bearer '+signed.body.token}})).status,403);
    assert.equal(await bcryptMatches(temporary),true);
    const audit=(await pool.query('SELECT action,details FROM auth_security_events WHERE user_id=$1',[userId])).rows;
    assert.ok(audit.some(e=>e.action==='Rider Password Reset'));assert.ok(!JSON.stringify(audit).includes(temporary));assert.ok(!JSON.stringify(audit).includes(personal));
  });
  async function bcryptMatches(password){const {default:bcrypt}=await import('bcryptjs');return bcrypt.compare(password,(await state()).password_hash);}
  await t.test('Unknown identifiers have the same public restriction after expiry; source limits reject excessive attempts before touching rider counters',async()=>{
    const unknown='no-such-rider-lock-test';for(let i=0;i<5;i++)assert.equal((await login(unknown,'wrong','192.0.2.99')).status,i===4?429:401);
    await pool.query("UPDATE auth_security_buckets SET blocked_until=NOW()-INTERVAL '1 hour',window_start=NOW()-INTERVAL '2 hours' WHERE key LIKE 'login:%'");
    assert.deepEqual((await login(unknown)).body,{error:RIDER_RESTRICTED});
    const old=process.env.AUTH_LOGIN_IP_LIMIT;process.env.AUTH_LOGIN_IP_LIMIT='5';
    try {for(let i=0;i<5;i++)assert.equal((await login('source-budget-'+i,'wrong','192.0.2.222')).status,401);
      const count=(await state()).rider_failed_attempts;assert.equal((await login(rider.username,'wrong','192.0.2.222')).status,429);assert.equal((await state()).rider_failed_attempts,count);
    }finally{if(old===undefined)delete process.env.AUTH_LOGIN_IP_LIMIT;else process.env.AUTH_LOGIN_IP_LIMIT=old;}
  });
  await t.test('Concurrent attempts across sources serialize at five and only one administrator unlock wins',async()=>{
    // New independent login starts after a valid password-change flow, not a fixture unlock.
    const temporary='Replacement lockout temporary credential 2026';
    const signed=await login(rider.username,temporary);assert.equal(signed.status,200);
    const changed=await fetch(base+'/api/auth/password',{method:'PATCH',headers:{Authorization:'Bearer '+signed.body.token,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:temporary,newPassword:personal})});assert.equal(changed.status,200);
    assert.equal((await login(rider.username)).status,200);
    const outcomes=await Promise.all(Array.from({length:8},(_,i)=>login(rider.username,'wrong','198.51.100.'+(100+i))));
    assert.equal(outcomes.filter(r=>r.status===401).length,4);assert.equal(outcomes.filter(r=>r.status===429).length,4);assert.equal((await state()).rider_failed_attempts,5);
    const unlocks=await Promise.all([unlock(),unlock()]);assert.deepEqual(unlocks.map(r=>r.status).sort(),[200,409]);
    assert.equal((await login(rider.username)).status,200);
  });
  await t.test('Rolling out the policy retains live pre-existing failure budgets without changing credentials',async()=>{
    const key='login:'+crypto.createHmac('sha256',process.env.JWT_SECRET).update('login\0user:'+userId).digest('hex');
    const originalHash=(await state()).password_hash;
    await pool.query('UPDATE auth_security_buckets SET count=4,blocked_until=NULL,window_start=clock_timestamp() WHERE key=$1',[key]);
    assert.equal((await login(rider.username,'wrong')).status,429);assert.equal((await state()).rider_security_locked,true);assert.equal((await state()).rider_failed_attempts,5);
    assert.equal((await unlock()).status,200);
    await pool.query("UPDATE auth_security_buckets SET count=5,blocked_until=NOW()+INTERVAL '15 minutes',window_start=clock_timestamp() WHERE key=$1",[key]);
    assert.equal((await login(rider.username)).status,429);assert.equal((await state()).rider_security_locked,true);assert.equal((await state()).password_hash,originalHash);
    assert.equal((await unlock()).status,200);
    const logs=await get('/api/admin/logs?limit=500');assert.equal(logs.status,200);
    for(const action of ['Login Failed','Rider Account Security Locked','Administrator Unlock','Rider Password Reset','Successful Login After Unlock'])assert.ok(logs.body.logs.some(e=>e.action===action),action+' is visible in System Logs');
    const serialized=JSON.stringify(logs.body);for(const secret of [initial,personal,'Replacement lockout temporary credential 2026'])assert.ok(!serialized.includes(secret));
  });
}
