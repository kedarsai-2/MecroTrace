import {
  getAdminToken,
  getContactToken,
  getContactRefreshToken,
  getTraderToken,
  getTraderRefreshToken,
  setAdminToken,
  setContactToken,
  setContactRefreshToken,
  setTraderToken,
  setTraderRefreshToken,
} from './tokenStore';

const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

// Server origin (no path) — use for building authenticated image URLs.
export const API_ORIGIN = RAW_API_URL.replace(/\/+$/, '').replace(/\/api\/?$/, '') || RAW_API_URL.replace(/\/+$/, '');

// Always talk to the backend under the /api prefix, regardless of whether
// VITE_API_URL includes it or not.
export const API_BASE = RAW_API_URL.replace(/\/+$/, '').endsWith('/api')
  ? RAW_API_URL.replace(/\/+$/, '')
  : `${RAW_API_URL.replace(/\/+$/, '')}/api`;

export type TokenKind = 'trader' | 'admin' | 'contact';
export const REFRESH_TOKEN_HEADER = 'X-Merco-Refresh-Token';
type RefreshTokenKind = Exclude<TokenKind, 'admin'>;

const refreshPromises: Partial<Record<RefreshTokenKind, Promise<boolean>>> = {};

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

export async function captureRefreshTokenFromResponse(
  res: Response,
  kind: TokenKind,
  bodyRefreshToken?: unknown,
): Promise<void> {
  const raw =
    typeof bodyRefreshToken === 'string' && bodyRefreshToken.trim()
      ? bodyRefreshToken.trim()
      : (res.headers.get(REFRESH_TOKEN_HEADER) ?? '').trim();
  if (!raw || kind === 'admin') return;

  if (kind === 'contact') {
    await setContactRefreshToken(raw);
  } else {
    await setTraderRefreshToken(raw);
  }
}

async function getTokenForKind(kind: TokenKind): Promise<string | null> {
  switch (kind) {
    case 'admin':
      return getAdminToken();
    case 'contact':
      return getContactToken();
    default:
      return getTraderToken();
  }
}

function shouldAttemptRefresh(path: string, kind: TokenKind, response: Response): boolean {
  if (response.status !== 401) return false;
  if (kind === 'admin') return false;
  if (path === '/auth/refresh' || path === '/portal/auth/refresh') return false;
  if (path === '/auth/logout' || path === '/portal/auth/logout') return false;
  if (path === '/authenticate') return false;
  if (path.startsWith('/auth/login') || path.startsWith('/auth/otp/')) return false;
  if (path.startsWith('/portal/auth/login') || path.startsWith('/portal/auth/otp/')) return false;
  if (path === '/auth/register' || path === '/auth/register-contact') return false;
  return true;
}

async function requestAccessTokenRefresh(kind: RefreshTokenKind): Promise<boolean> {
  const refreshToken = kind === 'contact' ? await getContactRefreshToken() : await getTraderRefreshToken();
  const path = kind === 'contact' ? '/portal/auth/refresh' : '/auth/refresh';
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (refreshToken) headers.set(REFRESH_TOKEN_HEADER, refreshToken);

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
    credentials: 'include',
  });

  if (!res.ok) {
    if (kind === 'contact') {
      await setContactToken(null);
      await setContactRefreshToken(null);
    } else {
      await setTraderToken(null);
      await setTraderRefreshToken(null);
    }
    return false;
  }

  const data = await res.json().catch(() => ({}));
  const tokenFromBody = (data as any)?.token ?? (data as any)?.id_token;
  if (typeof tokenFromBody === 'string' && tokenFromBody.trim()) {
    if (kind === 'contact') {
      await setContactToken(tokenFromBody.trim());
    } else {
      await setTraderToken(tokenFromBody.trim());
    }
  } else {
    await captureAuthTokenFromResponse(res, kind);
  }
  await captureRefreshTokenFromResponse(res, kind, (data as any)?.refresh_token);
  return true;
}

export async function refreshSessionForKind(kind: RefreshTokenKind): Promise<boolean> {
  const existing = refreshPromises[kind];
  if (existing) {
    return existing;
  }

  const refreshPromise = requestAccessTokenRefresh(kind).finally(() => {
    if (refreshPromises[kind] === refreshPromise) {
      delete refreshPromises[kind];
    }
  });
  refreshPromises[kind] = refreshPromise;
  return refreshPromise;
}

async function performFetch(path: string, init: RequestInit, kind: TokenKind): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const method = (init.method ?? 'GET').toUpperCase();
  const isReadRequest = method === 'GET' || method === 'HEAD';

  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach JWT for native/webviews where cookies may be unreliable.
  const token = await getTokenForKind(kind);
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

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const kind = resolveTokenKind(path);
  const first = await performFetch(path, init, kind);
  if (!shouldAttemptRefresh(path, kind, first)) {
    return first;
  }
  if (kind === 'admin') {
    return first;
  }

  const refreshed = await refreshSessionForKind(kind);
  if (!refreshed) {
    return first;
  }

  return performFetch(path, init, kind);
}

export async function captureAuthTokenFromResponse(res: Response, kind: TokenKind): Promise<void> {
  const authHeader =
    res.headers.get('authorization') ?? res.headers.get('Authorization');
  if (!authHeader) return;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return;
  const rawToken = match[1].trim();
  if (!rawToken) return;

  switch (kind) {
    case 'admin':
      await setAdminToken(rawToken);
      break;
    case 'contact':
      await setContactToken(rawToken);
      break;
    default:
      await setTraderToken(rawToken);
      break;
  }
}
