import cors from 'cors';
import express, { type Express } from 'express';
import type { PrismaClient } from './db.js';
import type { Geocoder } from './geocoding/index.js';
import type { DemoPolicy } from './middleware/demo-policy.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { geocodeRouter, type GeocodeRateLimit } from './routes/geocode.js';
import { healthRouter } from './routes/health.js';
import { storageRouter } from './routes/storage.js';
import { transportRouter } from './routes/transport.js';
import type { DatabaseHealthCheck } from './services/health.service.js';

export interface AppDeps {
  webOrigin: string;
  checkDatabase: DatabaseHealthCheck;
  prisma: PrismaClient;
  geocoder: Geocoder;
  geocodeRateLimit?: GeocodeRateLimit;
  /** Reverse-proxy hops to trust when deriving client IPs. */
  trustProxy?: number;
  /** Public-demo write limits; omitted means unrestricted (local dev, tests). */
  demoPolicy?: DemoPolicy;
}

/** Builds the Express app from injected dependencies (no I/O at construction time). */
export function createApp({
  webOrigin,
  checkDatabase,
  prisma,
  geocoder,
  geocodeRateLimit,
  trustProxy = 0,
  demoPolicy,
}: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(cors({ origin: webOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', healthRouter(checkDatabase));
  app.use('/api', geocodeRouter(geocoder, geocodeRateLimit));
  app.use('/api', transportRouter(prisma, demoPolicy));
  app.use('/api', storageRouter(prisma, demoPolicy));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
