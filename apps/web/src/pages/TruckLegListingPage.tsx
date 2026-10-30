import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateTruckLegInput,
  LoadState,
  TrailerType,
  TRANSPORT_LIMITS,
  TRANSPORT_POLICY,
  TruckPricingBasis,
} from '@deadspace/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, type FieldErrors, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { createTruckLeg } from '../api/transport';
import { Field } from '../components/Field';
import { fieldAria, firstInvalidField, inputClass } from '../forms/field-aria';
import { LocationInput } from '../components/LocationInput';
import { submitErrorMessage } from '../forms/server-errors';
import {
  spareCapacity,
  TRUCK_LEG_FORM_DEFAULTS,
  TruckLegFormSchema,
  type TruckLegFormValues,
} from '../forms/truck-leg-form';
import { formatSpareCapacity, TRAILER_LABELS } from '../format';

/** Every form field, in on-screen order (the order errors are focused in). */
const FIELDS = [
  'origin',
  'destination',
  'departureEarliest',
  'departureLatest',
  'arriveBy',
  'loadState',
  'committedPallets',
  'committedWeightLbs',
  'trailerType',
  'totalPallets',
  'totalWeightLbs',
  'maxDetourMiles',
  'pricingBasis',
  'priceAmount',
  'companyName',
  'contactName',
  'contactEmail',
  'notes',
] as const satisfies readonly (keyof TruckLegFormValues)[];

const LOAD_STATE_LABELS: Record<LoadState, string> = { EMPTY: 'Empty', PARTIAL: 'Partly loaded' };
const PRICING_LABELS: Record<TruckPricingBasis, string> = {
  FLAT: 'Flat price',
  PER_LOADED_MILE: 'Rate per loaded mile',
};

/** UI convenience only: the shared rule accepts any whole number of miles from 1 to the policy max. */
const DETOUR_SLIDER_STEP = 5;

const legendClass = 'mb-2 font-semibold';

export function TruckLegListingPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<TruckLegFormValues, unknown, CreateTruckLegInput>({
    resolver: zodResolver(TruckLegFormSchema),
    defaultValues: TRUCK_LEG_FORM_DEFAULTS,
    shouldFocusError: false, // see onInvalid below
  });

  const [loadState, pricingBasis, maxDetourMiles, totalPallets, totalWeightLbs, committedPallets, committedWeightLbs] =
    useWatch({
      control,
      name: [
        'loadState',
        'pricingBasis',
        'maxDetourMiles',
        'totalPallets',
        'totalWeightLbs',
        'committedPallets',
        'committedWeightLbs',
      ],
    });
  const spare = spareCapacity({ totalPallets, totalWeightLbs, committedPallets, committedWeightLbs });

  const submit = useMutation({
    mutationFn: createTruckLeg,
    onMutate: () => setFormError(null),
    onSuccess: (leg) => navigate(`/listings/truck/${leg.id}`),
    onError: (error) => setFormError(submitErrorMessage(error, FIELDS, setError)),
  });

  // RHF's built-in focus visits Controller fields (the locations) last; focus in on-screen order instead.
  const onInvalid = (invalid: FieldErrors<TruckLegFormValues>) => {
    const first = firstInvalidField(FIELDS, invalid);
    if (first) setFocus(first);
  };

  const aria = (name: (typeof FIELDS)[number], opts: { hint?: boolean } = {}) =>
    fieldAria(name, { ...opts, error: errors[name]?.message });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fill your empty or part-empty leg</h1>
        <p className="text-slate-600">
          Tell us about a trip you&rsquo;re already planning. Shippers with freight along the way can be matched to your
          spare room.
        </p>
      </div>

      <form
        noValidate
        onSubmit={(e) => void handleSubmit((input) => submit.mutate(input), onInvalid)(e)}
        className="space-y-6"
      >
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className={legendClass}>Your trip</legend>
          <Controller
            control={control}
            name="origin"
            render={({ field, fieldState }) => (
              <LocationInput label="Where will your truck be free?" {...field} error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="destination"
            render={({ field, fieldState }) => (
              <LocationInput label="Where are you heading next?" {...field} error={fieldState.error?.message} />
            )}
          />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className={legendClass}>When are you leaving? (your local time)</legend>
          <Field id="departureEarliest" label="Leaving from" error={errors.departureEarliest?.message}>
            <input
              type="datetime-local"
              className={inputClass}
              {...aria('departureEarliest')}
              {...register('departureEarliest')}
            />
          </Field>
          <Field
            id="departureLatest"
            label="Leaving no later than"
            hint={`Window up to ${TRANSPORT_POLICY.maxDepartureWindowHours} hours, within ${TRANSPORT_POLICY.maxDaysAhead} days.`}
            error={errors.departureLatest?.message}
          >
            <input
              type="datetime-local"
              className={inputClass}
              {...aria('departureLatest', { hint: true })}
              {...register('departureLatest')}
            />
          </Field>
          <Field id="arriveBy" label="Must arrive by (optional)" error={errors.arriveBy?.message}>
            <input type="datetime-local" className={inputClass} {...aria('arriveBy')} {...register('arriveBy')} />
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className={legendClass}>Is the trailer empty or partly loaded?</legend>
          <div className="flex gap-6">
            {LoadState.options.map((state) => (
              <label key={state} className="flex items-center gap-2">
                <input type="radio" value={state} {...register('loadState')} />
                {LOAD_STATE_LABELS[state]}
              </label>
            ))}
          </div>
          {loadState === 'PARTIAL' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="committedPallets" label="Pallets already on board" error={errors.committedPallets?.message}>
                <input
                  type="number"
                  min={0}
                  max={TRANSPORT_LIMITS.maxPallets}
                  className={inputClass}
                  {...aria('committedPallets')}
                  {...register('committedPallets', { valueAsNumber: true })}
                />
              </Field>
              <Field
                id="committedWeightLbs"
                label="Weight already on board (lb)"
                error={errors.committedWeightLbs?.message}
              >
                <input
                  type="number"
                  min={0}
                  max={TRANSPORT_LIMITS.maxWeightLbs}
                  className={inputClass}
                  {...aria('committedWeightLbs')}
                  {...register('committedWeightLbs', { valueAsNumber: true })}
                />
              </Field>
            </div>
          )}
          {/* Rendered for both states so the live region exists before its text changes. */}
          <p aria-live="polite" className="text-sm font-medium text-slate-700">
            {loadState === 'PARTIAL' ? formatSpareCapacity(spare.pallets, spare.weightLbs) : ''}
          </p>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className={legendClass}>Equipment &amp; room</legend>
          <Field id="trailerType" label="Trailer type" error={errors.trailerType?.message}>
            <select className={inputClass} {...aria('trailerType')} {...register('trailerType')}>
              {TrailerType.options.map((t) => (
                <option key={t} value={t}>
                  {TRAILER_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="totalPallets" label="Total pallet capacity" error={errors.totalPallets?.message}>
            <input
              type="number"
              min={1}
              max={TRANSPORT_LIMITS.maxPallets}
              className={inputClass}
              {...aria('totalPallets')}
              {...register('totalPallets', { valueAsNumber: true })}
            />
          </Field>
          <Field id="totalWeightLbs" label="Total weight capacity (lb)" error={errors.totalWeightLbs?.message}>
            <input
              type="number"
              min={1}
              max={TRANSPORT_LIMITS.maxWeightLbs}
              className={inputClass}
              {...aria('totalWeightLbs')}
              {...register('totalWeightLbs', { valueAsNumber: true })}
            />
          </Field>
          <p className="text-sm text-slate-500 sm:col-span-3">
            Pre-filled for a typical 53′ dry van. Change them to match your trailer.
          </p>
        </fieldset>

        <fieldset>
          <legend className={legendClass}>How far off your route will you go?</legend>
          <Field
            id="maxDetourMiles"
            label={
              <>
                Max detour: <output htmlFor="maxDetourMiles">{maxDetourMiles} miles</output>
              </>
            }
            hint="A larger allowance lets your leg qualify for more shipments. It doesn't change how your leg ranks."
            error={errors.maxDetourMiles?.message}
          >
            <input
              type="range"
              min={DETOUR_SLIDER_STEP}
              max={TRANSPORT_POLICY.maxCarrierDetourMiles}
              step={DETOUR_SLIDER_STEP}
              // Without a matching default attribute a range reports its midpoint, which RHF mistakes for
              // a user edit before the form is ready and adopts in place of the default.
              defaultValue={TRUCK_LEG_FORM_DEFAULTS.maxDetourMiles}
              aria-valuetext={`${maxDetourMiles} miles`}
              className="mt-2 w-full"
              {...aria('maxDetourMiles', { hint: true })}
              {...register('maxDetourMiles', { valueAsNumber: true })}
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className={legendClass}>Price</legend>
          <div className="flex gap-6">
            {TruckPricingBasis.options.map((basis) => (
              <label key={basis} className="flex items-center gap-2">
                <input type="radio" value={basis} {...register('pricingBasis')} />
                {PRICING_LABELS[basis]}
              </label>
            ))}
          </div>
          <div className="sm:w-1/2">
            <Field
              id="priceAmount"
              label={pricingBasis === 'FLAT' ? 'Flat price for the shipment (USD)' : 'Rate per loaded mile (USD)'}
              hint={
                pricingBasis === 'PER_LOADED_MILE'
                  ? 'Shippers see an est. price: your rate × the est. miles their freight is on board (pickup → dropoff).'
                  : undefined
              }
              error={errors.priceAmount?.message}
            >
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                {...aria('priceAmount', { hint: pricingBasis === 'PER_LOADED_MILE' })}
                {...register('priceAmount', { valueAsNumber: true })}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className={legendClass}>Contact</legend>
          <Field id="companyName" label="Company" error={errors.companyName?.message}>
            <input className={inputClass} {...aria('companyName')} {...register('companyName')} />
          </Field>
          <Field id="contactName" label="Your name" error={errors.contactName?.message}>
            <input className={inputClass} {...aria('contactName')} {...register('contactName')} />
          </Field>
          <Field id="contactEmail" label="Email" error={errors.contactEmail?.message}>
            <input type="email" className={inputClass} {...aria('contactEmail')} {...register('contactEmail')} />
          </Field>
        </fieldset>

        <Field id="notes" label="Notes (optional)" error={errors.notes?.message}>
          <textarea rows={3} className={inputClass} {...aria('notes')} {...register('notes')} />
        </Field>

        {formError && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-red-800">
            Could not list your leg: {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {submit.isPending ? 'Listing…' : 'List this leg'}
        </button>
      </form>
    </section>
  );
}
