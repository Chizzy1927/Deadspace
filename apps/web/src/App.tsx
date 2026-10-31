import { Outlet, ScrollRestoration, useMatches } from 'react-router';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { routeTitle } from './route-title';

/** App shell: skip link, navigation, page content and footer. */
export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <title>{routeTitle(useMatches())}</title>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </div>
  );
}
