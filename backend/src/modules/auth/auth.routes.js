import { Router } from 'express';
import { PublicError } from '../../errors/PublicError.js';
import { createAuthController } from './auth.controller.js';
import { createAuthService } from './auth.service.js';
import { createAuthRepository } from './auth.repository.js';
import { validateEmailRequest } from './email.service.js';
import { validateVerificationRequest } from './email-verification.service.js';
import { createRegistrationLimiter } from './registration.limiter.js';

export function createAuthRouter(database, origins, emailService, verificationService, loginService, sessionService, cookie) {
  const router = Router();
  const controller = createAuthController(createAuthService(createAuthRepository(database)), emailService,
    verificationService, loginService, sessionService, cookie);
  const browserOrigin = (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.get('origin') && !origins.includes(request.get('origin'))) return next(new PublicError('FORBIDDEN'));
    next();
  };
  router.post('/register', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.get('origin') && !origins.includes(request.get('origin'))) return next(new PublicError('FORBIDDEN'));
    if (!request.is('application/json')) return next(new PublicError('UNSUPPORTED_MEDIA_TYPE'));
    next();
  }, createRegistrationLimiter(), controller.register);
  const cooldown = emailService ? createRegistrationLimiter({ windowMs: emailService.limits.cooldownSeconds * 1000, ipLimit: 20, emailLimit: 1 }) : (req, res, next) => next();
  const hourly = emailService ? createRegistrationLimiter({ windowMs: emailService.limits.windowSeconds * 1000, ipLimit: 100, emailLimit: emailService.limits.maxPerWindow }) : (req, res, next) => next();
  router.post('/email/send-code', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.get('origin') && !origins.includes(request.get('origin'))) return next(new PublicError('FORBIDDEN'));
    if (!request.is('application/json')) return next(new PublicError('UNSUPPORTED_MEDIA_TYPE'));
    // Validate before limits; malformed input never becomes a recipient.
    validateEmailRequest(request.body);
    next();
  }, cooldown, hourly,
  controller.sendEmailCode);
  const verificationLimiter = createRegistrationLimiter({ windowMs: 60000, ipLimit: 50, emailLimit: 10 });
  router.post('/email/verify', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.get('origin') && !origins.includes(request.get('origin'))) return next(new PublicError('FORBIDDEN'));
    if (!request.is('application/json')) return next(new PublicError('UNSUPPORTED_MEDIA_TYPE'));
    validateVerificationRequest(request.body);
    next();
  }, verificationLimiter, controller.verifyEmail);
  router.post('/login', browserOrigin, (request, response, next) => {
    if (!request.is('application/json')) return next(new PublicError('UNSUPPORTED_MEDIA_TYPE'));
    if (request.get('x-csrf-protection') !== '1') return next(new PublicError('CSRF_INVALID'));
    next();
  }, controller.login);
  router.post('/logout', browserOrigin, (request, response, next) => {
    if (request.body !== undefined && (request.body === null || typeof request.body !== 'object' ||
      Array.isArray(request.body) || Object.keys(request.body).length)) return next(new PublicError('VALIDATION_ERROR',
      { general: 'No envíes campos para cerrar sesión.' }));
    next();
  }, controller.logout);
  router.get('/me', browserOrigin, controller.me);
  return router;
}
