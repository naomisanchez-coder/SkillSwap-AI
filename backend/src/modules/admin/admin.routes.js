import { Router } from 'express';
import { PublicError } from '../../errors/PublicError.js';
import { readSessionCookie } from '../auth/session-security.js';
import { createAdminController } from './admin.controller.js';

export function createAdminRouter({ origins, sessionService, adminService, cookie = { name: 'skillswap_session' } }) {
  const router = Router();
  const controller = adminService ? createAdminController(adminService) : null;
  router.use(async (request, response, next) => {
    try {
      if (!sessionService || !controller) throw new PublicError('SERVICE_UNAVAILABLE');
      const token = readSessionCookie(request.get('cookie'), cookie.name);
      if (!token) throw new PublicError('SESSION_REQUIRED');
      const auth = await sessionService.authenticate(token);
      if (auth.user.role !== 'admin') throw new PublicError('FORBIDDEN');
      request.auth = auth; request.sessionToken = token; response.set('Cache-Control', 'no-store'); next();
    } catch (error) { next(error); }
  });
  const mutation = async (request, response, next) => {
    try {
      if (request.get('origin') && !origins.includes(request.get('origin'))) throw new PublicError('FORBIDDEN');
      await sessionService.validateCsrf(request.auth, request.sessionToken, request.get('x-csrf-token')); next();
    } catch (error) { next(error); }
  };
  const json = (request, response, next) => request.is('application/json')
    ? next() : next(new PublicError('UNSUPPORTED_MEDIA_TYPE'));
  router.get('/mentor-applications', controller?.pending ?? (() => {}));
  router.get('/mentor-applications/:applicationId/documents/:type', controller?.document ?? (() => {}));
  router.post('/mentor-applications/:applicationId/decision', mutation, json, controller?.decide ?? (() => {}));
  router.put('/mentor-offers/:offerId/level', mutation, json, controller?.assignLevel ?? (() => {}));
  return router;
}
