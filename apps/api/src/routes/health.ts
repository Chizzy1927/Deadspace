import { Router } from 'express';
import { getHealth, type DatabaseHealthCheck } from '../services/health.service.js';

export function healthRouter(checkDatabase: DatabaseHealthCheck): Router {
  const router = Router();
  // Liveness only: no database access. A host's health check polls every few seconds, and a database
  // query each time would keep a scale-to-zero database (Neon Free) awake around the clock.
  router.get('/livez', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/health', async (_req, res) => {
    const health = await getHealth(checkDatabase);
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  });
  return router;
}
