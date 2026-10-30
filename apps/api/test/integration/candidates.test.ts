import { straightLineMiles } from '@deadspace/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { findTruckLegCandidates } from '../../src/repositories/geo.repository.js';
import { createTransportRequest } from '../../src/repositories/transport-request.repository.js';
import { createTruckLeg } from '../../src/repositories/truck-leg.repository.js';
import { createTestPrisma, DALLAS, HOUSTON, transportRequestInput, truckLegInput } from './helpers.js';

const prisma = createTestPrisma();

const OKLAHOMA_CITY = { label: 'Oklahoma City, OK, United States', lat: 35.4676, lng: -97.5164 };
const FORT_WORTH = { label: 'Fort Worth, TX, United States', lat: 32.7555, lng: -97.3308 };
const SAN_ANTONIO = { label: 'San Antonio, TX, United States', lat: 29.4241, lng: -98.4936 };

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeEach(async () => {
  await prisma.truckLeg.deleteMany();
  await prisma.transportRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Request: Dallas → Houston, 6 pallets / 9,000 lb dry van, pickup 20–32 h from now. */
async function dallasToHoustonRequestId(overrides: Parameters<typeof transportRequestInput>[0] = {}) {
  return (await createTransportRequest(prisma, transportRequestInput(overrides))).id;
}

async function legIds(requestId: string) {
  return (await findTruckLegCandidates(prisma, requestId)).map((c) => c.legId);
}

describe('findTruckLegCandidates (real PostGIS)', () => {
  it('returns an on-route leg with PostGIS straight-line distances from the stored geography', async () => {
    const leg = await createTruckLeg(prisma, truckLegInput());
    const [candidate, ...rest] = await findTruckLegCandidates(prisma, await dallasToHoustonRequestId());

    expect(rest).toEqual([]);
    expect(candidate?.legId).toBe(leg.id);
    expect(candidate?.distances.originToPickup).toBeCloseTo(0, 6);
    expect(candidate?.distances.dropoffToDestination).toBeCloseTo(0, 6);
    // PostGIS (ellipsoid) agrees with the haversine estimate within 0.5%.
    const haversine = straightLineMiles(DALLAS, HOUSTON);
    expect(candidate?.distances.pickupToDropoff).toBeGreaterThan(haversine * 0.995);
    expect(candidate?.distances.pickupToDropoff).toBeLessThan(haversine * 1.005);
    expect(candidate?.distances.originToDestination).toBe(candidate?.distances.pickupToDropoff);
  });

  it('excludes legs that fail each SQL-enforced hard constraint', async () => {
    const ok = await createTruckLeg(prisma, truckLegInput());
    const closed = await createTruckLeg(prisma, truckLegInput());
    await prisma.truckLeg.update({ where: { id: closed.id }, data: { status: 'CLOSED' } });
    await createTruckLeg(prisma, truckLegInput({ trailerType: 'REEFER' }));
    await createTruckLeg(
      prisma,
      truckLegInput({ loadState: 'PARTIAL', committedPallets: 21, committedWeightLbs: 1_000 }),
    );
    await createTruckLeg(
      prisma,
      truckLegInput({ loadState: 'PARTIAL', committedPallets: 1, committedWeightLbs: 36_000 }),
    );
    // Departure window ends before the pickup window opens (pickup starts 20 h from now).
    await createTruckLeg(
      prisma,
      truckLegInput({ departureEarliest: hoursFromNow(2), departureLatest: hoursFromNow(8) }),
    );
    // Cannot depart until after the pickup window closes (32 h from now).
    await createTruckLeg(
      prisma,
      truckLegInput({ departureEarliest: hoursFromNow(40), departureLatest: hoursFromNow(44) }),
    );
    // Dallas → San Antonio: serving Houston is far beyond a 100-mile detour.
    await createTruckLeg(prisma, truckLegInput({ destination: SAN_ANTONIO }));
    // Fort Worth → Houston: ~22 est. mi detour, over a 15-mile limit.
    await createTruckLeg(prisma, truckLegInput({ origin: FORT_WORTH, maxDetourMiles: 15 }));

    expect(await legIds(await dallasToHoustonRequestId())).toEqual([ok.id]);
  });

  it('keeps a leg that passes through the pickup from far away (no origin-radius pre-filter)', async () => {
    // Oklahoma City → Houston is ~190 straight-line miles from Dallas but detours only ~2 est. mi.
    // Departing 14–18 h from now reaches Dallas ~4.6 h later, inside the 20–32 h pickup window.
    const leg = await createTruckLeg(
      prisma,
      truckLegInput({ origin: OKLAHOMA_CITY, departureEarliest: hoursFromNow(14), departureLatest: hoursFromNow(18) }),
    );
    const [candidate] = await findTruckLegCandidates(prisma, await dallasToHoustonRequestId());

    expect(candidate?.legId).toBe(leg.id);
    expect(candidate?.distances.originToPickup).toBeGreaterThan(185);
  });

  it('applies the arrival-adjusted pickup window', async () => {
    // Same departure window as above, but the truck starts at the pickup: it would leave Dallas
    // 14–18 h from now, before the pickup window opens at 20 h.
    await createTruckLeg(
      prisma,
      truckLegInput({ departureEarliest: hoursFromNow(14), departureLatest: hoursFromNow(18) }),
    );
    // Leaves Oklahoma City 29–31 h from now: reaches Dallas ~34 h, after the window closes at 32 h.
    await createTruckLeg(
      prisma,
      truckLegInput({ origin: OKLAHOMA_CITY, departureEarliest: hoursFromNow(29), departureLatest: hoursFromNow(31) }),
    );

    expect(await legIds(await dallasToHoustonRequestId())).toEqual([]);
  });

  it('returns no candidates for an unknown request', async () => {
    await createTruckLeg(prisma, truckLegInput());
    expect(await findTruckLegCandidates(prisma, 'does-not-exist')).toEqual([]);
  });
});
