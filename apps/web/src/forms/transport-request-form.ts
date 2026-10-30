import {
  CreateTransportRequestInputSchema,
  type CreateTransportRequestPayload,
  LocationSchema,
  TrailerType,
} from '@deadspace/shared';
import { z } from 'zod';

const required = (label: string) => z.string().trim().min(1, `${label} is required`);
/** A place picked from the autocomplete; null until the user chooses one. */
const chosenLocation = LocationSchema.nullable().transform((v, ctx) => {
  if (v !== null) return v;
  ctx.addIssue({ code: 'custom', message: 'Choose a location from the suggestions' });
  return z.NEVER;
});
const localDateTime = (label: string) => z.string().min(1, `${label} is required`);
// <input type="number"> registered with valueAsNumber yields NaN when empty.
const requiredNumber = (label: string) => z.number({ error: `${label} is required` });
const optionalNumber = z.number().or(z.nan());

/** `datetime-local` values are in the browser's time zone; the API takes ISO 8601 instants. */
const toIso = (local: string) => new Date(local).toISOString();

/**
 * Raw form values → wire payload → the shared CreateTransportRequestInputSchema. The final stage is
 * the same schema the API runs, so client and server enforce identical rules and messages.
 */
export const TransportRequestFormSchema = z
  .object({
    companyName: required('Company'),
    contactName: required('Contact name'),
    contactEmail: required('Email'),
    pickup: chosenLocation,
    dropoff: chosenLocation,
    pickupEarliest: localDateTime('Earliest pickup'),
    pickupLatest: localDateTime('Latest pickup'),
    deliverBy: z.string(),
    trailerType: TrailerType,
    pallets: requiredNumber('Pallets'),
    weightLbs: requiredNumber('Weight'),
    maxBudget: optionalNumber,
    notes: z.string(),
  })
  .transform((v): CreateTransportRequestPayload => ({
    ...v,
    pickupEarliest: toIso(v.pickupEarliest),
    pickupLatest: toIso(v.pickupLatest),
    deliverBy: v.deliverBy ? toIso(v.deliverBy) : undefined,
    maxBudget: Number.isNaN(v.maxBudget) ? undefined : v.maxBudget,
    notes: v.notes.trim() || undefined,
  }))
  .pipe(CreateTransportRequestInputSchema);

export type TransportRequestFormValues = z.input<typeof TransportRequestFormSchema>;
