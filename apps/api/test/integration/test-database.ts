/**
 * Integration tests run against a dedicated `*_test` database on the same PostGIS server, so they
 * can delete rows freely without touching dev or seed data.
 * TEST_DATABASE_URL wins; otherwise DATABASE_URL with `_test` appended to the database name
 * (unchanged if it already ends in `_test`, as in CI).
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.TEST_DATABASE_URL ?? env.DATABASE_URL;
  if (!raw) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run integration tests');

  const url = new URL(raw);
  if (!env.TEST_DATABASE_URL && !url.pathname.endsWith('_test')) url.pathname += '_test';
  testDatabaseName(url.toString());
  return url.toString();
}

/** Returns the database name, refusing anything that isn't a plain `*_test` identifier. */
export function testDatabaseName(databaseUrl: string): string {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (!/^\w+_test$/.test(name)) {
    throw new Error(`Refusing to run integration tests against "${name}": the database name must end in _test`);
  }
  return name;
}
