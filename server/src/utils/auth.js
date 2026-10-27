import jwt from 'jsonwebtoken';
import {pool} from '../config/db.js';

// Recheck persisted account state and revocation version for every authenticated role.
export async function rejectDisabledCustomer(req,res,next) {
  const token=getBearerToken(req);
  if(!token)return next();
  let user;
  try{user=jwt.verify(token,process.env.JWT_SECRET);}catch{return next();}
  if(!['customer','admin','rider','staff'].includes(user.role))return next();
  try{
    const result=await pool.query(`SELECT status,auth_version,must_change_password FROM users WHERE role=$3 AND
      (($1::bigint IS NOT NULL AND id=$1) OR ($1::bigint IS NULL AND LOWER(email)=LOWER($2))) LIMIT 1`,[user.userId||null,user.email||'',user.role]);
    if(!result.rows.length||result.rows[0].status!=='active')return res.status(403).json({error:'This account is disabled or unavailable. Please contact the administrator.'});
    if(Number(user.sessionVersion||0)!==result.rows[0].auth_version)return res.status(401).json({error:'Your account session has been revoked. Please sign in again.'});
    if(['rider','staff'].includes(user.role)&&result.rows[0].must_change_password&&!(req.method==='PATCH'&&req.path==='/api/auth/password'))
      return res.status(403).json({code:'PASSWORD_CHANGE_REQUIRED',error:'Change your administrator-issued temporary password before accessing your workspace.'});
    next();
  }catch{res.status(503).json({error:'Unable to verify account access. Please retry.'});}
}

export function getBearerToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

export function verifyRequestToken(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    const error = new Error('JWT_SECRET is missing in server/.env');
    error.status = 500;
    throw error;
  }

  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    const error = new Error('Invalid or expired token');
    error.status = 401;
    throw error;
  }
}
