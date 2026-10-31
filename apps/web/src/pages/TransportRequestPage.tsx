import { zodResolver } from '@hookform/resolvers/zod';
import { type CreateTransportRequestInput, TRANSPORT_LIMITS, TrailerType } from '@deadspace/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, type FieldErrors, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { createTransportRequest } from '../api/transport';
import { ExampleFill } from '../components/ExampleFill';
import { Field } from '../components/Field';
import { transportExampleValues } from '../forms/demo-prefill';
import { fieldAria, firstInvalidField, inputClass } from '../forms/field-aria';
import { LocationInput } from '../components/LocationInput';
import { submitErrorMessage } from '../forms/server-errors';
import { useExamplePrefill, useExampleRequested } from '../forms/use-example-prefill';
import { TransportRequestFormSchema, type TransportRequestFormValues } from '../forms/transport-request-form';
import { TRAILER_LABELS } from '../format';

/** Every form field, in on-screen order (the order errors are focused in). */
const FIELDS = [
  'pickup',
  'dropoff',
  'pickupEarliest',
  'pickupLatest',
  'deliverBy',
  'trailerType',
  'pallets',
  'weightLbs',
  'maxBudget',
  'companyName',
  'contactName',
  'contactEmail',
  'notes',
] as const satisfies readonly (keyof TransportRequestFormValues)[];

export function TransportRequestPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const exampleRequested = useExampleRequested();
  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    reset,
    formState: { errors },
  } = useForm<TransportRequestFormValues, unknown, CreateTransportRequestInput>({
    resolver: zodResolver(TransportRequestFormSchema),
    defaultValues: exampleRequested
      ? transportExampleValues(new Date())
      : {
          pickup: null,
          dropoff: null,
          deliverBy: '',
          trailerType: 'DRY_VAN',
          maxBudget: Number.NaN,
          notes: '',
        },
    shouldFocusError: false, // see onInvalid below
  });
  const { fill, fillCount } = useExamplePrefill(reset, transportExampleValues, exampleRequested);

  const submit = useMutation({
    mutationFn: createTransportRequest,
    onMutate: () => setFormError(null),
    onSuccess: (request) => navigate(`/requests/transport/${request.id}/matches`),
    onError: (error) => setFormError(submitErrorMessage(error, FIELDS, setError)),
  });

  // RHF's built-in focus visits Controller fields (the locations) last; focus in on-screen order instead.
  const onInvalid = (invalid: FieldErrors<TransportRequestFormValues>) => {
    const first = firstInvalidField(FIELDS, invalid);
    if (first) setFocus(first);
  };

  const aria = (name: (typeof FIELDS)[number], id: string) => fieldAria(id, { error: errors[name]?.message });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request transport</h1>
        <p className="text-slate-600">
          Tell us what you need moved. We match it against trucks already making a similar trip with spare room.
        </p>
        <ExampleFill onFill={fill} filled={fillCount > 0} />
      </div>

      <form
        noValidate
        onSubmit={(e) => void handleSubmit((input) => submit.mutate(input), onInvalid)(e)}
        className="space-y-6"
      >
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">Route</legend>
          <Controller
            control={control}
            name="pickup"
            render={({ field, fieldState }) => (
              <LocationInput key={`pickup-${fillCount}`} label="Pickup" {...field} error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="dropoff"
            render={({ field, fieldState }) => (
              <LocationInput
                key={`dropoff-${fillCount}`}
                label="Dropoff"
                {...field}
                error={fieldState.error?.message}
              />
            )}
          />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 font-semibold">Timing (your local time)</legend>
          <Field id="pickupEarliest" label="Ready for pickup from" error={errors.pickupEarliest?.message}>
            <input
              type="datetime-local"
              className={inputClass}
              {...aria('pickupEarliest', 'pickupEarliest')}
              {...register('pickupEarliest')}
            />
          </Field>
          <Field id="pickupLatest" label="Pickup no later than" error={errors.pickupLatest?.message}>
            <input
              type="datetime-local"
              className={inputClass}
              {...aria('pickupLatest', 'pickupLatest')}
              {...register('pickupLatest')}
            />
          </Field>
          <Field id="deliverBy" label="Deliver by (optional)" error={errors.deliverBy?.message}>
            <input
              type="datetime-local"
              className={inputClass}
              {...aria('deliverBy', 'deliverBy')}
              {...register('deliverBy')}
            />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-4">
          <legend className="mb-2 font-semibold">Load</legend>
          <Field id="trailerType" label="Trailer type" error={errors.trailerType?.message}>
            <select className={inputClass} {...aria('trailerType', 'trailerType')} {...register('trailerType')}>
              {TrailerType.options.map((t) => (
                <option key={t} value={t}>
                  {TRAILER_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="pallets" label="Pallets" error={errors.pallets?.message}>
            <input
              type="number"
              min={1}
              max={TRANSPORT_LIMITS.maxPallets}
              className={inputClass}
              {...aria('pallets', 'pallets')}
              {...register('pallets', { valueAsNumber: true })}
            />
          </Field>
          <Field id="weightLbs" label="Weight (lb)" error={errors.weightLbs?.message}>
            <input
              type="number"
              min={1}
              max={TRANSPORT_LIMITS.maxWeightLbs}
              className={inputClass}
              {...aria('weightLbs', 'weightLbs')}
              {...register('weightLbs', { valueAsNumber: true })}
            />
          </Field>
          <Field id="maxBudget" label="Max budget, USD (optional)" error={errors.maxBudget?.message}>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              {...aria('maxBudget', 'maxBudget')}
              {...register('maxBudget', { valueAsNumber: true })}
            />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 font-semibold">Contact</legend>
          <Field id="companyName" label="Company" error={errors.companyName?.message}>
            <input className={inputClass} {...aria('companyName', 'companyName')} {...register('companyName')} />
          </Field>
          <Field id="contactName" label="Your name" error={errors.contactName?.message}>
            <input className={inputClass} {...aria('contactName', 'contactName')} {...register('contactName')} />
          </Field>
          <Field id="contactEmail" label="Email" error={errors.contactEmail?.message}>
            <input
              type="email"
              className={inputClass}
              {...aria('contactEmail', 'contactEmail')}
              {...register('contactEmail')}
            />
          </Field>
        </fieldset>

        <Field id="notes" label="Notes (optional)" error={errors.notes?.message}>
          <textarea rows={3} className={inputClass} {...aria('notes', 'notes')} {...register('notes')} />
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
          {submit.isPending ? 'Finding trucks…' : 'Find matching trucks'}
        </button>
      </form>
    </section>
  );
}
