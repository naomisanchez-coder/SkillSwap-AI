import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createEmailService } from '../src/modules/auth/email.service.js';
import { createCodeProtection } from '../src/modules/auth/email-code.js';
const policy = { ttlSeconds: 600, cooldownSeconds: 60, windowSeconds: 3600, maxPerWindow: 5, maxAttempts: 5 };
async function run(emailService, work) {
  const server = createApp({ database: { check: async () => {} }, origins: ['http://localhost:5173'], emailService }).listen(0, '127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve=>server.close(resolve)); await emailService?.close(); }
}
const post = (base, body, headers = {}) => fetch(`${base}/api/auth/email/send-code`, {
  method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),
});
test('unconfigured SMTP is uniform 503, not a simulated successful delivery; invalid requests stay 422', async () => {
  await run(undefined, async base => {
    for (const email of ['prueba.aislada@tecsup.edu.pe','cuenta.ausente@tecsup.edu.pe']) {
      const response=await post(base,{email});assert.equal(response.status,503);
      assert.equal((await response.json()).error.code,'SERVICE_UNAVAILABLE');
    }
    assert.equal((await post(base,{email:'bad@demo.pe'})).status,422);
    assert.equal((await post(base,{email:'prueba.aislada@tecsup.edu.pe',code:'forbidden'})).status,422);
    assert.equal((await post(base,{email:'prueba.aislada@tecsup.edu.pe'},{Origin:'https://untrusted.invalid'})).status,403);
  });
});
test('configured injection returns exact 202 DTO without cookies/OTP, and cooldown applies uniformly', async () => {
  let sends=0;
  const service=createEmailService({policy,protection:createCodeProtection({keyHex:randomBytes(32).toString('hex'),keyVersion:'test',digits:6}),
    repository:{health:async()=>{},reserve:async()=>null},mailer:{sendVerification:async()=>{sends++;}}});
  await run(service,async base=>{
    const response=await post(base,{email:' PRUEBA.AISLADA@TECSUP.EDU.PE '});
    assert.equal(response.status,202);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
    const body=await response.json();assert.deepEqual(Object.keys(body).sort(),['message','status','verificationId']);assert.equal(body.status,'accepted');
    assert.match(body.verificationId,/^[0-9a-f-]{36}$/);
    const limited=await post(base,{email:'prueba.aislada@tecsup.edu.pe'});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
    await service.idle();assert.equal(sends,0);
  });
});
