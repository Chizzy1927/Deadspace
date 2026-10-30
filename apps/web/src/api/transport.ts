import {
  type CreateTransportRequestInput,
  TransportMatchesResponseSchema,
  TransportRequestSchema,
} from '@deadspace/shared';
import { apiFetch } from './client';

/** Dates serialise to ISO 8601 (UTC) strings, which the shared schema accepts. */
export function createTransportRequest(input: CreateTransportRequestInput) {
  return apiFetch('/api/transport-requests', TransportRequestSchema, { method: 'POST', body: JSON.stringify(input) });
}

export function fetchTransportMatches(requestId: string, signal?: AbortSignal) {
  return apiFetch(`/api/transport-requests/${encodeURIComponent(requestId)}/matches`, TransportMatchesResponseSchema, {
    signal: signal ?? null,
  });
}
