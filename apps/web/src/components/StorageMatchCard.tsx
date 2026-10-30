import type { StorageMatch, StorageRequest, StorageScoring } from '@deadspace/shared';
import {
  declaredCapabilities,
  formatDateRange,
  formatDays,
  formatMiles,
  formatPalletPrice,
  formatPallets,
  formatUsd,
} from '../format';
import { StorageEstimate } from './Estimate';
import { Highlights, Metric } from './MatchParts';
import { StorageScoreBreakdown } from './StorageScoreBreakdown';

/** The features the shipper required, which every returned match declares (the API only returns feasible matches). */
function requiredFeatures(request: Pick<StorageRequest, 'needsTemperatureControl' | 'needsFoodGrade'>): string[] {
  return [request.needsTemperatureControl && 'Temperature-controlled', request.needsFoodGrade && 'Food-grade'].filter(
    (f): f is string => f !== false,
  );
}

/** One ranked warehouse match. Renders the API's score, breakdown, metrics, highlights and reasons as given. */
export function StorageMatchCard({
  match,
  scoring,
  request,
  rank,
}: {
  match: StorageMatch;
  scoring: StorageScoring;
  request: StorageRequest;
  rank: number;
}) {
  const { space, metrics, score, highlights, reasons } = match;
  const required = requiredFeatures(request);
  const declared = declaredCapabilities(space);
  const extras = declared.filter((c) => !required.includes(c));

  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label={`Match ${rank}: ${space.companyName}`}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">#{rank}</p>
          <h2 className="text-lg font-semibold">{space.companyName}</h2>
          <p className="text-slate-700">{space.location.label}</p>
          <p className="text-sm text-slate-500">
            Available {formatDateRange(space.availableFrom, space.availableTo)} ·{' '}
            {formatPalletPrice(space.pricePerPalletPerPeriod, space.pricingPeriod)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-blue-800" aria-label={`Score ${score} out of 100`}>
            {score}
          </p>
          <p className="text-xs text-slate-500">score / 100</p>
        </div>
      </header>

      <Highlights highlights={highlights} />

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <StorageScoreBreakdown match={match} scoring={scoring} />

        <dl className="grid grid-cols-2 content-start gap-3">
          <Metric label="Total cost for your stay">
            <span className="text-base">
              <StorageEstimate>{formatUsd(metrics.estTotalCost)}</StorageEstimate>
            </span>
          </Metric>
          <Metric label="Distance">
            <StorageEstimate>{formatMiles(metrics.estDistanceMiles)}</StorageEstimate>
          </Metric>
          <Metric label="Storage cost">
            <StorageEstimate>{formatUsd(metrics.estStorageCost)}</StorageEstimate>
          </Metric>
          <Metric label="Handling">
            {space.handlingFeePerPallet === null ? (
              'No handling fee'
            ) : (
              <StorageEstimate>{formatUsd(metrics.estHandlingCost)}</StorageEstimate>
            )}
          </Metric>
          <Metric label="Your stay">{formatDays(metrics.stayDays)}</Metric>
          <Metric label="Pallets">
            {formatPallets(request.pallets)} of {space.quantityAvailable.toLocaleString('en-US')} offered
          </Metric>
          <Metric label="Operator minimums">
            {space.minPallets !== null ? `${formatPallets(space.minPallets)} block · ` : ''}
            {formatDays(space.minStorageDays)} stay
          </Metric>
          <Metric label="After your move-out">{formatDays(metrics.daysAfterEnd)} still available</Metric>
        </dl>
      </div>

      {(required.length > 0 || extras.length > 0) && (
        <p className="mt-4 text-sm text-slate-700">
          {required.length > 0 && (
            <>
              <span className="font-medium">Required features:</span> {required.join(', ')}, declared by the
              operator.{' '}
            </>
          )}
          {extras.length > 0 && (
            <>
              <span className="font-medium">Also declared:</span> {extras.join(', ')}.{' '}
            </>
          )}
          <span className="text-slate-500">DeadSpace does not verify these.</span>
        </p>
      )}

      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <p className="mt-4 text-sm">
        <a className="text-blue-700 hover:underline" href={`mailto:${space.contactEmail}`}>
          Contact {space.contactName}
        </a>
      </p>
    </article>
  );
}
