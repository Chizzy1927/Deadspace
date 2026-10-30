// Transport orchestration: persistence, candidate retrieval and matching, kept in separate layers.
import type {
  CreateTransportRequestInput,
  CreateTruckLegInput,
  TransportMatchesResponse,
  TransportRequest as TransportRequestDto,
  TruckLeg as TruckLegDto,
} from '@deadspace/shared';
import type { PrismaClient } from '../db.js';
import type { TransportRequest, TruckLeg } from '../generated/prisma/client.js';
import { rankTruckLegs, type TruckLegFacts, type TruckMatchRequest } from '../matching/truck.js';
import { findTruckLegCandidates } from '../repositories/geo.repository.js';
import {
  createTransportRequest,
  findTransportRequestById,
  toTransportRequestDto,
} from '../repositories/transport-request.repository.js';
import {
  createTruckLeg,
  findTruckLegById,
  findTruckLegsByIds,
  toTruckLegDto,
} from '../repositories/truck-leg.repository.js';

export async function createTruckLegListing(prisma: PrismaClient, input: CreateTruckLegInput): Promise<TruckLegDto> {
  return toTruckLegDto(await createTruckLeg(prisma, input));
}

export async function getTruckLeg(prisma: PrismaClient, id: string): Promise<TruckLegDto | null> {
  const row = await findTruckLegById(prisma, id);
  return row && toTruckLegDto(row);
}

export async function submitTransportRequest(
  prisma: PrismaClient,
  input: CreateTransportRequestInput,
): Promise<TransportRequestDto> {
  return toTransportRequestDto(await createTransportRequest(prisma, input));
}

export async function getTransportRequest(prisma: PrismaClient, id: string): Promise<TransportRequestDto | null> {
  const row = await findTransportRequestById(prisma, id);
  return row && toTransportRequestDto(row);
}

function toMatchRequest(row: TransportRequest): TruckMatchRequest {
  return {
    pickupEarliest: row.pickupEarliest,
    pickupLatest: row.pickupLatest,
    deliverBy: row.deliverBy,
    trailerType: row.trailerType,
    pallets: row.pallets,
    weightLbs: row.weightLbs,
    maxBudget: row.maxBudget?.toNumber() ?? null,
  };
}

function toLegFacts(row: TruckLeg): TruckLegFacts {
  return {
    id: row.id,
    status: row.status,
    trailerType: row.trailerType,
    loadState: row.loadState,
    departureEarliest: row.departureEarliest,
    departureLatest: row.departureLatest,
    arriveBy: row.arriveBy,
    totalPallets: row.totalPallets,
    totalWeightLbs: row.totalWeightLbs,
    committedPallets: row.committedPallets,
    committedWeightLbs: row.committedWeightLbs,
    maxDetourMiles: row.maxDetourMiles,
    pricingBasis: row.pricingBasis,
    priceAmount: row.priceAmount.toNumber(),
  };
}

/**
 * Ranked truck-leg matches for a persisted request, computed on demand (never stored).
 * PostGIS narrows the candidates and supplies distances; the pure matcher re-checks and ranks.
 * Returns null if the request doesn't exist.
 */
export async function getTransportMatches(
  prisma: PrismaClient,
  requestId: string,
): Promise<TransportMatchesResponse | null> {
  const request = await findTransportRequestById(prisma, requestId);
  if (!request) return null;

  const candidateRows = await findTruckLegCandidates(prisma, requestId);
  const legRows = await findTruckLegsByIds(
    prisma,
    candidateRows.map((c) => c.legId),
  );
  const legs = new Map(legRows.map((row) => [row.id, row]));
  // A leg deleted between the two queries simply drops out.
  const candidates = candidateRows.flatMap(({ legId, distances }) => {
    const row = legs.get(legId);
    return row ? [{ leg: toLegFacts(row), distances }] : [];
  });

  const matches = rankTruckLegs(toMatchRequest(request), candidates).flatMap(({ legId, ...match }) => {
    const row = legs.get(legId);
    return row ? [{ leg: toTruckLegDto(row), ...match }] : [];
  });
  return { request: toTransportRequestDto(request), matches };
}
