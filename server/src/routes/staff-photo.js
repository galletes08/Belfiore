import multer from 'multer';
import {pool} from '../config/db.js';
import {requirePermission,staffEvent} from '../utils/staffPermissions.js';
import {normalizeStaffPhoto} from '../utils/staffPhoto.js';
import {createStaffAvatarStorage,staffPhotoUrl} from '../utils/storage.js';
import {STAFF_PHOTO_MAX_BYTES,STAFF_PHOTO_MESSAGE,STAFF_PHOTO_TYPES} from '../../../shared/staffPhotoPolicy.js';

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:STAFF_PHOTO_MAX_BYTES,files:1,fields:1,fieldSize:100,parts:3},fileFilter:(_req,file,cb)=>cb(STAFF_PHOTO_TYPES.includes(file.mimetype)?null:Object.assign(new Error(STAFF_PHOTO_MESSAGE),{status:400}),STAFF_PHOTO_TYPES.includes(file.mimetype))}).single('photo');
const fail=(message,status)=>Object.assign(new Error(message),{status});
export function registerStaffPhoto(router,{db=pool,storage=createStaffAvatarStorage()}={}){
 const auth=[requirePermission('profile.own.update',{db}),(req,res,next)=>req.operationsUser.role==='staff'?next():res.status(403).json({error:'Staff account required.'})];
 const limit=async(req,res,next)=>{
  try{
   const result=await db.query(`INSERT INTO auth_security_buckets(key,count) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN auth_security_buckets.window_start<clock_timestamp()-INTERVAL '15 minutes' THEN 1 ELSE auth_security_buckets.count+1 END,
    window_start=CASE WHEN auth_security_buckets.window_start<clock_timestamp()-INTERVAL '15 minutes' THEN clock_timestamp() ELSE auth_security_buckets.window_start END RETURNING count`,['staff-photo:'+req.operationsUser.userId]);
   if(result.rows[0].count>20)return res.set('Retry-After','900').status(429).json({error:'Too many photo changes. Please try again in 15 minutes.'});next();
  }catch{res.status(503).json({error:'Unable to verify upload limits. Please retry.'});}
 };
 const mutate=remove=>async(req,res)=>{
  let client;
  try{
   res.set('Cache-Control','no-store');
   if(Object.keys(req.body||{}).some(k=>!(remove?['confirmed','expectedPhoto']:['expectedPhoto']).includes(k)))throw fail('Only your profile photo may be changed here.',400);
   if(remove&&req.body?.confirmed!==true)throw fail('Confirm profile photo removal.',400);
   if(typeof req.body?.expectedPhoto!=='string')throw fail('Refresh your profile before changing the photo.',409);
   const normalized=remove?null:await normalizeStaffPhoto(req.file);
   client=await db.connect();await client.query('BEGIN');
   const row=(await client.query("SELECT role,status,auth_version,must_change_password,staff_profile_image_path FROM users WHERE id=$1 FOR UPDATE",[req.operationsUser.userId])).rows[0];
   if(!row||row.role!=='staff'||row.status!=='active'||Number(row.auth_version)!==Number(req.operationsUser.sessionVersion||0))throw fail('Session unavailable. Sign in again.',401);
   if(row.must_change_password)throw fail('Change your temporary password first.',403);
   if((row.staff_profile_image_path||'')!==req.body.expectedPhoto)throw fail('Your profile photo changed. Refresh before saving again.',409);
   if(remove&&!row.staff_profile_image_path)throw fail('No profile picture to remove.',409);
   const key=remove?null:await storage.save(normalized);
   await client.query('UPDATE users SET staff_profile_image_path=$2,updated_at=clock_timestamp() WHERE id=$1',[req.operationsUser.userId,key]);
   await staffEvent(client,req.operationsUser,remove?'Profile Photo Removed':'Profile Photo Updated');
   const profile=(await client.query('SELECT id,first_name,last_name,username,email,role,status,created_at,updated_at,last_login_at,must_change_password,staff_profile_image_path FROM users WHERE id=$1',[req.operationsUser.userId])).rows[0];
   await client.query('COMMIT');
   res.json({message:remove?'Profile picture removed.':'Profile picture saved.',profile:{...profile,profile_image_url:staffPhotoUrl(profile.staff_profile_image_path)}});
  }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});res.status(e.status||503).json({error:e.status?e.message:'Unable to save your profile picture. Please retry.'});}
  finally{client?.release();}
 };
 router.post('/api/staff/profile/photo',...auth,limit,(req,res,next)=>upload(req,res,error=>error?res.status(400).json({error:STAFF_PHOTO_MESSAGE}):next()),mutate(false));
 router.delete('/api/staff/profile/photo',...auth,limit,mutate(true));
}
