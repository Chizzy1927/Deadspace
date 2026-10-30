// The only module allowed to run raw SQL (PostGIS). See CLAUDE.md.
import type { PrismaClient } from '../db.js';

/** Returns the installed PostGIS version; throws if the DB is unreachable or PostGIS is missing. */
export async function getPostgisVersion(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT PostGIS_Version() AS version`;
  const version = rows[0]?.version;
  if (!version) throw new Error('PostGIS_Version() returned no rows');
  return version;
}

export const METERS_PER_MILE = 1609.344;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TruckLegGeography {
  /** Points read back from the generated geography columns (not the lat/lng columns). */
  origin: LatLng;
  destination: LatLng;
  /** Geodesic (straight-line) origin -> destination distance computed by PostGIS. */
  straightLineMiles: number;
}

/** What PostGIS stores for a truck leg, or null if the leg doesn't exist. */
export async function getTruckLegGeography(prisma: PrismaClient, id: string): Promise<TruckLegGeography | null> {
  const rows = await prisma.$queryRaw<{ oLat: number; oLng: number; dLat: number; dLng: number; meters: number }[]>`
    SELECT ST_Y("originGeog"::geometry) AS "oLat", ST_X("originGeog"::geometry) AS "oLng",
           ST_Y("destinationGeog"::geometry) AS "dLat", ST_X("destinationGeog"::geometry) AS "dLng",
           ST_Distance("originGeog", "destinationGeog") AS meters
    FROM "TruckLeg" WHERE id = ${id}`;
  const row = rows[0];
  if (!row) return null;
  return {
    origin: { lat: row.oLat, lng: row.oLng },
    destination: { lat: row.dLat, lng: row.dLng },
    straightLineMiles: row.meters / METERS_PER_MILE,
  };
}
