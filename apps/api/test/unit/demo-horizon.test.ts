import { describe, expect, it } from 'vitest';
import { demoHorizon } from '../../prisma/seed-data/status.js';
import {
  buildSeedTruckLegSchedule,
  SEED_HORIZON_DAYS,
  SEED_LAST_DAY_OFFSET,
} from '../../prisma/seed-data/truck-legs.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';

const DAY = 24 * 3600 * 1000;

describe('demoHorizon', () => {
  const latest = new Date('2027-04-25T13:00:00Z'); // a leg departing on the newest seeded day

  it('ends the full demo at the start of the day before the newest seeded day, and the half demo at its start', () => {
    const horizon = demoHorizon(latest, new Date('2027-04-10T08:00:00Z'));

    expect(horizon.lastSeededDay.toISOString()).toBe('2027-04-25T00:00:00.000Z');
    expect(horizon.fullDemoUntil.toISOString()).toBe('2027-04-24T00:00:00.000Z');
    expect(horizon.partialDemoUntil.toISOString()).toBe('2027-04-25T00:00:00.000Z');
  });

  it('counts whole days of full demo left, never below zero', () => {
    expect(demoHorizon(latest, new Date('2027-04-10T08:00:00Z')).fullDemoDaysLeft).toBe(13);
    expect(demoHorizon(latest, new Date('2027-04-23T23:00:00Z')).fullDemoDaysLeft).toBe(0);
    expect(demoHorizon(latest, new Date('2027-05-30T00:00:00Z')).fullDemoDaysLeft).toBe(0);
  });

  it('agrees with what the seed actually creates: full demo for visitors up to SEED_HORIZON_DAYS after the seed anchor', async () => {
    const anchor = new Date('2027-03-10T00:00:00Z');
    const legs = await buildSeedTruckLegSchedule(anchor, new MockGeocoder());
    const newest = new Date(Math.max(...legs.map((l) => l.input.departureEarliest.getTime())));

    const horizon = demoHorizon(newest, anchor);

    expect(horizon.lastSeededDay.getTime()).toBe(anchor.getTime() + SEED_LAST_DAY_OFFSET * DAY);
    // A visitor whose request anchor is at most anchor + 45 days opens the app before this instant.
    expect(horizon.fullDemoUntil.getTime()).toBe(anchor.getTime() + SEED_HORIZON_DAYS * DAY);
  });
});
