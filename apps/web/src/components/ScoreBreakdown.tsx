import type { TransportMatch, TruckMatchMetrics } from '@deadspace/shared';
import { formatHours, formatMiles, formatPercent, formatUsd } from '../format';
import { Estimate } from './Estimate';
import { ScoreRow } from './MatchParts';

const SLACK_LIMIT: Record<TruckMatchMetrics['scheduleLimitedBy'], string> = {
  PICKUP_WINDOW: 'before your pickup window closes',
  DELIVER_BY: 'before your deliver-by time',
  ARRIVE_BY: "before the carrier's arrive-by time",
};

/** The four score components (0–100 each) with the metric behind each one. */
export function ScoreBreakdown({ match }: { match: TransportMatch }) {
  const { breakdown, metrics } = match;
  const reference = metrics.priceReference;
  return (
    <section aria-label="Score breakdown">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Score breakdown</h3>
      <ul className="space-y-2">
        <ScoreRow label="Route efficiency" value={breakdown.routeEfficiency}>
          Counts most. Adds <Estimate>{formatMiles(metrics.estAdditionalMiles)}</Estimate> to the carrier&apos;s route
        </ScoreRow>
        <ScoreRow label="Spare-capacity fit" value={breakdown.capacityFit}>
          Takes {formatPercent(metrics.spareCapacityUsed)} of the truck&apos;s spare room (by{' '}
          {metrics.limitingCapacity === 'WEIGHT' ? 'weight' : 'pallets'})
        </ScoreRow>
        <ScoreRow label="Price" value={breakdown.price}>
          <Estimate>{formatUsd(metrics.estPrice)}</Estimate> vs{' '}
          {reference.basis === 'BUDGET' ? (
            <>your {formatUsd(reference.amount)} budget</>
          ) : (
            <>
              the <Estimate>{formatUsd(reference.amount)}</Estimate> median of matching trucks
            </>
          )}
        </ScoreRow>
        <ScoreRow label="Timing" value={breakdown.timing}>
          <Estimate>{formatHours(metrics.estScheduleSlackHours)}</Estimate> to spare{' '}
          {SLACK_LIMIT[metrics.scheduleLimitedBy]}
        </ScoreRow>
      </ul>
    </section>
  );
}
