import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateWarehouseSpaceInput,
  STORAGE_LIMITS,
  STORAGE_POLICY,
  StoragePricingPeriod,
} from '@deadspace/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, type FieldErrors, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { createWarehouseSpace } from '../api/storage';
import { Field } from '../components/Field';
import { LocationInput } from '../components/LocationInput';
import { fieldAria, firstInvalidField, inputClass } from '../forms/field-aria';
import { submitErrorMessage } from '../forms/server-errors';
import {
  WAREHOUSE_FORM_DEFAULTS,
  WarehouseSpaceFormSchema,
  type WarehouseSpaceFormValues,
} from '../forms/warehouse-space-form';
import { PRICING_PERIOD_LABELS } from '../format';

/** Every form field, in on-screen order (the order errors are focused in). */
const FIELDS = [
  'location',
  'quantityAvailable',
  'minPallets',
  'availableFrom',
  'availableTo',
  'minStorageDays',
  'temperatureControlled',
  'foodGrade',
  'pricingPeriod',
  'pricePerPalletPerPeriod',
  'handlingFeePerPallet',
  'companyName',
  'contactName',
  'contactEmail',
  'notes',
] as const satisfies readonly (keyof WarehouseSpaceFormValues)[];

const legendClass = 'mb-2 font-semibold';

export function WarehouseSpaceListingPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<WarehouseSpaceFormValues, unknown, CreateWarehouseSpaceInput>({
    resolver: zodResolver(WarehouseSpaceFormSchema),
    defaultValues: WAREHOUSE_FORM_DEFAULTS,
    shouldFocusError: false, // see onInvalid below
  });

  const pricingPeriod = useWatch({ control, name: 'pricingPeriod' });
  const period = pricingPeriod.toLowerCase();

  const submit = useMutation({
    mutationFn: createWarehouseSpace,
    onMutate: () => setFormError(null),
    onSuccess: (space) => navigate(`/listings/warehouse/${space.id}`),
    onError: (error) => setFormError(submitErrorMessage(error, FIELDS, setError)),
  });

  // RHF's built-in focus visits Controller fields (the location) last; focus in on-screen order instead.
  const onInvalid = (invalid: FieldErrors<WarehouseSpaceFormValues>) => {
    const first = firstInvalidField(FIELDS, invalid);
    if (first) setFocus(first);
  };

  const aria = (name: (typeof FIELDS)[number], opts: { hint?: boolean } = {}) =>
    fieldAria(name, { ...opts, error: errors[name]?.message });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">List idle warehouse space</h1>
        <p className="text-slate-600">
          Offer pallet positions you aren&rsquo;t using for a bounded window. Shippers who need storage nearby can be
          matched to them.
        </p>
      </div>

      <form
        noValidate
        onSubmit={(e) => void handleSubmit((input) => submit.mutate(input), onInvalid)(e)}
        className="space-y-6"
      >
        <fieldset>
          <legend className={legendClass}>Location</legend>
          <Controller
            control={control}
            name="location"
            render={({ field, fieldState }) => (
              <LocationInput label="Where is the space?" {...field} error={fieldState.error?.message} />
            )}
          />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className={legendClass}>Space you&rsquo;re offering</legend>
          <Field
            id="quantityAvailable"
            label="Pallet positions offered"
            hint="The positions you are offering through DeadSpace for this window."
            error={errors.quantityAvailable?.message}
          >
            <input
              type="number"
              min={1}
              max={STORAGE_LIMITS.maxPallets}
              className={inputClass}
              {...aria('quantityAvailable', { hint: true })}
              {...register('quantityAvailable', { valueAsNumber: true })}
            />
          </Field>
          <Field
            id="minPallets"
            label="Smallest block you'll rent (optional)"
            hint="Requests below this many pallets won't match."
            error={errors.minPallets?.message}
          >
            <input
              type="number"
              min={1}
              max={STORAGE_LIMITS.maxPallets}
              className={inputClass}
              {...aria('minPallets', { hint: true })}
              {...register('minPallets', { valueAsNumber: true })}
            />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className={legendClass}>When is it available?</legend>
          <Field id="availableFrom" label="Available from" error={errors.availableFrom?.message}>
            <input type="date" className={inputClass} {...aria('availableFrom')} {...register('availableFrom')} />
          </Field>
          <Field
            id="availableTo"
            label="Available through (last day goods may be on site)"
            hint={`Window up to ${STORAGE_POLICY.maxAvailabilityDays} days, starting within ${STORAGE_POLICY.maxDaysAhead} days.`}
            error={errors.availableTo?.message}
          >
            <input
              type="date"
              className={inputClass}
              {...aria('availableTo', { hint: true })}
              {...register('availableTo')}
            />
          </Field>
          <Field id="minStorageDays" label="Minimum stay (days)" error={errors.minStorageDays?.message}>
            <input
              type="number"
              min={1}
              max={STORAGE_POLICY.maxAvailabilityDays}
              className={inputClass}
              {...aria('minStorageDays')}
              {...register('minStorageDays', { valueAsNumber: true })}
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={legendClass}>Capabilities</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('temperatureControlled')} />
            Temperature-controlled
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('foodGrade')} />
            Food-grade
          </label>
          <p className="text-sm text-slate-500">
            Self-declared. DeadSpace does not verify certifications or capabilities; shippers will see these as declared
            by you.
          </p>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className={legendClass}>Price</legend>
          <Field id="pricingPeriod" label="Billed per" error={errors.pricingPeriod?.message}>
            <select className={inputClass} {...aria('pricingPeriod')} {...register('pricingPeriod')}>
              {StoragePricingPeriod.options.map((p) => (
                <option key={p} value={p}>
                  {PRICING_PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="pricePerPalletPerPeriod"
            label={`Price per pallet per ${period} (USD)`}
            error={errors.pricePerPalletPerPeriod?.message}
          >
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              {...aria('pricePerPalletPerPeriod')}
              {...register('pricePerPalletPerPeriod', { valueAsNumber: true })}
            />
          </Field>
          <Field
            id="handlingFeePerPallet"
            label="Handling fee per pallet, in and out combined (optional)"
            hint="One flat fee per pallet, however long the stay."
            error={errors.handlingFeePerPallet?.message}
          >
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              {...aria('handlingFeePerPallet', { hint: true })}
              {...register('handlingFeePerPallet', { valueAsNumber: true })}
            />
          </Field>
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
            Could not list your space: {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {submit.isPending ? 'Listing…' : 'List this space'}
        </button>
      </form>
    </section>
  );
}
