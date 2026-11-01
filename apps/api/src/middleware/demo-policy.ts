import type { ApiErrorCode, ApiErrorResponse } from '@deadspace/shared';
import type { RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';

/** Public-demo write controls. Tunable product policy, not security: V1 has no auth. */
export interface DemoPolicy {
  /** When false, truck-leg and warehouse-space creation is refused (read-only supply side). */
  listingCreationEnabled: boolean;
  /** Creates allowed per client IP per window, counted separately for each creation route. */
  writeRateLimit: { limit: number; windowMs: number };
  /** Refuse new rows once a table already holds this many (bounds DB growth). */
  maxRowsPerTable: number;
}

function sendError(res: Response, status: number, code: ApiErrorCode, message: string) {
  const body: ApiErrorResponse = { error: { code, message } };
  res.status(status).json(body);
}

const passThrough: RequestHandler = (_req, _res, next) => next();

/** Guards for POST creation routes. Without a policy (local dev, tests) every guard is a no-op. */
export function createWriteGuards(policy?: DemoPolicy) {
  return {
    /** Supply-side (listing) routes only. */
    listing(): RequestHandler {
      if (!policy || policy.listingCreationEnabled) return passThrough;
      return (_req, res) =>
        sendError(res, 403, 'FEATURE_DISABLED', 'Creating listings is disabled in this public demo');
    },
    /** Every call returns a limiter with its own counters, so each route gets an independent budget. */
    rateLimit(): RequestHandler {
      if (!policy) return passThrough;
      return rateLimit({
        limit: policy.writeRateLimit.limit,
        windowMs: policy.writeRateLimit.windowMs,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_req, res) =>
          sendError(res, 429, 'RATE_LIMITED', 'This demo limits how much one visitor can create; try again later'),
      });
    },
    rowCap(count: () => Promise<number>): RequestHandler {
      if (!policy) return passThrough;
      const max = policy.maxRowsPerTable;
      return async (_req, res, next) => {
        if ((await count()) >= max) {
          return sendError(res, 503, 'DEMO_FULL', 'The demo has reached its storage limit; please try again later');
        }
        next();
      };
    },
  };
}
