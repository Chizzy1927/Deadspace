import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ApiErrorResponseSchema } from '@deadspace/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { PrismaClient } from '../../src/db.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { createDatabaseHealthCheck } from '../../src/services/health.service.js';

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';

let webDist: string;

beforeAll(() => {
  webDist = mkdtempSync(path.join(tmpdir(), 'deadspace-web-'));
  mkdirSync(path.join(webDist, 'assets'));
  writeFileSync(path.join(webDist, 'index.html'), INDEX_HTML);
  writeFileSync(path.join(webDist, 'assets', 'index-abc123.js'), 'console.log("app")');
  writeFileSync(path.join(webDist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(path.join(webDist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
});

afterAll(() => rmSync(webDist, { recursive: true, force: true }));

// The SPA layer never touches the database, so any Prisma access fails loudly.
const noDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error('unit tests must not use the database');
    },
  },
) as PrismaClient;

function appWith(webDistDir?: string) {
  return createApp({
    webOrigin: 'http://localhost:5173',
    checkDatabase: createDatabaseHealthCheck(() => Promise.resolve('3.5')),
    prisma: noDatabase,
    geocoder: new MockGeocoder(),
    ...(webDistDir ? { webDist: webDistDir } : {}),
  });
}

describe('serving the built web app', () => {
  it('serves index.html at / and revalidates it', async () => {
    const res = await request(appWith(webDist)).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toBe(INDEX_HTML);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it.each([
    '/transport/new',
    '/requests/transport/clx123abc/matches',
    '/listings/truck-legs/clx456def',
    '/some/unknown/page',
  ])('falls back to index.html for the client-side route %s (deep link / hard refresh)', async (route) => {
    const res = await request(appWith(webDist)).get(route);
    expect(res.status).toBe(200);
    expect(res.text).toBe(INDEX_HTML);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves HEAD requests for SPA routes', async () => {
    const res = await request(appWith(webDist)).head('/requests/transport/clx123abc/matches');
    expect(res.status).toBe(200);
  });

  it('caches hashed assets for a year as immutable', async () => {
    const res = await request(appWith(webDist)).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('revalidates non-hashed static files such as the favicon', async () => {
    const res = await request(appWith(webDist)).get('/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('does not rewrite a missing asset to the SPA: it gets a real 404', async () => {
    const res = await request(appWith(webDist)).get('/assets/missing-def456.js');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('id="root"');
  });

  it.each(['/api/nope', '/api/transport-requests/clx123/nope', '/api'])(
    'keeps the JSON 404 for unknown API route %s instead of serving the SPA',
    async (route) => {
      const res = await request(appWith(webDist)).get(route);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    },
  );

  it('still serves real API routes', async () => {
    const res = await request(appWith(webDist)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('answers a non-GET to a non-API path with the JSON 404, not the SPA', async () => {
    const res = await request(appWith(webDist)).post('/some/page').send({});
    expect(res.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('does not serve files outside the web build', async () => {
    const res = await request(appWith(webDist)).get('/..%2f..%2fpackage.json');
    expect(res.text).not.toContain('"name"');
  });
});

describe('noindex infrastructure', () => {
  it('serves robots.txt disallowing all crawlers', async () => {
    const res = await request(appWith(webDist)).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Disallow: /');
  });

  it.each(['/', '/requests/transport/clx123abc/matches', '/api/health', '/api/nope'])(
    'sends X-Robots-Tag: noindex on %s',
    async (route) => {
      const res = await request(appWith(webDist)).get(route);
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    },
  );
});

describe('API-only mode (no web build, e.g. local dev)', () => {
  it('returns the JSON 404 for / and adds no robots header', async () => {
    const res = await request(appWith()).get('/');
    expect(res.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    expect(res.headers['x-robots-tag']).toBeUndefined();
  });
});
