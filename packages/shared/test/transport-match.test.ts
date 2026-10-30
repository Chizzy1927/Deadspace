import { describe, expect, it } from 'vitest';
import { type TransportMatch, TransportMatchSchema } from '../src/index.js';

const at = '2026-06-01T12:00:00.000Z';
const dallas = { label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 };
const houston = { label: 'Houston, TX, United States', lat: 29.7604, lng: -95.3698 };

const match: TransportMatch = {
  leg: {
    id: 'leg-1',
    status: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    companyName: 'Lone Star Freight',
    contactName: 'Ana Ruiz',
    contactEmail: 'ana@example.com',
    origin: dallas,
    destination: houston,
    departureEarliest: at,
    departureLatest: at,
    arriveBy: null,
    loadState: 'EMPTY',
    trailerType: 'DRY_VAN',
    totalPallets: 26,
    totalWeightLbs: 44_000,
    committedPallets: 0,
    committedWeightLbs: 0,
    maxDetourMiles: 100,
    pricingBasis: 'FLAT',
    priceAmount: 650,
    notes: null,
  },
  score: 82,
  breakdown: { routeEfficiency: 1, capacityFit: 6 / 26, price: 0.57, timing: 1 },
  metrics: {
    estDirectLegMiles: 270,
    estAdditionalMiles: 0,
    estLoadedMiles: 270,
    estEmptyMilesRecovered: 270,
    sparePallets: 26,
    spareWeightLbs: 44_000,
    palletUtilisation: { before: 0, after: 6 / 26 },
    weightUtilisation: { before: 0, after: 9_000 / 44_000 },
    limitingCapacity: 'PALLETS',
    estPrice: 650,
    spareCapacityUsed: 6 / 26,
    estScheduleSlackHours: 7,
    scheduleLimitedBy: 'PICKUP_WINDOW',
    priceReference: { basis: 'BUDGET', amount: 700 },
  },
  highlights: [
    { code: 'ON_ROUTE', tone: 'positive', text: "On the carrier's planned route" },
    { code: 'COMFORTABLE_SCHEDULE', tone: 'positive', text: 'Comfortable estimated schedule' },
  ],
  reasons: ['Adds est. 0 mi'],
};

describe('TransportMatchSchema', () => {
  it('parses a match with breakdown, presentation metrics and highlights', () => {
    expect(TransportMatchSchema.parse(match)).toEqual(match);
  });

  it('rejects score components outside 0–1', () => {
    const result = TransportMatchSchema.safeParse({ ...match, breakdown: { ...match.breakdown, price: 1.01 } });
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['breakdown.price']);
  });

  it('rejects unknown highlight codes', () => {
    const highlights = [{ code: 'CHEAP', tone: 'positive', text: 'Cheap' }];
    expect(TransportMatchSchema.safeParse({ ...match, highlights }).success).toBe(false);
  });

  it('allows at most two highlights', () => {
    const highlights = [...match.highlights, match.highlights[0]];
    expect(TransportMatchSchema.safeParse({ ...match, highlights }).success).toBe(false);
  });

  it('rejects an unknown price-reference basis', () => {
    const metrics = { ...match.metrics, priceReference: { basis: 'MARKET', amount: 700 } };
    expect(TransportMatchSchema.safeParse({ ...match, metrics }).success).toBe(false);
  });
});
