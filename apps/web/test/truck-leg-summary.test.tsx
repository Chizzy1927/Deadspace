import type { TruckLeg } from '@deadspace/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TruckLegSummary } from '../src/components/TruckLegSummary';
import { formatSpareCapacity, formatTruckPrice } from '../src/format';

const at = '2026-06-01T12:00:00.000Z';

const emptyLeg: TruckLeg = {
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
  totalWeightLbs: 45_000,
  committedPallets: 0,
  committedWeightLbs: 0,
  maxDetourMiles: 100,
  pricingBasis: 'FLAT',
  priceAmount: 650,
  notes: null,
};

/** Rendered text with tags stripped, so assertions read like what a user sees. */
const text = (leg: TruckLeg) => renderToStaticMarkup(<TruckLegSummary leg={leg} />).replace(/<[^>]+>/g, ' ');

describe('formatSpareCapacity', () => {
  it('describes the remaining room in both dimensions', () => {
    expect(formatSpareCapacity(12, 22_000)).toBe('Room for 12 more pallets and 22,000 lb');
    expect(formatSpareCapacity(1, 500)).toBe('Room for 1 more pallet and 500 lb');
  });

  it('says there is no room when either dimension is used up', () => {
    expect(formatSpareCapacity(0, 22_000)).toBe('No spare room left');
    expect(formatSpareCapacity(4, -100)).toBe('No spare room left');
  });
});

describe('formatTruckPrice', () => {
  it('labels the pricing basis', () => {
    expect(formatTruckPrice('FLAT', 650)).toBe('$650 flat');
    expect(formatTruckPrice('PER_LOADED_MILE', 2.1)).toBe('$2.10 per loaded mile');
  });
});

describe('TruckLegSummary', () => {
  it('summarises an EMPTY flat-price leg without committed load, arrive-by or notes', () => {
    const t = text(emptyLeg);

    expect(t).toContain('Dallas, TX → Houston, TX');
    expect(t).toContain('Dry van · 26 pallets · 45,000 lb');
    expect(t).toContain('Empty');
    expect(t).toContain('Room for 26 more pallets and 45,000 lb');
    expect(t).toContain('100 miles');
    expect(t).toContain('$650 flat');
    expect(t).not.toContain('already on board');
    expect(t).not.toContain('Must arrive by');
    expect(t).not.toContain('Notes');
  });

  it('shows committed load, remaining room, per-mile price, arrive-by and notes for a PARTIAL leg', () => {
    const t = text({
      ...emptyLeg,
      loadState: 'PARTIAL',
      committedPallets: 14,
      committedWeightLbs: 23_000,
      pricingBasis: 'PER_LOADED_MILE',
      priceAmount: 2.35,
      arriveBy: '2026-06-02T06:00:00.000Z',
      notes: 'Dock 4',
    });

    expect(t).toContain('14 pallets and 23,000 lb already on board');
    expect(t).toContain('Room for 12 more pallets and 22,000 lb');
    expect(t).toContain('$2.35 per loaded mile');
    expect(t).toContain('Must arrive by');
    expect(t).toContain('Dock 4');
  });
});
