import { createServer } from 'node:http';
import { loadEnv } from './config/env.js';
import { createDatabase } from './config/db.js';
import { createApp } from './app.js';
import { readEmailConfig, readOtpConfig } from './config/email.js';
import { createSmtpMailer } from './adapters/smtp.js';
import { createEmailRepository } from './modules/auth/email.repository.js';
import { createEmailService } from './modules/auth/email.service.js';
import { createEmailRateRepository } from './modules/auth/email-rate.repository.js';
import { createRateIdentifier, createCodeProtection } from './modules/auth/email-code.js';
import { createEmailVerificationRepository } from './modules/auth/email-verification.repository.js';
import { createEmailVerificationService } from './modules/auth/email-verification.service.js';
import { readLoginSecurityConfig } from './config/login-security.js';
import { readSessionSecurityConfig } from './config/session-security.js';
import { createLoginRateIdentifiers } from './modules/auth/login-rate.js';
import { createLoginRateRepository } from './modules/auth/login-rate.repository.js';
import { createSessionProtection } from './modules/auth/session-security.js';
import { createSessionRepository } from './modules/auth/session.repository.js';
import { createSessionService } from './modules/auth/session.service.js';
import { createLoginService } from './modules/auth/login.service.js';

let database;
let emailService;
let verificationService;
let loginService;
let sessionService;
let server;
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await emailService?.close();
    await database?.close();
    process.exitCode = code;
  } catch {
    console.error('Unable to close service cleanly');
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

try {
  const config = loadEnv();
  database = createDatabase(config.db);
  const smtp = readEmailConfig(process.env);
  const otpConfigured = Boolean(process.env.OTP_HMAC_KEY_HEX || process.env.OTP_RATE_HMAC_KEY_HEX);
  const otp = smtp || otpConfigured ? readOtpConfig(process.env) : undefined;
  if (smtp) {
    emailService = createEmailService({ rateRepository: createEmailRateRepository(database), rateIdentifier: createRateIdentifier(otp.rateKeyHex), repository: createEmailRepository(database),
      mailer: createSmtpMailer(smtp), protection: createCodeProtection(otp.protection), policy: otp.policy,
      onEvent(event) { console.info(`email_verification: ${event}`); },
    });
  }
  if (otp) verificationService = createEmailVerificationService(
    createEmailVerificationRepository(database), createCodeProtection(otp.protection));
  const loginConfigured = Boolean(process.env.LOGIN_RATE_HMAC_KEY_HEX || process.env.SESSION_CSRF_KEY_HEX);
  let trustProxyHops = 0;
  let cookie;
  if (loginConfigured) {
    const loginSecurity = readLoginSecurityConfig(process.env);
    const sessionSecurity = readSessionSecurityConfig(process.env, config.nodeEnv);
    trustProxyHops = loginSecurity.trustProxyHops;
    const protection = createSessionProtection(sessionSecurity.csrfKeyHex);
    const sessionRepository = createSessionRepository(database, sessionSecurity.policy);
    sessionService = createSessionService(sessionRepository, protection);
    loginService = createLoginService({ sessionRepository,
      rateRepository: createLoginRateRepository(database, loginSecurity.policy),
      identifiers: createLoginRateIdentifiers(loginSecurity.rateKeyHex), protection });
    cookie = { name: sessionSecurity.policy.cookieName, secure: sessionSecurity.secureCookie,
      rememberMaxAge: sessionSecurity.policy.remembered.absoluteSeconds * 1000 };
  }
  server = createServer(createApp({ database, origins: config.origins, emailService, verificationService,
    loginService, sessionService, cookie, trustProxyHops }));
  server.on('error', () => {
    console.error('HTTP server failed');
    void shutdown(1);
  });
  server.listen(config.port, config.host, () => {
    console.info(`skillswap-api listening on port ${config.port}`);
    if (!config.db.password) console.warn('Configure DB_PASSWORD locally to enable database checks');
  });
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
} catch {
  console.error('Unable to start service: check local configuration');
  await shutdown(1);
}
