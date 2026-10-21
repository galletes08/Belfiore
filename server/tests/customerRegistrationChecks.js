import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
export async function checkCustomerRegistration({t,pool,post,mails,setMailFailure}){
 const password='a new unique garden passphrase';
 const body={firstName:'New',lastName:'Customer',email:' NEW-CUSTOMER@example.test ',password,confirmPassword:password,role:'admin',status:'active'};
 const register=b=>post('/api/auth/register',b),resend=email=>post('/api/auth/resend-verification',{email});
 const latestToken=()=>{const message=mails.at(-1).replace(/=\r\n/g,'').replace(/=3D/g,'=');return message.match(/#token=([a-f0-9]{64})/)[1];};
 await t.test('REG-002..005 backend requires valid names/email, matching confirmation and a safe non-truncated password',async()=>{
  for(const patch of [{firstName:''},{lastName:[]},{email:'invalid'},{confirmPassword:'different'},{password:'short',confirmPassword:'short'},{password:'x'.repeat(73),confirmPassword:'x'.repeat(73)},{password:'password123456789',confirmPassword:'password123456789'}])assert.equal((await register({...body,...patch})).status,400);
 });
 await t.test('REG-001/007/010 disabled email leaves a hashed pending registration with no account, session or false delivery claim',async()=>{
  process.env.CUSTOMER_VERIFICATION_EMAIL_ENABLED='false';const count=mails.length;
  const result=await register(body);assert.equal(result.status,202);assert.equal(result.body.emailDelivery,'unavailable');assert.match(result.body.message,/unavailable/);assert.equal(mails.length,count);
  const row=(await pool.query("SELECT * FROM pending_registrations WHERE email='new-customer@example.test'")).rows[0];assert.ok(await bcrypt.compare(password,row.password_hash));assert.match(row.token_hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(result).includes(row.token_hash));
  assert.equal((await pool.query("SELECT id FROM users WHERE email='new-customer@example.test'")).rowCount,0);
  assert.equal((await post('/api/auth/login',{email:'new-customer@example.test',password})).status,401);
  const before=row.token_hash;await resend(row.email);assert.equal((await pool.query('SELECT token_hash FROM pending_registrations WHERE id=$1',[row.id])).rows[0].token_hash,before,'Cooldown does not rotate tokens');
 });
 await t.test('REG-006/007 resend uses isolated SMTP, preserves pending credentials, invalidates old links and rejects concurrent token reuse',async()=>{
  process.env.CUSTOMER_VERIFICATION_EMAIL_ENABLED='true';
  await pool.query("UPDATE pending_registrations SET last_attempt_at=NOW()-interval '2 minutes' WHERE email='new-customer@example.test'");
  const first=await resend('new-customer@example.test');assert.equal(first.status,202);const token=latestToken();
  const row=(await pool.query("SELECT * FROM pending_registrations WHERE email='new-customer@example.test'")).rows[0];assert.equal(row.token_hash,crypto.createHash('sha256').update(token).digest('hex'));
  await pool.query("UPDATE pending_registrations SET last_attempt_at=NOW()-interval '2 minutes' WHERE id=$1",[row.id]);
  await register({...body,password:'someone else changed passphrase',confirmPassword:'someone else changed passphrase'});
  const next=latestToken();assert.notEqual(next,token);assert.equal((await post('/api/auth/verify-email',{token})).status,400);
  const results=await Promise.all([post('/api/auth/verify-email',{token:next}),post('/api/auth/verify-email',{token:next})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
  const user=(await pool.query("SELECT * FROM users WHERE email='new-customer@example.test'")).rows[0];assert.equal(user.role,'customer');assert.equal(user.status,'active');assert.ok(await bcrypt.compare(password,user.password_hash));assert.equal(user.password,null);
  assert.equal((await post('/api/auth/login',{email:body.email,password})).status,200);
  const duplicate=await register(body),unknown=await resend('unknown-customer@example.test');assert.deepEqual(duplicate,unknown);
 });
 await t.test('REG-008 expired tokens fail, resend recovers and verification requests have persisted source limits',async()=>{
  const fresh={...body,email:'expired-customer@example.test'};await register(fresh);const token=latestToken();
  await pool.query("UPDATE pending_registrations SET expires_at=NOW()-interval '1 second',last_attempt_at=NOW()-interval '2 minutes' WHERE email=$1",[fresh.email]);
  assert.equal((await post('/api/auth/verify-email',{token})).status,400);await resend(fresh.email);assert.equal((await post('/api/auth/verify-email',{token:latestToken()})).status,200);
  await pool.query('UPDATE customer_registration_limits SET attempts=120');assert.equal((await post('/api/auth/verify-email',{token})).status,429);assert.equal((await register(body)).status,429);await pool.query('DELETE FROM customer_registration_limits');
 });
 await t.test('Customer SMTP failures never claim delivery or activate a pending account',async()=>{
  setMailFailure(true);
  try{const result=await register({...body,email:'smtp-failure@example.test'});assert.equal(result.status,503);assert.match(result.body.error,/could not be submitted/);assert.equal((await pool.query("SELECT id FROM users WHERE email='smtp-failure@example.test'")).rowCount,0);}
  finally{setMailFailure(false);}
 });
 process.env.CUSTOMER_VERIFICATION_EMAIL_ENABLED='false';await pool.query('DELETE FROM auth_security_buckets');
}
