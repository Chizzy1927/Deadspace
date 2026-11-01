import { Section, SectionHeading } from './Section';

const REAL = [
  'The matching engine: hard feasibility rules first, then ranking, with a plain-language reason for every result.',
  'The request and listing forms, their validation and the estimates (marked est.) shown on results.',
];

const FICTIONAL = [
  'Every carrier, warehouse and contact person, and their email addresses.',
  'Every price, trip, availability window and capacity figure.',
  'Nothing here can be booked, and nobody will reply to a request.',
];

/** The landing page's plain statement of what is real and what is made up. Linked from the demo banner. */
export function DemoDataSection() {
  return (
    <Section id="demo-data">
      <SectionHeading id="demo-data" eyebrow="Read this first">
        About the demo data
      </SectionHeading>
      <p className="mt-4 max-w-3xl text-slate-700">
        DeadSpace is a portfolio project, not a live marketplace. Listings are sample data created for the demo, and
        they cover selected example markets, mainly in and around Texas, rather than live or nationwide capacity.
      </p>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="font-semibold text-slate-900">What is real</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
            {REAL.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">What is fictional</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
            {FICTIONAL.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-8 max-w-3xl text-sm text-slate-600">
        There are no accounts. Anyone with a request or listing link can view it, so do not enter anything sensitive.
        New truck and warehouse listings are not saved in this public demo; requests are saved, and may be cleared at
        any time.
      </p>
    </Section>
  );
}
