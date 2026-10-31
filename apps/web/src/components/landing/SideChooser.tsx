import { Link } from 'react-router';
import { Section, SectionHeading } from './Section';

interface Flow {
  to: string;
  title: string;
  body: string;
  fields: string;
  /** A pre-filled version of the same form, for shipper flows only. */
  example?: { to: string; label: string };
}

const SIDES = [
  {
    id: 'need-capacity',
    heading: 'I need capacity',
    audience: 'For shippers',
    flows: [
      {
        to: '/request/transport',
        title: 'Request transport',
        body: "Move pallets on a truck that's already making the trip.",
        fields: 'Pickup and drop-off, pickup window, pallets, weight and trailer type.',
        example: { to: '/request/transport?example=1', label: 'Try it with an example transport request' },
      },
      {
        to: '/request/storage',
        title: 'Request storage',
        body: 'Find short-term warehouse space near where you need it.',
        fields: 'Location, move-in and move-out dates, and pallet positions.',
        example: { to: '/request/storage?example=1', label: 'Try it with an example storage request' },
      },
    ],
  },
  {
    id: 'have-capacity',
    heading: 'I have capacity',
    audience: 'For carriers and warehouse operators',
    flows: [
      {
        to: '/list/truck',
        title: 'List a truck leg',
        body: "Fill spare room on a trip you're already planning.",
        fields: "Route, departure window, trailer, what's already on board and your price.",
      },
      {
        to: '/list/warehouse',
        title: 'List warehouse space',
        body: 'Fill idle space for as long as it is free.',
        fields: 'Location, pallet positions, available dates, minimum stay and your rate.',
      },
    ],
  },
] as const satisfies readonly { id: string; heading: string; audience: string; flows: readonly Flow[] }[];

/** The need/have choice that ends the page: one card per flow, each linking straight into it. */
export function SideChooser() {
  return (
    <Section id="get-started">
      <SectionHeading id="get-started" eyebrow="Get started">
        Start with what you need, or what you have
      </SectionHeading>
      <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-8">
        {SIDES.map((side) => (
          // scroll-mt keeps the column heading clear of the top edge when the hero links jump here.
          <div key={side.id} id={side.id} aria-labelledby={`${side.id}-title`} role="group" className="scroll-mt-6">
            <h3 id={`${side.id}-title`} className="text-lg font-semibold text-slate-900">
              {side.heading}
            </h3>
            <p className="text-sm text-slate-600">{side.audience}</p>
            <ul className="mt-4 space-y-4">
              {side.flows.map((flow) => (
                <li key={flow.to}>
                  <FlowCard flow={flow} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Whole card is clickable via a stretched link, but the link's accessible name stays the short title. */
function FlowCard({ flow }: { flow: Flow }) {
  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-700 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue-700">
      <p className="font-semibold text-blue-800">
        <Link to={flow.to} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
          {flow.title}
        </Link>
        <span aria-hidden="true" className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </p>
      <p className="mt-1 text-slate-800">{flow.body}</p>
      <p className="mt-3 text-sm text-slate-600">
        <span className="font-medium text-slate-700">You&apos;ll enter:</span> {flow.fields}
      </p>
      {flow.example && (
        // Above the stretched card link so it stays separately clickable.
        <p className="relative z-10 mt-3 text-sm">
          <Link to={flow.example.to} className="font-medium text-blue-800 underline">
            {flow.example.label}
          </Link>
        </p>
      )}
    </div>
  );
}
