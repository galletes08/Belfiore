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
    category: row.category || '',
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

async function ensureTypeId(client, categoryName, tagName) {
  const category = String(categoryName || '').trim();
  const type = String(tagName || '').trim() || 'General';
  if (!category) return null;

  const categoryResult = await client.query(
    `SELECT id FROM categories WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [category]
  );

  let categoryId = categoryResult.rows[0]?.id;
  if (!categoryId) {
    const insertedCategory = await client.query(
      `INSERT INTO categories (name) VALUES ($1) RETURNING id`,
      [category]
    );
    categoryId = insertedCategory.rows[0].id;
  }

  const typeResult = await client.query(
    `SELECT id FROM types WHERE category_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [categoryId, type]
  );

  if (typeResult.rows[0]?.id) return typeResult.rows[0].id;

  const insertedType = await client.query(
    `INSERT INTO types (category_id, name) VALUES ($1, $2) RETURNING id`,
    [categoryId, type]
  );
  return insertedType.rows[0].id;
}

router.get('/api/products', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        COALESCE(c.name, 'Aloe Hybrids') AS category,
        p.name,
        p.tag,
        p.price,
        p.stock,
        p.description,
        p.image_url,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN types t ON t.id = p.type_id
      LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY p.id DESC
    `);
    res.json(result.rows.map(mapProductRow));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load products' });
  }
});

router.post('/api/products', upload.single('image'), async (req, res) => {
  const client = await pool.connect();
  try {
    const category = String(req.body?.category || '').trim();
    const name = String(req.body?.name || '').trim();
    const tag = String(req.body?.tag || '').trim();
    const price = Number(req.body?.price);
    const stock = Number(req.body?.stock);
    const description = String(req.body?.description || '').trim();
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : String(req.body?.imageUrl || '').trim();

    if (!category) return res.status(400).json({ error: 'Category is required' });
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Invalid stock' });

    const typeId = await ensureTypeId(client, category, tag);

    const result = await client.query(
      `
      WITH inserted AS (
        INSERT INTO products (type_id, name, tag, price, stock, description, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, type_id, name, tag, price, stock, description, image_url, created_at, updated_at
      )
      SELECT
        i.id,
        COALESCE(c.name, 'Aloe Hybrids') AS category,
        i.name,
        i.tag,
        i.price,
        i.stock,
        i.description,
        i.image_url,
        i.created_at,
        i.updated_at
      FROM inserted i
      LEFT JOIN types t ON t.id = i.type_id
      LEFT JOIN categories c ON c.id = t.category_id
      `,
      [typeId, name, tag || null, price, stock, description || null, imageUrl || null]
    );

    res.status(201).json(mapProductRow(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create product' });
  } finally {
    client.release();
  }
});

router.patch('/api/products/:id', upload.single('image'), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid product id' });

    const fields = [];
    const values = [];
    let idx = 1;
    let categoryValue;
    let tagValue;

    if (req.body?.name !== undefined) {
      const value = String(req.body.name).trim();
      if (!value) return res.status(400).json({ error: 'Name cannot be empty' });
      fields.push(`name = $${idx++}`);
      values.push(value);
    }
    if (req.body?.category !== undefined) {
      const value = String(req.body.category).trim();
      if (!value) return res.status(400).json({ error: 'Category cannot be empty' });
      categoryValue = value;
    }
    if (req.body?.tag !== undefined) {
      fields.push(`tag = $${idx++}`);
      tagValue = String(req.body.tag).trim() || null;
      values.push(tagValue);
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

    if (categoryValue !== undefined || tagValue !== undefined) {
      const current = await client.query(
        `
        SELECT p.tag, c.name AS category
        FROM products p
        LEFT JOIN types t ON t.id = p.type_id
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE p.id = $1
        LIMIT 1
        `,
        [id]
      );
      if (!current.rows.length) return res.status(404).json({ error: 'Product not found' });
      const resolvedCategory = categoryValue !== undefined ? categoryValue : (current.rows[0].category || 'Aloe Hybrids');
      const resolvedTag = tagValue !== undefined ? tagValue : current.rows[0].tag;
      const typeId = await ensureTypeId(client, resolvedCategory, resolvedTag);
      fields.push(`type_id = $${idx++}`);
      values.push(typeId);
    }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await client.query(
      `
       WITH updated AS (
         UPDATE products
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, type_id, name, tag, price, stock, description, image_url, created_at, updated_at
       )
       SELECT
         u.id,
         COALESCE(c.name, 'Aloe Hybrids') AS category,
         u.name,
         u.tag,
         u.price,
         u.stock,
         u.description,
         u.image_url,
         u.created_at,
         u.updated_at
       FROM updated u
       LEFT JOIN types t ON t.id = u.type_id
       LEFT JOIN categories c ON c.id = t.category_id
      `,
      values
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(mapProductRow(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update product' });
  } finally {
    client.release();
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
