import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { usesSupabaseStorage } from '../utils/storage.js';
import { registerInventoryRoutes } from './inventory-products.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage: usesSupabaseStorage ? multer.memoryStorage() : diskStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 50 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});

function removeUploadedFiles(files = []) {
  if (usesSupabaseStorage) return;
  for (const file of files) {
    if (!file?.path) continue;
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Keep the original request error if cleanup is unsuccessful.
    }
  }
}

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
    productCode: row.product_code,
    inventoryType: row.inventory_type,
    lettuceStockModel:row.lettuce_stock_model||null,
    supplyStockModel:row.supply_stock_model,
    packGrams: row.pack_grams,
    lowStockThreshold: row.low_stock_threshold,
    reservedStock: Number(row.reserved_stock || 0),
    committedStock: Number(row.committed_stock || 0),
    physicalStock: Number(row.stock) + Number(row.reserved_stock || 0) + Number(row.committed_stock || 0),
    archivedAt: row.archived_at,
    soldAt: row.sold_at,
    archiveReason: row.archive_reason || '',
    status: row.inventory_status,
    legacyQuantityReview: row.legacy_quantity_review,
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


registerInventoryRoutes(router, { upload, ensureTypeId, mapProductRow, removeUploadedFiles });
export default router;
