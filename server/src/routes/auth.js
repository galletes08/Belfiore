import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { pool } from '../config/db.js';
import {createCustomerRegistration} from './customer-registration.js';
import { createStaffAuth,newStaffPasswordError } from '../utils/staffAuth.js';
import {consumeCustomerPasswordAttempt} from '../utils/customerPasswordLimit.js';

const router = Router();
const staffSecurity=createStaffAuth();
router.use(staffSecurity.router);

router.use(createCustomerRegistration());

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
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
}

async function getUserColumns() {
  await ensureUsersTable();
  const columnsResult = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'users'`
  );
  return new Set(columnsResult.rows.map((row) => row.column_name));
}

// The requested portal restricts allowed roles; it never assigns an account role.
router.post('/api/auth/login', async (req, res) => {
  try { await staffSecurity.login(req,res); }
  catch { res.status(503).json({error:'Unable to sign in. Please try again later.'}); }
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

    if(['customer','staff'].includes(session.role)&&!await consumeCustomerPasswordAttempt(pool,session.userId)) {
      res.set('Retry-After','900');
      return res.status(429).json({error:'Too many password-change attempts. Please try again in 15 minutes.'});
    }
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    if(['admin','rider','staff'].includes(session.role)) {
      const problem=newStaffPasswordError(newPassword);
      if(problem)return res.status(400).json({error:problem});
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

    const staff=['admin','rider','staff'].includes(session.role);
    const passwordHash = await bcrypt.hash(newPassword, staff?12:10);
    const updates = ['password_hash = $1'];
    if(['admin','rider','staff'].includes(session.role))updates.push('auth_version = auth_version + 1');
    if(['rider','staff'].includes(session.role))updates.push('must_change_password = false');
    if (columns.has('password')) updates.push('password = NULL');
    if (columns.has('updated_at')) updates.push('updated_at = NOW()');

    const updateSql='UPDATE users SET ' + updates.join(', ') + ' WHERE ' + lookupColumn + ' = $2'+(staff?' AND auth_version = $7':'');
    if(staff) {
      const subject='password-change:'+crypto.createHash('sha256').update(String(user.id)).digest('hex');
      const ip='ip:'+crypto.createHmac('sha256',process.env.JWT_SECRET).update('ip\0'+String(req.ip||'unknown')).digest('hex');
      const changed=await pool.query(`WITH changed AS (${updateSql} RETURNING id),
        consumed AS (UPDATE auth_password_resets SET used_at=clock_timestamp() FROM changed WHERE user_id=changed.id AND used_at IS NULL RETURNING auth_password_resets.id)
        INSERT INTO auth_security_events(user_id,role,action,subject_key,ip_key) SELECT id,$3,$4,$5,$6 FROM changed`,
      [passwordHash,lookupValue,session.role,session.role==='rider'?'Rider Password Changed':'Staff Password Changed',subject,ip,Number(session.sessionVersion||0)]);
      if(!changed.rowCount)return res.status(401).json({error:'Your session was revoked. Sign in again before changing credentials.'});
    }else await pool.query(updateSql,[passwordHash,lookupValue]);

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to update password' });
  }
});
export default router;
