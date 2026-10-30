import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    GEOCODER: z.enum(['geoapify', 'mock']).default('mock'),
    // Empty in .env.example; treat blank as unset.
    GEOAPIFY_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
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
