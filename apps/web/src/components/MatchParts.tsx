import type { ReactNode } from 'react';

/** One labelled figure in a match card's metrics grid. */
export function Metric({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

interface HighlightLike {
  code: string;
  tone: 'positive' | 'caution';
  text: string;
}

const HIGHLIGHT_TONE: Record<HighlightLike['tone'], string> = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  caution: 'border-amber-300 bg-amber-50 text-amber-900',
};

/** API-supplied highlight chips (cautions first, in API order). Domain-neutral. */
export function Highlights({ highlights }: { highlights: readonly HighlightLike[] }) {
  if (highlights.length === 0) return null;
  return (
    <ul aria-label="Highlights" className="mt-3 flex flex-wrap gap-2">
      {highlights.map((h) => (
        <li
          key={h.code}
          data-highlight={h.code}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${HIGHLIGHT_TONE[h.tone]}`}
        >
          {h.tone === 'caution' && <span className="sr-only">Caution: </span>}
          {h.text}
        </li>
      ))}
    </ul>
  );
}

/** One 0–100 score component as a labelled meter, with the explanation beneath it. */
export function ScoreRow({ label, value, children }: { label: string; value: number; children: ReactNode }) {
  const points = Math.round(value * 100);
  return (
    <li className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-x-3 gap-y-0.5 text-sm">
      <span className="text-slate-700">{label}</span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={points}
        className="h-2 overflow-hidden rounded-full bg-slate-100"
      >
        <div className="h-full rounded-full bg-blue-700" style={{ width: `${points}%` }} />
      </div>
      <span className="text-right font-medium tabular-nums">{points}</span>
      <p className="col-span-3 text-xs text-slate-500">{children}</p>
    </li>
  );
}
