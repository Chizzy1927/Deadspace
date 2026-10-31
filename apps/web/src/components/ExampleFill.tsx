interface ExampleFillProps {
  onFill: () => void;
  filled: boolean;
}

/** "Fill with an example" button and a polite status line, rendered always so the live region exists before its text changes. */
export function ExampleFill({ onFill, filled }: ExampleFillProps) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onFill}
        className="rounded border border-blue-700 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
      >
        Fill with an example
      </button>
      <p role="status" className="mt-2 text-sm font-medium text-slate-700">
        {filled ? 'Example request filled in. Review the details, then submit.' : ''}
      </p>
    </div>
  );
}
