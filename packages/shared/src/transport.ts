import { z } from 'zod';
import {
  type Clock,
  ContactSchema,
  DAY_MS,
  HOUR_MS,
  IsoDateTimeInput,
  LocationSchema,
  NotesSchema,
  Status,
  straightLineMiles,
  systemClock,
  UsdAmountSchema,
} from './common.js';

export const TrailerType = z.enum(['DRY_VAN', 'REEFER', 'FLATBED']);
export type TrailerType = z.infer<typeof TrailerType>;

/** EMPTY: the truck runs the leg with no freight. PARTIAL: some capacity is already committed. */
export const LoadState = z.enum(['EMPTY', 'PARTIAL']);
export type LoadState = z.infer<typeof LoadState>;

export const TruckPricingBasis = z.enum(['FLAT', 'PER_LOADED_MILE']);
export type TruckPricingBasis = z.infer<typeof TruckPricingBasis>;

/**
 * V1 product-policy defaults (tunable; not data-integrity rules, not derived from data).
 * They keep every listing a specific planned movement rather than an open-ended "truck available"
 * post or a local errand (see CLAUDE.md product boundary). Shared so form and API agree.
 */
export const TRANSPORT_POLICY = {
  /** Widest departure window a carrier may post. */
  maxDepartureWindowHours: 72,
  /** Furthest ahead a departure window may end. */
  maxDaysAhead: 30,
  /** Pre-filled detour allowance. */
  defaultMaxDetourMiles: 100,
  /**
   * Largest detour allowance a carrier may declare. Beyond this a leg stops being a specific
   * movement. Follow-up (Phase 3): the route-efficiency score divides by the carrier's own
   * maxDetourMiles, so a higher declared limit inflates its score; normalise against a reference
   * in matching/config.ts instead (see docs/ARCHITECTURE.md §9, Phase 3).
   */
  maxCarrierDetourMiles: 300,
  /**
   * Minimum straight-line (great-circle) distance between a leg's origin and destination, and
   * between a request's pickup and dropoff. Rejects same-place or across-town movements, which
   * DeadSpace doesn't serve and which make detour metrics degenerate.
   */
  minStraightLineMiles: 10,
} as const;

/** Sanity bounds on capacity input (roughly one 53' trailer), not product policy. */
export const TRANSPORT_LIMITS = {
  maxPallets: 30,
  maxWeightLbs: 50_000,
} as const;

const Pallets = z.number().int().min(1).max(TRANSPORT_LIMITS.maxPallets);
const WeightLbs = z.number().int().min(1).max(TRANSPORT_LIMITS.maxWeightLbs);
const CommittedPallets = z.number().int().min(0).max(TRANSPORT_LIMITS.maxPallets);
const CommittedWeightLbs = z.number().int().min(0).max(TRANSPORT_LIMITS.maxWeightLbs);

/**
 * Runs cross-field rules only once every field has parsed. (Zod 4 otherwise still runs refinements
 * after non-fatal field errors, handing them raw strings instead of Dates.)
 */
function withCrossFieldRules<T extends z.ZodType>(
  fields: T,
  rules: (value: z.output<T>, ctx: z.RefinementCtx) => void,
) {
  return fields.pipe(z.custom<z.output<T>>().superRefine(rules));
}

/** Builds the TruckLeg create schema; `now` is injectable for deterministic tests. */
export function createTruckLegInputSchema(now: Clock = systemClock) {
  const fields = ContactSchema.extend({
    origin: LocationSchema,
    destination: LocationSchema,
    departureEarliest: IsoDateTimeInput,
    departureLatest: IsoDateTimeInput,
    arriveBy: IsoDateTimeInput.optional(),
    loadState: LoadState,
    trailerType: TrailerType,
    totalPallets: Pallets,
    totalWeightLbs: WeightLbs,
    committedPallets: CommittedPallets.default(0),
    committedWeightLbs: CommittedWeightLbs.default(0),
    maxDetourMiles: z
      .number()
      .int()
      .min(1)
      .max(TRANSPORT_POLICY.maxCarrierDetourMiles)
      .default(TRANSPORT_POLICY.defaultMaxDetourMiles),
    pricingBasis: TruckPricingBasis,
    priceAmount: UsdAmountSchema,
    notes: NotesSchema,
  });
  return withCrossFieldRules(fields, (leg, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const earliest = leg.departureEarliest.getTime();
    const latest = leg.departureLatest.getTime();
    const nowMs = now().getTime();

    if (straightLineMiles(leg.origin, leg.destination) < TRANSPORT_POLICY.minStraightLineMiles) {
      issue('destination', `Destination must be at least ${TRANSPORT_POLICY.minStraightLineMiles} miles from origin`);
    }
    if (earliest > latest) {
      issue('departureLatest', 'Departure window must end at or after it starts');
    } else if (latest - earliest > TRANSPORT_POLICY.maxDepartureWindowHours * HOUR_MS) {
      issue('departureLatest', `Departure window must be at most ${TRANSPORT_POLICY.maxDepartureWindowHours} hours`);
    }
    if (latest <= nowMs) {
      issue('departureLatest', 'Departure window must end in the future');
    } else if (latest > nowMs + TRANSPORT_POLICY.maxDaysAhead * DAY_MS) {
      issue('departureLatest', `Departure must be at most ${TRANSPORT_POLICY.maxDaysAhead} days ahead`);
    }
    if (leg.arriveBy && leg.arriveBy.getTime() <= earliest) {
      issue('arriveBy', 'Arrive-by must be after the earliest departure');
    }

    if (leg.loadState === 'EMPTY') {
      if (leg.committedPallets !== 0) issue('committedPallets', 'An EMPTY leg has no committed pallets');
      if (leg.committedWeightLbs !== 0) issue('committedWeightLbs', 'An EMPTY leg has no committed weight');
    } else if (leg.committedPallets === 0 && leg.committedWeightLbs === 0) {
      issue('committedPallets', 'A PARTIAL leg must have some committed pallets or weight');
    }
    if (leg.committedPallets >= leg.totalPallets) {
      issue('committedPallets', 'Committed pallets must be less than total pallets');
    }
    if (leg.committedWeightLbs >= leg.totalWeightLbs) {
      issue('committedWeightLbs', 'Committed weight must be less than total weight');
    }
  });
}
export const CreateTruckLegInputSchema = createTruckLegInputSchema();
/** Parsed, validated input (dates as Date). */
export type CreateTruckLegInput = z.output<typeof CreateTruckLegInputSchema>;
/** Wire payload (dates as ISO strings), e.g. what the web form sends. */
export type CreateTruckLegPayload = z.input<typeof CreateTruckLegInputSchema>;

/** Builds the TransportRequest create schema; `now` is injectable for deterministic tests. */
export function createTransportRequestInputSchema(now: Clock = systemClock) {
  const fields = ContactSchema.extend({
    pickup: LocationSchema,
    dropoff: LocationSchema,
    pickupEarliest: IsoDateTimeInput,
    pickupLatest: IsoDateTimeInput,
    deliverBy: IsoDateTimeInput.optional(),
    trailerType: TrailerType,
    pallets: Pallets,
    weightLbs: WeightLbs,
    maxBudget: UsdAmountSchema.optional(),
    notes: NotesSchema,
  });
  return withCrossFieldRules(fields, (req, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const earliest = req.pickupEarliest.getTime();

    if (straightLineMiles(req.pickup, req.dropoff) < TRANSPORT_POLICY.minStraightLineMiles) {
      issue('dropoff', `Dropoff must be at least ${TRANSPORT_POLICY.minStraightLineMiles} miles from pickup`);
    }
    if (earliest > req.pickupLatest.getTime()) {
      issue('pickupLatest', 'Pickup window must end at or after it starts');
    }
    if (req.pickupLatest.getTime() <= now().getTime()) {
      issue('pickupLatest', 'Pickup window must end in the future');
    }
    if (req.deliverBy && req.deliverBy.getTime() <= earliest) {
      issue('deliverBy', 'Deliver-by must be after the earliest pickup');
    }
  });
}
export const CreateTransportRequestInputSchema = createTransportRequestInputSchema();
export type CreateTransportRequestInput = z.output<typeof CreateTransportRequestInputSchema>;
export type CreateTransportRequestPayload = z.input<typeof CreateTransportRequestInputSchema>;

const IsoDateTime = z.iso.datetime({ offset: true });
const RecordMeta = { id: z.string(), status: Status, createdAt: IsoDateTime, updatedAt: IsoDateTime };

/** TruckLeg as returned by the API (JSON: dates as ISO strings). */
export const TruckLegSchema = ContactSchema.extend({
  ...RecordMeta,
  origin: LocationSchema,
  destination: LocationSchema,
  departureEarliest: IsoDateTime,
  departureLatest: IsoDateTime,
  arriveBy: IsoDateTime.nullable(),
  loadState: LoadState,
  trailerType: TrailerType,
  totalPallets: z.number().int(),
  totalWeightLbs: z.number().int(),
  committedPallets: z.number().int(),
  committedWeightLbs: z.number().int(),
  maxDetourMiles: z.number().int(),
  pricingBasis: TruckPricingBasis,
  priceAmount: z.number(),
  notes: z.string().nullable(),
});
export type TruckLeg = z.infer<typeof TruckLegSchema>;

/** TransportRequest as returned by the API (JSON: dates as ISO strings). */
export const TransportRequestSchema = ContactSchema.extend({
  ...RecordMeta,
  pickup: LocationSchema,
  dropoff: LocationSchema,
  pickupEarliest: IsoDateTime,
  pickupLatest: IsoDateTime,
  deliverBy: IsoDateTime.nullable(),
  trailerType: TrailerType,
  pallets: z.number().int(),
  weightLbs: z.number().int(),
  maxBudget: z.number().nullable(),
  notes: z.string().nullable(),
});
export type TransportRequest = z.infer<typeof TransportRequestSchema>;

/** Share of a trailer's capacity in use, 0–1, before and after adding the request's load. */
const UtilisationSchema = z.object({ before: z.number(), after: z.number() });

/**
 * Metrics for one feasible truck-leg match. Every `est*` mileage is a road-distance estimate
 * (straight-line × road factor), not a routed distance, and must be labelled "est." in the UI.
 */
export const TruckMatchMetricsSchema = z.object({
  /** The carrier's planned origin → destination leg. */
  estDirectLegMiles: z.number(),
  /** Extra miles the carrier drives to serve the request. */
  estAdditionalMiles: z.number(),
  /** Pickup → dropoff miles with the request's freight on board. */
  estLoadedMiles: z.number(),
  /** EMPTY legs only: planned empty miles that now carry freight. Null for PARTIAL legs. */
  estEmptyMilesRecovered: z.number().nullable(),
  sparePallets: z.number().int(),
  spareWeightLbs: z.number().int(),
  palletUtilisation: UtilisationSchema,
  weightUtilisation: UtilisationSchema,
  /** The dimension with the higher utilisation after the match. */
  limitingCapacity: z.enum(['PALLETS', 'WEIGHT']),
  /** USD, from the listing's pricing basis. */
  estPrice: z.number(),
});
export type TruckMatchMetrics = z.infer<typeof TruckMatchMetricsSchema>;

/** One ranked truck-leg match for a transport request. */
export const TransportMatchSchema = z.object({
  leg: TruckLegSchema,
  /** 0–100. */
  score: z.number().int().min(0).max(100),
  /** Score components, each 0–1. */
  breakdown: z.object({ routeEfficiency: z.number() }),
  metrics: TruckMatchMetricsSchema,
  reasons: z.array(z.string()),
});
export type TransportMatch = z.infer<typeof TransportMatchSchema>;

/** GET /api/transport-requests/:id/matches. */
export const TransportMatchesResponseSchema = z.object({
  request: TransportRequestSchema,
  matches: z.array(TransportMatchSchema),
});
export type TransportMatchesResponse = z.infer<typeof TransportMatchesResponseSchema>;
