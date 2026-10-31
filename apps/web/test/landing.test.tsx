import { TransportMatchSchema } from '@deadspace/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildExampleMatch } from '../src/components/landing/example-match';
import { LandingPage } from '../src/pages/LandingPage';

const html = renderToStaticMarkup(
  <MemoryRouter>
    <LandingPage />
  </MemoryRouter>,
);

/** Visible text with tags removed. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** The landing's own copy: everything except the example match card, which renders engine output. */
const copy = text(html.replace(/<article[\s\S]*?<\/article>/, ''));

describe('LandingPage', () => {
  it('has exactly one h1', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('links straight into all four flows', () => {
    for (const href of ['/request/transport', '/request/storage', '/list/truck', '/list/warehouse']) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it('gives each side of the marketplace a target for the hero buttons', () => {
    expect(html).toContain('href="#need-capacity"');
    expect(html).toContain('href="#have-capacity"');
    expect(html).toContain('id="need-capacity"');
    expect(html).toContain('id="have-capacity"');
  });

  it('shows the real match card, clearly labelled as an example, with the estimate note it points to', () => {
    expect(html.match(/<article/g)).toHaveLength(1);
    expect(html).toMatch(/>Example<\/span>/);
    expect(copy).toContain('Not a live listing');
    expect(html).toContain('id="estimate-note"');
  });

  it('nests the example card heading under the section heading', () => {
    expect(html).toMatch(/<article[^>]*>[\s\S]*?<h3[^>]*>Gulf Coast Carriers<\/h3>/);
  });

  it('keeps implementation details and unsupported claims out of the copy', () => {
    expect(copy).not.toMatch(/PostGIS|\bAPI\b|database|algorithm/i);
    expect(copy).not.toMatch(/\d\s*%/);
    expect(copy).not.toMatch(/\b(AI|optimal|optimi[sz]\w*|smart|revolutionary|trusted by)\b/i);
  });
});

describe('buildExampleMatch', () => {
  it('satisfies the shared match contract', () => {
    expect(() => TransportMatchSchema.parse(buildExampleMatch(new Date('2026-06-01T18:00:00Z')))).not.toThrow();
  });

  it('departs the day after the next UTC midnight, as the seed does', () => {
    const { leg } = buildExampleMatch(new Date('2026-06-01T18:00:00Z'));
    expect(leg.departureEarliest).toBe('2026-06-03T15:00:00.000Z');
    expect(leg.departureLatest).toBe('2026-06-03T19:00:00.000Z');
  });
});
