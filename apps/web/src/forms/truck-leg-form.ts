import {
  CreateTruckLegInputSchema,
  type CreateTruckLegPayload,
  LoadState,
  LocationSchema,
  TrailerType,
  TRANSPORT_POLICY,
  TruckPricingBasis,
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
const blankToZero = (n: number) => (Number.isNaN(n) ? 0 : n);

/**
 * Raw form values → wire payload → the shared CreateTruckLegInputSchema, the same schema the API
 * runs, so client and server enforce identical rules and messages.
 *
 * Committed capacity is normalised here, not in the UI: an EMPTY leg always sends 0, whatever the
 * (hidden) committed inputs still hold from an earlier PARTIAL choice. A blank committed field on a
 * PARTIAL leg counts as 0, so the shared "must have some committed" rule reports it.
 */
export const TruckLegFormSchema = z
  .object({
    companyName: required('Company'),
    contactName: required('Contact name'),
    contactEmail: required('Email'),
    origin: chosenLocation,
    destination: chosenLocation,
    departureEarliest: localDateTime('Earliest departure'),
    departureLatest: localDateTime('Latest departure'),
    arriveBy: z.string(),
    loadState: LoadState,
    trailerType: TrailerType,
    totalPallets: requiredNumber('Total pallets'),
    totalWeightLbs: requiredNumber('Total weight'),
    committedPallets: optionalNumber,
    committedWeightLbs: optionalNumber,
    maxDetourMiles: requiredNumber('Max detour'),
    pricingBasis: TruckPricingBasis,
    priceAmount: requiredNumber('Price'),
    notes: z.string(),
  })
  .transform((v): CreateTruckLegPayload => ({
    ...v,
    departureEarliest: toIso(v.departureEarliest),
    departureLatest: toIso(v.departureLatest),
    arriveBy: v.arriveBy ? toIso(v.arriveBy) : undefined,
    committedPallets: v.loadState === 'EMPTY' ? 0 : blankToZero(v.committedPallets),
    committedWeightLbs: v.loadState === 'EMPTY' ? 0 : blankToZero(v.committedWeightLbs),
    notes: v.notes.trim() || undefined,
  }))
  .pipe(CreateTruckLegInputSchema);

export type TruckLegFormValues = z.input<typeof TruckLegFormSchema>;

/**
 * Editable starting values. 26 pallets / 45,000 lb are a convenience for a typical 53′ dry van, not a
 * spec for any trailer; changing the trailer type deliberately leaves them alone.
 */
export const TRUCK_LEG_FORM_DEFAULTS = {
  origin: null,
  destination: null,
  arriveBy: '',
  loadState: 'EMPTY',
  trailerType: 'DRY_VAN',
  totalPallets: 26,
  totalWeightLbs: 45_000,
  committedPallets: Number.NaN,
  committedWeightLbs: Number.NaN,
  maxDetourMiles: TRANSPORT_POLICY.defaultMaxDetourMiles,
  pricingBasis: 'FLAT',
  priceAmount: Number.NaN,
  notes: '',
} as const satisfies Partial<TruckLegFormValues>;

/** Room left on a leg (total − committed, blanks counting as 0), for the live form text. */
export function spareCapacity(v: {
  totalPallets: number;
  totalWeightLbs: number;
  committedPallets: number;
  committedWeightLbs: number;
}) {
  return {
    pallets: blankToZero(v.totalPallets) - blankToZero(v.committedPallets),
    weightLbs: blankToZero(v.totalWeightLbs) - blankToZero(v.committedWeightLbs),
  };
}
