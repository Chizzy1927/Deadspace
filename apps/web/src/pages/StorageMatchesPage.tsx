import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { fetchStorageMatches } from '../api/storage';
import { EditSearchLink } from '../components/EditSearch';
import { Est, EstimateNote, STORAGE_EST_TOOLTIP } from '../components/Estimate';
import { storageEditPath } from '../forms/request-prefill';
import { StorageMatchCard } from '../components/StorageMatchCard';
import { formatDateRange, formatDays, formatPallets, formatUsd } from '../format';
import { daysBetween } from '@deadspace/shared';

export function StorageMatchesPage() {
  const { id = '' } = useParams();
  const result = useQuery({
    queryKey: ['storage-matches', id],
    queryFn: ({ signal }) => fetchStorageMatches(id, signal),
  });

  if (result.isPending) {
    return (
      <p role="status" className="text-slate-600">
        Finding matching warehouses…
      </p>
    );
  }

  if (result.isError) {
    const notFound = result.error instanceof ApiError && result.error.status === 404;
    return (
      <section role="alert" className="space-y-2">
        <h1 className="text-xl font-semibold">{notFound ? 'Request not found' : 'Could not load matches'}</h1>
        <p className="text-slate-600">{notFound ? 'Check the link, or submit a new request.' : result.error.message}</p>
        {!notFound && (
          <button type="button" className="text-blue-700 hover:underline" onClick={() => void result.refetch()}>
            Try again
          </button>
        )}
        <Link to="/request/storage" className="block text-blue-700 hover:underline">
          New storage request
        </Link>
      </section>
    );
  }

  const { request, scoring, matches } = result.data;
  const stayDays = daysBetween(new Date(`${request.startDate}T00:00:00Z`), new Date(`${request.endDate}T00:00:00Z`));
  const features = [
    request.needsTemperatureControl && 'temperature-controlled',
    request.needsFoodGrade && 'food-grade',
  ].filter((f): f is string => f !== false);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <EditSearchLink to={storageEditPath(request.id)} />
        <h1 className="text-xl font-semibold">Storage near {request.location.label}</h1>
        <p className="text-sm text-slate-600">
          {formatPallets(request.pallets)} · {formatDateRange(request.startDate, request.endDate)} (
          {formatDays(stayDays)}) · within {request.maxDistanceMiles} est. miles
          {features.length > 0 && <> · needs {features.join(' and ')}</>}
          {request.maxBudgetTotal !== null && <> · budget {formatUsd(request.maxBudgetTotal)}</>}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-700">
          <h2 className="font-semibold">No matching warehouses yet</h2>
          <p className="mt-1 text-sm">
            A warehouse only matches if it is within your search radius, is available for your whole stay, offers enough
            pallet positions, accepts a stay and block size like yours, and declares any features you require. Try a
            wider radius or different dates.
          </p>
          <EditSearchLink to={storageEditPath(request.id)} prominent />
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {matches.length} matching {matches.length === 1 ? 'warehouse' : 'warehouses'}, ranked by an overall score.
            Each card shows how location, price, capacity fit and room to extend contributed. Values marked{' '}
            <Est title={STORAGE_EST_TOOLTIP} /> are estimates (see the note below).
          </p>
          <ol className="space-y-4">
            {matches.map((match, i) => (
              <li key={match.space.id}>
                <StorageMatchCard match={match} scoring={scoring} request={request} rank={i + 1} />
              </li>
            ))}
          </ol>
          <EstimateNote variant="storage" />
        </>
      )}
    </section>
  );
}
