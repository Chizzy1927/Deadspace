import { Section, SectionHeading } from './Section';

const POINTS = [
  {
    title: 'Trucks run part-empty',
    body: 'A carrier heading from Dallas to Houston may have half a trailer free, or be driving home empty after a delivery.',
  },
  {
    title: 'Warehouse space sits idle',
    body: 'Racking frees up when a customer leaves or a busy season ends, sometimes for only a few weeks.',
  },
  {
    title: 'The window is short',
    body: "Spare room is tied to one route, one departure or one stretch of dates. Once the truck leaves, it's gone.",
  },
] as const;

export function ProblemSection() {
  return (
    <Section id="problem" tone="muted">
      <SectionHeading id="problem" eyebrow="The problem">
        There&apos;s room on the road and in the warehouse. It&apos;s just hard to find in time.
      </SectionHeading>
      <p className="mt-4 max-w-2xl text-slate-700">
        We call this <strong className="font-semibold">stranded capacity</strong>: space that already exists, but that
        shippers rarely hear about before it&apos;s gone.
      </p>
      <ul className="mt-10 grid gap-8 md:grid-cols-3">
        {POINTS.map((point) => (
          <li key={point.title} className="border-l-2 border-blue-700 pl-4">
            <h3 className="font-semibold text-slate-900">{point.title}</h3>
            <p className="mt-1 text-slate-700">{point.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
