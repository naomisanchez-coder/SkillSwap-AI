import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomBytes } from 'node:crypto';
import { readEmailConfig } from '../src/config/email.js';
import { createSmtpMailer } from '../src/adapters/smtp.js';

// Reserved .invalid addresses, injected transport, no external SMTP connection.
const env = () => ({ SMTP_ENABLED: 'true', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587',
  SMTP_USER: 'isolated-adapter-test', SMTP_PASSWORD: randomBytes(24).toString('hex'), SMTP_FROM: 'noreply@example.invalid' });
const message = () => ({ to: 'prueba.aislada@tecsup.edu.pe', code: String(randomInt(0, 1000000)).padStart(6, '0'), expiresAt: new Date(Date.now() + 60000) });
test('SMTP is explicitly disabled by default; enabled configuration rejects incomplete or unsafe values', () => {
  assert.equal(readEmailConfig({}), null);
  assert.equal(readEmailConfig({ SMTP_ENABLED: 'false' }), null);
  for (const patch of [{ SMTP_ENABLED: 'yes' }, { SMTP_PORT: '25' }, { SMTP_HOST: 'smtp://bad' },
    { SMTP_PASSWORD: '' }, { SMTP_FROM: 'sender@example.invalid\r\nBcc:other@example.invalid' }]) {
    assert.throws(() => readEmailConfig({ ...env(), ...patch }), /Invalid email configuration/);
  }
});
test('SMTP adapter enforces TLS verification, deadlines, no resource loading or logs, and private message construction', async () => {
  let options, sent, closed = false;
  const mailer = createSmtpMailer(readEmailConfig(env()), { createTransport(config) {
    options = config;
    return { async sendMail(input) { sent = input; return { accepted: [input.to], rejected: [] }; }, close() { closed = true; } };
  } });
  const input = message();
  assert.equal(await mailer.sendVerification(input), undefined);
  assert.equal(options.requireTLS, true); assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.logger, false); assert.equal(options.debug, false);
  assert.equal(options.disableFileAccess, true); assert.equal(options.disableUrlAccess, true);
  assert.ok(options.socketTimeout <= 10000);
  assert.equal(sent.to, input.to); assert.ok(sent.text.includes(input.code));
  assert.equal(sent.attachments, undefined); assert.equal(sent.html, undefined);
  mailer.close(); assert.equal(closed, true);
});
test('SMTP rejects arbitrary recipients/expired messages and sanitizes transport failures', async () => {
  const mailer = createSmtpMailer(readEmailConfig(env()), { createTransport: () => ({
    async sendMail() { throw new Error('private SMTP diagnostic and message'); }, close() {},
  }) });
  await assert.rejects(mailer.sendVerification({ ...message(), to: 'third.party@example.invalid' }), /Invalid verification message/);
  await assert.rejects(mailer.sendVerification({ ...message(), expiresAt: new Date(0) }), /Invalid verification message/);
  await assert.rejects(mailer.sendVerification(message()), (e) => e.message === 'Verification transport failed' && !e.cause);
});
test('implicit TLS is selected on 465 and every enabled OTP setting is explicit', async () => {
  let options;
  createSmtpMailer(readEmailConfig({...env(),SMTP_PORT:'465'}),{createTransport:c=>{options=c;return {close(){}};}});
  assert.equal(options.secure,true);assert.equal(options.requireTLS,true);
  const {readOtpConfig}=await import('../src/config/email.js');
  assert.throws(()=>readOtpConfig({}),/configuration required/);
  const source={OTP_HMAC_KEY_HEX:randomBytes(32).toString('hex'),OTP_HMAC_KEY_VERSION:'test',OTP_DIGITS:'6',
    OTP_TTL_SECONDS:'600',OTP_COOLDOWN_SECONDS:'60',OTP_WINDOW_SECONDS:'3600',OTP_MAX_PER_WINDOW:'5',OTP_MAX_ATTEMPTS:'5'};
  assert.equal(readOtpConfig(source).policy.maxAttempts,5);
  assert.equal(readOtpConfig(source).protection.digits,6);
});
