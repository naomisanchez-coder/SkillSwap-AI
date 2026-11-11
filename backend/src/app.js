import express from 'express';
import cors from 'cors';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createStudentRouter } from './modules/student/student.routes.js';

export function createApp({ database, origins, emailService, verificationService, loginService, sessionService,
  cookie, recoveryService, studentService, mentorService, exploreService, bookingService, aiService,
  trustProxyHops = 0 }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops === 0 ? false : trustProxyHops);
  app.use(cors({ origin: (origin, callback) => callback(null, origins.includes(origin)), credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Protection', 'X-CSRF-Token'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/health', createHealthRouter(database));
  app.use('/api/auth', createAuthRouter(database, origins, emailService, verificationService,
    loginService, sessionService, cookie, recoveryService));
  app.use('/api/student', createStudentRouter({ origins, sessionService, studentService, mentorService,
    exploreService, bookingService, aiService, cookie }));
  app.use((request, response) => {
    response.status(404).json({ status: 'error', message: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
