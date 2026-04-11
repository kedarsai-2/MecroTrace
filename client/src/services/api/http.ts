import {
  getAdminToken,
  getContactToken,
  getTraderToken,
  setAdminToken,
  setContactToken,
  setTraderToken,
} from './tokenStore';

const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

// Server origin (no path) — use for building authenticated image URLs.
export const API_ORIGIN = RAW_API_URL.replace(/\/+$/, '').replace(/\/api\/?$/, '') || RAW_API_URL.replace(/\/+$/, '');

// Always talk to the backend under the /api prefix, regardless of whether
// VITE_API_URL includes it or not.
export const API_BASE = RAW_API_URL.replace(/\/+$/, '').endsWith('/api')
  ? RAW_API_URL.replace(/\/+$/, '')
  : `${RAW_API_URL.replace(/\/+$/, '')}/api`;

type TokenKind = 'trader' | 'admin' | 'contact';

function resolveTokenKind(path: string): TokenKind {
  if (path.startsWith('/admin/')) {
    return 'admin';
  }
  if (path.startsWith('/portal/')) {
    return 'contact';
  }
  // Default: trader app + shared endpoints
  return 'trader';
}

function getTokenForKind(kind: TokenKind): string | null {
  switch (kind) {
    case 'admin':
      return getAdminToken();
    case 'contact':
      return getContactToken();
    default:
      return getTraderToken();
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const method = (init.method ?? 'GET').toUpperCase();
  const isReadRequest = method === 'GET' || method === 'HEAD';

  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach JWT for native/webviews where cookies may be unreliable.
  const kind = resolveTokenKind(path);
  const token = getTokenForKind(kind);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Always revalidate read requests to keep cross-module data fresh after sidebar navigation.
  if (isReadRequest) {
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-cache');
    if (!headers.has('Pragma')) headers.set('Pragma', 'no-cache');
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: isReadRequest ? 'no-store' : init.cache,
    credentials: 'include',
  });
}

export function captureAuthTokenFromResponse(res: Response, kind: TokenKind): void {
  const authHeader =
    res.headers.get('authorization') ?? res.headers.get('Authorization');
  if (!authHeader) return;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return;
  const rawToken = match[1].trim();
  if (!rawToken) return;

  switch (kind) {
    case 'admin':
      setAdminToken(rawToken);
      break;
    case 'contact':
      setContactToken(rawToken);
      break;
    default:
      setTraderToken(rawToken);
      break;
  }
}
