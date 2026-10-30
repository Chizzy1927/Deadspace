import cors from 'cors';
import express, { type Express } from 'express';
import type { PrismaClient } from './db.js';
import type { Geocoder } from './geocoding/index.js';
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
}

/** Builds the Express app from injected dependencies (no I/O at construction time). */
export function createApp({ webOrigin, checkDatabase, prisma, geocoder, geocodeRateLimit }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: webOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', healthRouter(checkDatabase));
  app.use('/api', geocodeRouter(geocoder, geocodeRateLimit));
  app.use('/api', transportRouter(prisma));
  app.use('/api', storageRouter(prisma));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
