import { describe, expect, it } from 'vitest';
import { ApiErrorResponseSchema, HealthResponseSchema } from '../src/index.js';

describe('HealthResponseSchema', () => {
  it('accepts a healthy response with a PostGIS version', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      database: { status: 'ok', postgisVersion: '3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1' },
    });
    expect(parsed.database.status).toBe('ok');
  });

  it('accepts a degraded response with a database error', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'degraded',
      database: { status: 'error', message: 'connection refused' },
    });
    expect(parsed.status).toBe('degraded');
  });

  it('rejects an ok database result without a PostGIS version', () => {
    expect(HealthResponseSchema.safeParse({ status: 'ok', database: { status: 'ok' } }).success).toBe(false);
  });
});

describe('ApiErrorResponseSchema', () => {
  it('rejects unknown error codes', () => {
    expect(ApiErrorResponseSchema.safeParse({ error: { code: 'TEAPOT', message: 'no' } }).success).toBe(false);
  });
});
