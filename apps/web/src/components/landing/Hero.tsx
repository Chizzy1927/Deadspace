import { Link } from 'react-router';

const TRAILER_PALLETS = 26;
const LOADED_PALLETS = 14;

const primaryButton =
  'inline-flex justify-center rounded bg-blue-700 px-5 py-2.5 font-medium text-white hover:bg-blue-800';
const secondaryButton =
  'inline-flex justify-center rounded border border-blue-700 bg-white px-5 py-2.5 font-medium text-blue-700 hover:bg-blue-50';

/** Top of the landing page: what DeadSpace is, who it's for, and the two ways in. */
export function Hero() {
  return (
    <div className="bg-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-sm font-semibold text-blue-700">For shippers, carriers and warehouse operators</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance text-slate-900 md:text-5xl">
            Ship on trucks already making the trip. Store in space that&apos;s sitting empty.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-700">
            DeadSpace connects shippers with carriers who have spare room on a planned trip, and with warehouses that
            have idle space. Describe your load or storage need and see the options that fit, ranked, with the reasons
            spelled out.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#need-capacity" className={primaryButton}>
              I need capacity
            </a>
            <a href="#have-capacity" className={secondaryButton}>
              I have capacity
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-700">
            Just looking?{' '}
            <Link to="/request/transport?example=1" className="font-medium text-blue-800 underline">
              See a demo request
            </Link>{' '}
            (a pre-filled form you review before submitting).
          </p>
        </div>
        <CapacityPreview />
      </div>
    </div>
  );
}

/** Two pieces of seeded demo capacity: part of a trailer on a planned trip, and idle racking. */
function CapacityPreview() {
  const open = TRAILER_PALLETS - LOADED_PALLETS;
  return (
    <figure className="w-full max-w-lg rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 lg:max-w-none">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">Truck trip, already planned</p>
        <p className="mt-1 font-medium">Dallas, TX → Houston, TX</p>
        <p className="text-sm text-slate-600">53′ dry van · part-loaded</p>
        <div className="mt-3 flex items-stretch gap-1" aria-hidden="true">
          <div className="grid flex-1 grid-cols-[repeat(13,minmax(0,1fr))] gap-0.5 rounded border border-slate-400 p-1">
            {Array.from({ length: TRAILER_PALLETS }, (_, i) => {
              // Pallets load two abreast from the front (left), so fill whole columns first.
              const column = i % 13;
              const loaded = column < LOADED_PALLETS / 2;
              return (
                <span
                  key={i}
                  className={`aspect-square rounded-[2px] ${
                    loaded ? 'bg-slate-400' : 'border border-dashed border-blue-500 bg-blue-50'
                  }`}
                />
              );
            })}
          </div>
          <div className="w-3 rounded-r border border-l-0 border-slate-400 bg-slate-200" />
        </div>
        <p className="mt-2 text-sm">
          <span className="font-semibold text-blue-800">
            {open} of {TRAILER_PALLETS} pallet spaces open
          </span>
          <span className="text-slate-600"> · {LOADED_PALLETS} already loaded</span>
        </p>
      </div>
      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">Warehouse space, sitting idle</p>
        <p className="mt-1 font-medium">Dallas, TX</p>
        <p className="mt-1 text-sm">
          <span className="font-semibold text-blue-800">200 pallet positions free</span>
          <span className="text-slate-600"> · racking freed up after a customer consolidated</span>
        </p>
      </div>
      <figcaption className="mt-3 text-xs text-slate-600">Examples from DeadSpace&apos;s demo data.</figcaption>
    </figure>
  );
}
