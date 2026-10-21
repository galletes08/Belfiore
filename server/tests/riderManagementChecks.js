import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';

export async function checkRiderManagement({t,pool,request,fetch,base}) {
  let rider,userId,order;
  const profile={firstName:'Managed',lastName:'Rider',username:'managed-rider',phone:'09998887777',email:'',status:'active',isAvailable:true};
  const manage=()=>request('/api/admin/riders/manage');
  const get=path=>request(`/api/admin/riders/${rider.id}/${path}`);
  const status=(value,extra={})=>request(`/api/admin/riders/${rider.id}/status`,'PATCH',{status:value,reason:'Verified administrator account review',confirmed:true,confirmation:String(rider.id),...extra});
  const edit=extra=>request(`/api/admin/riders/${rider.id}`,'PATCH',{...profile,...extra});
  const riderRequest=async(path,method='GET',body)=>{
    const token=jwt.sign({role:'rider',userId,sessionVersion:0},process.env.JWT_SECRET);
    const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  };
  await t.test('Rider management is administrator-only, uses real account eligibility and filters before pagination',async()=>{
    const created=await request('/api/admin/riders','POST',{...profile,password:'Unique initial rider passphrase 2026'});
    assert.equal(created.status,201,JSON.stringify(created.body));rider=created.body;
    userId=(await pool.query('SELECT user_id FROM riders WHERE id=$1',[rider.id])).rows[0].user_id;
    assert.equal(rider.availability,'Offline','Temporary credentials are not assignment eligible');
    await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[userId]);
    for(let i=0;i<22;i++)await pool.query("INSERT INTO riders(first_name,last_name,phone,is_available) VALUES('Search','Fixture',$1,false)",['page-'+i]);
    const all=await manage();assert.equal(all.status,200);assert.equal(all.body.riders.length,20);assert.ok(all.body.total>=23);
    const search=await request('/api/admin/riders/manage?search=MANAGED-RIDER&filter=Available&page=1');
    assert.equal(search.body.total,1);assert.equal(search.body.riders[0].id,rider.id);assert.equal(search.body.riders[0].isOnDuty,true);
    for(const term of ['Managed Rider','09998887777'])assert.equal((await request('/api/admin/riders/manage?search='+encodeURIComponent(term))).body.total,1);
    assert.equal((await request('/api/admin/riders/manage?page=2')).body.riders.length,all.body.total-20);
    const expected=(await pool.query("SELECT COUNT(*)::int AS n FROM riders r JOIN users u ON u.id=r.user_id WHERE r.status='active' AND u.status='active' AND u.role='rider'")).rows[0].n;
    assert.equal(all.body.summary.active,expected);
    for(const path of ['manage',`${rider.id}/details`,`${rider.id}/deliveries`,`${rider.id}/activity`]){
      assert.equal((await fetch(base+'/api/admin/riders/'+path)).status,401);
      assert.equal((await request('/api/admin/riders/'+path,'GET',undefined,'customer')).status,403);
      assert.equal((await request('/api/admin/riders/'+path,'GET',undefined,'rider')).status,403);
    }
    assert.equal((await get('deliveries')).body.total,0);
    assert.equal((await get('details')).body.rider.username,profile.username);
    assert.equal((await get('details')).body.rider.password_hash,undefined);
  });
  await t.test('Rider assignments serialize concurrent orders; busy disable is rejected and GPS coordinates retain ownership',async()=>{
    const orders=(await pool.query("INSERT INTO orders(customer_name,status,delivery_mode) VALUES('Rider Customer A','Preparing','rider'),('Rider Customer B','Preparing','rider') RETURNING id")).rows;
    const assign=id=>request(`/api/admin/orders/${id}`,'PATCH',{status:'Preparing',deliveryMode:'rider',riderId:rider.id});
    const results=await Promise.all(orders.map(o=>assign(o.id)));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    order=results.find(r=>r.status===200).body;
    const details=await get('details');assert.equal(details.body.rider.availability,'Busy');assert.equal(details.body.statistics.active,1);assert.equal(details.body.statistics.total,1);
    assert.equal((await request('/api/admin/riders/manage?filter=Busy&search=managed-rider')).body.total,1);
    assert.equal((await status('inactive')).status,409);
    assert.equal((await edit({status:'inactive'})).status,400,'Profile cannot bypass disable workflow');
    const location=await riderRequest('/api/riders/location','POST',{orderId:order.id,latitude:14.55,longitude:121.02});
    assert.equal(location.status,200,JSON.stringify(location.body));assert.equal(location.body.latitude,14.55);
    const denied=await riderRequest('/api/riders/location','POST',{orderId:orders.find(o=>Number(o.id)!==order.id).id,latitude:15,longitude:122});assert.equal(denied.status,404);
    assert.equal((await request(`/api/riders/${rider.id}/location?orderId=${order.id}`)).status,403,'Existing customer-only tracking access remains unchanged');
    await pool.query("UPDATE orders SET gmail='inventory-test@gmail.com' WHERE id=$1",[order.id]);
    const tracked=await request(`/api/riders/${rider.id}/location?orderId=${order.id}`,'GET',undefined,'customer');assert.equal(tracked.status,200);assert.equal(tracked.body.longitude,121.02);
    assert.equal((await riderRequest('/api/rider/orders')).status,200);
  });
  await t.test('Completion records actual events once and retains manual Off Duty preference without fabricated timestamps',async()=>{
    assert.equal((await edit({isAvailable:false})).status,200);
    assert.equal((await get('details')).body.rider.availability,'Busy');
    const completed=await request(`/api/admin/orders/${order.id}`,'PATCH',{status:'Delivered',trackingStatus:'Delivered',deliveryMode:'rider',riderId:rider.id});
    assert.equal(completed.status,200,JSON.stringify(completed.body));
    const details=await get('details');assert.equal(details.body.rider.availability,'Offline');assert.equal(details.body.rider.isOnDuty,false);assert.equal(details.body.statistics.completed,1);
    const history=await get('deliveries');assert.equal(history.body.total,1);assert.equal(Number(history.body.records[0].order_id),order.id);assert.ok(history.body.records[0].assigned_at);assert.ok(history.body.records[0].delivered_at);
    const oldTimestamp=history.body.records[0].delivered_at;
    await pool.query('UPDATE orders SET updated_at=clock_timestamp() WHERE id=$1',[order.id]);
    assert.equal((await get('deliveries')).body.records[0].delivered_at,oldTimestamp);
    // A pre-existing order without a ledger remains visible, with unavailable completion time.
    await edit({isAvailable:true});
    await pool.query("INSERT INTO orders(customer_name,status,rider_id,driver_assigned_at) VALUES('Legacy Customer','Delivered',$1,'2025-01-01T16:00:00Z')",[rider.id]);
    await edit({isAvailable:false});
    const legacyOrder=(await pool.query("SELECT id FROM orders WHERE customer_name='Legacy Customer'")).rows[0];
    await pool.query('DELETE FROM order_rider_assignments WHERE order_id=$1',[legacyOrder.id]); // Synthetic pre-migration fixture only.
    const before=await pool.query('SELECT * FROM orders WHERE id=$1',[legacyOrder.id]);
    const legacy=(await get('deliveries')).body.records.find(r=>Number(r.order_id)===Number(legacyOrder.id));
    assert.equal(legacy.delivered_at,null);assert.equal(legacy.assigned_at,'2025-01-01T16:00:00.000Z');
    assert.deepEqual((await pool.query('SELECT * FROM orders WHERE id=$1',[legacyOrder.id])).rows,before.rows);
  });
  await t.test('Disable and enable require exact confirmation and reason, revoke sessions, audit actors and keep enabled riders Off Duty',async()=>{
    assert.equal((await status('inactive',{reason:''})).status,400);assert.equal((await status('inactive',{confirmed:false})).status,400);assert.equal((await status('inactive',{confirmation:'wrong'})).status,400);
    assert.equal((await status('inactive')).status,200);assert.equal((await get('details')).body.rider.availability,'Offline');
    assert.equal((await riderRequest('/api/rider/orders')).status,403);
    assert.equal((await riderRequest('/api/riders/location','POST',{latitude:14,longitude:120})).status,403);
    assert.equal((await request('/api/admin/riders/manage?filter=Disabled&search=managed-rider')).body.total,1);
    assert.equal((await status('active')).status,200);
    const enabled=(await get('details')).body.rider;assert.equal(enabled.status,'active');assert.equal(enabled.isOnDuty,false);assert.equal(enabled.availability,'Offline');
    assert.equal((await riderRequest('/api/rider/profile')).status,401,'Old session remains revoked after enable');
    const activity=(await get('activity')).body.records;
    for(const action of ['Rider Login Created','Rider Profile Updated','Rider Account Disabled','Rider Account Enabled'])assert.ok(activity.some(e=>e.action===action&&e.actor.includes('#124')));
    const serialized=JSON.stringify(activity);assert.ok(!serialized.includes('password_hash'));assert.ok(!serialized.includes('Unique initial rider'));
    assert.equal((await edit({isAvailable:true})).status,200);assert.equal((await get('details')).body.rider.availability,'Available');
    assert.equal((await get('details')).body.rider.username,profile.username);
    const offlineOrder=(await pool.query("INSERT INTO orders(customer_name) VALUES('Offline guard') RETURNING id")).rows[0];
    await edit({isAvailable:false});
    const result=await request(`/api/admin/orders/${offlineOrder.id}`,'PATCH',{status:'Preparing',deliveryMode:'rider',riderId:rider.id});assert.equal(result.status,409);
  });
  await t.test('Concurrent assignment and disable cannot both succeed or leave an active delivery on a disabled rider',async()=>{
    await edit({isAvailable:true});
    const candidate=(await pool.query("INSERT INTO orders(customer_name) VALUES('Assignment disable race') RETURNING id")).rows[0];
    const results=await Promise.all([request(`/api/admin/orders/${candidate.id}`,'PATCH',{status:'Preparing',deliveryMode:'rider',riderId:rider.id}),status('inactive')]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const persisted=(await pool.query('SELECT r.status,r.is_available,o.rider_id FROM riders r CROSS JOIN orders o WHERE r.id=$1 AND o.id=$2',[rider.id,candidate.id])).rows[0];
    assert.ok(persisted.status==='active'||persisted.rider_id===null);
    if(persisted.status==='active')await pool.query("UPDATE orders SET status='Cancelled' WHERE id=$1",[candidate.id]);
    else assert.equal((await status('active')).status,200);
    // Read-only endpoints cannot invent activity or alter historical/order/location records.
    const tables=['users','riders','orders','order_rider_assignments','rider_locations','auth_security_events'];
    const snapshot=()=>Promise.all(tables.map(table=>pool.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) AS digest FROM ${table} t`).then(r=>r.rows[0].digest)));
    const before=await snapshot();
    await get('details');await get('deliveries');await get('activity');await manage();
    await pool.query(await fs.readFile(new URL('../src/db/migrations/014_rider_management.sql',import.meta.url),'utf8'));
    await pool.query(await fs.readFile(new URL('../src/db/migrations/015_rider_security_lock.sql',import.meta.url),'utf8'));
    assert.deepEqual(await snapshot(),before,'Reads and repeatable additive migration preserve every existing row');
  });
  await t.test('New completion and reassignment events preserve legacy assignment snapshots without inventing missing dates',async()=>{
    await edit({isAvailable:true});
    const legacy=(await pool.query("INSERT INTO orders(customer_name,rider_id,status) VALUES('Legacy ongoing snapshot',$1,'Preparing') RETURNING id",[rider.id])).rows[0];
    await pool.query('DELETE FROM order_rider_assignments WHERE order_id=$1',[legacy.id]); // Synthetic legacy fixture.
    await pool.query('UPDATE orders SET rider_id=NULL WHERE id=$1',[legacy.id]);
    const record=(await get('deliveries')).body.records.find(r=>Number(r.order_id)===Number(legacy.id));
    assert.equal(record.status,'reassigned');assert.equal(record.assigned_at,null);assert.equal(record.delivered_at,null);
    // Actual assignment and a subsequent completion are recorded from now onward.
    await pool.query('UPDATE orders SET rider_id=$2 WHERE id=$1',[legacy.id,rider.id]);
    await pool.query('DELETE FROM order_rider_assignments WHERE order_id=$1',[legacy.id]);
    await pool.query("UPDATE orders SET status='Delivered' WHERE id=$1",[legacy.id]);
    const completed=(await get('deliveries')).body.records.find(r=>Number(r.order_id)===Number(legacy.id));
    assert.equal(completed.assigned_at,null);assert.ok(completed.delivered_at);assert.equal(completed.status,'Delivered');
  });
}
