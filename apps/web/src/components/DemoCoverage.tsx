import { Link } from 'react-router';

const EXAMPLES = {
  transport: { to: '/request/transport?example=1', label: 'example transport request', things: 'trucks' },
  storage: { to: '/request/storage?example=1', label: 'example storage request', things: 'warehouses' },
} as const;

/** One line on the request forms: the demo's inventory is limited, and the example always matches. */
export function DemoCoverageHint({ kind }: { kind: keyof typeof EXAMPLES }) {
  return (
    <p className="mt-2 text-sm text-slate-600">
      The sample {EXAMPLES[kind].things} in this demo cover selected example markets, mainly in and around Texas, so a
      search elsewhere may find nothing. &ldquo;Fill with an example&rdquo; always has matches.
    </p>
  );
}

/** Added to an empty results page so limited demo coverage is not mistaken for a broken search. */
export function ZeroMatchCoverageNote({ kind }: { kind: keyof typeof EXAMPLES }) {
  const { to, label, things } = EXAMPLES[kind];
  return (
    <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <span className="font-medium">This is a demo with limited coverage.</span> Its sample {things} are fictional and
      cover selected example markets, mainly in and around Texas, so a search elsewhere often finds nothing. To see real
      matching, try the{' '}
      <Link to={to} className="font-medium underline underline-offset-2">
        {label}
      </Link>
      .
    </p>
  );
}
