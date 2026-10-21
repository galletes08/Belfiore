import assert from 'node:assert/strict';

export async function checkRoleSeparation({t,pool,post,base,password,clear}) {
  const tokens={};
  await t.test('AUTH-ROLE-001 to 006: persisted roles restrict both login portals before token issuance',async()=>{
    for(const [role,identifier] of [['customer','customer@example.test'],['admin','admin@example.test'],['rider','rider-2']]) {
      const customer=await post('/api/auth/login',{email:identifier,password,role:'customer'});
      const staff=await post('/api/auth/login',{identifier,password,workspace:'staff',role:'admin'});
      assert.equal(customer.status,role==='customer'?200:401);
      assert.equal(staff.status,role==='customer'?401:200);
      const allowed=role==='customer'?customer:staff,rejected=role==='customer'?staff:customer;
      assert.equal(allowed.body.user.role,role);assert.ok(allowed.body.token);
      assert.equal(rejected.body.token,undefined);assert.equal(rejected.body.user,undefined);
      assert.equal(rejected.body.error,'Invalid email or password.');
      tokens[role]=allowed.body.token;
    }
  });
  await t.test('Wrong-portal attempts never increment or clear staff password failures or locks',async()=>{
    await clear();
    const before=(await pool.query('SELECT id,admin_failed_attempts,admin_restricted_until,rider_failed_attempts,rider_security_locked FROM users ORDER BY id')).rows;
    for(let i=0;i<6;i++)for(const email of ['admin@example.test','rider-2']) {
      assert.equal((await post('/api/auth/login',{email,password})).status,401);
    }
    assert.deepEqual((await pool.query('SELECT id,admin_failed_attempts,admin_restricted_until,rider_failed_attempts,rider_security_locked FROM users ORDER BY id')).rows,before);
    assert.equal(Number((await pool.query("SELECT count(*) AS n FROM auth_security_events WHERE action='Login Portal Rejected'")).rows[0].n)>=12,true);
    await clear();
  });
  const request=async(path,role,method='GET',body)=>fetch(base+path,{method,headers:{...(role?{Authorization:'Bearer '+tokens[role]}:{}),'Content-Type':'application/json'},...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})});
  await t.test('AUTH-ROLE-007: profile, saved addresses and checkout quote reject staff and anonymous requests',async()=>{
    for(const role of ['admin','rider',null])for(const [path,method] of [['/api/customer/account','GET'],['/api/customer/account/addresses','PUT'],['/api/customer/account/checkout-quote','POST']]) {
      assert.equal((await request(path,role,method,{})).status,role?403:401);
    }
    assert.equal((await request('/api/customer/account','customer')).status,200);
  });
  await t.test('AUTH-ROLE-008: customer/rider tokens rejected by inventory, customer, report and log APIs',async()=>{
    for(const role of ['customer','rider'])for(const path of ['/api/admin/inventory','/api/admin/customers','/api/admin/reports','/api/admin/logs','/api/admin/riders']) {
      assert.equal((await request(path,role)).status,403,path);
    }
  });
  await t.test('AUTH-ROLE-009: only rider tokens access delivery and GPS writes',async()=>{
    for(const role of ['admin','customer'])for(const [path,method] of [['/api/rider/profile','GET'],['/api/rider/orders','GET'],['/api/riders/location','POST']]) {
      assert.equal((await request(path,role,method,{})).status,403,path);
    }
  });
  await t.test('AUTH-ROLE-010: existing Authorization headers cannot turn a wrong-portal login into a customer session',async()=>{
    for(const role of ['admin','rider']) {
      const response=await post('/api/auth/login',{email:role==='admin'?'admin@example.test':'rider-2',password},{Authorization:'Bearer '+tokens[role]});
      assert.equal(response.status,401);assert.equal(response.body.token,undefined);
    }
  });
  await t.test('Customer order creation rejects staff and anonymous callers before inventory processing',async()=>{
    for(const role of ['admin','rider',null])assert.equal((await request('/api/orders',role,'POST',{})).status,role?403:401);
  });
  await clear();
}
