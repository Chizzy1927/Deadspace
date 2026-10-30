import type { StoragePricingPeriod, TrailerType, TruckPricingBasis, WarehouseSpace } from '@deadspace/shared';

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

export const PRICING_PERIOD_LABELS: Record<StoragePricingPeriod, string> = {
  DAY: 'Day',
  WEEK: 'Week',
  MONTH: 'Month',
};

const calendarDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `YYYY-MM-DD` as a readable date. Calendar days have no time zone, so this formats in UTC. */
export const formatDate = (isoDate: string) => calendarDate.format(new Date(`${isoDate}T00:00:00Z`));
export const formatDateRange = (from: string, to: string) => `${formatDate(from)} – ${formatDate(to)}`;
export const formatDays = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;
export const formatPallets = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'pallet' : 'pallets'}`;

/** A per-pallet price with its billing period, e.g. "$12.50 per pallet per week". */
export function formatPalletPrice(amount: number, period: StoragePricingPeriod): string {
  return `${usdCents.format(amount)} per pallet per ${period.toLowerCase()}`;
}

/** Capabilities as the operator declared them (DeadSpace verifies none of them). */
export function declaredCapabilities(space: Pick<WarehouseSpace, 'temperatureControlled' | 'foodGrade'>): string[] {
  return [space.temperatureControlled && 'Temperature-controlled', space.foodGrade && 'Food-grade'].filter(
    (c): c is string => c !== false,
  );
}
