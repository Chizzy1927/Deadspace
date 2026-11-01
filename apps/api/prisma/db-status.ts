// `npm run db:status -w apps/api [-- --json] [-- --expect-no-public-supply]`
// Read-only. Prints counts and the seed horizon for the database in DIRECT_DATABASE_URL (or
// DATABASE_URL). Never prints connection details. With --expect-no-public-supply it exits 1 if any
// non-seeded truck leg or warehouse space exists (the public demo must hold none).
import { createPrismaClient } from '../src/db.js';
import { collectDemoStatus, demoHorizon } from './seed-data/status.js';

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set DIRECT_DATABASE_URL (or DATABASE_URL) in your shell to the database to inspect.');
  process.exit(2);
}
const asJson = process.argv.includes('--json');
const expectNoPublicSupply = process.argv.includes('--expect-no-public-supply');

const prisma = createPrismaClient(url);
try {
  const now = new Date();
  const status = await collectDemoStatus(prisma);
  const horizon = status.latestSeededDeparture ? demoHorizon(status.latestSeededDeparture, now) : null;
  const publicSupply = status.userTruckLegs + status.userWarehouseSpaces;

  if (asJson) {
    console.log(JSON.stringify({ ...status, horizon, publicSupply }, null, 2));
  } else {
    const line = (label: string, value: string | number) => console.log(`${label.padEnd(34)}${value}`);
    console.log('DeadSpace demo data status (read-only)');
    line('Seeded truck legs', status.seededTruckLegs);
    line('Seeded warehouse spaces', status.seededWarehouseSpaces);
    line('User-created truck legs', status.userTruckLegs);
    line('User-created warehouse spaces', status.userWarehouseSpaces);
    line('Transport requests', status.transportRequests);
    line('Storage requests', status.storageRequests);
    if (horizon) {
      line('Newest seeded departure day', horizon.lastSeededDay.toISOString().slice(0, 10));
      line(
        'Full transport demo until',
        `${horizon.fullDemoUntil.toISOString()} (${horizon.fullDemoDaysLeft} days left)`,
      );
      line('Half of it until', horizon.partialDemoUntil.toISOString());
    } else {
      line('Seeded truck-leg horizon', 'none: the database has not been seeded');
    }
  }

  if (expectNoPublicSupply && publicSupply > 0) {
    console.error(`FAIL: ${publicSupply} non-seeded truck leg(s) or warehouse space(s) exist in a public demo.`);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
