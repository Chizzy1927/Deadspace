import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { EDIT_FROM_PARAM } from './request-prefill';

export type EditFromState = 'idle' | 'loading' | 'loaded' | 'error';

/** The `?editFrom=<id>` request id, or null when the form was opened normally. */
export function useEditFromId(): string | null {
  const [searchParams] = useSearchParams();
  return searchParams.get(EDIT_FROM_PARAM) || null;
}

/**
 * Loads the persisted request named by `editFrom`, the source of truth for repopulating a request
 * form. The page mounts its form only after this settles, with `data` as the form's default values,
 * so nobody types into values about to be replaced. The original is never modified: resubmitting
 * creates a new request. Requests are immutable, so a loaded one is never refetched.
 */
export function useEditFromRequest<R>(
  editFrom: string | null,
  queryKey: string,
  fetcher: (id: string, signal?: AbortSignal) => Promise<R>,
) {
  const query = useQuery({
    queryKey: [queryKey, editFrom],
    queryFn: ({ signal }) => fetcher(editFrom ?? '', signal),
    enabled: editFrom !== null,
    staleTime: Infinity,
  });

  let state: EditFromState = 'idle';
  if (editFrom !== null) {
    if (query.data !== undefined) state = 'loaded';
    else state = query.isError ? 'error' : 'loading';
  }
  return { state, data: query.data, error: query.error };
}
