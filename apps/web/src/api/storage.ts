import {
  type CreateStorageRequestInput,
  type CreateStorageRequestPayload,
  type CreateWarehouseSpaceInput,
  type CreateWarehouseSpacePayload,
  StorageMatchesResponseSchema,
  StorageRequestSchema,
  toCalendarDate,
  WarehouseSpaceSchema,
} from '@deadspace/shared';
import { apiFetch } from './client';

// The API takes calendar dates as `YYYY-MM-DD` (not full ISO instants), so the parsed UTC-midnight
// Dates from the form schema are converted back to wire format here.

export function createWarehouseSpace(input: CreateWarehouseSpaceInput) {
  const payload: CreateWarehouseSpacePayload = {
    ...input,
    availableFrom: toCalendarDate(input.availableFrom),
    availableTo: toCalendarDate(input.availableTo),
  };
  return apiFetch('/api/warehouse-spaces', WarehouseSpaceSchema, { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchWarehouseSpace(id: string, signal?: AbortSignal) {
  return apiFetch(`/api/warehouse-spaces/${encodeURIComponent(id)}`, WarehouseSpaceSchema, { signal: signal ?? null });
}

export function createStorageRequest(input: CreateStorageRequestInput) {
  const payload: CreateStorageRequestPayload = {
    ...input,
    startDate: toCalendarDate(input.startDate),
    endDate: toCalendarDate(input.endDate),
  };
  return apiFetch('/api/storage-requests', StorageRequestSchema, { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchStorageRequest(id: string, signal?: AbortSignal) {
  return apiFetch(`/api/storage-requests/${encodeURIComponent(id)}`, StorageRequestSchema, { signal: signal ?? null });
}

export function fetchStorageMatches(requestId: string, signal?: AbortSignal) {
  return apiFetch(`/api/storage-requests/${encodeURIComponent(requestId)}/matches`, StorageMatchesResponseSchema, {
    signal: signal ?? null,
  });
}
