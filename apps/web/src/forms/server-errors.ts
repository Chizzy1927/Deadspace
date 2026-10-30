import type { ValidationIssues } from '@deadspace/shared';
import { ApiError } from '../api/client';

type SetFieldError<F extends string> = (field: F, error: { message: string }) => void;

/**
 * Puts API validation issues onto form fields. An issue maps by the first segment of its dot-joined
 * path (e.g. "origin.lat" → "origin"), only if that segment is one of `fields`. Returns the issues that
 * matched no field, so the caller can show them as a form-level error instead of dropping them.
 */
export function applyServerIssues<F extends string>(
  issues: ValidationIssues,
  fields: readonly F[],
  setError: SetFieldError<F>,
): ValidationIssues {
  const unmapped: ValidationIssues = [];
  for (const issue of issues) {
    const head = issue.path.split('.')[0] ?? '';
    const field = fields.find((f) => f === head);
    if (field) setError(field, { message: issue.message });
    else unmapped.push(issue);
  }
  return unmapped;
}

/**
 * Handles a failed form submission: field-level API issues go onto their fields; returns the
 * form-level message for everything else, or null when every problem was shown on a field.
 */
export function submitErrorMessage<F extends string>(
  error: Error,
  fields: readonly F[],
  setError: SetFieldError<F>,
): string | null {
  if (!(error instanceof ApiError) || error.issues.length === 0) return error.message;
  const unmapped = applyServerIssues(error.issues, fields, setError);
  return unmapped.length > 0 ? unmapped.map((i) => i.message).join(' ') : null;
}
