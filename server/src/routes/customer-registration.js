import {Router} from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {pool} from '../config/db.js';
import {authEmailConfiguration} from '../utils/authEmail.js';
import {sendAuthEmail,authRecoveryOrigin} from '../utils/authSmtp.js';
import {registrationErrors} from '../../../shared/customerRegistration.js';

const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const bounded=(name,fallback,min,max)=>{const n=Number(process.env[name]);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;};
export function verificationSettings(){
  const config=authEmailConfiguration();let origin;try{origin=authRecoveryOrigin();}catch{/* Fail closed. */}
  return {ready:process.env.CUSTOMER_VERIFICATION_EMAIL_ENABLED==='true'&&config.enabled&&config.configured&&Boolean(origin),origin,
    expiry:bounded('CUSTOMER_VERIFICATION_TTL_MINUTES',30,5,1440),cooldown:bounded('CUSTOMER_VERIFICATION_RESEND_SECONDS',60,30,3600)};
}
const response=settings=>({pending:true,emailDelivery:settings.ready?'available':'unavailable',retryAfterSeconds:settings.cooldown,
  message:settings.ready?'If this address is eligible, verification instructions will be submitted to the email service. Check your inbox.':'Email verification delivery is currently unavailable. Registration remains pending; sign-in is available only after verification. Please try resending when service is available.'});
export function createCustomerRegistration({db=pool,send=sendAuthEmail}={}) {
 const router=Router();
 router.use(['/api/auth/register','/api/auth/resend-verification','/api/auth/verify-email'],(req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
 async function limit(req,res,kind,max) {
  const key=crypto.createHmac('sha256',process.env.JWT_SECRET).update(kind+'\0'+String(req.ip||'unknown')).digest('hex');
  const result=await db.query(`INSERT INTO customer_registration_limits(subject_key,window_start,attempts) VALUES($1,clock_timestamp(),1)
   ON CONFLICT(subject_key) DO UPDATE SET attempts=CASE WHEN customer_registration_limits.window_start<clock_timestamp()-interval '1 hour' THEN 1 ELSE customer_registration_limits.attempts+1 END,
   window_start=CASE WHEN customer_registration_limits.window_start<clock_timestamp()-interval '1 hour' THEN clock_timestamp() ELSE customer_registration_limits.window_start END RETURNING attempts`,[key]);
  if(result.rows[0].attempts<=max)return true;
  res.set('Retry-After','3600').status(429).json({error:'Too many requests. Please try again later.'});return false;
 }
 async function requestVerification(req,res,register) {
  const settings=verificationSettings();
  if(!await limit(req,res,'registration',30))return;
  const errors=register?registrationErrors(req.body):{};
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  if(!register&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))errors.email='Enter a valid email address.';
  if(Object.keys(errors).length)return res.status(400).json({error:'Please correct the highlighted fields.',errors});
  const client=await db.connect();let delivery;
  try {
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['registration:'+email]);
   const existing=await client.query('SELECT id FROM users WHERE LOWER(email)=$1',[email]);
   const pending=(await client.query('SELECT * FROM pending_registrations WHERE email=$1 FOR UPDATE',[email])).rows[0];
   const cooldown=pending?.last_attempt_at&&Date.now()-new Date(pending.last_attempt_at).getTime()<settings.cooldown*1000;
   if(!existing.rowCount&&!cooldown&&(register||pending)) {
    const replacing=register&&(!pending||new Date(pending.expires_at)<new Date());
    const firstName=replacing?req.body.firstName.trim():pending.first_name;
    const lastName=replacing?req.body.lastName.trim():pending.last_name;
    const passwordHash=replacing?await bcrypt.hash(req.body.password,12):pending.password_hash;
    const token=crypto.randomBytes(32).toString('hex');
    await client.query(`INSERT INTO pending_registrations(first_name,last_name,email,password_hash,token_hash,expires_at,last_attempt_at)
      VALUES($1,$2,$3,$4,$5,clock_timestamp()+$6*interval '1 minute',clock_timestamp())
      ON CONFLICT(email) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,password_hash=EXCLUDED.password_hash,
      token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,last_attempt_at=EXCLUDED.last_attempt_at`,[firstName,lastName,email,passwordHash,digest(token),settings.expiry]);
    if(settings.ready)delivery={to:email,subject:'Verify your Belfiore account',text:`Verify your pending Belfiore registration: ${settings.origin}/verify-email#token=${token}\nThis single-use link expires in ${settings.expiry} minutes. If you did not request this, ignore this email.`};
   }
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  // A transport error never activates an account or claims that mail was delivered.
  if(delivery)try{const result=await send(delivery);if(!result?.accepted?.length)throw Error('Not accepted');}catch{return res.status(503).json({error:'Verification email could not be submitted. Registration remains pending. Please try resending later.',retryAfterSeconds:settings.cooldown});}
  res.status(202).json(response(settings));
 }
 const safe=fn=>async(req,res)=>{try{await fn(req,res);}catch{res.status(503).json({error:'Registration service is temporarily unavailable. Please try again later.'});}};
 router.post('/api/auth/register',safe((req,res)=>requestVerification(req,res,true)));
 router.post('/api/auth/resend-verification',safe((req,res)=>requestVerification(req,res,false)));
 const verify=safe(async(req,res)=>{
  if(!await limit(req,res,'verification',120))return;
  const token=req.body?.token||req.query?.token;
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return res.status(400).json({error:'This verification link is invalid or has expired.'});
  const client=await db.connect();
  try {
   await client.query('BEGIN');
   const pending=(await client.query('DELETE FROM pending_registrations WHERE token_hash=$1 AND expires_at>clock_timestamp() RETURNING *',[digest(token)])).rows[0];
   if(!pending){await client.query('ROLLBACK');return res.status(400).json({error:'This verification link is invalid or has expired.'});}
   await client.query(`INSERT INTO users(first_name,last_name,email,password_hash,role) VALUES($1,$2,$3,$4,'customer')`,[pending.first_name,pending.last_name,pending.email,pending.password_hash]);
   await client.query('COMMIT');res.json({message:'Email verified. Your customer account is ready. Please sign in.'});
  }catch(e){await client.query('ROLLBACK');if(e.code==='23505')return res.status(400).json({error:'This verification link is invalid or has expired.'});throw e;}finally{client.release();}
 });
 router.post('/api/auth/verify-email',verify);
 router.get('/api/auth/verify-email',verify); // Compatibility for existing links.
 return router;
}
