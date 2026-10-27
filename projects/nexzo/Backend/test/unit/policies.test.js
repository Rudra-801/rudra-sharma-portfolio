import test from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken,emailVerificationDecision } from '../../src/policies/auth-policy.js';
import { originAllowed } from '../../src/policies/cors-policy.js';
import { quotaDecision,utcDayKey } from '../../src/policies/quota-policy.js';
import { readiness } from '../../src/policies/readiness-policy.js';

test('bearer token parser fails closed',()=>{
  assert.equal(bearerToken(''),'');
  assert.equal(bearerToken('Basic abc'),'');
  assert.equal(bearerToken('Bearer   '),'');
  assert.equal(bearerToken('Bearer token-123'),'token-123');
});

test('password users require verified email',()=>{
  assert.deepEqual(emailVerificationDecision({firebase:{sign_in_provider:'password'},email:'a@b.com',email_verified:false}),{allowed:false,code:'EMAIL_NOT_VERIFIED'});
  assert.equal(emailVerificationDecision({firebase:{sign_in_provider:'google.com'},email:'a@b.com'}).allowed,true);
  assert.equal(emailVerificationDecision({firebase:{sign_in_provider:'password'},email:'a@b.com',email_verified:true}).allowed,true);
});

test('CORS policy permits explicit origins and local development only',()=>{
  assert.equal(originAllowed(undefined,{production:true}),true);
  assert.equal(originAllowed('https://app.example',{production:true,allowed:['https://app.example']}),true);
  assert.equal(originAllowed('http://localhost:5500',{production:false}),true);
  assert.equal(originAllowed('http://localhost:5500',{production:true}),false);
  assert.equal(originAllowed('https://evil.example',{production:true,allowed:['https://app.example']}),false);
});

test('quota policy handles boundaries deterministically',()=>{
  assert.deepEqual(quotaDecision({count:0,limit:3}),{allowed:true,limit:3,current:0,next:1,remaining:2});
  assert.equal(quotaDecision({count:2,limit:3}).remaining,0);
  assert.equal(quotaDecision({count:3,limit:3}).allowed,false);
  assert.equal(quotaDecision({count:-4,limit:0}).limit,1);
  assert.equal(utcDayKey(new Date('2026-08-03T23:59:59Z')),'2026-08-03');
});

test('readiness requires all production dependencies',()=>{
  assert.equal(readiness({firebaseProjectConfigured:true,geminiConfigured:true,firebaseAdminDataConfigured:true,firebaseAdminDataReachable:true}).ready,true);
  assert.equal(readiness({firebaseProjectConfigured:true,geminiConfigured:false,firebaseAdminDataConfigured:true}).ready,false);
});
