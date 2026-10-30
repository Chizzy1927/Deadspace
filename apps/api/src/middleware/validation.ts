import type { ApiErrorResponse, ValidationIssues } from '@deadspace/shared';
import type { Response } from 'express';
import type { z } from 'zod';

/** 400 VALIDATION_ERROR with one `{ path, message }` per issue. */
export function sendValidationError(res: Response, error: z.ZodError): void {
  const details: ValidationIssues = error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  const body: ApiErrorResponse = { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details } };
  res.status(400).json(body);
}

export function sendNotFound(res: Response, message: string): void {
  const body: ApiErrorResponse = { error: { code: 'NOT_FOUND', message } };
  res.status(404).json(body);
}
