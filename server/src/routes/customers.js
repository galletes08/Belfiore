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
          ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
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
    fullName: row.profile_name || `${firstName} ${lastName}`.trim() || row.email || 'Customer',
    profileImageUrl: row.profile_image_url || '',
    email: row.email || '',
    role: row.role || 'customer',
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.use('/api/admin/customers',async(req,res,next)=>{
  try{const user=verifyRequestToken(req);if(user.role!=='admin')return res.status(403).json({error:'Admin access only'});req.customerAdmin=user;await ensureUsersTable();next();}catch(error){res.status(error.status||500).json({error:error.message});}
});
router.get('/api/admin/customers', async (req, res) => {
  try {
    await ensureUsersTable();

    const authUser = verifyRequestToken(req);
    if (authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }

    const result = await pool.query(`
      SELECT id, first_name, last_name, email, role, status, created_at, updated_at,customer_profile->>'name' AS profile_name,customer_profile->>'image' AS profile_image_url
      FROM users
      WHERE role = 'customer'
      ORDER BY created_at DESC, id DESC
    `);

    res.json(result.rows.map(formatCustomerRow));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to load customers' });
  }
});


const safe=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Unable to load customer data. Please retry.'});}};
function idOf(value){const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw Object.assign(new Error('Invalid customer ID'),{status:400});return id;}
function pageOf(value){const page=Number(value||1);if(!Number.isSafeInteger(page)||page<1||page>1000000)throw Object.assign(new Error('Invalid page'),{status:400});return page;}
async function customerOf(id){const row=(await pool.query("SELECT id,first_name,last_name,email,role,status,created_at,updated_at,customer_profile->>'name' AS profile_name,customer_profile->>'image' AS profile_image_url,customer_profile->>'phone' AS profile_phone,saved_addresses FROM users WHERE id=$1 AND role='customer'",[id])).rows[0];if(!row)throw Object.assign(new Error('Customer account not found.'),{status:404});return row;}
function validDate(value){if(!value)return null;if(String(value).startsWith('0000')||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Object.assign(new Error('Invalid registration date'),{status:400});return value;}
router.get('/api/admin/customers/manage',safe(async(req,res)=>{
  const page=pageOf(req.query.page),search=String(req.query.search||'').trim(),status=String(req.query.status||'');
  if(!['','active','inactive'].includes(status))return res.status(400).json({error:'Invalid account filter'});
  const from=validDate(req.query.fromDate),to=validDate(req.query.toDate);
  if(from&&to&&from>to)return res.status(400).json({error:'From Date must not follow To Date'});
  const values=['%'+search+'%',status,from,to];
  const where=`WHERE u.role='customer' AND ((CONCAT_WS(' ',u.first_name,u.last_name) ILIKE $1 OR u.customer_profile->>'name' ILIKE $1) OR u.email ILIKE $1 OR u.id::text ILIKE $1)
    AND ($2='' OR u.status=$2) AND ($3::date IS NULL OR u.created_at>=($3::date::timestamp AT TIME ZONE 'Asia/Manila'))
    AND ($4::date IS NULL OR u.created_at<(($4::date+1)::timestamp AT TIME ZONE 'Asia/Manila'))`;
  const rows=await pool.query(`SELECT u.id,u.first_name,u.last_name,u.email,u.role,u.status,u.created_at,u.updated_at,u.customer_profile->>'name' AS profile_name,u.customer_profile->>'image' AS profile_image_url,
    (SELECT COUNT(*)::int FROM orders o WHERE LOWER(o.gmail)=LOWER(u.email)) AS total_orders FROM users u ${where}
    ORDER BY u.created_at DESC,u.id DESC LIMIT 20 OFFSET $5`,[...values,(page-1)*20]);
  const count=await pool.query(`SELECT COUNT(*)::int AS total FROM users u ${where}`,values);
  const summary=(await pool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '30 days' AND created_at<=NOW())::int AS recent,
    COUNT(*) FILTER(WHERE status='active')::int AS active FROM users WHERE role='customer'`)).rows[0];
  res.json({customers:rows.rows.map(row=>({...formatCustomerRow(row),totalOrders:row.total_orders})),total:count.rows[0].total,page,pageSize:20,summary});
}));
router.get('/api/admin/customers/:id/details',safe(async(req,res)=>{
  const row=await customerOf(idOf(req.params.id));
  const stats=(await pool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='Delivered')::int AS delivered,
    COUNT(*) FILTER(WHERE status='Cancelled')::int AS cancelled,COUNT(*) FILTER(WHERE status NOT IN ('Delivered','Cancelled'))::int AS pending,
    COALESCE(SUM(total_amount) FILTER(WHERE status='Delivered' AND payment_status='Paid'),0)::float AS spent
    FROM orders WHERE LOWER(gmail)=LOWER($1)`,[row.email])).rows[0];
  const contact=(await pool.query("SELECT COALESCE(to_jsonb(u)->>'phone',to_jsonb(u)->>'mobile_num',to_jsonb(u)->>'mobile_number') AS phone FROM users u WHERE id=$1",[row.id])).rows[0];
  const seen=new Set();
  const addresses=(Array.isArray(row.saved_addresses)?[...row.saved_addresses]:[]).sort((a,b)=>Number(Boolean(b.isDefault))-Number(Boolean(a.isDefault))).filter(address=>{
    const signature=JSON.stringify(['name','phone','addressLine','barangay','city','province','postalCode','landmark','label'].map(key=>address[key]||''));
    if(seen.has(signature))return false;seen.add(signature);return true;
  }).sort((a,b)=>Number(Boolean(b.isDefault))-Number(Boolean(a.isDefault)));
  const visibleAddresses=addresses.map(address=>Object.fromEntries(['id','name','phone','addressLine','barangay','city','province','postalCode','landmark','label','isDefault'].filter(key=>address[key]!==undefined).map(key=>[key,address[key]])));
  res.json({customer:{...formatCustomerRow(row),phone:row.profile_phone!==null?row.profile_phone:(contact.phone||null)},addresses:visibleAddresses,statistics:stats});
}));
router.get('/api/admin/customers/:id/orders',safe(async(req,res)=>{
  const row=await customerOf(idOf(req.params.id)),page=pageOf(req.query.page),search=String(req.query.search||'').trim(),status=String(req.query.status||'');
  if(!['','Pending','Preparing','Out for Delivery','Cancellation Requested','Cancelled','Delivered'].includes(status))return res.status(400).json({error:'Invalid order filter'});
  const args=[row.email,'%'+search+'%',status];
  const where="WHERE LOWER(gmail)=LOWER($1) AND (id::text ILIKE $2 OR ('ORD-'||LPAD(id::text,GREATEST(3,LENGTH(id::text)),'0')) ILIKE $2) AND ($3='' OR status=$3)";
  const rows=await pool.query(`SELECT id,created_at,total_amount,status,payment_status,payment_method FROM orders ${where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $4`,[...args,(page-1)*20]);
  const count=await pool.query(`SELECT COUNT(*)::int AS total FROM orders ${where}`,args);
  res.json({orders:rows.rows,total:count.rows[0].total,page,pageSize:20});
}));
router.get('/api/admin/customers/:id/activity',safe(async(req,res)=>{
  const row=await customerOf(idOf(req.params.id)),page=pageOf(req.query.page);
  const events=await pool.query(`SELECT * FROM (
    SELECT 'created' AS id,'Account Created' AS action,created_at,'Registration record' AS actor,'Account registration timestamp' AS reason FROM users WHERE id=$1
    UNION ALL SELECT id::text,action,created_at,actor,reason FROM customer_account_activity WHERE customer_id=$1
    ) activity ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[row.id,(page-1)*20]);
  const total=Number((await pool.query('SELECT COUNT(*) AS n FROM customer_account_activity WHERE customer_id=$1',[row.id])).rows[0].n)+1;
  res.json({entries:events.rows,total,page,pageSize:20});
}));
router.patch('/api/admin/customers/:id/status',safe(async(req,res)=>{
  const id=idOf(req.params.id),status=String(req.body?.status||'');
  if(!['active','inactive'].includes(status))return res.status(400).json({error:'Status must be active or inactive'});
  if(req.body?.confirmed!==true)return res.status(400).json({error:'Account status confirmation is required'});
  const type=String(req.body?.reasonType||''),description=String(req.body?.description||'').trim();
  if(status==='inactive'&&(!['Customer Request','Suspicious Activity','Account Policy Violation','Duplicate Account','Other'].includes(type)||(type==='Other'&&description.length<3)))return res.status(400).json({error:'Select a reason; Other requires a description'});
  if(description.length>1000)return res.status(400).json({error:'Description must be at most 1000 characters'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const row=(await client.query("SELECT * FROM users WHERE id=$1 AND role='customer' FOR UPDATE",[id])).rows[0];
    if(!row){await client.query('ROLLBACK');return res.status(404).json({error:'Customer account not found.'});}
    if(row.status!==status){
      await client.query("UPDATE users SET status=$2,auth_version=auth_version+1,updated_at=NOW() WHERE id=$1",[id,status]);
      await client.query('INSERT INTO customer_account_activity(customer_id,action,previous_status,new_status,reason,actor) VALUES($1,$2,$3,$4,$5,$6)',
        [id,status==='active'?'Account Enabled':'Account Disabled',row.status,status,status==='inactive'?type+(description?': '+description:''):'Administrator confirmed account re-enablement',`Admin #${req.customerAdmin.userId}`]);
    }
    const updated=(await client.query('SELECT id,first_name,last_name,email,role,status,created_at,updated_at FROM users WHERE id=$1',[id])).rows[0];
    await client.query('COMMIT');res.json({...formatCustomerRow(updated),message:status==='active'?'Customer account enabled successfully.':'Customer account disabled successfully.'});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

export default router;
