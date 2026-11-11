import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { createCodeProtection } from '../src/modules/auth/email-code.js';
import { createEmailService as rawEmailService, validateEmailRequest } from '../src/modules/auth/email.service.js';

// Approved policy; transport/persistence are substituted in these unit tests.
const createEmailService = options => rawEmailService({ rateRepository: { take: async () => ({ allowed: true }) }, rateIdentifier: () => randomBytes(32), ...options });
const policy = { ttlSeconds: 600, cooldownSeconds: 60, windowSeconds: 3600, maxPerWindow: 5, maxAttempts: 5 };
const email = 'prueba.aislada@tecsup.edu.pe';
const protection = () => createCodeProtection({ keyHex: randomBytes(32).toString('hex'), keyVersion: 'test-v1', digits: 6 });
test('OTP uses random numeric strings with padding, keyed HMAC and challenge/address binding', () => {
  const keyHex = randomBytes(32).toString('hex');
  const p = createCodeProtection({ keyHex, keyVersion: 'v1', digits: 6 });
  const values = new Set(Array.from({ length: 100 }, () => p.generate()));
  assert.ok(values.size > 1);
  for (const code of values) assert.match(code, /^\d{6}$/);
  const code = p.generate();
  const digest = p.digest({ id: 'id', email, code });
  assert.equal(digest.length, 32);
  assert.deepEqual(digest, createHmac('sha256', Buffer.from(keyHex, 'hex')).update(JSON.stringify(['skillswap-email-v1', 'id', email, code])).digest());
  assert.notDeepEqual(digest, p.digest({ id: 'other', email, code }));
  assert.notDeepEqual(digest, p.digest({ id: 'id', email: 'otra.cuenta@tecsup.edu.pe', code }));
  assert.notEqual(digest.toString('hex'), code);
  assert.throws(() => createCodeProtection({ keyHex: '', keyVersion: 'v1', digits: 6 }));
});
test('send-code accepts only normalized institutional email and rejects extra fields', () => {
  assert.equal(validateEmailRequest({ email: ` ${email.toUpperCase()} ` }), email);
  for (const body of [null, [], {}, { email, code: 'extra' }, { email: 'third.party@example.invalid' },
    { email: 'prueba.aislada+alias@tecsup.edu.pe' }, { email: 2 }]) assert.throws(() => validateEmailRequest(body), e => e.code === 'VALIDATION_ERROR');
});
test('public acceptance is uniform after quota admission and precedes eligibility/network work', async () => {
  let started = false, sent = 0;
  const service = createEmailService({ policy, protection: protection(), repository: {
    health: async () => {}, reserve: async () => { started = true; return null; },
  }, mailer: { sendVerification: async () => { sent++; } } });
  const result = await service.request({ email });
  assert.equal(started, false);
  assert.equal(result.status, 'accepted');
  assert.match(result.verificationId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(result).sort(), ['message','status','verificationId']);
  await service.idle(); assert.equal(sent, 0);
  await service.close();
});
test('SMTP happens after reservation; delivery failure revokes only that challenge with safe events', async () => {
  let committed = false; let revoked;
  const events = [];
  const service = createEmailService({ policy, protection: protection(), onEvent: event => events.push(event),
    repository: { health: async () => {}, reserve: async input => {
      assert.equal(input.code, undefined); assert.ok(Buffer.isBuffer(input.digest));
      committed = true; return { to: email, expiresAt: new Date(Date.now()+60000) };
    }, revoke: async id => { revoked = id; } },
    mailer: { sendVerification: async () => { assert.equal(committed,true); throw Error('private SMTP diagnostic'); } },
  });
  const result = await service.request({ email });
  await service.idle(); assert.equal(revoked,result.verificationId);assert.deepEqual(events,['delivery_failed']);
  await service.close();
});
test('MySQL health errors are uniform 503; background persistence/revocation failures never leak', async () => {
  const offline = createEmailService({ policy, protection: protection(), repository: { health: async () => { throw Error('secret DB'); } }, mailer: {} });
  await assert.rejects(offline.request({ email }), e => e.code === 'SERVICE_UNAVAILABLE' && !e.message.includes('secret'));
  const events = [];
  const broken = createEmailService({ policy, protection: protection(), repository: { health: async () => {}, reserve: async () => { throw Error('private SQL'); } }, mailer: {}, onEvent: event => events.push(event) });
  assert.equal((await broken.request({ email })).status,'accepted');await broken.idle();assert.deepEqual(events,['persistence_failed']);
  await offline.close(); await broken.close();
});
test('queue is bounded even with concurrent health checks; closing rejects new requests', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const service = createEmailService({ policy, protection: protection(), repository: { health: async () => {}, reserve: async () => { await gate; return null; } }, mailer: {} });
  const results = await Promise.allSettled(Array.from({ length: 101 }, () => service.request({ email })));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,100);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'SERVICE_UNAVAILABLE');
  release(); await service.idle(); await service.close();
  await assert.rejects(service.request({ email }), e=>e.code==='SERVICE_UNAVAILABLE');
});
test('expired-before-send reservations are not delivered and revocation failures are recorded without secrets', async () => {
  let sent=false;const events=[];
  const service=createEmailService({policy,protection:protection(),onEvent:e=>events.push(e),
    repository:{health:async()=>{},reserve:async()=>({to:email,expiresAt:new Date(0)}),revoke:async()=>{throw Error('private DB');}},
    mailer:{sendVerification:async()=>{sent=true;}}});
  await service.request({email});await service.idle();assert.equal(sent,false);
  assert.deepEqual(events,['delivery_failed','revocation_failed']);await service.close();
});
test('issuance repository excludes administrative accounts without a separate approved flow', async () => {
  const {createEmailRepository}=await import('../src/modules/auth/email.repository.js');
  let calls=0;
  const repo=createEmailRepository({transaction:work=>work({execute:async()=>{calls++;return [[{
    id:'internal',role:'ADMIN',status:'PENDING_VERIFICATION',email_verified_at:null,
  }]];}})});
  assert.equal(await repo.reserve({email,policy}),null);assert.equal(calls,1);
});
