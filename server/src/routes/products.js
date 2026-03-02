import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { pool } from '../config/db.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});

function mapProductRow(row) {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    price: Number(row.price),
    stock: Number(row.stock),
    description: row.description || '',
    imageUrl: row.image_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/api/products', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, tag, price, stock, description, image_url, created_at, updated_at
      FROM products
      ORDER BY id DESC
    `);
    res.json(result.rows.map(mapProductRow));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load products' });
  }
});

router.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const tag = String(req.body?.tag || '').trim();
    const price = Number(req.body?.price);
    const stock = Number(req.body?.stock);
    const description = String(req.body?.description || '').trim();
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : String(req.body?.imageUrl || '').trim();

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Invalid stock' });

    const result = await pool.query(
      `INSERT INTO products (name, tag, price, stock, description, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, tag, price, stock, description, image_url, created_at, updated_at`,
      [name, tag || null, price, stock, description || null, imageUrl || null]
    );

    res.status(201).json(mapProductRow(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create product' });
  }
});

router.patch('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid product id' });

    const fields = [];
    const values = [];
    let idx = 1;

    if (req.body?.name !== undefined) {
      const value = String(req.body.name).trim();
      if (!value) return res.status(400).json({ error: 'Name cannot be empty' });
      fields.push(`name = $${idx++}`);
      values.push(value);
    }
    if (req.body?.tag !== undefined) {
      fields.push(`tag = $${idx++}`);
      values.push(String(req.body.tag).trim() || null);
    }
    if (req.body?.price !== undefined) {
      const value = Number(req.body.price);
      if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'Invalid price' });
      fields.push(`price = $${idx++}`);
      values.push(value);
    }
    if (req.body?.stock !== undefined) {
      const value = Number(req.body.stock);
      if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: 'Invalid stock' });
      fields.push(`stock = $${idx++}`);
      values.push(value);
    }
    if (req.body?.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(String(req.body.description).trim() || null);
    }
    if (req.body?.imageUrl !== undefined) {
      fields.push(`image_url = $${idx++}`);
      values.push(String(req.body.imageUrl).trim() || null);
    }
    if (req.file) {
      fields.push(`image_url = $${idx++}`);
      values.push(`/uploads/${req.file.filename}`);
    }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE products
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, name, tag, price, stock, description, image_url, created_at, updated_at`,
      values
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(mapProductRow(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update product' });
  }
});

router.delete('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid product id' });

    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete product' });
  }
});

export default router;
