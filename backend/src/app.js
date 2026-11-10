import express from 'express';
import cors from 'cors';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp({ database, origins }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: (origin, callback) => callback(null, origins.includes(origin)) }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/health', createHealthRouter(database));
  app.use('/api/auth', createAuthRouter(database, origins));
  app.use((request, response) => {
    response.status(404).json({ status: 'error', message: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
