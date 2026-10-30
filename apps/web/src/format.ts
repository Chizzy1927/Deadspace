import type { TrailerType, TruckPricingBasis } from '@deadspace/shared';

const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

export const formatMiles = (miles: number) => `${Math.round(miles).toLocaleString('en-US')} mi`;
export const formatUsd = (amount: number) => (Number.isInteger(amount) ? usdWhole : usdCents).format(amount);
export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`;
export const formatHours = (hours: number) => `${hours.toFixed(1)} h`;
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatWindow = (from: string, to: string) => `${formatDateTime(from)} – ${formatDateTime(to)}`;

export const TRAILER_LABELS: Record<TrailerType, string> = { DRY_VAN: 'Dry van', REEFER: 'Reefer', FLATBED: 'Flatbed' };

export const formatLbs = (lbs: number) => `${lbs.toLocaleString('en-US')} lb`;

/** Spare room on a leg as plain text, e.g. "Room for 12 more pallets and 22,000 lb". */
export function formatSpareCapacity(pallets: number, weightLbs: number): string {
  if (pallets <= 0 || weightLbs <= 0) return 'No spare room left';
  return `Room for ${pallets} more ${pallets === 1 ? 'pallet' : 'pallets'} and ${formatLbs(weightLbs)}`;
}

export function formatTruckPrice(basis: TruckPricingBasis, amount: number): string {
  return basis === 'FLAT' ? `${formatUsd(amount)} flat` : `${usdCents.format(amount)} per loaded mile`;
}
