import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {Router} from 'express';
import {pool} from '../config/db.js';
import {sendAuthEmail,authRecoveryOrigin} from './authSmtp.js';
import {createAdminAlertQueue} from './adminAlertQueue.js';
import {createAuthEmailService,RECOVERY_UNAVAILABLE} from './authEmail.js';
import {verifyRequestToken} from './auth.js';
import {authPolicy} from './authPolicy.js';
import {newStaffPasswordError} from '../../../shared/staffPasswordPolicy.js';
export {newStaffPasswordError};

export const RIDER_RESTRICTED='Your account is temporarily restricted for security reasons. Please contact your administrator for assistance.';
export const RESTRICTED='Too many unsuccessful sign-in attempts. Please try again later or use Forgot Password.';
export const RESET_CONFIRMATION='If an account is associated with this email, password reset instructions will be sent.';
const INVALID='Invalid email or password.';
const dummyHash=bcrypt.hashSync(crypto.randomBytes(32).toString('hex'),10);
const canonical=value=>typeof value==='string'?value.trim().toLowerCase().slice(0,255):'';
export const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
export function createStaffAuth({db=pool,mail=sendAuthEmail}={}) {
  const emailService=createAuthEmailService({db,send:mail});
  const adminAlerts=createAdminAlertQueue({db,email:emailService});
  async function emailReadiness(client) {
    // Optional email settings must never roll back a login restriction/audit transaction.
    await client.query('SAVEPOINT auth_email_readiness');
    try {
      const status=await createAuthEmailService({db:client}).status();
      await client.query('RELEASE SAVEPOINT auth_email_readiness');return status;
    }catch{
      await client.query('ROLLBACK TO SAVEPOINT auth_email_readiness');
      await client.query('RELEASE SAVEPOINT auth_email_readiness');
      return {enabled:false,configured:false,alertsReady:false,recoveryReady:false};
    }
  }
  const key=(purpose,value)=>{
    if(!process.env.JWT_SECRET)throw new Error('Authentication configuration unavailable');
    return purpose+':'+crypto.createHmac('sha256',process.env.JWT_SECRET).update(purpose+'\0'+value).digest('hex');
  };
  const context=req=>({email:canonical(req.body?.identifier??req.body?.email),ip:key('ip',req.ip||req.socket?.remoteAddress||'unknown')});
  async function bucket(c,k,consecutive=false) {
    await c.query('INSERT INTO auth_security_buckets(key) VALUES($1) ON CONFLICT DO NOTHING',[k]);
    // Blocked hits never extend a restriction. First attempt after expiry starts fresh.
    return (await c.query(`UPDATE auth_security_buckets SET
      count=CASE WHEN (blocked_until IS NOT NULL AND blocked_until<=clock_timestamp()) OR (NOT $2::boolean AND blocked_until IS NULL AND window_start<=clock_timestamp()-make_interval(mins => ${authPolicy().windowMinutes})) THEN 0 ELSE count END,
      window_start=CASE WHEN (blocked_until IS NOT NULL AND blocked_until<=clock_timestamp()) OR (blocked_until IS NULL AND window_start<=clock_timestamp()-make_interval(mins => ${authPolicy().windowMinutes})) THEN clock_timestamp() ELSE window_start END,
      blocked_until=CASE WHEN blocked_until<=clock_timestamp() THEN NULL ELSE blocked_until END
      WHERE key=$1 RETURNING *,blocked_until>clock_timestamp() AS blocked`,[k,consecutive])).rows[0];
  }
  async function consume(c,k,maximum) {
    const b=await bucket(c,k);
    if(b.blocked)return false;
    if(b.count>=maximum) {
      await c.query(`UPDATE auth_security_buckets SET blocked_until=clock_timestamp()+make_interval(mins => ${authPolicy().restrictionMinutes}) WHERE key=$1`,[k]);return false;
    }
    await c.query('UPDATE auth_security_buckets SET count=count+1 WHERE key=$1',[k]);return true;
  }
  const event=(c,action,subject,ip,user,details={})=>c.query('INSERT INTO auth_security_events(user_id,role,action,subject_key,ip_key,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[user?.id||null,user?.role||null,action,subject,ip,JSON.stringify(details)]);
  // Delivery is intentionally outside the response/transaction: unknown addresses take the same API path.
  // Tokens stay only in the DB as hashes and in this short-lived memory closure, never in logs/outbox.
  function deliver(message,user,subject,ip,kind) {
    setImmediate(async()=>{
      try {const result=await emailService.notify(kind,message);await event(db,kind+(result.status==='accepted'?' Email Accepted':result.status==='not_configured'?' Email Not Configured':' Email Disabled'),subject,ip,user);}
      catch {await event(db,kind+' Email Failed',subject,ip,user).catch(()=>{});}
    });
  }
  async function login(req,res) {
    const started=Date.now();
    const respond=async(status,body,failures=0)=>{
      const policy=authPolicy(),delay=status===200?450:Math.min(policy.maxDelayMs,450+(status===429?policy.maxFailures:failures)*policy.delayStepMs);
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,delay-(Date.now()-started))));
      res.set('Cache-Control','no-store');if(status===429)res.set('Retry-After',String(authPolicy().restrictionMinutes*60));res.status(status).json(body);
    };
    const {email,ip}=context(req);
    const staffPortal=req.body?.workspace==='staff';
    // Public copy depends on the entry point/input shape, never account existence or its role.
    // This hint does not choose an authentication policy, role or destination workspace.
    const riderCopy=staffPortal&&(req.body?.loginContext==='rider'||(req.body?.loginContext!=='admin'&&!email.includes('@')));
    const restrictionMessage=riderCopy?RIDER_RESTRICTED:RESTRICTED;
    const usernameIdentifier=staffPortal&&!email.includes('@');
    // Resolve persisted role, never a role supplied by the browser.
    const preview=(await db.query(`SELECT id,role,email,username FROM users WHERE ((role='rider' AND (LOWER(username)=$1 OR (legacy_email_login AND LOWER(BTRIM(email))=$1))) OR (role='staff' AND (LOWER(username)=$1 OR LOWER(BTRIM(email))=$1)) OR (role NOT IN ('rider','staff') AND LOWER(BTRIM(email))=$1)) LIMIT 1`,[email])).rows[0];
    const subject=key('login',canonical(preview?.email)||(preview?'user:'+preview.id:email));
    const policy=authPolicy();
    const c=await db.connect();let alert=null;
    try {
      await c.query('BEGIN');
      if(!await consume(c,key('login-ip',ip),policy.loginIpLimit)) {
        await event(c,'Login IP Restricted',subject,ip);await c.query('COMMIT');await respond(429,{error:restrictionMessage});return true;
      }
      if(preview && (staffPortal ? !['admin','rider','staff'].includes(preview.role) : preview.role!=='customer')) {
        // Wrong-portal requests consume IP limits, not account password-failure counts.
        await bcrypt.compare(String(req.body?.password||'').slice(0,1024),dummyHash);
        await event(c,'Login Portal Rejected',subject,ip,null,{workspace:staffPortal?'staff':'customer'});
        await c.query('COMMIT');await respond(401,{error:INVALID});return true;
      }
      const b=await bucket(c,subject,true);
      const user=(await c.query(`SELECT id,first_name,last_name,email,username,role,status,password,password_hash,auth_version,must_change_password,
        rider_failed_attempts,rider_security_locked,rider_login_after_unlock_pending,admin_failed_attempts,admin_restricted_until,admin_lock_incident,
        admin_restricted_until<=clock_timestamp() AS admin_restriction_expired FROM users WHERE ((role='rider' AND (LOWER(username)=$1 OR (legacy_email_login AND LOWER(BTRIM(email))=$1))) OR (role='staff' AND (LOWER(username)=$1 OR LOWER(BTRIM(email))=$1)) OR (role NOT IN ('rider','staff') AND LOWER(BTRIM(email))=$1)) LIMIT 1 FOR UPDATE`,[email])).rows[0];
      if(user?.role==='admin'&&user.admin_restriction_expired) {
        await c.query('UPDATE users SET admin_failed_attempts=0,admin_restricted_until=NULL,admin_lock_incident=NULL WHERE id=$1',[user.id]);
        await c.query('UPDATE auth_security_buckets SET count=0,blocked_until=NULL,window_start=clock_timestamp() WHERE key=$1',[subject]);
        await event(c,'Admin Login Restriction Expired',subject,ip,user,{incident:user.admin_lock_incident,result:'Restriction expired'});
        user.admin_failed_attempts=0;user.admin_restricted_until=null;user.admin_lock_incident=null;b.count=0;b.blocked=false;
      }
      if(b.blocked||(!preview&&usernameIdentifier&&b.rider_lock_shadow)||(user?.role==='admin'&&user.admin_restricted_until)) {
        // Retain a still-live restriction created by the previous version during rollout.
        if(user?.role==='rider'&&!user.rider_security_locked&&b.count>=policy.maxFailures) {
          await c.query('UPDATE users SET rider_failed_attempts=$2,rider_security_locked=true,rider_security_locked_at=clock_timestamp() WHERE id=$1',[user.id,policy.maxFailures]);
          await event(c,'Rider Account Security Locked',subject,ip,user);
        }
        if(user?.role==='admin'&&!user.admin_restricted_until) {
          const incident=crypto.randomUUID();
          await c.query('UPDATE users SET admin_failed_attempts=$2,admin_restricted_until=$3,admin_lock_incident=$4 WHERE id=$1',[user.id,policy.maxFailures,b.blocked_until,incident]);
          await event(c,'Admin Login Restriction Activated',subject,ip,user,{incident,result:'Existing live restriction preserved'});
        }
        await event(c,'Login Temporarily Restricted',subject,ip,user);await c.query('COMMIT');await respond(429,{error:restrictionMessage});return true;
      }
      const password=typeof req.body?.password==='string'?req.body.password:'';
      const stored=user?.password_hash||user?.password;
      let matches=false;
      if(typeof stored==='string'&&/^\$2[aby]\$/.test(stored))matches=await bcrypt.compare(password.slice(0,1024),stored);
      else {await bcrypt.compare(password.slice(0,1024),dummyHash);if(typeof stored==='string'&&Buffer.byteLength(password)===Buffer.byteLength(stored))matches=crypto.timingSafeEqual(Buffer.from(password),Buffer.from(stored));}
      if(user?.role==='rider'&&user.rider_security_locked) {
        await event(c,'Rider Locked Login Rejected',subject,ip,user);await c.query('COMMIT');await respond(429,{error:restrictionMessage});return true;
      }
      const allowed=user&&(staffPortal?['admin','rider','staff'].includes(user.role):user.role==='customer')&&user.status==='active'&&matches&&password.length>0&&password.length<=1024&&email.length<=254;
      if(allowed) {
        await c.query('UPDATE auth_security_buckets SET count=0,blocked_until=NULL,window_start=clock_timestamp() WHERE key=$1',[subject]);
        await event(c,'Login Successful',subject,ip,user);
        if(user.role==='staff')await c.query('UPDATE users SET last_login_at=clock_timestamp() WHERE id=$1',[user.id]);
        if(user.role==='rider') {
          if(user.rider_login_after_unlock_pending)await event(c,'Successful Login After Unlock',subject,ip,user);
          await c.query('UPDATE users SET rider_failed_attempts=0,rider_login_after_unlock_pending=false WHERE id=$1',[user.id]);
        }
        if(user.role==='admin')await c.query('UPDATE users SET admin_failed_attempts=0,admin_restricted_until=NULL,admin_lock_incident=NULL WHERE id=$1',[user.id]);
        const token=jwt.sign({userId:user.id,email:user.email,role:user.role,sessionVersion:user.auth_version,mustChangePassword:user.must_change_password},process.env.JWT_SECRET,{expiresIn:'12h'});
        await c.query('COMMIT');await respond(200,{token,user:{id:user.id,email:user.email,firstName:user.first_name||'',lastName:user.last_name||'',name:[user.first_name,user.last_name].filter(Boolean).join(' '),role:user.role,username:user.username||'',mustChangePassword:user.must_change_password}});return true;
      }
      const failure=(await c.query(`UPDATE auth_security_buckets SET count=count+1,
        blocked_until=CASE WHEN count+1>=${policy.maxFailures} THEN clock_timestamp()+make_interval(mins => ${policy.restrictionMinutes}) ELSE NULL END WHERE key=$1 RETURNING count`,[subject])).rows[0];
      await event(c,'Login Failed',subject,ip,user&&['admin','rider','staff'].includes(user.role)?user:null);
      if(!user&&usernameIdentifier&&failure.count>=policy.maxFailures)await c.query('UPDATE auth_security_buckets SET rider_lock_shadow=true WHERE key=$1',[subject]);
      let adminRestricted=false;
      if(user?.role==='admin') {
        const incident=crypto.randomUUID();
        const current=(await c.query(`UPDATE users SET admin_failed_attempts=LEAST(GREATEST(admin_failed_attempts,$3::int)+1,$2),
          admin_restricted_until=CASE WHEN GREATEST(admin_failed_attempts,$3::int)+1 >= $2 THEN clock_timestamp()+make_interval(mins => $4) ELSE NULL END,
          admin_lock_incident=CASE WHEN GREATEST(admin_failed_attempts,$3::int)+1 >= $2 THEN $5::uuid ELSE NULL END
          WHERE id=$1 RETURNING admin_failed_attempts,admin_restricted_until`,[user.id,policy.maxFailures,b.count,policy.restrictionMinutes,incident])).rows[0];
        failure.count=current.admin_failed_attempts;adminRestricted=Boolean(current.admin_restricted_until);
        if(adminRestricted) {
          await c.query('UPDATE auth_security_buckets SET blocked_until=$2 WHERE key=$1',[subject,current.admin_restricted_until]);
          await event(c,'Admin Login Restriction Activated',subject,ip,user,{incident,result:'Temporarily restricted'});
          const delivery=await emailReadiness(c);
          if(delivery.alertsReady&&user.status==='active') {
            await c.query('SAVEPOINT admin_alert_enqueue');
            try{await adminAlerts.enqueue(c,{incident,user,subject,ip});await c.query('RELEASE SAVEPOINT admin_alert_enqueue');}
            catch{await c.query('ROLLBACK TO SAVEPOINT admin_alert_enqueue');await c.query('RELEASE SAVEPOINT admin_alert_enqueue');await event(c,'Security Alert Unavailable',subject,ip,user,{incident,result:'Queue unavailable'});}
          }else await event(c,'Security Alert Unavailable',subject,ip,user,{incident,result:delivery.enabled&&!delivery.configured?'Email not configured':'Email disabled or unavailable'});
        }
      }
      let riderLocked=false;
      if(user?.role==='rider') {
        const updated=(await c.query(`UPDATE users SET rider_failed_attempts=LEAST(GREATEST(rider_failed_attempts,$3::int)+1,$2),
          rider_security_locked=(GREATEST(rider_failed_attempts,$3::int)+1 >= $2),
          rider_security_locked_at=CASE WHEN GREATEST(rider_failed_attempts,$3::int)+1 >= $2 THEN clock_timestamp() ELSE rider_security_locked_at END
          WHERE id=$1 RETURNING rider_security_locked`,[user.id,policy.maxFailures,b.count])).rows[0];
        riderLocked=updated.rider_security_locked;
        if(riderLocked)await event(c,'Rider Account Security Locked',subject,ip,user);
      }
      if(user?.role!=='admin'&&(riderLocked||failure.count>=policy.maxFailures)) {
        await event(c,'Suspicious Login Attempts',subject,ip,user&&['admin','rider','staff'].includes(user.role)?user:null);
        const delivery=await emailReadiness(c);
        const claimed=delivery.alertsReady?await c.query("UPDATE auth_security_buckets SET alert_sent_at=clock_timestamp() WHERE key=$1 AND (alert_sent_at IS NULL OR alert_sent_at<clock_timestamp()-INTERVAL '1 hour') RETURNING key",[subject]):{rowCount:0};
        if(!delivery.alertsReady)await event(c,delivery.enabled&&!delivery.configured?'Security Alert Email Not Configured':'Security Alert Email Disabled',subject,ip,user&&['admin','rider','staff'].includes(user.role)?user:null);
        if(claimed.rowCount&&user?.email&&['admin','rider','staff'].includes(user.role)&&user.status==='active')alert={user,subject,ip};
      }
      await c.query('COMMIT');
      if(adminRestricted)adminAlerts.kick();
      if(alert)deliver({to:alert.user.email,subject:'Belfiore Account Security Alert',text:alert.user.role==='rider'
        ?'We detected multiple unsuccessful sign-in attempts to your Belfiore account. Contact an authorized administrator for account review and manual unlock. Waiting does not remove a Rider security lock. If you did not attempt to sign in, report this to your administrator.'
        :'We detected multiple unsuccessful sign-in attempts to your Belfiore account.\n\nIf this was you, please wait before trying again or use Forgot Password.\n\nIf this was not you, we recommend reviewing your account security and changing your password.'},alert.user,subject,ip,'Security Alert');
      const restricted=riderLocked||adminRestricted||failure.count>=policy.maxFailures;
      await respond(restricted?429:401,{error:restricted?restrictionMessage:INVALID},failure.count);return true;
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  const router=Router();
  router.get('/api/admin/auth-email-settings',async(req,res)=>{
    try{if(verifyRequestToken(req).role!=='admin')return res.status(403).json({error:'Admin access only'});res.set('Cache-Control','no-store').json(await emailService.status());}
    catch(error){res.status(error.status||503).json({error:'Unable to read authentication email settings'});}
  });
  router.patch('/api/admin/auth-email-settings',async(req,res)=>{
    try {
      const user=verifyRequestToken(req);if(user.role!=='admin')return res.status(403).json({error:'Admin access only'});
      const {suspiciousLoginAlerts,passwordResetEmails}=req.body||{};
      if(typeof suspiciousLoginAlerts!=='boolean'||typeof passwordResetEmails!=='boolean')return res.status(400).json({error:'Provide both email feature flags as booleans'});
      const current=await emailService.status();
      if((suspiciousLoginAlerts||passwordResetEmails)&&(!current.enabled||!current.configured||(passwordResetEmails&&!current.recoveryOriginReady)))return res.status(409).json({error:'Email delivery is disabled or not configured. Configure the official sender and SMTP, then enable the server delivery switch first.'});
      const c=await db.connect();
      try{await c.query('BEGIN');await c.query('UPDATE auth_email_settings SET suspicious_login_alerts=$1,password_reset_emails=$2,updated_at=clock_timestamp() WHERE id=1',[suspiciousLoginAlerts,passwordResetEmails]);
        await event(c,'Authentication Email Settings Updated',key('settings',String(user.userId)),context(req).ip,{id:user.userId,role:'admin'});await c.query('COMMIT');}
      catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
      res.set('Cache-Control','no-store').json(await emailService.status());
    }catch(error){res.status(error.status||503).json({error:'Unable to update authentication email settings'});}
  });
  router.post('/api/auth/forgot-password',async(req,res)=>{
    const started=Date.now();let c,available=false;
    try {
      const {email,ip}=context(req),subject=key('login',email);c=await db.connect();await c.query('BEGIN');
      const delivery=await emailReadiness(c);available=delivery.recoveryReady;
      const ipOk=await consume(c,key('reset-ip',ip),10);
      const b=await bucket(c,key('reset-email',email));
      const permitted=ipOk&&!b.blocked&&b.count<3&&(!b.alert_sent_at||Date.now()-new Date(b.alert_sent_at).getTime()>=60000);
      // Always generic, including throttle and mail failure; recovery never locks login.
      const user=(await c.query("SELECT id,email,role,status FROM users WHERE LOWER(BTRIM(email))=$1 AND role='admin' LIMIT 1 FOR UPDATE",[email])).rows[0];
      await event(c,permitted?(user?'Admin Password Reset Requested':'Password Reset Requested'):'Password Reset Request Throttled',subject,ip,user);
      let message;
      if(!available)await event(c,delivery.enabled&&!delivery.configured?'Password Reset Email Not Configured':'Password Reset Email Disabled',subject,ip,user);
      if(permitted)await c.query('UPDATE auth_security_buckets SET count=count+1,alert_sent_at=clock_timestamp() WHERE key=$1',[key('reset-email',email)]);
      if(permitted&&available) {
        if(user?.status==='active') {
          const token=crypto.randomBytes(32).toString('hex');
          await c.query('UPDATE auth_password_resets SET used_at=clock_timestamp() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
          await c.query("INSERT INTO auth_password_resets(user_id,subject_key,token_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+INTERVAL '15 minutes')",[user.id,subject,tokenHash(token)]);
          const url=authRecoveryOrigin()+'/reset-password#token='+token;
          message={to:user.email,subject:'Reset your Belfiore password',text:`Open this link to choose a new password:\n${url}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this message. Your password has not changed.`};
        }
      }
      await c.query('COMMIT');
      if(message)deliver(message,user,subject,ip,'Password Reset');
    } catch {if(c)await c.query('ROLLBACK').catch(()=>{});}
    finally{c?.release();}
    // Pad fast DB paths, without waiting on SMTP or revealing eligibility/delivery status.
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,250-(Date.now()-started))));
    res.set('Cache-Control','no-store').json({message:available?RESET_CONFIRMATION:RECOVERY_UNAVAILABLE,deliveryAvailable:available});
  });
  router.post('/api/auth/reset-password',async(req,res)=>{
    let c;
    try {
      const {ip}=context(req);c=await db.connect();await c.query('BEGIN');
      if(!await consume(c,key('reset-submit-ip',ip),20)) {await event(c,'Password Reset Submit Restricted',key('reset','unknown'),ip);await c.query('COMMIT');return res.status(429).json({error:'Too many requests. Please try again later.'});}
      const token=typeof req.body?.token==='string'?req.body.token:'';
      const reset=(await c.query('SELECT * FROM auth_password_resets WHERE token_hash=$1',[tokenHash(token)])).rows[0];
      if(!/^[a-f0-9]{64}$/.test(token)||!reset) {await c.query('COMMIT');return res.status(400).json({error:'This reset link is invalid or has expired. Request a new link.'});}
      await bucket(c,reset.subject_key);
      const user=(await c.query("SELECT id,role,status FROM users WHERE id=$1 AND role='admin' FOR UPDATE",[reset.user_id])).rows[0];
      const valid=(await c.query('SELECT id FROM auth_password_resets WHERE id=$1 AND used_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE',[reset.id])).rows[0];
      if(!valid||user?.status!=='active') {await c.query('COMMIT');return res.status(400).json({error:'This reset link is invalid or has expired. Request a new link.'});}
      const problem=newStaffPasswordError(req.body?.password);
      if(problem) {await c.query('COMMIT');return res.status(400).json({error:problem});}
      const hashed=await bcrypt.hash(req.body.password,12);
      await c.query('UPDATE users SET password_hash=$1,password=NULL,auth_version=auth_version+1,admin_failed_attempts=0,admin_restricted_until=NULL,admin_lock_incident=NULL,updated_at=clock_timestamp() WHERE id=$2',[hashed,user.id]);
      await c.query('UPDATE auth_password_resets SET used_at=clock_timestamp() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
      await c.query('UPDATE auth_security_buckets SET count=0,blocked_until=NULL,window_start=clock_timestamp() WHERE key=$1',[reset.subject_key]);
      await event(c,'Admin Password Reset Completed',reset.subject_key,ip,user,{result:'Password changed; previous sessions revoked'});
      await c.query('COMMIT');res.set('Cache-Control','no-store').json({message:'Password reset successfully. Please sign in with your new password.'});
    }catch{if(c)await c.query('ROLLBACK').catch(()=>{});res.status(503).json({error:'Unable to reset password. Please try again.'});}finally{c?.release();}
  });
  return {login,router};
}
