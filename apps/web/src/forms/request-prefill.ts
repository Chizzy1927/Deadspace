import type { StorageRequest, TransportRequest } from '@deadspace/shared';
import { toLocalDateTime } from './demo-prefill';
import type { StorageRequestFormValues } from './storage-request-form';
import type { TransportRequestFormValues } from './transport-request-form';

/** Query parameter that tells a request form to load a previously submitted request. */
export const EDIT_FROM_PARAM = 'editFrom';

export const transportEditPath = (requestId: string) =>
  `/request/transport?${EDIT_FROM_PARAM}=${encodeURIComponent(requestId)}`;

export const storageEditPath = (requestId: string) =>
  `/request/storage?${EDIT_FROM_PARAM}=${encodeURIComponent(requestId)}`;

/** A persisted transport request (as the API returns it) → raw form values. Resubmitting creates a new request. */
export function transportRequestToFormValues(request: TransportRequest): TransportRequestFormValues {
  return {
    companyName: request.companyName,
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    pickup: request.pickup,
    dropoff: request.dropoff,
    pickupEarliest: toLocalDateTime(request.pickupEarliest),
    pickupLatest: toLocalDateTime(request.pickupLatest),
    deliverBy: request.deliverBy ? toLocalDateTime(request.deliverBy) : '',
    trailerType: request.trailerType,
    pallets: request.pallets,
    weightLbs: request.weightLbs,
    maxBudget: request.maxBudget ?? Number.NaN,
    notes: request.notes ?? '',
  };
}

/** A persisted storage request (as the API returns it) → raw form values. Resubmitting creates a new request. */
export function storageRequestToFormValues(request: StorageRequest): StorageRequestFormValues {
  return {
    companyName: request.companyName,
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    location: request.location,
    maxDistanceMiles: request.maxDistanceMiles,
    pallets: request.pallets,
    startDate: request.startDate,
    endDate: request.endDate,
    needsTemperatureControl: request.needsTemperatureControl,
    needsFoodGrade: request.needsFoodGrade,
    maxBudgetTotal: request.maxBudgetTotal ?? Number.NaN,
    notes: request.notes ?? '',
  };
}
