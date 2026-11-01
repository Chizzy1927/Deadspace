import { Link } from 'react-router';

/** Shown on every page: the whole site is a portfolio demo over fictional data, in selected markets only. */
export function DemoBanner() {
  return (
    <section aria-label="About this demo" className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <p className="mx-auto max-w-6xl px-4 py-2 text-xs sm:text-sm">
        <strong className="font-semibold">Portfolio demo.</strong> Every carrier, warehouse, contact, price and
        availability shown here is fictional sample data, and nothing can be booked. Sample inventory covers selected
        example markets, mainly in and around Texas.{' '}
        <Link to="/#demo-data" className="font-medium underline underline-offset-2">
          About the demo data
        </Link>
      </p>
    </section>
  );
}
