import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

test('Operations Staff security and stock/packing integration',{skip:!process.env.INVENTORY_TEST_DATABASE_URL},async t=>{
 // This test never connects to the configured application database.
 const schema='operations_test_'+crypto.randomBytes(6).toString('hex');
 process.env.DATABASE_URL=process.env.INVENTORY_TEST_DATABASE_URL;process.env.PGOPTIONS=`-c search_path=${schema},public`;process.env.JWT_SECRET='isolated-operations-secret';process.env.AUTH_EMAIL_DELIVERY_ENABLED='false';process.env.AUTH_LOGIN_IP_LIMIT='1000';process.env.AUTH_LOGIN_DELAY_STEP_MS='0';
 process.env.TRACK123_ENABLED='false';
 const {pool}=await import('../src/config/db.js');const {default:express}=await import('express');const {default:jwt}=await import('jsonwebtoken');const {default:bcrypt}=await import('bcryptjs');let server;
 try{
  const {STAFF_PERMISSIONS}=await import('../src/utils/staffPermissions.js');
  await t.test('Staff permission allowlist excludes privileged capabilities',()=>{
 for(const p of ['orders.accept','orders.assign_rider','orders.delivery.manage','inventory.lettuce.dispose','inventory.supplies.stock_in','profile.own.update'])assert.ok(STAFF_PERMISSIONS.has(p));
 for(const p of ['orders.prepare','orders.pack','orders.ready_for_pickup','staff.manage','payments.verify','riders.assign','orders.assign_delivery','products.manage','cod.settle','audit.all.read','inventory.override'])assert.equal(STAFF_PERMISSIONS.has(p),false);
});


  await pool.query(`CREATE SCHEMA ${schema}`);await pool.query(await fs.readFile(new URL('../src/db/schema.sql',import.meta.url),'utf8'));
  const migrations=(await fs.readdir(new URL('../src/db/migrations/',import.meta.url))).filter(n=>/^\d+.*\.sql$/.test(n)).sort();
  for(const migration of migrations)await pool.query(await fs.readFile(new URL('../src/db/migrations/'+migration,import.meta.url),'utf8'));
  const pass='Unique operational garden passphrase';const hash=await bcrypt.hash(pass,12);
  const accounts={};for(const role of ['admin','customer','rider'])accounts[role]=(await pool.query("INSERT INTO users(first_name,username,email,role,status,password_hash) VALUES($1,$1,$2,$1,'active',$3) RETURNING id",[role,role+'@example.test',hash])).rows[0].id;
  const app=express();app.use(express.json());const {rejectDisabledCustomer}=await import('../src/utils/auth.js');app.use(rejectDisabledCustomer);
  for(const name of ['auth','operations-staff','products','orders','reports','riders','logs','customer-account','notifications'])app.use((await import('../src/routes/'+name+'.js')).default);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const signed=(role,id=accounts[role],version=0)=>jwt.sign({role,userId:id,sessionVersion:version,email:role+'@example.test'},process.env.JWT_SECRET,{expiresIn:'1h'});
  const tokens={admin:signed('admin'),customer:signed('customer'),rider:signed('rider')};
  async function req(path,{role='staff',method='GET',body,token=tokens[role],key}={}){if(path==='/api/auth/login')token='';const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json().catch(()=>({}))};}
  let staffId;
  await t.test('STAFF-001 admin creates a hashed username-based account; public and other roles cannot manage staff',async()=>{
   for(const role of ['customer','rider'])assert.equal((await req('/api/admin/staff',{role})).status,403);
   const r=await req('/api/admin/staff',{role:'admin',method:'POST',body:{firstName:'Operations',lastName:'Tester',username:'operations-tester',password:pass}});assert.equal(r.status,200,JSON.stringify(r));staffId=r.data.id;accounts.staff=staffId;
   const row=(await pool.query('SELECT * FROM users WHERE id=$1',[staffId])).rows[0];assert.equal(row.role,'staff');assert.equal(row.email,null);assert.equal(row.password,null);assert.notEqual(row.password_hash,pass);assert.ok(await bcrypt.compare(pass,row.password_hash));
   assert.equal((await req('/api/admin/staff',{role:'admin',method:'POST',body:{firstName:'Duplicate',username:'operations-tester',password:pass}})).status,409);
  });
  await t.test('STAFF-002..007 login role separation, mandatory first password change and current-session authorization',async()=>{
   assert.equal((await req('/api/auth/login',{method:'POST',body:{identifier:'operations-tester',password:pass,workspace:'customer'}})).status,401);
   let r=await req('/api/auth/login',{method:'POST',body:{identifier:'operations-tester',password:pass,workspace:'staff'}});assert.equal(r.status,200);assert.equal(r.data.user.role,'staff');tokens.staff=r.data.token;
   assert.equal((await req('/api/staff/dashboard')).status,403);
   assert.equal((await req('/api/auth/password',{method:'PATCH',body:{currentPassword:pass,newPassword:pass+' changed'}})).status,200);
   assert.equal((await req('/api/staff/dashboard')).status,401);
   r=await req('/api/auth/login',{method:'POST',body:{identifier:'operations-tester',password:pass+' changed',workspace:'staff'}});assert.equal(r.status,200);tokens.staff=r.data.token;
   assert.equal((await req('/api/admin/staff/'+staffId,{role:'admin',method:'PATCH',body:{email:'operations@example.test'}})).status,200);
   const emailLogin=await req('/api/auth/login',{method:'POST',body:{identifier:'operations@example.test',password:pass+' changed',workspace:'staff'}});assert.equal(emailLogin.status,200);tokens.staff=emailLogin.data.token;
   const failedBefore=(await pool.query("SELECT COUNT(*) FROM auth_security_events WHERE user_id=$1 AND action='Login Failed'",[staffId])).rows[0].count;
   assert.equal((await req('/api/auth/login',{method:'POST',body:{identifier:'operations@example.test',password:pass+' changed',workspace:'customer'}})).status,401);
   assert.equal((await pool.query("SELECT COUNT(*) FROM auth_security_events WHERE user_id=$1 AND action='Login Failed'",[staffId])).rows[0].count,failedBefore);
   for(const role of ['customer','rider'])assert.equal((await req('/api/staff/orders',{role})).status,403);
   assert.equal((await req('/api/staff/orders',{token:''})).status,401);
   for(const path of ['/api/admin/orders','/api/admin/reports','/api/admin/riders','/api/rider/profile','/api/rider/orders','/api/admin/staff','/api/admin/logs','/api/customer/account'])assert.ok([403,404].includes((await req(path)).status),path);
  });
  await t.test('Admin Staff directory exposes safe profile fields without recording view activity',async()=>{
   const count=async()=>Number((await pool.query('SELECT COUNT(*) FROM staff_activity')).rows[0].count);
   const before=await count();
   const list=await req('/api/admin/staff',{role:'admin'});assert.equal(list.status,200);
   assert.ok(list.data.every(s=>s.role==='staff'));
   assert.equal(list.data.find(s=>Number(s.id)===Number(staffId)).username,'operations-tester');
   for(const forbidden of ['password_hash','auth_version','password'])assert.ok(!Object.hasOwn(list.data[0],forbidden));
   assert.equal((await req('/api/admin/staff/'+staffId+'/activity',{role:'admin'})).status,200);
   assert.equal(await count(),before);
   for(const role of ['staff','rider','customer']){
    assert.equal((await req('/api/admin/staff',{role})).status,403);
    assert.equal((await req('/api/admin/staff/'+staffId+'/activity',{role})).status,403);
   }
  });
  await t.test('Staff notifications restrict financial alerts, isolate reads and enforce role/session access',async()=>{
   const orderId=(await pool.query("INSERT INTO orders(customer_name,location) VALUES('Notification recipient','Test address') RETURNING id")).rows[0].id;
   const inserted=await pool.query("INSERT INTO admin_notifications(event_key,event_type,order_id,title,message) SELECT 'notification-fixture-'||kind,kind,$1,kind,'Order alert' FROM unnest(ARRAY['cod_order','online_paid','cancellation_request','payment_failed','payment_review']) kind RETURNING id,event_type",[orderId]);
   const operational=inserted.rows.filter(n=>['cod_order','online_paid','cancellation_request'].includes(n.event_type)),hidden=inserted.rows.find(n=>n.event_type==='payment_review');
   for(const role of ['customer','rider'])assert.equal((await req('/api/staff/notifications',{role})).status,403);
   assert.equal((await req('/api/staff/notifications',{token:''})).status,401);
   assert.equal((await req('/api/admin/notifications')).status,403);
   const before=await req('/api/admin/notifications/unread-count',{role:'admin'});
   const list=await req('/api/staff/notifications');assert.equal(list.status,200,JSON.stringify(list));
   assert.ok(list.data.notifications.some(n=>n.event_type==='cod_order'));
   assert.ok(list.data.notifications.every(n=>!['payment_failed','payment_review'].includes(n.event_type)));
   assert.equal((await req('/api/staff/notifications?page=0')).status,400);
   assert.equal((await req('/api/staff/notifications/'+hidden.id+'/read',{method:'POST',body:{}})).status,404);
   assert.equal((await req('/api/staff/notifications/'+operational[0].id+'/read',{method:'POST',body:{}})).status,200);
   assert.equal((await req('/api/staff/notifications/'+operational[0].id+'/read',{method:'POST',body:{}})).status,200);
   assert.equal((await req('/api/admin/notifications/unread-count',{role:'admin'})).data.unread,before.data.unread);
   assert.equal((await req('/api/staff/notifications/read-all',{method:'POST',body:{throughId:list.data.throughId}})).status,200);
   assert.equal((await req('/api/staff/notifications/unread-count')).data.unread,0);
   assert.equal(Number((await pool.query('SELECT COUNT(*) FROM admin_notification_reads WHERE user_id=$1 AND notification_id=$2',[staffId,hidden.id])).rows[0].count),0);
   const version=(await pool.query('SELECT auth_version FROM users WHERE id=$1',[staffId])).rows[0].auth_version;
   assert.equal((await req('/api/staff/notifications',{token:signed('staff',staffId,Number(version)+1)})).status,401);
   // Remove this isolated fixture so subsequent fixed-count order regressions stay independent.
   await pool.query("DELETE FROM admin_notifications WHERE event_key LIKE 'notification-fixture-%'");
   await pool.query('DELETE FROM orders WHERE id=$1',[orderId]);
  });
  const lettuce=(await pool.query("INSERT INTO products(name,category,inventory_type,stock,price,pack_grams,low_stock_threshold) VALUES('Test lettuce','Aquaponics','edible',20,130,400,5) RETURNING id")).rows[0].id;
  const succulent=(await pool.query("INSERT INTO products(name,category,inventory_type,stock,price) VALUES('Unique plant','Aloe Hybrids','succulent',1,500) RETURNING id,product_code")).rows[0];
  async function order({payment='COD',paid='Unpaid',shipping='Confirmed',status='Preparing',accepted=true}={}){const o=(await pool.query("INSERT INTO orders(customer_name,location,status,shipping_status,payment_method,payment_status,admin_confirmed_at,inventory_state) VALUES('Recipient','Historical delivery address',$1,$2,$3,$4,CASE WHEN $5 THEN clock_timestamp() ELSE NULL END,'committed') RETURNING id",[status,shipping,payment,paid,accepted])).rows[0];
   await pool.query("INSERT INTO order_items(order_id,product_id,product_name,product_code,inventory_type,qty,unit_price,line_total) SELECT $1,id,name,product_code,inventory_type,1,price,price FROM products WHERE id=$2",[o.id,lettuce]);return o.id;}
  const readyOrder=await order(),onlineBlocked=await order({payment:'ONLINE',paid:'Pending'}),shippingBlocked=await order({shipping:'To be confirmed'}),unaccepted=await order({accepted:false}),cancelled=await order({status:'Cancelled'});
  const pendingOrder=await order({status:'Pending',accepted:false});
  await t.test('STAFF-009..011 real counts, minimum operational projection and payment/shipping/acceptance guards',async()=>{
   const r=await req('/api/staff/dashboard');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.summary.total,6);assert.equal(r.data.summary.pending,1);assert.equal(r.data.summary.delivered,0);assert.equal(r.data.counts.pending,1);assert.equal(r.data.counts.preparing,4);assert.equal(r.data.counts.delivery,0);assert.ok(!('pack' in r.data.counts));
   const list=await req('/api/staff/orders');assert.deepEqual(list.data.map(o=>Number(o.id)),[Number(readyOrder)]);assert.ok(!JSON.stringify(list.data).includes('unitPrice'));assert.ok(!JSON.stringify(list.data).includes('payment_id'));assert.ok(!JSON.stringify(list.data).includes('total_amount'));
   for(const n of [onlineBlocked,shippingBlocked,unaccepted,cancelled])assert.equal((await req(`/api/staff/orders/${n}/fulfillment`,{method:'POST',body:{stage:'Preparing',version:0}})).status,410);
  });
  await t.test('Staff Order Management overview includes Pending and historical statuses with read-only totals and no session/payment credentials',async()=>{
   const result=await req('/api/staff/orders/overview');assert.equal(result.status,200);assert.equal(result.data.length,6);
   for(const n of [readyOrder,onlineBlocked,shippingBlocked,unaccepted,cancelled,pendingOrder])assert.ok(result.data.some(o=>Number(o.id)===Number(n)));
   assert.equal(result.data.find(o=>Number(o.id)===Number(pendingOrder)).operational_eligible,false);
   assert.equal(result.data.find(o=>Number(o.id)===Number(readyOrder)).operational_eligible,true);
   assert.ok(result.data.every(o=>'payment_status' in o&&'total_amount' in o));
   const {orderSummary}=await import('../../shared/orderSummary.js');const adminRows=(await req('/api/admin/orders',{role:'admin'})).data;assert.deepEqual((await req('/api/staff/dashboard')).data.summary,orderSummary(adminRows));
   for(const secret of ['paymongo_payment_id','driver_access_token','password_hash','driver_latitude'])assert.ok(!JSON.stringify(result.data).includes(secret));
   for(const role of ['customer','rider'])assert.equal((await req('/api/staff/orders/overview',{role})).status,403);
  });
  await t.test('Staff accepts valid Pending requests without changing payment, rejects blocked requests and duplicate acceptance',async()=>{
   const before=(await pool.query('SELECT payment_status,total_amount FROM orders WHERE id=$1',[pendingOrder])).rows[0];
   assert.equal((await req(`/api/staff/orders/${pendingOrder}/accept`,{method:'POST',body:{}})).status,200);
   assert.equal((await req(`/api/staff/orders/${pendingOrder}/accept`,{method:'POST',body:{}})).status,409);
   assert.deepEqual((await pool.query('SELECT payment_status,total_amount FROM orders WHERE id=$1',[pendingOrder])).rows[0],before);
   for(const config of [{payment:'ONLINE',paid:'Pending'},{shipping:'To be confirmed'}]){const n=await order({...config,status:'Pending',accepted:false});assert.equal((await req(`/api/staff/orders/${n}/accept`,{method:'POST',body:{}})).status,409);}
   assert.equal(Number((await pool.query("SELECT COUNT(*) FROM staff_activity WHERE order_id=$1 AND action='Order Accepted'",[pendingOrder])).rows[0].count),1);
  });
  await t.test('Retired packing API cannot create or modify fulfillment data, and legacy history stays intact',async()=>{
   await pool.query("INSERT INTO staff_fulfillment(order_id,stage,handler_id,notes) VALUES($1,'Packed',$2,'Historical packing note')",[readyOrder,staffId]);
   const before=(await pool.query('SELECT to_jsonb(f) AS row FROM staff_fulfillment f WHERE order_id=$1',[readyOrder])).rows[0].row;
   const orderBefore=(await pool.query('SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1',[readyOrder])).rows[0].row;
   for(const stage of ['Preparing','Packed','Ready for Pickup'])assert.equal((await req('/api/staff/orders/'+readyOrder+'/fulfillment',{method:'POST',body:{stage,version:0,checklist:Array(5).fill(true)}})).status,410);
   assert.equal((await req('/api/staff/orders/'+pendingOrder+'/fulfillment',{method:'POST',body:{stage:'Preparing'}})).status,410);
   assert.equal((await pool.query('SELECT COUNT(*) FROM staff_fulfillment WHERE order_id=$1',[pendingOrder])).rows[0].count,'0');
   assert.deepEqual((await pool.query('SELECT to_jsonb(f) AS row FROM staff_fulfillment f WHERE order_id=$1',[readyOrder])).rows[0].row,before);
   assert.deepEqual((await pool.query('SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1',[readyOrder])).rows[0].row,orderBefore);
   const adminOrder=(await req('/api/admin/orders',{role:'admin'})).data.find(o=>Number(o.id)===Number(readyOrder));assert.equal(adminOrder.preparation.notes,'Historical packing note');
   for(const role of ['customer','rider'])assert.equal((await req('/api/staff/orders/'+readyOrder+'/fulfillment',{role,method:'POST',body:{stage:'Packed'}})).status,403);
   await pool.query("UPDATE orders SET status='Out for Delivery' WHERE id=$1",[readyOrder]);assert.equal((await req('/api/staff/dashboard')).data.counts.delivery,1);assert.ok((await req('/api/staff/shipments')).data.some(o=>Number(o.id)===Number(readyOrder)));
  });
  async function movement(quantity,direction,reason='New Harvest',key=crypto.randomUUID()){return req(`/api/staff/inventory/${lettuce}/lettuce-stock`,{method:'POST',key,body:{quantity,direction,reason,notes:'Physical quantity checked',confirmed:true}});}
  await t.test('STAFF-020..025,032,039 lettuce +10/-3, protected allocations, invalid quantities, duplicate and concurrent transactions',async()=>{
   const initial=(await pool.query('SELECT stock FROM products WHERE id=$1',[lettuce])).rows[0].stock,key=crypto.randomUUID();
   assert.equal((await movement(10,'in','New Harvest',key)).status,200);assert.equal((await movement(10,'in','New Harvest',key)).status,200);
   assert.equal((await movement(3,'out','Disposal / Spoiled')).status,200);
   assert.equal((await pool.query('SELECT stock FROM products WHERE id=$1',[lettuce])).rows[0].stock,initial+7);
   for(const n of [0,-1,1.5])assert.equal((await movement(n,'in')).status,400);
   assert.equal((await movement(1,'in','Stock Correction')).status,403);
   const before=(await pool.query('SELECT stock FROM products WHERE id=$1',[lettuce])).rows[0].stock;
   assert.equal((await movement(before+1,'out','Damaged')).status,409);
   const concurrent=await Promise.all([1,2].map(()=>movement(before,'out','Damaged')));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
   assert.equal((await pool.query('SELECT stock FROM products WHERE id=$1',[lettuce])).rows[0].stock,0);
   const r=await req('/api/staff/inventory');assert.equal(r.status,200);assert.equal(r.data.find(p=>Number(p.id)===Number(lettuce)).lettuce_stock_model,'quantity');assert.equal(Number(r.data.find(p=>Number(p.id)===Number(lettuce)).price),130);
  });
  await t.test('Shared live balances: Staff +20, Admin +10, Staff disposal -5, protected reservation and Admin cancellation agree across all three APIs/history',async()=>{
   const product=(await pool.query("INSERT INTO products(name,category,inventory_type,stock,price,pack_grams) VALUES('Shared stock integration','Aquaponics','edible',10,130,400) RETURNING id")).rows[0].id;
   const body={quantity:20,direction:'in',reason:'New Harvest',confirmed:true},key=crypto.randomUUID();
   assert.equal((await req(`/api/staff/inventory/${product}/lettuce-stock`,{method:'POST',key,body})).status,200);
   assert.equal((await req(`/api/staff/inventory/${product}/lettuce-stock`,{method:'POST',key,body})).status,200);
   async function equalViews(expected){
    const staff=(await req('/api/staff/inventory')).data.find(p=>Number(p.id)===Number(product));
    const admin=(await req('/api/admin/inventory',{role:'admin'})).data.products.find(p=>Number(p.id)===Number(product));
    const customer=(await req('/api/products',{role:'customer'})).data.find(p=>Number(p.id)===Number(product));
    assert.equal(staff.stock,expected);assert.equal(admin.stock,expected);assert.equal(customer.stock,expected);
   }
   await equalViews(30);
   assert.equal((await req(`/api/admin/inventory/${product}/lettuce-stock`,{role:'admin',method:'POST',key:crypto.randomUUID(),body:{...body,quantity:10}})).status,200);await equalViews(40);
   assert.equal((await req(`/api/staff/inventory/${product}/lettuce-stock`,{method:'POST',key:crypto.randomUUID(),body:{quantity:5,direction:'out',reason:'Disposal / Spoiled',notes:'Verified spoiled packs',confirmed:true}})).status,200);await equalViews(35);
   const a=await req('/api/staff/inventory/history?productId='+product),b=await req('/api/admin/inventory/history?productId='+product,{role:'admin'});
   assert.equal(a.status,200);assert.deepEqual(a.data.entries.map(m=>m.id),b.data.entries.map(m=>m.id));assert.equal(a.data.entries.filter(m=>m.action==='Stock In').length,2);assert.ok(a.data.entries.some(m=>m.actor==='Staff #'+staffId));assert.ok(!JSON.stringify(a.data).includes('transaction'));
   assert.equal((await req('/api/staff/inventory/history',{role:'customer'})).status,403);
   const c=await pool.connect();let reservedOrder;
   try{await c.query('BEGIN');reservedOrder=(await c.query("INSERT INTO orders(customer_name,status,payment_method,payment_status,inventory_state) VALUES('Reservation test','Pending','ONLINE','Pending','legacy') RETURNING id")).rows[0].id;
    await c.query("INSERT INTO order_items(order_id,product_id,product_name,product_code,inventory_type,qty,unit_price,line_total) SELECT $1,id,name,product_code,inventory_type,3,price,price*3 FROM products WHERE id=$2",[reservedOrder,product]);
    const {reserveOrderInventory}=await import('../src/utils/inventory.js');await reserveOrderInventory(c,reservedOrder,[{productId:Number(product),qty:3}],true,'Isolated checkout');await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   await equalViews(32);
   assert.equal((await req(`/api/staff/inventory/${product}/lettuce-stock`,{method:'POST',key:crypto.randomUUID(),body:{quantity:33,direction:'out',reason:'Damaged',notes:'Must preserve reservations',confirmed:true}})).status,409);
   assert.equal((await req(`/api/admin/orders/${reservedOrder}`,{role:'admin',method:'PATCH',body:{status:'Cancelled',cancelReason:'Isolated administrator cancellation'}})).status,200);await equalViews(35);
   assert.equal((await req('/api/staff/orders/overview')).data.find(o=>Number(o.id)===Number(reservedOrder)).status,'Cancelled');
   const simultaneous=await Promise.all([
    req(`/api/staff/inventory/${product}/lettuce-stock`,{method:'POST',key:crypto.randomUUID(),body:{quantity:2,direction:'in',reason:'New Harvest',confirmed:true}}),
    req(`/api/admin/inventory/${product}/lettuce-stock`,{role:'admin',method:'POST',key:crypto.randomUUID(),body:{quantity:1,direction:'out',reason:'Damaged',notes:'Verified damaged pack',confirmed:true}}),
   ]);assert.deepEqual(simultaneous.map(r=>r.status),[200,200]);await equalViews(36);
  });
  await t.test('STAFF-026 supply variants and shared conversion reuse established pool protections',async()=>{
   const product=(await pool.query("INSERT INTO products(name,inventory_type,stock,price,supply_stock_model) VALUES('Test supplies','GARDENING_SUPPLY',0,0,'prepacked') RETURNING id")).rows[0].id;
   const variants=[];for(const name of ['1 kg','2.5 kg']){const poolId=(await pool.query("INSERT INTO supply_stock_pools(product_id,unit,stock) VALUES($1,'Bag',10) RETURNING id",[product])).rows[0].id;variants.push((await pool.query("INSERT INTO supply_variants(product_id,name,sku,price,selling_unit,weight_kg,pool_id) VALUES($1,$2,$3,30,'Bag',1,$4) RETURNING id",[product,name,'TEST-'+name.replaceAll(' ','-'),poolId])).rows[0].id);}
   const b={variantId:variants[0],direction:'in',quantity:5,reason:'Stock In',notes:'Verified incoming bags',confirm:true,requestId:crypto.randomUUID()};
   assert.equal((await req(`/api/staff/supplies/${product}/stock`,{method:'POST',body:b})).status,200);assert.equal((await req(`/api/staff/supplies/${product}/stock`,{method:'POST',body:b})).status,200);
   assert.deepEqual((await pool.query('SELECT stock FROM supply_stock_pools WHERE product_id=$1 ORDER BY id',[product])).rows.map(r=>r.stock),[15,10]);
   assert.equal((await req(`/api/staff/supplies/${product}/stock`,{method:'POST',body:{...b,requestId:crypto.randomUUID(),direction:'initial'}})).status,403);
  });
  await t.test('STAFF-018..019,027,029..031,035 direct privileged mutations fail and preserve original data',async()=>{
   for(const [path,method,body] of [[`/api/products/${succulent.id}`,'PATCH',{price:1,productCode:'CHANGED'}],[`/api/admin/orders/${readyOrder}/confirm`,'POST',{}],[`/api/admin/orders/${readyOrder}/confirm-cod-remittance`,'POST',{}],[`/api/admin/orders/${readyOrder}`,'PATCH',{status:'Cancelled',paymentStatus:'Paid'}],['/api/admin/staff','POST',{role:'admin'}],['/api/riders/location','POST',{latitude:1,longitude:1}],[`/api/orders/${readyOrder}/cancel`,'POST',{reason:'Unauthorized'}]])assert.equal((await req(path,{method,body})).status,403,path);
   assert.equal((await pool.query('SELECT product_code FROM products WHERE id=$1',[succulent.id])).rows[0].product_code,succulent.product_code);
   assert.equal((await req('/api/staff/activity',{method:'DELETE'})).status,404);
  });
  await t.test('Staff creates new individual plants, zero-stock lettuce and supply variants, while existing product editing stays denied',async()=>{
   const key=crypto.randomUUID(),body={inventoryType:'succulent',name:'Staff new plant',tag:'Green',price:550,stock:1};
   const created=await req('/api/products',{method:'POST',body,key});assert.equal(created.status,201,JSON.stringify(created));
   assert.equal((await req('/api/products',{method:'POST',body,key})).data.id,created.data.id);
   assert.equal((await req('/api/products/'+created.data.id,{method:'PATCH',body:{price:1}})).status,403);
   const edible=await req('/api/products',{method:'POST',key:crypto.randomUUID(),body:{inventoryType:'edible',name:'Staff lettuce',price:120,stock:0}});assert.equal(edible.status,201);assert.equal(edible.data.stock,0);
   const supply=await req('/api/admin/supplies',{method:'POST',body:{name:'Staff supplies',category:'Soil & Potting Mix',requestId:crypto.randomUUID()}});assert.equal(supply.status,200);const product=supply.data.id;
   const vbody={name:'1 kg',sku:'STAFF-MIX-1',price:30,sellingUnit:'Bag',weightKg:1,lowStockThreshold:5,requestId:crypto.randomUUID()};
   const variant=await req(`/api/admin/supplies/${product}/variants`,{method:'POST',body:vbody});assert.equal(variant.status,200,JSON.stringify(variant));assert.equal((await req(`/api/admin/supplies/${product}/variants`,{method:'POST',body:vbody})).data.id,variant.data.id);
   assert.equal((await req(`/api/admin/supplies/${product}/model`,{method:'PATCH',body:{model:'prepacked'}})).status,200);
   assert.equal((await req(`/api/staff/supplies/${product}/setup`)).status,200);
   assert.equal((await req(`/api/staff/supplies/${product}/stock`,{method:'POST',body:{variantId:variant.data.id,direction:'initial',quantity:10,reason:'Initial Stock',notes:'Verified ready stock',confirm:true,requestId:crypto.randomUUID()}})).status,200);
   assert.equal((await req(`/api/admin/supplies/${product}/model`,{method:'PATCH',body:{model:'shared'}})).status,403);
   assert.equal((await req('/api/admin/supplies/import-catalog',{method:'POST',body:{}})).status,403);
  });
  await t.test('Broad Admin delivery endpoint remains restricted while existing Admin assignment works',async()=>{
   const riderUser=(await pool.query("INSERT INTO users(first_name,username,role,status,must_change_password) VALUES('Available','available-rider','rider','active',false) RETURNING id")).rows[0].id;
   const riderId=(await pool.query("INSERT INTO riders(first_name,last_name,phone,user_id,status,is_available) VALUES('Available','Rider','09123456789',$1,'active',true) RETURNING id",[riderUser])).rows[0].id;
   const n=await order(),before=(await pool.query('SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1',[n])).rows[0].row;
   for(const body of [{paymentStatus:'Paid'},{codStatus:'Collected'},{shippingFee:0},{status:'Delivered'},{role:'admin'}])assert.equal((await req('/api/staff/orders/'+n+'/delivery',{method:'PATCH',body})).status,403);
   assert.equal((await req('/api/staff/riders')).status,200);assert.deepEqual((await pool.query('SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1',[n])).rows[0].row,before);
   const assigned=await req('/api/admin/orders/'+n,{role:'admin',method:'PATCH',body:{status:'Preparing',deliveryMode:'rider',riderId,trackingStatus:'Preparing'}});assert.equal(assigned.status,200,JSON.stringify(assigned));assert.equal(Number(assigned.data.riderId),Number(riderId));assert.equal(assigned.data.paymentStatus,'Unpaid');
   assert.equal((await req('/api/admin/orders/'+n,{method:'PATCH',body:{status:'Preparing',riderId}})).status,403);
  });
  await t.test('Staff can assign eligible riders through a scoped, audited and concurrency-safe action',async()=>{
   const riderUser=(await pool.query("INSERT INTO users(first_name,username,role,status,must_change_password) VALUES('Staff target','staff-assignment-target','rider','active',false) RETURNING id")).rows[0].id;
   const riderId=(await pool.query("INSERT INTO riders(first_name,last_name,phone,user_id,status,is_available) VALUES('Juan','Test','09123456789',$1,'active',true) RETURNING id",[riderUser])).rows[0].id;
   const n=await order();await pool.query("UPDATE orders SET gmail='customer@example.test' WHERE id=$1",[n]);
   const ver=async value=>(await pool.query('SELECT updated_at::text AS version FROM orders WHERE id=$1',[value])).rows[0].version;
   const body={riderId,expectedUpdatedAt:await ver(n)};
   const financial=async()=>(await pool.query('SELECT payment_status,cod_status,total_amount,subtotal_amount,shipping_fee FROM orders WHERE id=$1',[n])).rows[0];const before=await financial();
   const assign=(value,payload,role='staff')=>req('/api/staff/orders/'+value+'/rider',{role,method:'PATCH',body:payload});
   for(const role of ['customer','rider'])assert.equal((await assign(n,body,role)).status,403);
   for(const extra of [{paymentStatus:'Paid'},{codStatus:'Collected'},{deliveryMode:'logistics'},{staffRiderAssignment:true}])assert.equal((await assign(n,{...body,...extra})).status,403);
   assert.equal((await assign(n,{...body,status:'Delivered'})).status,403);
   await pool.query('UPDATE users SET rider_security_locked=true WHERE id=$1',[riderUser]);assert.equal((await assign(n,body)).status,409);await pool.query('UPDATE users SET rider_security_locked=false WHERE id=$1',[riderUser]);
   await pool.query('UPDATE riders SET is_available=false WHERE id=$1',[riderId]);assert.equal((await assign(n,body)).status,409);await pool.query('UPDATE riders SET is_available=true WHERE id=$1',[riderId]);
   const list=await req('/api/staff/riders');assert.equal(list.status,200);assert.equal(list.data.find(r=>Number(r.id)===Number(riderId)).availability,'Available');
   const saved=await Promise.all([assign(n,body),assign(n,body)]);assert.deepEqual(saved.map(r=>r.status).sort(),[200,409]);assert.ok(!JSON.stringify(saved).includes('driverAccessToken'));assert.deepEqual(await financial(),before);
   assert.equal((await assign(n,{...body,expectedUpdatedAt:await ver(n)})).status,409,'unchanged assignment creates no duplicate audit');
   const admin=(await req('/api/admin/orders',{role:'admin'})).data.find(o=>Number(o.id)===Number(n));assert.equal(Number(admin.riderId),Number(riderId));assert.equal(admin.status,'Preparing');assert.equal(admin.paymentStatus,'Unpaid');
   const staff=(await req('/api/staff/orders/overview')).data.find(o=>Number(o.id)===Number(n));assert.equal(Number(staff.rider_id),Number(riderId));
   const customer=(await req('/api/orders/lookup',{role:'customer',method:'POST',body:{}})).data.find(o=>Number(o.id)===Number(n));assert.equal(Number(customer.riderId),Number(riderId));
   const audit=(await pool.query("SELECT * FROM staff_activity WHERE order_id=$1 AND action='Rider Assigned'",[n])).rows;assert.equal(audit.length,1);assert.equal(Number(audit[0].staff_id),Number(staffId));assert.equal(Number(audit[0].new_value.riderId),Number(riderId));assert.ok(audit[0].created_at);
   const other=await order();assert.equal((await assign(other,{riderId,expectedUpdatedAt:await ver(other)})).status,409,'busy rider cannot receive another assignment');
   for(const config of [{status:'Pending',accepted:false},{status:'Delivered'},{payment:'ONLINE',paid:'Pending'}]){const value=await order(config);assert.equal((await assign(value,{riderId,expectedUpdatedAt:await ver(value)})).status,409);}
   const courier=await order();await pool.query("UPDATE orders SET delivery_mode='logistics' WHERE id=$1",[courier]);assert.equal((await assign(courier,{riderId,expectedUpdatedAt:await ver(courier)})).status,409);
   assert.equal((await req('/api/admin/orders/'+n,{method:'PATCH',body:{status:'Preparing',riderId,staffRiderAssignment:true}})).status,403);
  });
  await t.test('Staff can select logistics, courier and tracking, switch delivery mode and preserve fees/payment',async()=>{
   const n=await order();await pool.query("UPDATE orders SET gmail='customer@example.test',shipping_fee=80,subtotal_amount=2420,total_amount=2500 WHERE id=$1",[n]);
   const version=async value=>(await pool.query('SELECT updated_at::text AS v FROM orders WHERE id=$1',[value])).rows[0].v;
   const financial=async value=>(await pool.query('SELECT payment_status,cod_status,shipping_fee,total_amount,subtotal_amount FROM orders WHERE id=$1',[value])).rows[0];
   const change=(value,body,role='staff')=>req('/api/staff/orders/'+value+'/delivery',{role,method:'PATCH',body});
   const before=await financial(n),body={deliveryMode:'logistics',courierName:'J&T Express',trackingCode:'JT-STAFF-MODE',expectedUpdatedAt:await version(n)};
   for(const role of ['customer','rider'])assert.equal((await change(n,body,role)).status,403);
   const concurrent=await Promise.all([change(n,body),change(n,body)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);assert.deepEqual(await financial(n),before);
   let admin=(await req('/api/admin/orders',{role:'admin'})).data.find(o=>Number(o.id)===Number(n));assert.equal(admin.deliveryMode,'logistics');assert.equal(admin.courierName,'J&T Express');assert.equal(admin.trackingCode,'JT-STAFF-MODE');assert.equal(admin.riderId,null);assert.equal(admin.driverAccessToken,'');
   assert.equal((await change(n,{...body,courierName:'Invalid Courier',expectedUpdatedAt:await version(n)})).status,400);
   assert.equal((await change(n,{...body,paymentStatus:'Paid',expectedUpdatedAt:await version(n)})).status,403);
   assert.equal((await change(n,{...body,courierName:'LBC',trackingCode:'LBC-STAFF-MODE',expectedUpdatedAt:await version(n)})).status,200);
   const riderUser=(await pool.query("INSERT INTO users(first_name,username,role,status,must_change_password) VALUES('Mode rider','mode-test-rider','rider','active',false) RETURNING id")).rows[0].id;
   const riderId=(await pool.query("INSERT INTO riders(first_name,last_name,phone,user_id,status,is_available) VALUES('Mode','Rider','09123456789',$1,'active',true) RETURNING id",[riderUser])).rows[0].id;
   const own=await change(n,{deliveryMode:'rider',riderId,expectedUpdatedAt:await version(n)});assert.equal(own.status,200,JSON.stringify(own));assert.ok(!JSON.stringify(own.data).includes('driverAccessToken'));assert.deepEqual(await financial(n),before);
   admin=(await req('/api/admin/orders',{role:'admin'})).data.find(o=>Number(o.id)===Number(n));assert.equal(admin.deliveryMode,'rider');assert.equal(Number(admin.riderId),Number(riderId));
   const dispatched=await change(n,{...body,dispatch:true,expectedUpdatedAt:await version(n)});assert.equal(dispatched.status,200,JSON.stringify(dispatched));assert.deepEqual(await financial(n),before);
   const staff=(await req('/api/staff/orders/overview')).data.find(o=>Number(o.id)===Number(n));assert.equal(staff.delivery_mode,'logistics');assert.equal(staff.status,'Out for Delivery');
   const customer=(await req('/api/orders/lookup',{role:'customer',method:'POST',body:{}})).data.find(o=>Number(o.id)===Number(n));assert.equal(customer.deliveryMode,'logistics');assert.equal(customer.trackingCode,'JT-STAFF-MODE');assert.equal(customer.paymentStatus,'Unpaid');
   assert.equal((await change(n,{deliveryMode:'rider',riderId,expectedUpdatedAt:await version(n)})).status,409);
   const paid=await order();await pool.query("UPDATE orders SET payment_status='Paid',cod_status='Collected' WHERE id=$1",[paid]);assert.equal((await change(paid,{...body,expectedUpdatedAt:await version(paid)})).status,409);
   const events=(await pool.query("SELECT * FROM staff_activity WHERE order_id=$1 AND action='Delivery Details Updated' ORDER BY id",[n])).rows;assert.equal(events.length,4);assert.equal(events[0].old_value.deliveryMode,'rider');assert.equal(events[0].new_value.deliveryMode,'logistics');assert.equal(Number(events[0].staff_id),Number(staffId));
  });
  await t.test('Scoped operational status updates share real orders, preserve protected fields, reject conflicts and audit Staff transitions',async()=>{
   const n=await order({status:'Pending',accepted:false});await pool.query("UPDATE orders SET gmail='customer@example.test' WHERE id=$1",[n]);
   const version=async id=>(await pool.query('SELECT updated_at::text AS version FROM orders WHERE id=$1',[id])).rows[0].version;
   const snapshot=async id=>(await pool.query("SELECT to_jsonb(o)-ARRAY['status','tracking_status','updated_at','status_updated_at','admin_confirmed_at'] AS row FROM orders o WHERE id=$1",[id])).rows[0].row;
   const update=(id,status,expectedUpdatedAt,extra={})=>req(`/api/staff/orders/${id}/status`,{method:'PATCH',body:{status,expectedUpdatedAt,...extra}});
   const before=await snapshot(n),v=await version(n);
   for(const role of ['customer','rider'])assert.equal((await req(`/api/staff/orders/${n}/status`,{role,method:'PATCH',body:{status:'Preparing',expectedUpdatedAt:v}})).status,403);
   assert.equal((await req(`/api/staff/orders/${n}/status`,{token:'',method:'PATCH',body:{status:'Preparing',expectedUpdatedAt:v}})).status,401);
   for(const extra of [{paymentStatus:'Paid'},{codStatus:'Collected'},{riderId:1},{deliveryMode:'rider'},{trackingStatus:'Delivered'}])assert.equal((await update(n,'Preparing',v,extra)).status,403);
   for(const target of ['Delivered','Cancelled','Cancellation Requested','Pending','Packed'])assert.equal((await update(n,target,v)).status,403);
   assert.equal((await update(n,'Preparing',undefined)).status,400);
   const accepted=await update(n,'Preparing',v);assert.equal(accepted.status,200,JSON.stringify(accepted));assert.equal(accepted.data.previousStatus,'Pending');assert.equal(accepted.data.status,'Preparing');
   assert.deepEqual(await snapshot(n),before);
   assert.equal((await update(n,'Preparing',v)).status,409);
   assert.equal((await update(n,'Out for Delivery',await version(n))).status,409,'unassigned rider blocks dispatch');
   const riderUser=(await pool.query("INSERT INTO users(first_name,username,role,status,must_change_password) VALUES('Status','status-rider','rider','active',false) RETURNING id")).rows[0].id;
   const riderId=(await pool.query("INSERT INTO riders(first_name,last_name,phone,user_id,status,is_available) VALUES('Status','Rider','09123456789',$1,'active',true) RETURNING id",[riderUser])).rows[0].id;
   const assigned=await req('/api/admin/orders/'+n,{role:'admin',method:'PATCH',body:{status:'Preparing',deliveryMode:'rider',riderId,trackingStatus:'Preparing'}});assert.equal(assigned.status,200,JSON.stringify(assigned));
   let current=await version(n);
   await pool.query('UPDATE users SET rider_security_locked=true WHERE id=$1',[riderUser]);assert.equal((await update(n,'Out for Delivery',current)).status,409);await pool.query('UPDATE users SET rider_security_locked=false WHERE id=$1',[riderUser]);
   const assignedBefore=await snapshot(n);
   const concurrent=await Promise.all([1,2].map(()=>update(n,'Out for Delivery',current)));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);assert.deepEqual(await snapshot(n),assignedBefore);
   assert.equal((await update(n,'Preparing',await version(n))).status,409);
   for(const target of ['Delivered','Cancelled'])assert.equal((await update(n,target,await version(n))).status,403);
   const staffRow=(await req('/api/staff/orders/overview')).data.find(o=>Number(o.id)===Number(n));
   const adminRow=(await req('/api/admin/orders',{role:'admin'})).data.find(o=>Number(o.id)===Number(n));
   const customerRows=await req('/api/orders/lookup',{role:'customer',method:'POST',body:{}});assert.equal(customerRows.status,200);const customerRow=customerRows.data.find(o=>Number(o.id)===Number(n));
   for(const row of [staffRow,adminRow,customerRow]){assert.ok(row);assert.equal(row.status,'Out for Delivery');}assert.equal(adminRow.paymentStatus,'Unpaid');assert.equal(customerRow.paymentStatus,'Unpaid');
   const audit=(await pool.query("SELECT * FROM staff_activity WHERE order_id=$1 AND action='Order Status Updated' ORDER BY id",[n])).rows;assert.equal(audit.length,2);assert.equal(Number(audit[0].staff_id),Number(staffId));assert.deepEqual(audit.map(a=>[a.old_value.status,a.new_value.status]),[['Pending','Preparing'],['Preparing','Out for Delivery']]);assert.ok(audit.every(a=>a.created_at));
   const logs=await req('/api/admin/logs',{role:'admin'});assert.equal(logs.status,200);assert.ok(JSON.stringify(logs.data).includes('Preparing -> Out for Delivery'));assert.ok(JSON.stringify(logs.data).includes('Staff #'+staffId));
   const blocked=await order({payment:'ONLINE',paid:'Pending',status:'Pending',accepted:false});assert.equal((await update(blocked,'Preparing',await version(blocked))).status,409);
   const shipping=await order({shipping:'To be confirmed'});assert.equal((await update(shipping,'Out for Delivery',await version(shipping))).status,409);
   const logistics=await order();await pool.query("UPDATE orders SET delivery_mode='logistics',courier_name='LBC',tracking_code='LBC-TEST-STATUS' WHERE id=$1",[logistics]);current=await version(logistics);
   await pool.query('UPDATE orders SET updated_at=clock_timestamp() WHERE id=$1',[logistics]);assert.equal((await update(logistics,'Out for Delivery',current)).status,409,'stale Admin update is rejected');
   assert.equal((await update(logistics,'Out for Delivery',await version(logistics))).status,200);assert.equal((await pool.query('SELECT payment_status FROM orders WHERE id=$1',[logistics])).rows[0].payment_status,'Unpaid');
  });
  await t.test('STAFF-033..034,008,013 reset/deactivation revoke sessions and personal logs cannot be redirected to another user',async()=>{
   const own=await req('/api/staff/activity?userId='+accounts.admin);assert.equal(own.status,200);assert.ok(own.data.rows.some(r=>r.action==='Order Accepted'));assert.ok(own.data.rows.some(r=>r.action==='Stock In'));
   assert.equal((await req(`/api/admin/staff/${staffId}/activity`,{role:'admin'})).status,200);
   assert.equal((await req(`/api/admin/staff/${staffId}`,{role:'admin',method:'PATCH',body:{status:'disabled',confirmed:true}})).status,200);assert.equal((await req('/api/staff/inventory')).status,403);
   assert.equal((await req(`/api/admin/staff/${staffId}`,{role:'admin',method:'PATCH',body:{status:'active',confirmed:true}})).status,200);assert.equal((await req('/api/staff/inventory')).status,401);
   const r=await req('/api/auth/login',{method:'POST',body:{identifier:'operations-tester',password:pass+' changed',workspace:'staff'}});tokens.staff=r.data.token;
   assert.equal((await req(`/api/admin/staff/${staffId}/reset-password`,{role:'admin',method:'POST',body:{password:pass+' reset',confirmed:true,verificationReference:'Verified by creating administrator'}})).status,200);assert.equal((await req('/api/staff/inventory')).status,401);
  });
  await t.test('Staff failed-attempt restriction is backend-enforced and correct credentials at wrong portal do not increment password failures',async()=>{
   await pool.query('DELETE FROM auth_security_buckets');
   for(let n=0;n<5;n++)assert.equal((await req('/api/auth/login',{method:'POST',body:{identifier:'operations-tester',password:'wrong-password',workspace:'staff'}})).status,n===4?429:401);
   assert.equal((await req('/api/auth/login',{method:'POST',body:{identifier:'operations-tester',password:pass+' reset',workspace:'staff'}})).status,429);
   assert.ok((await pool.query("SELECT COUNT(*) FROM auth_security_events WHERE user_id=$1 AND action='Login Failed'",[staffId])).rows[0].count>=5);
  });
 }finally{if(server)await new Promise(r=>server.close(r));await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
