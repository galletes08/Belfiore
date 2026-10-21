// Additive catalog setup. Never initializes warehouse quantities or overwrites existing prices.
import fs from 'node:fs/promises';
import {pool} from '../src/config/db.js';
import {seedSupplies} from '../src/routes/gardening-supplies.js';
const c=await pool.connect();
try{
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(71600401)');
 const tables=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename<>'inventory_schema_migrations' ORDER BY tablename")).rows.map(r=>r.tablename);
 const ids={},columns={};
 for(const table of tables){
  columns[table]=(await c.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[table])).rows.map(r=>r.column_name);
  if(columns[table].includes('id')){
   const quoted='"'+table.replaceAll('"','""')+'"';ids[table]=(await c.query(`SELECT id FROM ${quoted}`)).rows.map(r=>String(r.id));
  }
 }
 const added=['supply_stock_model','supply_catalog_key','variant_id','variant_name','variant_sku','selling_unit','pieces_per_unit','weight_kg','stock_pool_id','stock_factor','stock_unit'];
 async function snapshot(){const out={};for(const table of tables){const quoted='"'+table.replaceAll('"','""')+'"';out[table]=(await c.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(rowdata,'' ORDER BY rowdata),'')) AS digest FROM(SELECT (to_jsonb(t)-$1::text[])::text AS rowdata FROM ${quoted} t ${ids[table]?'WHERE id::text=ANY($2::text[])':''})s`,ids[table]?[added.filter(k=>!columns[table].includes(k)),ids[table]]:[added.filter(k=>!columns[table].includes(k))])).rows[0];}return out;}
 const before=await snapshot();
 if(!(await c.query("SELECT 1 FROM inventory_schema_migrations WHERE name='019_gardening_supplies'")).rowCount){
  await c.query(await fs.readFile(new URL('../src/db/migrations/019_gardening_supplies.sql',import.meta.url),'utf8'));
  await c.query("INSERT INTO inventory_schema_migrations(name) VALUES('019_gardening_supplies')");
 }
 const catalog=await seedSupplies(c,'Authorized gardening catalog setup');
 if(JSON.stringify(before)!==JSON.stringify(await snapshot()))throw Error('Existing record preservation check failed; setup rolled back');
 const counts=(await c.query('SELECT count(*)::int AS variants,count(*) FILTER(WHERE s.stock IS NOT NULL)::int AS initialized FROM supply_variants v LEFT JOIN supply_stock_pools s ON s.id=v.pool_id')).rows[0];
 await c.query('COMMIT');console.log(JSON.stringify({migration:'019_gardening_supplies',existingTablesPreserved:tables.length,existingRowsUnchanged:true,catalog,variantCounts:counts}));
}catch(e){await c.query('ROLLBACK');console.error(e.message);process.exitCode=1;}finally{c.release();await pool.end();}
