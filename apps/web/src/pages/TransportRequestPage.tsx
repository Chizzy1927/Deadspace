import { zodResolver } from '@hookform/resolvers/zod';
import { type CreateTransportRequestInput, TRANSPORT_LIMITS, TrailerType } from '@deadspace/shared';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { createTransportRequest } from '../api/transport';
import { LocationInput } from '../components/LocationInput';
import { TransportRequestFormSchema, type TransportRequestFormValues } from '../forms/transport-request-form';
import { TRAILER_LABELS } from '../format';

const FIELDS = [
  'companyName',
  'contactName',
  'contactEmail',
  'pickup',
  'dropoff',
  'pickupEarliest',
  'pickupLatest',
  'deliverBy',
  'trailerType',
  'pallets',
  'weightLbs',
  'maxBudget',
  'notes',
] as const satisfies readonly (keyof TransportRequestFormValues)[];
const isField = (name: string): name is (typeof FIELDS)[number] => (FIELDS as readonly string[]).includes(name);

const inputClass = 'mt-1 w-full rounded border border-slate-300 px-3 py-2';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function TransportRequestPage() {
  const navigate = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TransportRequestFormValues, unknown, CreateTransportRequestInput>({
    resolver: zodResolver(TransportRequestFormSchema),
    defaultValues: {
      pickup: null,
      dropoff: null,
      deliverBy: '',
      trailerType: 'DRY_VAN',
      maxBudget: Number.NaN,
      notes: '',
    },
  });

  const submit = useMutation({
    mutationFn: createTransportRequest,
    onSuccess: (request) => navigate(`/requests/transport/${request.id}/matches`),
    onError: (error) => {
      // Map server-side field errors onto the form; anything else is shown as a form-level error.
      if (error instanceof ApiError && error.issues.length > 0) {
        for (const issue of error.issues) {
          const field = issue.path.split('.')[0] ?? '';
          if (isField(field)) setError(field, { message: issue.message });
        }
      }
    },
  });

  const aria = (name: (typeof FIELDS)[number], id: string) => ({
    id,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${id}-error` : undefined,
  });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request transport</h1>
        <p className="text-slate-600">
          Tell us what you need moved. We match it against trucks already making a similar trip with spare room.
        </p>
      </div>

      <form noValidate onSubmit={(e) => void handleSubmit((input) => submit.mutate(input))(e)} className="space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">Route</legend>
          <Controller
            control={control}
            name="pickup"
            render={({ field, fieldState }) => (
              <LocationInput label="Pickup" {...field} error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="dropoff"
            render={({ field, fieldState }) => (
              <LocationInput label="Dropoff" {...field} error={fieldState.error?.message} />
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

        {submit.isError && !(submit.error instanceof ApiError && submit.error.issues.length > 0) && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-red-800">
            Could not submit your request: {submit.error.message}
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
