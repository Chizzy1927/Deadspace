import type { ReactNode } from 'react';

/** id of the page's single estimate explanation; every "est." marker points to it. */
export const ESTIMATE_NOTE_ID = 'estimate-note';

const EST_TOOLTIP = 'Estimated from straight-line distance. Not a routed road calculation.';

/** Tooltip for storage estimates: distance and prorated cost, not drive time. */
export const STORAGE_EST_TOOLTIP =
  'Estimated: distance is straight-line × a fixed road factor; cost is the quoted rate prorated by day. Not a routed distance or a quote.';

/** The "est." marker required on every estimated value (CLAUDE.md). */
export function Est({ title = EST_TOOLTIP }: { title?: string }) {
  return (
    <abbr
      title={title}
      aria-describedby={ESTIMATE_NOTE_ID}
      className="cursor-help text-[0.85em] font-normal text-slate-500 underline decoration-dotted underline-offset-2"
    >
      est.
    </abbr>
  );
}

/** An estimated value (miles, drive time, price): prefixed with the "est." marker. */
export function Estimate({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="whitespace-nowrap">
      <Est {...(title ? { title } : {})} /> {children}
    </span>
  );
}

const NOTE_TEXT = {
  transport:
    "Road distances and drive times are approximations from straight-line distance using DeadSpace's estimation model (a fixed road-distance factor and an average driving speed). They are not routed road calculations. Prices and schedule margins based on them are estimates too.",
  storage:
    "Road distances are approximations from straight-line distance using DeadSpace's estimation model (a fixed road-distance factor). They are not routed road calculations. Costs are the quoted rate prorated by day for your stay, plus any handling fee; they are comparison estimates, not quotes or invoices.",
} as const;

/** An estimated storage value, with the storage tooltip. */
export function StorageEstimate({ children }: { children: ReactNode }) {
  return <Estimate title={STORAGE_EST_TOOLTIP}>{children}</Estimate>;
}

/** Explains "est." once per page instead of beside every value. */
export function EstimateNote({ variant = 'transport' }: { variant?: keyof typeof NOTE_TEXT }) {
  return (
    <p id={ESTIMATE_NOTE_ID} className="text-xs text-slate-500">
      <strong className="font-medium">est. = estimated.</strong> {NOTE_TEXT[variant]}
    </p>
  );
}
