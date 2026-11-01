import { z } from 'zod';

/** Machine-readable error codes returned in `{ error: { code } }`. */
export const ApiErrorCode = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'RATE_LIMITED',
  'FEATURE_DISABLED',
  'DEMO_FULL',
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** `details` of a VALIDATION_ERROR: one entry per issue; `path` is dot-joined (e.g. "pickup.lat"). */
export const ValidationIssuesSchema = z.array(z.object({ path: z.string(), message: z.string() }));
export type ValidationIssues = z.infer<typeof ValidationIssuesSchema>;

/** Every API error response has this shape. */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/** GET /api/health: liveness plus a database/PostGIS check. */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), postgisVersion: z.string() }),
    z.object({ status: z.literal('error'), message: z.string() }),
  ]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * GET /api/demo-config: public-demo switches the web app needs at runtime. Supply creation is off in
 * the deployed portfolio demo (the API refuses it with FEATURE_DISABLED); the forms explain that up front.
 */
export const DemoConfigSchema = z.object({ listingCreationEnabled: z.boolean() });
export type DemoConfig = z.infer<typeof DemoConfigSchema>;
