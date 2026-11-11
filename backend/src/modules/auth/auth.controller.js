import { PublicError } from '../../errors/PublicError.js';
import { readSessionCookie } from './session-security.js';

export function createAuthController(service, emailService, verificationService, loginService, sessionService,
  cookie = { name: 'skillswap_session', secure: false, rememberMaxAge: 30 * 24 * 60 * 60 * 1000 }) {
  const cookieOptions = Object.freeze({ httpOnly: true, secure: cookie.secure, sameSite: 'lax', path: '/' });
  return Object.freeze({
    async sendEmailCode(request, response) {
      if (!emailService) throw new PublicError('SERVICE_UNAVAILABLE');
      let result;
      try { result = await emailService.request(request.body); }
      catch (error) {
        if (error instanceof PublicError && error.code === 'RATE_LIMITED' && Number.isInteger(error.retryAfter) && error.retryAfter > 0 && error.retryAfter <= 3600) response.set('Retry-After', String(error.retryAfter));
        throw error;
      }
      response.set('Cache-Control', 'no-store').status(202).json(result);
    },
    async register(request, response) {
      const result = await service.register(request.body);
      response.set('Cache-Control', 'no-store').status(201).json(result);
    },
    async verifyEmail(request, response) {
      if (!verificationService) throw new PublicError('SERVICE_UNAVAILABLE');
      const result = await verificationService.verify(request.body);
      response.set('Cache-Control', 'no-store').status(200).json(result);
    },
    async login(request, response) {
      if (!loginService) throw new PublicError('SERVICE_UNAVAILABLE');
      let result;
      try { result = await loginService.login(request.body, request.ip); }
      catch (error) {
        if (error instanceof PublicError && error.code === 'RATE_LIMITED' && Number.isInteger(error.retryAfter)) {
          response.set('Retry-After', String(error.retryAfter));
        }
        throw error;
      }
      response.cookie(cookie.name, result.token, { ...cookieOptions,
        ...(result.remember ? { maxAge: cookie.rememberMaxAge } : {}) });
      response.set('Cache-Control', 'no-store').status(200).json({ user: result.user, csrfToken: result.csrfToken });
    },
    async logout(request, response) {
      const token = readSessionCookie(request.get('cookie'), cookie.name);
      if (token) {
        if (!sessionService) throw new PublicError('SERVICE_UNAVAILABLE');
        await sessionService.logout(token, request.get('x-csrf-token'));
      }
      response.clearCookie(cookie.name, cookieOptions);
      response.set('Cache-Control', 'no-store').status(200).json({ status: 'ok' });
    },
    async me(request, response) {
      if (!sessionService) throw new PublicError('SERVICE_UNAVAILABLE');
      const token = readSessionCookie(request.get('cookie'), cookie.name);
      if (!token) throw new PublicError('SESSION_REQUIRED');
      const result = await sessionService.me(token);
      response.set('Cache-Control', 'no-store').status(200).json(result);
    },
  });
}
