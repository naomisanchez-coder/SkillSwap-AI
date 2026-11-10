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

let database;
let emailService;
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
  if (smtp) {
    const otp = readOtpConfig(process.env);
    emailService = createEmailService({ rateRepository: createEmailRateRepository(database), rateIdentifier: createRateIdentifier(otp.rateKeyHex), repository: createEmailRepository(database),
      mailer: createSmtpMailer(smtp), protection: createCodeProtection(otp.protection), policy: otp.policy,
      onEvent(event) { console.info(`email_verification: ${event}`); },
    });
  }
  server = createServer(createApp({ database, origins: config.origins, emailService }));
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
