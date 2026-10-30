import type { TransportMatch } from '@deadspace/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstimateNote } from '../src/components/Estimate';
import { MatchCard } from '../src/components/MatchCard';

const at = '2026-06-01T12:00:00.000Z';

const baseMatch: TransportMatch = {
  leg: {
    id: 'leg-1',
    status: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    companyName: 'Lone Star Freight',
    contactName: 'Ana Ruiz',
    contactEmail: 'ana@example.com',
    origin: { label: 'Dallas, TX', lat: 32.7767, lng: -96.797 },
    destination: { label: 'Houston, TX', lat: 29.7604, lng: -95.3698 },
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
  breakdown: { routeEfficiency: 1, capacityFit: 6 / 26, price: 1.5 - 650 / 700, timing: 1 },
  metrics: {
    estDirectLegMiles: 271.3,
    estAdditionalMiles: 0,
    estLoadedMiles: 271.3,
    estEmptyMilesRecovered: 271.3,
    sparePallets: 26,
    spareWeightLbs: 44_000,
    palletUtilisation: { before: 0, after: 6 / 26 },
    weightUtilisation: { before: 0, after: 9_000 / 44_000 },
    limitingCapacity: 'PALLETS',
    estPrice: 650,
    spareCapacityUsed: 6 / 26,
    estScheduleSlackHours: 6.7,
    scheduleLimitedBy: 'PICKUP_WINDOW',
    priceReference: { basis: 'BUDGET', amount: 700 },
  },
  highlights: [
    { code: 'ON_ROUTE', tone: 'positive', text: "On the carrier's planned route" },
    { code: 'COMFORTABLE_SCHEDULE', tone: 'positive', text: 'Comfortable estimated schedule' },
  ],
  reasons: ['Est. price $650 (flat rate), within your $700 budget'],
};

const render = (match: TransportMatch = baseMatch) => renderToStaticMarkup(<MatchCard match={match} rank={1} />);

/** Visible text with tags removed and the entities React escapes decoded. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const meters = (html: string) =>
  [...html.matchAll(/role="meter" aria-label="([^"]+)"[^>]*aria-valuenow="(\d+)"/g)].map((m) => [m[1], Number(m[2])]);

describe('MatchCard', () => {
  it('shows the overall score out of 100', () => {
    expect(render()).toContain('aria-label="Score 82 out of 100"');
  });

  it('shows the four score components as 0–100 meters, route first', () => {
    expect(meters(render())).toEqual([
      ['Route efficiency', 100],
      ['Spare-capacity fit', 23],
      ['Price', 57],
      ['Timing', 100],
    ]);
  });

  it('explains each component with the metric behind it', () => {
    const t = text(render());
    expect(t).toContain("Counts most. Adds est. 0 mi to the carrier's route");
    expect(t).toContain("Takes 23% of the truck's spare room (by pallets)");
    expect(t).toContain('est. $650 vs your $700 budget');
    expect(t).toContain('est. 6.7 h to spare before your pickup window closes');
  });

  it('compares price with the median of matches when there is no budget', () => {
    const match: TransportMatch = {
      ...baseMatch,
      metrics: { ...baseMatch.metrics, priceReference: { basis: 'MATCH_MEDIAN', amount: 670 } },
    };
    expect(text(render(match))).toContain('est. $650 vs the est. $670 median of matching trucks');
  });

  it('names what limits the schedule margin', () => {
    const match: TransportMatch = {
      ...baseMatch,
      metrics: { ...baseMatch.metrics, estScheduleSlackHours: 1.5, scheduleLimitedBy: 'ARRIVE_BY' },
    };
    expect(text(render(match))).toContain("est. 1.5 h to spare before the carrier's arrive-by time");
  });

  it('shows highlights in API order, keyed by code', () => {
    const html = render();
    expect([...html.matchAll(/data-highlight="([A-Z_]+)"/g)].map((m) => m[1])).toEqual([
      'ON_ROUTE',
      'COMFORTABLE_SCHEDULE',
    ]);
    expect(text(html)).toContain("On the carrier's planned route");
  });

  it('announces caution highlights to screen readers', () => {
    const match: TransportMatch = {
      ...baseMatch,
      highlights: [{ code: 'LARGE_DETOUR', tone: 'caution', text: 'Large detour from the planned route' }],
    };
    expect(text(render(match))).toContain('Caution: Large detour from the planned route');
  });

  it('renders no highlight list when there are none', () => {
    expect(render({ ...baseMatch, highlights: [] })).not.toContain('aria-label="Highlights"');
  });

  it('marks every estimated value with an est. marker linked to the page note', () => {
    const html = render();
    const t = text(html);
    // Metrics grid: miles and price are estimates.
    expect(t).toContain('Extra miles for carrierest. 0 mi');
    expect(t).toContain('Loaded milesest. 271 mi');
    expect(t).toContain('Empty miles recoveredest. 271 mi');
    expect(t).toContain('Priceest. $650');
    expect(t).toContain("Carrier's planned legest. 271 mi");
    // Every marker points at the single explanation, with a hover tooltip.
    const markers = html.match(/<abbr [^>]*>est\.<\/abbr>/g) ?? [];
    // 5 in the metrics grid + 3 in the breakdown (miles, price, slack; the budget is exact).
    expect(markers.length).toBe(8);
    for (const marker of markers) {
      expect(marker).toContain('aria-describedby="estimate-note"');
      expect(marker).toContain('title="Estimated from straight-line distance. Not a routed road calculation."');
    }
  });

  it('does not mark exact capacity figures as estimates', () => {
    const t = text(render());
    expect(t).toContain('Trailer fill (by pallets)0% → 23%');
  });
});

describe('EstimateNote', () => {
  it('states estimates come from the estimation model, not routed road calculations', () => {
    const html = renderToStaticMarkup(<EstimateNote />);
    expect(html).toContain('id="estimate-note"');
    expect(text(html)).toContain(
      "Road distances and drive times are approximations from straight-line distance using DeadSpace's estimation model",
    );
    expect(text(html)).toContain('They are not routed road calculations.');
  });
});
