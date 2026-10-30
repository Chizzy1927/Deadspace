import { describe, expect, it } from 'vitest';
import {
  type CreateTransportRequestPayload,
  type CreateTruckLegPayload,
  createTransportRequestInputSchema,
  createTruckLegInputSchema,
  straightLineMiles,
  TRANSPORT_POLICY,
} from '../src/index.js';

const NOW = new Date('2026-06-01T12:00:00Z');
const legSchema = createTruckLegInputSchema(() => NOW);
const requestSchema = createTransportRequestInputSchema(() => NOW);

const dallas = { label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 };
const houston = { label: 'Houston, TX, United States', lat: 29.7604, lng: -95.3698 };
// Due north of Dallas: 0.144° ≈ 9.95 mi, 0.1455° ≈ 10.05 mi (1° of latitude ≈ 69.09 mi).
const justInside = { label: 'North of Dallas (9.95 mi)', lat: dallas.lat + 0.144, lng: dallas.lng };
const justOutside = { label: 'North of Dallas (10.05 mi)', lat: dallas.lat + 0.1455, lng: dallas.lng };

describe('straightLineMiles', () => {
  it('computes great-circle distances in miles', () => {
    expect(straightLineMiles(dallas, dallas)).toBe(0);
    expect(straightLineMiles(dallas, houston)).toBeCloseTo(224.8, 0);
    expect(straightLineMiles(houston, dallas)).toBe(straightLineMiles(dallas, houston));
    expect(straightLineMiles(dallas, justInside)).toBeCloseTo(9.95, 2);
    expect(straightLineMiles(dallas, justOutside)).toBeCloseTo(10.05, 2);
  });

  it('stays finite for antipodal points', () => {
    expect(straightLineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * 3958.7613, 3);
  });
});

describe('TRANSPORT_POLICY', () => {
  it('documents the V1 policy values the schemas enforce', () => {
    expect(TRANSPORT_POLICY).toEqual({
      maxDepartureWindowHours: 72,
      maxDaysAhead: 30,
      defaultMaxDetourMiles: 100,
      maxCarrierDetourMiles: 300,
      minStraightLineMiles: 10,
    });
  });

  it('allows exactly the maximum carrier detour', () => {
    expect(legSchema.safeParse({ ...validLeg, maxDetourMiles: 300 }).success).toBe(true);
  });
});

const validLeg: CreateTruckLegPayload = {
  companyName: 'Lone Star Freight',
  contactName: 'Dana Ortiz',
  contactEmail: 'dana@example.com',
  origin: dallas,
  destination: houston,
  departureEarliest: '2026-06-03T13:00:00Z',
  departureLatest: '2026-06-03T19:00:00Z',
  loadState: 'EMPTY',
  trailerType: 'DRY_VAN',
  totalPallets: 26,
  totalWeightLbs: 44_000,
  pricingBasis: 'FLAT',
  priceAmount: 650,
};

const validRequest: CreateTransportRequestPayload = {
  companyName: 'Acme Goods',
  contactName: 'Sam Lee',
  contactEmail: 'sam@example.com',
  pickup: dallas,
  dropoff: houston,
  pickupEarliest: '2026-06-03T08:00:00Z',
  pickupLatest: '2026-06-03T18:00:00Z',
  trailerType: 'DRY_VAN',
  pallets: 6,
  weightLbs: 9_000,
};

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return (result.error?.issues ?? []).map((i) => i.path.join('.'));
}

describe('createTruckLegInputSchema', () => {
  it('accepts a valid empty leg and applies defaults', () => {
    const leg = legSchema.parse(validLeg);
    expect(leg.departureEarliest).toEqual(new Date('2026-06-03T13:00:00Z'));
    expect(leg.committedPallets).toBe(0);
    expect(leg.committedWeightLbs).toBe(0);
    expect(leg.maxDetourMiles).toBe(100);
    expect(leg.arriveBy).toBeUndefined();
  });

  it('accepts a valid partial leg with an arrive-by commitment', () => {
    const leg = legSchema.parse({
      ...validLeg,
      loadState: 'PARTIAL',
      committedPallets: 10,
      committedWeightLbs: 15_000,
      arriveBy: '2026-06-04T06:00:00Z',
      pricingBasis: 'PER_LOADED_MILE',
      priceAmount: 2.35,
    });
    expect(leg.loadState).toBe('PARTIAL');
    expect(leg.arriveBy).toEqual(new Date('2026-06-04T06:00:00Z'));
  });

  it('requires a destination (no "truck available anywhere" posts)', () => {
    const { destination: _omitted, ...withoutDestination } = validLeg;
    expect(issuePaths(legSchema.safeParse(withoutDestination))).toContain('destination');
  });

  it('rejects a destination identical to the origin', () => {
    expect(issuePaths(legSchema.safeParse({ ...validLeg, destination: dallas }))).toEqual(['destination']);
  });

  it('requires origin and destination at least 10 straight-line miles apart', () => {
    // Differently geocoded points in the same city must not pass as a "movement".
    const dallasPostcode = { label: 'Dallas, TX 75201, United States', lat: 32.7877, lng: -96.7991 };
    expect(issuePaths(legSchema.safeParse({ ...validLeg, destination: dallasPostcode }))).toEqual(['destination']);
    expect(issuePaths(legSchema.safeParse({ ...validLeg, destination: justInside }))).toEqual(['destination']);
    expect(legSchema.safeParse({ ...validLeg, destination: justOutside }).success).toBe(true);
  });

  it('rejects an inverted departure window', () => {
    const result = legSchema.safeParse({
      ...validLeg,
      departureEarliest: '2026-06-03T19:00:00Z',
      departureLatest: '2026-06-03T13:00:00Z',
    });
    expect(issuePaths(result)).toEqual(['departureLatest']);
  });

  it('allows a 72-hour window but rejects anything wider', () => {
    const base = { ...validLeg, departureEarliest: '2026-06-03T00:00:00Z' };
    expect(legSchema.safeParse({ ...base, departureLatest: '2026-06-06T00:00:00Z' }).success).toBe(true);
    expect(issuePaths(legSchema.safeParse({ ...base, departureLatest: '2026-06-06T00:00:01Z' }))).toEqual([
      'departureLatest',
    ]);
  });

  it('rejects a window that has already ended', () => {
    const result = legSchema.safeParse({
      ...validLeg,
      departureEarliest: '2026-05-31T08:00:00Z',
      departureLatest: '2026-06-01T12:00:00Z',
    });
    expect(issuePaths(result)).toEqual(['departureLatest']);
  });

  it('allows departure up to 30 days ahead but not beyond', () => {
    const at30 = { ...validLeg, departureEarliest: '2026-07-01T06:00:00Z', departureLatest: '2026-07-01T12:00:00Z' };
    expect(legSchema.safeParse(at30).success).toBe(true);
    const beyond = { ...at30, departureLatest: '2026-07-01T12:00:01Z' };
    expect(issuePaths(legSchema.safeParse(beyond))).toEqual(['departureLatest']);
  });

  it('rejects arrive-by at or before the earliest departure', () => {
    const result = legSchema.safeParse({ ...validLeg, arriveBy: validLeg.departureEarliest });
    expect(issuePaths(result)).toEqual(['arriveBy']);
  });

  it('rejects committed capacity on an EMPTY leg', () => {
    const result = legSchema.safeParse({ ...validLeg, committedPallets: 2, committedWeightLbs: 1_000 });
    expect(issuePaths(result)).toEqual(['committedPallets', 'committedWeightLbs']);
  });

  it('rejects a PARTIAL leg with nothing committed', () => {
    expect(issuePaths(legSchema.safeParse({ ...validLeg, loadState: 'PARTIAL' }))).toEqual(['committedPallets']);
  });

  it('requires committed capacity to be strictly less than total', () => {
    const result = legSchema.safeParse({
      ...validLeg,
      loadState: 'PARTIAL',
      committedPallets: 26,
      committedWeightLbs: 44_000,
    });
    expect(issuePaths(result)).toEqual(['committedPallets', 'committedWeightLbs']);
  });

  it('enforces field bounds and enums', () => {
    const result = legSchema.safeParse({
      ...validLeg,
      contactEmail: 'not-an-email',
      trailerType: 'TANKER',
      totalPallets: 0,
      maxDetourMiles: 301,
      priceAmount: 10.005,
      origin: { ...dallas, lat: 91 },
    });
    expect(issuePaths(result).sort()).toEqual(
      ['contactEmail', 'maxDetourMiles', 'origin.lat', 'priceAmount', 'totalPallets', 'trailerType'].sort(),
    );
  });

  it('rejects timestamps without an explicit offset', () => {
    const result = legSchema.safeParse({ ...validLeg, departureEarliest: '2026-06-03T13:00:00' });
    expect(issuePaths(result)).toEqual(['departureEarliest']);
  });
});

describe('createTransportRequestInputSchema', () => {
  it('accepts a valid request', () => {
    const req = requestSchema.parse({ ...validRequest, maxBudget: 900, deliverBy: '2026-06-04T12:00:00Z' });
    expect(req.pickupLatest).toEqual(new Date('2026-06-03T18:00:00Z'));
    expect(req.maxBudget).toBe(900);
  });

  it('requires both pickup and dropoff', () => {
    const { dropoff: _omitted, ...withoutDropoff } = validRequest;
    expect(issuePaths(requestSchema.safeParse(withoutDropoff))).toContain('dropoff');
  });

  it('rejects identical pickup and dropoff', () => {
    expect(issuePaths(requestSchema.safeParse({ ...validRequest, dropoff: dallas }))).toEqual(['dropoff']);
  });

  it('requires pickup and dropoff at least 10 straight-line miles apart', () => {
    expect(issuePaths(requestSchema.safeParse({ ...validRequest, dropoff: justInside }))).toEqual(['dropoff']);
    expect(requestSchema.safeParse({ ...validRequest, dropoff: justOutside }).success).toBe(true);
  });

  it('rejects an inverted or past pickup window', () => {
    const inverted = requestSchema.safeParse({
      ...validRequest,
      pickupEarliest: '2026-06-03T18:00:00Z',
      pickupLatest: '2026-06-03T08:00:00Z',
    });
    expect(issuePaths(inverted)).toEqual(['pickupLatest']);
    const past = requestSchema.safeParse({
      ...validRequest,
      pickupEarliest: '2026-05-30T08:00:00Z',
      pickupLatest: '2026-05-30T18:00:00Z',
    });
    expect(issuePaths(past)).toEqual(['pickupLatest']);
  });

  it('rejects deliver-by at or before the earliest pickup', () => {
    const result = requestSchema.safeParse({ ...validRequest, deliverBy: '2026-06-03T07:00:00Z' });
    expect(issuePaths(result)).toEqual(['deliverBy']);
  });

  it('enforces capacity bounds and positive budgets', () => {
    const result = requestSchema.safeParse({ ...validRequest, pallets: 31, weightLbs: 50_001, maxBudget: 0 });
    expect(issuePaths(result).sort()).toEqual(['maxBudget', 'pallets', 'weightLbs']);
  });
});
