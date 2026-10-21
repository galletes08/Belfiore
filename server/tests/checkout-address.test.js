import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredAddress,addressToCheckout,missingAddressFields} from '../../shared/checkoutAddress.js';
test('Checkout selects only explicit default or a sole address, preserves choices and identifies missing fields',()=>{
  assert.equal(preferredAddress([]),null);const one={id:'one',addressLine:'Street',province:'Laguna',city:'Calamba',barangay:'Real',postalCode:'4027'};
  assert.equal(preferredAddress([one]),one);assert.equal(preferredAddress([one,{id:'two'}]),null);
  const defaultAddress={id:'two',isDefault:true};assert.equal(preferredAddress([one,defaultAddress]),defaultAddress);assert.equal(one.isDefault,undefined);
  assert.deepEqual(missingAddressFields(addressToCheckout(one)),[]);assert.deepEqual(missingAddressFields(addressToCheckout({...one,barangay:''})),['barangay']);
  assert.equal(addressToCheckout({...one,latitude:14,longitude:121}).customerLatitude,14);
});
