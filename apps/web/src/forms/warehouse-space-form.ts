import {
  CreateWarehouseSpaceInputSchema,
  type CreateWarehouseSpacePayload,
  LocationSchema,
  STORAGE_POLICY,
  StoragePricingPeriod,
} from '@deadspace/shared';
import { z } from 'zod';

const required = (label: string) => z.string().trim().min(1, `${label} is required`);
/** A place picked from the autocomplete; null until the user chooses one. */
const chosenLocation = LocationSchema.nullable().transform((v, ctx) => {
  if (v !== null) return v;
  ctx.addIssue({ code: 'custom', message: 'Choose a location from the suggestions' });
  return z.NEVER;
});
// <input type="date"> yields YYYY-MM-DD, or '' when empty.
const calendarDay = (label: string) => z.string().min(1, `${label} is required`);
// <input type="number"> registered with valueAsNumber yields NaN when empty.
const requiredNumber = (label: string) => z.number({ error: `${label} is required` });
const optionalNumber = z.number().or(z.nan());
const blankToUndefined = (n: number) => (Number.isNaN(n) ? undefined : n);

/**
 * Raw form values → wire payload → the shared CreateWarehouseSpaceInputSchema, the same schema the
 * API runs, so client and server enforce identical rules and messages.
 */
export const WarehouseSpaceFormSchema = z
  .object({
    companyName: required('Company'),
    contactName: required('Contact name'),
    contactEmail: required('Email'),
    location: chosenLocation,
    quantityAvailable: requiredNumber('Pallet positions'),
    minPallets: optionalNumber,
    availableFrom: calendarDay('Available-from date'),
    availableTo: calendarDay('Available-until date'),
    minStorageDays: requiredNumber('Minimum stay'),
    temperatureControlled: z.boolean(),
    foodGrade: z.boolean(),
    pricingPeriod: StoragePricingPeriod,
    pricePerPalletPerPeriod: requiredNumber('Price'),
    handlingFeePerPallet: optionalNumber,
    notes: z.string(),
  })
  .transform((v): CreateWarehouseSpacePayload => ({
    ...v,
    minPallets: blankToUndefined(v.minPallets),
    handlingFeePerPallet: blankToUndefined(v.handlingFeePerPallet),
    notes: v.notes.trim() || undefined,
  }))
  .pipe(CreateWarehouseSpaceInputSchema);

export type WarehouseSpaceFormValues = z.input<typeof WarehouseSpaceFormSchema>;

/** Editable starting values; everything else the operator must fill in. */
export const WAREHOUSE_FORM_DEFAULTS = {
  location: null,
  quantityAvailable: Number.NaN,
  minPallets: Number.NaN,
  availableFrom: '',
  availableTo: '',
  minStorageDays: STORAGE_POLICY.defaultMinStorageDays,
  temperatureControlled: false,
  foodGrade: false,
  pricingPeriod: 'MONTH',
  pricePerPalletPerPeriod: Number.NaN,
  handlingFeePerPallet: Number.NaN,
  notes: '',
} as const satisfies Partial<WarehouseSpaceFormValues>;
