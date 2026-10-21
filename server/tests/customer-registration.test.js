import test from 'node:test';
import assert from 'node:assert/strict';
import {customerPasswordError,registrationErrors} from '../../shared/customerRegistration.js';
test('Customer password policy counts code points, refuses bcrypt truncation and preserves exact passphrases',()=>{
 assert.equal(customerPasswordError('  unique garden passphrase  '),'');
 assert.ok(customerPasswordError('password123456789'));
 assert.ok(customerPasswordError('x'.repeat(73)));
 assert.ok(customerPasswordError('\u{1F33F}'.repeat(19)));
 assert.equal(customerPasswordError('\u{1F33F}'.repeat(15)+' garden'),'');
 const form={firstName:'Customer',lastName:'Test',email:'CUSTOMER@example.test',password:'  unique garden passphrase  ',confirmPassword:'unique garden passphrase'};
 assert.ok(registrationErrors(form).confirmPassword);
 assert.deepEqual(registrationErrors({...form,confirmPassword:form.password}),{});
});
