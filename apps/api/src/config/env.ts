import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    // Reverse-proxy hops to trust for client IPs (rate limiting). 0 off-proxy; 1 on Render.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Public-demo write controls: tunable policy defaults, not security controls (no auth in V1).
    DEMO_LISTING_CREATION: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    WRITE_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
    MAX_ROWS_PER_TABLE: z.coerce.number().int().positive().default(5000),
    // Built web app to serve. Defaults to the monorepo's apps/web/dist; served only if it exists.
    WEB_DIST_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
    GEOCODER: z.enum(['geoapify', 'mock']).default('mock'),
    // Empty in .env.example; treat blank as unset.
    GEOAPIFY_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
    // TEMPORARY: enables the token-gated proxy diagnostic. Unset in normal operation.
    DIAG_PROXY_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),
  })
  .refine((env) => env.GEOCODER !== 'geoapify' || env.GEOAPIFY_API_KEY, {
    path: ['GEOAPIFY_API_KEY'],
    message: 'GEOAPIFY_API_KEY is required when GEOCODER=geoapify',
  });
export type Env = z.infer<typeof EnvSchema>;

/** Parses process env once at startup; fails fast with a readable message. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
