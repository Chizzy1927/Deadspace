import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { PrismaClient } from '../../src/db.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { createDatabaseHealthCheck } from '../../src/services/health.service.js';

// TEMPORARY: remove together with middleware/proxy-diagnostic.ts.
const TOKEN = 'unit-test-token-unit-test-token-0123456789';

function appWith(diagProxyToken?: string, trustProxy = 0) {
  return createApp({
    webOrigin: 'http://localhost:5173',
    checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')),
    prisma: {} as unknown as PrismaClient,
    geocoder: new MockGeocoder(),
    trustProxy,
    ...(diagProxyToken === undefined ? {} : { diagProxyToken }),
  });
}

describe('proxy diagnostic (temporary)', () => {
  it('does not exist unless a token is configured', async () => {
    const res = await request(appWith()).get('/api/_diag/proxy').set('X-Diag-Token', TOKEN);
    expect(res.status).toBe(404);
  });

  it.each([[undefined], ['wrong-token']])('is a plain 404 with token %s', async (supplied) => {
    const req = request(appWith(TOKEN)).get('/api/_diag/proxy');
    const res = await (supplied === undefined ? req : req.set('X-Diag-Token', supplied));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(res.headers['ratelimit-policy']).toBeUndefined();
  });

  it('reports the chain Express sees, uncached, with the limiter key and its pk', async () => {
    const res = await request(appWith(TOKEN, 1))
      .get('/api/_diag/proxy')
      .set('X-Diag-Token', TOKEN)
      .set('X-Forwarded-For', '198.51.100.9, 203.0.113.7');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      trustProxySetting: 1,
      reqIp: '203.0.113.7',
      reqIps: ['203.0.113.7'],
      xForwardedFor: '198.51.100.9, 203.0.113.7',
      xForwardedForEntries: 2,
      reqIpIsIPv6: false,
      limiterKey: '203.0.113.7',
    });
    // The library's own header must carry the same pk the endpoint computed.
    expect(res.headers['ratelimit-policy']).toContain(`pk=:${(res.body as { partitionKey: string }).partitionKey}:`);
  });

  it('masks an IPv6 client to its /56 exactly as the rate limiter does', async () => {
    const res = await request(appWith(TOKEN, 1))
      .get('/api/_diag/proxy')
      .set('X-Diag-Token', TOKEN)
      .set('X-Forwarded-For', '2001:db8:1234:5678::1');
    expect(res.body).toMatchObject({ reqIpIsIPv6: true, limiterKey: '2001:db8:1234:5600::/56' });
    expect(res.headers['ratelimit-policy']).toContain(`pk=:${(res.body as { partitionKey: string }).partitionKey}:`);
  });
});
