import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Merco-Arrival-Origin/1.0';

interface NominatimResult {
  display_name: string;
  place_id: number;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    state_district?: string;
    country?: string;
  };
}

interface LocationSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Origin/location input with OpenStreetMap Nominatim search (India only).
 * Typing shows suggestions; if none match, user can pick "Use typed text" or blur/Enter to save free text.
 * Parent `value` updates on every keystroke so forms persist custom origins without picking a result.
 */
export default function LocationSearchInput({
  value,
  onChange,
  placeholder = 'Type location in India (city, district, state)…',
  className,
  id,
  disabled = false,
}: LocationSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  /** True after latest Nominatim request for current query finished (success or error). */
  const [searchFinished, setSearchFinished] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);
  const lastRequestAtRef = useRef(0);
  const fetchGenerationRef = useRef(0);
  const MIN_REQUEST_INTERVAL_MS = 1100; // Nominatim: max 1 request per second

  const updateDropdownPos = useCallback(() => {
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setSearchFinished(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const now = Date.now();
      const wait = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - lastRequestAtRef.current));
      const doFetch = () => {
        lastRequestAtRef.current = Date.now();
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const gen = ++fetchGenerationRef.current;
        setLoading(true);
        setSearchFinished(false);
        const params = new URLSearchParams({
          q: query.trim(),
          format: 'json',
          addressdetails: '1',
          limit: '8',
          countrycodes: 'in', // India only
        });
        fetch(`${NOMINATIM_URL}?${params}`, {
          signal: abortRef.current.signal,
          headers: { 'Accept': 'application/json', 'Accept-Language': 'en', 'User-Agent': USER_AGENT },
        })
          .then(res => res.json())
          .then((data: NominatimResult[]) => {
            if (gen !== fetchGenerationRef.current) return;
            setSuggestions(data);
            setOpen(data.length > 0 || query.trim().length >= 2);
            updateDropdownPos();
          })
          .catch((err: unknown) => {
            if (gen !== fetchGenerationRef.current) return;
            const aborted =
              (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
              (err instanceof Error && err.name === 'AbortError');
            if (aborted) return;
            setSuggestions([]);
            setOpen(query.trim().length >= 2);
            updateDropdownPos();
          })
          .finally(() => {
            if (gen !== fetchGenerationRef.current) return;
            setLoading(false);
            setSearchFinished(true);
            abortRef.current = null;
          });
      };
      if (wait > 0) setTimeout(doFetch, wait);
      else doFetch();
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, updateDropdownPos]);

  const handleSelect = (displayName: string) => {
    onChange(displayName);
    setQuery(displayName);
    setOpen(false);
    setSuggestions([]);
    inputRef.current?.blur();
  };

  const handleBlur = () => {
    const trimmed = query.trim();
    if (trimmed !== value) {
      onChange(trimmed);
      setQuery(trimmed);
    }
    setTimeout(() => setOpen(false), 200);
  };

  const showUseTypedRow =
    searchFinished && !loading && query.trim().length >= 2 && suggestions.length === 0;

  const handleFocus = () => {
    if (suggestions.length > 0 || showUseTypedRow) {
      updateDropdownPos();
      setOpen(true);
    }
  };

  // Close dropdown on scroll or resize so it doesn't stay stuck on screen (fixed position doesn't follow input)
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-[1]" />
      <input
        ref={inputRef}
        type="text"
        id={id}
        value={query}
        onChange={e => {
          const v = e.target.value;
          setQuery(v);
          onChange(v);
        }}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const trimmed = query.trim();
          onChange(trimmed);
          setQuery(trimmed);
          setOpen(false);
          setSuggestions([]);
          inputRef.current?.blur();
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="w-full h-11 rounded-xl bg-background border border-input text-sm pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Searching…</span>
      )}

      {open && (suggestions.length > 0 || showUseTypedRow) && createPortal(
        <div
          role="listbox"
          className="fixed z-[9999] bg-card border border-border/50 rounded-xl shadow-2xl max-h-52 overflow-y-auto py-1"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: Math.max(dropdownPos.width, 280),
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              role="option"
              onMouseDown={e => { e.preventDefault(); handleSelect(s.display_name); }}
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors border-b border-border/20 last:border-0 flex items-center gap-2"
            >
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{s.display_name}</span>
            </button>
          ))}
          {showUseTypedRow && (
            <button
              type="button"
              role="option"
              onMouseDown={e => {
                e.preventDefault();
                handleSelect(query.trim());
              }}
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2 border-t border-border/20"
            >
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">
                Use typed text: <span className="font-medium">{query.trim()}</span>
              </span>
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
