import { Router } from 'express';
import { getHealth, type DatabaseHealthCheck } from '../services/health.service.js';

export function healthRouter(checkDatabase: DatabaseHealthCheck): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    const health = await getHealth(checkDatabase);
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  });
  return router;
}
