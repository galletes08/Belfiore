import test from 'node:test';
import assert from 'node:assert/strict';
import { orderSummary, filterOrders, manilaDate, orderTimeline, canShowCustomerInvoice } from '../../src/utils/orderDisplay.js';

test('Customer invoice requires recorded admin acceptance independently of payment or current status',()=>{
  for (const status of ['Pending','Preparing','Delivered','Cancelled']) {
    assert.equal(canShowCustomerInvoice({status,paymentStatus:'Paid'}),false);
  }
  assert.equal(canShowCustomerInvoice({adminConfirmedAt:'invalid'}),false);
  assert.equal(canShowCustomerInvoice(null),false);
  assert.equal(canShowCustomerInvoice({status:'Preparing',paymentStatus:'Unpaid',adminConfirmedAt:'2026-10-26T01:00:00Z'}),true);
  assert.equal(canShowCustomerInvoice({status:'Delivered',paymentStatus:'Paid',adminConfirmedAt:'2026-10-26T01:00:00Z'}),true);
});

test('Order summary counts distinct actionable orders and excludes terminal orders from progress',()=>{
  const orders=[{id:1,status:'Pending',paymentStatus:'Unpaid'},{id:2,status:'Cancellation Requested',paymentStatus:'Refund Pending'},
    {id:3,status:'Preparing'},{id:4,status:'Out for Delivery'},{id:5,status:'Delivered'},
    {id:6,status:'Cancelled',paymentStatus:'Refund Pending'},{id:7,status:'Delivered',codStatus:'Remittance Pending'},
    {id:8,status:'Cancelled',trackingStatus:'In Transit'},{id:9,status:'Pending',trackingStatus:'Packed'}];
  assert.deepEqual(orderSummary([...orders,orders[1]]),{total:9,pending:5,progress:3,delivered:2});
  assert.deepEqual(orderSummary([]),{total:0,pending:0,progress:0,delivered:0});
});

test('Order date filtering includes entire Manila end day and searches before pagination',()=>{
  const orders=[
    {id:1,createdAt:'2026-10-13T15:59:59.999Z',status:'Pending'},
    {id:2,createdAt:'2026-10-13T16:00:00Z',status:'Pending',customerName:'Juan',orderCode:'ORD-002'},
    {id:3,createdAt:'2026-10-14T15:59:59.999Z',status:'Delivered',courierName:'Rider Maria'},
    {id:4,createdAt:'2026-10-14T16:00:00Z',status:'Cancelled'},
  ];
  assert.equal(manilaDate(orders[1].createdAt),'2026-10-14');
  assert.deepEqual(filterOrders(orders,{fromDate:'2026-10-14',toDate:'2026-10-14'}).map(o=>o.id),[3,2]);
  assert.deepEqual(filterOrders(orders,{fromDate:'2026-10-13',toDate:'2026-10-14',status:'Delivered',search:'maria'}).map(o=>o.id),[3]);
  assert.equal(filterOrders(orders,{search:'ORD-002'})[0].id,2);
  assert.equal(filterOrders(orders,{search:'Juan'})[0].id,2);
  assert.deepEqual(filterOrders(orders,{search:'missing'}),[]);
  const many=Array.from({length:45},(_,index)=>({id:index,createdAt:'2026-10-14T01:00:00Z',status:'Pending'}));
  assert.equal(filterOrders(many,{search:'44'}).length,1);
  assert.equal(filterOrders(many,{}).slice(20,40).length,20);
  assert.equal(filterOrders(orders,{}).length,4);
  assert.deepEqual(filterOrders(orders,{}).map(o=>o.id),[4,3,2,1]);
  assert.equal(filterOrders(many,{}).slice(0,20)[0].id,44);
  assert.equal(filterOrders(many,{}).slice(20,40)[0].id,24);
  assert.equal(many[0].id,0,'Display sorting must not mutate the source records');
});

test('Timeline is chronological and never invents payment or delivered transitions',()=>{
  const order={status:'Preparing',createdAt:'2026-10-14T01:00:00Z',adminConfirmedAt:'2026-10-14T02:00:00Z',statusUpdatedAt:'2026-10-14T02:00:00Z'};
  assert.deepEqual(orderTimeline(order).map(event=>event[0]),['Order Placed','Order Confirmed','Preparing']);
  assert.ok(orderTimeline(order).every(event=>!event[0].includes('Payment')&&event[0]!=='Delivered'));
  assert.deepEqual(orderTimeline({status:'Pending'}),[]);
});
