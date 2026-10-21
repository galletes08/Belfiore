import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export async function checkSupplies({t,pool,request,create,webhook,expireReservations,fetch,base}){
 let products,pots,mix,trays;
 const api=(path,body,method='POST',role='admin')=>request('/api/admin/supplies'+(path?'/'+path:''),method,body,role);
 const refresh=async()=>{const r=await request('/api/admin/inventory');assert.equal(r.status,200,JSON.stringify(r.body));products=r.body.products.filter(p=>p.inventoryType==='GARDENING_SUPPLY');pots=products.find(p=>p.category==='Plant Pots');mix=products.find(p=>p.category==='Soil & Potting Mix');trays=products.find(p=>p.category==='Plant Trays');};
 const stock=(p,v,quantity,direction='initial',extra={})=>api(p.id+'/stock',{variantId:v.id,quantity,direction,confirm:true,reason:'Verified test physical inventory',requestId:crypto.randomUUID(),...extra});
 const payload=(items,method='COD')=>({checkoutRequestId:crypto.randomUUID(),fullName:'Supply Customer',gmail:'inventory-test@gmail.com',mobileNumber:'09991234567',deliveryAddress:{addressLine:'10 Test Street',countryCode:'PH',province:'Laguna',city:'Calamba',barangay:'Real',postalCode:'4027'},paymentMethod:method,items});
 const item=(p,v,qty=1)=>({id:p.id,variantId:v.id,expectedUnitPrice:v.price,qty});
 const order=body=>request('/api/orders','POST',body,'customer');
 const cancel=id=>request('/api/orders/'+id+'/cancel','POST',{reason:'Test customer cancellation'},'customer');
 const row=id=>pool.query('SELECT * FROM orders WHERE id=$1',[id]).then(r=>r.rows[0]);
 await t.test('GS-001..005/030 catalog import is idempotent, preserves confirmed prices and starts seven variants without invented stock',async()=>{
  assert.equal((await api('import-catalog',{})).status,200);await refresh();assert.equal(products.length,3);assert.equal(products.flatMap(p=>p.variants).length,7);
  assert.deepEqual(pots.variants.map(v=>v.price),[105,160,250]);assert.deepEqual(mix.variants.map(v=>v.price),[30,75]);assert.deepEqual(trays.variants.map(v=>v.price),[1150,2300]);
  for(const p of products)for(const v of p.variants){assert.equal(v.available_stock,0);assert.equal(v.stock,null);}
  const before=(await pool.query('SELECT * FROM supply_variants ORDER BY id')).rows;await api('import-catalog',{});assert.deepEqual((await pool.query('SELECT * FROM supply_variants ORDER BY id')).rows,before);
  assert.equal((await stock(trays,trays.variants[0],10)).status,409);
  const quoted=await request('/api/customer/account/checkout-quote','POST',{deliveryAddress:payload([]).deliveryAddress,items:[item(pots,pots.variants[0])]},'customer');assert.equal(quoted.status,409);
 });
 await t.test('GS-002/028 variant validation, duplicate SKU/name and administrator-only stock access are enforced',async()=>{
  const valid={name:'Review-only fixture',sku:'GS-TEST-FIXTURE',price:10,sellingUnit:'Pack',piecesPerUnit:2};
  assert.equal((await api(pots.id+'/variants',{...valid,sku:pots.variants[0].sku})).status,409);
  assert.equal((await api(pots.id+'/variants',{...valid,name:pots.variants[0].name})).status,409);
  assert.equal((await api(pots.id+'/variants',{...valid,price:-1})).status,400);
  assert.equal((await api('import-catalog',{},'POST','customer')).status,403);assert.equal((await api('import-catalog',{},'POST','rider')).status,403);
  assert.equal((await fetch(base+'/api/admin/supplies/import-catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 });
 await t.test('GS-004/006..009 opening inventory, independent variants, stock movements and retries use verified selling units',async()=>{
  for(const v of pots.variants)assert.equal((await stock(pots,v,10)).status,200);for(const v of mix.variants)assert.equal((await stock(mix,v,10)).status,200);
  for(const variant of mix.variants){assert.equal((await stock(mix,variant,3,'in')).body.stock,13);assert.equal((await stock(mix,variant,3,'out')).body.stock,10);}
  assert.equal((await stock(mix,{},1,'in')).status,400,'A configured product still requires selecting its own variant');
  const v=pots.variants[0],body={variantId:v.id,quantity:2,direction:'out',confirm:true,reason:'Damaged packs',requestId:crypto.randomUUID()};
  const a=await api(pots.id+'/stock',body),b=await api(pots.id+'/stock',body);assert.equal(a.status,200);assert.deepEqual(a,b);assert.equal(a.body.stock,8);
  assert.equal((await stock(pots,v,0,'out')).status,400);assert.equal((await stock(pots,v,-1,'in')).status,400);assert.equal((await stock(pots,v,100,'out')).status,409);
  assert.equal((await stock(pots,v,1)).status,409,'Opening inventory is not repeatable');assert.equal((await stock(pots,v,2,'in')).status,200);
  assert.equal((await api(pots.id+'/variants/'+v.id,{lowStockThreshold:10},'PATCH')).status,200);await refresh();assert.equal(pots.variants[0].status,'Low Stock');assert.equal(pots.variants[1].stock,10);
 });
 let snapshotOrder;
 await t.test('GS-013..016 mixed COD orders keep two supply variants separate and cancellation releases exactly once',async()=>{
  const plant=await create('succulent',1,{price:100}),lettuce=await create('edible',3,{price:130});
  const body=payload([item(pots,pots.variants[0],2),item(pots,pots.variants[2],2),{id:plant.id,qty:1,expectedUnitPrice:100},{id:lettuce.id,qty:1,batchId:lettuce.batches[0].id,expectedUnitPrice:lettuce.batches[0].price}]);
  const created=await order(body);assert.equal(created.status,201,JSON.stringify(created.body));snapshotOrder=created.body.id;assert.equal((await row(snapshotOrder)).payment_status,'Unpaid');
  const lines=(await pool.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id',[snapshotOrder])).rows;assert.equal(lines.length,4);assert.deepEqual(lines.filter(l=>l.variant_id).map(l=>Number(l.variant_id)),[pots.variants[0].id,pots.variants[2].id]);
  assert.equal((await order(body)).body.id,snapshotOrder);assert.equal((await cancel(snapshotOrder)).status,200);assert.equal((await cancel(snapshotOrder)).status,200);await refresh();assert.equal(pots.variants[0].stock,10);assert.equal(pots.variants[2].stock,10);
 });
 await t.test('GS-017/019 online failed payment and expiration release reservations without duplicate stock or deductions',async()=>{
  let result=await order(payload([item(mix,mix.variants[1],2)],'ONLINE'));assert.equal(result.status,201,JSON.stringify(result.body));await refresh();assert.equal(mix.variants[1].stock,8);assert.equal(mix.variants[1].pool_reserved,2);
  assert.equal((await stock(mix,mix.variants[1],9,'out')).status,409,'Cannot consume reserved bags');
  await webhook(result.body,'evt_supply_failed','payment.failed');await webhook(result.body,'evt_supply_failed_again','payment.failed');await refresh();assert.equal(mix.variants[1].stock,10);assert.equal(mix.variants[1].pool_reserved,0);
  result=await order(payload([item(mix,mix.variants[1],2)],'ONLINE'));assert.equal(result.status,201);
  await pool.query("UPDATE inventory_reservations SET expires_at=NOW()-interval '1 second' WHERE order_id=$1",[result.body.id]);await expireReservations(pool);await expireReservations(pool);await refresh();assert.equal(mix.variants[1].stock,10);assert.equal(mix.variants[1].pool_reserved,0);
 });
 await t.test('GS-018 shared 5/10-tray conversions protect one physical pool under simultaneous checkout',async()=>{
  assert.equal((await api(trays.id+'/model',{model:'shared'},'PATCH')).status,200);await refresh();
  assert.equal((await stock(trays,trays.variants[0],4)).body.stock,20);await refresh();assert.equal(trays.stockPools.length,1);assert.deepEqual(trays.variants.map(v=>v.available_stock),[4,2]);
  assert.equal((await stock(trays,trays.variants[0],1,'in')).body.stock,25);
  assert.equal((await stock(trays,trays.variants[1],1,'out')).body.stock,15);
  assert.equal((await stock(trays,trays.variants[0],1,'in')).body.stock,20,'5/10-piece movements update one shared physical balance');
  assert.equal((await stock(trays,trays.variants[1],3,'out')).status,409);
  const result=await Promise.all([order(payload([item(trays,trays.variants[1],2)])),order(payload([item(trays,trays.variants[1],2)]))]);assert.equal(result.filter(r=>r.status===201).length,1,JSON.stringify(result));
  await refresh();assert.equal(trays.stockPools[0].stock,0);assert.equal((await cancel(result.find(r=>r.status===201).body.id)).status,200);await refresh();assert.equal(trays.stockPools[0].stock,20);
  assert.equal((await api(trays.id+'/model',{model:'prepacked'},'PATCH')).status,409);
 });
 await t.test('GS-010/021 variant archiving and repricing preserve historical SKU, package, price and order amounts',async()=>{
  const before=(await pool.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id',[snapshotOrder])).rows,v=pots.variants[2];
  assert.equal((await api(pots.id+'/variants/'+v.id,{price:260,name:'Medium renamed',sku:'GS-POT-M-NEW'},'PATCH')).status,200);
  assert.equal((await api(pots.id+'/variants/'+v.id,{piecesPerUnit:6},'PATCH')).status,409);
  assert.deepEqual((await pool.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id',[snapshotOrder])).rows,before);
  const small=pots.variants[1];assert.equal((await api(pots.id+'/variants/'+small.id,{archived:true},'PATCH')).status,200);assert.equal((await order(payload([item(pots,small)]))).status,409);
  assert.equal((await api(pots.id+'/variants/'+small.id,{archived:false},'PATCH')).status,200);
  await api('import-catalog',{});await refresh();assert.equal(pots.variants[2].price,260,'Reimport does not overwrite prices');assert.equal(pots.variants.length,3,'Matching name/SKU import must not duplicate renamed variants');
 });
 await t.test('GS-017/022..024 verified payment, variant history and revenue/category reports retain actual purchase snapshots',async()=>{
  const created=await order(payload([item(mix,mix.variants[1],2)],'ONLINE'));assert.equal(created.status,201,JSON.stringify(created.body));await webhook(created.body,'evt_supply_paid');await webhook(created.body,'evt_supply_paid_repeated');await refresh();assert.equal(mix.variants[1].stock,8);assert.equal(mix.variants[1].pool_reserved,0);
  await pool.query("UPDATE orders SET status='Delivered',created_at='2005-03-15T04:00:00Z' WHERE id=$1",[created.body.id]);
  const report=await request('/api/admin/reports?preset=custom&fromDate=2005-03-15&toDate=2005-03-15&tab=sales');assert.equal(report.status,200,JSON.stringify(report.body));
  assert.equal(report.body.tables.find(t=>t.key==='supplySales').rows[0].revenue,150);const best=report.body.tables.find(t=>t.key==='products').rows[0];assert.equal(best.quantity,2);assert.equal(best.unit,'Bag');assert.ok(best.codes.includes('GS-MIX-2-5KG'));
  const inventory=await request('/api/admin/reports?tab=inventory');assert.equal(inventory.status,200,JSON.stringify(inventory.body));assert.equal(inventory.body.tables.find(t=>t.key==='supplyPools').rows.filter(p=>Number(p.pool)===Number(trays.variants[0].pool_id)).length,1);
  const history=await request('/api/admin/inventory/history?productId='+mix.id);assert.equal(history.status,200);assert.ok(history.body.entries.some(e=>e.variant_name==='2.5 kg'&&e.stock_unit==='Bag'&&e.order_id));
  const dash=await request('/api/admin/dashboard');assert.equal(dash.status,200,JSON.stringify(dash.body));assert.ok(dash.body.lowStock.some(v=>String(v.tag_key).startsWith('GS-')));
 });
 await t.test('GS-001/002/010 administrator creation, explicit zero opening stock and safe parent archive/restore work through existing APIs',async()=>{
  const submission={name:'Isolated test supply fixture',category:'Plant Pots',requestId:crypto.randomUUID()};
  const results=await Promise.all([api('',submission),api('',submission)]);
  const created=results[0];assert.equal(created.status,200,JSON.stringify(created.body));assert.deepEqual(results[1],created,'Concurrent double submission creates one parent');
  assert.deepEqual(await api('',submission),created,'Lost-response retry returns the same parent');
  assert.equal((await api('',{...submission,name:'A changed product'})).status,409);
  assert.equal((await api('',{...submission,requestId:'bad'})).status,400);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM products WHERE name=$1',[submission.name])).rows[0].n),1);
  const p={id:created.body.id};
  const added=await api(p.id+'/variants',{name:'Test-only package',sku:'GS-ISOLATED-TEST-ONLY',price:45.5,sellingUnit:'Pack',piecesPerUnit:3});assert.equal(added.status,200,JSON.stringify(added.body));
  assert.equal((await api(p.id+'/model',{model:'prepacked'},'PATCH')).status,200);
  const v={id:added.body.id,price:45.5};assert.equal((await stock(p,v,0)).status,200);assert.equal((await stock(p,v,2,'in')).status,200);
  const active=await order(payload([item(p,v)]));assert.equal(active.status,201,JSON.stringify(active.body));
  assert.equal((await request('/api/admin/inventory/'+p.id+'/archive','POST',{reasonType:'Temporarily Unavailable',reason:'Verified temporary listing hold'})).status,409);
  assert.equal((await api(p.id+'/variants/'+v.id,{archived:true},'PATCH')).status,409);
  assert.equal((await cancel(active.body.id)).status,200);
  assert.equal((await request('/api/admin/inventory/'+p.id+'/archive','POST',{reasonType:'Temporarily Unavailable',reason:'Verified temporary listing hold'})).status,200);
  assert.equal((await order(payload([item(p,v)]))).status,409);
  assert.equal((await request('/api/admin/inventory/'+p.id+'/restore','POST',{reason:'Confirmed stock inspection',confirmSellable:true})).status,200);
  const storefront=await request('/api/products');assert.equal(storefront.status,200);const listing=storefront.body.find(x=>Number(x.id)===Number(p.id));assert.equal(listing.variants[0].available_stock,2);assert.equal(listing.variants[0].price,45.5);
 });
 }
