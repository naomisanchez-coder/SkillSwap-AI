import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {otpMemory} from './helpers/otp-memory.js';
import {createEmailRateRepository} from '../src/modules/auth/email-rate.repository.js';
import {createEmailRepository} from '../src/modules/auth/email.repository.js';
import {createEmailService} from '../src/modules/auth/email.service.js';
import {createCodeProtection,createRateIdentifier} from '../src/modules/auth/email-code.js';
import {otpPolicy} from '../src/modules/auth/email.policy.js';
import {readOtpConfig} from '../src/config/email.js';
const email='prueba.aislada@tecsup.edu.pe';
function fixture(){
 const {state,database}=otpMemory();const key=randomBytes(32).toString('hex');
 const protection=createCodeProtection({keyHex:randomBytes(32).toString('hex'),keyVersion:'unit'});
 const rateIdentifier=createRateIdentifier(key);
 const make=(mailer,onEvent)=>createEmailService({repository:createEmailRepository(database),rateRepository:createEmailRateRepository(database),rateIdentifier,protection,mailer,onEvent});
 const user={id:randomUUID(),email,role:'STUDENT',status:'PENDING_VERIFICATION',email_verified_at:null};
 return {state,database,make,user,rateIdentifier};
}
test('approved policy is fixed and distinct private keys are required',()=>{
 const input={OTP_HMAC_KEY_HEX:randomBytes(32).toString('hex'),OTP_HMAC_KEY_VERSION:'v1',OTP_RATE_HMAC_KEY_HEX:randomBytes(32).toString('hex')};
 assert.deepEqual(readOtpConfig(input).policy,otpPolicy);assert.equal(readOtpConfig(input).protection.digits,6);
 assert.throws(()=>readOtpConfig({...input,OTP_DIGITS:'8'}));assert.throws(()=>readOtpConfig({...input,OTP_TTL_SECONDS:'601'}));
 assert.throws(()=>readOtpConfig({...input,OTP_RATE_HMAC_KEY_HEX:input.OTP_HMAC_KEY_HEX}));
});
test('SQL-model: unknown email has durable admission across service restarts, rolling-hour cap and no plaintext storage',async()=>{
 const f=fixture();let sent=0;let service=f.make({sendVerification:async()=>{sent++;}});
 await service.request({email});await service.idle();await service.close();
 service=f.make({sendVerification:async()=>{sent++;}});
 await assert.rejects(service.request({email}),e=>e.code==='RATE_LIMITED'&&e.retryAfter===60);
 for(let i=0;i<4;i++){f.state.now+=60000;await service.request({email});await service.idle();}
 f.state.now+=60000;
 await assert.rejects(service.request({email}),e=>e.code==='RATE_LIMITED'&&e.retryAfter===3300);
 f.state.now+=3300000;
 await service.request({email});await service.idle();await service.close();
 assert.equal(sent,0);assert.equal(f.state.challenges.size,0);assert.equal(f.state.users.size,0);
 assert.equal(f.state.limits.size,1);assert.ok(!JSON.stringify([...f.state.limits.values()]).includes(email));
 assert.ok(f.state.commands.some(s=>s.includes('FOR UPDATE')));
});
test('SQL-model: concurrent requests share one persisted slot and return uniform rate errors',async()=>{
 const f=fixture();const service=f.make({sendVerification:async()=>{}});
 const results=await Promise.allSettled(Array.from({length:8},()=>service.request({email})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='RATE_LIMITED'));
 await service.idle();await service.close();
 const row=[...f.state.limits.values()][0];assert.equal(row.request_2_at,null);
});
test('SQL-model: SMTP failure plus revocation failure leaves SENDING, never PENDING',async()=>{
 const f=fixture();f.state.users.set(f.user.id,f.user);f.state.fail.add('revoke');const events=[];
 const service=f.make({sendVerification:async()=>{throw Error('Synthetic SMTP failure');}},e=>events.push(e));
 const result=await service.request({email});await service.idle();await service.close();
 assert.equal(f.state.challenges.get(result.verificationId).status,'SENDING');assert.deepEqual(events,['delivery_failed','revocation_failed']);
});
test('SQL-model: SMTP acceptance alone is insufficient if confirmation and compensation fail',async()=>{
 const f=fixture();f.state.users.set(f.user.id,f.user);f.state.fail.add('confirm');f.state.fail.add('revoke');let sent=0;
 const service=f.make({sendVerification:async()=>{sent++;}});const result=await service.request({email});await service.idle();await service.close();
 assert.equal(sent,1);assert.equal(f.state.challenges.get(result.verificationId).status,'SENDING');
});
test('SQL-model: late SMTP completion cannot reactivate a replaced challenge; no transaction held during SMTP',async()=>{
 const f=fixture();f.state.users.set(f.user.id,f.user);let start,release;
 const started=new Promise(r=>{start=r;});const gate=new Promise(r=>{release=r;});
 const first=f.make({sendVerification:async()=>{start();await gate;}});
 const one=await first.request({email});await started;
 assert.equal(f.state.challenges.get(one.verificationId).status,'SENDING');
 f.state.now+=60000;
 const second=f.make({sendVerification:async()=>{await f.database.transaction(async()=>{});}});
 const two=await second.request({email});await second.idle();
 assert.equal(f.state.challenges.get(two.verificationId).status,'PENDING');assert.equal(f.state.challenges.get(one.verificationId).status,'REVOKED');
 release();await first.idle();await first.close();await second.close();assert.equal(f.state.challenges.get(one.verificationId).status,'REVOKED');
});
test('SQL-model: failed new challenge insertion rolls back revocation of the previous one',async()=>{
 const f=fixture();f.state.users.set(f.user.id,f.user);const service=f.make({sendVerification:async()=>{}});
 const one=await service.request({email});await service.idle();f.state.now+=60000;f.state.fail.add('insert');
 await service.request({email});await service.idle();await service.close();
 assert.equal(f.state.challenges.size,1);assert.equal(f.state.challenges.get(one.verificationId).status,'PENDING');
});
test('SQL-model: expiry prevents confirmation after SMTP; confirmed/consumed/revoked rows cannot be resurrected',async()=>{
 const f=fixture();f.state.users.set(f.user.id,f.user);
 const service=f.make({sendVerification:async()=>{f.state.now+=601000;}});const result=await service.request({email});await service.idle();await service.close();
 assert.equal(f.state.challenges.get(result.verificationId).status,'REVOKED');
 const repo=createEmailRepository(f.database);
 for(const status of ['PENDING','REVOKED','CONSUMED','EXPIRED','EXHAUSTED']){
  f.state.challenges.get(result.verificationId).status=status;assert.equal(await repo.confirmDelivery(result.verificationId),false);
 }
});
