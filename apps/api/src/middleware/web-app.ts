import path from 'node:path';
import express, { type RequestHandler, type Router } from 'express';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Marks every response as not-for-indexing: the demo's fictional carriers must not surface in search. */
export const noIndex: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
};

/**
 * Serves the built Vite SPA from `webDist`: hashed assets are cached for a year, everything else
 * (index.html, robots.txt, favicon) revalidates. Client-side routes fall back to index.html so deep
 * links and hard refreshes work. `/api` paths and missing files (anything with an extension) are
 * never rewritten to the SPA: they fall through to the API's JSON 404.
 */
export function webAppRouter(webDist: string): Router {
  const router = express.Router();
  const indexFile = path.join(webDist, 'index.html');

  router.use(
    express.static(webDist, {
      index: false,
      setHeaders(res, filePath) {
        const isHashedAsset = path.dirname(filePath) === path.join(webDist, 'assets');
        res.setHeader('Cache-Control', isHashedAsset ? `public, max-age=${ONE_YEAR_SECONDS}, immutable` : 'no-cache');
      },
    }),
  );

  router.get(/.*/, (req, res, next) => {
    const isApi = req.path === '/api' || req.path.startsWith('/api/');
    if (isApi || path.extname(req.path) !== '') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile, (err) => err && next(err));
  });

  return router;
}
