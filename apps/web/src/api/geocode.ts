import { GeocodeSearchResponseSchema } from '@deadspace/shared';
import { apiFetch } from './client';

export async function searchPlaces(query: string, signal?: AbortSignal) {
  const { results } = await apiFetch(
    `/api/geocode/search?q=${encodeURIComponent(query)}`,
    GeocodeSearchResponseSchema,
    {
      signal: signal ?? null,
    },
  );
  return results;
}
