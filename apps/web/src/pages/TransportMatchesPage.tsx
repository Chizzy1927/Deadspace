import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { fetchTransportMatches } from '../api/transport';
import { Est, EstimateNote } from '../components/Estimate';
import { MatchCard } from '../components/MatchCard';
import { formatDateTime, formatUsd, formatWindow, TRAILER_LABELS } from '../format';

export function TransportMatchesPage() {
  const { id = '' } = useParams();
  const result = useQuery({
    queryKey: ['transport-matches', id],
    queryFn: ({ signal }) => fetchTransportMatches(id, signal),
  });

  if (result.isPending) {
    return (
      <p role="status" className="text-slate-600">
        Finding matching trucks…
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
        <Link to="/request/transport" className="block text-blue-700 hover:underline">
          New transport request
        </Link>
      </section>
    );
  }

  const { request, matches } = result.data;
  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold">
          {request.pickup.label} → {request.dropoff.label}
        </h1>
        <p className="text-sm text-slate-600">
          {request.pallets} pallets · {request.weightLbs.toLocaleString('en-US')} lb ·{' '}
          {TRAILER_LABELS[request.trailerType].toLowerCase()} · pickup{' '}
          {formatWindow(request.pickupEarliest, request.pickupLatest)}
          {request.deliverBy && <> · deliver by {formatDateTime(request.deliverBy)}</>}
          {request.maxBudget !== null && <> · budget {formatUsd(request.maxBudget)}</>}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-700">
          <h2 className="font-semibold">No matching trucks yet</h2>
          <p className="mt-1 text-sm">
            A truck only matches if it has the right trailer, enough spare room, can reach your pickup during your
            window, and your shipment keeps it within the carrier&apos;s detour limit. Try a wider pickup window.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {matches.length} matching {matches.length === 1 ? 'truck' : 'trucks'}, ranked by how little extra driving
            your shipment adds to a trip the carrier is already making. Values marked <Est /> are estimates (see the
            note below).
          </p>
          <ol className="space-y-4">
            {matches.map((match, i) => (
              <li key={match.leg.id}>
                <MatchCard match={match} rank={i + 1} />
              </li>
            ))}
          </ol>
          <EstimateNote />
        </>
      )}
    </section>
  );
}
