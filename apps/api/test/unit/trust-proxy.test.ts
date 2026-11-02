import express from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { renderCloudflareTrust, trustProxyForProfile } from '../../src/config/trust-proxy.js';
import type { PrismaClient } from '../../src/db.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { createDatabaseHealthCheck } from '../../src/services/health.service.js';

// The supertest socket is loopback, so position 0 is real; each case supplies the rest as X-Forwarded-For.
// Express, not our code, derives req.ip from the trust function.
const app = express();
app.set('trust proxy', renderCloudflareTrust);
app.get('/ip', (req, res) => {
  res.json({ ip: req.ip, key: ipKeyGenerator(req.ip ?? '', 56) });
});

async function clientFor(xff?: string) {
  const req = request(app).get('/ip');
  const res = await (xff === undefined ? req : req.set('X-Forwarded-For', xff));
  return res.body as { ip: string; key: string };
}

describe('render-cloudflare trust (Express req.ip)', () => {
  it('selects the real client on the exact captured clean production chain', async () => {
    expect((await clientFor('99.25.49.72, 162.159.114.93, 10.28.123.188')).ip).toBe('99.25.49.72');
  });

  it('ignores attacker entries on the exact captured forged production chain', async () => {
    const forged = '1.2.3.4, 5.6.7.8,99.25.49.72, 162.159.114.61, 10.28.250.167';
    expect(await clientFor(forged)).toEqual({ ip: '99.25.49.72', key: '99.25.49.72' });
  });

  it('ignores many attacker entries, including ones that look like Cloudflare or Render addresses', async () => {
    const forged = '8.8.8.8, 10.1.1.1, 162.159.1.1, 127.0.0.1, 1.1.1.1, 99.25.49.72, 162.159.114.61, 10.28.250.167';
    expect((await clientFor(forged)).ip).toBe('99.25.49.72');
  });

  it('stops at the real client when the Cloudflare hop is missing, never reaching forged values', async () => {
    expect((await clientFor('1.2.3.4, 5.6.7.8, 99.25.49.72, 10.28.1.1')).ip).toBe('99.25.49.72');
  });

  it('stops at the unexpected public address where Cloudflare is expected', async () => {
    expect((await clientFor('1.2.3.4, 99.25.49.72, 203.0.113.9, 10.28.1.1')).ip).toBe('203.0.113.9');
  });

  it('stops at the unexpected non-private address where Render internal is expected', async () => {
    expect((await clientFor('1.2.3.4, 162.159.114.93, 203.0.113.9')).ip).toBe('203.0.113.9');
  });

  it('uses the loopback socket (no forged value) on a shorter or direct path', async () => {
    expect((await clientFor()).ip).toMatch(/^(::1|(::ffff:)?127\.0\.0\.1)$/);
    // Only Render's hop present: the entry it recorded is the peer, the rest is client-controlled.
    expect((await clientFor('99.25.49.72')).ip).toBe('99.25.49.72');
    expect((await clientFor('1.2.3.4, 99.25.49.72')).ip).toBe('99.25.49.72');
  });

  it('keys an IPv4 client on its plain address', async () => {
    expect((await clientFor('99.25.49.72, 162.159.114.93, 10.28.123.188')).key).toBe('99.25.49.72');
  });

  it('keys an IPv6 client on its /56 network, as express-rate-limit does', async () => {
    const res = await clientFor('2001:db8:1234:5678::1, 162.159.114.93, 10.28.123.188');
    expect(res.ip).toBe('2001:db8:1234:5678::1');
    expect(res.key).toBe('2001:db8:1234:5600::/56');
  });

  it('accepts an IPv6 Cloudflare edge address at position 2', async () => {
    expect((await clientFor('99.25.49.72, 2606:4700:10::1, 10.28.123.188')).ip).toBe('99.25.49.72');
  });
});

describe('renderCloudflareTrust positions', () => {
  it.each([
    [0, '::1', true],
    [0, '127.0.0.1', true],
    [0, '::ffff:127.0.0.1', true],
    [0, '203.0.113.50', false], // direct path: a public peer is not Render's loopback
    [0, '10.28.1.1', false],
    [1, '10.28.123.188', true],
    [1, '::ffff:10.28.123.188', true],
    [1, '11.0.0.1', false],
    [1, '172.16.0.1', false],
    [1, '162.159.114.93', false],
    [2, '162.159.114.93', true],
    [2, '162.158.0.0', true],
    [2, '162.160.0.0', false], // just past 162.158.0.0/15
    [2, '2606:4700::1', true],
    [2, '2001:db8::1', false],
    [2, '99.25.49.72', false],
    [2, '10.28.1.1', false],
    [3, '99.25.49.72', false],
    [3, '162.159.114.93', false],
    [3, '::1', false],
    [0, '', false],
    [1, 'not-an-ip', false],
    [2, '162.159.114.93:443', false],
    [2, '162.159.114.93/32', false],
  ])('position %i, address %j -> trusted %j', (i, addr, expected) => {
    expect(renderCloudflareTrust(addr, i)).toBe(expected);
  });
});

describe('trust proxy configuration', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('keeps the integer default and leaves the profile unset', () => {
    const env = loadEnv(base);
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.TRUST_PROXY_PROFILE).toBeUndefined();
  });

  it('accepts the render-cloudflare profile, blank as unset, and rejects unknown profiles', () => {
    expect(loadEnv({ ...base, TRUST_PROXY_PROFILE: 'render-cloudflare' }).TRUST_PROXY_PROFILE).toBe(
      'render-cloudflare',
    );
    expect(loadEnv({ ...base, TRUST_PROXY_PROFILE: '' }).TRUST_PROXY_PROFILE).toBeUndefined();
    expect(() => loadEnv({ ...base, TRUST_PROXY_PROFILE: 'cloudflare' })).toThrow(/TRUST_PROXY_PROFILE/);
  });

  it('refuses a hop count together with a profile instead of silently picking one', () => {
    expect(() => loadEnv({ ...base, TRUST_PROXY: '2', TRUST_PROXY_PROFILE: 'render-cloudflare' })).toThrow(/not both/);
    expect(loadEnv({ ...base, TRUST_PROXY: '0', TRUST_PROXY_PROFILE: 'render-cloudflare' })).toBeDefined();
  });

  it('resolves the profile to the position-by-position function', () => {
    expect(trustProxyForProfile('render-cloudflare')).toBe(renderCloudflareTrust);
  });

  it('with no profile and the default TRUST_PROXY, a forged X-Forwarded-For cannot choose the rate-limit key', async () => {
    // Same resolution as server.ts, from the real env defaults; the real limiter, so this is Express behaviour.
    const env = loadEnv(base);
    const app = createApp({
      webOrigin: 'http://localhost:5173',
      checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')),
      prisma: {} as unknown as PrismaClient,
      geocoder: new MockGeocoder(),
      trustProxy: env.TRUST_PROXY_PROFILE ? trustProxyForProfile(env.TRUST_PROXY_PROFILE) : env.TRUST_PROXY,
      geocodeRateLimit: { limit: 2, windowMs: 60_000 },
    });
    const search = (xff: string) => request(app).get('/api/geocode/search?q=dal').set('X-Forwarded-For', xff);

    expect((await search('203.0.113.1')).status).toBe(200);
    expect((await search('203.0.113.2')).status).toBe(200);
    // A third distinct forged value would get a fresh bucket if the header were trusted; it must not.
    expect((await search('203.0.113.3')).status).toBe(429);
    expect((await search('198.51.100.7, 203.0.113.4')).status).toBe(429);
  });
});
