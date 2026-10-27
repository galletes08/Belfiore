import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pool} from '../src/config/db.js';
const apply=process.argv.includes('--apply'),backup=process.argv.find(a=>a.startsWith('--backup='))?.slice(9);
const tables=['users','products','orders','order_items','harvest_batches','inventory_movements','supply_variants','supply_stock_pools'];
async function snapshot(c){const result={};for(const name of tables){const rows=(await c.query(`SELECT to_jsonb(t)-'last_login_at' AS value FROM ${name} t ORDER BY id`)).rows;result[name]=createHash('sha256').update(JSON.stringify(rows)).digest('hex');}return result;}
const c=await pool.connect();
try{
 if(apply){if(!backup)throw Error('Provide a verified pre-migration database archive with --backup=path.');const f=await fs.open(backup,'r');try{const bytes=Buffer.alloc(5);await f.read(bytes,0,5,0);if(bytes.toString()!=='PGDMP')throw Error('Expected a PostgreSQL custom archive.');}finally{await f.close();}}
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(71600401)');
 const before=await snapshot(c);
 await c.query(await fs.readFile(new URL('../src/db/migrations/021_operations_staff.sql',import.meta.url),'utf8'));
 const after=await snapshot(c);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Existing account or business data changed; refusing migration.');
 await c.query('CREATE TABLE IF NOT EXISTS inventory_schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 await c.query("INSERT INTO inventory_schema_migrations(name) VALUES('021_operations_staff') ON CONFLICT DO NOTHING");
 const lettuce=(await c.query("SELECT lettuce_stock_model,COUNT(*)::int AS products FROM products WHERE inventory_type='edible' GROUP BY lettuce_stock_model")).rows;
 await c.query(apply?'COMMIT':'ROLLBACK');console.log(JSON.stringify({applied:apply,existingDataUnchanged:true,lettuceModels:lettuce}));
}catch(e){await c.query('ROLLBACK');console.error(e.message);process.exitCode=1;}finally{c.release();await pool.end();}
