import { Link } from 'react-router';
import type { EditFromState } from '../forms/use-edit-from';

/** "← Edit search" link back to the request form, prefilled from the saved request. */
export function EditSearchLink({ to, prominent = false }: { to: string; prominent?: boolean }) {
  return prominent ? (
    <Link
      to={to}
      className="mt-3 inline-block rounded border border-blue-700 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
    >
      ← Edit search and try again
    </Link>
  ) : (
    <Link to={to} className="text-sm font-medium text-blue-700 hover:underline">
      ← Edit search
    </Link>
  );
}

/** Truthful status line for a form opened with `?editFrom=`: it loads a copy and never edits the original. */
export function EditFromNotice({
  state,
  message,
}: {
  state: Exclude<EditFromState, 'loading'>;
  message?: string | undefined;
}) {
  if (state === 'idle') return null;
  if (state === 'error') {
    return (
      <p role="alert" className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Could not load your previous search{message ? ` (${message})` : ''}. Enter the details below to start a new one.
      </p>
    );
  }
  return (
    <p role="status" className="text-sm font-medium text-slate-700">
      Previous search loaded. Adjust any details and search again. Your earlier search is not changed; this creates a
      new one.
    </p>
  );
}
