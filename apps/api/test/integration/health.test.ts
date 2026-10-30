import { HealthResponseSchema } from '@deadspace/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestPrisma } from './helpers.js';

const prisma = createTestPrisma();
const app = createTestApp(prisma);

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
