import { HOUR_MS, nextUtcMidnight, type TransportMatch } from '@deadspace/shared';

const DAY_HOURS = 24;

/**
 * The landing page's example match: a static copy of the top result the matcher returns for the
 * seeded Dallas → Houston demo request (6 pallets, 9,000 lb, dry van, no budget) against seed leg
 * 02. Typed against the shared contract so it can't drift from what MatchCard renders. Dates are
 * placed the way the seed places them (day 1 after the next UTC midnight) so the example never
 * looks stale. Not fetched: the landing page works without the API.
 */
export function buildExampleMatch(now: Date): TransportMatch {
  const anchor = nextUtcMidnight(now).getTime();
  const at = (hours: number) => new Date(anchor + hours * HOUR_MS).toISOString();
  const listed = new Date(anchor - DAY_HOURS * HOUR_MS).toISOString();

  return {
    leg: {
      id: 'example-truck-leg',
      status: 'ACTIVE',
      createdAt: listed,
      updatedAt: listed,
      companyName: 'Gulf Coast Carriers',
      contactName: 'Marcus Reed',
      contactEmail: 'marcus@gulfcoastcarriers.example.com',
      origin: { label: 'Dallas, TX', lat: 32.7767, lng: -96.797 },
      destination: { label: 'Houston, TX', lat: 29.7604, lng: -95.3698 },
      departureEarliest: at(DAY_HOURS + 15),
      departureLatest: at(DAY_HOURS + 19),
      arriveBy: at(DAY_HOURS + 30),
      loadState: 'PARTIAL',
      trailerType: 'DRY_VAN',
      totalPallets: 26,
      totalWeightLbs: 44_000,
      committedPallets: 14,
      committedWeightLbs: 22_000,
      maxDetourMiles: 100,
      pricingBasis: 'PER_LOADED_MILE',
      priceAmount: 2.1,
      notes: 'Must be at Houston DC by early morning.',
    },
    score: 87,
    breakdown: { routeEfficiency: 1, capacityFit: 0.5, price: 0.6545, timing: 1 },
    metrics: {
      estDirectLegMiles: 269.8,
      estAdditionalMiles: 0,
      estLoadedMiles: 269.8,
      estEmptyMilesRecovered: null,
      sparePallets: 12,
      spareWeightLbs: 22_000,
      palletUtilisation: { before: 14 / 26, after: 20 / 26 },
      weightUtilisation: { before: 22_000 / 44_000, after: 31_000 / 44_000 },
      limitingCapacity: 'PALLETS',
      estPrice: 566.49,
      spareCapacityUsed: 0.5,
      estScheduleSlackHours: 5,
      scheduleLimitedBy: 'PICKUP_WINDOW',
      priceReference: { basis: 'MATCH_MEDIAN', amount: 670 },
    },
    highlights: [
      { code: 'ON_ROUTE', tone: 'positive', text: "On the carrier's planned route" },
      { code: 'BELOW_TYPICAL_PRICE', tone: 'positive', text: 'Below typical match price' },
    ],
    reasons: [
      "On the carrier's planned route: serving you adds almost no miles (est. under 1 mi)",
      'Part-loaded trailer with room to spare: 12 of 26 pallets and 22,000 lb free',
      'Your load takes the trailer from 54% to 77% full (by pallets)',
      'Departs from your pickup area during your pickup window',
      'Est. price $566.49 ($2.10 per loaded mile × est. 270 mi)',
    ],
  };
}
