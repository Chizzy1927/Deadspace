// Demo request payloads for the request forms' "Fill with an example" action. They are shaped
// around the deterministic seed (`npm run db:seed`), which dates its data from `nextUtcMidnight`
// at seed time, so a freshly seeded database returns matches for both. Locations are the
// MockGeocoder coordinates; a prefilled location needs no geocoding call.
import { addDays, DAY_MS, HOUR_MS, nextUtcMidnight, toCalendarDate } from './common.js';
import type { CreateStorageRequestPayload } from './storage.js';
import type { CreateTransportRequestPayload } from './transport.js';

const DALLAS = { label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 };
const HOUSTON = { label: 'Houston, TX, United States', lat: 29.7604, lng: -95.3698 };

const DEMO_CONTACT = {
  companyName: 'Example Shipper Co.',
  contactName: 'Demo User',
  contactEmail: 'demo@example.com',
};

/**
 * Dallas → Houston, 6 dry-van pallets. The pickup window runs 32 hours from noon UTC on the seed's
 * anchor day, covering the seeded day-1 departures. Because it is built from the anchor at demo
 * time, it still finds them if one UTC midnight has passed since seeding.
 */
export function buildDemoTransportRequest(now: Date): CreateTransportRequestPayload {
  const anchor = nextUtcMidnight(now);
  return {
    ...DEMO_CONTACT,
    pickup: DALLAS,
    dropoff: HOUSTON,
    pickupEarliest: new Date(anchor.getTime() + 12 * HOUR_MS).toISOString(),
    pickupLatest: new Date(anchor.getTime() + DAY_MS + 20 * HOUR_MS).toISOString(),
    trailerType: 'DRY_VAN',
    pallets: 6,
    weightLbs: 9_000,
  };
}

/** Dallas, 40 pallets for 30 days starting a week after the seed anchor, within 25 est. miles. */
export function buildDemoStorageRequest(now: Date): CreateStorageRequestPayload {
  const anchor = nextUtcMidnight(now);
  return {
    ...DEMO_CONTACT,
    location: DALLAS,
    maxDistanceMiles: 25,
    pallets: 40,
    startDate: toCalendarDate(addDays(anchor, 7)),
    endDate: toCalendarDate(addDays(anchor, 37)),
    needsTemperatureControl: false,
    needsFoodGrade: false,
  };
}
