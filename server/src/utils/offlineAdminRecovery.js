import crypto from 'node:crypto';
import {authRecoveryOrigin} from './authSmtp.js';

// Trusted host/database operator only. Never exposed through an HTTP endpoint.
// Caller owns the transaction; only a hash is persisted, and credentials are not changed here.
export async function issueOfflineAdminReset(c,{email,reference,reason,confirmed}) {
  const canonical=String(email||'').trim().toLowerCase();
  reference=String(reference||'').trim();reason=String(reason||'').trim();
  if(confirmed!==true||reference.length<4||reference.length>160||reason.length<4||reason.length>300)throw new Error('Verified operator confirmation, internal reference and recovery reason are required');
  const origin=authRecoveryOrigin();
  const subject='login:'+crypto.createHmac('sha256',process.env.JWT_SECRET).update('login\0'+canonical).digest('hex');
  await c.query('INSERT INTO auth_security_buckets(key) VALUES($1) ON CONFLICT DO NOTHING',[subject]);
  await c.query('SELECT key FROM auth_security_buckets WHERE key=$1 FOR UPDATE',[subject]);
  const user=(await c.query("SELECT id,email FROM users WHERE LOWER(BTRIM(email))=$1 AND role='admin' AND status='active' FOR UPDATE",[canonical])).rows[0];
  if(!user)throw new Error('An existing active Administrator matching the verified record is required');
  const token=crypto.randomBytes(32).toString('hex');
  await c.query('UPDATE auth_password_resets SET used_at=clock_timestamp() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
  await c.query("INSERT INTO auth_password_resets(user_id,subject_key,token_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+INTERVAL '15 minutes')",[user.id,subject,crypto.createHash('sha256').update(token).digest('hex')]);
  await c.query(`INSERT INTO auth_security_events(user_id,role,action,subject_key,ip_key,details)
    VALUES($1,'admin','Admin Offline Recovery Authorized',$2,'trusted-host-operator',$3::jsonb)`,[user.id,subject,JSON.stringify({actorType:'operator',verificationReference:reference,reason,result:'Single-use reset link issued through verified host procedure; no email sent'})]);
  return origin+'/reset-password#token='+token;
}
