import fs from 'node:fs/promises';
import {pool} from '../src/config/db.js';
const apply=process.argv.includes('--apply'),client=await pool.connect();
try{
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(71600401)');
 await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
 const snapshot=async()=>JSON.stringify((await client.query("SELECT to_jsonb(u)-'staff_profile_image_path' AS value FROM users u ORDER BY id")).rows);
 const before=await snapshot();
 await client.query(await fs.readFile(new URL('../src/db/migrations/022_staff_profile_photo.sql',import.meta.url),'utf8'));
 if(before!==await snapshot())throw Error('Existing account data changed; refusing migration.');
 await client.query('CREATE TABLE IF NOT EXISTS inventory_schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 await client.query("INSERT INTO inventory_schema_migrations(name) VALUES('022_staff_profile_photo') ON CONFLICT DO NOTHING");
 await client.query(apply?'COMMIT':'ROLLBACK');console.log(JSON.stringify({applied:apply,existingAccountsUnchanged:true}));
}catch(e){await client.query('ROLLBACK');console.error(e.message);process.exitCode=1;}finally{client.release();await pool.end();}
