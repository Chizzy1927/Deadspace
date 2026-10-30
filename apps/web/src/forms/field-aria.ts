/** The first of `fields` (listed in on-screen order) that has an error, if any. */
export function firstInvalidField<F extends string>(fields: readonly F[], errors: Partial<Record<F, unknown>>) {
  return fields.find((f) => errors[f] !== undefined);
}

export const inputClass = 'mt-1 w-full rounded border border-slate-300 px-3 py-2';

/** ARIA wiring for a control rendered inside `<Field>` with the same `id`, `hint` and `error`. */
export function fieldAria(id: string, { hint, error }: { hint?: boolean; error?: string | undefined } = {}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const;
}
