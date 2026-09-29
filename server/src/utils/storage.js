import crypto from 'node:crypto';
import path from 'node:path';

const storageDriver = String(process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  .trim()
  .replace(/^['"]|['"]$/g, '');
const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'belfiore-uploads').trim();

export const usesSupabaseStorage = storageDriver === 'supabase';

if (usesSupabaseStorage && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_DRIVER=supabase');
}

function safeExtension(originalName, mimetype = '') {
  const extension = path.extname(originalName || '').toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(extension)) return extension;
  const fallback = mimetype.split('/')[1] || 'jpg';
  return `.${fallback.replace(/[^a-z0-9]/gi, '') || 'jpg'}`;
}

export async function storeUploadedImage(file, folder) {
  if (!file) return null;

  if (!usesSupabaseStorage) {
    return folder === 'riders' ? `/uploads/riders/${file.filename}` : `/uploads/${file.filename}`;
  }

  const objectPath = `${folder}/${Date.now()}-${crypto.randomUUID()}${safeExtension(file.originalname, file.mimetype)}`;
  const headers = {
    apikey: serviceRoleKey,
    'Content-Type': file.mimetype || 'application/octet-stream',
    'x-upsert': 'true',
  };

  // New Supabase secret keys (sb_secret_...) are API keys, not JWTs.
  // Sending them as Bearer tokens causes Supabase Storage to return
  // "Invalid Compact JWS". Legacy service_role JWTs still need Bearer auth.
  if (serviceRoleKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${serviceRoleKey}`;
  }

  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
    method: 'POST',
    headers,
    body: file.buffer,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Storage upload failed');
    throw new Error(`Supabase Storage upload failed: ${message}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
}
