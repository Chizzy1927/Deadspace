import { type ApiErrorResponse, GeocodeSearchQuerySchema, type GeocodeSearchResponse } from '@deadspace/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { type Geocoder, GeocoderError } from '../geocoding/index.js';
import { sendValidationError } from '../middleware/validation.js';

export interface GeocodeRateLimit {
  /** Requests allowed per client IP per window. */
  limit: number;
  windowMs: number;
}

/** Protects the upstream geocoder's quota. A tunable default, not a security control. */
export const DEFAULT_GEOCODE_RATE_LIMIT: GeocodeRateLimit = { limit: 60, windowMs: 60_000 };

/** Autocomplete proxy: keeps the vendor API key server-side. */
export function geocodeRouter(geocoder: Geocoder, { limit, windowMs } = DEFAULT_GEOCODE_RATE_LIMIT): Router {
  const router = Router();
  const limiter = rateLimit({
    limit,
    windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiErrorResponse = {
        error: { code: 'RATE_LIMITED', message: 'Too many location searches; try again shortly' },
      };
      res.status(429).json(body);
    },
  });

  router.get('/geocode/search', limiter, async (req, res) => {
    const parsed = GeocodeSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    try {
      const body: GeocodeSearchResponse = { results: await geocoder.search(parsed.data.q) };
      res.json(body);
    } catch (err) {
      if (!(err instanceof GeocoderError)) throw err;
      console.error(err);
      const body: ApiErrorResponse = { error: { code: 'UPSTREAM_ERROR', message: 'Location search is unavailable' } };
      res.status(502).json(body);
    }
  });
  return router;
}
