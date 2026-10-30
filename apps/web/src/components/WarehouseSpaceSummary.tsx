import type { WarehouseSpace } from '@deadspace/shared';
import type { ReactNode } from 'react';
import {
  declaredCapabilities,
  formatDateRange,
  formatDateTime,
  formatDays,
  formatPalletPrice,
  formatPallets,
  formatUsd,
} from '../format';

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-3">
      <dt className="text-sm font-medium text-slate-600">{term}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}

/** Read-only summary of a persisted warehouse space, as returned by the API. */
export function WarehouseSpaceSummary({ space }: { space: WarehouseSpace }) {
  const capabilities = declaredCapabilities(space);
  return (
    <dl className="divide-y divide-slate-100">
      <Row term="Location">{space.location.label}</Row>
      <Row term="Available">{formatDateRange(space.availableFrom, space.availableTo)}</Row>
      <Row term="Pallet positions offered">
        {formatPallets(space.quantityAvailable)}
        {space.minPallets !== null && (
          <span className="block text-sm text-slate-600">Smallest block: {formatPallets(space.minPallets)}</span>
        )}
      </Row>
      <Row term="Minimum stay">{formatDays(space.minStorageDays)}</Row>
      <Row term="Capabilities (as declared)">
        {capabilities.length > 0 ? capabilities.join(' · ') : 'None declared'}
        <span className="block text-sm text-slate-600">Self-declared by you. DeadSpace does not verify them.</span>
      </Row>
      <Row term="Price">
        {formatPalletPrice(space.pricePerPalletPerPeriod, space.pricingPeriod)}
        {space.handlingFeePerPallet !== null && (
          <span className="block text-sm text-slate-600">
            plus {formatUsd(space.handlingFeePerPallet)} per pallet handling (in and out combined)
          </span>
        )}
      </Row>
      <Row term="Contact">
        {space.contactName}, {space.companyName} · {space.contactEmail}
      </Row>
      {space.notes && <Row term="Notes">{space.notes}</Row>}
      <Row term="Listed">{formatDateTime(space.createdAt)}</Row>
    </dl>
  );
}
