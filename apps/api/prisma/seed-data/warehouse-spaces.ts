// Deterministic warehouse-space seed data. Locations resolve through MockGeocoder (fixed
// coordinates, never a network call). Availability dates are whole-day offsets from the anchor
// (the next UTC midnight by default), so the layout is identical on every run while dates stay
// inside the STORAGE_POLICY horizon.
//
// The set is shaped to exercise the matching engine around a reference Dallas request
// (about 40 pallets, moving in on day 7 and out on day 37, 25 est. mi radius): nearby feasible
// sites at varied distances and prices, plus spaces excluded by quantity, minimum block, minimum
// stay, availability window and distance, specialised (temperature-controlled / food-grade)
// space, and regional variety.
import {
  addDays,
  type CreateWarehouseSpaceInput,
  createWarehouseSpaceInputSchema,
  type StoragePricingPeriod,
  toCalendarDate,
} from '@deadspace/shared';
import type { Geocoder, Place } from '../../src/geocoding/geocoder.js';

interface SeedSpace {
  key: string;
  company: [name: string, contact: string];
  at: string;
  pallets: number;
  minPallets?: number;
  /** Availability as day offsets from the anchor: [availableFrom, availableTo]. */
  window: [from: number, to: number];
  minStorageDays?: number;
  temperatureControlled?: boolean;
  foodGrade?: boolean;
  price: [period: StoragePricingPeriod, perPalletUsd: number];
  handlingFeePerPallet?: number;
  notes?: string;
}

const SEED_SPACES: readonly SeedSpace[] = [
  // --- Dallas area: feasible for the reference request ---
  {
    key: '01',
    company: ['Trinity Storage Co.', 'Ana Ruiz'],
    at: 'Dallas, TX',
    pallets: 200,
    window: [0, 120],
    price: ['MONTH', 16],
    handlingFeePerPallet: 8,
    notes: 'Racking freed up after a customer consolidated.',
  },
  {
    key: '02',
    company: ['Irving Distribution', 'Ben Cho'],
    at: 'Irving, TX',
    pallets: 80,
    window: [3, 40],
    price: ['WEEK', 5.25],
    notes: 'Gap before a seasonal contract starts.',
  },
  {
    key: '03',
    company: ['Lancaster Cold Store', 'Rita Okafor'],
    at: 'Lancaster, TX',
    pallets: 60,
    window: [0, 90],
    temperatureControlled: true,
    foodGrade: true,
    price: ['MONTH', 32],
    handlingFeePerPallet: 12,
  },
  {
    key: '04',
    company: ['North Plano Logistics', 'Evan Moss'],
    at: 'Plano, TX',
    pallets: 45,
    minPallets: 30,
    window: [5, 65],
    minStorageDays: 14,
    price: ['DAY', 0.85],
  },
  // --- Dallas area: excluded for the reference request ---
  {
    key: '05',
    company: ['Arlington Bulk Warehousing', 'Tom Reyes'],
    at: 'Arlington, TX',
    pallets: 500,
    minPallets: 100,
    window: [0, 150],
    price: ['MONTH', 12],
    notes: 'Large blocks only.',
  },
  {
    key: '06',
    company: ['Deep Ellum Storage', 'Lena Park'],
    at: 'Dallas, TX',
    pallets: 25,
    window: [0, 60],
    price: ['MONTH', 15],
  },
  {
    key: '07',
    company: ['Metro Long-Term Storage', 'Carl Dunn'],
    at: 'Dallas, TX',
    pallets: 150,
    window: [0, 120],
    minStorageDays: 60,
    price: ['MONTH', 11],
  },
  {
    key: '08',
    company: ['Las Colinas Fulfillment', 'Maya Singh'],
    at: 'Irving, TX',
    pallets: 100,
    window: [0, 30],
    price: ['WEEK', 4],
    notes: 'Space is committed again from the end of the month.',
  },
  {
    key: '09',
    company: ['Collin County Depot', 'Jake Ford'],
    at: 'Plano, TX',
    pallets: 120,
    window: [14, 100],
    price: ['MONTH', 14],
  },
  {
    key: '10',
    company: ['Cowtown Warehousing', 'Rosa Vega'],
    at: 'Fort Worth, TX',
    pallets: 300,
    window: [0, 180],
    price: ['MONTH', 13],
  },
  {
    key: '11',
    company: ['Denton Food Logistics', 'Owen Hart'],
    at: 'Denton, TX',
    pallets: 120,
    window: [2, 92],
    foodGrade: true,
    price: ['MONTH', 17],
  },
  // --- Regional ---
  {
    key: '12',
    company: ['Bayou Cold Chain', 'Nadia Pierre'],
    at: 'Houston, TX',
    pallets: 400,
    window: [0, 120],
    temperatureControlled: true,
    foodGrade: true,
    price: ['MONTH', 28],
    handlingFeePerPallet: 10,
  },
  {
    key: '13',
    company: ['Ship Channel Storage', 'Gus Alvarez'],
    at: 'Houston, TX',
    pallets: 250,
    window: [7, 97],
    price: ['WEEK', 4.5],
  },
  {
    key: '14',
    company: ['Capital City Warehouse', 'Iris Bell'],
    at: 'Austin, TX',
    pallets: 90,
    window: [10, 70],
    price: ['MONTH', 19],
  },
  {
    key: '15',
    company: ['Alamo Chill Storage', 'Rafael Soto'],
    at: 'San Antonio, TX',
    pallets: 70,
    window: [0, 60],
    temperatureControlled: true,
    price: ['DAY', 1.1],
  },
  {
    key: '16',
    company: ['Sooner Storage', 'Hank Miller'],
    at: 'Oklahoma City, OK',
    pallets: 150,
    window: [20, 110],
    price: ['MONTH', 12],
  },
  {
    key: '17',
    company: ['River City Distribution', 'Janelle Price'],
    at: 'Memphis, TN',
    pallets: 600,
    minPallets: 50,
    window: [0, 180],
    price: ['MONTH', 10.5],
    handlingFeePerPallet: 6,
  },
];

export interface SeedWarehouseSpace {
  id: string;
  input: CreateWarehouseSpaceInput;
}

/** Resolves and validates every seed space; throws if any location or rule fails. */
export async function buildSeedWarehouseSpaces(anchor: Date, geocoder: Geocoder): Promise<SeedWarehouseSpace[]> {
  const schema = createWarehouseSpaceInputSchema(() => anchor);
  const resolve = async (query: string): Promise<Pick<Place, 'label' | 'lat' | 'lng'>> => {
    const [place] = await geocoder.search(query);
    if (!place) throw new Error(`Seed location not found: ${query}`);
    return { label: place.label, lat: place.lat, lng: place.lng };
  };
  const day = (offset: number) => toCalendarDate(addDays(anchor, offset));

  const spaces: SeedWarehouseSpace[] = [];
  for (const space of SEED_SPACES) {
    const [companyName, contactName] = space.company;
    const payload = {
      companyName,
      contactName,
      contactEmail: `${contactName.split(' ')[0]!.toLowerCase()}@${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example.com`,
      location: await resolve(space.at),
      quantityAvailable: space.pallets,
      ...(space.minPallets !== undefined && { minPallets: space.minPallets }),
      availableFrom: day(space.window[0]),
      availableTo: day(space.window[1]),
      ...(space.minStorageDays !== undefined && { minStorageDays: space.minStorageDays }),
      temperatureControlled: space.temperatureControlled ?? false,
      foodGrade: space.foodGrade ?? false,
      pricingPeriod: space.price[0],
      pricePerPalletPerPeriod: space.price[1],
      ...(space.handlingFeePerPallet !== undefined && { handlingFeePerPallet: space.handlingFeePerPallet }),
      ...(space.notes !== undefined && { notes: space.notes }),
    };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new Error(`Seed warehouse space ${space.key} is invalid: ${parsed.error.message}`);
    spaces.push({ id: `seed-warehouse-space-${space.key}`, input: parsed.data });
  }
  return spaces;
}
