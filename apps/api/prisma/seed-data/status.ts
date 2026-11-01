// Read-only demo-data status: what the seed put in, what visitors have added, and how much seeded
// transport inventory is left. Used by `npm run db:status` and tested directly. Counts come from Prisma
// models (no raw SQL), and nothing here writes.
import { DAY_MS, utcStartOfDay } from '@deadspace/shared';
import type { PrismaClient } from '../../src/db.js';

/** Seeded rows have ids starting `seed-` (the same rule the web app uses to tag sample data). */
const SEEDED = { startsWith: 'seed-' };

export interface DemoStatus {
  seededTruckLegs: number;
  seededWarehouseSpaces: number;
  /** Rows created by visitors or developers. Must be 0 in the public demo, where supply creation is off. */
  userTruckLegs: number;
  userWarehouseSpaces: number;
  transportRequests: number;
  storageRequests: number;
  latestSeededDeparture: Date | null;
}

export async function collectDemoStatus(prisma: PrismaClient): Promise<DemoStatus> {
  const [
    seededTruckLegs,
    userTruckLegs,
    seededWarehouseSpaces,
    userWarehouseSpaces,
    transportRequests,
    storageRequests,
  ] = await Promise.all([
    prisma.truckLeg.count({ where: { id: SEEDED } }),
    prisma.truckLeg.count({ where: { NOT: { id: SEEDED } } }),
    prisma.warehouseSpace.count({ where: { id: SEEDED } }),
    prisma.warehouseSpace.count({ where: { NOT: { id: SEEDED } } }),
    prisma.transportRequest.count(),
    prisma.storageRequest.count(),
  ]);
  const latest = await prisma.truckLeg.aggregate({ where: { id: SEEDED }, _max: { departureEarliest: true } });
  return {
    seededTruckLegs,
    seededWarehouseSpaces,
    userTruckLegs,
    userWarehouseSpaces,
    transportRequests,
    storageRequests,
    latestSeededDeparture: latest._max.departureEarliest,
  };
}

export interface DemoHorizon {
  /** The newest seeded departure day (UTC midnight). */
  lastSeededDay: Date;
  /** The full transport demo works for a visitor who opens the app before this instant. */
  fullDemoUntil: Date;
  /** Half of the demo's carriers remain for a visitor who opens the app before this instant. */
  partialDemoUntil: Date;
  /** Whole days of full demo left at `now` (0 when it has already ended). */
  fullDemoDaysLeft: number;
}

/**
 * How long the seeded transport inventory lasts, from its newest departure day L. The standard demo
 * request needs the day after the visitor's next UTC midnight too, so the full demo ends at the start
 * of day L-1, and the last single day (L) keeps half of it until the start of L. See docs/OPERATIONS.md.
 */
export function demoHorizon(latestSeededDeparture: Date, now: Date): DemoHorizon {
  const lastSeededDay = utcStartOfDay(latestSeededDeparture);
  const fullDemoUntil = new Date(lastSeededDay.getTime() - DAY_MS);
  const partialDemoUntil = lastSeededDay;
  const fullDemoDaysLeft = Math.max(0, Math.floor((fullDemoUntil.getTime() - now.getTime()) / DAY_MS));
  return { lastSeededDay, fullDemoUntil, partialDemoUntil, fullDemoDaysLeft };
}
