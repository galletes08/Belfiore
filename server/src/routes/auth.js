import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function looksLikeBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]?\$\d{2}\$/.test(value);
}

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

async function ensurePendingRegistrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_registrations (
      id BIGSERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires_at ON pending_registrations(expires_at)');
}

async function sendVerificationEmail({ email, firstName, token }) {
  const verificationUrl = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await getMailer().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Verify your Belfiore account',
    text: `Hi ${firstName},\n\nVerify your Belfiore account by opening this link:\n${verificationUrl}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Hi ${firstName},</p><p>Verify your Belfiore account by clicking the button below.</p><p><a href="${verificationUrl}" style="background:#047857;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Verify email</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
  });
}

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      password TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS password_hash TEXT,
      ADD COLUMN IF NOT EXISTS password TEXT,
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
}

async function getUserColumns() {
  await ensureUsersTable();
  const columnsResult = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'`
  );
  return new Set(columnsResult.rows.map((row) => row.column_name));
}

function buildAuthResponse(user, token) {
  const firstName = user.first_name ?? '';
  const lastName = user.last_name ?? '';

  return {
    token,
    user: {
      id: user.id ?? null,
      email: user.email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      role: user.role ?? 'customer',
    },
  };
}

router.post('/api/auth/register', async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'First name, last name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const columns = await getUserColumns();
    if (!columns.has('email')) {
      return res.status(500).json({ error: "Users table must include an 'email' column" });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existingUser.rows[0]) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    await ensurePendingRegistrationsTable();
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      `INSERT INTO pending_registrations (first_name, last_name, email, password_hash, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         password_hash = EXCLUDED.password_hash,
         token_hash = EXCLUDED.token_hash,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()`,
      [firstName, lastName, email, passwordHash, hashVerificationToken(verificationToken), expiresAt]
    );

    await sendVerificationEmail({ email, firstName, token: verificationToken });
    return res.status(202).json({ email, message: 'Verification email sent. Check your inbox to finish creating your account.' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    return res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

router.get('/api/auth/verify-email', async (req, res) => {
  try {
    const token = String(req.query?.token || '');
    if (!token) return res.status(400).json({ error: 'Verification token is required' });
    await ensurePendingRegistrationsTable();
    const pendingResult = await pool.query(
      `SELECT * FROM pending_registrations WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1`,
      [hashVerificationToken(token)]
    );
    const pending = pendingResult.rows[0];
    if (!pending) return res.status(400).json({ error: 'This verification link is invalid or has expired.' });

    const columns = await getUserColumns();
    const insertColumns = ['email'];
    const insertValues = [pending.email];
    const placeholders = ['$1'];
    const addValue = (column, value) => {
      insertColumns.push(column);
      insertValues.push(value);
      placeholders.push(`$${insertValues.length}`);
    };
    if (columns.has('first_name')) addValue('first_name', pending.first_name);
    if (columns.has('last_name')) addValue('last_name', pending.last_name);
    if (columns.has('password_hash')) addValue('password_hash', pending.password_hash);
    if (!columns.has('password_hash') && columns.has('password')) addValue('password', pending.password_hash);
    if (columns.has('role')) addValue('role', 'customer');

    const client = await pool.connect();
    await client.query('BEGIN');
    try {
      const result = await client.query(
        `INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})
         RETURNING id, first_name, last_name, email, role`,
        insertValues
      );
      await client.query('DELETE FROM pending_registrations WHERE id = $1', [pending.id]);
      await client.query('COMMIT');
      client.release();
      return res.json({ message: 'Email verified successfully. Your account is ready.', email: result.rows[0].email });
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
      throw error;
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Email verification failed' });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const columns = await getUserColumns();

    if (!columns.has('email')) {
      return res.status(500).json({ error: "Users table must include an 'email' column" });
    }

    const selectableColumns = ['id', 'first_name', 'last_name', 'email', 'password', 'password_hash', 'role'].filter((col) =>
      columns.has(col)
    );
    if (!selectableColumns.length) {
      return res.status(500).json({ error: 'Users table has no supported login columns' });
    }

    const userQuery = `SELECT ${selectableColumns.join(', ')} FROM users WHERE LOWER(email) = $1 LIMIT 1`;
    const userResult = await pool.query(userQuery, [email]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.role === 'customer') {
      await ensurePendingRegistrationsTable();
      const pending = await pool.query('SELECT 1 FROM pending_registrations WHERE email = $1 LIMIT 1', [email]);
      if (pending.rows[0]) return res.status(403).json({ error: 'Please verify your email before signing in.' });
    }

    let isValid = false;
    if (typeof user.password_hash === 'string' && user.password_hash.length > 0) {
      isValid = await bcrypt.compare(password, user.password_hash);
    } else if (typeof user.password === 'string' && user.password.length > 0) {
      isValid = looksLikeBcryptHash(user.password)
        ? await bcrypt.compare(password, user.password)
        : password === user.password;
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT_SECRET is missing in server/.env' });
    }

    const token = jwt.sign(
      {
        userId: user.id ?? null,
        email: user.email,
        role: user.role ?? 'customer',
      },
      jwtSecret,
      { expiresIn: '12h' }
    );

    return res.json(buildAuthResponse(user, token));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Login failed' });
  }
});

router.patch('/api/auth/password', async (req, res) => {
  try {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const jwtSecret = process.env.JWT_SECRET;

    if (!token || !jwtSecret) {
      return res.status(401).json({ error: 'Authentication is required' });
    }

    let session;
    try {
      session = jwt.verify(token, jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Your session is invalid or has expired' });
    }

    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Choose a new password different from your current password' });
    }

    const columns = await getUserColumns();
    const selectableColumns = ['id', 'email', 'password', 'password_hash'].filter((column) => columns.has(column));
    const lookupColumn = session.userId && columns.has('id') ? 'id' : 'email';
    const lookupValue = lookupColumn === 'id' ? session.userId : session.email;
    const userResult = await pool.query(
      'SELECT ' + selectableColumns.join(', ') + ' FROM users WHERE ' + lookupColumn + ' = $1 LIMIT 1',
      [lookupValue]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const currentMatches = user.password_hash
      ? await bcrypt.compare(currentPassword, user.password_hash)
      : user.password === currentPassword;

    if (!currentMatches) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updates = ['password_hash = $1'];
    if (columns.has('password')) updates.push('password = NULL');
    if (columns.has('updated_at')) updates.push('updated_at = NOW()');

    await pool.query(
      'UPDATE users SET ' + updates.join(', ') + ' WHERE ' + lookupColumn + ' = $2',
      [passwordHash, lookupValue]
    );

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to update password' });
  }
});
export default router;
