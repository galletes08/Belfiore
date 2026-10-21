import test from 'node:test';
import assert from 'node:assert/strict';
import {cartLineId} from '../../shared/cartIdentity.js';
test('Supply cart keys separate variants while retaining batch and individual-plant identities',()=>{
 assert.notEqual(cartLineId({id:1,variantId:10}),cartLineId({id:1,variantId:11}));
 assert.notEqual(cartLineId({id:1,variantId:10}),cartLineId({id:1,batchId:10}));
 assert.equal(cartLineId({id:1}),1);assert.equal(cartLineId({id:1,variantId:10}),'1:variant:10');
});
