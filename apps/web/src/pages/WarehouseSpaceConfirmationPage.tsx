import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { fetchWarehouseSpace } from '../api/storage';
import { WarehouseSpaceSummary } from '../components/WarehouseSpaceSummary';

/** Shows the warehouse space exactly as persisted (fetched back from the API, so it survives reload). */
export function WarehouseSpaceConfirmationPage() {
  const { id = '' } = useParams();
  const space = useQuery({
    queryKey: ['warehouse-space', id],
    queryFn: ({ signal }) => fetchWarehouseSpace(id, signal),
  });
  const heading = useRef<HTMLHeadingElement>(null);

  // After the SPA navigation from the form, move focus to the result so screen readers announce it.
  useEffect(() => {
    if (space.isSuccess) heading.current?.focus();
  }, [space.isSuccess]);

  if (space.isPending) {
    return (
      <p role="status" className="text-slate-600">
        Loading your listing…
      </p>
    );
  }

  if (space.isError) {
    const notFound = space.error instanceof ApiError && space.error.status === 404;
    return (
      <section role="alert" className="space-y-2">
        <h1 className="text-xl font-semibold">{notFound ? 'Listing not found' : 'Could not load the listing'}</h1>
        <p className="text-slate-600">
          {notFound ? 'Check the link, or list new warehouse space.' : space.error.message}
        </p>
        {!notFound && (
          <button type="button" className="text-blue-700 hover:underline" onClick={() => void space.refetch()}>
            Try again
          </button>
        )}
        <Link to="/list/warehouse" className="block text-blue-700 hover:underline">
          List warehouse space
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
          Your warehouse space is listed
        </h1>
        <p className="text-slate-600">
          Shippers whose storage needs fit this space can now be matched to it. Here is what we saved.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
        <WarehouseSpaceSummary space={space.data} />
      </div>
      <Link to="/list/warehouse" className="inline-block text-blue-700 hover:underline">
        List another space
      </Link>
    </section>
  );
}
