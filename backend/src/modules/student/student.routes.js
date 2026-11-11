import { Router } from 'express';
import { PublicError } from '../../errors/PublicError.js';
import { readSessionCookie } from '../auth/session-security.js';
import { createStudentController } from './student.controller.js';
import { createMentorController } from './mentor.controller.js';
import { parseMultipart } from '../../middleware/multipart.js';

export function createStudentRouter({ origins, sessionService, studentService,
  mentorService, cookie = { name: 'skillswap_session' } }) {
  const router = Router();
  const controller = studentService ? createStudentController(studentService) : null;
  const mentor = mentorService ? createMentorController(mentorService) : null;
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
      await sessionService.validateCsrf(request.auth, request.sessionToken, request.get('x-csrf-token'));
      next();
    } catch (error) { next(error); }
  };
  const json = (request, response, next) => request.is('application/json')
    ? next() : next(new PublicError('UNSUPPORTED_MEDIA_TYPE'));
  const mentorAvailable = (request, response, next) => mentor ? next() : next(new PublicError('SERVICE_UNAVAILABLE'));
  router.use(authenticate);
  router.get('/profile', controller?.profile ?? (() => {}));
  router.patch('/profile', mutation, json, controller?.updateProfile ?? (() => {}));
  router.get('/onboarding', controller?.onboarding ?? (() => {}));
  router.put('/onboarding', mutation, json, controller?.completeOnboarding ?? (() => {}));
  router.get('/catalog', controller?.catalog ?? (() => {}));
  router.get('/credits', controller?.credits ?? (() => {}));
  router.get('/dashboard', controller?.dashboard ?? (() => {}));
  router.get('/skills/catalog', mentorAvailable, mentor?.catalog ?? (() => {}));
  router.get('/skills', mentorAvailable, mentor?.ownSkills ?? (() => {}));
  router.put('/skills/:skillId', mentorAvailable, mutation, json, mentor?.setOwnSkill ?? (() => {}));
  router.get('/mentor-application/requirements', mentorAvailable, mentor?.requirements ?? (() => {}));
  router.get('/mentor-applications', mentorAvailable, mentor?.applications ?? (() => {}));
  router.post('/mentor-applications', mentorAvailable, mutation,
    parseMultipart({ fileFields: ['certificate', 'portfolio'], fieldNames: ['skillId', 'portfolioUrl'] }),
    mentor?.createApplication ?? (() => {}));
  router.put('/mentor-applications/:applicationId/certificate', mentorAvailable, mutation,
    parseMultipart({ fileFields: ['certificate'] }), mentor?.replaceCertificate ?? (() => {}));
  router.post('/mentor-applications/:applicationId/resubmit', mentorAvailable, mutation, json,
    mentor?.resubmit ?? (() => {}));
  router.get('/mentor-applications/:applicationId/documents/:type', mentorAvailable,
    mentor?.document ?? (() => {}));
  router.get('/profile/photo', mentorAvailable, mentor?.photo ?? (() => {}));
  router.put('/profile/photo', mentorAvailable, mutation,
    parseMultipart({ fileFields: ['photo'], maximumBytes: 2 * 1024 * 1024 }), mentor?.savePhoto ?? (() => {}));
  router.delete('/profile/photo', mentorAvailable, mutation, mentor?.deletePhoto ?? (() => {}));
  return router;
}
