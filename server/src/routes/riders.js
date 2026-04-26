import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { pool } from '../config/db.js';
import { verifyRequestToken } from '../utils/auth.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads/riders');
let ensureRidersTablePromise;
let ensureUsersTablePromise;

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (allowedTypes.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Only JPG, PNG, or WEBP image files are allowed'));
  },
});

function formatRiderRow(row) {
  return {
    id: Number(row.id),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || '',
    vehicleType: row.vehicle_type || '',
    plateNumber: row.plate_number || '',
    licenseNumber: row.license_number || '',
    emergencyContact: row.emergency_contact || '',
    bio: row.bio || '',
    profileImageUrl: row.profile_image_url || '',
    status: row.status || 'active',
    isAvailable: Boolean(row.is_available),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function ensureUserForRider({ firstName, lastName, email, password }) {
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

  const riderEmail = normalizeEmail(email);
  const riderPassword = String(password || '');
  const riderFirstName = String(firstName || '').trim();
  const riderLastName = String(lastName || '').trim();

  if (!riderEmail) {
    return null;
  }

  const existingUser = await pool.query(
    `
    SELECT id, role
    FROM users
    WHERE LOWER(email) = $1
    LIMIT 1
    `,
    [riderEmail]
  );

  if (existingUser.rows.length) {
    const user = existingUser.rows[0];
    if (user.role !== 'rider') {
      throw new Error('That email is already used by a non-rider account');
    }

    const updateValues = [user.id, riderFirstName, riderLastName];
    const updateSql = [
      'UPDATE users',
      'SET first_name = $2,',
      '    last_name = $3,',
    ];

    if (riderPassword) {
      const passwordHash = await bcrypt.hash(riderPassword, 10);
      updateValues.push(passwordHash);
      updateSql.push(`    password_hash = $${updateValues.length},`);
    }

    updateSql.push('    updated_at = NOW()', 'WHERE id = $1');
    await pool.query(updateSql.join('\n'), updateValues);

    return Number(user.id);
  }

  if (!riderPassword) {
    throw new Error('Password is required when creating a rider login');
  }

  const passwordHash = await bcrypt.hash(riderPassword, 10);
  const insertedUser = await pool.query(
    `
    INSERT INTO users (first_name, last_name, email, password_hash, role, updated_at)
    VALUES ($1, $2, $3, $4, 'rider', NOW())
    RETURNING id
    `,
    [riderFirstName, riderLastName, riderEmail, passwordHash]
  );

  return Number(insertedUser.rows[0].id);
}

async function findLinkedRiderForUser(authUser) {
  const directMatch = await pool.query(
    `
    SELECT id
    FROM riders
    WHERE user_id = $1
    LIMIT 1
    `,
    [authUser.userId]
  );

  if (directMatch.rows.length) {
    return Number(directMatch.rows[0].id);
  }

  const email = String(authUser.email || '').trim().toLowerCase();
  if (!email) {
    return null;
  }

  const linkedByEmail = await pool.query(
    `
    UPDATE riders
    SET user_id = $1, updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM riders
      WHERE user_id IS NULL
        AND LOWER(email) = $2
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    )
    RETURNING id
    `,
    [authUser.userId, email]
  );

  if (linkedByEmail.rows.length) {
    return Number(linkedByEmail.rows[0].id);
  }

  return null;
}

async function ensureRidersTable() {
  if (!ensureRidersTablePromise) {
    ensureRidersTablePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS riders (
        id BIGSERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT NOT NULL,
        address TEXT,
        vehicle_type TEXT,
        plate_number TEXT,
        license_number TEXT,
        emergency_contact TEXT,
        bio TEXT,
        profile_image_url TEXT,
        user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'active',
        is_available BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() =>
      pool.query(`
        ALTER TABLE riders
          ADD COLUMN IF NOT EXISTS first_name TEXT,
          ADD COLUMN IF NOT EXISTS last_name TEXT,
          ADD COLUMN IF NOT EXISTS email TEXT,
          ADD COLUMN IF NOT EXISTS phone TEXT,
          ADD COLUMN IF NOT EXISTS address TEXT,
          ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
          ADD COLUMN IF NOT EXISTS plate_number TEXT,
          ADD COLUMN IF NOT EXISTS license_number TEXT,
          ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
          ADD COLUMN IF NOT EXISTS bio TEXT,
          ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
          ADD COLUMN IF NOT EXISTS user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
          ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      `)
    ).then(() =>
      pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_riders_email
        ON riders(LOWER(email))
        WHERE email IS NOT NULL
      `)
    );
  }

  await ensureRidersTablePromise;
}

async function requireRiderId(req) {
  const authUser = verifyRequestToken(req);
  if (authUser.role !== 'rider') {
    const error = new Error('Rider access only');
    error.status = 403;
    throw error;
  }

  const riderId = await findLinkedRiderForUser(authUser);
  if (!riderId) {
    const error = new Error('No rider profile is linked to this account');
    error.status = 404;
    throw error;
  }

  return { authUser, riderId };
}

const riderProfileColumns = `
  id,
  first_name,
  last_name,
  email,
  phone,
  address,
  vehicle_type,
  plate_number,
  license_number,
  emergency_contact,
  bio,
  profile_image_url,
  status,
  is_available,
  created_at,
  updated_at
`;

router.get('/api/admin/riders', async (_req, res) => {
  try {
    await ensureRidersTable();

    const result = await pool.query(`
      SELECT id, first_name, last_name, email, phone, status, is_available, created_at, updated_at
      FROM riders
      ORDER BY updated_at DESC, created_at DESC
    `);

    res.json(result.rows.map(formatRiderRow));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load riders' });
  }
});

router.post('/api/admin/riders', async (req, res) => {
  try {
    await ensureRidersTable();

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '').trim();
    const status = String(req.body?.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
    const isAvailable = req.body?.isAvailable == null ? true : Boolean(req.body.isAvailable);

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: 'First name, last name, and phone are required' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email is required for rider login' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required for rider login' });
    }

    const linkedUserId = await ensureUserForRider({ firstName, lastName, email, password });

    const result = await pool.query(
      `
      INSERT INTO riders (first_name, last_name, email, phone, user_id, status, is_available, updated_at)
      VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, NOW())
      RETURNING id, first_name, last_name, email, phone, status, is_available, created_at, updated_at
      `,
      [firstName, lastName, email, phone, linkedUserId, status, isAvailable]
    );

    res.status(201).json(formatRiderRow(result.rows[0]));
  } catch (error) {
    if (String(error.message || '').toLowerCase().includes('duplicate')) {
      return res.status(409).json({ error: 'A rider with that email already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to create rider' });
  }
});

router.patch('/api/admin/riders/:id', async (req, res) => {
  try {
    await ensureRidersTable();

    const riderId = Number(req.params.id);
    if (!Number.isInteger(riderId) || riderId <= 0) {
      return res.status(400).json({ error: 'Invalid rider id' });
    }

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '').trim();
    const status = String(req.body?.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
    const isAvailable = Boolean(req.body?.isAvailable);

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: 'First name, last name, and phone are required' });
    }

    let linkedUserId = null;
    if (email) {
      linkedUserId = await ensureUserForRider({ firstName, lastName, email, password });
    }

    const result = await pool.query(
      `
      UPDATE riders
      SET
        first_name = $2,
        last_name = $3,
        email = NULLIF($4, ''),
        phone = $5,
        user_id = COALESCE($6, user_id),
        status = $7,
        is_available = $8,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, first_name, last_name, email, phone, status, is_available, created_at, updated_at
      `,
      [riderId, firstName, lastName, email, phone, linkedUserId, status, isAvailable]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Rider not found' });
    }

    res.json(formatRiderRow(result.rows[0]));
  } catch (error) {
    if (String(error.message || '').toLowerCase().includes('duplicate')) {
      return res.status(409).json({ error: 'A rider with that email already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to update rider' });
  }
});

router.get('/api/rider/profile', async (req, res) => {
  try {
    await ensureRidersTable();

    const { riderId } = await requireRiderId(req);
    const result = await pool.query(
      `
      SELECT ${riderProfileColumns}
      FROM riders
      WHERE id = $1
      LIMIT 1
      `,
      [riderId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Rider profile not found' });
    }

    res.json(formatRiderRow(result.rows[0]));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to load rider profile' });
  }
});

router.patch('/api/rider/profile', upload.single('profileImage'), async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureRidersTable();

    const { authUser, riderId } = await requireRiderId(req);
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const address = String(req.body?.address || '').trim();
    const vehicleType = String(req.body?.vehicleType || '').trim();
    const plateNumber = String(req.body?.plateNumber || '').trim();
    const licenseNumber = String(req.body?.licenseNumber || '').trim();
    const emergencyContact = String(req.body?.emergencyContact || '').trim();
    const bio = String(req.body?.bio || '').trim();
    const profileImageUrl = req.file ? `/uploads/riders/${req.file.filename}` : null;

    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ error: 'First name, last name, email, and phone are required' });
    }

    await client.query('BEGIN');

    const currentRider = await client.query(
      `
      SELECT user_id
      FROM riders
      WHERE id = $1
      FOR UPDATE
      `,
      [riderId]
    );

    if (!currentRider.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rider profile not found' });
    }

    const result = await client.query(
      `
      UPDATE riders
      SET
        first_name = $2,
        last_name = $3,
        email = $4,
        phone = $5,
        address = NULLIF($6, ''),
        vehicle_type = NULLIF($7, ''),
        plate_number = NULLIF($8, ''),
        license_number = NULLIF($9, ''),
        emergency_contact = NULLIF($10, ''),
        bio = NULLIF($11, ''),
        profile_image_url = COALESCE($12, profile_image_url),
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${riderProfileColumns}
      `,
      [
        riderId,
        firstName,
        lastName,
        email,
        phone,
        address,
        vehicleType,
        plateNumber,
        licenseNumber,
        emergencyContact,
        bio,
        profileImageUrl,
      ]
    );

    const linkedUserId = currentRider.rows[0].user_id || authUser.userId;
    if (linkedUserId) {
      await client.query(
        `
        UPDATE users
        SET first_name = $2,
            last_name = $3,
            email = $4,
            updated_at = NOW()
        WHERE id = $1
          AND role = 'rider'
        `,
        [linkedUserId, firstName, lastName, email]
      );
    }

    await client.query('COMMIT');
    res.json(formatRiderRow(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (String(error.message || '').toLowerCase().includes('duplicate')) {
      return res.status(409).json({ error: 'A rider or user with that email already exists' });
    }
    res.status(error.status || 500).json({ error: error.message || 'Failed to update rider profile' });
  } finally {
    client.release();
  }
});

router.get('/api/rider/orders', async (req, res) => {
  try {
    await ensureRidersTable();

    const { riderId } = await requireRiderId(req);

    const result = await pool.query(
      `
      SELECT
        o.id,
        o.customer_name,
        o.gmail,
        o.mobile_num,
        o.location,
        o.customer_latitude,
        o.customer_longitude,
        o.payment_method,
        o.payment_status,
        o.status,
        COALESCE(NULLIF(TRIM(o.courier_name), ''), CONCAT_WS(' ', r.first_name, r.last_name)) AS courier_name,
        COALESCE(NULLIF(TRIM(o.driver_phone), ''), r.phone) AS driver_phone,
        o.driver_access_token,
        o.driver_assigned_at,
        o.driver_accepted_at,
        o.driver_latitude,
        o.driver_longitude,
        o.driver_location_updated_at,
        o.tracking_code,
        o.tracking_status,
        o.total_amount,
        o.created_at,
        o.updated_at,
        o.status_updated_at,
        COALESCE(SUM(oi.qty), 0)::int AS item_count,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'productId', oi.product_id,
              'productName', oi.product_name,
              'imageUrl', oi.image_url,
              'qty', oi.qty,
              'unitPrice', oi.unit_price,
              'lineTotal', oi.line_total
            )
            ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      LEFT JOIN riders r ON r.id = o.rider_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.rider_id = $1
      GROUP BY o.id, r.first_name, r.last_name, r.phone
      ORDER BY o.created_at DESC
      `,
      [riderId]
    );

    const formatted = result.rows.map((row) => ({
      id: Number(row.id),
      orderCode: `ORD-${String(row.id).padStart(3, '0')}`,
      customerName: row.customer_name,
      gmail: row.gmail || '',
      mobileNumber: row.mobile_num || '',
      location: row.location || '',
      customerLatitude: row.customer_latitude == null ? null : Number(row.customer_latitude),
      customerLongitude: row.customer_longitude == null ? null : Number(row.customer_longitude),
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      status: row.status,
      courierName: row.courier_name || '',
      driverPhone: row.driver_phone || '',
      driverAccessToken: row.driver_access_token || '',
      driverAssignedAt: row.driver_assigned_at || null,
      driverAcceptedAt: row.driver_accepted_at || null,
      driverLatitude: row.driver_latitude == null ? null : Number(row.driver_latitude),
      driverLongitude: row.driver_longitude == null ? null : Number(row.driver_longitude),
      driverLocationUpdatedAt: row.driver_location_updated_at || null,
      trackingCode: row.tracking_code || '',
      trackingStatus: row.tracking_status || 'Pending',
      totalAmount: Number(row.total_amount || 0),
      itemCount: Number(row.item_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      statusUpdatedAt: row.status_updated_at,
      items: Array.isArray(row.items)
        ? row.items.map((item) => ({
          id: Number(item.id),
          productId: item.productId == null ? null : Number(item.productId),
          productName: item.productName,
          imageUrl: item.imageUrl || '',
          qty: Number(item.qty || 0),
          unitPrice: Number(item.unitPrice || 0),
          lineTotal: Number(item.lineTotal || 0),
        }))
        : [],
    }));

    res.json(formatted);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to load rider orders' });
  }
});

export { ensureRidersTable };
export default router;
