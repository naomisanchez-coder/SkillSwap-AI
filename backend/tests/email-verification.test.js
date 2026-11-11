import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createCodeProtection } from '../src/modules/auth/email-code.js';
import { createEmailVerificationService, validateVerificationRequest } from '../src/modules/auth/email-verification.service.js';

const email='prueba.aislada@tecsup.edu.pe';
const verificationId=randomUUID();
const code='012345';
const protection=()=>createCodeProtection({keyHex:randomBytes(32).toString('hex'),keyVersion:'test-v1',digits:6});
const input=()=>({email,verificationId,code});

test('verification accepts exactly email, UUID and six-digit string while preserving leading zeros',()=>{
  assert.deepEqual(validateVerificationRequest({email:` ${email.toUpperCase()} `,verificationId:verificationId.toUpperCase(),code}),input());
  for(const body of [null,[],{}, {...input(),extra:true},{...input(),code:12345},{...input(),code:'12345'},
    {...input(),verificationId:'opaque'},{...input(),email:'other@example.invalid'}]) {
    assert.throws(()=>validateVerificationRequest(body),error=>error.code==='VALIDATION_ERROR');
  }
});

test('service returns only the approved DTO and never accepts a client credit amount',async()=>{
  const seen=[];const service=createEmailVerificationService({async verify(value){seen.push(value);return{outcome:'VERIFIED',creditsGranted:20};}},protection());
  const result=await service.verify(input());
  assert.deepEqual(result,{status:'verified',initialCreditsGranted:true,creditsGranted:20,nextAction:'login'});
  assert.deepEqual(Object.keys(seen[0]).sort(),['digest','email','id','keyVersion']);
  assert.ok(Buffer.isBuffer(seen[0].digest));assert.equal(seen[0].digest.length,32);
});

test('invalid challenges are generic and internal persistence failures become safe 503',async()=>{
  const invalid=createEmailVerificationService({verify:async()=>({outcome:'INVALID'})},protection());
  await assert.rejects(invalid.verify(input()),error=>error.code==='VERIFICATION_INVALID'&&!error.message.includes(verificationId));
  const broken=createEmailVerificationService({verify:async()=>{throw Error('private SQL and bindings');}},protection());
  await assert.rejects(broken.verify(input()),error=>error.code==='SERVICE_UNAVAILABLE'&&!error.message.includes('private'));
});

async function run(verificationService,work){
  const server=createApp({database:{check:async()=>{}},origins:['http://localhost:5173'],verificationService}).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  try{await work(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}
}
const post=(base,body,headers={})=>fetch(`${base}/api/auth/email/verify`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('HTTP verification exposes approved 200/422/503 contracts without cookies',async()=>{
  const service=createEmailVerificationService({verify:async()=>({outcome:'VERIFIED',creditsGranted:20})},protection());
  await run(service,async base=>{
    const response=await post(base,input());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
    assert.deepEqual(await response.json(),{status:'verified',initialCreditsGranted:true,creditsGranted:20,nextAction:'login'});
    const malformed=await post(base,{...input(),code:'1'});assert.equal(malformed.status,422);assert.equal((await malformed.json()).error.code,'VALIDATION_ERROR');
    const forbidden=await post(base,input(),{Origin:'https://untrusted.invalid'});assert.equal(forbidden.status,403);
  });
  await run(undefined,async base=>{const response=await post(base,input());assert.equal(response.status,503);assert.equal((await response.json()).error.code,'SERVICE_UNAVAILABLE');});
});
