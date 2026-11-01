// What a visitor can read and do, not how it is styled: assertions use the visible text (tags stripped,
// whitespace collapsed) and only the attributes that matter to behaviour (link targets, anchors, roles).
import type { TransportMatch } from '@deadspace/shared';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { DemoBanner } from '../src/components/DemoBanner';
import { DemoCoverageHint, ZeroMatchCoverageNote } from '../src/components/DemoCoverage';
import { buildExampleMatch } from '../src/components/landing/example-match';
import { DemoDataSection } from '../src/components/landing/DemoDataSection';
import { MatchCard } from '../src/components/MatchCard';
import { ContactLine, SampleBadge } from '../src/components/SampleBadge';
import { SiteFooter } from '../src/components/SiteFooter';
import { NotSavedStatus, SupplyDisabledNotice } from '../src/components/SupplyDisabledNotice';
import { TruckLegSummary } from '../src/components/TruckLegSummary';
import { WarehouseSpaceSummary } from '../src/components/WarehouseSpaceSummary';

const markup = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const visibleText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const textOf = (node: ReactNode) => visibleText(markup(node));

const SEEDED_TRUCK = 'seed-truck-leg-20260602-01';
const SEEDED_SPACE = 'seed-warehouse-space-01';
const USER_CREATED = 'cmvxzp51v0000xcut41s75x9j';

describe('the demo banner', () => {
  const text = textOf(<DemoBanner />);

  it('states that carriers, warehouses, contacts, prices and availability are fictional and nothing is bookable', () => {
    expect(text).toMatch(/portfolio demo/i);
    for (const thing of ['carrier', 'warehouse', 'contact', 'price', 'availability']) expect(text).toContain(thing);
    expect(text).toContain('fictional sample data');
    expect(text).toContain('nothing can be booked');
  });

  it('says the inventory covers selected example markets, not live or nationwide capacity', () => {
    expect(text).toContain('selected example markets');
    expect(text).toContain('Texas');
  });

  it('links to the full explanation on the landing page', () => {
    expect(markup(<DemoBanner />)).toContain('href="/#demo-data"');
  });

  it('is part of the app shell, so it appears on every page', () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <App />, children: [{ path: 'list/truck', element: <p>truck form</p> }] }],
      { initialEntries: ['/list/truck'] },
    );
    const page = visibleText(renderToStaticMarkup(<RouterProvider router={router} />));
    expect(page).toContain('fictional sample data');
    expect(page).toContain('truck form');
  });
});

describe('the footer', () => {
  const text = textOf(<SiteFooter />);

  it('repeats that the data is fictional and nothing can be booked', () => {
    expect(text).toContain('fictional');
    expect(text).toContain('nothing can be booked');
  });

  it('still says there are no accounts and warns against entering sensitive data', () => {
    expect(text).toContain('no accounts');
    expect(text).toMatch(/don't enter anything sensitive/);
  });
});

describe('the landing page demo-data section', () => {
  const html = renderToStaticMarkup(<DemoDataSection />);
  const text = visibleText(html);

  it('has the anchor the banner links to', () => {
    expect(html).toContain('id="demo-data"');
    expect(text).toContain('About the demo data');
  });

  it('separates what is real from what is fictional, and states that nothing is bookable', () => {
    expect(text).toContain('What is real');
    expect(text).toContain('What is fictional');
    expect(text).toContain('Nothing here can be booked');
  });

  it('states the coverage and that new listings are not saved', () => {
    expect(text).toContain('selected example markets');
    expect(text).toContain('rather than live or nationwide capacity');
    expect(text).toContain('not saved in this public demo');
  });

  it('makes no numerical claims', () => {
    expect(text).not.toMatch(/\d/);
  });
});

describe('sample-data marking', () => {
  it('tags seeded listings and nothing else', () => {
    expect(textOf(<SampleBadge id={SEEDED_TRUCK} />)).toBe('Sample data');
    expect(textOf(<SampleBadge id={SEEDED_SPACE} />)).toBe('Sample data');
    expect(textOf(<SampleBadge id={USER_CREATED} />)).toBe('');
  });

  it('shows a sample contact as plain text, never a mailto link, and keeps the link for real contacts', () => {
    const sample = <ContactLine id={SEEDED_TRUCK} name="Dana Ortiz" email="dana@x.example.com" />;
    expect(markup(sample)).not.toContain('mailto:');
    expect(textOf(sample)).toContain('Dana Ortiz');
    expect(textOf(sample)).toContain('fictional');

    const real = <ContactLine id={USER_CREATED} name="Dana Ortiz" email="dana@x.example.com" />;
    expect(markup(real)).toContain('href="mailto:dana@x.example.com"');
  });

  it('marks a seeded match card without a mailto link, and leaves a user-created one unmarked with its link', () => {
    const match: TransportMatch = buildExampleMatch(new Date('2026-06-01T12:00:00Z'));
    const withId = (id: string): TransportMatch => ({ ...match, leg: { ...match.leg, id } });

    const seeded = markup(<MatchCard match={withId(SEEDED_TRUCK)} rank={1} />);
    expect(visibleText(seeded)).toContain('Sample data');
    expect(seeded).not.toContain('mailto:');

    const real = markup(<MatchCard match={withId(USER_CREATED)} rank={1} />);
    expect(visibleText(real)).not.toContain('Sample data');
    expect(real).toContain('mailto:');
  });

  it('marks seeded truck and warehouse detail views as fictional', () => {
    const { leg } = buildExampleMatch(new Date('2026-06-01T12:00:00Z'));
    expect(textOf(<TruckLegSummary leg={{ ...leg, id: SEEDED_TRUCK }} />)).toContain('Fictional demo listing');
    expect(textOf(<TruckLegSummary leg={{ ...leg, id: USER_CREATED }} />)).not.toContain('Fictional demo listing');

    const space = {
      id: SEEDED_SPACE,
      status: 'ACTIVE',
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
      companyName: 'Lone Star Storage',
      contactName: 'Ana Ruiz',
      contactEmail: 'ana@lonestar.example.com',
      location: { label: 'Fort Worth, TX', lat: 32.7555, lng: -97.3308 },
      quantityAvailable: 80,
      minPallets: 10,
      availableFrom: '2026-06-01',
      availableTo: '2026-08-31',
      minStorageDays: 7,
      temperatureControlled: false,
      foodGrade: false,
      pricingPeriod: 'WEEK',
      pricePerPalletPerPeriod: 14,
      handlingFeePerPallet: 3.5,
      notes: null,
    } as const;
    expect(textOf(<WarehouseSpaceSummary space={space} />)).toContain('Fictional demo listing');
    expect(textOf(<WarehouseSpaceSummary space={{ ...space, id: USER_CREATED }} />)).not.toContain(
      'Fictional demo listing',
    );
  });
});

describe('supply-side notice (saving turned off)', () => {
  it('explains that truck legs are not stored and points to a working example search', () => {
    const node = <SupplyDisabledNotice kind="truck" />;
    expect(textOf(node)).toContain('Saving listings is turned off in this public demo');
    expect(textOf(node)).toContain('new truck legs are not stored');
    expect(textOf(node)).toContain('Nothing you enter is saved');
    expect(markup(node)).toContain('href="/request/transport?example=1"');
  });

  it('explains the same for warehouse spaces', () => {
    const node = <SupplyDisabledNotice kind="warehouse" />;
    expect(textOf(node)).toContain('new warehouse spaces are not stored');
    expect(markup(node)).toContain('href="/request/storage?example=1"');
  });

  it('keeps an empty live region until a valid form is checked, then says nothing was stored', () => {
    const before = markup(<NotSavedStatus show={false} />);
    expect(before).toContain('role="status"');
    expect(visibleText(before)).toBe('');
    expect(textOf(<NotSavedStatus show />)).toContain('nothing was stored');
  });
});

describe('demo coverage messaging', () => {
  it('tells request-form visitors the sample inventory is limited and the example always matches', () => {
    const transport = textOf(<DemoCoverageHint kind="transport" />);
    expect(transport).toContain('sample trucks');
    expect(transport).toContain('mainly in and around Texas');
    expect(transport).toContain('Fill with an example');
    expect(textOf(<DemoCoverageHint kind="storage" />)).toContain('sample warehouses');
  });

  it('turns an empty result into an explanation with a way to see real matching', () => {
    const transport = <ZeroMatchCoverageNote kind="transport" />;
    expect(textOf(transport)).toContain('This is a demo with limited coverage.');
    expect(markup(transport)).toContain('href="/request/transport?example=1"');

    const storage = <ZeroMatchCoverageNote kind="storage" />;
    expect(textOf(storage)).toContain('sample warehouses');
    expect(markup(storage)).toContain('href="/request/storage?example=1"');
  });
});
