import fs from 'node:fs/promises';
import {pool} from '../src/config/db.js';
const apply=process.argv.includes('--apply'),backup=process.argv.find(a=>a.startsWith('--backup='))?.slice(9);
const c=await pool.connect();
try{
 if(apply&&(!backup||(await fs.stat(backup)).size<32))throw Error('A verified pre-migration database backup is required (--backup=path).');
 await c.query('BEGIN');
 await c.query('CREATE TABLE IF NOT EXISTS inventory_schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 await c.query(await fs.readFile(new URL('../src/db/migrations/020_lettuce_quantity.sql',import.meta.url),'utf8'));
 const rows=(await c.query('SELECT product_id,status,available_packs,reason FROM reconcile_lettuce_quantity()')).rows;
 if(apply)await c.query("INSERT INTO inventory_schema_migrations(name) VALUES('020_lettuce_quantity') ON CONFLICT DO NOTHING");
 await c.query(apply?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({applied:apply,products:rows},null,2));
}catch(error){await c.query('ROLLBACK');console.error(error.message);process.exitCode=1;}finally{c.release();await pool.end();}
