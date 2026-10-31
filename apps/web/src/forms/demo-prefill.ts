import { buildDemoStorageRequest, buildDemoTransportRequest } from '@deadspace/shared';
import { STORAGE_REQUEST_FORM_DEFAULTS, type StorageRequestFormValues } from './storage-request-form';
import type { TransportRequestFormValues } from './transport-request-form';

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO instant → `datetime-local` value in the browser's time zone (the inverse of the form's `toIso`). */
export function toLocalDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Raw transport form values for the shared demo request; the demo values live in `@deadspace/shared`. */
export function transportExampleValues(now: Date): TransportRequestFormValues {
  const demo = buildDemoTransportRequest(now);
  return {
    companyName: demo.companyName,
    contactName: demo.contactName,
    contactEmail: demo.contactEmail,
    pickup: demo.pickup,
    dropoff: demo.dropoff,
    pickupEarliest: toLocalDateTime(demo.pickupEarliest),
    pickupLatest: toLocalDateTime(demo.pickupLatest),
    deliverBy: demo.deliverBy ? toLocalDateTime(demo.deliverBy) : '',
    trailerType: demo.trailerType,
    pallets: demo.pallets,
    weightLbs: demo.weightLbs,
    maxBudget: demo.maxBudget ?? Number.NaN,
    notes: demo.notes ?? '',
  };
}

/** Raw storage form values for the shared demo request. */
export function storageExampleValues(now: Date): StorageRequestFormValues {
  const demo = buildDemoStorageRequest(now);
  return {
    ...STORAGE_REQUEST_FORM_DEFAULTS,
    companyName: demo.companyName,
    contactName: demo.contactName,
    contactEmail: demo.contactEmail,
    location: demo.location,
    maxDistanceMiles: demo.maxDistanceMiles ?? STORAGE_REQUEST_FORM_DEFAULTS.maxDistanceMiles,
    pallets: demo.pallets,
    startDate: demo.startDate,
    endDate: demo.endDate,
    needsTemperatureControl: demo.needsTemperatureControl ?? false,
    needsFoodGrade: demo.needsFoodGrade ?? false,
    maxBudgetTotal: demo.maxBudgetTotal ?? Number.NaN,
    notes: demo.notes ?? '',
  };
}
