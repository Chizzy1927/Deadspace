import { straightLineMiles } from '@deadspace/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTruckLegGeography } from '../../src/repositories/geo.repository.js';
import { createTransportRequest } from '../../src/repositories/transport-request.repository.js';
import { createTruckLeg } from '../../src/repositories/truck-leg.repository.js';
import { createTestPrisma, DALLAS, HOUSTON, transportRequestInput, truckLegInput } from './helpers.js';

const prisma = createTestPrisma();

const GEOG_COLUMNS = [
  ['TruckLeg', 'originGeog'],
  ['TruckLeg', 'destinationGeog'],
  ['TransportRequest', 'pickupGeog'],
  ['TransportRequest', 'dropoffGeog'],
] as const;

beforeEach(async () => {
  await prisma.truckLeg.deleteMany();
  await prisma.transportRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('generated geography columns', () => {
  it('derives truck-leg points from lat/lng and computes a geodesic distance', async () => {
    const leg = await createTruckLeg(prisma, truckLegInput());
    const geo = await getTruckLegGeography(prisma, leg.id);

    expect(geo?.origin.lat).toBeCloseTo(DALLAS.lat, 9);
    expect(geo?.origin.lng).toBeCloseTo(DALLAS.lng, 9);
    expect(geo?.destination.lat).toBeCloseTo(HOUSTON.lat, 9);
    expect(geo?.destination.lng).toBeCloseTo(HOUSTON.lng, 9);
    // Dallas -> Houston city centres are ~225 straight-line miles apart (spherical estimate 224.8).
    expect(geo?.straightLineMiles).toBeGreaterThan(222);
    expect(geo?.straightLineMiles).toBeLessThan(228);
  });

  it('agrees with the shared haversine validation distance to within 0.5%', async () => {
    const destinations = [
      HOUSTON,
      { label: 'Atlanta, GA, United States', lat: 33.749, lng: -84.388 },
      { label: 'Denver, CO, United States', lat: 39.7392, lng: -104.9903 },
      { label: '~10 mi north of Dallas', lat: DALLAS.lat + 0.1455, lng: DALLAS.lng },
    ];
    for (const destination of destinations) {
      const leg = await createTruckLeg(prisma, truckLegInput({ destination }));
      const postgisMiles = (await getTruckLegGeography(prisma, leg.id))!.straightLineMiles;
      const haversineMiles = straightLineMiles(DALLAS, destination);
      expect(Math.abs(haversineMiles - postgisMiles) / postgisMiles).toBeLessThan(0.005);
    }
  });

  it('recomputes the geography when lat/lng change', async () => {
    const leg = await createTruckLeg(prisma, truckLegInput());
    await prisma.truckLeg.update({
      where: { id: leg.id },
      data: { destinationLat: 32.7555, destinationLng: -97.3308 },
    });

    const geo = await getTruckLegGeography(prisma, leg.id);
    expect(geo?.destination.lat).toBeCloseTo(32.7555, 9);
    expect(geo?.destination.lng).toBeCloseTo(-97.3308, 9);
    // Dallas -> Fort Worth is ~32 straight-line miles.
    expect(geo?.straightLineMiles).toBeGreaterThan(30);
    expect(geo?.straightLineMiles).toBeLessThan(34);
  });

  it('rejects direct writes to a generated geography column', async () => {
    const leg = await createTruckLeg(prisma, truckLegInput());
    await expect(
      prisma.$executeRaw`UPDATE "TruckLeg" SET "originGeog" = ST_MakePoint(0, 0)::geography WHERE id = ${leg.id}`,
      // SQLSTATE 428C9 = generated_always.
    ).rejects.toThrow(/428C9[\s\S]*can only be updated to DEFAULT/);
  });

  it('returns null for an unknown truck leg', async () => {
    expect(await getTruckLegGeography(prisma, 'does-not-exist')).toBeNull();
  });

  it('populates transport-request geography columns on insert', async () => {
    const req = await createTransportRequest(prisma, transportRequestInput());
    // Catalog/introspection query, not app logic; app spatial SQL lives in geo.repository.ts.
    const rows = await prisma.$queryRaw<{ pickupSet: boolean; dropoffSet: boolean }[]>`
      SELECT "pickupGeog" IS NOT NULL AS "pickupSet", "dropoffGeog" IS NOT NULL AS "dropoffSet"
      FROM "TransportRequest" WHERE id = ${req.id}`;
    expect(rows).toEqual([{ pickupSet: true, dropoffSet: true }]);
  });
});

describe('schema catalog', () => {
  it('declares every *Geog column as a STORED generated geography(Point,4326)', async () => {
    const rows = await prisma.$queryRaw<{ table: string; column: string; generated: string; type: string }[]>`
      SELECT c.table_name AS "table", c.column_name AS "column", c.is_generated AS generated,
             format_type(a.atttypid, a.atttypmod) AS type
      FROM information_schema.columns c
      JOIN pg_attribute a ON a.attrelid = format('%I', c.table_name)::regclass AND a.attname = c.column_name
      WHERE c.table_schema = 'public' AND c.column_name LIKE '%Geog'
      ORDER BY 1, 2`;
    expect(rows.map((r) => [r.table, r.column]).sort()).toEqual(GEOG_COLUMNS.map((c) => [...c]).sort());
    for (const row of rows) {
      expect(row.generated).toBe('ALWAYS');
      expect(row.type).toBe('geography(Point,4326)');
    }
  });

  it('has a GiST index on every geography column and the truck-leg filter index', async () => {
    const indexes = await prisma.$queryRaw<{ table: string; def: string }[]>`
      SELECT tablename AS "table", indexdef AS def FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN ('TruckLeg', 'TransportRequest')`;
    for (const [table, column] of GEOG_COLUMNS) {
      expect(indexes.some((i) => i.table === table && i.def.includes(`USING gist ("${column}")`))).toBe(true);
    }
    expect(indexes.some((i) => i.def.includes('USING btree (status, "trailerType", "departureEarliest")'))).toBe(true);
  });
});
