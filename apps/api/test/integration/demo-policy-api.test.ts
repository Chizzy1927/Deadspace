// The public-demo guard rails over HTTP against the real database: what is refused, what still works,
// and that a refused request writes nothing.
import { ApiErrorResponseSchema, buildDemoStorageRequest, DemoConfigSchema } from '@deadspace/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import type { DemoPolicy } from '../../src/middleware/demo-policy.js';
import { getPostgisVersion } from '../../src/repositories/geo.repository.js';
import { createDatabaseHealthCheck } from '../../src/services/health.service.js';
import { createTestPrisma, DALLAS, daysFromToday, transportRequestInput, truckLegInput } from './helpers.js';

const prisma = createTestPrisma();

// Wire payloads, as the web forms send them (dates as YYYY-MM-DD).
const storageRequestInput = () => buildDemoStorageRequest(new Date());
const warehouseSpaceInput = () => ({
  companyName: 'Trinity Storage Co.',
  contactName: 'Ana Ruiz',
  contactEmail: 'ana@trinity.example.com',
  location: DALLAS,
  quantityAvailable: 200,
  availableFrom: daysFromToday(1),
  availableTo: daysFromToday(61),
  pricingPeriod: 'MONTH',
  pricePerPalletPerPeriod: 16,
});

const publicDemo: DemoPolicy = {
  listingCreationEnabled: false,
  writeRateLimit: { limit: 1_000, windowMs: 60_000 },
  maxRowsPerTable: 1_000,
};

const appWith = (policy: Partial<DemoPolicy> = {}) =>
  createApp({
    webOrigin: loadEnv().WEB_ORIGIN,
    checkDatabase: createDatabaseHealthCheck(() => getPostgisVersion(prisma)),
    prisma,
    geocoder: new MockGeocoder(),
    demoPolicy: { ...publicDemo, ...policy },
  });

const counts = async () => ({
  truckLegs: await prisma.truckLeg.count(),
  warehouseSpaces: await prisma.warehouseSpace.count(),
  transportRequests: await prisma.transportRequest.count(),
  storageRequests: await prisma.storageRequest.count(),
});

beforeEach(async () => {
  await prisma.truckLeg.deleteMany();
  await prisma.warehouseSpace.deleteMany();
  await prisma.transportRequest.deleteMany();
  await prisma.storageRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('public demo: supply creation turned off', () => {
  it('reports it through GET /api/demo-config', async () => {
    const res = await request(appWith()).get('/api/demo-config');
    expect(res.status).toBe(200);
    expect(DemoConfigSchema.parse(res.body)).toEqual({ listingCreationEnabled: false });
  });

  it.each([
    ['/api/truck-legs', () => truckLegInput()],
    ['/api/warehouse-spaces', () => warehouseSpaceInput()],
  ])('refuses a valid POST %s with 403 FEATURE_DISABLED and stores nothing', async (path, body) => {
    const res = await request(appWith()).post(path).send(body());

    expect(res.status).toBe(403);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('FEATURE_DISABLED');
    expect(await counts()).toEqual({ truckLegs: 0, warehouseSpaces: 0, transportRequests: 0, storageRequests: 0 });
  });

  it.each([
    ['/api/transport-requests', () => transportRequestInput(), 'transportRequests'],
    ['/api/storage-requests', () => storageRequestInput(), 'storageRequests'],
  ] as const)('still accepts a valid POST %s', async (path, body, table) => {
    const res = await request(appWith()).post(path).send(body());

    expect(res.status).toBe(201);
    expect((await counts())[table]).toBe(1);
  });
});

describe('local development: supply creation turned on', () => {
  it('reports it, and stores listings', async () => {
    const app = appWith({ listingCreationEnabled: true });
    expect(DemoConfigSchema.parse((await request(app).get('/api/demo-config')).body)).toEqual({
      listingCreationEnabled: true,
    });

    expect((await request(app).post('/api/truck-legs').send(truckLegInput())).status).toBe(201);
    expect((await request(app).post('/api/warehouse-spaces').send(warehouseSpaceInput())).status).toBe(201);
    expect(await counts()).toMatchObject({ truckLegs: 1, warehouseSpaces: 1 });
  });

  it('reports it, and everything is open, when no demo policy is configured at all', async () => {
    const app = createApp({
      webOrigin: loadEnv().WEB_ORIGIN,
      checkDatabase: createDatabaseHealthCheck(() => getPostgisVersion(prisma)),
      prisma,
      geocoder: new MockGeocoder(),
    });
    expect(DemoConfigSchema.parse((await request(app).get('/api/demo-config')).body).listingCreationEnabled).toBe(true);
    expect((await request(app).post('/api/truck-legs').send(truckLegInput())).status).toBe(201);
  });
});

describe('public demo: growth limits', () => {
  it('refuses a create with 503 DEMO_FULL once the table holds the maximum, and writes nothing more', async () => {
    const app = appWith({ maxRowsPerTable: 2 });

    expect((await request(app).post('/api/transport-requests').send(transportRequestInput())).status).toBe(201);
    expect((await request(app).post('/api/transport-requests').send(transportRequestInput())).status).toBe(201);
    const full = await request(app).post('/api/transport-requests').send(transportRequestInput());

    expect(full.status).toBe(503);
    expect(ApiErrorResponseSchema.parse(full.body).error.code).toBe('DEMO_FULL');
    expect((await counts()).transportRequests).toBe(2);
    // Another table has its own room.
    expect((await request(app).post('/api/storage-requests').send(storageRequestInput())).status).toBe(201);
  });

  it('refuses a create with 429 RATE_LIMITED past the per-visitor limit, and writes nothing more', async () => {
    const app = appWith({ writeRateLimit: { limit: 1, windowMs: 60_000 } });

    expect((await request(app).post('/api/storage-requests').send(storageRequestInput())).status).toBe(201);
    const limited = await request(app).post('/api/storage-requests').send(storageRequestInput());

    expect(limited.status).toBe(429);
    expect(ApiErrorResponseSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
    expect((await counts()).storageRequests).toBe(1);
    // A different resource has its own budget.
    expect((await request(app).post('/api/transport-requests').send(transportRequestInput())).status).toBe(201);
  });
});
