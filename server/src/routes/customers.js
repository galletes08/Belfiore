import { Router } from 'express';
import { pool } from '../config/db.js';
import { verifyRequestToken } from '../utils/auth.js';

const router = Router();
let ensureUsersTablePromise;

async function ensureUsersTable() {
  if (!ensureUsersTablePromise) {
    ensureUsersTablePromise = pool.query(`
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
    `).then(() =>
      pool.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS first_name TEXT,
          ADD COLUMN IF NOT EXISTS last_name TEXT,
          ADD COLUMN IF NOT EXISTS email TEXT,
          ADD COLUMN IF NOT EXISTS password_hash TEXT,
          ADD COLUMN IF NOT EXISTS password TEXT,
          ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer',
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      `)
    );
  }

  await ensureUsersTablePromise;
}

function formatCustomerRow(row) {
  const firstName = row.first_name || '';
  const lastName = row.last_name || '';

  return {
    id: Number(row.id),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim() || row.email || 'Customer',
    email: row.email || '',
    role: row.role || 'customer',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/api/admin/customers', async (req, res) => {
  try {
    await ensureUsersTable();

    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }

    const result = await pool.query(`
      SELECT id, first_name, last_name, email, role, created_at, updated_at
      FROM users
      WHERE role = 'customer'
      ORDER BY created_at DESC, id DESC
    `);

    res.json(result.rows.map(formatCustomerRow));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to load customers' });
  }
});

export default router;
