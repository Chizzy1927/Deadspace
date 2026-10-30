import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createStorageRequest,
  findStorageRequestById,
  toStorageRequestDto,
} from '../../src/repositories/storage-request.repository.js';
import {
  createWarehouseSpace,
  findWarehouseSpaceById,
  findWarehouseSpacesByIds,
  toWarehouseSpaceDto,
} from '../../src/repositories/warehouse-space.repository.js';
import { createTestPrisma, DALLAS, daysFromToday, storageRequestInput, warehouseSpaceInput } from './helpers.js';

const prisma = createTestPrisma();

beforeEach(async () => {
  await prisma.warehouseSpace.deleteMany();
  await prisma.storageRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('WarehouseSpace persistence (real PostGIS)', () => {
  it('stores a validated space with database defaults', async () => {
    const input = warehouseSpaceInput();
    const created = await createWarehouseSpace(prisma, input);
    const stored = await prisma.warehouseSpace.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored.id).toMatch(/^c[a-z0-9]{20,}$/);
    expect(stored).toMatchObject({
      status: 'ACTIVE',
      locationLabel: DALLAS.label,
      locationLat: DALLAS.lat,
      locationLng: DALLAS.lng,
      quantityAvailable: 200,
      minPallets: null,
      availableFrom: input.availableFrom,
      availableTo: input.availableTo,
      minStorageDays: 1,
      temperatureControlled: false,
      foodGrade: false,
      pricingPeriod: 'MONTH',
      handlingFeePerPallet: null,
      notes: null,
    });
    expect(stored.pricePerPalletPerPeriod.toFixed(2)).toBe('16.00');
  });

  it('round-trips calendar dates exactly, with no time-zone shift', async () => {
    const availableFrom = daysFromToday(1);
    const availableTo = daysFromToday(61);
    const created = await createWarehouseSpace(prisma, warehouseSpaceInput({ availableFrom, availableTo }));

    const dto = toWarehouseSpaceDto((await findWarehouseSpaceById(prisma, created.id))!);
    expect(dto.availableFrom).toBe(availableFrom);
    expect(dto.availableTo).toBe(availableTo);
    // Stored as Postgres DATE, read back as UTC midnight.
    expect(created.availableFrom.toISOString()).toBe(`${availableFrom}T00:00:00.000Z`);
  });

  it('stores every optional field with exact money values', async () => {
    const created = await createWarehouseSpace(
      prisma,
      warehouseSpaceInput({
        minPallets: 20,
        minStorageDays: 14,
        temperatureControlled: true,
        foodGrade: true,
        pricingPeriod: 'DAY',
        pricePerPalletPerPeriod: 0.85,
        handlingFeePerPallet: 12.34,
        notes: 'Dock 3',
      }),
    );
    expect(toWarehouseSpaceDto(created)).toMatchObject({
      minPallets: 20,
      minStorageDays: 14,
      temperatureControlled: true,
      foodGrade: true,
      pricingPeriod: 'DAY',
      pricePerPalletPerPeriod: 0.85,
      handlingFeePerPallet: 12.34,
      notes: 'Dock 3',
    });
  });

  it('finds spaces by id and returns null or nothing for unknown ids', async () => {
    const a = await createWarehouseSpace(prisma, warehouseSpaceInput());
    const b = await createWarehouseSpace(prisma, warehouseSpaceInput());
    expect((await findWarehouseSpacesByIds(prisma, [a.id, b.id, 'missing'])).map((r) => r.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(await findWarehouseSpaceById(prisma, 'missing')).toBeNull();
  });
});

describe('StorageRequest persistence (real PostGIS)', () => {
  it('stores a validated request with defaults and maps it to the API shape', async () => {
    const input = storageRequestInput();
    const created = await createStorageRequest(prisma, input);
    const dto = toStorageRequestDto((await findStorageRequestById(prisma, created.id))!);

    expect(dto).toMatchObject({
      status: 'ACTIVE',
      location: DALLAS,
      maxDistanceMiles: 25,
      pallets: 40,
      startDate: daysFromToday(7),
      endDate: daysFromToday(37),
      needsTemperatureControl: false,
      needsFoodGrade: false,
      maxBudgetTotal: null,
      notes: null,
    });
  });

  it('stores requirements and an exact budget', async () => {
    const created = await createStorageRequest(
      prisma,
      storageRequestInput({
        maxDistanceMiles: 120,
        needsTemperatureControl: true,
        needsFoodGrade: true,
        maxBudgetTotal: 1899.99,
      }),
    );
    expect(created.maxBudgetTotal?.toString()).toBe('1899.99');
    expect(toStorageRequestDto(created)).toMatchObject({
      maxDistanceMiles: 120,
      needsTemperatureControl: true,
      needsFoodGrade: true,
      maxBudgetTotal: 1899.99,
    });
  });

  it('returns null for an unknown request', async () => {
    expect(await findStorageRequestById(prisma, 'missing')).toBeNull();
  });
});
