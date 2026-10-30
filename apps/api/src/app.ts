import cors from 'cors';
import express, { type Express } from 'express';
import { errorHandler, notFound } from './middleware/errors.js';
import { healthRouter } from './routes/health.js';
import type { DatabaseHealthCheck } from './services/health.service.js';

export interface AppDeps {
  webOrigin: string;
  checkDatabase: DatabaseHealthCheck;
}

/** Builds the Express app from injected dependencies (no I/O at construction time). */
export function createApp({ webOrigin, checkDatabase }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: webOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', healthRouter(checkDatabase));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
