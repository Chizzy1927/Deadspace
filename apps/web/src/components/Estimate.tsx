import type { ReactNode } from 'react';

/** id of the page's single estimate explanation; every "est." marker points to it. */
export const ESTIMATE_NOTE_ID = 'estimate-note';

const EST_TOOLTIP = 'Estimated from straight-line distance. Not a routed road calculation.';

/** The "est." marker required on every estimated value (CLAUDE.md). */
export function Est() {
  return (
    <abbr
      title={EST_TOOLTIP}
      aria-describedby={ESTIMATE_NOTE_ID}
      className="cursor-help text-[0.85em] font-normal text-slate-500 underline decoration-dotted underline-offset-2"
    >
      est.
    </abbr>
  );
}

/** An estimated value (miles, drive time, price): prefixed with the "est." marker. */
export function Estimate({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <Est /> {children}
    </span>
  );
}

/** Explains "est." once per page instead of beside every value. */
export function EstimateNote() {
  return (
    <p id={ESTIMATE_NOTE_ID} className="text-xs text-slate-500">
      <strong className="font-medium">est. = estimated.</strong> Road distances and drive times are approximations from
      straight-line distance using DeadSpace&apos;s estimation model (a fixed road-distance factor and an average
      driving speed). They are not routed road calculations. Prices and schedule margins based on them are estimates
      too.
    </p>
  );
}
