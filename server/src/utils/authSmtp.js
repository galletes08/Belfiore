import nodemailer from 'nodemailer';

export function authSender() {
  if(process.env.AUTH_EMAIL_SENDER_ADDRESS)return {name:process.env.AUTH_EMAIL_SENDER_NAME||'Belfiore Account Security',address:process.env.AUTH_EMAIL_SENDER_ADDRESS};
  return process.env.EMAIL_FROM||process.env.SMTP_FROM||'';
}
export function authRecoveryOrigin() {
  const origin=new URL(String(process.env.PUBLIC_APP_URL||process.env.FRONTEND_URL||'').split(',')[0].trim());
  if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw new Error('Secure public application URL required');
  return origin.origin;
}
export async function sendAuthEmail(message) {
  const mailer=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),
    secure:process.env.SMTP_SECURE==='true'||Number(process.env.SMTP_PORT)===465,
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},family:4,
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  return mailer.sendMail({...message,from:authSender()});
}
