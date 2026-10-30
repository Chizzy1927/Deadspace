import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { fetchHealth } from '../api/health';

// Phase 2 placeholder home: proves web → API → PostGIS wiring and links to the transport flow.
// The real landing page arrives in Phase 5.
export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => fetchHealth(signal) });

  let status = 'Checking API…';
  if (health.isError) status = `API unreachable: ${health.error.message}`;
  else if (health.data) {
    status =
      health.data.database.status === 'ok'
        ? `API ok · PostGIS ${health.data.database.postgisVersion}`
        : `API up · ${health.data.database.message}`;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">DeadSpace</h1>
      <p>Stranded truck legs and idle warehouse space, matched to shippers.</p>
      <Link
        to="/request/transport"
        className="inline-block rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800"
      >
        Request transport
      </Link>
      <p role="status" className="text-sm text-slate-500">
        {status}
      </p>
    </section>
  );
}
