import { Link } from 'react-router';

const KINDS = {
  truck: {
    things: 'truck legs',
    sampleThings: 'trucks',
    example: { to: '/request/transport?example=1', label: 'try an example transport request' },
  },
  warehouse: {
    things: 'warehouse spaces',
    sampleThings: 'warehouses',
    example: { to: '/request/storage?example=1', label: 'try an example storage request' },
  },
} as const;

/** Explains, before anything is typed, that this public demo does not store new supply listings. */
export function SupplyDisabledNotice({ kind }: { kind: keyof typeof KINDS }) {
  const { things, sampleThings, example } = KINDS[kind];
  return (
    <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <h2 className="font-semibold">Saving listings is turned off in this public demo</h2>
      <p className="mt-1 text-sm">
        This site is open to anyone and every carrier and warehouse in it is fictional, so new {things} are not stored.
        You can fill in the form to see how it works and what is checked. Nothing you enter is saved or shown to
        shippers.
      </p>
      <p className="mt-2 text-sm">
        To see how listings reach shippers,{' '}
        <Link to={example.to} className="font-medium underline underline-offset-2">
          {example.label}
        </Link>
        : it is matched against the fictional sample {sampleThings}.
      </p>
    </div>
  );
}

/** Shown after a valid submission of a listing form while saving is turned off. */
export function NotSavedStatus({ show }: { show: boolean }) {
  return (
    <p role="status" className="text-sm font-medium text-slate-700">
      {show ? 'Everything checks out. Because saving is turned off in this public demo, nothing was stored.' : ''}
    </p>
  );
}
