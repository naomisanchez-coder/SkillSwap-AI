import { Router } from 'express';
import { PublicError } from '../../errors/PublicError.js';
import { readSessionCookie } from '../auth/session-security.js';
import { createStudentController } from './student.controller.js';

export function createStudentRouter({ origins, sessionService, studentService,
  cookie = { name: 'skillswap_session' } }) {
  const router = Router();
  const controller = studentService ? createStudentController(studentService) : null;
  const authenticate = async (request, response, next) => {
    try {
      if (!sessionService || !controller) throw new PublicError('SERVICE_UNAVAILABLE');
      const token = readSessionCookie(request.get('cookie'), cookie.name);
      if (!token) throw new PublicError('SESSION_REQUIRED');
      const auth = await sessionService.authenticate(token);
      if (auth.user.role !== 'student') throw new PublicError('FORBIDDEN');
      request.auth = auth;
      request.sessionToken = token;
      response.set('Cache-Control', 'no-store');
      next();
    } catch (error) { next(error); }
  };
  const mutation = async (request, response, next) => {
    try {
      if (request.get('origin') && !origins.includes(request.get('origin'))) throw new PublicError('FORBIDDEN');
      if (!request.is('application/json')) throw new PublicError('UNSUPPORTED_MEDIA_TYPE');
      await sessionService.validateCsrf(request.auth, request.sessionToken, request.get('x-csrf-token'));
      next();
    } catch (error) { next(error); }
  };
  router.use(authenticate);
  router.get('/profile', controller?.profile ?? (() => {}));
  router.patch('/profile', mutation, controller?.updateProfile ?? (() => {}));
  router.get('/onboarding', controller?.onboarding ?? (() => {}));
  router.put('/onboarding', mutation, controller?.completeOnboarding ?? (() => {}));
  router.get('/catalog', controller?.catalog ?? (() => {}));
  return router;
}
