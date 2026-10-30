import type { TransportMatch } from '@deadspace/shared';
import { formatMiles, formatPercent, formatUsd, formatWindow, TRAILER_LABELS } from '../format';
import { Estimate } from './Estimate';
import { Highlights, Metric } from './MatchParts';
import { ScoreBreakdown } from './ScoreBreakdown';

export function MatchCard({ match, rank }: { match: TransportMatch; rank: number }) {
  const { leg, metrics, score, highlights, reasons } = match;
  const limiting = metrics.limitingCapacity === 'WEIGHT' ? metrics.weightUtilisation : metrics.palletUtilisation;

  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label={`Match ${rank}: ${leg.companyName}`}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">#{rank}</p>
          <h2 className="text-lg font-semibold">{leg.companyName}</h2>
          <p className="text-slate-700">
            {leg.origin.label} → {leg.destination.label}
          </p>
          <p className="text-sm text-slate-500">
            {leg.loadState === 'EMPTY' ? 'Empty' : 'Part-loaded'} {TRAILER_LABELS[leg.trailerType].toLowerCase()} ·
            departs {formatWindow(leg.departureEarliest, leg.departureLatest)}
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
        <ScoreBreakdown match={match} />

        <dl className="grid grid-cols-2 content-start gap-3">
          <Metric label="Extra miles for carrier">
            <Estimate>{formatMiles(metrics.estAdditionalMiles)}</Estimate>
          </Metric>
          <Metric label="Loaded miles">
            <Estimate>{formatMiles(metrics.estLoadedMiles)}</Estimate>
          </Metric>
          {metrics.estEmptyMilesRecovered !== null ? (
            <Metric label="Empty miles recovered">
              <Estimate>{formatMiles(metrics.estEmptyMilesRecovered)}</Estimate>
            </Metric>
          ) : (
            <Metric label="Spare room before your load">
              {metrics.sparePallets} pallets · {metrics.spareWeightLbs.toLocaleString('en-US')} lb
            </Metric>
          )}
          <Metric label="Price">
            <Estimate>{formatUsd(metrics.estPrice)}</Estimate>
          </Metric>
          <Metric label={`Trailer fill (by ${metrics.limitingCapacity === 'WEIGHT' ? 'weight' : 'pallets'})`}>
            {formatPercent(limiting.before)} → {formatPercent(limiting.after)}
          </Metric>
          <Metric label="Carrier's planned leg">
            <Estimate>{formatMiles(metrics.estDirectLegMiles)}</Estimate>
          </Metric>
        </dl>
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <p className="mt-4 text-sm">
        <a className="text-blue-700 hover:underline" href={`mailto:${leg.contactEmail}`}>
          Contact {leg.contactName}
        </a>
      </p>
    </article>
  );
}
