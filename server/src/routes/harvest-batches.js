import { createHash } from 'node:crypto';
import { pool } from '../config/db.js';
import { inventoryError } from '../utils/inventory.js';
import { BATCH_SELECT,batchMap,batchHistory,createHarvestBatch,readHarvest,refreshHarvest,syncHarvestProduct } from '../utils/harvest.js';

export function registerHarvestRoutes(router,admin,actor) {
  router.get('/api/admin/inventory/:id/batches',admin,async(req,res)=>{
    try {
      await refreshHarvest(pool);
      res.json({batches:await readHarvest(pool,Number(req.params.id))});
    } catch(error) {res.status(error.status||500).json({error:error.message});}
  });
  const mutation = operation => async(req,res)=>{
    let client;
    try {
      const productId=Number(req.params.id);
      const batchId=req.params.batchId?Number(req.params.batchId):null;
      if(!Number.isSafeInteger(productId)||productId<=0||(batchId!==null&&(!Number.isSafeInteger(batchId)||batchId<=0))) throw inventoryError('Invalid product or batch ID',400);
      const key=String(req.get('Idempotency-Key')||'');
      if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw inventoryError('A valid batch request key is required',400);
      const requestKey='harvest:'+key;
      const fingerprint=createHash('sha256').update(JSON.stringify({operation,productId,batchId,body:req.body})).digest('hex');
      const reason=String(req.body.reason||req.body.reasonType||'').trim();
      const notes=String(req.body.notes||'').trim();
      if(!reason||reason.length>1000||notes.length>2000) throw inventoryError('A reason is required; reason and notes must be within their limits',400);
      if(reason==='Other'&&!notes) throw inventoryError('Additional notes are required for Other',400);
      if(operation==='adjust'&&req.body.reasonType) {
        const reasons=req.body.direction==='in'?['Inventory Correction','Returned Sellable Stock','Other']:['Damaged / Spoiled','Expired / Unsellable','Inventory Correction','Other'];
        if(!reasons.includes(req.body.reasonType)) throw inventoryError('Select a valid reason for this batch adjustment',400);
      }
      client=await pool.connect();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[requestKey]);
      const old=(await client.query('SELECT * FROM inventory_product_requests WHERE request_key=$1',[requestKey])).rows[0];
      if(old) {
        if(old.actor!==actor(req)||old.fingerprint!==fingerprint) throw inventoryError('Request key belongs to a different batch action');
        await client.query('COMMIT');res.set('Idempotency-Replayed','true');return res.json(old.response);
      }
      const product=(await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[productId])).rows[0];
      if(!product||product.inventory_type!=='edible') throw inventoryError('An edible product is required',400);
      if(product.lettuce_stock_model==='quantity')throw inventoryError('Historical batches are read-only. Use product Stock In / Stock Out.',409);
      if(product.archived_at) throw inventoryError('Restore the product listing before managing its batches');
      const physicalBefore=(await readHarvest(client,productId)).reduce((sum,b)=>sum+b.physical_stock,0);
      let batch;
      if(operation==='create') batch=await createHarvestBatch(client,product,{...req.body,reason},actor(req));
      else {
        const before=(await client.query(`${BATCH_SELECT} WHERE b.id=$1 AND b.product_id=$2 FOR UPDATE OF b`,[batchId,productId])).rows[0];
        if(!before) throw inventoryError('Batch not found',404);
        if(operation==='update') {
          const condition=req.body.condition??before.condition;
          if(!['Fresh','Aging','On Hold','Unsellable','For Disposal','Unverified'].includes(condition)) throw inventoryError('Invalid condition; Disposed requires disposal confirmation',400);
          if(before.condition==='Disposed') throw inventoryError('A disposed batch cannot be reactivated');
          const price=Number(req.body.price??before.price);
          if(!Number.isFinite(price)||price<0||String(req.body.price??before.price).trim()==='') throw inventoryError('Invalid batch selling price',400);
          const harvestDate=req.body.harvestDate??before.harvest_date;
          if(before.harvest_date&&harvestDate!==before.harvest_date) throw inventoryError('Verified harvest dates cannot be changed to reset shelf life');
          if(harvestDate&&(await client.query("SELECT $1::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date AS valid",[harvestDate])).rows[0].valid!==true) throw inventoryError('Harvest Date cannot be in the future',400);
          if(req.body.harvestDate && (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.harvestDate)||!Number.isFinite(Date.parse(req.body.harvestDate+'T00:00:00Z'))||new Date(req.body.harvestDate+'T00:00:00Z').toISOString().slice(0,10)!==req.body.harvestDate)) throw inventoryError('Invalid harvest date',400);
          if(!before.harvest_date && harvestDate && req.body.confirmInspected!==true) throw inventoryError('Confirm physical inspection and verified harvest date',400);
          await client.query('UPDATE harvest_batches SET condition=$2,price=$3,harvest_date=$4 WHERE id=$1',[batchId,condition,price,harvestDate||null]);
          const after=(await client.query(`${BATCH_SELECT} WHERE b.id=$1`,[batchId])).rows[0];
          if(Number(before.price)!==price) await batchHistory(client,after,'Price Adjusted',reason,actor(req),before,after,null,notes);
          if(before.condition!==condition||before.harvest_date!==after.harvest_date) await batchHistory(client,after,'Condition Updated',reason,actor(req),before,after,null,notes);
          batch=batchMap(after);
        } else {
          const qty=Number(req.body.quantity);
          if(!['string','number'].includes(typeof req.body.quantity)||!Number.isSafeInteger(qty)||qty<=0||qty>2147483647) throw inventoryError('Quantity must be a positive whole number of packs',400);
          const stockIn=operation==='adjust'&&req.body.direction==='in';
          if(operation==='adjust'&&!['in','out'].includes(req.body.direction)) throw inventoryError('Invalid adjustment direction',400);
          if(!stockIn&&qty>before.stock) throw inventoryError('Quantity exceeds uncommitted physical packs; reserved and allocated packs are protected');
          if(stockIn&&before.condition==='Disposed') throw inventoryError('Create a traceable new batch instead of replenishing a disposed batch');
          if(stockIn&&before.stock+qty>2147483647) throw inventoryError('Pack quantity exceeds the supported limit',400);
          if(operation==='dispose') {
            const reasons=['Exceeded Storage Life','Spoiled / Rotten','Dried / Wilted','Failed Quality Inspection','Other'];
            if(!reasons.includes(reason)||(reason==='Other'&&!notes)) throw inventoryError('Select a valid disposal reason; Other needs notes',400);
            if(req.body.confirmDisposed!==true) throw inventoryError('Confirm that physical disposal has been completed',400);
            const disposalDate=String(req.body.disposalDate||'');
            const today=(await client.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::text AS today")).rows[0].today;
            if(!/^\d{4}-\d{2}-\d{2}$/.test(disposalDate)||disposalDate>today||!Number.isFinite(Date.parse(disposalDate+'T00:00:00Z'))||new Date(disposalDate+'T00:00:00Z').toISOString().slice(0,10)!==disposalDate|| (before.harvest_date&&disposalDate<before.harvest_date)) throw inventoryError('Enter a valid disposal date on or after harvest and not in the future',400);
          }
          const stock=before.stock+(stockIn?qty:-qty);
          const condition=operation==='dispose'?(stock===0&&before.reserved_stock===0&&before.unresolved_allocations===0?'Disposed': before.status==='Fresh'||before.status==='Aging'?'Unsellable':before.condition):before.condition;
          await client.query('UPDATE harvest_batches SET stock=$2,condition=$3 WHERE id=$1',[batchId,stock,condition]);
          const after=(await client.query(`${BATCH_SELECT} WHERE b.id=$1`,[batchId])).rows[0];
          await batchHistory(client,after,operation==='dispose'?'Disposal Confirmed':stockIn?'Stock In':'Stock Out',reason,actor(req),before,{...after,disposalDate:req.body.disposalDate||null},null,notes);
          batch=batchMap(after);
        }
        await syncHarvestProduct(client,productId);
      }
      const updatedProduct=(await client.query('SELECT * FROM products WHERE id=$1',[productId])).rows[0];
      const response={batch,message:operation==='create'?'Harvest batch created.':operation==='dispose'?'Disposal recorded.':'Batch updated.',
        stock:updatedProduct.stock,reservedStock:updatedProduct.reserved_stock,name:updatedProduct.name,price:Number(updatedProduct.price),
        status:updatedProduct.stock===0?'Out of Stock':updatedProduct.stock<=updatedProduct.low_stock_threshold?'Low Stock':'Available',
        adjustment:{previousAvailable:product.stock,newAvailable:updatedProduct.stock,previousRecorded:physicalBefore,newRecorded:(await readHarvest(client,productId)).reduce((sum,b)=>sum+b.physical_stock,0)}};
      await client.query('INSERT INTO inventory_product_requests(request_key,actor,fingerprint,response) VALUES($1,$2,$3,$4::jsonb)',[requestKey,actor(req),fingerprint,JSON.stringify(response)]);
      await client.query('COMMIT');res.json(response);
    }catch(error){if(client)await client.query('ROLLBACK');res.status(error.status||500).json({error:error.message});}
    finally{client?.release();}
  };
  router.post('/api/admin/inventory/:id/batches',admin,mutation('create'));
  router.patch('/api/admin/inventory/:id/batches/:batchId',admin,mutation('update'));
  router.post('/api/admin/inventory/:id/batches/:batchId/adjust',admin,mutation('adjust'));
  router.post('/api/admin/inventory/:id/batches/:batchId/dispose',admin,mutation('dispose'));
  router.post('/api/admin/inventory/:id/adjust',admin,(req,res)=>{
    if(req.body.direction==='in'&&req.body.batchId&&req.body.reasonType==='New Harvest') return res.status(400).json({error:'New Harvest must create a new dated batch, not replenish an older harvest.'});
    if(req.body.direction==='in' && !req.body.batchId && (req.body.reasonType==='New Harvest'||req.body.createNewBatch===true)) return mutation('create')(req,res);
    if(!req.body.batchId) return res.status(400).json({error:'Select the existing harvest batch to adjust, or explicitly create a new dated batch.'});
    req.params.batchId=String(req.body.batchId);
    return mutation('adjust')(req,res);
  });
}
