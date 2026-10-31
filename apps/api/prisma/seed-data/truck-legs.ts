// Deterministic truck-leg seed data. Locations resolve through MockGeocoder (fixed coordinates,
// never a network call). Times are fixed offsets from an anchor (the next UTC midnight by default),
// so the layout is identical on every run while dates stay inside the 30-day validation horizon.
//
// The set is shaped to exercise the future matching engine around a Dallas -> Houston request:
// on-route legs, small and large detours, reverse direction, trailer mismatches, insufficient
// spare capacity, departure-window mismatches and arrive-by commitments, plus regional variety.
import {
  type CreateTruckLegInput,
  createTruckLegInputSchema,
  type LoadState,
  nextUtcMidnight,
  type TrailerType,
  type TruckPricingBasis,
} from '@deadspace/shared';
import type { Geocoder, Place } from '../../src/geocoding/geocoder.js';

const HOUR_MS = 60 * 60 * 1000;

interface SeedLeg {
  key: string;
  company: [name: string, contact: string];
  from: string;
  to: string;
  /** Departure window start: day offset from the anchor and hour (UTC). */
  day: number;
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 2,
    hourUtc: 14,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'FLATBED',
    capacity: FLATBED_48,
    price: ['FLAT', 720],
  },
  {
    key: '05',
    company: ['Trinity Logistics', 'Alana Brooks'],
    from: 'Dallas, TX',
    to: 'Houston, TX',
    day: 5,
    hourUtc: 13,
    windowHours: 6,
    loadState: 'EMPTY',
    trailer: 'DRY_VAN',
    capacity: DRY_VAN_53,
    price: ['FLAT', 600],
    notes: 'Later in the week.',
  },
  {
    key: '06',
    company: ['Prairie Line Transport', 'Victor Hale'],
    from: 'Dallas, TX',
    to: 'Houston, TX',
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 1,
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
    day: 2,
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
    day: 2,
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
    day: 2,
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
    day: 2,
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
    day: 2,
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
    day: 2,
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
    day: 3,
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
    day: 2,
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
    day: 3,
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
    day: 3,
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
    day: 3,
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
    day: 2,
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
    day: 4,
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
    day: 4,
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

/** Resolves and validates every seed leg; throws if any location or rule fails. */
export async function buildSeedTruckLegs(anchor: Date, geocoder: Geocoder): Promise<SeedTruckLeg[]> {
  const schema = createTruckLegInputSchema(() => anchor);
  const resolve = async (query: string): Promise<Pick<Place, 'label' | 'lat' | 'lng'>> => {
    const [place] = await geocoder.search(query);
    if (!place) throw new Error(`Seed location not found: ${query}`);
    return { label: place.label, lat: place.lat, lng: place.lng };
  };

  const legs: SeedTruckLeg[] = [];
  for (const leg of SEED_LEGS) {
    const start = anchor.getTime() + (leg.day * 24 + leg.hourUtc) * HOUR_MS;
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
    legs.push({ id: `seed-truck-leg-${leg.key}`, input: parsed.data });
  }
  return legs;
}
