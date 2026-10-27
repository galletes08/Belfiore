import { Router } from 'express';
import { pool } from '../config/db.js';
import {requirePermission} from '../utils/staffPermissions.js';
import { verifyRequestToken } from '../utils/auth.js';

const router = Router();
const paths=['/api/admin/notifications','/api/staff/notifications'];
router.use('/api/staff/notifications',requirePermission('orders.operational.read'));
router.use(paths, (req,res,next)=>{
  try {
    const user=verifyRequestToken(req);
    if(user.role!=='admin'&&!(req.operationsUser?.role==='staff'&&req.originalUrl.startsWith('/api/staff/notifications'))) return res.status(403).json({error:'Admin access only'});
    if(!/^\d+$/.test(String(user.userId)) || Number(user.userId)<=0) return res.status(401).json({error:'Sign in again to access notifications'});
    req.notificationUser=String(user.userId);
    // Staff sees operational alerts; financial exceptions remain Admin-only.
    req.notificationScope=user.role==='staff'?"recipient_role='admin' AND event_type IN ('cod_order','online_paid','cancellation_request') AND order_id IS NOT NULL":"recipient_role='admin'";
    res.set('Cache-Control','no-store');next();
  } catch(error){res.status(error.status||401).json({error:error.message});}
});
const handle = handler => async(req,res)=>{try{await handler(req,res);}catch(error){console.error('Notifications API:',error.message);res.status(500).json({error:'Notifications are temporarily unavailable. Please retry.'});}};
router.get(paths.map(path=>path+'/unread-count'),handle(async(req,res)=>{
  const result=await pool.query(`SELECT COUNT(*)::int AS unread FROM admin_notifications n WHERE ${req.notificationScope}
    AND NOT EXISTS(SELECT 1 FROM admin_notification_reads r WHERE r.notification_id=n.id AND r.user_id=$1)`,[req.notificationUser]);
  res.json(result.rows[0]);
}));
router.get(paths,handle(async(req,res)=>{
  const page=Number(req.query.page||1),limit=Number(req.query.limit||10);
  if(!Number.isSafeInteger(page)||page<1||page>1000000||![10,25].includes(limit))return res.status(400).json({error:'Invalid notification page'});
  const rows=await pool.query(`SELECT n.id,n.event_type,n.order_id,n.title,n.message,n.created_at,r.read_at,
    (r.read_at IS NOT NULL) AS is_read FROM admin_notifications n LEFT JOIN admin_notification_reads r ON r.notification_id=n.id AND r.user_id=$1
    WHERE ${req.notificationScope} ORDER BY n.created_at DESC,n.id DESC LIMIT $2 OFFSET $3`,[req.notificationUser,limit,(page-1)*limit]);
  const counts=await pool.query(`SELECT COUNT(*)::int AS total,COALESCE(MAX(n.id),0)::text AS "throughId",COUNT(*) FILTER(WHERE NOT EXISTS
    (SELECT 1 FROM admin_notification_reads r WHERE r.notification_id=n.id AND r.user_id=$1))::int AS unread FROM admin_notifications n WHERE ${req.notificationScope}`,[req.notificationUser]);
  res.json({notifications:rows.rows,...counts.rows[0],page,pageSize:limit});
}));
router.post(paths.map(path=>path+'/read-all'),handle(async(req,res)=>{
  // Only acknowledge records actually loaded by this client, not concurrently arriving alerts.
  const through=String(req.body?.throughId||'');
  if(!/^\d+$/.test(through))return res.status(400).json({error:'Load notifications before marking all read'});
  await pool.query(`INSERT INTO admin_notification_reads(notification_id,user_id) SELECT id,$1 FROM admin_notifications
    WHERE ${req.notificationScope} AND id<=$2 ON CONFLICT DO NOTHING`,[req.notificationUser,through]);res.json({ok:true});
}));
router.post(paths.map(path=>path+'/:id/read'),handle(async(req,res)=>{
  if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Invalid notification ID'});
  const result=await pool.query(`INSERT INTO admin_notification_reads(notification_id,user_id)
    SELECT id,$2 FROM admin_notifications WHERE id=$1 AND ${req.notificationScope}
    ON CONFLICT(notification_id,user_id) DO UPDATE SET read_at=admin_notification_reads.read_at RETURNING notification_id`,[req.params.id,req.notificationUser]);
  if(!result.rows.length)return res.status(404).json({error:'Notification unavailable'});
  res.json({ok:true});
}));
export default router;
