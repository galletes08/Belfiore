import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {pool} from '../config/db.js';
import {inventoryError,inventoryContext} from '../utils/inventory.js';
import {SUPPLY,readSupplyVariants,supplyMovement} from '../utils/supplies.js';
import {storeUploadedImage} from '../utils/storage.js';

const categories=['Plant Pots','Soil & Potting Mix','Plant Trays'];
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw inventoryError('Invalid ID',400);return n;};
const text=(value,max=200)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw inventoryError('A valid name / reference is required',400);return value.trim();};
const integer=(value,min=0)=>{const n=Number(value);if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isSafeInteger(n)||n<min||n>1000000)throw inventoryError('Enter a valid whole quantity',400);return n;};
async function parent(c,value){const p=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id(value)])).rows[0];if(!p||p.inventory_type!==SUPPLY)throw inventoryError('Gardening supply not found',404);return p;}
async function addVariant(c,p,b){
 const name=text(b.name),sku=text(b.sku,80);if(!/^[a-z0-9][a-z0-9._-]*$/i.test(sku))throw inventoryError('Use letters, numbers, periods, hyphens or underscores in SKU',400);
 const price=Number(b.price),unit=b.sellingUnit;if(b.price==null||String(b.price).trim()===''||!Number.isFinite(price)||price<0||price>10000000||Math.abs(Math.round(price*100)-price*100)>0.000001)throw inventoryError('Enter a valid price with up to two decimal places',400);
 if(!['Pack','Bag','Set'].includes(unit))throw inventoryError('Select Pack, Bag or Set',400);
 const pieces=b.piecesPerUnit==null||b.piecesPerUnit===''?null:integer(b.piecesPerUnit,1);
 const weight=b.weightKg==null||b.weightKg===''?null:Number(b.weightKg);
 if(weight!=null&&(!Number.isFinite(weight)||weight<=0||weight>10000))throw inventoryError('Invalid weight',400);
 if(unit==='Bag'&&weight==null||unit!=='Bag'&&pieces==null)throw inventoryError('Specify pieces per pack/set or bag weight',400);
 let poolId=null,factor=1;
 if(p.supply_stock_model==='prepacked')poolId=(await c.query('INSERT INTO supply_stock_pools(product_id,unit) VALUES($1,$2) RETURNING id',[p.id,unit])).rows[0].id;
 if(p.supply_stock_model==='shared'){
  if(!pieces)throw inventoryError('Shared loose stock requires pieces per selling unit',400);
  poolId=(await c.query('SELECT id FROM supply_stock_pools WHERE product_id=$1 ORDER BY id LIMIT 1',[p.id])).rows[0]?.id;
  if(!poolId)poolId=(await c.query("INSERT INTO supply_stock_pools(product_id,unit) VALUES($1,'loose pieces') RETURNING id",[p.id])).rows[0].id;
  factor=pieces;
 }
 return (await c.query(`INSERT INTO supply_variants(product_id,name,sku,price,selling_unit,pieces_per_unit,weight_kg,pool_id,stock_factor,low_stock_threshold)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[p.id,name,sku,price,unit,pieces,weight,poolId,factor,integer(b.lowStockThreshold??5)])).rows[0];
}
export const SUPPLY_CATALOG=[
 {name:'Black Plastic Circle Pots',category:'Plant Pots',model:'prepacked',variants:[['Extra Small','GS-POT-XS-5',105,'Pack',5,null],['Small','GS-POT-S-5',160,'Pack',5,null],['Medium','GS-POT-M-5',250,'Pack',5,null]]},
 {name:'Belfiore Premium Succulent Potting Mix',category:'Soil & Potting Mix',description:'Vermicast and Pumice Blend for Lush, Hardy Plants',model:'prepacked',variants:[['1 kg','GS-MIX-1KG',30,'Bag',null,1],['2.5 kg','GS-MIX-2-5KG',75,'Bag',null,2.5]]},
 {name:'Plastic Grid Tray for 7cm Square Pots',category:'Plant Trays',model:'unconfigured',variants:[['5 Pieces','GS-TRAY-7CM-5',1150,'Set',5,null],['10 Pieces','GS-TRAY-7CM-10',2300,'Set',10,null]]}
];
export async function seedSupplies(c,actor='Administrator catalog import'){
 await c.query('SELECT pg_advisory_xact_lock(71600419)');await inventoryContext(c,{actor,reason:'Gardening supply catalog import; warehouse quantities not initialized'});
 const result=[];
 for(const item of SUPPLY_CATALOG){
  let p=(await c.query('SELECT * FROM products WHERE supply_catalog_key=$1 OR LOWER(BTRIM(name))=LOWER($1) ORDER BY id LIMIT 1 FOR UPDATE',[item.name])).rows[0];
  if(p&&p.inventory_type!==SUPPLY)throw inventoryError('A catalog name matches an existing non-supply product. Review it before importing.');
  if(!p)p=(await c.query(`INSERT INTO products(name,category,tag,inventory_type,stock,price,description,supply_stock_model,supply_catalog_key) VALUES($1::text,$2,'Gardening Supplies',$3,0,0,$4,$5,$1::text) RETURNING *`,[item.name,item.category,SUPPLY,item.description||'',item.model])).rows[0];
  for(const [name,sku,price,sellingUnit,piecesPerUnit,weightKg] of item.variants){
   const existing=(await c.query('SELECT * FROM supply_variants WHERE catalog_key=$1 OR LOWER(sku)=LOWER($1) OR (product_id=$2 AND LOWER(name)=LOWER($3))',[sku,p.id,name])).rows;
   if(existing.some(v=>Number(v.product_id)!==Number(p.id)))throw inventoryError('Catalog SKU belongs to another parent; import requires review');
   if(existing.length>1)throw inventoryError('Catalog identity matches multiple variants; review before importing');
   if(!existing.length){const created=await addVariant(c,p,{name,sku,price,sellingUnit,piecesPerUnit,weightKg});await c.query('UPDATE supply_variants SET catalog_key=$2 WHERE id=$1',[created.id,sku]);}
  }
  result.push({id:p.id,name:p.name});
 }
 return result;
}
export function registerSupplyRoutes(router,{admin,actor,upload,removeUploadedFiles}){
 const run=fn=>async(req,res)=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c,req);await c.query('COMMIT');res.json(result);}catch(e){await c.query('ROLLBACK');if(req.file)removeUploadedFiles?.([req.file]);res.status(e.code==='23505'?409:e.status||500).json({error:e.code==='23505'?'Variant name or SKU already exists.':e.status?e.message:'Unable to update supplies. Please retry.'});}finally{c.release();}};
 router.post('/api/admin/supplies/import-catalog',admin,run((c,req)=>seedSupplies(c,actor(req))));
 router.post('/api/admin/supplies',admin,upload.single('image'),run(async(c,req)=>{
  const name=text(req.body.name),category=req.body.category;if(!categories.includes(category))throw inventoryError('Select a gardening category',400);
  const requestId=req.body.requestId;
  if(requestId!=null&&(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)))throw inventoryError('Invalid product creation request key',400);
  const key=requestId?`supply-create:${actor(req)}:${requestId}`:null;
  const description=String(req.body.description||'').slice(0,2000);
  let fingerprint;
  if(key){
   const imageHash=req.file?crypto.createHash('sha256').update(req.file.buffer||await fs.readFile(req.file.path)).digest('hex'):null;
   fingerprint=crypto.createHash('sha256').update(JSON.stringify({name,category,description,imageHash,imageType:req.file?.mimetype||null})).digest('hex');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
   const previous=(await c.query('SELECT * FROM inventory_product_requests WHERE request_key=$1',[key])).rows[0];
   if(previous){
    if(previous.actor!==actor(req)||previous.fingerprint!==fingerprint)throw inventoryError('This request key belongs to a different product submission. Review your changes.',409);
    if(req.file)removeUploadedFiles?.([req.file]);
    return previous.response;
   }
  }
  await inventoryContext(c,{actor:actor(req),reason:'Gardening supply created without opening stock'});
  const image=req.file?await storeUploadedImage(req.file,'products'):null;
  const result=(await c.query(`INSERT INTO products(name,category,tag,description,inventory_type,stock,price,image_url) VALUES($1,$2,'Gardening Supplies',$3,$4,0,0,$5) RETURNING id`,[name,category,description,SUPPLY,image])).rows[0];
  if(key)await c.query('INSERT INTO inventory_product_requests(request_key,actor,fingerprint,response) VALUES($1,$2,$3,$4::jsonb)',[key,actor(req),fingerprint,JSON.stringify(result)]);
  return result;
 }));
 router.patch('/api/admin/supplies/:id',admin,upload.single('image'),run(async(c,req)=>{
  const p=await parent(c,req.params.id),category=req.body.category??p.category;if(!categories.includes(category))throw inventoryError('Select a gardening category',400);
  await inventoryContext(c,{actor:actor(req),reason:'Gardening supply details updated'});
  const image=req.file?await storeUploadedImage(req.file,'products'):p.image_url;
  await c.query('UPDATE products SET name=$2,category=$3,description=$4,image_url=$5 WHERE id=$1',[p.id,text(req.body.name??p.name),category,String(req.body.description??p.description??'').slice(0,2000),image]);return {id:p.id};
 }));
 router.post('/api/admin/supplies/:id/variants',admin,run(async(c,req)=>{const p=await parent(c,req.params.id);if(p.archived_at)throw inventoryError('Restore the parent before adding variants');return addVariant(c,p,req.body);}));
 router.patch('/api/admin/supplies/:id/model',admin,run(async(c,req)=>{
  const p=await parent(c,req.params.id),model=req.body.model;
  if(p.archived_at)throw inventoryError('Restore the parent first');
  if(!['prepacked','shared'].includes(model))throw inventoryError('Explicitly select a stock model',400);
  if(p.supply_stock_model===model)return {model};
  const v=await readSupplyVariants(c,p.id);
  if(v.some(v=>v.stock!=null)|| (await c.query('SELECT 1 FROM order_items WHERE product_id=$1 LIMIT 1',[p.id])).rowCount)throw inventoryError('Stock model cannot change after initialization or orders. Create a separately reviewed listing instead.');
  if(model==='shared'&&(!v.length||v.some(v=>!v.pieces_per_unit)))throw inventoryError('Shared stock needs pieces-per-unit for every variant',400);
  let shared=null;if(model==='shared')shared=(await c.query("INSERT INTO supply_stock_pools(product_id,unit) VALUES($1,'loose pieces') RETURNING id",[p.id])).rows[0].id;
  for(const variant of v){const poolId=shared||(await c.query('INSERT INTO supply_stock_pools(product_id,unit) VALUES($1,$2) RETURNING id',[p.id,variant.selling_unit])).rows[0].id;await c.query('UPDATE supply_variants SET pool_id=$2,stock_factor=$3 WHERE id=$1',[variant.id,poolId,model==='shared'?variant.pieces_per_unit:1]);}
  await inventoryContext(c,{actor:actor(req),reason:`Stock model explicitly configured: ${model}; no stock initialized`});
  await c.query('UPDATE products SET supply_stock_model=$2 WHERE id=$1',[p.id,model]);return {model};
 }));
 router.patch('/api/admin/supplies/:id/variants/:variantId',admin,upload.single('image'),run(async(c,req)=>{
  const p=await parent(c,req.params.id),v=(await readSupplyVariants(c,p.id)).find(v=>v.id===id(req.params.variantId));if(!v)throw inventoryError('Variant not found',404);
  const b=req.body,archived=b.archived==null?Boolean(v.archived_at):b.archived===true||b.archived==='true';
  if(archived!==Boolean(v.archived_at)&&(await c.query(`SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.variant_id=$1 AND o.inventory_restored_at IS NULL AND o.status NOT IN ('Cancelled','Delivered') LIMIT 1`,[v.id])).rowCount)throw inventoryError('Resolve active variant orders before changing archive state');
  const price=b.price==null?v.price:Number(b.price);if(b.price!=null&&(!['number','string'].includes(typeof b.price)||String(b.price).trim()==='')||!Number.isFinite(price)||price<0||price>10000000||Math.abs(price*100-Math.round(price*100))>0.000001)throw inventoryError('Invalid selling price',400);
  const sku=text(b.sku??v.sku,80);if(!/^[a-z0-9][a-z0-9._-]*$/i.test(sku))throw inventoryError('Invalid SKU',400);
  const unit=b.sellingUnit??v.selling_unit,pieces=b.piecesPerUnit==null?v.pieces_per_unit:b.piecesPerUnit===''?null:integer(b.piecesPerUnit,1),weight=b.weightKg==null?v.weight_kg:b.weightKg===''?null:Number(b.weightKg);
  if(!['Pack','Bag','Set'].includes(unit)||unit==='Bag'&&(!Number.isFinite(weight)||weight<=0)||unit!=='Bag'&&!pieces)throw inventoryError('Specify a valid selling unit and package size',400);
  if(weight!=null&&(!Number.isFinite(weight)||weight<=0||weight>10000))throw inventoryError('Invalid package weight',400);
  const packagingChanged=unit!==v.selling_unit||pieces!==v.pieces_per_unit||weight!==v.weight_kg;
  if(packagingChanged&&(v.stock!=null||(await c.query('SELECT 1 FROM order_items WHERE variant_id=$1 LIMIT 1',[v.id])).rowCount))throw inventoryError('Package conversion cannot change after stock initialization or orders. Add a separately identified variant.');
  if(p.supply_stock_model==='shared'&&!pieces)throw inventoryError('Shared stock requires pieces per unit',400);
  await c.query('UPDATE supply_variants SET sku=$2,selling_unit=$3,pieces_per_unit=$4,weight_kg=$5,stock_factor=$6 WHERE id=$1',[v.id,sku,unit,pieces,weight,p.supply_stock_model==='shared'?pieces:1]);
  if(v.pool_id&&p.supply_stock_model==='prepacked')await c.query('UPDATE supply_stock_pools SET unit=$2 WHERE id=$1',[v.pool_id,unit]);
  const image=req.file?await storeUploadedImage(req.file,'products'):v.image_url;
  await c.query(`UPDATE supply_variants SET name=$2,price=$3,low_stock_threshold=$4,image_url=$5,archived_at=CASE WHEN $6 THEN COALESCE(archived_at,clock_timestamp()) ELSE NULL END WHERE id=$1`,[v.id,text(b.name??v.name),price,integer(b.lowStockThreshold??v.low_stock_threshold),image,archived]);
  await supplyMovement(c,{productId:p.id,variant:v,before:v.stock??0,after:v.stock??0,beforeReserved:v.pool_reserved??0,afterReserved:v.pool_reserved??0,action:archived?'Variant Archived':'Product Updated',reason:text(b.reason||'Variant metadata updated'),actor:actor(req)});return {id:v.id};
 }));
 router.post('/api/admin/supplies/:id/stock',admin,run(async(c,req)=>{
  const p=await parent(c,req.params.id),b=req.body,key=`${req.inventoryUser.userId}:${text(b.requestId,100)}`,hash=crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
  const previous=(await c.query('SELECT * FROM supply_stock_requests WHERE request_key=$1',[key])).rows[0];if(previous){if(previous.payload_hash!==hash)throw inventoryError('Retry key already belongs to a different movement');return previous.response;}
  if(p.archived_at||p.supply_stock_model==='unconfigured')throw inventoryError('Restore the product and explicitly choose its stock model first');
  const v=(await readSupplyVariants(c,p.id)).find(v=>v.id===id(b.variantId));if(!v||v.archived_at||!v.pool_id)throw inventoryError('Select an active configured variant');
  if(!['initial','in','out'].includes(b.direction))throw inventoryError('Invalid stock direction',400);
  const quantity=integer(b.quantity,b.direction==='initial'?0:1),amount=quantity*v.stock_factor;if(amount>2147483647)throw inventoryError('Stock conversion exceeds supported quantity',400);
  if(b.confirm!==true)throw inventoryError('Confirm verified physical stock and the selected unit',400);
  if(b.direction==='initial'?v.stock!=null:v.stock==null)throw inventoryError('Record opening stock once before normal stock movements');
  const before=(await c.query('SELECT * FROM supply_stock_pools WHERE id=$1 FOR UPDATE',[v.pool_id])).rows[0],reason=text(b.reason,1000);
  const stock=b.direction==='initial'?amount:before.stock+(b.direction==='in'?amount:-amount);if(stock<0||stock>2147483647)throw inventoryError('Insufficient unreserved stock. Reserved and committed quantities are protected.');
  await c.query('UPDATE supply_stock_pools SET stock=$2 WHERE id=$1',[v.pool_id,stock]);
  await supplyMovement(c,{productId:p.id,variant:v,before:before.stock??0,after:stock,beforeReserved:before.reserved_stock,afterReserved:before.reserved_stock,action:b.direction==='initial'?'Stock Initialized':b.direction==='in'?'Stock In':'Stock Out',reason,actor:actor(req)});
  const result={variantId:v.id,stock,unit:v.stock_unit};await c.query('INSERT INTO supply_stock_requests(request_key,payload_hash,response) VALUES($1,$2,$3::jsonb)',[key,hash,JSON.stringify(result)]);return result;
 }));
}
