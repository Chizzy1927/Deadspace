import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('applies defaults when only DATABASE_URL is set', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env).toMatchObject({ PORT: 3001, WEB_ORIGIN: 'http://localhost:5173', NODE_ENV: 'development' });
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
