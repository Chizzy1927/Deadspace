import cors from 'cors';
import express, { type Express } from 'express';
import type { TrustProxy } from './config/trust-proxy.js';
import type { PrismaClient } from './db.js';
import type { Geocoder } from './geocoding/index.js';
import type { DemoPolicy } from './middleware/demo-policy.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { proxyDiagnosticRouter } from './middleware/proxy-diagnostic.js';
import { noIndex, webAppRouter } from './middleware/web-app.js';
import { demoConfigRouter } from './routes/demo-config.js';
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
  trustProxy?: TrustProxy;
  /** Public-demo write limits; omitted means unrestricted (local dev, tests). */
  demoPolicy?: DemoPolicy;
  /** TEMPORARY: when set, mounts the token-gated proxy diagnostic (see middleware/proxy-diagnostic.ts). */
  diagProxyToken?: string;
  /** Directory of the built web app. When set, the API also serves the SPA (same-origin deployment). */
  webDist?: string;
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
  diagProxyToken,
  webDist,
}: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  if (webDist) app.use(noIndex);
  app.use(cors({ origin: webOrigin }));
  app.use(express.json({ limit: '100kb' }));

  if (diagProxyToken) app.use('/api', proxyDiagnosticRouter(diagProxyToken)); // TEMPORARY
  app.use('/api', healthRouter(checkDatabase));
  app.use('/api', demoConfigRouter(demoPolicy));
  app.use('/api', geocodeRouter(geocoder, geocodeRateLimit));
  app.use('/api', transportRouter(prisma, demoPolicy));
  app.use('/api', storageRouter(prisma, demoPolicy));
  // After the API routers, before the JSON 404: unknown /api/* paths never reach the SPA fallback.
  if (webDist) app.use(webAppRouter(webDist));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
