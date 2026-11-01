import { ApiErrorResponseSchema } from '@deadspace/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { PrismaClient } from '../../src/db.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import type { DemoPolicy } from '../../src/middleware/demo-policy.js';
import { createDatabaseHealthCheck } from '../../src/services/health.service.js';

// Guards run before validation and persistence, so a stub that only implements count() is enough.
// Bodies are deliberately invalid: a request that passes every guard ends in a 400, never a write.
function stubPrisma(rows: number): PrismaClient {
  const table = { count: () => Promise.resolve(rows) };
  return {
    truckLeg: table,
    transportRequest: table,
    warehouseSpace: table,
    storageRequest: table,
  } as unknown as PrismaClient;
}

const policy: DemoPolicy = {
  listingCreationEnabled: false,
  writeRateLimit: { limit: 2, windowMs: 60_000 },
  maxRowsPerTable: 10,
};

function appWith(overrides: { policy?: Partial<DemoPolicy>; rows?: number; trustProxy?: number } = {}) {
  return createApp({
    webOrigin: 'http://localhost:5173',
    checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')),
    prisma: stubPrisma(overrides.rows ?? 0),
    geocoder: new MockGeocoder(),
    demoPolicy: { ...policy, ...overrides.policy },
    ...(overrides.trustProxy === undefined ? {} : { trustProxy: overrides.trustProxy }),
  });
}

const errorCode = (body: unknown) => ApiErrorResponseSchema.parse(body).error.code;

describe('demo write guards', () => {
  it.each(['/api/truck-legs', '/api/warehouse-spaces'])(
    'refuses %s with 403 FEATURE_DISABLED when listing creation is off',
    async (path) => {
      const res = await request(appWith()).post(path).send({});
      expect(res.status).toBe(403);
      expect(errorCode(res.body)).toBe('FEATURE_DISABLED');
    },
  );

  it.each(['/api/transport-requests', '/api/storage-requests'])(
    'leaves %s open when listing creation is off (fails validation, not the guard)',
    async (path) => {
      const res = await request(appWith()).post(path).send({});
      expect(res.status).toBe(400);
      expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
    },
  );

  it.each(['/api/truck-legs', '/api/warehouse-spaces'])(
    'lets %s through to validation when listing creation is on',
    async (path) => {
      const res = await request(appWith({ policy: { listingCreationEnabled: true } }))
        .post(path)
        .send({});
      expect(res.status).toBe(400);
    },
  );

  it('rate-limits creates per client IP with 429 RATE_LIMITED', async () => {
    const app = appWith();
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await request(app).post('/api/transport-requests').send({})).status);
    expect(statuses).toEqual([400, 400, 429]);
    const limited = await request(app).post('/api/transport-requests').send({});
    expect(errorCode(limited.body)).toBe('RATE_LIMITED');
  });

  it.each([
    ['/api/transport-requests', '/api/truck-legs'],
    ['/api/truck-legs', '/api/transport-requests'],
    ['/api/storage-requests', '/api/warehouse-spaces'],
    ['/api/warehouse-spaces', '/api/storage-requests'],
    ['/api/transport-requests', '/api/storage-requests'],
  ])('exhausting %s leaves the %s budget untouched', async (exhausted, other) => {
    const app = appWith({ policy: { listingCreationEnabled: true } });
    const post = (path: string) => request(app).post(path).send({});

    await post(exhausted);
    await post(exhausted);
    expect((await post(exhausted)).status).toBe(429);

    // The other resource still has its full allowance of 2 before being limited itself.
    expect((await post(other)).status).toBe(400);
    expect((await post(other)).status).toBe(400);
    expect((await post(other)).status).toBe(429);
  });

  it('keys the limit on the forwarded client IP when a proxy hop is trusted', async () => {
    const app = appWith({ trustProxy: 1 });
    const post = (ip: string) => request(app).post('/api/transport-requests').set('X-Forwarded-For', ip).send({});
    await post('203.0.113.1');
    await post('203.0.113.1');
    expect((await post('203.0.113.1')).status).toBe(429);
    expect((await post('203.0.113.2')).status).toBe(400);
  });

  it.each(['/api/transport-requests', '/api/storage-requests'])(
    'refuses %s with 503 DEMO_FULL once the table is at its cap',
    async (path) => {
      const res = await request(appWith({ rows: 10 }))
        .post(path)
        .send({});
      expect(res.status).toBe(503);
      expect(errorCode(res.body)).toBe('DEMO_FULL');
    },
  );

  it('does not limit or cap anything without a policy (local dev, tests)', async () => {
    const app = createApp({
      webOrigin: 'http://localhost:5173',
      checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')),
      prisma: stubPrisma(1_000_000),
      geocoder: new MockGeocoder(),
    });
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/api/truck-legs').send({})).status).toBe(400);
    }
  });
});
