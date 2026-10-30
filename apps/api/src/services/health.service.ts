import type { HealthResponse } from '@deadspace/shared';

export type DatabaseHealth = HealthResponse['database'];
export type DatabaseHealthCheck = () => Promise<DatabaseHealth>;

/** Public message only: driver errors can reveal hosts and usernames, so details go to the server log. */
export const DATABASE_UNAVAILABLE_MESSAGE = 'Database or PostGIS unavailable';

/** Wraps a PostGIS version probe so failures become a reportable status instead of a thrown error. */
export function createDatabaseHealthCheck(getPostgisVersion: () => Promise<string>): DatabaseHealthCheck {
  return async () => {
    try {
      return { status: 'ok', postgisVersion: await getPostgisVersion() };
    } catch (err) {
      console.error('Database health check failed:', err);
      return { status: 'error', message: DATABASE_UNAVAILABLE_MESSAGE };
    }
  };
}

export async function getHealth(checkDatabase: DatabaseHealthCheck): Promise<HealthResponse> {
  const database = await checkDatabase();
  return { status: database.status === 'ok' ? 'ok' : 'degraded', database };
}
