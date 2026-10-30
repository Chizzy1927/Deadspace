import type { ApiErrorResponse } from '@deadspace/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (req, res) => {
  const body: ApiErrorResponse = { error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } };
  res.status(404).json(body);
};

// Express identifies error handlers by their 4-argument signature, so `_next` must stay.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const body: ApiErrorResponse = { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };
  res.status(500).json(body);
};
