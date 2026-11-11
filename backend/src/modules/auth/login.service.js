import { PublicError } from '../../errors/PublicError.js';
import { dummyPasswordHash, verifyPassword } from './password.service.js';
import { publicUser } from './session.service.js';

const fields = new Set(['email', 'password', 'remember']);
export function validateLogin(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(body)) ||
      Object.keys(body).some(key => !fields.has(key))) throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente los campos permitidos.' });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body.password;
  const errors = {};
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email) || /[\r\n\0]/.test(email)) errors.email = 'Ingresa un correo válido.';
  if (typeof password !== 'string' || !password.isWellFormed() || !password.length || Buffer.byteLength(password, 'utf8') > 512) errors.password = 'Ingresa una contraseña válida.';
  if (typeof body.remember !== 'boolean') errors.remember = 'Selecciona una opción válida.';
  if (Object.keys(errors).length) throw new PublicError('VALIDATION_ERROR', errors);
  return { email, password, remember: body.remember };
}

export function createLoginService({ sessionRepository, rateRepository, identifiers, protection,
  verify = verifyPassword }) {
  return Object.freeze({
    async login(body, ip) {
      const input = validateLogin(body);
      const admitted = await rateRepository.take({ emailHmac: identifiers.email(input.email), ipHmac: identifiers.ip(ip) });
      if (!admitted.allowed) {
        const error = new PublicError('RATE_LIMITED');
        Object.defineProperty(error, 'retryAfter', { value: admitted.retryAfter });
        throw error;
      }
      const account = await sessionRepository.findAccount(input.email);
      const valid = await verify(input.password, account?.password_hash ?? dummyPasswordHash);
      if (!account || !valid) throw new PublicError('INVALID_CREDENTIALS');
      if (!account.email_verified_at) throw new PublicError('EMAIL_NOT_VERIFIED');
      if (account.status !== 'ACTIVE' || !['STUDENT', 'ADMIN'].includes(account.role)) throw new PublicError('ACCOUNT_SUSPENDED');
      if (account.role === 'STUDENT' && (!account.career || !Number.isInteger(Number(account.cycle)))) {
        throw new PublicError('SERVICE_UNAVAILABLE');
      }
      const session = protection.issue();
      await sessionRepository.create({ idHash: session.idHash, csrfHmac: session.csrfHmac,
        userId: account.id, remember: input.remember });
      return { user: publicUser(account), csrfToken: session.csrfToken, token: session.token,
        remember: input.remember };
    },
  });
}
