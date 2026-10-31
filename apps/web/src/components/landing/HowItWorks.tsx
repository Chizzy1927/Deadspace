import { Section, SectionHeading } from './Section';

const STEPS = [
  {
    title: "Capacity owners post what's really available",
    body: "A carrier lists a trip they're already making: where from, where to, when it leaves and how much room is left. A warehouse lists idle space, its dates and its price.",
  },
  {
    title: 'Shippers say what they need',
    body: 'Where the freight is going and when, how many pallets and what trailer. Or where you need storage, and for how long.',
  },
  {
    title: 'DeadSpace shows what fits, best first',
    body: "Anything that can't do the job is left out. The rest are ranked, and every match says why it's there.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading id="how-it-works" eyebrow="How it works">
        Real capacity in, a ranked shortlist out
      </SectionHeading>
      <ol className="mt-10 grid gap-8 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white"
            >
              {i + 1}
            </span>
            <h3 className="mt-3 font-semibold text-slate-900">{step.title}</h3>
            <p className="mt-1 text-slate-700">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-12 grid gap-6 rounded-lg border border-slate-200 bg-slate-50 p-5 md:grid-cols-2">
        <div>
          <h3 className="font-semibold text-slate-900">Not a load board</h3>
          <p className="mt-1 text-sm text-slate-700">
            There are no &ldquo;truck available anywhere&rdquo; posts and no loads for carriers to bid on. Every truck
            listing is one planned trip with an origin, a destination and a departure window.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">You deal with them directly</h3>
          <p className="mt-1 text-sm text-slate-700">
            Each match comes with the carrier&apos;s or warehouse&apos;s contact details. You agree the terms with them.
            DeadSpace doesn&apos;t take bookings or payments.
          </p>
        </div>
      </div>
    </Section>
  );
}
