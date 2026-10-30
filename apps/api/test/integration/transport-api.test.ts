import {
  ApiErrorResponseSchema,
  TransportMatchesResponseSchema,
  TransportRequestSchema,
  TruckLegSchema,
} from '@deadspace/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { TRUCK_SCORE_WEIGHTS } from '../../src/matching/config.js';
import { weightedScore } from '../../src/matching/truck-score.js';
import { createTruckLeg, toTruckLegCreateData } from '../../src/repositories/truck-leg.repository.js';
import { buildSeedTruckLegs, defaultSeedAnchor } from '../../prisma/seed-data/truck-legs.js';
import { createTestApp, createTestPrisma, DALLAS, HOUSTON, truckLegInput } from './helpers.js';

const prisma = createTestPrisma();
const app = createTestApp(prisma);

const FORT_WORTH = { label: 'Fort Worth, TX, United States', lat: 32.7555, lng: -97.3308 };
const BEAUMONT = { label: 'Beaumont, TX, United States', lat: 30.0802, lng: -94.1266 };

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** Wire payload exactly as the web form sends it. */
const requestPayload = (overrides: Record<string, unknown> = {}) => ({
  companyName: 'Acme Goods',
  contactName: 'Sam Lee',
  contactEmail: 'sam@acme.example.com',
  pickup: DALLAS,
  dropoff: HOUSTON,
  pickupEarliest: hoursFromNow(20),
  pickupLatest: hoursFromNow(32),
  trailerType: 'DRY_VAN',
  pallets: 6,
  weightLbs: 9_000,
  maxBudget: 700,
  ...overrides,
});

beforeEach(async () => {
  await prisma.truckLeg.deleteMany();
  await prisma.transportRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('transport requests API (real PostGIS)', () => {
  it('persists a valid request and serves it back', async () => {
    const created = await request(app).post('/api/transport-requests').send(requestPayload());

    expect(created.status).toBe(201);
    const body = TransportRequestSchema.parse(created.body);
    expect(body).toMatchObject({ status: 'ACTIVE', pickup: DALLAS, dropoff: HOUSTON, pallets: 6, maxBudget: 700 });
    const stored = await prisma.transportRequest.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.pickupLabel).toBe(DALLAS.label);
    expect(stored.maxBudget?.toNumber()).toBe(700);

    const fetched = await request(app).get(`/api/transport-requests/${body.id}`);
    expect(fetched.status).toBe(200);
    expect(TransportRequestSchema.parse(fetched.body)).toEqual(body);
  });

  it('rejects an invalid request with field details and stores nothing', async () => {
    const res = await request(app)
      .post('/api/transport-requests')
      .send(requestPayload({ dropoff: { ...DALLAS, label: 'Dallas again' } }));

    expect(res.status).toBe(400);
    const { error } = ApiErrorResponseSchema.parse(res.body);
    expect(error.details).toEqual([{ path: 'dropoff', message: 'Dropoff must be at least 10 miles from pickup' }]);
    expect(await prisma.transportRequest.count()).toBe(0);
  });

  it('returns 404 for an unknown request and its matches', async () => {
    for (const path of ['/api/transport-requests/nope', '/api/transport-requests/nope/matches']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    }
  });
});

describe('truck legs API (real PostGIS)', () => {
  it('creates and fetches a leg', async () => {
    const payload = {
      ...requestPayload(),
      origin: DALLAS,
      destination: HOUSTON,
      departureEarliest: hoursFromNow(24),
      departureLatest: hoursFromNow(30),
      loadState: 'EMPTY',
      totalPallets: 26,
      totalWeightLbs: 44_000,
      pricingBasis: 'FLAT',
      priceAmount: 650,
    };
    const created = await request(app).post('/api/truck-legs').send(payload);

    expect(created.status).toBe(201);
    const leg = TruckLegSchema.parse(created.body);
    expect(leg).toMatchObject({ maxDetourMiles: 100, committedPallets: 0, priceAmount: 650 });
    const fetched = await request(app).get(`/api/truck-legs/${leg.id}`);
    expect(TruckLegSchema.parse(fetched.body)).toEqual(leg);
    expect((await request(app).get('/api/truck-legs/nope')).status).toBe(404);
  });
});

describe('create request → get matches (real PostGIS)', () => {
  it('returns feasible legs ranked by route efficiency with metrics and reasons', async () => {
    const onRoute = await createTruckLeg(prisma, truckLegInput());
    const fortWorth = await createTruckLeg(prisma, truckLegInput({ origin: FORT_WORTH }));
    const beaumont = await createTruckLeg(
      prisma,
      truckLegInput({
        destination: BEAUMONT,
        loadState: 'PARTIAL',
        committedPallets: 10,
        committedWeightLbs: 15_000,
        pricingBasis: 'PER_LOADED_MILE',
        priceAmount: 2.75,
      }),
    );
    await createTruckLeg(prisma, truckLegInput({ trailerType: 'FLATBED' }));

    const created = await request(app).post('/api/transport-requests').send(requestPayload());
    const requestId = TransportRequestSchema.parse(created.body).id;
    const res = await request(app).get(`/api/transport-requests/${requestId}/matches`);

    expect(res.status).toBe(200);
    const { request: echoed, matches } = TransportMatchesResponseSchema.parse(res.body);
    expect(echoed.id).toBe(requestId);
    expect(matches.map((m) => m.leg.id)).toEqual([onRoute.id, fortWorth.id, beaumont.id]);

    const [first, second, third] = matches;
    // Phase 3 weighted score (Phase 2 scored route efficiency alone: 100). On-route R = 1; 6 of 26
    // spare pallets; $650 against the $700 budget; ≥ 4 h slack: 55 + 3.46 + 8.57 + 15 = 82.03.
    expect(first?.breakdown).toEqual({ routeEfficiency: 1, capacityFit: 6 / 26, price: 1.5 - 650 / 700, timing: 1 });
    expect(first?.score).toBe(82);
    expect(first?.metrics.estAdditionalMiles).toBe(0);
    expect(first?.metrics.estEmptyMilesRecovered).toBe(first?.metrics.estLoadedMiles);
    expect(first?.reasons).toContain('Est. price $650 (flat rate), within your $700 budget');

    expect(second?.metrics.estAdditionalMiles).toBeGreaterThan(15);
    expect(second?.metrics.estAdditionalMiles).toBeLessThan(30);
    // Route efficiency is 1 − est. additional miles / the fixed 100-mile reference (metrics are
    // rounded to 0.1 mi for output, so compare approximately), and the score is the weighted sum.
    expect(second?.breakdown.routeEfficiency).toBeCloseTo(1 - (second?.metrics.estAdditionalMiles ?? 0) / 100, 3);
    expect(second?.score).toBe(second && weightedScore(second.breakdown, TRUCK_SCORE_WEIGHTS));

    expect(third?.metrics.estEmptyMilesRecovered).toBeNull();
    expect(third?.metrics.palletUtilisation).toEqual({ before: 10 / 26, after: 16 / 26 });
    expect(third?.metrics.estPrice).toBeCloseTo(2.75 * (third?.metrics.estLoadedMiles ?? 0), 0);
    expect(third?.reasons.join('\n')).toMatch(/over your \$700 budget/);
  });
});

describe('seeded scenario: Dallas → Houston (real PostGIS + deterministic seed)', () => {
  it('ranks the on-route seed legs first and excludes infeasible ones with sensible metrics', async () => {
    const anchor = defaultSeedAnchor(new Date());
    const seed = await buildSeedTruckLegs(anchor, new MockGeocoder());
    await prisma.truckLeg.createMany({ data: seed.map(({ id, input }) => ({ id, ...toTruckLegCreateData(input) })) });

    // A dry-van shipment of 6 pallets, ready day 1 between 12:00 and 20:00 UTC.
    const day1 = (hour: number) => new Date(anchor.getTime() + (24 + hour) * 3_600_000).toISOString();
    const created = await request(app)
      .post('/api/transport-requests')
      .send(requestPayload({ pickupEarliest: day1(12), pickupLatest: day1(20), maxBudget: undefined }));
    const res = await request(app).get(
      `/api/transport-requests/${TransportRequestSchema.parse(created.body).id}/matches`,
    );
    const { matches } = TransportMatchesResponseSchema.parse(res.body);

    // Phase 3 weighted scores; the order is unchanged from Phase 2 (scores were 100, 100, 100, 98,
    // 78, 30 under route efficiency alone). No budget, so price is against the $670 median.
    const ranked = matches.map((m) => [m.leg.id.replace('seed-truck-leg-', ''), m.score] as const);
    expect(ranked).toEqual([
      // Dallas → Houston, zero detour. 02 is part-loaded: the request takes half its spare pallets.
      ['02', 87],
      // 07 ($647.42) and 01 ($650) both round to 81; tie broken by est. price.
      ['07', 81],
      ['01', 81],
      // Oklahoma City → Houston passes through Dallas (~2 est. mi) but is the dearest ($1,150).
      ['13', 72],
      // Fort Worth → Houston (~22 est. mi), then Dallas → Beaumont (~70 est. mi).
      ['08', 68],
      ['14', 42],
    ]);

    // Excluded for the intended reasons: 03 reefer, 04 flatbed, 05 departs day 5, 06 only 2 spare
    // pallets, 15/16 wrong direction, 09–12 detours over 100 est. mi.
    const ids = matches.map((m) => m.leg.id);
    for (const key of ['03', '04', '05', '06', '09', '10', '11', '12', '15', '16']) {
      expect(ids).not.toContain(`seed-truck-leg-${key}`);
    }

    const byKey = (key: string) => matches.find((m) => m.leg.id === `seed-truck-leg-${key}`);
    expect(byKey('01')?.metrics.estEmptyMilesRecovered).toBeGreaterThan(260);
    expect(byKey('02')?.metrics.estEmptyMilesRecovered).toBeNull();
    expect(byKey('02')?.reasons).toContain('Your load takes the trailer from 54% to 77% full (by pallets)');
    expect(byKey('13')?.reasons.join('\n')).toMatch(/Can reach your pickup during your pickup window \(est\. 4\.\d h/);
  });
});
