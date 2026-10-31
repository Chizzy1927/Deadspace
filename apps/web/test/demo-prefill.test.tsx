import { buildDemoStorageRequest, buildDemoTransportRequest } from '@deadspace/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExampleFill } from '../src/components/ExampleFill';
import { storageExampleValues, toLocalDateTime, transportExampleValues } from '../src/forms/demo-prefill';
import { StorageRequestFormSchema } from '../src/forms/storage-request-form';
import { TransportRequestFormSchema } from '../src/forms/transport-request-form';

const NOON = new Date('2026-11-03T12:00:00Z');
// Either side of a UTC midnight, since the demo is anchored to the next one.
const MOMENTS = [NOON, new Date('2026-11-03T23:59:00Z'), new Date('2026-11-04T00:01:00Z')];

describe('toLocalDateTime', () => {
  it('round-trips an instant through a datetime-local value (to the minute)', () => {
    const iso = '2026-11-04T12:00:00.000Z';
    expect(new Date(toLocalDateTime(iso)).toISOString()).toBe(iso);
  });
});

describe('transportExampleValues', () => {
  it.each(MOMENTS)('parses through the real form schema to the shared builder payload (%s)', (now) => {
    const parsed = TransportRequestFormSchema.parse(transportExampleValues(now));
    const demo = buildDemoTransportRequest(now);
    expect(parsed.pickup).toEqual(demo.pickup);
    expect(parsed.dropoff).toEqual(demo.dropoff);
    expect(parsed.pickupEarliest).toEqual(new Date(demo.pickupEarliest));
    expect(parsed.pickupLatest).toEqual(new Date(demo.pickupLatest));
    expect(parsed).toMatchObject({
      trailerType: 'DRY_VAN',
      pallets: 6,
      weightLbs: 9_000,
      companyName: demo.companyName,
    });
    expect(parsed.maxBudget).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });
});

describe('storageExampleValues', () => {
  it.each(MOMENTS)('parses through the real form schema to the shared builder payload (%s)', (now) => {
    const parsed = StorageRequestFormSchema.parse(storageExampleValues(now));
    const demo = buildDemoStorageRequest(now);
    expect(parsed.location).toEqual(demo.location);
    expect(parsed).toMatchObject({ pallets: 40, maxDistanceMiles: 25, needsTemperatureControl: false });
    expect(parsed.startDate).toEqual(new Date(`${demo.startDate}T00:00:00Z`));
    expect(parsed.endDate).toEqual(new Date(`${demo.endDate}T00:00:00Z`));
    expect(parsed.maxBudgetTotal).toBeUndefined();
  });
});

describe('ExampleFill', () => {
  it('offers a button and an empty polite status before filling', () => {
    const html = renderToStaticMarkup(<ExampleFill onFill={() => undefined} filled={false} />);
    expect(html).toContain('Fill with an example');
    expect(html).toMatch(/<p role="status"[^>]*><\/p>/);
  });

  it('announces that the example needs review once filled', () => {
    const html = renderToStaticMarkup(<ExampleFill onFill={() => undefined} filled />);
    expect(html).toMatch(/role="status"[^>]*>Example request filled in\. Review the details, then submit\./);
  });
});
