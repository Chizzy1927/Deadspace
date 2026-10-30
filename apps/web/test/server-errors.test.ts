import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/client';
import { applyServerIssues, submitErrorMessage } from '../src/forms/server-errors';

const FIELDS = ['origin', 'committedPallets', 'departureLatest'] as const;

function recorder() {
  const calls: [string, string][] = [];
  return { calls, setError: (field: string, { message }: { message: string }) => calls.push([field, message]) };
}

describe('applyServerIssues', () => {
  it('maps issues by the first path segment and returns the unmapped ones', () => {
    const { calls, setError } = recorder();
    const unmapped = applyServerIssues(
      [
        { path: 'origin.lat', message: 'Too small' },
        { path: 'committedPallets', message: 'Committed pallets must be less than total pallets' },
        { path: '', message: 'Body must be an object' },
        { path: 'somethingElse', message: 'Unknown' },
      ],
      FIELDS,
      setError,
    );

    expect(calls).toEqual([
      ['origin', 'Too small'],
      ['committedPallets', 'Committed pallets must be less than total pallets'],
    ]);
    expect(unmapped.map((i) => i.path)).toEqual(['', 'somethingElse']);
  });
});

describe('submitErrorMessage', () => {
  it('returns null when every validation issue landed on a field', () => {
    const { calls, setError } = recorder();
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', [
      { path: 'departureLatest', message: 'Departure window must end in the future' },
    ]);

    expect(submitErrorMessage(error, FIELDS, setError)).toBeNull();
    expect(calls).toEqual([['departureLatest', 'Departure window must end in the future']]);
  });

  it('surfaces unmapped issues and non-validation errors at form level', () => {
    const { setError } = recorder();
    const unmapped = new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', [{ path: 'x', message: 'Bad x' }]);

    expect(submitErrorMessage(unmapped, FIELDS, setError)).toBe('Bad x');
    expect(submitErrorMessage(new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'), FIELDS, setError)).toBe(
      'Internal server error',
    );
    expect(submitErrorMessage(new TypeError('Failed to fetch'), FIELDS, setError)).toBe('Failed to fetch');
  });
});
