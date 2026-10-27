import {pool} from '../config/db.js';
import {verifyRequestToken} from './auth.js';

import {STAFF_PERMISSIONS} from '../../../shared/staffPermissions.js';
export {STAFF_PERMISSIONS};
export async function ownsNewSupply(c,req,productId){
 return Boolean((await c.query("SELECT 1 FROM staff_activity WHERE staff_id=$1 AND product_id=$2 AND action='Product Added' LIMIT 1",[req.inventoryUser.userId,productId])).rowCount);
}
export function requirePermission(permission,{db=pool,allowTemporary=false}={}) {
 return async(req,res,next)=>{
  try {
   const token=verifyRequestToken(req);
   if(!['admin','staff'].includes(token.role)||(token.role==='staff'&&!STAFF_PERMISSIONS.has(permission)))return res.status(403).json({error:'Permission denied'});
   const user=(await db.query('SELECT id,role,status,auth_version,must_change_password FROM users WHERE id=$1',[token.userId])).rows[0];
   if(!user||user.role!==token.role||user.status!=='active'||Number(token.sessionVersion||0)!==Number(user.auth_version))return res.status(401).json({error:'Session unavailable. Sign in again.'});
   if(user.must_change_password&&!allowTemporary)return res.status(403).json({code:'PASSWORD_CHANGE_REQUIRED',error:'Change your temporary password first.'});
   req.operationsUser={...token,userId:Number(user.id)};req.inventoryUser=req.operationsUser;next();
  }catch(error){res.status(error.status||503).json({error:error.status?error.message:'Unable to verify permissions'});}
 };
}
export const operationsActor=req=>`${req.operationsUser.role==='staff'?'Staff':'Admin'} #${req.operationsUser.userId}`;
export async function staffEvent(c,user,action,{staffId=user.userId,orderId=null,productId=null,oldValue=null,newValue=null,reason=''}={}){
 await c.query('INSERT INTO staff_activity(staff_id,actor_id,action,order_id,product_id,old_value,new_value,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[staffId,user.userId,action,orderId,productId,oldValue,newValue,reason]);
 await c.query("INSERT INTO auth_security_events(user_id,actor_user_id,role,action,subject_key,ip_key,details) VALUES($1,$2,'staff',$3,$4,'internal',$5)",[staffId,user.userId,action,'staff-operation:'+staffId,{orderId,productId,result:'Recorded',reason}]);
}
