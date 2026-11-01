import { isSampleDataId } from '@deadspace/shared';

/** Small "Sample data" tag for seeded, fictional listings. Renders nothing for anything else. */
export function SampleBadge({ id }: { id: string }) {
  if (!isSampleDataId(id)) return null;
  return (
    <span
      title="This listing is fictional demo data"
      className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
    >
      Sample data
    </span>
  );
}

/**
 * The contact line on a match card. A sample listing's contact is made up, so it is shown as plain text
 * and never as a `mailto:` link; a real (user-created) listing keeps its link.
 */
export function ContactLine({ id, name, email }: { id: string; name: string; email: string }) {
  if (isSampleDataId(id)) {
    return (
      <p className="mt-4 text-sm text-slate-600">
        Contact: {name} <span className="text-slate-500">(fictional sample contact, not a real address)</span>
      </p>
    );
  }
  return (
    <p className="mt-4 text-sm">
      <a className="text-blue-700 hover:underline" href={`mailto:${email}`}>
        Contact {name}
      </a>
    </p>
  );
}
