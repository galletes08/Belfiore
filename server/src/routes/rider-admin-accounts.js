import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {pool} from '../config/db.js';
import {newStaffPasswordError} from '../../../shared/staffPasswordPolicy.js';
import {riderManagementSelect,riderAvailabilitySql,riderHistory} from '../utils/riderManagement.js';

const invalid=message=>Object.assign(new Error(message),{status:400});
const identifier=value=>String(value||'').trim().toLowerCase();
const validUsername=value=>/^[a-z0-9][a-z0-9._-]{2,39}$/.test(value);
const row=async(c,id)=>(await c.query(riderManagementSelect+' WHERE r.id=$1',[id])).rows[0];
export async function auditRiderAccount(c,req,userId,action,riderId,details={}) {
  const digest=(purpose,value)=>purpose+':'+crypto.createHmac('sha256',process.env.JWT_SECRET).update(purpose+'\0'+value).digest('hex');
  await c.query(`INSERT INTO auth_security_events(user_id,role,action,subject_key,ip_key,actor_user_id,details)
    VALUES($1,'rider',$2,$3,$4,$5,$6::jsonb)`,[userId,action,digest('rider-account',String(userId)),digest('ip',req.ip||'unknown'),req.riderAdmin?.userId||null,JSON.stringify({riderId,actorType:req.riderAdmin?'admin':'rider',...details})]);
}
const audit=auditRiderAccount;
export function registerRiderAdminAccounts(router,{upload,ensureRidersTable,formatRiderRow,storeUploadedImage}) {
  const handle=handler=>async(req,res)=>{
    let c;
    try{await ensureRidersTable();c=await pool.connect();await c.query('BEGIN');const result=await handler(c,req);await c.query('COMMIT');res.set('Cache-Control','no-store').status(result.status||200).json(result.body);}
    catch(error){if(c)await c.query('ROLLBACK').catch(()=>{});res.status(error.code==='23505'?409:error.status||500).json({error:error.code==='23505'?'That username or email is already assigned.':error.status?error.message:'Unable to update rider account. Please retry.'});}
    finally{c?.release();}
  };
  router.get('/api/admin/riders',handle(async c=>({body:(await c.query(riderManagementSelect+' ORDER BY r.updated_at DESC,r.id DESC')).rows.map(formatRiderRow)})));
  const paging=req=>({page:Math.min(100000,Math.max(1,Number.parseInt(req.query.page,10)||1)),limit:20});
  router.get('/api/admin/riders/:id/security',handle(async(c,req)=>{
    const rider=await row(c,req.params.id);if(!rider)throw Object.assign(new Error('Rider not found'),{status:404});
    const records=(await c.query(`SELECT id,action,created_at FROM auth_security_events WHERE user_id=$1 AND role='rider'
      AND action IN ('Login Failed','Login Temporarily Restricted','Rider Locked Login Rejected','Rider Account Security Locked','Administrator Unlock','Successful Login After Unlock')
      ORDER BY created_at DESC,id DESC LIMIT 20`,[rider.user_id])).rows;
    return {body:{rider:formatRiderRow(rider),records}};
  }));
  router.post('/api/admin/riders/:id/unlock',handle(async(c,req)=>{
    const b=req.body||{},reason=String(b.reason||'').trim(),reference=String(b.verificationReference||'').trim();
    if(b.confirmed!==true||b.identityVerified!==true||reason.length<4||reason.length>300||reference.length<4||reference.length>160)
      throw invalid('Verify this rider against the administrator-managed account record, provide the reference and reason, and confirm the unlock');
    const preview=await row(c,req.params.id);if(!preview||!preview.user_id)throw Object.assign(new Error('Linked rider login not found'),{status:404});
    const limiter='rider-admin-unlock:'+req.riderAdmin.userId;
    await c.query('INSERT INTO auth_security_buckets(key) VALUES($1) ON CONFLICT DO NOTHING',[limiter]);
    const budget=(await c.query("UPDATE auth_security_buckets SET count=CASE WHEN window_start<NOW()-INTERVAL '15 minutes' THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<NOW()-INTERVAL '15 minutes' THEN NOW() ELSE window_start END WHERE key=$1 RETURNING count",[limiter])).rows[0];
    if(budget.count>10)throw Object.assign(new Error('Too many account unlock requests. Try again later.'),{status:429});
    // Same lock order as login: account bucket, then profile/user. Never clear IP budgets.
    const account=(await c.query("SELECT email FROM users WHERE id=$1 AND role='rider'",[preview.user_id])).rows[0];
    if(!account)throw Object.assign(new Error('Linked rider login not found'),{status:404});
    const subject=(account.email||'user:'+preview.user_id).trim().toLowerCase();
    const key='login:'+crypto.createHmac('sha256',process.env.JWT_SECRET).update('login\0'+subject).digest('hex');
    await c.query('INSERT INTO auth_security_buckets(key) VALUES($1) ON CONFLICT DO NOTHING',[key]);
    await c.query('SELECT key FROM auth_security_buckets WHERE key=$1 FOR UPDATE',[key]);
    const rider=(await c.query('SELECT * FROM riders WHERE id=$1 FOR UPDATE',[preview.id])).rows[0];
    const user=(await c.query("SELECT rider_security_locked,email FROM users WHERE id=$1 AND role='rider' FOR UPDATE",[rider.user_id])).rows[0];
    if(!user||rider.user_id!==preview.user_id||user.email!==account.email)throw Object.assign(new Error('Account details changed. Refresh before unlocking.'),{status:409});
    if(String(b.confirmation||'').trim()!==String(rider.id))throw invalid('Confirm the selected rider ID');
    if(!user.rider_security_locked)throw Object.assign(new Error('This rider is no longer security locked. Refresh its details.'),{status:409});
    await c.query('UPDATE users SET rider_security_locked=false,rider_failed_attempts=0,rider_security_unlocked_at=clock_timestamp(),rider_login_after_unlock_pending=true WHERE id=$1',[rider.user_id]);
    await c.query('UPDATE auth_security_buckets SET count=0,blocked_until=NULL,rider_lock_shadow=false,window_start=clock_timestamp() WHERE key=$1',[key]);
    await audit(c,req,rider.user_id,'Administrator Unlock',rider.id,{reason,verificationReference:reference});
    return {body:{message:'Security lock cleared. Account access still depends on Active/Disabled status and any required password change.',rider:formatRiderRow(await row(c,rider.id))}};
  }));
  router.get('/api/admin/riders/manage',handle(async(c,req)=>{
    const {page,limit}=paging(req),search=String(req.query.search||'').trim().slice(0,200).toLowerCase(),filter=String(req.query.filter||'All');
    if(!['All','Available','Busy','Offline','Disabled','Security Locked'].includes(filter))throw invalid('Invalid availability filter');
    const result=(await c.query(`WITH source AS (${riderManagementSelect}),
      classified AS (SELECT *,${riderAvailabilitySql} AS availability FROM source),
      filtered AS (SELECT * FROM classified WHERE ($2='All' OR availability=$2 OR ($2='Disabled' AND NOT account_enabled) OR ($2='Security Locked' AND rider_security_locked))
        AND ($1='' OR POSITION($1 IN LOWER(CONCAT_WS(' ',first_name,last_name,username,phone,email)))>0)),
      page AS (SELECT * FROM filtered ORDER BY updated_at DESC,id DESC LIMIT $3 OFFSET $4)
      SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
        (SELECT json_build_object('total',COUNT(*)::int,'active',COUNT(*) FILTER(WHERE account_enabled)::int,
          'available',COUNT(*) FILTER(WHERE availability='Available')::int) FROM classified) AS summary,
        COALESCE((SELECT json_agg(page ORDER BY updated_at DESC,id DESC) FROM page),'[]'::json) AS riders`,[search,filter,limit,(page-1)*limit])).rows[0];
    return {body:{...result,riders:result.riders.map(formatRiderRow),page,pageSize:limit}};
  }));
  router.get('/api/admin/riders/:id/details',handle(async(c,req)=>{
    const rider=await row(c,req.params.id);if(!rider)throw Object.assign(new Error('Rider not found'),{status:404});
    const history=(await c.query(`SELECT * FROM (${riderHistory}) history ORDER BY assigned_at ASC NULLS FIRST,record_id`,[rider.id])).rows;
    const distinct=new Map(history.map(r=>[Number(r.order_id),r]));
    const orders=[...distinct.values()];
    const active=(await c.query("SELECT id,status FROM orders WHERE rider_id=$1 AND status NOT IN ('Delivered','Cancelled') ORDER BY id DESC",[rider.id])).rows;
    return {body:{rider:formatRiderRow(rider),statistics:{total:orders.length,active:active.length,completed:orders.filter(o=>o.status==='Delivered').length,
      failed:orders.filter(o=>/failed/i.test(o.status)).length},currentAssignments:active}};
  }));
  for(const section of ['deliveries','activity'])router.get(`/api/admin/riders/:id/${section}`,handle(async(c,req)=>{
    const rider=await row(c,req.params.id);if(!rider)throw Object.assign(new Error('Rider not found'),{status:404});
    const {page,limit}=paging(req);
    const sql=section==='deliveries'?riderHistory:`SELECT e.id,e.action,e.created_at,e.details->>'reason' AS reason,
      e.details->>'verificationReference' AS verification_reference,
      CASE WHEN e.actor_user_id IS NOT NULL THEN COALESCE(NULLIF(CONCAT_WS(' ',a.first_name,a.last_name),''),'Administrator')||' (#'||e.actor_user_id||')'
        WHEN e.action='Rider Password Changed' OR e.details->>'actorType'='rider' THEN 'Rider' ELSE 'System / authentication service' END AS actor
      FROM auth_security_events e LEFT JOIN users a ON a.id=e.actor_user_id
      WHERE e.details->>'riderId'=$1::text OR (e.user_id=$2 AND e.role='rider')`;
    const params=section==='deliveries'?[rider.id]:[String(rider.id),rider.user_id];
    const sort=section==='deliveries'?'assigned_at DESC NULLS LAST,record_id DESC':'created_at DESC,id DESC';
    const count=(await c.query(`SELECT COUNT(*)::int AS total FROM (${sql}) records`,params)).rows[0].total;
    const records=(await c.query(`SELECT * FROM (${sql}) records ORDER BY ${sort} LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,(page-1)*limit])).rows;
    return {body:{records,total:count,page,pageSize:limit}};
  }));
  router.patch('/api/admin/riders/:id/status',handle(async(c,req)=>{
    const b=req.body||{},reason=String(b.reason||'').trim();
    if(!['active','inactive'].includes(b.status)||b.confirmed!==true||reason.length<4||reason.length>300)throw invalid('Confirm the account action and provide a reason (4-300 characters)');
    const locked=(await c.query('SELECT * FROM riders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if(!locked)throw Object.assign(new Error('Rider not found'),{status:404});
    if(String(b.confirmation||'').trim()!==String(locked.id))throw invalid('Confirm the selected rider ID');
    if(locked.status===b.status)throw Object.assign(new Error('Account state changed. Refresh rider details.'),{status:409});
    if((await c.query("SELECT id FROM orders WHERE rider_id=$1 AND status NOT IN ('Delivered','Cancelled') LIMIT 1",[locked.id])).rowCount)
      throw Object.assign(new Error('Resolve or reassign ongoing deliveries in Order Management before changing account access.'),{status:409});
    await c.query('UPDATE riders SET status=$2,is_available=false,updated_at=clock_timestamp() WHERE id=$1',[locked.id,b.status]);
    await c.query("UPDATE users SET status=$2,auth_version=auth_version+1,updated_at=clock_timestamp() WHERE id=$1 AND role='rider'",[locked.user_id,b.status]);
    await audit(c,req,locked.user_id,b.status==='active'?'Rider Account Enabled':'Rider Account Disabled',locked.id,{reason});
    return {body:formatRiderRow(await row(c,locked.id))};
  }));
  function values(req) {
    const b=req.body||{},firstName=String(b.firstName||'').trim(),lastName=String(b.lastName||'').trim(),phone=String(b.phone||'').trim();
    if(!firstName||!lastName||!phone)throw invalid('First name, last name and phone are required');
    const email=identifier(b.email),username=identifier(b.username);
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw invalid('Enter a valid optional email');
    if(username&&!validUsername(username))throw invalid('Username must have 3–40 letters, digits, dots, underscores or hyphens');
    return {firstName,lastName,phone,email,username,status:b.status==='inactive'?'inactive':'active',available:b.isAvailable===true||b.isAvailable==='true'};
  }
  router.post('/api/admin/riders',upload.single('profileImage'),handle(async(c,req)=>{
    const v=values(req),password=req.body?.password;
    if(!validUsername(v.username))throw invalid('An assigned username is required');
    const problem=newStaffPasswordError(password);if(problem)throw invalid(problem);
    const passwordHash=await bcrypt.hash(password,12);
    const user=(await c.query(`INSERT INTO users(first_name,last_name,email,username,password_hash,password,role,status,must_change_password)
      VALUES($1,$2,$3,$4,$5,NULL,'rider',$6,true) RETURNING id`,[v.firstName,v.lastName,v.email||null,v.username,passwordHash,v.status])).rows[0];
    const photo=req.file?await storeUploadedImage(req.file,'riders'):null;
    const rider=(await c.query(`INSERT INTO riders(first_name,last_name,email,phone,user_id,status,is_available,profile_image_url)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[v.firstName,v.lastName,v.email||null,v.phone,user.id,v.status,v.status==='active'&&v.available,photo])).rows[0];
    await audit(c,req,user.id,'Rider Login Created',rider.id);
    return {status:201,body:formatRiderRow(await row(c,rider.id))};
  }));
  router.patch('/api/admin/riders/:id',upload.single('profileImage'),handle(async(c,req)=>{
    if(req.body?.password)throw invalid('Use Reset Rider Password with identity verification and confirmation to change credentials');
    const v=values(req),id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw invalid('Invalid rider ID');
    const rider=(await c.query('SELECT * FROM riders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!rider)throw Object.assign(new Error('Rider not found'),{status:404});
    if(v.status!==rider.status)throw invalid('Use the confirmed Enable/Disable action to change account access');
    if(v.available&&rider.status!=='active')throw invalid('Disabled accounts cannot go on duty');
    const user=rider.user_id?(await c.query("SELECT id,username,status FROM users WHERE id=$1 AND role='rider' FOR UPDATE",[rider.user_id])).rows[0]:null;
    if(rider.user_id&&!user)throw invalid('The linked rider login is unavailable');
    if(!user&&v.username)throw invalid('Use the verified Reset Password action to assign a login to this existing profile');
    if(user) {
      await c.query(`UPDATE users SET first_name=$2,last_name=$3,email=$4,username=COALESCE(NULLIF($5,''),username),
        legacy_email_login=CASE WHEN NULLIF($5,'') IS NOT NULL AND username IS DISTINCT FROM $5 THEN false ELSE legacy_email_login END,
        auth_version=auth_version+CASE WHEN email IS DISTINCT FROM $4 OR (NULLIF($5,'') IS NOT NULL AND username IS DISTINCT FROM $5) THEN 1 ELSE 0 END,
        updated_at=clock_timestamp() WHERE id=$1`,[user.id,v.firstName,v.lastName,v.email||null,v.username]);
    }
    const photo=req.file?await storeUploadedImage(req.file,'riders'):null;
    await c.query(`UPDATE riders SET first_name=$2,last_name=$3,email=$4,phone=$5,status=$6,is_available=$7,
      profile_image_url=COALESCE($8,profile_image_url),updated_at=clock_timestamp() WHERE id=$1`,[id,v.firstName,v.lastName,v.email||null,v.phone,v.status,v.available,photo]);
    await audit(c,req,rider.user_id,'Rider Profile Updated',id,{reason:v.available!==rider.is_available?(v.available?'Duty preference set to On Duty':'Duty preference set to Off Duty'):'Administrator updated rider profile'});
    return {body:formatRiderRow(await row(c,id))};
  }));
  router.post('/api/admin/riders/:id/reset-password',handle(async(c,req)=>{
    const id=Number(req.params.id),b=req.body||{},reference=String(b.verificationReference||'').trim(),reason=String(b.reason||'').trim();
    if(!Number.isSafeInteger(id)||id<1)throw invalid('Invalid rider ID');
    if(b.confirmed!==true||b.identityVerified!==true||reference.length<4||reference.length>160||reason.length<4||reason.length>300)
      throw invalid('Complete the approved identity verification procedure, provide its internal reference and reason, and explicitly confirm the reset');
    const problem=newStaffPasswordError(b.temporaryPassword);if(problem)throw invalid(problem);
    const limiter='rider-admin-reset:'+req.riderAdmin.userId;
    await c.query('INSERT INTO auth_security_buckets(key) VALUES($1) ON CONFLICT DO NOTHING',[limiter]);
    const budget=(await c.query("UPDATE auth_security_buckets SET count=CASE WHEN window_start<NOW()-INTERVAL '15 minutes' THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<NOW()-INTERVAL '15 minutes' THEN NOW() ELSE window_start END WHERE key=$1 RETURNING count",[limiter])).rows[0];
    if(budget.count>10)throw Object.assign(new Error('Too many rider credential reset requests. Try again later.'),{status:429});
    const rider=(await c.query('SELECT * FROM riders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!rider)throw Object.assign(new Error('Rider not found'),{status:404});
    let userId=rider.user_id;
    if(!userId&&rider.email) {
      const legacy=(await c.query("SELECT id FROM users WHERE role='rider' AND LOWER(email)=LOWER($1)",[rider.email])).rows[0];
      if(legacy&&!(await c.query('SELECT id FROM riders WHERE user_id=$1',[legacy.id])).rowCount){userId=legacy.id;await c.query('UPDATE riders SET user_id=$2 WHERE id=$1',[id,userId]);}
    }
    let user=userId?(await c.query("SELECT id,email,username FROM users WHERE id=$1 AND role='rider' FOR UPDATE",[userId])).rows[0]:null;
    if(userId&&!user)throw Object.assign(new Error('The existing login link is unavailable. Resolve it before resetting credentials.'),{status:409});
    const hashed=await bcrypt.hash(b.temporaryPassword,12);
    if(!user) {
      const username=identifier(b.username);if(!validUsername(username))throw invalid('Assign a valid username to provision this existing rider profile login');
      user=(await c.query(`INSERT INTO users(first_name,last_name,email,username,password_hash,role,status,must_change_password)
        VALUES($1,$2,$3,$4,$5,'rider',$6,true) RETURNING id,email,username`,[rider.first_name,rider.last_name,rider.email||null,username,hashed,rider.status])).rows[0];
      await c.query('UPDATE riders SET user_id=$2 WHERE id=$1',[id,user.id]);
      await audit(c,req,user.id,'Rider Login Provisioned',id,{verificationReference:reference});
    }
    await c.query('UPDATE users SET password_hash=$2,password=NULL,must_change_password=true,auth_version=auth_version+1,updated_at=clock_timestamp() WHERE id=$1',[user.id,hashed]);
    await c.query('UPDATE auth_password_resets SET used_at=clock_timestamp() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
    await audit(c,req,user.id,'Rider Password Reset',id,{verificationReference:reference,reason});
    return {body:{message:'Temporary credential saved. Deliver it using your approved secure procedure. The rider must change it before accessing the workspace.',username:user.username}};
  }));
}
