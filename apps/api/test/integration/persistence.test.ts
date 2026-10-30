import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTransportRequest } from '../../src/repositories/transport-request.repository.js';
import { createTruckLeg } from '../../src/repositories/truck-leg.repository.js';
import { createTestPrisma, DALLAS, HOUSTON, transportRequestInput, truckLegInput } from './helpers.js';

const prisma = createTestPrisma();

beforeEach(async () => {
  await prisma.truckLeg.deleteMany();
  await prisma.transportRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('TruckLeg persistence (real PostGIS)', () => {
  it('stores a validated empty leg with database defaults', async () => {
    const input = truckLegInput();
    const created = await createTruckLeg(prisma, input);
    const stored = await prisma.truckLeg.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored.id).toMatch(/^c[a-z0-9]{20,}$/);
    expect(stored).toMatchObject({
      status: 'ACTIVE',
      originLabel: DALLAS.label,
      originLat: DALLAS.lat,
      originLng: DALLAS.lng,
      destinationLabel: HOUSTON.label,
      destinationLat: HOUSTON.lat,
      destinationLng: HOUSTON.lng,
      departureEarliest: input.departureEarliest,
      departureLatest: input.departureLatest,
      arriveBy: null,
      loadState: 'EMPTY',
      trailerType: 'DRY_VAN',
      totalPallets: 26,
      totalWeightLbs: 44_000,
      committedPallets: 0,
      committedWeightLbs: 0,
      maxDetourMiles: 100,
      pricingBasis: 'FLAT',
      notes: null,
    });
    expect(stored.priceAmount.toFixed(2)).toBe('650.00');
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it('stores a partial leg with an arrive-by commitment and exact per-mile price', async () => {
    const arriveBy = new Date(Date.now() + 40 * 3_600_000).toISOString();
    const created = await createTruckLeg(
      prisma,
      truckLegInput({
        loadState: 'PARTIAL',
        committedPallets: 14,
        committedWeightLbs: 22_000,
        arriveBy,
        maxDetourMiles: 40,
        pricingBasis: 'PER_LOADED_MILE',
        priceAmount: 2.35,
        notes: 'Dock 4',
      }),
    );
    const stored = await prisma.truckLeg.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored).toMatchObject({
      loadState: 'PARTIAL',
      committedPallets: 14,
      committedWeightLbs: 22_000,
      arriveBy: new Date(arriveBy),
      maxDetourMiles: 40,
      notes: 'Dock 4',
    });
    expect(stored.priceAmount.toString()).toBe('2.35');
  });
});

describe('TransportRequest persistence (real PostGIS)', () => {
  it('stores a validated request without optional fields', async () => {
    const input = transportRequestInput();
    const created = await createTransportRequest(prisma, input);
    const stored = await prisma.transportRequest.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored).toMatchObject({
      status: 'ACTIVE',
      pickupLabel: DALLAS.label,
      pickupLat: DALLAS.lat,
      pickupLng: DALLAS.lng,
      dropoffLabel: HOUSTON.label,
      pickupEarliest: input.pickupEarliest,
      pickupLatest: input.pickupLatest,
      deliverBy: null,
      trailerType: 'DRY_VAN',
      pallets: 6,
      weightLbs: 9_000,
      maxBudget: null,
      notes: null,
    });
  });

  it('stores an exact budget and deliver-by deadline', async () => {
    const deliverBy = new Date(Date.now() + 48 * 3_600_000).toISOString();
    const created = await createTransportRequest(prisma, transportRequestInput({ maxBudget: 899.99, deliverBy }));
    const stored = await prisma.transportRequest.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored.maxBudget?.toString()).toBe('899.99');
    expect(stored.deliverBy).toEqual(new Date(deliverBy));
  });
});
