import { z } from 'zod';

/** A geocoding result, independent of the vendor that produced it. */
export const PlaceSchema = z.object({
  label: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Name of the geocoder that produced the result (e.g. "geoapify", "mock"). */
  provider: z.string(),
  /** Opaque provider identifier; useful for de-duplication, never persisted. */
  providerPlaceId: z.string().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;
