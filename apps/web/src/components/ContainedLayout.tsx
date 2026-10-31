import { Outlet } from 'react-router';

/** Width-constrained page body for the form, match and confirmation pages. */
export function ContainedLayout() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Outlet />
    </div>
  );
}
