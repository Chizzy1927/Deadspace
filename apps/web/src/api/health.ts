import { HealthResponseSchema, type HealthResponse } from '@deadspace/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/** 503 still carries a valid health body (status: degraded), so both are parsed. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`, { signal: signal ?? null });
  if (!res.ok && res.status !== 503) throw new Error(`Health check failed with HTTP ${res.status}`);
  return HealthResponseSchema.parse(await res.json());
}
