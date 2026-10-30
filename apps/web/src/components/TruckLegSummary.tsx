import type { TruckLeg } from '@deadspace/shared';
import type { ReactNode } from 'react';
import {
  formatDateTime,
  formatLbs,
  formatSpareCapacity,
  formatTruckPrice,
  formatWindow,
  TRAILER_LABELS,
} from '../format';

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-3">
      <dt className="text-sm font-medium text-slate-600">{term}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}

/** Read-only summary of a persisted truck leg, as returned by the API. */
export function TruckLegSummary({ leg }: { leg: TruckLeg }) {
  const sparePallets = leg.totalPallets - leg.committedPallets;
  const spareWeight = leg.totalWeightLbs - leg.committedWeightLbs;
  return (
    <dl className="divide-y divide-slate-100">
      <Row term="Route">
        {leg.origin.label} → {leg.destination.label}
      </Row>
      <Row term="Departure window">{formatWindow(leg.departureEarliest, leg.departureLatest)}</Row>
      {leg.arriveBy && <Row term="Must arrive by">{formatDateTime(leg.arriveBy)}</Row>}
      <Row term="Equipment">
        {TRAILER_LABELS[leg.trailerType]} · {leg.totalPallets} pallets · {formatLbs(leg.totalWeightLbs)}
      </Row>
      <Row term="Load">
        {leg.loadState === 'EMPTY' ? (
          'Empty'
        ) : (
          <>
            Partly loaded: {leg.committedPallets} pallets and {formatLbs(leg.committedWeightLbs)} already on board
          </>
        )}
        <span className="block text-sm text-slate-600">{formatSpareCapacity(sparePallets, spareWeight)}</span>
      </Row>
      <Row term="Max detour">{leg.maxDetourMiles} miles</Row>
      <Row term="Price">{formatTruckPrice(leg.pricingBasis, leg.priceAmount)}</Row>
      <Row term="Contact">
        {leg.contactName}, {leg.companyName} · {leg.contactEmail}
      </Row>
      {leg.notes && <Row term="Notes">{leg.notes}</Row>}
      <Row term="Listed">{formatDateTime(leg.createdAt)}</Row>
    </dl>
  );
}
