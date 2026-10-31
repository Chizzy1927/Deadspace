import { useCallback, useState } from 'react';
import type { FieldValues, UseFormReset } from 'react-hook-form';
import { useSearchParams } from 'react-router';

/** True when the page was opened with `?example=1` (the landing page's demo links). */
export function useExampleRequested(): boolean {
  const [searchParams] = useSearchParams();
  return searchParams.get('example') === '1';
}

/**
 * "Fill with an example" for a request form. Fills only, never submits. When `requested`, the page
 * has already seeded `useForm`'s `defaultValues` with the example, so `fillCount` starts at 1.
 * Use `fillCount` in a `key` on each LocationInput so they remount and show the filled locations
 * (they keep their text in local state).
 */
export function useExamplePrefill<V extends FieldValues>(
  reset: UseFormReset<V>,
  build: (now: Date) => V,
  requested: boolean,
) {
  const [fillCount, setFillCount] = useState(requested ? 1 : 0);

  const fill = useCallback(() => {
    reset(build(new Date()));
    setFillCount((n) => n + 1);
  }, [reset, build]);

  return { fill, fillCount };
}
