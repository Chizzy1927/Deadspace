import type { StorageMatch, StorageRequest, StorageScoring, WarehouseSpace } from '@deadspace/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstimateNote } from '../src/components/Estimate';
import { StorageMatchCard } from '../src/components/StorageMatchCard';
import { WarehouseSpaceSummary } from '../src/components/WarehouseSpaceSummary';
import { formatDate } from '../src/format';

const at = '2026-06-01T12:00:00.000Z';

const space: WarehouseSpace = {
  id: 'ws-1',
  status: 'ACTIVE',
  createdAt: at,
  updatedAt: at,
  companyName: 'Lone Star Storage',
  contactName: 'Ana Ruiz',
  contactEmail: 'ana@example.com',
  location: { label: 'Fort Worth, TX', lat: 32.7555, lng: -97.3308 },
  quantityAvailable: 80,
  minPallets: 10,
  availableFrom: '2026-06-01',
  availableTo: '2026-08-31',
  minStorageDays: 7,
  temperatureControlled: true,
  foodGrade: true,
  pricingPeriod: 'WEEK',
  pricePerPalletPerPeriod: 14,
  handlingFeePerPallet: 3.5,
  notes: null,
};

const request: StorageRequest = {
  id: 'sr-1',
  status: 'ACTIVE',
  createdAt: at,
  updatedAt: at,
  companyName: 'Acme Foods',
  contactName: 'Bo Lee',
  contactEmail: 'bo@example.com',
  location: { label: 'Dallas, TX', lat: 32.7767, lng: -96.797 },
  maxDistanceMiles: 50,
  pallets: 20,
  startDate: '2026-06-10',
  endDate: '2026-06-24',
  needsTemperatureControl: false,
  needsFoodGrade: true,
  maxBudgetTotal: 800,
  notes: null,
};

const scoring: StorageScoring = {
  weights: { location: 0.35, price: 0.35, capacityFit: 0.15, roomToExtend: 0.15 },
  locationReferenceMiles: 50,
  extensionFullCreditDays: 14,
  priceZeroScoreRatio: 1.5,
};

const baseMatch: StorageMatch = {
  space,
  score: 77,
  breakdown: { location: 0.6, price: 0.9, capacityFit: 0.25, roomToExtend: 1 },
  metrics: {
    estDistanceMiles: 20.4,
    stayDays: 14,
    daysAfterEnd: 68,
    availableSpaceUsed: 0.25,
    pricingPeriodDays: 7,
    estStorageCost: 560,
    estHandlingCost: 70,
    estTotalCost: 630,
    priceReference: { basis: 'BUDGET', amount: 800 },
  },
  highlights: [
    { code: 'UNDER_BUDGET', tone: 'positive', text: 'Under your budget' },
    { code: 'ROOM_TO_EXTEND', tone: 'positive', text: 'Room to extend your stay' },
  ],
  reasons: ['Est. 20 mi from you', 'Offers the features you require (self-declared by the operator)'],
};

const render = (match: StorageMatch = baseMatch, req: StorageRequest = request, sc: StorageScoring = scoring) =>
  renderToStaticMarkup(<StorageMatchCard match={match} scoring={sc} request={req} rank={1} />);

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const meters = (html: string) =>
  [...html.matchAll(/role="meter" aria-label="([^"]+)"[^>]*aria-valuenow="(\d+)"/g)].map((m) => [m[1], Number(m[2])]);

describe('StorageMatchCard', () => {
  it('shows the overall score out of 100', () => {
    expect(render()).toContain('aria-label="Score 77 out of 100"');
  });

  it('shows the four components as 0–100 meters in a fixed order', () => {
    expect(meters(render())).toEqual([
      ['Location', 60],
      ['Price', 90],
      ['Capacity fit', 25],
      ['Room to extend', 100],
    ]);
  });

  it('explains each component with its metric, using the API weights', () => {
    const t = text(render());
    expect(t).toContain('est. 20 mi from your location. Counts 35% of the score. Scores 0 at est. 50 mi or more.');
    expect(t).toContain('est. $630 total vs your $800 budget. Counts 35% of the score.');
    expect(t).toContain('Uses 25% of the pallet positions offered. Counts 15% of the score.');
    expect(t).toContain('Available 68 days after your move-out day. Full credit from 14 days.');
  });

  it('takes weights and references from the response, not constants', () => {
    const t = text(
      render(baseMatch, request, {
        ...scoring,
        weights: { location: 0.1, price: 0.6, capacityFit: 0.15, roomToExtend: 0.15 },
        locationReferenceMiles: 80,
      }),
    );
    expect(t).toContain('Counts 10% of the score. Scores 0 at est. 80 mi');
    expect(t).toContain('Counts 60% of the score.');
  });

  it('compares price with the median of matches when there is no budget', () => {
    const match: StorageMatch = {
      ...baseMatch,
      metrics: { ...baseMatch.metrics, priceReference: { basis: 'MATCH_MEDIAN', amount: 700 } },
    };
    expect(text(render(match))).toContain('est. $630 total vs the est. $700 median of matching warehouses');
  });

  it('marks every estimated value with an est. marker linked to the page note', () => {
    const html = render();
    const t = text(html);
    expect(t).toContain('Total cost for your stayest. $630');
    expect(t).toContain('Distanceest. 20 mi');
    expect(t).toContain('Storage costest. $560');
    expect(t).toContain('Handlingest. $70');
    const markers = html.match(/<abbr [^>]*>est\.<\/abbr>/g) ?? [];
    // 4 in the metrics grid + 3 in the breakdown (distance, reference miles, total cost; the budget is exact).
    expect(markers.length).toBe(7);
    for (const marker of markers) {
      expect(marker).toContain('aria-describedby="estimate-note"');
      expect(marker).toContain(
        'title="Estimated: distance is straight-line × a fixed road factor; cost is the quoted rate prorated by day. Not a routed distance or a quote."',
      );
      expect(marker).not.toContain('routed road calculation');
    }
  });

  it('does not mark exact figures as estimates', () => {
    const t = text(render());
    expect(t).toContain('Your stay14 days');
    expect(t).toContain('20 pallets of 80 offered');
  });

  it('shows highlights in API order and announces cautions', () => {
    const html = render({
      ...baseMatch,
      highlights: [
        { code: 'OVER_BUDGET', tone: 'caution', text: 'Over your budget' },
        { code: 'NEARBY', tone: 'positive', text: 'Nearby' },
      ],
    });
    expect([...html.matchAll(/data-highlight="([A-Z_]+)"/g)].map((m) => m[1])).toEqual(['OVER_BUDGET', 'NEARBY']);
    expect(text(html)).toContain('Caution: Over your budget');
  });

  it('presents required and extra features as declared, never as verified', () => {
    const t = text(render());
    expect(t).toContain('Required features: Food-grade, declared by the operator.');
    expect(t).toContain('Also declared: Temperature-controlled.');
    expect(t).toContain('DeadSpace does not verify these.');
    expect(t).not.toMatch(/verified by|certified|guaranteed/i);
  });

  it('omits the features line when nothing is required or declared', () => {
    const plain = render(
      { ...baseMatch, space: { ...space, temperatureControlled: false, foodGrade: false } },
      { ...request, needsFoodGrade: false },
    );
    expect(text(plain)).not.toContain('Required features');
  });

  it('says so when the listing has no handling fee', () => {
    const t = text(render({ ...baseMatch, space: { ...space, handlingFeePerPallet: null } }));
    expect(t).toContain('HandlingNo handling fee');
  });

  it('links to the operator contact', () => {
    expect(render()).toContain('href="mailto:ana@example.com"');
  });
});

describe('EstimateNote storage variant', () => {
  it('avoids drive-time language and says costs are comparison estimates', () => {
    const html = renderToStaticMarkup(<EstimateNote variant="storage" />);
    expect(html).toContain('id="estimate-note"');
    expect(text(html)).not.toMatch(/drive time|driving speed/i);
    expect(text(html)).toContain('prorated by day');
    expect(text(html)).toContain('not quotes or invoices');
  });
});

describe('WarehouseSpaceSummary', () => {
  it('shows the persisted listing with capabilities as declared', () => {
    const t = text(renderToStaticMarkup(<WarehouseSpaceSummary space={space} />));
    expect(t).toContain('Fort Worth, TX');
    expect(t).toContain('80 pallets');
    expect(t).toContain('Smallest block: 10 pallets');
    expect(t).toContain('7 days');
    expect(t).toContain('Temperature-controlled · Food-grade');
    expect(t).toContain('DeadSpace does not verify them');
    expect(t).toContain('$14.00 per pallet per week');
    expect(t).toContain('plus $3.50 per pallet handling');
  });

  it('omits optional rows when absent', () => {
    const t = text(
      renderToStaticMarkup(
        <WarehouseSpaceSummary
          space={{
            ...space,
            minPallets: null,
            handlingFeePerPallet: null,
            temperatureControlled: false,
            foodGrade: false,
          }}
        />,
      ),
    );
    expect(t).not.toContain('Smallest block');
    expect(t).not.toContain('handling');
    expect(t).toContain('None declared');
  });
});

describe('formatDate', () => {
  it('formats calendar days in UTC without shifting', () => {
    expect(formatDate('2026-06-01')).toBe('Jun 1, 2026');
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
  });
});
