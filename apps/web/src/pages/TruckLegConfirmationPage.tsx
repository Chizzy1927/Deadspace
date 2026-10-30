import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { fetchTruckLeg } from '../api/transport';
import { TruckLegSummary } from '../components/TruckLegSummary';

/** Shows the truck leg exactly as persisted (fetched back from the API, so it survives reload). */
export function TruckLegConfirmationPage() {
  const { id = '' } = useParams();
  const leg = useQuery({ queryKey: ['truck-leg', id], queryFn: ({ signal }) => fetchTruckLeg(id, signal) });
  const heading = useRef<HTMLHeadingElement>(null);

  // After the SPA navigation from the form, move focus to the result so screen readers announce it.
  useEffect(() => {
    if (leg.isSuccess) heading.current?.focus();
  }, [leg.isSuccess]);

  if (leg.isPending) {
    return (
      <p role="status" className="text-slate-600">
        Loading your listing…
      </p>
    );
  }

  if (leg.isError) {
    const notFound = leg.error instanceof ApiError && leg.error.status === 404;
    return (
      <section role="alert" className="space-y-2">
        <h1 className="text-xl font-semibold">{notFound ? 'Listing not found' : 'Could not load the listing'}</h1>
        <p className="text-slate-600">{notFound ? 'Check the link, or list a new truck leg.' : leg.error.message}</p>
        {!notFound && (
          <button type="button" className="text-blue-700 hover:underline" onClick={() => void leg.refetch()}>
            Try again
          </button>
        )}
        <Link to="/list/truck" className="block text-blue-700 hover:underline">
          List a truck leg
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
          Your truck leg is listed
        </h1>
        <p className="text-slate-600">
          Shippers whose freight fits this trip can now be matched to it. Here is what we saved.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
        <TruckLegSummary leg={leg.data} />
      </div>
      <Link to="/list/truck" className="inline-block text-blue-700 hover:underline">
        List another leg
      </Link>
    </section>
  );
}
