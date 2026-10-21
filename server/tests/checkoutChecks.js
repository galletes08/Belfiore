import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export async function checkCheckout({t,pool,request,create,fetch,base}) {
  const home={name:'Checkout Recipient',phone:'09991234567',label:'Home',addressLine:'10 Test Street',countryCode:'PH',province:'Laguna',city:'Calamba',barangay:'Real',postalCode:'4027',latitude:14.2,longitude:121.1,isDefault:true};
  let saved,work,product;
  const account=(path='',method='GET',body)=>request('/api/customer/account'+(path?'/'+path:''),method,body,'customer');
  const quote=body=>account('checkout-quote','POST',body);
  await t.test('Saved address CRUD is owned, default changes are explicit and concurrent saves do not lose or duplicate entries',async()=>{
    await pool.query("UPDATE users SET saved_addresses='[]',customer_profile=$1::jsonb WHERE id=123",[JSON.stringify({name:'Checkout Profile',phone:'09990000000'})]);
    assert.deepEqual((await account()).body.addresses,[]);
    const created=await account('addresses','POST',home);assert.equal(created.status,200,JSON.stringify(created.body));saved=created.body.address;assert.equal(saved.isDefault,true);
    const concurrent=await Promise.all([account('addresses','POST',home),account('addresses','POST',home)]);assert.ok(concurrent.every(r=>r.status===200));assert.equal((await account()).body.addresses.length,1);
    const next=await account('addresses','POST',{...home,addressLine:'20 Work Street',city:'Cabuyao',barangay:'Banaybanay',postalCode:'4025',label:'Work',isDefault:false});assert.equal(next.status,200,JSON.stringify(next.body));work=next.body.address;
    assert.equal((await account()).body.addresses.find(a=>a.isDefault).id,saved.id);
    assert.equal((await account('addresses/'+work.id,'PATCH',{isDefault:true})).status,200);assert.equal((await account()).body.addresses.find(a=>a.isDefault).id,work.id);
    assert.equal((await account('addresses/'+saved.id,'PATCH',{isDefault:true})).status,200);
    const other=(await pool.query('SELECT auth_version FROM users WHERE id=321')).rows[0];
    const token=jwt.sign({userId:321,role:'customer',email:'other@example.com',sessionVersion:other.auth_version},process.env.JWT_SECRET);
    for(const method of ['PATCH','DELETE']){const r=await fetch(base+'/api/customer/account/addresses/'+saved.id,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='PATCH'?{body:JSON.stringify(home)}:{})});assert.equal(r.status,404);}
    assert.equal((await request('/api/customer/account/addresses','POST',home,'admin')).status,403);
    assert.equal((await fetch(base+'/api/customer/account')).status,401);
    const stolen=await fetch(base+'/api/customer/account/checkout-quote',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({savedAddressId:saved.id,items:[{id:1,qty:1}]})});assert.equal(stolen.status,404);
  });
  await t.test('Shipping quote validates country/province/city/barangay/ZIP and recalculates real prices, destination and free delivery',async()=>{
    product=await create('succulent',1,{price:130});const items=[{id:product.id,qty:1,expectedUnitPrice:130}];
    const local=await quote({savedAddressId:saved.id,items,subtotal:999999,shippingFee:0});assert.equal(local.status,200,JSON.stringify(local.body));assert.equal(local.body.quote.subtotal,130);assert.equal(local.body.quote.fee,80);assert.equal(local.body.quote.totalAmount,210);
    assert.equal((await quote({savedAddressId:work.id,items})).body.quote.fee,100);
    for(const patch of [{postalCode:'9999'},{city:'Cebu City'},{barangay:'Not A Real Barangay'},{countryCode:'ZZ',country:'Nowhere'},{latitude:999}])assert.equal((await quote({deliveryAddress:{...home,...patch},items})).status,400);
    const expensive=await create('succulent',1,{price:2100});assert.equal((await quote({savedAddressId:saved.id,items:[{id:expensive.id,qty:1}]})).body.quote.fee,0);
    for(const [price,fee] of [[1999,80],[2000,0]]){const boundary=await create('succulent',1,{price});assert.equal((await quote({savedAddressId:saved.id,items:[{id:boundary.id,qty:1}]})).body.quote.fee,fee);}
    const elsewhere=await quote({deliveryAddress:{...home,province:'Cebu',city:'Cebu City',barangay:'Lahug',postalCode:'6000'},items});assert.equal(elsewhere.status,200,JSON.stringify(elsewhere.body));assert.equal(elsewhere.body.quote.fee,null);assert.equal(elsewhere.body.quote.isConfirmed,false);
    assert.equal((await quote({savedAddressId:saved.id,items:[{id:product.id,qty:1,expectedUnitPrice:1}]})).status,409);
  });
  await t.test('COD checkout snapshots destination/contact, ignores price manipulation and keyed retries create exactly one order/reservation',async()=>{
    const beforeProfile=(await pool.query('SELECT customer_profile FROM users WHERE id=123')).rows[0].customer_profile;
    const payload={checkoutRequestId:crypto.randomUUID(),savedAddressId:saved.id,fullName:'Order-specific recipient',gmail:'contact@example.test',mobileNumber:'09995554444',paymentMethod:'COD',items:[{id:product.id,qty:1,expectedUnitPrice:130}],shippingFee:0,totalAmount:1};
    const outcomes=await Promise.all([request('/api/orders','POST',payload,'customer'),request('/api/orders','POST',payload,'customer')]);assert.ok(outcomes.every(r=>r.status===201),JSON.stringify(outcomes));assert.equal(outcomes[0].body.id,outcomes[1].body.id);assert.equal(outcomes[0].body.totalAmount,210);
    const id=outcomes[0].body.id;const before=(await pool.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];assert.equal(before.contact_email,'contact@example.test');assert.equal(before.gmail,'inventory-test@gmail.com');assert.equal(before.delivery_address.addressLine,home.addressLine);assert.ok(before.location.includes(home.addressLine));
    assert.deepEqual((await pool.query('SELECT customer_profile FROM users WHERE id=123')).rows[0].customer_profile,beforeProfile);
    assert.equal((await request('/api/orders','POST',{...payload,mobileNumber:'09990001111'},'customer')).status,409);
    await account('addresses/'+saved.id,'PATCH',{...home,addressLine:'Changed after order',isDefault:true});await account('addresses/'+saved.id,'DELETE');
    assert.deepEqual((await pool.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0],before);
    assert.equal((await request('/api/orders','POST',payload,'customer')).body.id,id,'Lost-response replay works even after saved-address deletion');
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM checkout_requests WHERE customer_id=123 AND request_key=$1',[payload.checkoutRequestId])).rows[0].n),1);
  });
  await t.test('New draft addresses need no saved record; online checkout retains actual batch prices and idempotent payment session creation',async()=>{
    const plant=await create('succulent',1,{price:100});
    const payload={checkoutRequestId:crypto.randomUUID(),deliveryAddress:{...home,addressLine:'One-time destination'},fullName:'Checkout User',gmail:'inventory-test@gmail.com',mobileNumber:home.phone,paymentMethod:'ONLINE',items:[{id:plant.id,qty:1,expectedUnitPrice:100}]};
    const before=(await account()).body.addresses;
    const first=await request('/api/orders','POST',payload,'customer');assert.equal(first.status,201,JSON.stringify(first.body));assert.ok(first.body.checkoutUrl);assert.equal(first.body.totalAmount,180);
    const repeat=await request('/api/orders','POST',payload,'customer');assert.equal(repeat.body.id,first.body.id);assert.equal(repeat.body.checkoutUrl,first.body.checkoutUrl);
    assert.deepEqual((await account()).body.addresses,before,'Checkout does not save an address or modify default without explicit action');
    const pack=await create('edible',4,{price:130});const batch=(await pool.query('SELECT id,price FROM harvest_batches WHERE product_id=$1 ORDER BY id DESC LIMIT 1',[pack.id])).rows[0];
    const q=await quote({deliveryAddress:home,items:[{id:pack.id,batchId:Number(batch.id),qty:2,expectedUnitPrice:Number(batch.price)}]});assert.equal(q.status,200,JSON.stringify(q.body));assert.equal(q.body.quote.subtotal,Number(batch.price)*2);
    assert.equal((await quote({deliveryAddress:home,items:[{id:pack.id,qty:1}]})).status,409);
  });
}
