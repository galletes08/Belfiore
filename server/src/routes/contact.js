/* global process */
import nodemailer from 'nodemailer';
import { Router } from 'express';

const router = Router();

function getMailer() {
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
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || port === 465,
    auth: { user, pass },
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

router.post('/api/contact', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const email = String(req.body?.email || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Name, email, subject, and message are required' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (name.length > 120 || phone.length > 40 || email.length > 254 || subject.length > 200 || message.length > 5000) {
    return res.status(400).json({ error: 'One or more fields are too long' });
  }

  try {
    const recipient = process.env.CONTACT_EMAIL || process.env.SMTP_USER;
    await getMailer().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipient,
      replyTo: email,
      subject: `[Website Contact] ${subject}`,
      text: `Name: ${name}\nPhone: ${phone || 'Not provided'}\nEmail: ${email}\n\n${message}`,
      html: `<h2>Website contact message</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><hr><p>${escapeHtml(message).replaceAll('\n', '<br>')}</p>`,
    });
    return res.json({ message: 'Your message has been sent successfully' });
  } catch (error) {
    console.error('Contact email failed:', error);
    return res.status(500).json({ error: 'We could not send your message right now. Please try again later.' });
  }
});

export default router;
