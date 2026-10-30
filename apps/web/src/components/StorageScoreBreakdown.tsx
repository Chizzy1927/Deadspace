import type { StorageMatch, StorageScoring } from '@deadspace/shared';
import { formatDays, formatMiles, formatPercent, formatUsd } from '../format';
import { StorageEstimate } from './Estimate';
import { ScoreRow } from './MatchParts';

const weight = (w: number) => `Counts ${formatPercent(w)} of the score.`;

/** The four storage score components (0–100 each) with the metric behind each one. Weights come from the API. */
export function StorageScoreBreakdown({ match, scoring }: { match: StorageMatch; scoring: StorageScoring }) {
  const { breakdown, metrics } = match;
  const reference = metrics.priceReference;
  return (
    <section aria-label="Score breakdown">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Score breakdown</h3>
      <ul className="space-y-2">
        <ScoreRow label="Location" value={breakdown.location}>
          <StorageEstimate>{formatMiles(metrics.estDistanceMiles)}</StorageEstimate> from your location.{' '}
          {weight(scoring.weights.location)} Scores 0 at{' '}
          <StorageEstimate>{formatMiles(scoring.locationReferenceMiles)}</StorageEstimate> or more.
        </ScoreRow>
        <ScoreRow label="Price" value={breakdown.price}>
          <StorageEstimate>{formatUsd(metrics.estTotalCost)}</StorageEstimate> total vs{' '}
          {reference.basis === 'BUDGET' ? (
            <>your {formatUsd(reference.amount)} budget</>
          ) : (
            <>
              the <StorageEstimate>{formatUsd(reference.amount)}</StorageEstimate> median of matching warehouses
            </>
          )}
          . {weight(scoring.weights.price)}
        </ScoreRow>
        <ScoreRow label="Capacity fit" value={breakdown.capacityFit}>
          Uses {formatPercent(metrics.availableSpaceUsed)} of the pallet positions offered.{' '}
          {weight(scoring.weights.capacityFit)}
        </ScoreRow>
        <ScoreRow label="Room to extend" value={breakdown.roomToExtend}>
          Available {formatDays(metrics.daysAfterEnd)} after your move-out day. Full credit from{' '}
          {formatDays(scoring.extensionFullCreditDays)}. {weight(scoring.weights.roomToExtend)}
        </ScoreRow>
      </ul>
    </section>
  );
}
