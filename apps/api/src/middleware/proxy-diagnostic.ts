import { createHash, timingSafeEqual } from 'node:crypto';
import { isIPv6 } from 'node:net';
import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

// TEMPORARY production diagnostic: shows the proxy chain Express actually receives, to explain why the
// rate-limit key does not match the client address. Mounted only when DIAG_PROXY_TOKEN is set. Remove
// this file, its mount in app.ts, the env entry and its test once the chain is understood.

function tokenMatches(supplied: string | undefined, expected: string): boolean {
  if (supplied === undefined) return false;
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Same recipe express-rate-limit uses for the `pk` in its RateLimit-Policy header. */
function partitionKey(key: string): string {
  return Buffer.from(createHash('sha256').update(key).digest('hex').slice(0, 12)).toString('base64');
}

export function proxyDiagnosticRouter(token: string): Router {
  const router = Router();
  // Own default-keyed limiter so its RateLimit-Policy `pk` is produced by the library itself. Separate from
  // every real limiter; the high limit means it never blocks the diagnostic.
  const limiter = rateLimit({ limit: 1000, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false });

  router.get(
    '/_diag/proxy',
    (req, res, next) => {
      // Missing or wrong token: fall through to the ordinary JSON 404, indistinguishable from no route.
      if (!tokenMatches(req.header('x-diag-token'), token)) return next('router');
      next();
    },
    limiter,
    (req, res) => {
      const ip = req.ip ?? '';
      const key = ipKeyGenerator(ip, 56);
      const xff = req.header('x-forwarded-for');
      res.set('Cache-Control', 'no-store');
      res.json({
        trustProxySetting: req.app.get('trust proxy') as unknown,
        socketRemoteAddress: req.socket.remoteAddress ?? null,
        reqIp: req.ip ?? null,
        reqIps: req.ips,
        xForwardedFor: xff ?? null,
        xForwardedForEntries: xff === undefined ? 0 : xff.split(',').length,
        reqIpIsIPv6: isIPv6(ip),
        limiterKey: key,
        partitionKey: partitionKey(key),
      });
    },
  );
  return router;
}
