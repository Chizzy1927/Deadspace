import { type Geocoder, normalizeQuery, type Place } from './geocoder.js';

const PROVIDER = 'mock';

/** Approximate city-centre coordinates. Used by tests, local dev (GEOCODER=mock) and the seed. */
const FIXTURES: readonly (readonly [city: string, state: string, lat: number, lng: number])[] = [
  ['Dallas', 'TX', 32.7767, -96.797],
  ['Fort Worth', 'TX', 32.7555, -97.3308],
  ['Houston', 'TX', 29.7604, -95.3698],
  ['Austin', 'TX', 30.2672, -97.7431],
  ['San Antonio', 'TX', 29.4241, -98.4936],
  ['Waco', 'TX', 31.5493, -97.1467],
  ['Temple', 'TX', 31.0982, -97.3428],
  ['Corsicana', 'TX', 32.0954, -96.4689],
  ['Huntsville', 'TX', 30.7235, -95.5508],
  ['Bryan', 'TX', 30.6744, -96.37],
  ['Tyler', 'TX', 32.3513, -95.3011],
  ['Beaumont', 'TX', 30.0802, -94.1266],
  ['Corpus Christi', 'TX', 27.8006, -97.3964],
  ['Laredo', 'TX', 27.5306, -99.4803],
  ['El Paso', 'TX', 31.7619, -106.485],
  ['Lubbock', 'TX', 33.5779, -101.8552],
  ['Amarillo', 'TX', 35.222, -101.8313],
  ['Oklahoma City', 'OK', 35.4676, -97.5164],
  ['Tulsa', 'OK', 36.154, -95.9928],
  ['Shreveport', 'LA', 32.5252, -93.7502],
  ['Baton Rouge', 'LA', 30.4515, -91.1871],
  ['New Orleans', 'LA', 29.9511, -90.0715],
  ['Little Rock', 'AR', 34.7465, -92.2896],
  ['Memphis', 'TN', 35.1495, -90.049],
  ['Nashville', 'TN', 36.1627, -86.7816],
  ['Jackson', 'MS', 32.2988, -90.1848],
  ['Atlanta', 'GA', 33.749, -84.388],
  ['Kansas City', 'MO', 39.0997, -94.5786],
  ['St. Louis', 'MO', 38.627, -90.1994],
  ['Denver', 'CO', 39.7392, -104.9903],
  ['Albuquerque', 'NM', 35.0844, -106.6504],
  ['Phoenix', 'AZ', 33.4484, -112.074],
  ['Chicago', 'IL', 41.8781, -87.6298],
];

export const MOCK_PLACES: readonly Place[] = FIXTURES.map(([city, state, lat, lng]) => ({
  label: `${city}, ${state}, United States`,
  lat,
  lng,
  provider: PROVIDER,
  providerPlaceId: `mock:${normalizeQuery(`${city} ${state}`).replace(/[^a-z0-9]+/g, '-')}`,
}));

/** Deterministic offline geocoder: case-insensitive substring match over fixed fixture places. */
export class MockGeocoder implements Geocoder {
  readonly provider = PROVIDER;

  constructor(
    private readonly places: readonly Place[] = MOCK_PLACES,
    private readonly limit = 5,
  ) {}

  search(query: string): Promise<Place[]> {
    const q = normalizeQuery(query);
    if (!q) return Promise.resolve([]);
    const matches = this.places.filter((p) => normalizeQuery(p.label).includes(q)).slice(0, this.limit);
    return Promise.resolve(matches.map((p) => ({ ...p })));
  }
}
