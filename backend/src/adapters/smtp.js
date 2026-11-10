import nodemailer from 'nodemailer';

export function createSmtpMailer(config, { createTransport = nodemailer.createTransport } = {}) {
  if (!config || ![465, 587].includes(config.port)) throw new Error('SMTP configuration required');
  const transport = createTransport({
    host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: config.user, pass: config.password },
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
  });
  return Object.freeze({
    async sendVerification({ to, code, expiresAt }) {
      if (typeof to !== 'string' || !/^[a-z]+\.[a-z]+@tecsup\.edu\.pe$/.test(to) ||
          typeof code !== 'string' || !/^\d{4,10}$/.test(code) || !(expiresAt instanceof Date) ||
          !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new Error('Invalid verification message');
      try {
        const result = await transport.sendMail({
          from: config.from, to, subject: 'Verifica tu correo en SkillSwap AI',
          text: `Tu código de verificación de SkillSwap AI es: ${code}\nVence el ${expiresAt.toISOString()} (UTC).\nSi no solicitaste este mensaje, puedes ignorarlo. No compartas el código.`,
          disableFileAccess: true, disableUrlAccess: true,
        });
        if (!Array.isArray(result.accepted) || !result.accepted.includes(to) || result.rejected?.length) throw new Error();
      } catch {
        // Never propagate SMTP response, envelope, message body, code or credentials.
        throw new Error('Verification transport failed');
      }
    },
    close() { transport.close(); },
  });
}
