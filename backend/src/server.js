import { createAiDiagnostics } from './modules/student/ai.diagnostics.js';
import { createConfiguredAiService } from './modules/student/ai.factory.js';
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
import { readPasswordRecoveryConfig } from './config/password-recovery.js';
import { createPasswordRecoveryProtection, createPasswordRecoveryRateIdentifiers } from './modules/auth/password-recovery.js';
import { createPasswordRecoveryRateRepository } from './modules/auth/password-recovery-rate.repository.js';
import { createPasswordRecoveryRepository } from './modules/auth/password-recovery.repository.js';
import { createPasswordRecoveryService } from './modules/auth/password-recovery.service.js';
import { createStudentRepository } from './modules/student/student.repository.js';
import { createStudentService } from './modules/student/student.service.js';
import { readPrivateStorageConfig } from './config/storage.js';
import { createLocalPrivateStorage, createLayeredPrivateStorage } from './adapters/private-storage.js';
import { createMentorRepository } from './modules/student/mentor.repository.js';
import { createMentorService } from './modules/student/mentor.service.js';
import { createExploreRepository } from './modules/student/explore.repository.js';
import { createExploreService } from './modules/student/explore.service.js';
import { createBookingRepository } from './modules/student/booking.repository.js';
import { createBookingService } from './modules/student/booking.service.js';
import { createAiRepository } from './modules/student/ai.repository.js';
import { createPrivateFileReader } from './modules/student/private-file-reader.js';
import { createAdminRepository } from './modules/admin/admin.repository.js';
import { createAdminService } from './modules/admin/admin.service.js';

let database;
let emailService;
let verificationService;
let loginService;
let sessionService;
let recoveryService;
let studentService;
let mentorService;
let exploreService;
let bookingService;
let aiService;
let adminService;
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
    await recoveryService?.close();
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
  const recoveryConfigured = Boolean(process.env.PASSWORD_RECOVERY_HMAC_KEY_HEX ||
    process.env.PASSWORD_RECOVERY_RATE_HMAC_KEY_HEX || process.env.PASSWORD_RECOVERY_HMAC_KEY_VERSION);
  const recovery = recoveryConfigured ? readPasswordRecoveryConfig(process.env) : undefined;
  if (smtp && recovery) {
    recoveryService = createPasswordRecoveryService({
      repository: createPasswordRecoveryRepository(database),
      rateRepository: createPasswordRecoveryRateRepository(database, recovery.policy),
      identifiers: createPasswordRecoveryRateIdentifiers(recovery.rateKey),
      protection: createPasswordRecoveryProtection({ keyHex: recovery.challengeKey,
        keyVersion: recovery.keyVersion }),
      mailer: createSmtpMailer(smtp),
      policy: recovery.policy,
      onEvent(event) { console.info(`password_recovery: ${event}`); },
    });
  }
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
  studentService = createStudentService(createStudentRepository(database));
  const storageConfig = readPrivateStorageConfig(process.env);
  const privateStorage = storageConfig ? (storageConfig.readOnlyRoot ? createLayeredPrivateStorage(storageConfig) : createLocalPrivateStorage(storageConfig)) : null;
  const [detailsMigration] = await database.execute(
    "SELECT 1 present FROM schema_migrations WHERE version='009_mentor_application_details' LIMIT 1", []);
  if (privateStorage) mentorService = createMentorService(createMentorRepository(database, { detailsAvailable: detailsMigration.length === 1 }),
    privateStorage, {
      onCleanupFailure(event) { console.warn(`private_storage: ${event}`); },
    });
  const [levelMigration] = await database.execute(
    "SELECT 1 present FROM schema_migrations WHERE version='008_mentor_skill_levels' LIMIT 1", []);
  exploreService = createExploreService(createExploreRepository(database,
    { levelsAvailable: levelMigration.length === 1 }));
  const [bookingMigration] = await database.execute(
    "SELECT 1 present FROM schema_migrations WHERE version='007_sessions_booking_credits' LIMIT 1", []);
  if (bookingMigration.length === 1) bookingService = createBookingService(createBookingRepository(database));
  if (privateStorage && levelMigration.length === 1) adminService = createAdminService(
    createAdminRepository(database), createPrivateFileReader(privateStorage));
  const aiDiagnostics = createAiDiagnostics(process.env);
  aiService = createConfiguredAiService(process.env, {
    repository: createAiRepository(database),
    onDiagnostic: aiDiagnostics.record,
  });
  server = createServer(createApp({ database, origins: config.origins, emailService, verificationService,
    loginService, sessionService, cookie, recoveryService, studentService, mentorService, exploreService,
    bookingService, aiService, adminService, trustProxyHops }));
  server.on('error', () => {
    console.error('HTTP server failed');
    void shutdown(1);
  });
  server.listen(config.port, config.host, () => {
    if (aiService) aiDiagnostics.start();
    console.info(`skillswap-api listening on port ${config.port}`);
    if (!config.db.password) console.warn('Configure DB_PASSWORD locally to enable database checks');
  });
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
} catch {
  console.error('Unable to start service: check local configuration');
  await shutdown(1);
}
