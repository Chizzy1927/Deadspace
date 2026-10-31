import { useState } from 'react';
import { EstimateNote } from '../Estimate';
import { MatchCard } from '../MatchCard';
import { buildExampleMatch } from './example-match';
import { Section, SectionHeading } from './Section';

const TRUCK_SIGNALS = [
  ['Route efficiency', "Counts most. How few extra miles your load adds to the carrier's trip."],
  ['Spare-capacity fit', 'How well your load fits the room that is left on the truck.'],
  ['Price', 'The estimated price against your budget, or against the other matching trucks.'],
  ['Timing', 'How much slack the schedule leaves around your pickup and delivery.'],
] as const;

/** A real MatchCard over a static, typed example, beside the ranking signals in plain words. */
export function ExampleMatch() {
  const [match] = useState(() => buildExampleMatch(new Date()));
  return (
    <Section id="example-match" tone="muted">
      {/* On narrow screens the card follows the intro; on wide screens it sits beside all the text. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12">
        <div>
          <SectionHeading id="example-match" eyebrow="What you get back">
            Every match comes with its reasons
          </SectionHeading>
          <p className="mt-4 text-slate-700">
            Only options that meet every requirement are shown: the right trailer, enough room and a schedule that
            works. Trucks are then ranked on four things.
          </p>
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">Example</span>
            <span className="text-slate-600">
              Top match for 6 pallets, Dallas to Houston, from the demo data. Not a live listing.
            </span>
          </p>
          <MatchCard match={match} rank={1} headingLevel={3} />
          <div className="mt-3">
            <EstimateNote />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-slate-600 uppercase">How trucks are ranked</h3>
          <dl className="mt-3 space-y-4">
            {TRUCK_SIGNALS.map(([term, description]) => (
              <div key={term}>
                <dt className="font-semibold text-slate-900">{term}</dt>
                <dd className="text-slate-700">{description}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-slate-700">
            Warehouse space is ranked on distance, price, how well the space fits your pallets and room to extend your
            stay.
          </p>
          <p className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-600">
            Distances and prices are estimates, not quotes. The ranking rules are simple, adjustable defaults that help
            you compare options. They don&apos;t make the decision for you.
          </p>
        </div>
      </div>
    </Section>
  );
}
