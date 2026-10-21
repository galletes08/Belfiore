import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManualDelivery} from '../src/utils/manualDelivery.js';
import {isTrack123Configured,verifyTrack123WebhookRequest} from '../src/utils/track123.js';
test('Manual delivery separates references, dispatch, completion and terminal states',()=>{
  assert.equal(validateManualDelivery('Pending','Pending','Pending'),null);
  assert.equal(validateManualDelivery('Preparing','Packed','Preparing'),null);
  assert.equal(validateManualDelivery('Out for Delivery','In Transit','Packed'),null);
  assert.equal(validateManualDelivery('Delivered','Delivered','In Transit'),null);
  assert.ok(validateManualDelivery('Preparing','In Transit','Preparing'));
  assert.ok(validateManualDelivery('Preparing','Packed','Delivered'));
  assert.ok(validateManualDelivery('Pending','Pending','Cancelled'));
  assert.ok(validateManualDelivery('Preparing','Cancelled','Preparing'));
  assert.ok(validateManualDelivery('Delivered','In Transit','In Transit'));
});
test('Legacy courier integrations are disabled by default and webhooks fail closed',()=>{
  const enabled=process.env.TRACK123_ENABLED,key=process.env.TRACK123_API_KEY;
  try{
    delete process.env.TRACK123_ENABLED;process.env.TRACK123_API_KEY='test-key';
    assert.equal(isTrack123Configured(),false);
    assert.equal(verifyTrack123WebhookRequest({get:()=>''}),false);
  }finally{
    if(enabled===undefined)delete process.env.TRACK123_ENABLED;else process.env.TRACK123_ENABLED=enabled;
    if(key===undefined)delete process.env.TRACK123_API_KEY;else process.env.TRACK123_API_KEY=key;
  }
});
