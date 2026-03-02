import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const columnsResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'`
    );
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));

    if (!columns.has('email')) {
      return res.status(500).json({ error: "Users table must include an 'email' column" });
    }

    const selectableColumns = ['id', 'email', 'password', 'password_hash', 'role'].filter((col) => columns.has(col));
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
        role: user.role ?? 'admin',
      },
      jwtSecret,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      user: {
        id: user.id ?? null,
        email: user.email,
        role: user.role ?? 'admin',
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Login failed' });
  }
});

export default router;

