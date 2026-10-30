import type { HealthResponse } from '@deadspace/shared';
import { useEffect, useState } from 'react';
import { fetchHealth } from './api/health';

type HealthState =
  { kind: 'loading' } | { kind: 'loaded'; health: HealthResponse } | { kind: 'error'; message: string };

function describe(state: HealthState): string {
  switch (state.kind) {
    case 'loading':
      return 'Checking API…';
    case 'error':
      return `API unreachable: ${state.message}`;
    case 'loaded':
      return state.health.database.status === 'ok'
        ? `API ok · PostGIS ${state.health.database.postgisVersion}`
        : `API up · ${state.health.database.message}`;
  }
}

// Phase 0 placeholder: proves web → API → PostGIS wiring. Real pages arrive in later phases.
export function App() {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => setState({ kind: 'loaded', health }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'unknown error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>DeadSpace</h1>
      <p>Stranded truck legs and idle warehouse space, matched to shippers.</p>
      <p role="status">{describe(state)}</p>
    </main>
  );
}
