// Deterministic truck-leg seed data. Locations resolve through MockGeocoder (fixed coordinates,
// never a network call).
//
// The legs below are fictional carrier movements. Each has a stable key and runs on actual calendar
// days (its `schedule`), departing at `hourUtc` on each of them. The database holds one row per leg per
// departure day, so every day in the horizon has inventory and no seed run ever has to move any:
//   - A row's id embeds its departure date and the leg key (`seed-truck-leg-20261112-01`), and every
//     value is derived from (departure day, leg) alone. A row is therefore identical on every run, and
//     seeding only ever inserts rows that are missing; it never updates or removes existing ones, so a
//     request's historical matches do not change.
//   - Most legs run DAILY. The six legs the standard demo request can match (dry-van Dallas -> Houston
//     and its feeders) run on alternate days, three on even days and three on odd days (counted in
//     days since the Unix epoch). The demo's pickup window is 32 h wide and always spans one even and
//     one odd day, so it shows each of those carriers exactly once, never a duplicate copy, while
//     every single day still has dry-van corridor inventory.
//   - A seed run creates departure days from the day before its anchor through SEED_LAST_DAY_OFFSET
//     days after it.
//
// There is intentionally no "departs too late" leg (the former leg 05, an on-route dry van on day 5). In a
// continuous schedule every day lies inside some visitor's window, so such a leg would be a normal
// on-route match for the standard demo request. Timing feasibility is covered directly by the matching tests.
//
// The set is shaped to exercise the matching engine around a Dallas -> Houston request: on-route
// legs, small and large detours, reverse direction, trailer mismatches, insufficient spare capacity
// and arrive-by commitments, plus regional variety.
import {
  type CreateTruckLegInput,
  createTruckLegInputSchema,
  type LoadState,
  nextUtcMidnight,
  toCalendarDate,
  utcStartOfDay,
  type TrailerType,
  type TruckPricingBasis,
} from '@deadspace/shared';
import type { Geocoder, Place } from '../../src/geocoding/geocoder.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The demo is guaranteed for a visitor whose request anchor (their next UTC midnight) is at most this
 * many days after the seed anchor: the standard request needs that day and the one after it.
 */
export const SEED_HORIZON_DAYS = 45;
/** The last departure day a seed run creates, in days after its anchor: the horizon plus the demo window's second day. */
export const SEED_LAST_DAY_OFFSET = SEED_HORIZON_DAYS + 1;
/** The first departure day a seed run creates, in days after its anchor (-1 is the seed day itself). */
export const SEED_FIRST_DAY_OFFSET = -1;

/** Which days a leg runs: every day, or only even / odd days counted since the Unix epoch. */
export type SeedSchedule = 'DAILY' | 'EVEN_DAYS' | 'ODD_DAYS';

interface SeedLeg {
  key: string;
  company: [name: string, contact: string];
  from: string;
  to: string;
  /** The days the leg runs. */
  schedule: SeedSchedule;
  /** Departure window start, in hours after UTC midnight of each day it runs. */
  hourUtc: number;
  windowHours: number;
  /** Optional fixed next commitment, in hours after the window start. */
  arriveByAfterHours?: number;
  loadState: LoadState;
  trailer: TrailerType;
  capacity: [pallets: number, weightLbs: number];
  committed?: [pallets: number, weightLbs: number];
  maxDetourMiles?: number;
  price: [basis: TruckPricingBasis, amountUsd: number];
  notes?: string;
}

const DRY_VAN_53: [number, number] = [26, 44_000];
const REEFER_53: [number, number] = [24, 42_000];
const FLATBED_48: [number, number] = [24, 47_000];

const SEED_LEGS: readonly SeedLeg[] = [
  // --- Dallas -> Houston corridor: direct legs ---
  {
    key: '01',
    company: ['Lone Star Freight', 'Dana Ortiz'],
    from: 'Dallas, TX',
    to: 'Houston, TX',
    schedule: 'EVEN_DAYS',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 650],
    notes: 'Deadheading home after a Dallas delivery.',
  },
  {
    key: '02',
    company: ['Gulf Coast Carriers', 'Marcus Reed'],
    from: 'Dallas, TX',
    to: 'Houston, TX',
    schedule: 'EVEN_DAYS',
    hourUtc: 15,
    windowHours: 4,
    arriveByAfterHours: 15,
    loadState: 'PARTIAL',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    committed: [14, 22_000],
    price: ['PER_LOADED_MILE', 2.1],
    notes: 'Must be at Houston DC by early morning.',
  },
  {
    key: '03',
    company: ['Bluebonnet Cold Chain', 'Priya Shah'],
    from: 'Dallas, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 12,
    windowHours: 8,
    loadState: 'EMPTY',
    trailer: 'REEFER',
    capacity: REEFER_53,
    price: ['FLAT', 780],
  },
  {
    key: '04',
    company: ['Red River Flatbed', 'Cole Jennings'],
    from: 'Dallas, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 14,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'FLATBED',
    capacity: FLATBED_48,
    price: ['FLAT', 720],
  },
  {
    key: '06',
    company: ['Prairie Line Transport', 'Victor Hale'],
    from: 'Dallas, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 14,
    windowHours: 5,
    loadState: 'PARTIAL',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    committed: [24, 38_000],
    price: ['FLAT', 350],
    notes: 'Room for a couple of pallets only.',
  },
  {
    key: '07',
    company: ['Metroplex Haulers', 'Jordan Kim'],
    from: 'Dallas, TX',
    to: 'Houston, TX',
    schedule: 'ODD_DAYS',
    hourUtc: 16,
    windowHours: 4,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    maxDetourMiles: 25,
    price: ['PER_LOADED_MILE', 2.4],
    notes: 'Tight schedule, minimal detours.',
  },
  // --- Corridor: near-route origins/destinations ---
  {
    key: '08',
    company: ['Cowtown Carriers', 'Reese Walker'],
    from: 'Fort Worth, TX',
    to: 'Houston, TX',
    schedule: 'ODD_DAYS',
    hourUtc: 12,
    windowHours: 8,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 700],
  },
  {
    key: '09',
    company: ['Navarro Trucking', 'Hector Morales'],
    from: 'Corsicana, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 15,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 520],
  },
  {
    key: '10',
    company: ['Piney Woods Freight', 'Tessa Grant'],
    from: 'Dallas, TX',
    to: 'Huntsville, TX',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 480],
  },
  {
    key: '11',
    company: ['Brazos Valley Lines', 'Owen Pierce'],
    from: 'Waco, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 14,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 560],
  },
  {
    key: '12',
    company: ['Rose City Transport', 'Maya Collins'],
    from: 'Tyler, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 8,
    loadState: 'PARTIAL',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    committed: [8, 12_000],
    price: ['PER_LOADED_MILE', 1.95],
  },
  {
    key: '13',
    company: ['Sooner Express', 'Brett Lawson'],
    from: 'Oklahoma City, OK',
    to: 'Houston, TX',
    schedule: 'ODD_DAYS',
    hourUtc: 6,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 1150],
    notes: 'Long haul through the Metroplex.',
  },
  {
    key: '14',
    company: ['Big Thicket Hauling', 'Nina Park'],
    from: 'Dallas, TX',
    to: 'Beaumont, TX',
    schedule: 'EVEN_DAYS',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 690],
  },
  // --- Corridor: poor fits for Dallas -> Houston (large detour or wrong direction) ---
  {
    key: '15',
    company: ['Alamo Freightways', 'Luis Ramirez'],
    from: 'Dallas, TX',
    to: 'San Antonio, TX',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 640],
  },
  {
    key: '16',
    company: ['Bayou City Logistics', 'Erin Foster'],
    from: 'Houston, TX',
    to: 'Dallas, TX',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 650],
  },
  {
    key: '17',
    company: ['Capital Carriers', 'Sam Whitaker'],
    from: 'Dallas, TX',
    to: 'Austin, TX',
    schedule: 'DAILY',
    hourUtc: 14,
    windowHours: 6,
    loadState: 'PARTIAL',
    trailer: 'DRY_VAN',
    capacity: [20, 40_000],
    committed: [18, 30_000],
    price: ['FLAT', 400],
  },
  // --- Texas regional ---
  {
    key: '18',
    company: ['Hill Country Reefer', 'Grace Liu'],
    from: 'Austin, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'REEFER',
    capacity: REEFER_53,
    price: ['FLAT', 620],
  },
  {
    key: '19',
    company: ['Mission Road Freight', 'Diego Castillo'],
    from: 'San Antonio, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 12,
    windowHours: 8,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['PER_LOADED_MILE', 2.0],
  },
  {
    key: '20',
    company: ['Ship Channel Transport', 'Kara Nguyen'],
    from: 'Houston, TX',
    to: 'San Antonio, TX',
    schedule: 'DAILY',
    hourUtc: 14,
    windowHours: 6,
    loadState: 'PARTIAL',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    committed: [10, 16_000],
    price: ['FLAT', 480],
  },
  {
    key: '21',
    company: ['Colorado River Lines', 'Ben Archer'],
    from: 'Austin, TX',
    to: 'Dallas, TX',
    schedule: 'DAILY',
    hourUtc: 15,
    windowHours: 5,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 590],
  },
  {
    key: '22',
    company: ['Border Steel Haulers', 'Rosa Delgado'],
    from: 'San Antonio, TX',
    to: 'Laredo, TX',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'PARTIAL',
    trailer: 'FLATBED',
    capacity: FLATBED_48,
    committed: [6, 20_000],
    price: ['FLAT', 420],
  },
  {
    key: '23',
    company: ['Coastal Bend Cold Storage', 'Ian Mercer'],
    from: 'Corpus Christi, TX',
    to: 'Houston, TX',
    schedule: 'DAILY',
    hourUtc: 11,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'REEFER',
    capacity: REEFER_53,
    price: ['FLAT', 610],
  },
  {
    key: '24',
    company: ['Ark-La-Tex Freight', 'Molly Dunn'],
    from: 'Shreveport, LA',
    to: 'Dallas, TX',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 560],
  },
  // --- Interstate / long haul ---
  {
    key: '25',
    company: ['Crescent Reefer Co.', 'Andre Baptiste'],
    from: 'Houston, TX',
    to: 'New Orleans, LA',
    schedule: 'DAILY',
    hourUtc: 14,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'REEFER',
    capacity: REEFER_53,
    price: ['FLAT', 820],
  },
  {
    key: '26',
    company: ['Red Dirt Transport', 'Kyle Benton'],
    from: 'Dallas, TX',
    to: 'Oklahoma City, OK',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'PARTIAL',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    committed: [12, 18_000],
    price: ['PER_LOADED_MILE', 2.25],
  },
  {
    key: '27',
    company: ['Delta Run Logistics', 'Tamika Hayes'],
    from: 'Dallas, TX',
    to: 'Memphis, TN',
    schedule: 'DAILY',
    hourUtc: 12,
    windowHours: 8,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 1250],
  },
  {
    key: '28',
    company: ['Heartland Partial Loads', 'Greg Olsen'],
    from: 'Kansas City, MO',
    to: 'Dallas, TX',
    schedule: 'DAILY',
    hourUtc: 10,
    windowHours: 6,
    loadState: 'PARTIAL',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    committed: [16, 26_000],
    price: ['FLAT', 700],
  },
  {
    key: '29',
    company: ['Peach State Freight', 'Leah Simmons'],
    from: 'Houston, TX',
    to: 'Atlanta, GA',
    schedule: 'DAILY',
    hourUtc: 12,
    windowHours: 4,
    arriveByAfterHours: 44,
    loadState: 'PARTIAL',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    committed: [9, 15_000],
    price: ['PER_LOADED_MILE', 1.85],
    notes: 'Fixed Atlanta appointment.',
  },
  {
    key: '30',
    company: ['Desert Flatbed Co.', 'Ray Contreras'],
    from: 'El Paso, TX',
    to: 'Phoenix, AZ',
    schedule: 'DAILY',
    hourUtc: 14,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'FLATBED',
    capacity: FLATBED_48,
    price: ['FLAT', 980],
  },
  {
    key: '31',
    company: ['High Plains Reefer', 'Holly Brandt'],
    from: 'Amarillo, TX',
    to: 'Denver, CO',
    schedule: 'DAILY',
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'REEFER',
    capacity: REEFER_53,
    price: ['FLAT', 1050],
  },
];

export interface SeedTruckLeg {
  id: string;
  input: CreateTruckLegInput;
}

/** Default anchor: the next UTC midnight after `now` (shared, so the web demo requests use the same rule). */
export const defaultSeedAnchor = nextUtcMidnight;

const epochDay = (day: Date) => Math.floor(day.getTime() / DAY_MS);

function runsOn(schedule: SeedSchedule, day: Date): boolean {
  if (schedule === 'DAILY') return true;
  return (epochDay(day) % 2 === 0) === (schedule === 'EVEN_DAYS');
}

/** `YYYYMMDD` of a departure day's UTC date: the date part of every id for that day. */
function dayStamp(day: Date): string {
  return toCalendarDate(day).replaceAll('-', '');
}

/**
 * The departure days a seed run with this anchor must have: every UTC day from SEED_FIRST_DAY_OFFSET to
 * SEED_LAST_DAY_OFFSET days around the anchor's UTC date. Depends only on that date.
 */
export function seedDepartureDays(seedAnchor: Date): Date[] {
  const anchor = utcStartOfDay(seedAnchor).getTime();
  const days: Date[] = [];
  for (let offset = SEED_FIRST_DAY_OFFSET; offset <= SEED_LAST_DAY_OFFSET; offset++) {
    days.push(new Date(anchor + offset * DAY_MS));
  }
  return days;
}

/**
 * Resolves and validates the legs departing on one UTC day (`day` is that day's midnight). By default
 * only the legs scheduled for that day; `allLegs` ignores the schedule and returns every leg, for
 * tests that need the whole layout on a single day. Throws if any location or rule fails.
 */
export async function buildSeedTruckLegsForDay(
  day: Date,
  geocoder: Geocoder,
  { allLegs = false }: { allLegs?: boolean } = {},
): Promise<SeedTruckLeg[]> {
  // Seeds are validated as of the day before departure, so every leg is a future departure.
  const clock = new Date(day.getTime() - DAY_MS);
  const schema = createTruckLegInputSchema(() => clock);
  const resolve = async (query: string): Promise<Pick<Place, 'label' | 'lat' | 'lng'>> => {
    const [place] = await geocoder.search(query);
    if (!place) throw new Error(`Seed location not found: ${query}`);
    return { label: place.label, lat: place.lat, lng: place.lng };
  };

  const legs: SeedTruckLeg[] = [];
  for (const leg of SEED_LEGS) {
    if (!allLegs && !runsOn(leg.schedule, day)) continue;
    const start = day.getTime() + leg.hourUtc * HOUR_MS;
    const [companyName, contactName] = leg.company;
    const [committedPallets, committedWeightLbs] = leg.committed ?? [0, 0];
    const payload = {
      companyName,
      contactName,
      contactEmail: `${contactName.split(' ')[0]!.toLowerCase()}@${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example.com`,
      origin: await resolve(leg.from),
      destination: await resolve(leg.to),
      departureEarliest: new Date(start).toISOString(),
      departureLatest: new Date(start + leg.windowHours * HOUR_MS).toISOString(),
      ...(leg.arriveByAfterHours !== undefined && {
        arriveBy: new Date(start + leg.arriveByAfterHours * HOUR_MS).toISOString(),
      }),
      loadState: leg.loadState,
      trailerType: leg.trailer,
      totalPallets: leg.capacity[0],
      totalWeightLbs: leg.capacity[1],
      committedPallets,
      committedWeightLbs,
      ...(leg.maxDetourMiles !== undefined && { maxDetourMiles: leg.maxDetourMiles }),
      pricingBasis: leg.price[0],
      priceAmount: leg.price[1],
      ...(leg.notes !== undefined && { notes: leg.notes }),
    };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new Error(`Seed leg ${leg.key} is invalid: ${parsed.error.message}`);
    legs.push({ id: `seed-truck-leg-${dayStamp(day)}-${leg.key}`, input: parsed.data });
  }
  return legs;
}

/** Every leg of every departure day a seed run with this anchor needs, earliest day first. */
export async function buildSeedTruckLegSchedule(seedAnchor: Date, geocoder: Geocoder): Promise<SeedTruckLeg[]> {
  const legs: SeedTruckLeg[] = [];
  for (const day of seedDepartureDays(seedAnchor)) legs.push(...(await buildSeedTruckLegsForDay(day, geocoder)));
  return legs;
}

/** Number of distinct legs in the layout, and how many run on each kind of day. */
export const SEED_LEG_COUNTS = {
  total: SEED_LEGS.length,
  daily: SEED_LEGS.filter((l) => l.schedule === 'DAILY').length,
  evenDays: SEED_LEGS.filter((l) => l.schedule === 'EVEN_DAYS').length,
  oddDays: SEED_LEGS.filter((l) => l.schedule === 'ODD_DAYS').length,
} as const;
