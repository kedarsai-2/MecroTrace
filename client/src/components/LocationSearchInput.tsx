import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Merco-Arrival-Origin/1.0';
const GOOGLE_MAPS_URL = 'https://maps.googleapis.com/maps/api/js';
const GOOGLE_MAPS_SCRIPT_ID = 'merco-google-maps-places';
const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ??
  import.meta.env.VITE_GOOGLE_PLACES_API_KEY ??
  import.meta.env.VITE_GOOGLE_GEOCODING_API_KEY ??
  ''
).trim();

type LocationProvider = 'google' | 'openstreetmap';

interface LocationSuggestion {
  id: string;
  displayName: string;
  provider: LocationProvider;
}

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

interface GoogleAutocompletePrediction {
  description: string;
  place_id?: string;
}

interface GoogleAutocompleteResponse {
  predictions?: GoogleAutocompletePrediction[];
}

interface GoogleAutocompletionRequest {
  input: string;
  componentRestrictions?: { country: string | string[] };
  language?: string;
  region?: string;
}

interface GoogleAutocompleteService {
  getPlacePredictions(
    request: GoogleAutocompletionRequest,
    callback?: (predictions: GoogleAutocompletePrediction[] | null, status: string) => void,
  ): Promise<GoogleAutocompleteResponse> | void;
}

interface GooglePlacesLibrary {
  AutocompleteService: new () => GoogleAutocompleteService;
}

interface GoogleMapsApi {
  importLibrary?: (name: 'places') => Promise<GooglePlacesLibrary>;
  places?: GooglePlacesLibrary;
}

interface GoogleMapsWindow extends Window {
  google?: {
    maps?: GoogleMapsApi;
  };
}

let googleMapsScriptPromise: Promise<GoogleMapsApi> | null = null;
let googleAutocompleteServicePromise: Promise<GoogleAutocompleteService> | null = null;

function getGoogleMapsApi(): GoogleMapsApi | undefined {
  return (window as GoogleMapsWindow).google?.maps;
}

function loadGoogleMapsPlaces(apiKey: string): Promise<GoogleMapsApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Maps can only be loaded in the browser'));
  }

  const loadedApi = getGoogleMapsApi();
  if (loadedApi?.places?.AutocompleteService || loadedApi?.importLibrary) {
    return Promise.resolve(loadedApi);
  }

  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const finish = () => {
      const api = getGoogleMapsApi();
      if (api) resolve(api);
      else reject(new Error('Google Maps API loaded without maps namespace'));
    };
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        finish();
        return;
      }
      if (existingScript.dataset.failed === 'true') existingScript.remove();
      else {
        existingScript.addEventListener('load', finish, { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Google Maps API failed to load')), { once: true });
        return;
      }
    }

    const fail = (script: HTMLScriptElement) => {
      script.dataset.failed = 'true';
      script.remove();
      reject(new Error('Google Maps API failed to load'));
    };

    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      libraries: 'places',
      language: 'en',
      region: 'IN',
    });
    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `${GOOGLE_MAPS_URL}?${params}`;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      finish();
    }, { once: true });
    script.addEventListener('error', () => fail(script), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    googleMapsScriptPromise = null;
    throw error;
  });

  return googleMapsScriptPromise;
}

async function getGoogleAutocompleteService(): Promise<GoogleAutocompleteService> {
  if (googleAutocompleteServicePromise) return googleAutocompleteServicePromise;

  googleAutocompleteServicePromise = (async () => {
    const api = await loadGoogleMapsPlaces(GOOGLE_MAPS_API_KEY);
    if (api.importLibrary) {
      const places = await api.importLibrary('places');
      if (places?.AutocompleteService) return new places.AutocompleteService();
    }
    const AutocompleteService = api.places?.AutocompleteService;
    if (AutocompleteService) return new AutocompleteService();
    throw new Error('Google Places Autocomplete is unavailable');
  })().catch((error) => {
    googleAutocompleteServicePromise = null;
    throw error;
  });

  return googleAutocompleteServicePromise;
}

function mapGooglePrediction(prediction: GoogleAutocompletePrediction, index: number): LocationSuggestion {
  return {
    id: `google-${prediction.place_id || prediction.description}-${index}`,
    displayName: prediction.description,
    provider: 'google',
  };
}

function mapNominatimResult(result: NominatimResult, index: number): LocationSuggestion {
  return {
    id: `openstreetmap-${result.place_id}-${index}`,
    displayName: result.display_name,
    provider: 'openstreetmap',
  };
}

async function fetchGoogleSuggestions(query: string): Promise<LocationSuggestion[]> {
  const service = await getGoogleAutocompleteService();
  const request: GoogleAutocompletionRequest = {
    input: query,
    componentRestrictions: { country: 'in' },
    language: 'en',
    region: 'in',
  };

  const predictions = await new Promise<GoogleAutocompletePrediction[]>((resolve, reject) => {
    let settled = false;
    const resolveOnce = (value: GoogleAutocompletePrediction[]) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const maybePromise = service.getPlacePredictions(request, (items, status) => {
      if (status === 'OK') {
        resolveOnce(items ?? []);
      } else if (status === 'ZERO_RESULTS') {
        resolveOnce([]);
      } else {
        rejectOnce(new Error(`Google Places Autocomplete failed: ${status}`));
      }
    });

    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise
        .then(response => resolveOnce(response.predictions ?? []))
        .catch(rejectOnce);
    }
  });

  return predictions.map(mapGooglePrediction);
}

async function fetchNominatimSuggestions(query: string, signal: AbortSignal): Promise<LocationSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '8',
    countrycodes: 'in', // India only
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    signal,
    headers: { 'Accept': 'application/json', 'Accept-Language': 'en', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
  const data = await res.json() as NominatimResult[];
  return data.map(mapNominatimResult);
}

async function fetchLocationSuggestions(query: string, signal: AbortSignal): Promise<LocationSuggestion[]> {
  if (GOOGLE_MAPS_API_KEY) {
    try {
      return await fetchGoogleSuggestions(query);
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }

  return fetchNominatimSuggestions(query, signal);
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
 * Origin/location input with Google Places search when configured, otherwise OpenStreetMap Nominatim (India only).
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
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  /** True after latest location provider request for current query finished (success or error). */
  const [searchFinished, setSearchFinished] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);
  const lastRequestAtRef = useRef(0);
  const fetchGenerationRef = useRef(0);
  const MIN_REQUEST_INTERVAL_MS = 1100; // Nominatim: max 1 request per second
  const MIN_QUERY_LEN = 1;

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
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < MIN_QUERY_LEN) {
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
        fetchLocationSuggestions(query.trim(), abortRef.current.signal)
          .then((data) => {
            if (gen !== fetchGenerationRef.current) return;
            setSuggestions(data);
            setOpen(data.length > 0 || query.trim().length >= MIN_QUERY_LEN);
            updateDropdownPos();
          })
          .catch((err: unknown) => {
            if (gen !== fetchGenerationRef.current) return;
            const aborted =
              (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
              (err instanceof Error && err.name === 'AbortError');
            if (aborted) return;
            setSuggestions([]);
            setOpen(query.trim().length >= MIN_QUERY_LEN);
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
    searchFinished && !loading && query.trim().length >= MIN_QUERY_LEN && suggestions.length === 0;
  const showGoogleAttribution = suggestions.some(s => s.provider === 'google');

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
              key={s.id}
              type="button"
              role="option"
              onMouseDown={e => { e.preventDefault(); handleSelect(s.displayName); }}
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors border-b border-border/20 last:border-0 flex items-center gap-2"
            >
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{s.displayName}</span>
            </button>
          ))}
          {showGoogleAttribution && (
            <div className="px-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground border-t border-border/20">
              Powered by Google
            </div>
          )}
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
