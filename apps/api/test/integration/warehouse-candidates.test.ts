// SQL ↔ matcher parity for warehouse matching against real PostGIS: candidate retrieval →
// spatial distance → hard feasibility → scoring → ranking. The SQL applies only status and the
// radius; matching/warehouse.ts owns every other rule and all scoring.
import { addDays, straightLineMiles, toCalendarDate, utcStartOfDay } from '@deadspace/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildSeedWarehouseSpaces } from '../../prisma/seed-data/warehouse-spaces.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { ROAD_FACTOR } from '../../src/matching/config.js';
import { estRoadMiles } from '../../src/matching/metrics.js';
import { checkWarehouseFeasibility, rankWarehouseSpaces } from '../../src/matching/warehouse.js';
import { findWarehouseCandidates, METERS_PER_MILE } from '../../src/repositories/geo.repository.js';
import { createStorageRequest, toStorageMatchRequest } from '../../src/repositories/storage-request.repository.js';
import {
  createWarehouseSpace,
  toWarehouseSpaceCreateData,
  toWarehouseSpaceFacts,
} from '../../src/repositories/warehouse-space.repository.js';
import { createTestPrisma, DALLAS, daysFromToday, storageRequestInput, warehouseSpaceInput } from './helpers.js';

const prisma = createTestPrisma();

const FORT_WORTH = { label: 'Fort Worth, TX, United States', lat: 32.7555, lng: -97.3308 };
const IRVING = { label: 'Irving, TX, United States', lat: 32.814, lng: -96.9489 };

/**
 * PostGIS measures on the WGS84 ellipsoid; the haversine helper uses a mean-radius sphere. Over a
 * few hundred miles the two differ by well under 0.5% (Earth's flattening is ~0.34%), the same
 * bound the transport tests use.
 */
const SPHERE_VS_ELLIPSOID_TOLERANCE = 0.005;

beforeEach(async () => {
  await prisma.warehouseSpace.deleteMany();
  await prisma.storageRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const spaceIds = async (requestId: string) => (await findWarehouseCandidates(prisma, requestId)).map((c) => c.spaceId);

/** ST_Distance in miles between a stored space and a stored request (independent of the candidate query). */
async function postgisMiles(spaceId: string, requestId: string): Promise<number> {
  const [row] = await prisma.$queryRaw<{ miles: number }[]>`
    SELECT ST_Distance(w."locationGeog", r."locationGeog") / ${METERS_PER_MILE}::float8 AS miles
    FROM "WarehouseSpace" w, "StorageRequest" r WHERE w.id = ${spaceId} AND r.id = ${requestId}`;
  return row!.miles;
}

/** The point `meters` due north of a stored request, computed by PostGIS on the ellipsoid. */
async function pointNorthOf(requestId: string, meters: number) {
  const [row] = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(p::geometry) AS lat, ST_X(p::geometry) AS lng
    FROM (SELECT ST_Project("locationGeog", ${meters}::float8, 0) AS p FROM "StorageRequest" WHERE id = ${requestId}) q`;
  return { label: 'Test point', lat: row!.lat, lng: row!.lng };
}

describe('findWarehouseCandidates (real PostGIS)', () => {
  it('retrieves a space inside the radius with the PostGIS distance the matcher uses', async () => {
    const space = await createWarehouseSpace(prisma, warehouseSpaceInput({ location: IRVING }));
    const request = await createStorageRequest(prisma, storageRequestInput({ maxDistanceMiles: 25 }));
    const [candidate, ...rest] = await findWarehouseCandidates(prisma, request.id);

    expect(rest).toEqual([]);
    expect(candidate?.spaceId).toBe(space.id);
    expect(candidate!.straightLineMiles).toBe(await postgisMiles(space.id, request.id));
    const haversine = straightLineMiles(DALLAS, IRVING);
    expect(candidate!.straightLineMiles).toBeGreaterThan(haversine * (1 - SPHERE_VS_ELLIPSOID_TOLERANCE));
    expect(candidate!.straightLineMiles).toBeLessThan(haversine * (1 + SPHERE_VS_ELLIPSOID_TOLERANCE));
    expect(
      checkWarehouseFeasibility(toStorageMatchRequest(request), {
        space: toWarehouseSpaceFacts(space),
        straightLineMiles: candidate!.straightLineMiles,
      }),
    ).toEqual([]);
  });

  it('returns a co-located space at distance 0', async () => {
    const space = await createWarehouseSpace(prisma, warehouseSpaceInput());
    const request = await createStorageRequest(prisma, storageRequestInput());
    expect(await findWarehouseCandidates(prisma, request.id)).toEqual([{ spaceId: space.id, straightLineMiles: 0 }]);
  });

  it('excludes spaces outside the radius and closed spaces', async () => {
    const inside = await createWarehouseSpace(prisma, warehouseSpaceInput());
    await createWarehouseSpace(prisma, warehouseSpaceInput({ location: FORT_WORTH })); // ~37 est. mi
    const closed = await createWarehouseSpace(prisma, warehouseSpaceInput());
    await prisma.warehouseSpace.update({ where: { id: closed.id }, data: { status: 'CLOSED' } });
    const request = await createStorageRequest(prisma, storageRequestInput({ maxDistanceMiles: 25 }));

    expect(await spaceIds(request.id)).toEqual([inside.id]);
  });

  it('returns [] for an unknown request', async () => {
    await createWarehouseSpace(prisma, warehouseSpaceInput());
    expect(await findWarehouseCandidates(prisma, 'no-such-request')).toEqual([]);
  });

  it('agrees with the matcher on every space around the exact radius boundary', async () => {
    const radius = 25;
    const request = await createStorageRequest(prisma, storageRequestInput({ maxDistanceMiles: radius }));
    const boundaryMeters = (radius / ROAD_FACTOR) * METERS_PER_MILE;
    // From 5 m inside to 5 m outside the boundary, including (to float precision) the boundary itself.
    const offsets = [-5, -2, -1, -0.01, 0, 0.01, 1, 2, 5];
    const spaces = [];
    for (const offset of offsets) {
      const location = await pointNorthOf(request.id, boundaryMeters + offset);
      spaces.push({ offset, row: await createWarehouseSpace(prisma, warehouseSpaceInput({ location })) });
    }

    const retrieved = new Set(await spaceIds(request.id));
    const matchRequest = toStorageMatchRequest(request);
    for (const { offset, row } of spaces) {
      const miles = await postgisMiles(row.id, request.id);
      const matcherAccepts = checkWarehouseFeasibility(matchRequest, {
        space: toWarehouseSpaceFacts(row),
        straightLineMiles: miles,
      }).every((code) => code !== 'TOO_FAR');
      expect({ offset, retrieved: retrieved.has(row.id) }).toEqual({ offset, retrieved: matcherAccepts });
      // Even 1 cm (≈ 0.0000075 est. mi) either side is decided correctly, well above float noise.
      if (offset !== 0) expect(retrieved.has(row.id)).toBe(offset < 0);
    }
    // The 0-offset point really is at the boundary (within a millionth of a mile), not merely near it.
    const atBoundary = spaces.find((s) => s.offset === 0)!;
    expect(Math.abs(estRoadMiles(await postgisMiles(atBoundary.row.id, request.id)) - radius)).toBeLessThan(1e-6);
  });

  it('leaves date, quantity, minimum and feature rules to the matcher', async () => {
    const request = await createStorageRequest(
      prisma,
      storageRequestInput({ pallets: 40, needsTemperatureControl: true, needsFoodGrade: true }),
    );
    const cases = {
      INSUFFICIENT_PALLETS: { quantityAvailable: 39, temperatureControlled: true, foodGrade: true },
      BELOW_MIN_PALLETS: { minPallets: 50, temperatureControlled: true, foodGrade: true },
      BELOW_MIN_DURATION: { minStorageDays: 45, temperatureControlled: true, foodGrade: true },
      WINDOW_NOT_COVERED: { availableTo: daysFromToday(36), temperatureControlled: true, foodGrade: true },
      MISSING_TEMPERATURE_CONTROL: { foodGrade: true },
      MISSING_FOOD_GRADE: { temperatureControlled: true },
    } as const;
    const created = new Map<string, string>();
    for (const [code, overrides] of Object.entries(cases)) {
      const row = await createWarehouseSpace(prisma, warehouseSpaceInput(overrides));
      created.set(row.id, code);
    }

    const candidates = await findWarehouseCandidates(prisma, request.id);
    expect(new Set(candidates.map((c) => c.spaceId))).toEqual(new Set(created.keys()));
    const rows = await prisma.warehouseSpace.findMany();
    for (const row of rows) {
      const { straightLineMiles: miles } = candidates.find((c) => c.spaceId === row.id)!;
      const rejections = checkWarehouseFeasibility(toStorageMatchRequest(request), {
        space: toWarehouseSpaceFacts(row),
        straightLineMiles: miles,
      });
      expect(rejections).toEqual([created.get(row.id)]);
    }
  });
});

describe('seeded warehouses end to end (PostGIS → matcher)', () => {
  // The seed's reference request: Dallas, 40 pallets, move in on day 7 and out on day 37, 25 mi radius.
  async function seedAndRequest() {
    const anchor = addDays(utcStartOfDay(new Date()), 1);
    const seeds = await buildSeedWarehouseSpaces(anchor, new MockGeocoder());
    for (const { id, input } of seeds) {
      await prisma.warehouseSpace.create({ data: { id, ...toWarehouseSpaceCreateData(input) } });
    }
    const request = await createStorageRequest(
      prisma,
      storageRequestInput({
        maxDistanceMiles: 25,
        pallets: 40,
        startDate: toCalendarDate(addDays(anchor, 7)),
        endDate: toCalendarDate(addDays(anchor, 37)),
      }),
    );
    return { seeds, request };
  }

  const id = (key: string) => `seed-warehouse-space-${key}`;

  it('retrieves exactly the seeded sites inside the radius, with PostGIS distances close to haversine', async () => {
    const { seeds, request } = await seedAndRequest();
    const candidates = await findWarehouseCandidates(prisma, request.id);

    expect(candidates.map((c) => c.spaceId)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09'].map(id));
    for (const c of candidates) {
      const seed = seeds.find((s) => s.id === c.spaceId)!;
      const haversine = straightLineMiles(DALLAS, seed.input.location);
      expect(Math.abs(c.straightLineMiles - haversine)).toBeLessThanOrEqual(haversine * SPHERE_VS_ELLIPSOID_TOLERANCE);
    }
  });

  it('feeds the matcher to the expected feasible set, exclusions and ranking', async () => {
    const { request } = await seedAndRequest();
    const candidateRows = await findWarehouseCandidates(prisma, request.id);
    const rows = new Map(
      (await prisma.warehouseSpace.findMany({ where: { id: { in: candidateRows.map((c) => c.spaceId) } } })).map(
        (row) => [row.id, row],
      ),
    );
    const candidates = candidateRows.map(({ spaceId, straightLineMiles: miles }) => ({
      space: toWarehouseSpaceFacts(rows.get(spaceId)!),
      straightLineMiles: miles,
    }));
    const matchRequest = toStorageMatchRequest(request);

    const rejections = Object.fromEntries(
      candidates.map((c) => [c.space.id, checkWarehouseFeasibility(matchRequest, c)]),
    );
    expect(rejections).toEqual({
      [id('01')]: [],
      [id('02')]: [],
      [id('03')]: [],
      [id('04')]: [],
      [id('05')]: ['BELOW_MIN_PALLETS'],
      [id('06')]: ['INSUFFICIENT_PALLETS'],
      [id('07')]: ['BELOW_MIN_DURATION'],
      [id('08')]: ['WINDOW_NOT_COVERED'],
      [id('09')]: ['WINDOW_NOT_COVERED'],
    });

    // Same ranking and scores as the haversine-based unit test: no seeded site is near a boundary.
    const matches = rankWarehouseSpaces(matchRequest, candidates);
    expect(matches.map((m) => [m.spaceId, m.score])).toEqual([
      [id('01'), 72],
      [id('04'), 65],
      [id('02'), 59],
      [id('03'), 49],
    ]);
    for (const m of matches) expect(m.metrics.priceReference).toEqual({ basis: 'MATCH_MEDIAN', amount: 990 });
  });
});
