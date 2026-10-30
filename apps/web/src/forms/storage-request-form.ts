import {
  CreateStorageRequestInputSchema,
  type CreateStorageRequestPayload,
  LocationSchema,
  STORAGE_POLICY,
} from '@deadspace/shared';
import { z } from 'zod';

const required = (label: string) => z.string().trim().min(1, `${label} is required`);
/** A place picked from the autocomplete; null until the user chooses one. */
const chosenLocation = LocationSchema.nullable().transform((v, ctx) => {
  if (v !== null) return v;
  ctx.addIssue({ code: 'custom', message: 'Choose a location from the suggestions' });
  return z.NEVER;
});
const calendarDay = (label: string) => z.string().min(1, `${label} is required`);
// <input type="number"> registered with valueAsNumber yields NaN when empty.
const requiredNumber = (label: string) => z.number({ error: `${label} is required` });
const optionalNumber = z.number().or(z.nan());

/**
 * Raw form values → wire payload → the shared CreateStorageRequestInputSchema, the same schema the
 * API runs, so client and server enforce identical rules and messages.
 */
export const StorageRequestFormSchema = z
  .object({
    companyName: required('Company'),
    contactName: required('Contact name'),
    contactEmail: required('Email'),
    location: chosenLocation,
    maxDistanceMiles: requiredNumber('Search radius'),
    pallets: requiredNumber('Pallet positions'),
    startDate: calendarDay('Start date'),
    endDate: calendarDay('End date'),
    needsTemperatureControl: z.boolean(),
    needsFoodGrade: z.boolean(),
    maxBudgetTotal: optionalNumber,
    notes: z.string(),
  })
  .transform((v): CreateStorageRequestPayload => ({
    ...v,
    maxBudgetTotal: Number.isNaN(v.maxBudgetTotal) ? undefined : v.maxBudgetTotal,
    notes: v.notes.trim() || undefined,
  }))
  .pipe(CreateStorageRequestInputSchema);

export type StorageRequestFormValues = z.input<typeof StorageRequestFormSchema>;

/** Editable starting values; everything else the shipper must fill in. */
export const STORAGE_REQUEST_FORM_DEFAULTS = {
  location: null,
  maxDistanceMiles: STORAGE_POLICY.defaultMaxDistanceMiles,
  pallets: Number.NaN,
  startDate: '',
  endDate: '',
  needsTemperatureControl: false,
  needsFoodGrade: false,
  maxBudgetTotal: Number.NaN,
  notes: '',
} as const satisfies Partial<StorageRequestFormValues>;
