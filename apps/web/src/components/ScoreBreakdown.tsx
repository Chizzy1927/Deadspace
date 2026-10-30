import type { TransportMatch, TruckMatchMetrics } from '@deadspace/shared';
import type { ReactNode } from 'react';
import { formatHours, formatMiles, formatPercent, formatUsd } from '../format';
import { Estimate } from './Estimate';

const SLACK_LIMIT: Record<TruckMatchMetrics['scheduleLimitedBy'], string> = {
  PICKUP_WINDOW: 'before your pickup window closes',
  DELIVER_BY: 'before your deliver-by time',
  ARRIVE_BY: "before the carrier's arrive-by time",
};

function Row({ label, value, children }: { label: string; value: number; children: ReactNode }) {
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

/** The four score components (0–100 each) with the metric behind each one. */
export function ScoreBreakdown({ match }: { match: TransportMatch }) {
  const { breakdown, metrics } = match;
  const reference = metrics.priceReference;
  return (
    <section aria-label="Score breakdown">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Score breakdown</h3>
      <ul className="space-y-2">
        <Row label="Route efficiency" value={breakdown.routeEfficiency}>
          Counts most. Adds <Estimate>{formatMiles(metrics.estAdditionalMiles)}</Estimate> to the carrier&apos;s route
        </Row>
        <Row label="Spare-capacity fit" value={breakdown.capacityFit}>
          Takes {formatPercent(metrics.spareCapacityUsed)} of the truck&apos;s spare room (by{' '}
          {metrics.limitingCapacity === 'WEIGHT' ? 'weight' : 'pallets'})
        </Row>
        <Row label="Price" value={breakdown.price}>
          <Estimate>{formatUsd(metrics.estPrice)}</Estimate> vs{' '}
          {reference.basis === 'BUDGET' ? (
            <>your {formatUsd(reference.amount)} budget</>
          ) : (
            <>
              the <Estimate>{formatUsd(reference.amount)}</Estimate> median of matching trucks
            </>
          )}
        </Row>
        <Row label="Timing" value={breakdown.timing}>
          <Estimate>{formatHours(metrics.estScheduleSlackHours)}</Estimate> to spare{' '}
          {SLACK_LIMIT[metrics.scheduleLimitedBy]}
        </Row>
      </ul>
    </section>
  );
}
