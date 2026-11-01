// `npm run db:status` reads these numbers; the post-deployment check relies on them being exactly right.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { insertMissingTruckLegs } from '../../prisma/seed-data/truck-leg-writer.js';
import { collectDemoStatus, demoHorizon } from '../../prisma/seed-data/status.js';
import { buildSeedTruckLegSchedule } from '../../prisma/seed-data/truck-legs.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { createTruckLeg } from '../../src/repositories/truck-leg.repository.js';
import { toWarehouseSpaceCreateData } from '../../src/repositories/warehouse-space.repository.js';
import { submitStorageRequest } from '../../src/services/storage.service.js';
import { submitTransportRequest } from '../../src/services/transport.service.js';
import {
  createTestPrisma,
  storageRequestInput,
  transportRequestInput,
  truckLegInput,
  warehouseSpaceInput,
} from './helpers.js';

const prisma = createTestPrisma();

beforeEach(async () => {
  await prisma.truckLeg.deleteMany();
  await prisma.warehouseSpace.deleteMany();
  await prisma.transportRequest.deleteMany();
  await prisma.storageRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('collectDemoStatus', () => {
  it('reports an empty database with no horizon', async () => {
    expect(await collectDemoStatus(prisma)).toEqual({
      seededTruckLegs: 0,
      seededWarehouseSpaces: 0,
      userTruckLegs: 0,
      userWarehouseSpaces: 0,
      transportRequests: 0,
      storageRequests: 0,
      latestSeededDeparture: null,
    });
  });

  it('separates seeded rows from user-created ones and reports the seed horizon', async () => {
    const anchor = new Date('2027-03-10T00:00:00Z');
    const seeded = await buildSeedTruckLegSchedule(anchor, new MockGeocoder());
    await insertMissingTruckLegs(prisma, seeded);
    await prisma.warehouseSpace.create({
      data: { id: 'seed-warehouse-space-99', ...toWarehouseSpaceCreateData(warehouseSpaceInput()) },
    });
    await createTruckLeg(prisma, truckLegInput());
    await prisma.warehouseSpace.create({ data: toWarehouseSpaceCreateData(warehouseSpaceInput()) });
    await submitTransportRequest(prisma, transportRequestInput());
    await submitTransportRequest(prisma, transportRequestInput());
    await submitStorageRequest(prisma, storageRequestInput());

    const status = await collectDemoStatus(prisma);

    expect(status).toMatchObject({
      seededTruckLegs: seeded.length,
      seededWarehouseSpaces: 1,
      userTruckLegs: 1,
      userWarehouseSpaces: 1,
      transportRequests: 2,
      storageRequests: 1,
    });
    expect(status.latestSeededDeparture).not.toBeNull();
    // The user-created leg departs tomorrow, so it must not be mistaken for the newest seeded departure.
    expect(demoHorizon(status.latestSeededDeparture!, anchor).lastSeededDay.toISOString()).toBe(
      '2027-04-25T00:00:00.000Z',
    );
  });
});
