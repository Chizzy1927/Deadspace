import {
  ApiErrorResponseSchema,
  type ApiErrorCode,
  ValidationIssuesSchema,
  type ValidationIssues,
} from '@deadspace/shared';
import type { z } from 'zod';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/** A non-2xx API response, carrying the standard `{ error: { code, message, details? } }` body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'UNKNOWN',
    message: string,
    readonly issues: ValidationIssues = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Fetches JSON from the API and validates the response body with a shared schema. */
export async function apiFetch<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.output<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(res.status, 'UNKNOWN', `Request failed with HTTP ${res.status}`);
    const { code, message, details } = parsed.data.error;
    const issues = ValidationIssuesSchema.safeParse(details);
    throw new ApiError(res.status, code, message, issues.success ? issues.data : []);
  }
  return schema.parse(body);
}
