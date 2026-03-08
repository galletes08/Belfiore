import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

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

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT_SECRET is missing in server/.env' });
    }

    const columns = await getUserColumns();
    if (!columns.has('email')) {
      return res.status(500).json({ error: "Users table must include an 'email' column" });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existingUser.rows[0]) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertColumns = [];
    const insertValues = [];
    const placeholders = [];

    const addValue = (column, value) => {
      insertColumns.push(column);
      insertValues.push(value);
      placeholders.push(`$${insertValues.length}`);
    };

    if (columns.has('first_name')) addValue('first_name', firstName);
    if (columns.has('last_name')) addValue('last_name', lastName);
    addValue('email', email);
    if (columns.has('password_hash')) addValue('password_hash', passwordHash);
    if (!columns.has('password_hash') && columns.has('password')) addValue('password', password);
    if (columns.has('role')) addValue('role', 'customer');

    const returningColumns = ['id', 'first_name', 'last_name', 'email', 'role'].filter((col) => columns.has(col));
    const result = await pool.query(
      `INSERT INTO users (${insertColumns.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING ${returningColumns.join(', ')}`,
      insertValues
    );

    const user = result.rows[0];
    const token = jwt.sign(
      {
        userId: user.id ?? null,
        email: user.email,
        role: user.role ?? 'customer',
      },
      jwtSecret,
      { expiresIn: '12h' }
    );

    return res.status(201).json(buildAuthResponse(user, token));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Registration failed' });
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

    const userQuery = `SELECT ${selectableColumns.join(', ')} FROM users WHERE email = $1 LIMIT 1`;
    const userResult = await pool.query(userQuery, [email]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let isValid = false;
    if (typeof user.password_hash === 'string' && user.password_hash.length > 0) {
      isValid = await bcrypt.compare(password, user.password_hash);
    } else if (typeof user.password === 'string' && user.password.length > 0) {
      isValid = password === user.password;
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

export default router;
