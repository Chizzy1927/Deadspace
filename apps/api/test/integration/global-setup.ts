import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../../src/db.js';
import { resolveTestDatabaseUrl, testDatabaseName } from './test-database.js';

const apiDir = fileURLToPath(new URL('../..', import.meta.url));

/** Creates the test database if missing, then applies all migrations to it. */
export default async function setup(): Promise<void> {
  const testUrl = resolveTestDatabaseUrl(process.env);
  const name = testDatabaseName(testUrl);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = createPrismaClient(adminUrl.toString());
  try {
    const existing = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    // CREATE DATABASE can't take a bind parameter; `name` is validated as \w+_test above.
    if (existing.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
