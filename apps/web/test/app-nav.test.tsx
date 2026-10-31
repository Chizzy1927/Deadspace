import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routeTitle } from '../src/route-title';
import { SiteHeader } from '../src/components/SiteHeader';

const render = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <SiteHeader />
    </MemoryRouter>,
  );

describe('SiteHeader', () => {
  it('starts with a skip link to the main content', () => {
    expect(render('/')).toMatch(/^<a href="#main"[^>]*>Skip to main content<\/a>/);
  });

  it('marks only the current route with aria-current', () => {
    const html = render('/request/storage');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Request storage</);
  });

  it('offers all four flows under the need/have groups', () => {
    const html = render('/');
    for (const href of ['/request/transport', '/request/storage', '/list/truck', '/list/warehouse']) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('I need capacity');
    expect(html).toContain('I have capacity');
  });

  it('renders a collapsed menu toggle wired to the nav', () => {
    const html = render('/');
    expect(html).toMatch(
      /<button[^>]*aria-expanded="false"[^>]*aria-controls="site-menu"|<button[^>]*aria-controls="site-menu"[^>]*aria-expanded="false"/,
    );
    expect(html).toContain('id="site-menu"');
  });
});

describe('routeTitle', () => {
  it('uses the deepest route that declares a title', () => {
    expect(routeTitle([{}, { handle: { title: 'Request transport' } }])).toBe('Request transport · DeadSpace');
    expect(routeTitle([{ handle: { title: 'Outer' } }, { handle: { title: 'Inner' } }])).toBe('Inner · DeadSpace');
  });

  it('falls back to the site name', () => {
    expect(routeTitle([{}, { handle: {} }])).toBe('DeadSpace');
  });
});
