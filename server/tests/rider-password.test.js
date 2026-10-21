import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRiderTemporaryPassword} from '../../shared/riderTemporaryPassword.js';
import {newStaffPasswordError} from '../../shared/staffPasswordPolicy.js';

test('Web Crypto rider temporary credentials satisfy shared password policy without persistence',()=>{
  const credentials=Array.from({length:16},()=>generateRiderTemporaryPassword());
  assert.equal(new Set(credentials).size,16);
  for(const value of credentials){assert.equal(value.length,48);assert.equal(newStaffPasswordError(value),'');}
});
