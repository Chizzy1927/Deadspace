import { z } from 'zod';
import {
  addDays,
  CalendarDate,
  CalendarDateInput,
  type Clock,
  ContactSchema,
  daysBetween,
  LocationSchema,
  NotesSchema,
  RecordMeta,
  systemClock,
  UsdAmountSchema,
  utcStartOfDay,
  withCrossFieldRules,
} from './common.js';
import { MAX_MATCH_HIGHLIGHTS } from './transport.js';

/** Billing period a warehouse quotes its per-pallet price in. */
export const StoragePricingPeriod = z.enum(['DAY', 'WEEK', 'MONTH']);
export type StoragePricingPeriod = z.infer<typeof StoragePricingPeriod>;

/**
 * V1 product-policy defaults (tunable; not data-integrity rules, not universal warehouse-domain
 * truths). They keep every listing a specific, bounded block of idle space rather than a permanent
 * facility directory entry (see CLAUDE.md product boundary). Shared so form and API agree.
 *
 * Date semantics (calendar days, no time of day):
 * - A listing's `availableTo` is the last day goods may be on site.
 * - A request's `endDate` is the move-out day; stay length = endDate − startDate in days.
 * - So the longest stay a listing can hold is availableTo − availableFrom days.
 */
export const STORAGE_POLICY = {
  /** Longest availability window (availableTo − availableFrom, in days) a listing may post. */
  maxAvailabilityDays: 180,
  /**
   * Furthest ahead a listing's availability and a request's stay may begin, in days from today.
   * V1 marketplace policy for near-term stranded capacity.
   */
  maxDaysAhead: 90,
  /** Longest stay (endDate − startDate, in days) a request may ask for. */
  maxStorageDays: 180,
  /** Pre-filled minimum stay for a listing. */
  defaultMinStorageDays: 1,
  /** Pre-filled search radius, compared as est. road miles. */
  defaultMaxDistanceMiles: 25,
  /** Widest search radius a request may declare (est. road miles). */
  maxDistanceMiles: 250,
  /**
   * Days a date may lie before today (UTC) and still count as "today". Calendar dates have no time
   * zone, and a user west of UTC can still be on the previous UTC day.
   */
  todayToleranceDays: 1,
} as const;

/** Sanity bounds on pallet counts, not product policy. */
export const STORAGE_LIMITS = {
  maxPallets: 10_000,
} as const;

const Pallets = z.number().int().min(1).max(STORAGE_LIMITS.maxPallets);

/** Earliest calendar date accepted as "today or later" for a given clock. */
function earliestAllowedDate(now: Clock): Date {
  return addDays(utcStartOfDay(now()), -STORAGE_POLICY.todayToleranceDays);
}

/** Latest calendar date a listing's availability or a request's stay may begin. */
function latestAllowedStart(now: Clock): Date {
  return addDays(utcStartOfDay(now()), STORAGE_POLICY.maxDaysAhead);
}

/** Builds the WarehouseSpace create schema; `now` is injectable for deterministic tests. */
export function createWarehouseSpaceInputSchema(now: Clock = systemClock) {
  const fields = ContactSchema.extend({
    location: LocationSchema,
    quantityAvailable: Pallets,
    /** Smallest block (pallet positions) the operator will rent. */
    minPallets: Pallets.optional(),
    availableFrom: CalendarDateInput,
    availableTo: CalendarDateInput,
    minStorageDays: z
      .number()
      .int()
      .min(1)
      .max(STORAGE_POLICY.maxAvailabilityDays)
      .default(STORAGE_POLICY.defaultMinStorageDays),
    temperatureControlled: z.boolean().default(false),
    foodGrade: z.boolean().default(false),
    pricingPeriod: StoragePricingPeriod,
    pricePerPalletPerPeriod: UsdAmountSchema,
    /** One combined in-and-out handling fee per pallet. */
    handlingFeePerPallet: UsdAmountSchema.optional(),
    notes: NotesSchema,
  });
  return withCrossFieldRules(fields, (space, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const windowDays = daysBetween(space.availableFrom, space.availableTo);

    if (space.availableFrom < earliestAllowedDate(now)) {
      issue('availableFrom', 'Available-from date cannot be in the past');
    } else if (space.availableFrom > latestAllowedStart(now)) {
      issue('availableFrom', `Availability must begin within ${STORAGE_POLICY.maxDaysAhead} days`);
    }
    if (windowDays < 1) {
      issue('availableTo', 'Available-until date must be after the available-from date');
    } else if (windowDays > STORAGE_POLICY.maxAvailabilityDays) {
      issue('availableTo', `Availability window must be at most ${STORAGE_POLICY.maxAvailabilityDays} days`);
    } else if (space.minStorageDays > windowDays) {
      issue('minStorageDays', `Minimum stay can't be longer than the ${windowDays}-day availability window`);
    }
    if (space.minPallets !== undefined && space.minPallets > space.quantityAvailable) {
      issue('minPallets', 'Minimum block cannot exceed the pallet positions available');
    }
  });
}
export const CreateWarehouseSpaceInputSchema = createWarehouseSpaceInputSchema();
/** Parsed, validated input (dates as UTC-midnight Dates). */
export type CreateWarehouseSpaceInput = z.output<typeof CreateWarehouseSpaceInputSchema>;
/** Wire payload (dates as `YYYY-MM-DD`), e.g. what the web form sends. */
export type CreateWarehouseSpacePayload = z.input<typeof CreateWarehouseSpaceInputSchema>;

/** Builds the StorageRequest create schema; `now` is injectable for deterministic tests. */
export function createStorageRequestInputSchema(now: Clock = systemClock) {
  const fields = ContactSchema.extend({
    location: LocationSchema,
    /** Search radius in est. road miles: a hard limit, never a ranking input. */
    maxDistanceMiles: z
      .number()
      .int()
      .min(1)
      .max(STORAGE_POLICY.maxDistanceMiles)
      .default(STORAGE_POLICY.defaultMaxDistanceMiles),
    pallets: Pallets,
    /** Move-in day. */
    startDate: CalendarDateInput,
    /** Move-out day. */
    endDate: CalendarDateInput,
    needsTemperatureControl: z.boolean().default(false),
    needsFoodGrade: z.boolean().default(false),
    maxBudgetTotal: UsdAmountSchema.optional(),
    notes: NotesSchema,
  });
  return withCrossFieldRules(fields, (req, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const stayDays = daysBetween(req.startDate, req.endDate);

    if (req.startDate < earliestAllowedDate(now)) {
      issue('startDate', 'Start date cannot be in the past');
    } else if (req.startDate > latestAllowedStart(now)) {
      issue('startDate', `Start date must be within ${STORAGE_POLICY.maxDaysAhead} days`);
    }
    if (stayDays < 1) {
      issue('endDate', 'End date must be after the start date');
    } else if (stayDays > STORAGE_POLICY.maxStorageDays) {
      issue('endDate', `Stay must be at most ${STORAGE_POLICY.maxStorageDays} days`);
    }
  });
}
export const CreateStorageRequestInputSchema = createStorageRequestInputSchema();
export type CreateStorageRequestInput = z.output<typeof CreateStorageRequestInputSchema>;
export type CreateStorageRequestPayload = z.input<typeof CreateStorageRequestInputSchema>;

/** WarehouseSpace as returned by the API (JSON: dates as strings). */
export const WarehouseSpaceSchema = ContactSchema.extend({
  ...RecordMeta,
  location: LocationSchema,
  quantityAvailable: z.number().int(),
  minPallets: z.number().int().nullable(),
  availableFrom: CalendarDate,
  availableTo: CalendarDate,
  minStorageDays: z.number().int(),
  temperatureControlled: z.boolean(),
  foodGrade: z.boolean(),
  pricingPeriod: StoragePricingPeriod,
  pricePerPalletPerPeriod: z.number(),
  handlingFeePerPallet: z.number().nullable(),
  notes: z.string().nullable(),
});
export type WarehouseSpace = z.infer<typeof WarehouseSpaceSchema>;

/** StorageRequest as returned by the API (JSON: dates as strings). */
export const StorageRequestSchema = ContactSchema.extend({
  ...RecordMeta,
  location: LocationSchema,
  maxDistanceMiles: z.number().int(),
  pallets: z.number().int(),
  startDate: CalendarDate,
  endDate: CalendarDate,
  needsTemperatureControl: z.boolean(),
  needsFoodGrade: z.boolean(),
  maxBudgetTotal: z.number().nullable(),
  notes: z.string().nullable(),
});
export type StorageRequest = z.infer<typeof StorageRequestSchema>;

/**
 * Metrics for one feasible warehouse match. Every `est*` value is an estimate (distance: straight
 * line × road factor; cost: the quoted rate prorated by day) and must be labelled "est." in the UI.
 */
export const StorageMatchMetricsSchema = z.object({
  /** Est. road miles from the shipper's location to the warehouse. */
  estDistanceMiles: z.number(),
  /** Requested stay, endDate − startDate. */
  stayDays: z.number().int(),
  /** Days the listing stays available after the move-out day (availableTo − endDate). */
  daysAfterEnd: z.number().int(),
  /** Share (0–1) of the listing's free pallet positions the request takes. */
  availableSpaceUsed: z.number().min(0).max(1),
  /** Days in the listing's pricing period used to prorate its rate (DAY 1, WEEK 7, MONTH 30). */
  pricingPeriodDays: z.number().int(),
  /** USD: rate × pallets × stayDays / pricingPeriodDays. */
  estStorageCost: z.number(),
  /** USD: combined in-and-out handling fee × pallets (0 when the listing has none). */
  estHandlingCost: z.number(),
  /** USD: estStorageCost + estHandlingCost. */
  estTotalCost: z.number(),
  /** What the cost was scored against: the shipper's budget, or the median est. total cost of feasible matches. */
  priceReference: z.object({ basis: z.enum(['BUDGET', 'MATCH_MEDIAN']), amount: z.number() }),
});
export type StorageMatchMetrics = z.infer<typeof StorageMatchMetricsSchema>;

const ScoreComponent = z.number().min(0).max(1);

/** Score components, each 0–1; score = round(100 × Σ weight × component). */
export const StorageScoreBreakdownSchema = z.object({
  location: ScoreComponent,
  price: ScoreComponent,
  capacityFit: ScoreComponent,
  roomToExtend: ScoreComponent,
});
export type StorageScoreBreakdown = z.infer<typeof StorageScoreBreakdownSchema>;

/**
 * The scoring model a set of matches was ranked with (weights and fixed references), so the UI can
 * explain a score without restating the formulas. Tunable V1 defaults, not optimal values.
 */
export const StorageScoringSchema = z.object({
  weights: StorageScoreBreakdownSchema,
  /** Est. miles at which the location component reaches 0. */
  locationReferenceMiles: z.number(),
  /** Days after move-out that earn full room-to-extend credit. */
  extensionFullCreditDays: z.number(),
  /** Cost / reference ratio at which the price component reaches 0 (0.5 at the reference). */
  priceZeroScoreRatio: z.number(),
});
export type StorageScoring = z.infer<typeof StorageScoringSchema>;

/** Stable machine-readable codes for deterministic storage-match highlights. */
export const StorageMatchHighlightCode = z.enum([
  'NEARBY',
  'NEAR_EDGE_OF_RADIUS',
  'UNDER_BUDGET',
  'OVER_BUDGET',
  'BELOW_TYPICAL_PRICE',
  'ROOM_TO_EXTEND',
  'NO_ROOM_TO_EXTEND',
]);
export type StorageMatchHighlightCode = z.infer<typeof StorageMatchHighlightCode>;

/** A short, rule-derived note on what stands out about a storage match. Caution notes come first. */
export const StorageMatchHighlightSchema = z.object({
  code: StorageMatchHighlightCode,
  tone: z.enum(['positive', 'caution']),
  text: z.string(),
});
export type StorageMatchHighlight = z.infer<typeof StorageMatchHighlightSchema>;

/** One ranked warehouse match for a storage request. */
export const StorageMatchSchema = z.object({
  space: WarehouseSpaceSchema,
  /** 0–100. */
  score: z.number().int().min(0).max(100),
  breakdown: StorageScoreBreakdownSchema,
  metrics: StorageMatchMetricsSchema,
  /** At most MAX_MATCH_HIGHLIGHTS; distinct from `reasons`, which explain every dimension. */
  highlights: z.array(StorageMatchHighlightSchema).max(MAX_MATCH_HIGHLIGHTS),
  reasons: z.array(z.string()),
});
export type StorageMatch = z.infer<typeof StorageMatchSchema>;

/** GET /api/storage-requests/:id/matches. */
export const StorageMatchesResponseSchema = z.object({
  request: StorageRequestSchema,
  scoring: StorageScoringSchema,
  matches: z.array(StorageMatchSchema),
});
export type StorageMatchesResponse = z.infer<typeof StorageMatchesResponseSchema>;
