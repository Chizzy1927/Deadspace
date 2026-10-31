// Warehouse/storage API against the real app and PostGIS: validation → persistence → candidate
// retrieval → the pure matcher → response. Scoring itself is covered by the matcher's own tests;
// these assert it reaches the wire unchanged.
import {
  addDays,
  ApiErrorResponseSchema,
  buildDemoStorageRequest,
  StorageMatchesResponseSchema,
  StorageRequestSchema,
  toCalendarDate,
  utcStartOfDay,
  WarehouseSpaceSchema,
} from '@deadspace/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildSeedWarehouseSpaces } from '../../prisma/seed-data/warehouse-spaces.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { rankWarehouseSpaces, WAREHOUSE_SCORING } from '../../src/matching/warehouse.js';
import { findWarehouseCandidates } from '../../src/repositories/geo.repository.js';
import { toStorageMatchRequest } from '../../src/repositories/storage-request.repository.js';
import {
  toWarehouseSpaceCreateData,
  toWarehouseSpaceFacts,
} from '../../src/repositories/warehouse-space.repository.js';
import { createTestApp, createTestPrisma, DALLAS, daysFromToday } from './helpers.js';

const prisma = createTestPrisma();
const app = createTestApp(prisma);

/** Wire payloads exactly as the web forms send them (dates as YYYY-MM-DD). */
const spacePayload = (overrides: Record<string, unknown> = {}) => ({
  companyName: 'Trinity Storage Co.',
  contactName: 'Ana Ruiz',
  contactEmail: 'ana@trinity.example.com',
  location: DALLAS,
  quantityAvailable: 200,
  minPallets: 10,
  availableFrom: daysFromToday(1),
  availableTo: daysFromToday(61),
  minStorageDays: 7,
  temperatureControlled: true,
  pricingPeriod: 'MONTH',
  pricePerPalletPerPeriod: 16,
  handlingFeePerPallet: 2.5,
  notes: 'Dock 2',
  ...overrides,
});

const requestPayload = (overrides: Record<string, unknown> = {}) => ({
  companyName: 'Acme Goods',
  contactName: 'Sam Lee',
  contactEmail: 'sam@acme.example.com',
  location: DALLAS,
  maxDistanceMiles: 25,
  pallets: 40,
  startDate: daysFromToday(8),
  endDate: daysFromToday(38),
  maxBudgetTotal: 2000,
  ...overrides,
});

const id = (key: string) => `seed-warehouse-space-${key}`;

/** Seeds the reference warehouse set, anchored like seed.ts, and returns the matching request payload. */
async function seedReferenceSet() {
  const anchor = addDays(utcStartOfDay(new Date()), 1);
  for (const { id: seedId, input } of await buildSeedWarehouseSpaces(anchor, new MockGeocoder())) {
    await prisma.warehouseSpace.create({ data: { id: seedId, ...toWarehouseSpaceCreateData(input) } });
  }
  return requestPayload({
    maxBudgetTotal: undefined,
    startDate: toCalendarDate(addDays(anchor, 7)),
    endDate: toCalendarDate(addDays(anchor, 37)),
  });
}

async function createRequestId(payload: Record<string, unknown>): Promise<string> {
  const res = await request(app).post('/api/storage-requests').send(payload);
  expect(res.status).toBe(201);
  return StorageRequestSchema.parse(res.body).id;
}

beforeEach(async () => {
  await prisma.warehouseSpace.deleteMany();
  await prisma.storageRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('warehouse spaces API (real PostGIS)', () => {
  it('persists a valid listing and serves it back', async () => {
    const created = await request(app).post('/api/warehouse-spaces').send(spacePayload());

    expect(created.status).toBe(201);
    const space = WarehouseSpaceSchema.parse(created.body);
    expect(space).toMatchObject({
      status: 'ACTIVE',
      location: DALLAS,
      quantityAvailable: 200,
      minPallets: 10,
      minStorageDays: 7,
      temperatureControlled: true,
      foodGrade: false,
      pricePerPalletPerPeriod: 16,
      handlingFeePerPallet: 2.5,
      notes: 'Dock 2',
    });
    const stored = await prisma.warehouseSpace.findUniqueOrThrow({ where: { id: space.id } });
    expect(stored.locationLabel).toBe(DALLAS.label);
    expect(stored.pricePerPalletPerPeriod.toNumber()).toBe(16);

    const fetched = await request(app).get(`/api/warehouse-spaces/${space.id}`);
    expect(fetched.status).toBe(200);
    expect(WarehouseSpaceSchema.parse(fetched.body)).toEqual(space);
  });

  it('rejects invalid input with field paths and stores nothing', async () => {
    const res = await request(app)
      .post('/api/warehouse-spaces')
      .send(spacePayload({ quantityAvailable: 0, pricePerPalletPerPeriod: -1 }));

    expect(res.status).toBe(400);
    const { error } = ApiErrorResponseSchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'quantityAvailable' }),
        expect.objectContaining({ path: 'pricePerPalletPerPeriod' }),
      ]),
    );
    expect(await prisma.warehouseSpace.count()).toBe(0);
  });

  it('returns 404 for an unknown listing', async () => {
    const res = await request(app).get('/api/warehouse-spaces/nope');
    expect(res.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });
});

describe('storage requests API (real PostGIS)', () => {
  it('persists a valid request and serves it back', async () => {
    const created = await request(app).post('/api/storage-requests').send(requestPayload());

    expect(created.status).toBe(201);
    const body = StorageRequestSchema.parse(created.body);
    expect(body).toMatchObject({
      status: 'ACTIVE',
      location: DALLAS,
      maxDistanceMiles: 25,
      pallets: 40,
      startDate: daysFromToday(8),
      endDate: daysFromToday(38),
      needsTemperatureControl: false,
      needsFoodGrade: false,
      maxBudgetTotal: 2000,
    });
    const stored = await prisma.storageRequest.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.locationLabel).toBe(DALLAS.label);
    expect(stored.maxBudgetTotal?.toNumber()).toBe(2000);

    const fetched = await request(app).get(`/api/storage-requests/${body.id}`);
    expect(fetched.status).toBe(200);
    expect(StorageRequestSchema.parse(fetched.body)).toEqual(body);
  });

  it('rejects invalid input with useful field paths and stores nothing', async () => {
    const res = await request(app)
      .post('/api/storage-requests')
      .send(requestPayload({ startDate: daysFromToday(10), endDate: daysFromToday(10) }));

    expect(res.status).toBe(400);
    const { error } = ApiErrorResponseSchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ path: 'endDate', message: 'End date must be after the start date' }]);
    expect(await prisma.storageRequest.count()).toBe(0);
  });

  it('reports field-level errors by path (cross-field rules wait until fields are valid)', async () => {
    const res = await request(app)
      .post('/api/storage-requests')
      .send(requestPayload({ pallets: 0 }));

    expect(res.status).toBe(400);
    const { error } = ApiErrorResponseSchema.parse(res.body);
    expect(error.details).toEqual([expect.objectContaining({ path: 'pallets' })]);
    expect(await prisma.storageRequest.count()).toBe(0);
  });

  it('returns 404 for an unknown request and its matches', async () => {
    for (const path of ['/api/storage-requests/nope', '/api/storage-requests/nope/matches']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(ApiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    }
  });
});

describe('storage matches API (real PostGIS)', () => {
  it('returns the seeded ranking, excluding infeasible warehouses', async () => {
    const requestId = await createRequestId(await seedReferenceSet());

    const res = await request(app).get(`/api/storage-requests/${requestId}/matches`);

    expect(res.status).toBe(200);
    const body = StorageMatchesResponseSchema.parse(res.body);
    expect(body.request.id).toBe(requestId);
    expect(body.matches.map((m) => [m.space.id, m.score])).toEqual([
      [id('01'), 72],
      [id('04'), 65],
      [id('02'), 59],
      [id('03'), 49],
    ]);
    // Every other seeded site fails a hard rule (see matching-warehouse-seed.test.ts).
    const returned = new Set(body.matches.map((m) => m.space.id));
    for (const key of ['05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17']) {
      expect(returned.has(id(key))).toBe(false);
    }
    expect(body.matches[0]!.reasons.length).toBeGreaterThan(0);
    expect(body.matches[0]!.metrics.estTotalCost).toBe(960);
  });

  it('passes the matcher output and scoring model through unchanged and deterministically', async () => {
    const requestId = await createRequestId(await seedReferenceSet());

    const first = await request(app).get(`/api/storage-requests/${requestId}/matches`);
    const second = await request(app).get(`/api/storage-requests/${requestId}/matches`);
    expect(second.body).toEqual(first.body);

    // The same retrieval + matcher run directly, without the API layer.
    const row = await prisma.storageRequest.findUniqueOrThrow({ where: { id: requestId } });
    const candidateRows = await findWarehouseCandidates(prisma, requestId);
    const rows = await prisma.warehouseSpace.findMany({ where: { id: { in: candidateRows.map((c) => c.spaceId) } } });
    const direct = rankWarehouseSpaces(
      toStorageMatchRequest(row),
      candidateRows.map((c) => ({
        space: toWarehouseSpaceFacts(rows.find((r) => r.id === c.spaceId)!),
        straightLineMiles: c.straightLineMiles,
      })),
    );
    const { scoring, matches } = StorageMatchesResponseSchema.parse(first.body);
    expect(scoring).toEqual(WAREHOUSE_SCORING);
    expect(matches.map(({ space, ...rest }) => ({ spaceId: space.id, ...rest }))).toEqual(direct);
  });

  it('returns 200 with no matches when nothing is feasible', async () => {
    await seedReferenceSet();
    const requestId = await createRequestId(requestPayload({ pallets: 5_000, maxBudgetTotal: undefined }));

    const res = await request(app).get(`/api/storage-requests/${requestId}/matches`);

    expect(res.status).toBe(200);
    const body = StorageMatchesResponseSchema.parse(res.body);
    expect(body.matches).toEqual([]);
    expect(body.scoring).toEqual(WAREHOUSE_SCORING);
    expect(body.request.id).toBe(requestId);
  });

  it('matches a listing created through the API', async () => {
    const space = WarehouseSpaceSchema.parse(
      (
        await request(app)
          .post('/api/warehouse-spaces')
          .send(spacePayload({ minStorageDays: 1 }))
      ).body,
    );
    const requestId = await createRequestId(requestPayload({ needsTemperatureControl: true }));

    const { matches } = StorageMatchesResponseSchema.parse(
      (await request(app).get(`/api/storage-requests/${requestId}/matches`)).body,
    );
    expect(matches.map((m) => m.space.id)).toEqual([space.id]);
  });
});

describe('demo storage request (real PostGIS + deterministic seed)', () => {
  it.each([
    ['the day it was seeded', 0],
    ['a day after it was seeded', 24],
  ])('finds seeded Dallas-area warehouses %s', async (_label, hoursLater) => {
    await seedReferenceSet();

    const demoNow = new Date(Date.now() + hoursLater * 3_600_000);
    const created = await request(app).post('/api/storage-requests').send(buildDemoStorageRequest(demoNow));
    expect(created.status).toBe(201);
    const res = await request(app).get(`/api/storage-requests/${StorageRequestSchema.parse(created.body).id}/matches`);
    const { matches } = StorageMatchesResponseSchema.parse(res.body);

    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches[0]?.space.id).toBe(id('01'));
  });
});
