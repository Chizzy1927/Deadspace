import type { DemoConfig } from '@deadspace/shared';
import { Router } from 'express';
import type { DemoPolicy } from '../middleware/demo-policy.js';

/** Tells the web app which public-demo switches are on. With no policy (local dev) everything is enabled. */
export function demoConfigRouter(policy?: DemoPolicy): Router {
  const router = Router();
  router.get('/demo-config', (_req, res) => {
    const body: DemoConfig = { listingCreationEnabled: policy?.listingCreationEnabled ?? true };
    res.json(body);
  });
  return router;
}
