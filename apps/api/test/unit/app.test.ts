import {
  ApiErrorResponseSchema,
  GeocodeSearchResponseSchema,
  HealthResponseSchema,
  ValidationIssuesSchema,
} from '@deadspace/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { PrismaClient } from '../../src/db.js';
import { GeocoderError } from '../../src/geocoding/index.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { createDatabaseHealthCheck, DATABASE_UNAVAILABLE_MESSAGE } from '../../src/services/health.service.js';

const webOrigin = 'http://localhost:5173';

// Unit tests never reach the database: any Prisma access fails loudly. The cast is needed because
// the stub deliberately implements none of PrismaClient.
const noDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error('unit tests must not use the database');
    },
  },
) as PrismaClient;

const baseDeps = {
  webOrigin,
  checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')),
  prisma: noDatabase,
  geocoder: new MockGeocoder(),
};

describe('GET /api/health', () => {
  it('returns 200 with the PostGIS version when the database is healthy', async () => {
    const app = createApp({
      ...baseDeps,
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
    const app = createApp({ ...baseDeps, checkDatabase: createDatabaseHealthCheck(() => Promise.reject(driverError)) });

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
    const app = createApp({ ...baseDeps, checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')) });

    const res = await request(app).get('/api/health').set('Origin', webOrigin);

    expect(res.headers['access-control-allow-origin']).toBe(webOrigin);
  });
});

describe('unknown routes', () => {
  it('return 404 in the standard error shape', async () => {
    const app = createApp({ ...baseDeps, checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')) });

    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/geocode/search', () => {
  it('returns geocoder results', async () => {
    const res = await request(createApp(baseDeps)).get('/api/geocode/search').query({ q: 'dallas' });

    expect(res.status).toBe(200);
    expect(GeocodeSearchResponseSchema.parse(res.body).results.map((p) => p.label)).toEqual([
      'Dallas, TX, United States',
    ]);
  });

  it('rejects a missing or too-short query with field details', async () => {
    const res = await request(createApp(baseDeps)).get('/api/geocode/search').query({ q: 'd' });

    expect(res.status).toBe(400);
    const { error } = ApiErrorResponseSchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(ValidationIssuesSchema.parse(error.details).map((i) => i.path)).toEqual(['q']);
  });

  it('returns 502 without leaking details when the upstream geocoder fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = { provider: 'test', search: () => Promise.reject(new GeocoderError('HTTP 500', 'test', 500)) };
    const res = await request(createApp({ ...baseDeps, geocoder: failing }))
      .get('/api/geocode/search')
      .query({ q: 'dallas' });

    expect(res.status).toBe(502);
    expect(ApiErrorResponseSchema.parse(res.body).error).toEqual({
      code: 'UPSTREAM_ERROR',
      message: 'Location search is unavailable',
    });
    consoleError.mockRestore();
  });

  it('rate-limits searches per client', async () => {
    const app = createApp({ ...baseDeps, geocodeRateLimit: { limit: 2, windowMs: 60_000 } });

    for (let i = 0; i < 2; i++) expect((await request(app).get('/api/geocode/search?q=dallas')).status).toBe(200);
    const res = await request(app).get('/api/geocode/search?q=dallas');

    expect(res.status).toBe(429);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
  });
});

describe('transport routes: validation happens before any database access', () => {
  it('rejects an invalid transport request with per-field details', async () => {
    const res = await request(createApp(baseDeps)).post('/api/transport-requests').send({ pallets: 0 });

    expect(res.status).toBe(400);
    const { error } = ApiErrorResponseSchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    const paths = ValidationIssuesSchema.parse(error.details).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['pickup', 'dropoff', 'pallets', 'contactEmail']));
  });

  it('rejects an invalid truck leg with per-field details', async () => {
    const res = await request(createApp(baseDeps)).post('/api/truck-legs').send({});

    expect(res.status).toBe(400);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 (not 500) for a malformed JSON body', async () => {
    const res = await request(createApp(baseDeps))
      .post('/api/transport-requests')
      .set('Content-Type', 'application/json')
      .send('{"pallets":');

    expect(res.status).toBe(400);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});
