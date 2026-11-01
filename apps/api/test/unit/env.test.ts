import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('applies defaults when only DATABASE_URL is set', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env).toMatchObject({ PORT: 3001, WEB_ORIGIN: 'http://localhost:5173', NODE_ENV: 'development' });
  });

  it('defaults demo write controls to open listing creation, 30 creates/hour and 5000 rows/table', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env).toMatchObject({
      TRUST_PROXY: 0,
      DEMO_LISTING_CREATION: true,
      WRITE_RATE_LIMIT_PER_HOUR: 30,
      MAX_ROWS_PER_TABLE: 5000,
    });
  });

  it('parses demo write controls from strings and rejects bad values', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };
    const env = loadEnv({ ...base, TRUST_PROXY: '1', DEMO_LISTING_CREATION: 'false', WRITE_RATE_LIMIT_PER_HOUR: '10' });
    expect(env).toMatchObject({ TRUST_PROXY: 1, DEMO_LISTING_CREATION: false, WRITE_RATE_LIMIT_PER_HOUR: 10 });
    expect(() => loadEnv({ ...base, DEMO_LISTING_CREATION: 'no' })).toThrow(/DEMO_LISTING_CREATION/);
    expect(() => loadEnv({ ...base, MAX_ROWS_PER_TABLE: '0' })).toThrow(/MAX_ROWS_PER_TABLE/);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('defaults to the mock geocoder and treats a blank API key as unset', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', GEOAPIFY_API_KEY: '' });
    expect(env.GEOCODER).toBe('mock');
    expect(env.GEOAPIFY_API_KEY).toBeUndefined();
  });

  it('requires GEOAPIFY_API_KEY when GEOCODER=geoapify', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', GEOCODER: 'geoapify' };
    expect(() => loadEnv({ ...base, GEOAPIFY_API_KEY: '' })).toThrow(/GEOAPIFY_API_KEY/);
    expect(loadEnv({ ...base, GEOAPIFY_API_KEY: 'test-key' }).GEOAPIFY_API_KEY).toBe('test-key');
  });

  it('rejects an unknown geocoder', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', GEOCODER: 'google' })).toThrow(
      /GEOCODER/,
    );
  });
});
