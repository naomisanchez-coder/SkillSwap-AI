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
  const validAddress = value => typeof value === 'string' && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/[\r\n\0]/.test(value);
  async function send(message, acceptedError) {
    try {
      const result = await transport.sendMail({ ...message, disableFileAccess: true, disableUrlAccess: true });
      if (!Array.isArray(result.accepted) || !result.accepted.includes(message.to) || result.rejected?.length) {
        throw new Error();
      }
    } catch {
      throw new Error(acceptedError);
    }
  }
  return Object.freeze({
    async sendVerification({ to, code, expiresAt }) {
      if (typeof to !== 'string' || !/^[a-z]+\.[a-z]+@tecsup\.edu\.pe$/.test(to) ||
          typeof code !== 'string' || !/^\d{4,10}$/.test(code) || !(expiresAt instanceof Date) ||
          !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new Error('Invalid verification message');
      await send({ from: config.from, to, subject: 'Verifica tu correo en SkillSwap AI',
        text: `Tu código de verificación de SkillSwap AI es: ${code}\nVence el ${expiresAt.toISOString()} (UTC).\nSi no solicitaste este mensaje, puedes ignorarlo. No compartas el código.` },
      'Verification transport failed');
    },
    async sendPasswordRecovery({ to, code, expiresAt }) {
      if (!validAddress(to) || typeof code !== 'string' || !/^\d{6}$/.test(code) ||
          !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) ||
          expiresAt.getTime() <= Date.now()) throw new Error('Invalid recovery message');
      await send({ from: config.from, to, subject: 'Recupera tu contraseña de SkillSwap AI',
        text: `Tu código de recuperación de SkillSwap AI es: ${code}\nVence el ${expiresAt.toISOString()} (UTC).\nSi no solicitaste este cambio, ignora el mensaje. No compartas el código.` },
      'Recovery transport failed');
    },
    async sendPasswordChanged({ to }) {
      if (!validAddress(to)) throw new Error('Invalid password change message');
      await send({ from: config.from, to, subject: 'Tu contraseña de SkillSwap AI fue actualizada',
        text: 'La contraseña de tu cuenta SkillSwap AI fue actualizada. Si no realizaste este cambio, contacta al responsable del proyecto por el canal autorizado.' },
      'Password change notification failed');
    },
    close() { transport.close(); },
  });
}
