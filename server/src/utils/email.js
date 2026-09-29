import nodemailer from 'nodemailer';

const provider = String(process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase();

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
}

function getSmtpMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error('Email service is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in server/.env');
  }
  return nodemailer.createTransport({
    host,
    port,
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || port === 465,
    auth: { user, pass },
  });
}

export async function sendEmail({ to, subject, text, html }) {
  const from = getFromAddress();
  if (!from) throw new Error('Email sender is not configured. Set EMAIL_FROM or SMTP_FROM.');

  if (provider === 'resend') {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) throw new Error('RESEND_API_KEY is missing.');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text, html }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || data?.name || 'Resend email request failed');
    }
    return data;
  }

  return getSmtpMailer().sendMail({ from, to, subject, text, html });
}
