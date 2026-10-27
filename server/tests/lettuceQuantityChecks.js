import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export async function checkLettuceQuantity({t,pool,request,create,checkout,base,token,originalFetch,webhook,expireReservations}){
  const free=await create('edible',20),held=await create('edible',6),committed=await create('edible',10);
  await pool.query("UPDATE harvest_batches SET condition='On Hold' WHERE product_id=$1",[held.id]);
  const legacyOrder=await checkout(committed,2,'COD');assert.equal(legacyOrder.status,201);
  const snapshot=async()=>JSON.stringify((await pool.query('SELECT to_jsonb(o) AS row FROM orders o ORDER BY id')).rows);
  const before=snapshot(),prices=(await pool.query('SELECT id,name,product_code,price,low_stock_threshold,image_url FROM products ORDER BY id')).rows;
  await pool.query(await fs.readFile(new URL('../src/db/migrations/020_lettuce_quantity.sql',import.meta.url),'utf8'));
  await t.test('LET migration reconciles exact verified balances, blocks unsafe stock/active commitments and preserves historical orders',async()=>{
    const rows=(await pool.query('SELECT * FROM reconcile_lettuce_quantity()')).rows;
    assert.equal(rows.find(r=>Number(r.product_id)===Number(free.id)).status,'migrated');
    assert.equal(rows.find(r=>Number(r.product_id)===Number(held.id)).status,'blocked');
    assert.equal(rows.find(r=>Number(r.product_id)===Number(committed.id)).status,'blocked');
    assert.equal(await before,await snapshot());
    assert.deepEqual((await pool.query('SELECT id,name,product_code,price,low_stock_threshold,image_url FROM products ORDER BY id')).rows,prices);
    assert.equal((await pool.query('SELECT stock FROM products WHERE id=$1',[free.id])).rows[0].stock,20);
    assert.equal(Number((await pool.query('SELECT SUM(stock) AS qty FROM harvest_batches WHERE product_id=$1',[free.id])).rows[0].qty),20,'historical rows retained, not summed again');
    const count=Number((await pool.query("SELECT COUNT(*) AS n FROM inventory_movements WHERE action='Initial Balance Migration'")).rows[0].n);
    await pool.query('SELECT * FROM reconcile_lettuce_quantity()');
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS n FROM inventory_movements WHERE action='Initial Balance Migration'")).rows[0].n),count);
  });
  const stock=async(product,direction,quantity,extra={},key=crypto.randomUUID(),role='admin')=>{
    const response=await originalFetch(base+'/api/admin/inventory/'+product.id+'/lettuce-stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token(role),'Idempotency-Key':key},body:JSON.stringify({direction,quantity,reason:direction==='in'?'New Harvest':'Disposal / Spoiled',notes:'Verified physical test',confirmed:true,...extra})});
    return {status:response.status,body:await response.json(),replay:response.headers.get('Idempotency-Replayed')};
  };
  const order=(p,qty=1,method='COD',extra={})=>request('/api/orders','POST',{fullName:'Inventory Test',mobileNumber:'09123456789',location:'Test',country:'Philippines',province:'Laguna',city:'Calamba',barangay:'Test',postalCode:'4027',paymentMethod:method,items:[{id:p.id,qty,expectedUnitPrice:Number(p.price),...extra}]},'customer');
  const row=async p=>(await pool.query('SELECT * FROM products WHERE id=$1',[p.id])).rows[0];
  await t.test('LET stock +30/-5 is atomic, confirmation/permissions/positive integers enforced, keyed retries deduct once',async()=>{
    assert.equal((await stock(free,'in',30)).status,200);assert.equal((await row(free)).stock,50);
    const key=crypto.randomUUID();const both=await Promise.all([stock(free,'out',5,{},key),stock(free,'out',5,{},key)]);assert.ok(both.every(r=>r.status===200));assert.equal((await row(free)).stock,45);assert.ok(both.some(r=>r.replay==='true'));
    for(const qty of [0,-1,1.5])assert.equal((await stock(free,'out',qty)).status,400);
    assert.equal((await stock(free,'out',1,{confirmed:false})).status,400);
    for(const role of ['rider','customer'])assert.equal((await stock(free,'out',1,{},crypto.randomUUID(),role)).status,403);
    const movement=(await pool.query("SELECT * FROM inventory_movements WHERE product_id=$1 AND action='Disposal Confirmed' ORDER BY id DESC LIMIT 1",[free.id])).rows[0];assert.equal(movement.previous_physical_stock,50);assert.equal(movement.new_physical_stock,45);assert.equal(movement.notes,'Verified physical test');
    assert.equal((await stock(free,'in',1,{},key)).status,409);
  });
  await t.test('LET COD allocates packs without payment, protects committed stock and releases once on cancellation',async()=>{
    const placed=await order(free,40);assert.equal(placed.status,201,JSON.stringify(placed.body));assert.equal(placed.body.paymentStatus,'Unpaid');assert.equal((await row(free)).stock,5);
    assert.equal((await stock(free,'out',6)).status,409);
    const inv=(await request('/api/admin/inventory')).body.products.find(p=>p.id===free.id);assert.equal(inv.stock,5);assert.equal(inv.physicalStock,45);assert.equal(inv.committedStock,40);
    assert.equal((await request('/api/orders/'+placed.body.id+'/cancel','POST',{reason:'Cancel fixture'},'customer')).status,200);
    assert.equal((await request('/api/orders/'+placed.body.id+'/cancel','POST',{reason:'Cancel fixture'},'customer')).status,200);assert.equal((await row(free)).stock,45);
  });
  await t.test('LET customer checks out without a batch; stale batch carts and concurrent overselling are rejected',async()=>{
    assert.equal((await order(free,1,'COD',{batchId:free.batches[0].id})).status,409);
    const p=await create('edible',0);await stock(p,'in',3);
    const result=await Promise.all([order(p,2),order(p,2)]);assert.equal(result.filter(r=>r.status===201).length,1);assert.equal((await row(p)).stock,1);
    const id=result.find(r=>r.status===201).body.id;await request('/api/orders/'+id+'/cancel','POST',{reason:'Cleanup fixture'},'customer');
  });
  await t.test('LET online confirmation, failure, expiry and legacy cancellation each preserve single stock accounting',async()=>{
    const online=await order(free,3,'ONLINE');assert.equal(online.status,201,JSON.stringify(online.body));assert.equal((await row(free)).stock,42);assert.equal((await row(free)).reserved_stock,3);
    await webhook(online.body,'evt_quantity_paid');await webhook(online.body,'evt_quantity_paid');assert.equal((await row(free)).stock,42);assert.equal((await row(free)).reserved_stock,0);
    const failed=await order(free,2,'ONLINE');await webhook(failed.body,'evt_quantity_failed','payment.failed');assert.equal((await row(free)).stock,42);
    const expired=await order(free,2,'ONLINE');await pool.query("UPDATE inventory_reservations SET expires_at=NOW()-INTERVAL '1 minute' WHERE order_id=$1",[expired.body.id]);await expireReservations(pool);assert.equal((await row(free)).stock,42);
    const old=(await pool.query('SELECT * FROM harvest_batches WHERE product_id=$1',[committed.id])).rows[0];assert.equal(old.stock,8);
    await request('/api/orders/'+legacyOrder.body.id+'/cancel','POST',{reason:'Legacy order cleanup'},'customer');assert.equal((await pool.query('SELECT stock FROM harvest_batches WHERE id=$1',[old.id])).rows[0].stock,10);
    const items=(await pool.query('SELECT batch_id,unit_price,qty FROM order_items WHERE order_id=$1',[online.body.id])).rows;assert.equal(items[0].batch_id,null);assert.equal(items[0].qty,3);assert.equal(Number(items[0].unit_price),Number(free.price));
  });
  await t.test('LET inventory/report/dashboard exclude historical batch balances and product stock is authoritative',async()=>{
    const inv=(await request('/api/admin/inventory')).body.products.find(p=>p.id===free.id);assert.equal(inv.stock,42);
    const pub=(await request('/api/products')).body.find(p=>p.id===free.id);assert.equal(pub.stock,42);assert.deepEqual(pub.batches,[]);assert.equal(pub.lettuceStockModel,'quantity');
    assert.equal((await request('/api/admin/dashboard')).status,200);assert.equal((await request('/api/admin/reports?preset=month&tab=inventory')).status,200);
    const history=await request('/api/admin/inventory/history?productId='+free.id);assert.equal(history.status,200);assert.ok(history.body.entries.some(r=>r.action==='Stock In'));
  });
}
