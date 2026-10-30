import { Link, Outlet } from 'react-router';

/** App shell. Minimal Phase 2 chrome; the real navigation arrives with the landing flow (Phase 5). */
export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            DeadSpace
          </Link>
          <nav className="flex gap-4">
            <Link to="/request/transport" className="text-sm text-blue-700 hover:underline">
              Request transport
            </Link>
            <Link to="/list/truck" className="text-sm text-blue-700 hover:underline">
              List a truck leg
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
