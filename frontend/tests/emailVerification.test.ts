import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerificationFixture } from '../src/dev/registrationPreview';
import { pendingEmailVerification } from '../src/services/emailVerification';
const email = 'sheila.diaz@tecsup.edu.pe';
const signal = () => new AbortController().signal;

test('verificación local: exige emisión, correo asociado, seis dígitos correctos y vencimiento al límite', async () => {
  let clock = 10_000; const service = createVerificationFixture({ now: () => clock });
  assert.equal((await service.verify(email, '246810', signal())).status, 'service_error');
  const sent = await service.issue(email, signal()); assert.equal(sent.status, 'code_sent'); assert.equal(sent.expiresAt, 310_000);
  assert.equal((await service.verify('other@tecsup.edu.pe', '246810', signal())).status, 'service_error');
  assert.equal((await service.verify(email, '000000', signal())).status, 'incorrect');
  clock = 309_999; assert.equal((await service.verify(email, '246810', signal())).status, 'verified');
  clock = 310_000; assert.equal((await service.verify(email, '246810', signal())).status, 'expired');
  const resend = await service.issue(email, signal()); assert.equal(resend.expiresAt, 610_000);
  assert.equal((await service.verify(email, '246810', signal())).status, 'verified');
});

test('fixtures: expiración y error permiten recuperar el recorrido al reenviar', async () => {
  for (const scenario of ['expired', 'service-error'] as const) {
    const service = createVerificationFixture({ scenario, now: () => 10_000 });
    const first = await service.issue(email, signal());
    if (scenario === 'expired') assert.equal((await service.verify(email, '246810', signal())).status, 'expired');
    else assert.equal(first.status, 'service_error');
    assert.equal((await service.issue(email, signal())).status, 'code_sent');
    assert.equal((await service.verify(email, '246810', signal())).status, 'verified');
  }
});

test('OTP HTTP: conserva verificationId, reenvía y verifica sin códigos de prueba ni reintentos', async () => {
  const old = globalThis.fetch; const requests: { url: string; body: unknown; options: RequestInit }[] = [];
  let issued = 0;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), body: JSON.parse(options.body as string), options });
    return Response.json(String(url).endsWith('send-code') ? { status: 'accepted', verificationId: `verification-${++issued}` } : { status: 'verified' });
  };
  try {
    assert.deepEqual(await pendingEmailVerification.issue(email, signal()), { status: 'code_sent' });
    await pendingEmailVerification.issue(email, signal());
    assert.deepEqual(await pendingEmailVerification.verify(email, '246810', signal()), { status: 'verified' });
    assert.deepEqual(requests[2].body, { email, code: '246810', verificationId: 'verification-2' });
    assert.equal(requests[2].options.credentials, 'include');
    assert.equal(requests.length, 3);
    assert.deepEqual(await pendingEmailVerification.verify(email, '246810', signal()), { status: 'expired' });
  } finally { globalThis.fetch = old; }
});

test('verificación local: abortar no emite ni acepta otro resultado', async () => {
  const service = createVerificationFixture(); const controller = new AbortController(); controller.abort();
  await assert.rejects(service.issue(email, controller.signal), { name: 'AbortError' });
  await assert.rejects(service.verify(email, '246810', controller.signal), { name: 'AbortError' });
});