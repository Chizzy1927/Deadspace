import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateStorageRequestInput,
  daysBetween,
  STORAGE_LIMITS,
  STORAGE_POLICY,
  type StorageRequest,
} from '@deadspace/shared';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Controller, type FieldErrors, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { createStorageRequest, fetchStorageRequest } from '../api/storage';
import { EditFromNotice } from '../components/EditSearch';
import { ExampleFill } from '../components/ExampleFill';
import { Field } from '../components/Field';
import { LocationInput } from '../components/LocationInput';
import { storageExampleValues } from '../forms/demo-prefill';
import { fieldAria, firstInvalidField, inputClass } from '../forms/field-aria';
import { storageRequestToFormValues } from '../forms/request-prefill';
import { submitErrorMessage } from '../forms/server-errors';
import {
  STORAGE_REQUEST_FORM_DEFAULTS,
  StorageRequestFormSchema,
  type StorageRequestFormValues,
} from '../forms/storage-request-form';
import { useEditFromId, useEditFromRequest } from '../forms/use-edit-from';
import { useExamplePrefill, useExampleRequested } from '../forms/use-example-prefill';
import { formatDays } from '../format';

/** Every form field, in on-screen order (the order errors are focused in). */
const FIELDS = [
  'location',
  'maxDistanceMiles',
  'pallets',
  'startDate',
  'endDate',
  'needsTemperatureControl',
  'needsFoodGrade',
  'maxBudgetTotal',
  'companyName',
  'contactName',
  'contactEmail',
  'notes',
] as const satisfies readonly (keyof StorageRequestFormValues)[];

/** UI convenience only: the shared rule accepts any whole number of miles from 1 to the policy max. */
const RADIUS_SLIDER_STEP = 5;

const legendClass = 'mb-2 font-semibold';

const asDay = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

export function StorageRequestPage() {
  const editFrom = useEditFromId();
  const edit = useEditFromRequest(editFrom, 'storage-request', fetchStorageRequest);
  if (edit.state === 'loading') {
    return (
      <p role="status" className="text-slate-600">
        Loading your previous search…
      </p>
    );
  }
  // Keyed so a different editFrom id remounts the form with its own default values.
  return (
    <StorageRequestForm
      key={editFrom ?? 'new'}
      previous={edit.data}
      notice={<EditFromNotice state={edit.state} message={edit.error?.message} />}
    />
  );
}

interface StorageRequestFormProps {
  /** The saved request named by `?editFrom=`; its values become the form's defaults. */
  previous: StorageRequest | undefined;
  notice: ReactNode;
}

function StorageRequestForm({ previous, notice }: StorageRequestFormProps) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const exampleParam = useExampleRequested();
  const editFrom = useEditFromId();
  // A previous search (or an attempt to load one) takes precedence over the landing page's example link.
  const exampleRequested = exampleParam && editFrom === null;
  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    reset,
    formState: { errors },
  } = useForm<StorageRequestFormValues, unknown, CreateStorageRequestInput>({
    resolver: zodResolver(StorageRequestFormSchema),
    defaultValues: previous
      ? storageRequestToFormValues(previous)
      : exampleRequested
        ? storageExampleValues(new Date())
        : STORAGE_REQUEST_FORM_DEFAULTS,
    shouldFocusError: false, // see onInvalid below
  });

  const { fill, fillCount } = useExamplePrefill(reset, storageExampleValues, exampleRequested);

  const [maxDistanceMiles, startDate, endDate] = useWatch({
    control,
    name: ['maxDistanceMiles', 'startDate', 'endDate'],
  });
  const stayDays = startDate && endDate ? daysBetween(asDay(startDate), asDay(endDate)) : 0;

  const submit = useMutation({
    mutationFn: createStorageRequest,
    onMutate: () => setFormError(null),
    onSuccess: (request) => navigate(`/requests/storage/${request.id}/matches`),
    onError: (error) => setFormError(submitErrorMessage(error, FIELDS, setError)),
  });

  // RHF's built-in focus visits Controller fields (the location) last; focus in on-screen order instead.
  const onInvalid = (invalid: FieldErrors<StorageRequestFormValues>) => {
    const first = firstInvalidField(FIELDS, invalid);
    if (first) setFocus(first);
  };

  const aria = (name: (typeof FIELDS)[number], opts: { hint?: boolean } = {}) =>
    fieldAria(name, { ...opts, error: errors[name]?.message });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request storage</h1>
        <p className="text-slate-600">
          Tell us how many pallet positions you need, where and for how long. We match it against idle warehouse space
          operators have offered.
        </p>
        <ExampleFill onFill={fill} filled={fillCount > 0} />
        <div className="mt-2">{notice}</div>
      </div>

      <form
        noValidate
        onSubmit={(e) => void handleSubmit((input) => submit.mutate(input), onInvalid)(e)}
        className="space-y-6"
      >
        <fieldset className="space-y-4">
          <legend className={legendClass}>Where</legend>
          <Controller
            control={control}
            name="location"
            render={({ field, fieldState }) => (
              <LocationInput
                key={`location-${fillCount}`}
                label="Where do you need storage?"
                {...field}
                error={fieldState.error?.message}
              />
            )}
          />
          <Field
            id="maxDistanceMiles"
            label={
              <>
                Search radius: <output htmlFor="maxDistanceMiles">{maxDistanceMiles} est. miles</output>
              </>
            }
            hint="Measured in est. road miles. A wider radius finds more sites; it doesn't change how a site's location is scored."
            error={errors.maxDistanceMiles?.message}
          >
            <input
              type="range"
              min={RADIUS_SLIDER_STEP}
              max={STORAGE_POLICY.maxDistanceMiles}
              step={RADIUS_SLIDER_STEP}
              // Without a matching default attribute a range reports its midpoint, which RHF mistakes for
              // a user edit before the form is ready and adopts in place of the default.
              defaultValue={STORAGE_REQUEST_FORM_DEFAULTS.maxDistanceMiles}
              aria-valuetext={`${maxDistanceMiles} estimated miles`}
              className="mt-2 w-full"
              {...aria('maxDistanceMiles', { hint: true })}
              {...register('maxDistanceMiles', { valueAsNumber: true })}
            />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className={legendClass}>What and when</legend>
          <Field id="pallets" label="Pallet positions needed" error={errors.pallets?.message}>
            <input
              type="number"
              min={1}
              max={STORAGE_LIMITS.maxPallets}
              className={inputClass}
              {...aria('pallets')}
              {...register('pallets', { valueAsNumber: true })}
            />
          </Field>
          <Field
            id="startDate"
            label="Move in on"
            hint={`Within ${STORAGE_POLICY.maxDaysAhead} days from today.`}
            error={errors.startDate?.message}
          >
            <input
              type="date"
              className={inputClass}
              {...aria('startDate', { hint: true })}
              {...register('startDate')}
            />
          </Field>
          <Field
            id="endDate"
            label="Move out on"
            hint={`Stay up to ${STORAGE_POLICY.maxStorageDays} days.`}
            error={errors.endDate?.message}
          >
            <input type="date" className={inputClass} {...aria('endDate', { hint: true })} {...register('endDate')} />
          </Field>
          {/* Rendered always so the live region exists before its text changes. */}
          <p aria-live="polite" className="text-sm font-medium text-slate-700 sm:col-span-3">
            {stayDays >= 1 ? `${formatDays(stayDays)} stay` : ''}
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={legendClass}>Requirements</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('needsTemperatureControl')} />
            Needs temperature control
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('needsFoodGrade')} />
            Needs food-grade storage
          </label>
          <p className="text-sm text-slate-500">
            Matched against what operators declare. DeadSpace does not verify certifications or capabilities, so confirm
            them with the operator.
          </p>
        </fieldset>

        <fieldset className="sm:w-1/2">
          <legend className={legendClass}>Budget</legend>
          <Field
            id="maxBudgetTotal"
            label="Max total budget for the whole stay, USD (optional)"
            hint="Prices are compared with this budget. Without one, they're compared with the median of matching sites."
            error={errors.maxBudgetTotal?.message}
          >
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              {...aria('maxBudgetTotal', { hint: true })}
              {...register('maxBudgetTotal', { valueAsNumber: true })}
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
            Could not submit your request: {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {submit.isPending ? 'Finding warehouses…' : 'Find matching warehouses'}
        </button>
      </form>
    </section>
  );
}
