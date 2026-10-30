import type { Location } from '@deadspace/shared';
import { useQuery } from '@tanstack/react-query';
import { type Ref, useEffect, useId, useState } from 'react';
import { searchPlaces } from '../api/geocode';

interface LocationInputProps {
  label: string;
  value: Location | null;
  onChange: (value: Location | null) => void;
  onBlur?: () => void;
  error?: string | undefined;
  /** Lets react-hook-form focus this input when its field has an error. */
  ref?: Ref<HTMLInputElement>;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/** Free-text place search via the API's geocoder proxy. Only a picked suggestion counts as a value. */
export function LocationInput({ label, value, onChange, onBlur, error, ref }: LocationInputProps) {
  const id = useId();
  const [text, setText] = useState(value?.label ?? '');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const search = useQuery({
    queryKey: ['geocode', query],
    queryFn: ({ signal }) => searchPlaces(query, signal),
    enabled: open && query.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60_000,
  });
  const results = search.data ?? [];
  const showList = open && query.length >= MIN_QUERY_LENGTH;

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder="Search a city or address"
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on a suggestion lands before the list closes.
          setTimeout(() => setOpen(false), 150);
          onBlur?.();
        }}
      />
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-slate-200 bg-white shadow"
        >
          {search.isFetching && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">Searching…</li>
          )}
          {search.isError && <li className="px-3 py-2 text-sm text-red-700">Location search failed. Try again.</li>}
          {search.isSuccess && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">No places found</li>
          )}
          {results.map((place) => (
            <li key={`${place.provider}:${place.providerPlaceId ?? place.label}`} role="option" aria-selected={false}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-slate-100 focus:bg-slate-100"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ label: place.label, lat: place.lat, lng: place.lng });
                  setText(place.label);
                  setOpen(false);
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
          {results.some((p) => p.provider === 'geoapify') && (
            <li className="px-3 py-1 text-xs text-slate-500">Powered by Geoapify · © OpenStreetMap contributors</li>
          )}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
