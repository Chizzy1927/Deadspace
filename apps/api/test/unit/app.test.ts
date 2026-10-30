import { ApiErrorResponseSchema, HealthResponseSchema } from '@deadspace/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDatabaseHealthCheck, DATABASE_UNAVAILABLE_MESSAGE } from '../../src/services/health.service.js';

const webOrigin = 'http://localhost:5173';

describe('GET /api/health', () => {
  it('returns 200 with the PostGIS version when the database is healthy', async () => {
    const app = createApp({
      webOrigin,
      checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5 USE_GEOS=1')),
    });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({
      status: 'ok',
      database: { status: 'ok', postgisVersion: '3.5 USE_GEOS=1' },
    });
  });

  it('returns 503 degraded with a generic message, logging but not exposing the driver error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const driverError = new Error('password authentication failed for user "deadspace"');
    const app = createApp({ webOrigin, checkDatabase: createDatabaseHealthCheck(() => Promise.reject(driverError)) });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(HealthResponseSchema.parse(res.body)).toEqual({
      status: 'degraded',
      database: { status: 'error', message: DATABASE_UNAVAILABLE_MESSAGE },
    });
    expect(res.text).not.toContain('deadspace');
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), driverError);
    consoleError.mockRestore();
  });

  it('allows CORS requests from the configured web origin', async () => {
    const app = createApp({ webOrigin, checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')) });

    const res = await request(app).get('/api/health').set('Origin', webOrigin);

    expect(res.headers['access-control-allow-origin']).toBe(webOrigin);
  });
});

describe('unknown routes', () => {
  it('return 404 in the standard error shape', async () => {
    const app = createApp({ webOrigin, checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')) });

    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });
});
