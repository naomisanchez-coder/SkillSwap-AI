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

test('API pendiente: nunca llama a fetch, envía código ni devuelve verificado', async () => {
  const old = globalThis.fetch; globalThis.fetch = () => { throw new Error('No debe llamar a la API'); };
  try {
    assert.deepEqual(await pendingEmailVerification.issue(email, signal()), { status: 'integration_pending' });
    assert.deepEqual(await pendingEmailVerification.verify(email, '246810', signal()), { status: 'integration_pending' });
  } finally { globalThis.fetch = old; }
});

test('verificación local: abortar no emite ni acepta otro resultado', async () => {
  const service = createVerificationFixture(); const controller = new AbortController(); controller.abort();
  await assert.rejects(service.issue(email, controller.signal), { name: 'AbortError' });
  await assert.rejects(service.verify(email, '246810', controller.signal), { name: 'AbortError' });
});