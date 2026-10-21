import {pool} from '../config/db.js';
import {createAuthEmailService} from './authEmail.js';

export const ADMIN_ALERT_SUBJECT='Belfiore Security Alert — Unsuccessful Login Attempts';
export const ADMIN_ALERT_TEXT='Hello Administrator,\n\nWe detected multiple unsuccessful sign-in attempts to your Belfiore Administrator account.\n\nYour account has been temporarily restricted for security purposes.\n\nIf these attempts were yours, please wait before signing in again.\n\nIf these attempts were not yours, please review your account security and use Forgot Password to change your password.\n\nBelfiore Account Security';

// Single SMTP attempt per unique incident: never automatically replay an ambiguous acceptance.
// Persisted queued work survives restarts; stale in-flight work is failed for operator review.
export function createAdminAlertQueue({db=pool,email=createAuthEmailService({db})}={}) {
  let running=null;
  const audit=(c,job,action,result)=>c.query(`INSERT INTO auth_security_events(user_id,role,action,subject_key,ip_key,details)
    VALUES($1,'admin',$2,$3,$4,$5::jsonb)`,[job.user_id,action,job.subject_key,job.ip_key,JSON.stringify({incident:job.incident,result})]);
  async function enqueue(c,{incident,user,subject,ip}) {
    const job=(await c.query(`INSERT INTO auth_admin_alert_queue(incident,user_id,subject_key,ip_key)
      VALUES($1,$2,$3,$4) ON CONFLICT(incident) DO NOTHING RETURNING *`,[incident,user.id,subject,ip])).rows[0];
    if(job)await audit(c,job,'Security Alert Queued','Queued');
  }
  async function finish(job,state,action,result) {
    const c=await db.connect();
    try{await c.query('BEGIN');const changed=await c.query("UPDATE auth_admin_alert_queue SET state=$2,finished_at=clock_timestamp() WHERE id=$1 AND state='sending' RETURNING id",[job.id,state]);if(changed.rowCount)await audit(c,job,action,result);await c.query('COMMIT');}
    catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  async function drain() {
    // A crashed/ambiguous SMTP attempt must not be resent and potentially spam the sole Admin.
    const stale=(await db.query("SELECT * FROM auth_admin_alert_queue WHERE state='sending' AND claimed_at<clock_timestamp()-INTERVAL '20 minutes'")).rows;
    for(const job of stale)await finish(job,'failed','Security Alert Failed','Outcome unknown; operator review required');
    for(let i=0;i<20;i++) {
      const job=(await db.query(`UPDATE auth_admin_alert_queue SET state='sending',attempts=1,claimed_at=clock_timestamp()
        WHERE id=(SELECT id FROM auth_admin_alert_queue WHERE state='queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
        AND state='queued' RETURNING *`)).rows[0];
      if(!job)break;
      try {
        const user=(await db.query("SELECT email FROM users WHERE id=$1 AND role='admin' AND status='active'",[job.user_id])).rows[0];
        if(!user?.email){await finish(job,'unavailable','Security Alert Unavailable','Registered administrator unavailable');continue;}
        const result=await email.notify('Security Alert',{to:user.email,subject:ADMIN_ALERT_SUBJECT,text:ADMIN_ALERT_TEXT,messageId:`<belfiore-admin-security-${job.incident}@belfiore.invalid>`});
        if(result.status==='accepted')await finish(job,'sent','Security Alert Sent','SMTP accepted; inbox delivery not asserted');
        else await finish(job,'unavailable','Security Alert Unavailable',result.status==='not_configured'?'Email not configured':'Email disabled');
      }catch{await finish(job,'failed','Security Alert Failed','SMTP submission failed or outcome unknown; no automatic replay');}
    }
  }
  function runPending(){if(!running)running=drain().finally(()=>{running=null;});return running;}
  function kick(){setImmediate(()=>runPending().catch(()=>{/* Durable queued work retries on the next sweep; never log transport secrets. */}));}
  return {enqueue,runPending,kick};
}
