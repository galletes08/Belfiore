import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const storageDriver = String(process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  .trim()
  .replace(/^['"]|['"]$/g, '');
const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'belfiore-uploads').trim();

export const usesSupabaseStorage = storageDriver === 'supabase';

const staffKey=/^staff\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
export function staffPhotoUrl(key){
  if(!key||!staffKey.test(key))return '';
  return usesSupabaseStorage?`${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${key}`:`/uploads/${key}`;
}
export function createStaffAvatarStorage({root=fileURLToPath(new URL('../../uploads/',import.meta.url)),remote=usesSupabaseStorage}={}){
 return {async save(buffer){
  const key=`staff/${crypto.randomUUID()}.jpg`;
  if(!remote){
   await fs.mkdir(path.join(root,'staff'),{recursive:true});
   await fs.writeFile(path.join(root,key),buffer,{flag:'wx',mode:0o600});
  }else{
   const headers={apikey:serviceRoleKey,'Content-Type':'image/jpeg','x-upsert':'false'};
   if(serviceRoleKey.startsWith('eyJ'))headers.Authorization=`Bearer ${serviceRoleKey}`;
   const response=await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${key}`,{method:'POST',headers,body:buffer,signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error('Profile image storage unavailable');
  }
  return key;
 }};
}

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
