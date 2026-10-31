import type { ReactNode } from 'react';

const TONE = { white: 'bg-white', muted: 'bg-slate-50' } as const;

/** A full-width landing band with a centred content column, labelled by its h2. */
export function Section({
  id,
  tone = 'white',
  children,
}: {
  id: string;
  tone?: keyof typeof TONE;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`${TONE[tone]} border-t border-slate-200`}>
      <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">{children}</div>
    </section>
  );
}

/** Section heading with an optional small label above it. Its id is what the section is labelled by. */
export function SectionHeading({ id, eyebrow, children }: { id: string; eyebrow?: string; children: ReactNode }) {
  return (
    <>
      {eyebrow && <p className="text-sm font-semibold text-blue-700">{eyebrow}</p>}
      <h2
        id={`${id}-title`}
        className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl"
      >
        {children}
      </h2>
    </>
  );
}
