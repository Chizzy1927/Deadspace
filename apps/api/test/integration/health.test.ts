import { HealthResponseSchema } from '@deadspace/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createPrismaClient } from '../../src/db.js';
import { getPostgisVersion } from '../../src/repositories/geo.repository.js';
import { createDatabaseHealthCheck } from '../../src/services/health.service.js';

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);
const app = createApp({
  webOrigin: env.WEB_ORIGIN,
  checkDatabase: createDatabaseHealthCheck(() => getPostgisVersion(prisma)),
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/health (real PostGIS)', () => {
  it('reports the database as healthy with a PostGIS 3.x version', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    const body = HealthResponseSchema.parse(res.body);
    expect(body.database).toEqual({ status: 'ok', postgisVersion: expect.stringMatching(/^3\./) as unknown });
  });
});
