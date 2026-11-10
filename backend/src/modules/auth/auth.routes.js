import { Router } from 'express';
import { PublicError } from '../../errors/PublicError.js';
import { createAuthController } from './auth.controller.js';
import { createAuthService } from './auth.service.js';
import { createAuthRepository } from './auth.repository.js';
import { createRegistrationLimiter } from './registration.limiter.js';

export function createAuthRouter(database, origins) {
  const router = Router();
  const controller = createAuthController(createAuthService(createAuthRepository(database)));
  router.post('/register', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.get('origin') && !origins.includes(request.get('origin'))) return next(new PublicError('FORBIDDEN'));
    if (!request.is('application/json')) return next(new PublicError('UNSUPPORTED_MEDIA_TYPE'));
    next();
  }, createRegistrationLimiter(), controller.register);
  return router;
}
