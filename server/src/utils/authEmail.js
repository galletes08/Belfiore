import {pool} from '../config/db.js';
import {sendAuthEmail,authSender,authRecoveryOrigin} from './authSmtp.js';

export const RECOVERY_UNAVAILABLE='Password recovery email is currently unavailable. Contact your authorized system operator for verified administrator recovery.';
export function authEmailConfiguration() {
  const enabled=process.env.AUTH_EMAIL_DELIVERY_ENABLED==='true';
  const missing=[];
  for(const name of ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD'])if(!String(process.env[name]||'').trim())missing.push(name);
  if(!authSender())missing.push('AUTH_EMAIL_SENDER_ADDRESS or EMAIL_FROM/SMTP_FROM');
  if(!Number.isInteger(Number(process.env.SMTP_PORT||587))||Number(process.env.SMTP_PORT||587)<1||Number(process.env.SMTP_PORT||587)>65535)missing.push('valid SMTP_PORT');
  if(String(process.env.EMAIL_PROVIDER||'smtp').toLowerCase()!=='smtp')missing.push('EMAIL_PROVIDER=smtp');
  let recoveryOriginReady=false;
  try{authRecoveryOrigin();recoveryOriginReady=true;}catch{/* Not configured. */}
  return {enabled,configured:missing.length===0,missing,recoveryOriginReady};
}
export function createAuthEmailService({db=pool,send=sendAuthEmail}={}) {
  async function status() {
    const configuration=authEmailConfiguration();
    const row=(await db.query('SELECT suspicious_login_alerts,password_reset_emails FROM auth_email_settings WHERE id=1')).rows[0]||{};
    return {...configuration,suspiciousLoginAlerts:row.suspicious_login_alerts===true,passwordResetEmails:row.password_reset_emails===true,
      alertsReady:configuration.enabled&&configuration.configured&&row.suspicious_login_alerts===true,
      recoveryReady:configuration.enabled&&configuration.configured&&configuration.recoveryOriginReady&&row.password_reset_emails===true};
  }
  async function notify(kind,message) {
    const current=await status();
    if(!(kind==='Security Alert'?current.alertsReady:current.recoveryReady))return {status:current.enabled&&!current.configured?'not_configured':'disabled'};
    const result=await send(message);
    if(Array.isArray(result?.accepted)&&result.accepted.length===0)throw new Error('SMTP did not accept the recipient');
    return {status:'accepted'}; // Actual SMTP acceptance, never a simulated delivery result.
  }
  return {status,notify};
}
