import { z } from 'zod';

/** Lifecycle of every listing and request. */
export const Status = z.enum(['ACTIVE', 'CLOSED']);
export type Status = z.infer<typeof Status>;

/** A geocoded location as submitted by a form. Only label + coordinates are ever stored. */
export const LocationSchema = z.object({
  label: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Location = z.infer<typeof LocationSchema>;

/** Who to contact about a listing or request (no accounts in V1). */
export const ContactSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.email().max(254),
});
export type Contact = z.infer<typeof ContactSchema>;

/** ISO 8601 timestamp with an explicit offset (or Z) on the wire, parsed to a Date. */
export const IsoDateTimeInput = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

/** Optional free-text notes. */
export const NotesSchema = z.string().trim().max(1000).optional();

/** USD amount with at most two decimal places. */
export const UsdAmountSchema = z.number().positive().max(1_000_000).multipleOf(0.01);

/** Injectable clock so "now"-relative rules are deterministic in tests. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Mean Earth radius in statute miles (IUGG mean radius, 6371.0088 km). */
const EARTH_RADIUS_MILES = 3958.7613;

/**
 * Great-circle (haversine) distance in miles, for input validation on client and server.
 * Within ~0.5% of PostGIS's ellipsoidal geography distance, which remains the source of truth for
 * matching distances (computed in geo.repository.ts).
 */
export function straightLineMiles(a: Pick<Location, 'lat' | 'lng'>, b: Pick<Location, 'lat' | 'lng'>): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
