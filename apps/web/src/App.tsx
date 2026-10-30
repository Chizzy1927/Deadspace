import { Link, Outlet } from 'react-router';

const linkClass = 'text-sm text-blue-700 hover:underline';

/** App shell. Minimal chrome; the real navigation arrives with the landing flow (Phase 5). */
export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            DeadSpace
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-x-6 gap-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">I need capacity</span>
              <Link to="/request/transport" className={linkClass}>
                Request transport
              </Link>
              <Link to="/request/storage" className={linkClass}>
                Request storage
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">I have capacity</span>
              <Link to="/list/truck" className={linkClass}>
                List a truck leg
              </Link>
              <Link to="/list/warehouse" className={linkClass}>
                List warehouse space
              </Link>
            </div>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
