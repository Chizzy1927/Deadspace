import {
  type CreateTransportRequestInput,
  type CreateTransportRequestPayload,
  type CreateTruckLegInput,
  type CreateTruckLegPayload,
  CreateTransportRequestInputSchema,
  CreateTruckLegInputSchema,
} from '@deadspace/shared';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createPrismaClient, type PrismaClient } from '../../src/db.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { getPostgisVersion } from '../../src/repositories/geo.repository.js';
import { createDatabaseHealthCheck } from '../../src/services/health.service.js';

/** Prisma client for the *_test database (vitest.integration.config sets DATABASE_URL). */
export function createTestPrisma() {
  return createPrismaClient(loadEnv().DATABASE_URL);
}

/** The real app wired to the test database, with the offline MockGeocoder. */
export function createTestApp(prisma: PrismaClient) {
  return createApp({
    webOrigin: loadEnv().WEB_ORIGIN,
    checkDatabase: createDatabaseHealthCheck(() => getPostgisVersion(prisma)),
    prisma,
    geocoder: new MockGeocoder(),
  });
}

export const DALLAS = { label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 };
export const HOUSTON = { label: 'Houston, TX, United States', lat: 29.7604, lng: -95.3698 };

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** A valid leg departing tomorrow, parsed through the shared schema like a real request. */
export function truckLegInput(overrides: Partial<CreateTruckLegPayload> = {}): CreateTruckLegInput {
  return CreateTruckLegInputSchema.parse({
    companyName: 'Lone Star Freight',
    contactName: 'Dana Ortiz',
    contactEmail: 'dana@lonestar.example.com',
    origin: DALLAS,
    destination: HOUSTON,
    departureEarliest: hoursFromNow(24),
    departureLatest: hoursFromNow(30),
    loadState: 'EMPTY',
    trailerType: 'DRY_VAN',
    totalPallets: 26,
    totalWeightLbs: 44_000,
    pricingBasis: 'FLAT',
    priceAmount: 650,
    ...overrides,
  });
}

/** A valid request picking up tomorrow, parsed through the shared schema. */
export function transportRequestInput(
  overrides: Partial<CreateTransportRequestPayload> = {},
): CreateTransportRequestInput {
  return CreateTransportRequestInputSchema.parse({
    companyName: 'Acme Goods',
    contactName: 'Sam Lee',
    contactEmail: 'sam@acme.example.com',
    pickup: DALLAS,
    dropoff: HOUSTON,
    pickupEarliest: hoursFromNow(20),
    pickupLatest: hoursFromNow(32),
    trailerType: 'DRY_VAN',
    pallets: 6,
    weightLbs: 9_000,
    ...overrides,
  });
}
