import test from 'node:test';
import assert from 'node:assert/strict';
import {carrierTransition} from '../src/utils/courierTracking.js';
import {normalizeTrackingStatus} from '../src/utils/track123.js';
test('Courier status mapping never treats failed delivery or unknown events as delivered',()=>{
  assert.equal(normalizeTrackingStatus('DELIVERED_01'),'Delivered');
  assert.equal(normalizeTrackingStatus('WAITING_DELIVERY_01'),'Out for Delivery');
  assert.equal(normalizeTrackingStatus('IN_TRANSIT_03'),'In Transit');
  for(const value of ['not delivered','undelivered','DELIVERY_FAILED','Exception','003','Unknown'])assert.equal(normalizeTrackingStatus(value),null);
});
test('Carrier updates respect order type, terminal state, payment verification and checkpoint order',()=>{
  const order={delivery_mode:'logistics',status:'Preparing',tracking_status:'Preparing',payment_method:'COD',payment_status:'Unpaid'};
  assert.deepEqual(carrierTransition(order,{trackingStatus:'In Transit'}),{status:'Out for Delivery',trackingStatus:'In Transit'});
  assert.equal(carrierTransition({...order,delivery_mode:'rider'},{trackingStatus:'Delivered'}),null);
  for(const status of ['Cancelled','Cancellation Requested','Delivered'])assert.equal(carrierTransition({...order,status},{trackingStatus:'In Transit'}),null);
  assert.equal(carrierTransition({...order,payment_method:'ONLINE'},{trackingStatus:'Delivered'}),null);
  assert.equal(carrierTransition({...order,tracking_status:'Out for Delivery'},{trackingStatus:'In Transit'}),null);
  assert.equal(carrierTransition({...order,track123_last_checkpoint_at:'2026-10-15T10:00:00Z'},{trackingStatus:'Delivered',checkpointTime:'2026-10-14T10:00:00Z'}),null);
  assert.equal(carrierTransition(order,{trackingStatus:null}),null);
});
