import { Router } from 'express';

export function createHealthRouter(database) {
  const router = Router();
  router.get('/', (request, response) => {
    response.json({ status: 'ok', service: 'skillswap-api' });
  });
  router.get('/db', async (request, response) => {
    try {
      await database.check();
      response.json({ status: 'ok', database: 'connected' });
    } catch {
      response.status(503).json({ status: 'error', database: 'unavailable' });
    }
  });
  return router;
}
