// Storage orchestration: persistence, candidate retrieval and matching, kept in separate layers.
import type {
  CreateStorageRequestInput,
  CreateWarehouseSpaceInput,
  StorageMatchesResponse,
  StorageRequest as StorageRequestDto,
  WarehouseSpace as WarehouseSpaceDto,
} from '@deadspace/shared';
import type { PrismaClient } from '../db.js';
import { rankWarehouseSpaces, WAREHOUSE_SCORING } from '../matching/warehouse.js';
import { findWarehouseCandidates } from '../repositories/geo.repository.js';
import {
  createStorageRequest,
  findStorageRequestById,
  toStorageMatchRequest,
  toStorageRequestDto,
} from '../repositories/storage-request.repository.js';
import {
  createWarehouseSpace,
  findWarehouseSpaceById,
  findWarehouseSpacesByIds,
  toWarehouseSpaceDto,
  toWarehouseSpaceFacts,
} from '../repositories/warehouse-space.repository.js';

export async function createWarehouseListing(
  prisma: PrismaClient,
  input: CreateWarehouseSpaceInput,
): Promise<WarehouseSpaceDto> {
  return toWarehouseSpaceDto(await createWarehouseSpace(prisma, input));
}

export async function getWarehouseSpace(prisma: PrismaClient, id: string): Promise<WarehouseSpaceDto | null> {
  const row = await findWarehouseSpaceById(prisma, id);
  return row && toWarehouseSpaceDto(row);
}

export async function submitStorageRequest(
  prisma: PrismaClient,
  input: CreateStorageRequestInput,
): Promise<StorageRequestDto> {
  return toStorageRequestDto(await createStorageRequest(prisma, input));
}

export async function getStorageRequest(prisma: PrismaClient, id: string): Promise<StorageRequestDto | null> {
  const row = await findStorageRequestById(prisma, id);
  return row && toStorageRequestDto(row);
}

/**
 * Ranked warehouse matches for a persisted request, computed on demand (never stored).
 * PostGIS narrows the candidates and supplies distances; the pure matcher re-checks and ranks.
 * Returns null if the request doesn't exist.
 */
export async function getStorageMatches(
  prisma: PrismaClient,
  requestId: string,
): Promise<StorageMatchesResponse | null> {
  const request = await findStorageRequestById(prisma, requestId);
  if (!request) return null;

  const candidateRows = await findWarehouseCandidates(prisma, requestId);
  const spaceRows = await findWarehouseSpacesByIds(
    prisma,
    candidateRows.map((c) => c.spaceId),
  );
  const spaces = new Map(spaceRows.map((row) => [row.id, row]));
  // A space deleted between the two queries simply drops out.
  const candidates = candidateRows.flatMap(({ spaceId, straightLineMiles }) => {
    const row = spaces.get(spaceId);
    return row ? [{ space: toWarehouseSpaceFacts(row), straightLineMiles }] : [];
  });

  const matches = rankWarehouseSpaces(toStorageMatchRequest(request), candidates).flatMap(({ spaceId, ...match }) => {
    const row = spaces.get(spaceId);
    return row ? [{ space: toWarehouseSpaceDto(row), ...match }] : [];
  });
  return { request: toStorageRequestDto(request), scoring: WAREHOUSE_SCORING, matches };
}
