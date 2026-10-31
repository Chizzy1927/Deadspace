import { useRef, useState } from 'react';
import { Link, NavLink } from 'react-router';

const MENU_ID = 'site-menu';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 text-sm ${
    isActive ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700 hover:bg-slate-100 hover:text-blue-800'
  }`;

const groupLabelClass = 'text-xs font-semibold tracking-wide text-slate-600 uppercase';

/** Skip link, wordmark and the two-sided navigation (need capacity / have capacity). */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <header
        className="border-b border-slate-200 bg-white"
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !open) return;
          close();
          // The focused link is about to be hidden; keep keyboard focus somewhere visible.
          toggleRef.current?.focus();
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold" onClick={close}>
            <svg viewBox="0 0 32 32" aria-hidden="true" className="h-6 w-6">
              <rect width="32" height="32" rx="6" fill="#1d4ed8" />
              <rect x="5" y="9" width="22" height="14" rx="1.5" fill="none" stroke="#fff" strokeWidth="2.5" />
              <rect x="7.5" y="11.5" width="8" height="9" fill="#fff" />
            </svg>
            DeadSpace
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="rounded border border-slate-300 px-3 py-1 text-sm lg:hidden"
            aria-expanded={open}
            aria-controls={MENU_ID}
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
          <nav
            id={MENU_ID}
            aria-label="Main"
            className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-4 lg:flex lg:w-auto lg:flex-row lg:gap-8`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={groupLabelClass}>I need capacity</span>
              <NavLink to="/request/transport" className={linkClass} onClick={close}>
                Request transport
              </NavLink>
              <NavLink to="/request/storage" className={linkClass} onClick={close}>
                Request storage
              </NavLink>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={groupLabelClass}>I have capacity</span>
              <NavLink to="/list/truck" className={linkClass} onClick={close}>
                List a truck leg
              </NavLink>
              <NavLink to="/list/warehouse" className={linkClass} onClick={close}>
                List warehouse space
              </NavLink>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
