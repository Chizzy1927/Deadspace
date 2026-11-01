// render.yaml is configuration nobody will exercise until the first real deploy, so its invariants are
// pinned here: the environment it sets must be what the API's own schema accepts, the public-demo
// safeguards must be on, and no secret or build-time API URL may ever be written into it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const blueprint = readFileSync(new URL('../../../../render.yaml', import.meta.url), 'utf8');

/** Minimal reader for the `envVars` list: `- key: X` followed by `value: Y` or `sync: false`. */
function envVars(): { key: string; value?: string; sync?: string }[] {
  const lines = blueprint.split('\n');
  const vars: { key: string; value?: string; sync?: string }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const key = line.match(/^- key:\s*(.+)$/);
    if (key) vars.push({ key: key[1]! });
    const value = line.match(/^value:\s*['"]?(.*?)['"]?$/);
    if (value && vars.length > 0) vars.at(-1)!.value = value[1]!;
    const sync = line.match(/^sync:\s*(.+)$/);
    if (sync && vars.length > 0) vars.at(-1)!.sync = sync[1]!;
  }
  return vars;
}

const field = (name: string) => blueprint.match(new RegExp(`^\\s+(?:-\\s+)?${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();

describe('render.yaml', () => {
  const vars = envVars();
  const byKey = Object.fromEntries(vars.map((v) => [v.key, v]));

  it('runs one Free-plan Node web service built and started the way the runbook says, with no pre-deploy', () => {
    expect(field('type')).toBe('web');
    expect(field('runtime')).toBe('node');
    expect(field('plan')).toBe('free'); // spins down when idle; the free plan has no pre-deploy command
    expect(field('buildCommand')).toBe('npm ci --include=dev && npm run build');
    expect(field('preDeployCommand')).toBeUndefined(); // migrations are manual (docs/OPERATIONS.md)
    expect(field('startCommand')).toBe('npm run start -w apps/api');
  });

  it('never seeds or migrates at startup, and never seeds automatically at all', () => {
    for (const command of ['buildCommand', 'startCommand']) {
      expect(field(command)).not.toMatch(/seed/);
    }
    expect(field('startCommand')).not.toMatch(/migrate|db:deploy/);
  });

  it('deploys only after CI passes, from main, and checks the database-free liveness route', () => {
    expect(field('autoDeployTrigger')).toBe('checksPass');
    expect(field('branch')).toBe('main');
    expect(field('healthCheckPath')).toBe('/api/livez');
  });

  it('keeps the public-demo safeguards on', () => {
    expect(byKey.DEMO_LISTING_CREATION?.value).toBe('false');
    expect(byKey.TRUST_PROXY?.value).toBe('2'); // measured on Render: Cloudflare + Render LB (docs/DEPLOYMENT.md)
    expect(byKey.GEOCODER?.value).toBe('mock');
    expect(byKey.NODE_ENV?.value).toBe('production');
  });

  it('leaves VITE_API_URL unset so the production web build uses same-origin /api', () => {
    expect(vars.map((v) => v.key)).not.toContain('VITE_API_URL');
    expect(blueprint).not.toMatch(/^\s*[^#\n]*VITE_API_URL/m);
  });

  it('holds the pooled database URL as a prompted secret and never gives Render the direct one', () => {
    expect(byKey.DATABASE_URL?.sync).toBe('false');
    expect(byKey.DATABASE_URL?.value).toBeUndefined();
    expect(vars.map((v) => v.key)).not.toContain('DIRECT_DATABASE_URL'); // only manual migrations use it
    expect(blueprint).not.toMatch(/postgres(ql)?:\/\//i);
  });

  it('sets only variables the API understands, and the values it sets pass the API env schema', () => {
    const configured = vars.filter((v) => v.value !== undefined && !['NODE_VERSION'].includes(v.key));
    const env = Object.fromEntries(configured.map((v) => [v.key, v.value]));

    const parsed = loadEnv({ ...env, DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });

    expect(parsed).toMatchObject({
      NODE_ENV: 'production',
      TRUST_PROXY: 2,
      DEMO_LISTING_CREATION: false,
      WRITE_RATE_LIMIT_PER_HOUR: 30,
      MAX_ROWS_PER_TABLE: 5000,
      GEOCODER: 'mock',
    });
    // PORT comes from Render itself and must not be pinned here.
    expect(vars.map((v) => v.key)).not.toContain('PORT');
  });
});
