import {
  buildDemoStorageRequest,
  buildDemoTransportRequest,
  CreateStorageRequestInputSchema,
  CreateTransportRequestInputSchema,
  StorageRequestSchema,
  TransportRequestSchema,
} from '@deadspace/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { EditFromNotice, EditSearchLink } from '../src/components/EditSearch';
import {
  storageEditPath,
  storageRequestToFormValues,
  transportEditPath,
  transportRequestToFormValues,
} from '../src/forms/request-prefill';
import { StorageRequestFormSchema } from '../src/forms/storage-request-form';
import { TransportRequestFormSchema } from '../src/forms/transport-request-form';

const NOW = new Date('2026-11-03T12:00:00Z');
const META = { id: 'req_1', status: 'ACTIVE', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };

/** What the API returns for a stored transport request: absent optionals come back as null. */
const persistedTransport = (extra: Partial<ReturnType<typeof buildDemoTransportRequest>> = {}) => {
  const payload = { ...buildDemoTransportRequest(NOW), ...extra };
  const persisted = TransportRequestSchema.parse({
    ...META,
    ...payload,
    deliverBy: payload.deliverBy ?? null,
    maxBudget: payload.maxBudget ?? null,
    notes: payload.notes ?? null,
  });
  return { payload, persisted };
};

const persistedStorage = (extra: Partial<ReturnType<typeof buildDemoStorageRequest>> = {}) => {
  const payload = { ...buildDemoStorageRequest(NOW), ...extra };
  const persisted = StorageRequestSchema.parse({
    ...META,
    ...payload,
    maxBudgetTotal: payload.maxBudgetTotal ?? null,
    notes: payload.notes ?? null,
  });
  return { payload, persisted };
};

describe('transportRequestToFormValues', () => {
  it('rebuilds a request whose optional fields were left empty', () => {
    const { payload, persisted } = persistedTransport();
    const values = transportRequestToFormValues(persisted);
    expect(values).toMatchObject({ deliverBy: '', notes: '' });
    expect(values.maxBudget).toBeNaN();
    expect(TransportRequestFormSchema.parse(values)).toEqual(CreateTransportRequestInputSchema.parse(payload));
  });

  it('preserves every field of a fully populated request, including contact and notes', () => {
    const { payload, persisted } = persistedTransport({
      companyName: 'Acme Freight',
      contactName: 'Pat Doe',
      contactEmail: 'pat@acme.example.com',
      trailerType: 'REEFER',
      pallets: 18,
      weightLbs: 30_000,
      deliverBy: '2026-11-06T18:00:00.000Z',
      maxBudget: 900,
      notes: 'Dock appointment required',
    });
    const parsed = TransportRequestFormSchema.parse(transportRequestToFormValues(persisted));
    expect(parsed).toEqual(CreateTransportRequestInputSchema.parse(payload));
    expect(parsed).toMatchObject({
      companyName: 'Acme Freight',
      contactEmail: 'pat@acme.example.com',
      trailerType: 'REEFER',
      maxBudget: 900,
      notes: 'Dock appointment required',
    });
    expect(parsed.deliverBy).toEqual(new Date('2026-11-06T18:00:00.000Z'));
  });

  it('keeps the chosen locations whole, not just their labels', () => {
    const { persisted } = persistedTransport();
    const values = transportRequestToFormValues(persisted);
    expect(values.pickup).toEqual(persisted.pickup);
    expect(values.dropoff).toEqual(persisted.dropoff);
  });
});

describe('storageRequestToFormValues', () => {
  it('rebuilds a request whose optional fields were left empty', () => {
    const { payload, persisted } = persistedStorage();
    const values = storageRequestToFormValues(persisted);
    expect(values.notes).toBe('');
    expect(values.maxBudgetTotal).toBeNaN();
    expect(StorageRequestFormSchema.parse(values)).toEqual(CreateStorageRequestInputSchema.parse(payload));
  });

  it('preserves every field of a fully populated request, including features, contact and notes', () => {
    const { payload, persisted } = persistedStorage({
      companyName: 'Acme Foods',
      contactName: 'Pat Doe',
      contactEmail: 'pat@acme.example.com',
      maxDistanceMiles: 60,
      pallets: 80,
      needsTemperatureControl: true,
      needsFoodGrade: true,
      maxBudgetTotal: 5_000,
      notes: 'Forklift access needed',
    });
    const parsed = StorageRequestFormSchema.parse(storageRequestToFormValues(persisted));
    expect(parsed).toEqual(CreateStorageRequestInputSchema.parse(payload));
    expect(parsed).toMatchObject({
      companyName: 'Acme Foods',
      maxDistanceMiles: 60,
      needsTemperatureControl: true,
      needsFoodGrade: true,
      maxBudgetTotal: 5_000,
      notes: 'Forklift access needed',
    });
  });
});

describe('edit paths', () => {
  it('point at each request form with the editFrom parameter', () => {
    expect(transportEditPath('abc123')).toBe('/request/transport?editFrom=abc123');
    expect(storageEditPath('abc123')).toBe('/request/storage?editFrom=abc123');
  });

  it('encode the id', () => {
    expect(transportEditPath('a b&c')).toBe('/request/transport?editFrom=a%20b%26c');
  });
});

describe('EditSearchLink', () => {
  const render = (prominent: boolean) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <EditSearchLink to={transportEditPath('abc123')} prominent={prominent} />
      </MemoryRouter>,
    );

  it('links to the prefilled form', () => {
    expect(render(false)).toContain('href="/request/transport?editFrom=abc123"');
    expect(render(false)).toContain('← Edit search');
  });

  it('has a more prominent variant for the zero-results state', () => {
    expect(render(true)).toContain('Edit search and try again');
    expect(render(true)).toContain('href="/request/transport?editFrom=abc123"');
  });
});

describe('EditFromNotice', () => {
  const render = (state: Parameters<typeof EditFromNotice>[0]['state'], message?: string) =>
    renderToStaticMarkup(<EditFromNotice state={state} message={message} />);

  it('renders nothing when the form was opened normally', () => {
    expect(render('idle')).toBe('');
  });

  it('says a copy was loaded and the original is unchanged', () => {
    const html = render('loaded');
    expect(html).toContain('Previous search loaded');
    expect(html).toContain('Your earlier search is not changed');
    expect(html).toContain('role="status"');
  });

  it('alerts when the previous search could not be loaded, with the reason', () => {
    const html = render('error', 'Request not found');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Could not load your previous search (Request not found)');
  });
});
