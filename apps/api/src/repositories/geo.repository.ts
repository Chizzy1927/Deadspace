// The only module allowed to run raw SQL (PostGIS). See CLAUDE.md.
import type { PrismaClient } from '../db.js';
import { AVG_SPEED_MPH, ROAD_FACTOR } from '../matching/config.js';
import type { LegRequestDistances } from '../matching/metrics.js';

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

export interface TruckLegCandidateRow {
  legId: string;
  /** Straight-line (geodesic) miles computed by PostGIS from the stored geography columns. */
  distances: LegRequestDistances;
}

/**
 * Truck legs that may serve a persisted transport request, with the straight-line distances the
 * matcher needs, ordered by id. Applies the hard constraints in SQL so infeasible legs never leave
 * the database: status, trailer type, spare capacity, the arrival-adjusted pickup-window overlap
 * and the exact detour limit (same formulas as matching/truck.ts, which re-checks every rule and
 * also applies the deliver-by/arrive-by deadlines). Returns [] if the request doesn't exist.
 *
 * Spatial strategy: the exact detour d(O,P) + d(P,D) + d(D,X) − d(O,X) is computed with
 * ST_Distance on the generated geography columns. A radius pre-filter such as
 * ST_DWithin(origin, pickup, maxDetour) is deliberately not used: it is not a valid bound, since a
 * leg can pass straight through the pickup from far away (e.g. Oklahoma City → Houston serving
 * Dallas → Houston). The detour step is therefore not GiST-assisted; the B-tree-friendly filters
 * run first. A corridor index can be added if listing volume ever requires it.
 */
export async function findTruckLegCandidates(prisma: PrismaClient, requestId: string): Promise<TruckLegCandidateRow[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      originToPickup: number;
      pickupToDropoff: number;
      dropoffToDestination: number;
      originToDestination: number;
    }[]
  >`
    WITH c AS (
      SELECT l.id, l."maxDetourMiles", l."departureEarliest", l."departureLatest",
             r."pickupEarliest", r."pickupLatest",
             ST_Distance(l."originGeog", r."pickupGeog") / ${METERS_PER_MILE}::float8 AS "originToPickup",
             ST_Distance(r."pickupGeog", r."dropoffGeog") / ${METERS_PER_MILE}::float8 AS "pickupToDropoff",
             ST_Distance(r."dropoffGeog", l."destinationGeog") / ${METERS_PER_MILE}::float8 AS "dropoffToDestination",
             ST_Distance(l."originGeog", l."destinationGeog") / ${METERS_PER_MILE}::float8 AS "originToDestination"
      FROM "TruckLeg" l
      JOIN "TransportRequest" r ON r.id = ${requestId}
      WHERE l.status = 'ACTIVE'
        AND l."trailerType" = r."trailerType"
        AND l."totalPallets" - l."committedPallets" >= r.pallets
        AND l."totalWeightLbs" - l."committedWeightLbs" >= r."weightLbs"
        -- Necessary for the arrival-adjusted overlap below (drive time >= 0), and index-friendly.
        AND l."departureEarliest" <= r."pickupLatest"
    )
    SELECT id, "originToPickup", "pickupToDropoff", "dropoffToDestination", "originToDestination"
    FROM c
    WHERE ("originToPickup" + "pickupToDropoff" + "dropoffToDestination" - "originToDestination")
            * ${ROAD_FACTOR}::float8 <= "maxDetourMiles"
      AND "departureEarliest" + make_interval(secs => "originToPickup" * ${ROAD_FACTOR}::float8 / ${AVG_SPEED_MPH}::float8 * 3600)
            <= "pickupLatest"
      AND "departureLatest" + make_interval(secs => "originToPickup" * ${ROAD_FACTOR}::float8 / ${AVG_SPEED_MPH}::float8 * 3600)
            >= "pickupEarliest"
    ORDER BY id`;
  return rows.map(({ id, ...distances }) => ({ legId: id, distances }));
}

export interface WarehouseCandidateRow {
  spaceId: string;
  /** Straight-line (geodesic) miles from the request's location, computed by PostGIS. */
  straightLineMiles: number;
}

/**
 * Active warehouse spaces within a persisted storage request's search radius, with the
 * straight-line distance the matcher needs, ordered by id. Returns [] if the request doesn't exist.
 *
 * Only status and the radius are applied here. Dates, quantity, minimum block, minimum stay and
 * features are left to matching/warehouse.ts, the single authority on feasibility.
 *
 * Radius semantics match checkWarehouseFeasibility exactly: the radius is est. road miles, and a
 * space is kept iff miles × ROAD_FACTOR ≤ maxDistanceMiles, where `miles` is the same float8 value
 * returned to the matcher (so both sides compute the identical product). ST_DWithin is a
 * GiST-assisted pre-filter only, widened by 1 m so floating-point differences between it and
 * ST_Distance can never drop a space the exact check keeps. (Unlike the truck detour, a radius
 * around a fixed point is a valid spatial bound.)
 */
export async function findWarehouseCandidates(
  prisma: PrismaClient,
  requestId: string,
): Promise<WarehouseCandidateRow[]> {
  const rows = await prisma.$queryRaw<{ id: string; straightLineMiles: number }[]>`
    WITH c AS (
      SELECT w.id, r."maxDistanceMiles",
             ST_Distance(w."locationGeog", r."locationGeog") / ${METERS_PER_MILE}::float8 AS "straightLineMiles"
      FROM "WarehouseSpace" w
      JOIN "StorageRequest" r ON r.id = ${requestId}
      WHERE w.status = 'ACTIVE'
        AND ST_DWithin(
              w."locationGeog", r."locationGeog",
              r."maxDistanceMiles" / ${ROAD_FACTOR}::float8 * ${METERS_PER_MILE}::float8 + 1
            )
    )
    SELECT id, "straightLineMiles"
    FROM c
    WHERE "straightLineMiles" * ${ROAD_FACTOR}::float8 <= "maxDistanceMiles"
    ORDER BY id`;
  return rows.map(({ id, straightLineMiles }) => ({ spaceId: id, straightLineMiles }));
}
