import { Router } from 'express';
import { PublicError } from '../../errors/PublicError.js';
import { readSessionCookie } from '../auth/session-security.js';
import { createStudentController } from './student.controller.js';
import { createMentorController } from './mentor.controller.js';
import { parseMultipart } from '../../middleware/multipart.js';
import { createExploreController } from './explore.controller.js';
import { createBookingController } from './booking.controller.js';
import { createAiController } from './ai.controller.js';

export function createStudentRouter({ origins, sessionService, studentService,
  mentorService, exploreService, bookingService, aiService, cookie = { name: 'skillswap_session' } }) {
  const router = Router();
  const controller = studentService ? createStudentController(studentService) : null;
  const mentor = mentorService ? createMentorController(mentorService) : null;
  const explore = exploreService ? createExploreController(exploreService) : null;
  const booking = bookingService ? createBookingController(bookingService) : null;
  const ai = aiService ? createAiController(aiService) : null;
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
  const exploreAvailable = (request, response, next) => explore ? next() : next(new PublicError('SERVICE_UNAVAILABLE'));
  const bookingAvailable = (request, response, next) => booking ? next() : next(new PublicError('SERVICE_UNAVAILABLE'));
  const aiAvailable = (request, response, next) => ai ? next() : next(new PublicError('SERVICE_UNAVAILABLE'));
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
  router.get('/explore/skills', exploreAvailable, explore?.catalog ?? (() => {}));
  router.get('/explore/mentors', exploreAvailable, explore?.mentors ?? (() => {}));
  router.get('/explore/mentors/:mentorId', exploreAvailable, explore?.mentor ?? (() => {}));
  router.get('/recommendations', exploreAvailable, explore?.recommendations ?? (() => {}));
  router.get('/explore/mentors/:mentorId/availability', bookingAvailable, booking?.publicAvailability ?? (() => {}));
  router.get('/mentor/offers', bookingAvailable, booking?.offers ?? (() => {}));
  router.put('/mentor/offers/:skillId', bookingAvailable, mutation, json, booking?.setOffer ?? (() => {}));
  router.get('/mentor/availability', bookingAvailable, booking?.availability ?? (() => {}));
  router.put('/mentor/availability', bookingAvailable, mutation, json, booking?.replaceAvailability ?? (() => {}));
  router.post('/bookings', bookingAvailable, mutation, json, booking?.book ?? (() => {}));
  router.get('/sessions', bookingAvailable, booking?.sessions ?? (() => {}));
  router.get('/sessions/:sessionId', bookingAvailable, booking?.session ?? (() => {}));
  router.put('/sessions/:sessionId/meeting-link', bookingAvailable, mutation, json, booking?.setMeeting ?? (() => {}));
  router.post('/sessions/:sessionId/start', bookingAvailable, mutation, json, booking?.start ?? (() => {}));
  router.post('/sessions/:sessionId/performed', bookingAvailable, mutation, json, booking?.performed ?? (() => {}));
  router.post('/sessions/:sessionId/validate', bookingAvailable, mutation, json, booking?.validate ?? (() => {}));
  router.post('/sessions/:sessionId/cancel', bookingAvailable, mutation, json, booking?.cancel ?? (() => {}));
  router.post('/sessions/:sessionId/reviews', bookingAvailable, mutation, json, booking?.review ?? (() => {}));
  router.get('/session-credits', bookingAvailable, booking?.credits ?? (() => {}));
  router.post('/ai/chat', aiAvailable, mutation, json, ai?.chat ?? (() => {}));
  return router;
}
