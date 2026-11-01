// The rolling transport seed, end to end on real PostGIS: the seed's insert-missing writer, the real
// demo request builder, the real services and matching engine. "Viewer at day d" means a visitor whose
// demo request is anchored at the seed anchor + d days (they open the app during the 24 h before it).
import { buildDemoTransportRequest, createTransportRequestInputSchema } from '@deadspace/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { insertMissingTruckLegs } from '../../prisma/seed-data/truck-leg-writer.js';
import { buildSeedTruckLegSchedule, SEED_HORIZON_DAYS, seedDepartureDays } from '../../prisma/seed-data/truck-legs.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { createTruckLeg, findTruckLegById } from '../../src/repositories/truck-leg.repository.js';
import {
  getTransportMatches,
  getTransportRequest,
  submitTransportRequest,
} from '../../src/services/transport.service.js';
import { createTestPrisma, transportRequestInput, truckLegInput } from './helpers.js';

const prisma = createTestPrisma();
const geocoder = new MockGeocoder();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
// Consecutive UTC days, so one anchor lands on an even epoch day and the other on an odd one.
const SEED_A = day('2027-03-10');
const SEED_B = day('2027-03-11');
const ROWS_PER_DAY = 27; // 24 daily legs + 3 alternating legs (see seed-data/truck-legs.ts)
const DEMO_KEYS = ['01', '02', '07', '08', '13', '14'];

beforeEach(async () => {
  await prisma.truckLeg.deleteMany();
  await prisma.transportRequest.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Runs the same insert the seed script runs; returns how many legs were newly inserted. */
async function seed(seedAnchor: Date) {
  const legs = await buildSeedTruckLegSchedule(seedAnchor, geocoder);
  const { count } = await insertMissingTruckLegs(prisma, legs);
  return { count, total: legs.length };
}

const allLegs = () => prisma.truckLeg.findMany({ orderBy: { id: 'asc' } });
const legKey = (id: string) => id.slice(-2);

/** A request validated against the visitor's own clock, then persisted and matched by the real services. */
async function match(
  clock: Date,
  overrides: { pickupEarliest: Date; pickupLatest: Date; trailerType?: string; pallets?: number },
) {
  const base = buildDemoTransportRequest(clock);
  const pallets = overrides.pallets ?? 6;
  const input = createTransportRequestInputSchema(() => clock).parse({
    ...base,
    pickupEarliest: overrides.pickupEarliest.toISOString(),
    pickupLatest: overrides.pickupLatest.toISOString(),
    trailerType: overrides.trailerType ?? 'DRY_VAN',
    pallets,
    weightLbs: pallets * 1_500,
  });
  const created = await submitTransportRequest(prisma, input);
  return { requestId: created.id, matches: (await getTransportMatches(prisma, created.id))!.matches };
}

/** The standard demo request a visitor gets on the given day after the seed anchor. */
async function demoMatches(seedAnchor: Date, daysAfter: number) {
  const clock = new Date(seedAnchor.getTime() + daysAfter * DAY - 12 * HOUR);
  const demo = buildDemoTransportRequest(clock);
  return match(clock, {
    pickupEarliest: new Date(demo.pickupEarliest),
    pickupLatest: new Date(demo.pickupLatest),
  });
}

/** A custom search for one UTC day (`daysAfter` relative to the seed anchor) between two hours. */
async function customMatches(
  seedAnchor: Date,
  daysAfter: number,
  fromHour: number,
  toHour: number,
  options: { trailerType?: string; pallets?: number } = {},
) {
  const start = seedAnchor.getTime() + daysAfter * DAY;
  return match(new Date(start - 12 * HOUR), {
    pickupEarliest: new Date(start + fromHour * HOUR),
    pickupLatest: new Date(start + toHour * HOUR - 1000),
    ...options,
  });
}

describe.each([
  ['even-day seed anchor', SEED_A],
  ['odd-day seed anchor', SEED_B],
])('rolling transport seed (%s)', (_label, anchor) => {
  it('seeds a predictable number of rows: 27 per departure day, well under the row cap', async () => {
    const { count, total } = await seed(anchor);
    const days = seedDepartureDays(anchor).length;
    expect(total).toBe(days * ROWS_PER_DAY);
    expect(count).toBe(total);
    expect(await prisma.truckLeg.count()).toBe(total);
    expect(total).toBeLessThanOrEqual(1_400);
  });

  it('a fresh seed gives the intended demo matches: the six carriers, each once, led by 02, 07, 01', async () => {
    await seed(anchor);
    const keys = (await demoMatches(anchor, 0)).matches.map((m) => legKey(m.leg.id));

    expect(keys.slice(0, 3)).toEqual(['02', '07', '01']);
    expect([...keys].sort()).toEqual(DEMO_KEYS);
  });

  it('reseeding at the same anchor inserts nothing and mutates nothing', async () => {
    await seed(anchor);
    const before = await allLegs();

    const again = await seed(anchor);

    expect(again.count).toBe(0);
    expect(await allLegs()).toEqual(before);
  });

  it('a later reseed adds only the missing future days and leaves every existing row untouched', async () => {
    await seed(anchor);
    const before = await allLegs();
    const laterAnchor = new Date(anchor.getTime() + 20 * DAY);
    const missingDays = seedDepartureDays(laterAnchor).filter(
      (d) => !seedDepartureDays(anchor).some((e) => e.getTime() === d.getTime()),
    );

    const later = await seed(laterAnchor);

    expect(missingDays).toHaveLength(20);
    expect(later.count).toBe(missingDays.length * ROWS_PER_DAY);
    const after = await allLegs();
    expect(after).toHaveLength(before.length + later.count);
    const afterById = new Map(after.map((l) => [l.id, l]));
    for (const leg of before) expect(afterById.get(leg.id)).toEqual(leg);
  });

  it('existing requests keep their matches and scores after later reseeds', async () => {
    await seed(anchor);
    const demo = await demoMatches(anchor, 0);
    const custom = await customMatches(anchor, 7, 0, 24);
    const reefer = await customMatches(anchor, 30, 0, 24, { trailerType: 'REEFER' });
    expect(demo.matches).toHaveLength(6);
    expect(custom.matches.length).toBeGreaterThanOrEqual(3);

    await seed(new Date(anchor.getTime() + 10 * DAY));
    await seed(new Date(anchor.getTime() + 40 * DAY));

    for (const before of [demo, custom, reefer]) {
      expect((await getTransportMatches(prisma, before.requestId))!.matches).toEqual(before.matches);
    }
  });

  it('the standard demo request finds the six intended carriers, each once, on every day of the 45-day horizon', async () => {
    await seed(anchor);
    for (let d = 0; d <= SEED_HORIZON_DAYS; d++) {
      const keys = (await demoMatches(anchor, d)).matches.map((m) => legKey(m.leg.id));
      expect(keys.slice(0, 3), `viewer at +${d}d`).toEqual(['02', '07', '01']);
      expect([...keys].sort(), `viewer at +${d}d`).toEqual(DEMO_KEYS);
    }
  });

  it('single-day custom searches find corridor inventory on every day of the horizon, for every trailer type', async () => {
    await seed(anchor);
    // From the seed day itself (-1) to the last seeded day (+46).
    for (let d = -1; d <= SEED_HORIZON_DAYS + 1; d++) {
      const at = `day ${d}`;
      expect(
        (await customMatches(anchor, d, 0, 24)).matches.length,
        `dry van, whole day, ${at}`,
      ).toBeGreaterThanOrEqual(3);
      expect((await customMatches(anchor, d, 12, 20)).matches.length, `dry van, 12-20h, ${at}`).toBeGreaterThanOrEqual(
        3,
      );
      expect((await customMatches(anchor, d, 14, 16)).matches.length, `dry van, 14-16h, ${at}`).toBeGreaterThanOrEqual(
        2,
      );
      expect(
        (await customMatches(anchor, d, 0, 24, { pallets: 20 })).matches.length,
        `dry van, 20 pallets, ${at}`,
      ).toBeGreaterThanOrEqual(2);
      for (const trailerType of ['REEFER', 'FLATBED']) {
        const result = await customMatches(anchor, d, 0, 24, { trailerType });
        expect(result.matches.length, `${trailerType}, whole day, ${at}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('a two-day custom window shows each carrier at most once', async () => {
    await seed(anchor);
    for (let d = -1; d <= SEED_HORIZON_DAYS; d++) {
      const start = new Date(anchor.getTime() + d * DAY + 18 * HOUR);
      const keys = (
        await match(new Date(start.getTime() - 12 * HOUR), {
          pickupEarliest: start,
          pickupLatest: new Date(start.getTime() + 24 * HOUR),
        })
      ).matches.map((m) => legKey(m.leg.id));
      expect(new Set(keys).size, `window starting day ${d} 18:00`).toBe(keys.length);
    }
  });

  // What "45 days" guarantees: a visitor whose anchor is at most 45 days after the seed anchor gets the
  // full demo. One day later only the last seeded day exists, so half of the carriers remain; after
  // that there is nothing.
  it('the full demo is guaranteed through +45d, half of it remains at +46d, and nothing at +47d', async () => {
    await seed(anchor);

    const full = (await demoMatches(anchor, SEED_HORIZON_DAYS)).matches.map((m) => legKey(m.leg.id));
    expect([...full].sort()).toEqual(DEMO_KEYS);

    const half = (await demoMatches(anchor, SEED_HORIZON_DAYS + 1)).matches.map((m) => legKey(m.leg.id));
    expect(half).toHaveLength(3);
    expect(half.every((k) => DEMO_KEYS.includes(k))).toBe(true);

    expect((await demoMatches(anchor, SEED_HORIZON_DAYS + 2)).matches).toHaveLength(0);
  });

  it('a single-day search on the last seeded day works and on the day after finds nothing', async () => {
    await seed(anchor);
    expect((await customMatches(anchor, SEED_HORIZON_DAYS + 1, 0, 24)).matches.length).toBeGreaterThanOrEqual(3);
    expect((await customMatches(anchor, SEED_HORIZON_DAYS + 2, 0, 24)).matches).toHaveLength(0);
  });

  it('reseeding leaves user-created legs and requests exactly as they were', async () => {
    const userLeg = await createTruckLeg(prisma, truckLegInput());
    const userRequest = await submitTransportRequest(prisma, transportRequestInput());

    await seed(anchor);
    await seed(new Date(anchor.getTime() + 30 * DAY));

    expect(await findTruckLegById(prisma, userLeg.id)).toEqual(userLeg);
    expect(await getTransportRequest(prisma, userRequest.id)).toEqual(userRequest);
  });
});
