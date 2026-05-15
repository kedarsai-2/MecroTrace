import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn(async ({ key }: { key: string }) => ({ value: values.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      values.set(key, value);
      return { ok: true };
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      values.delete(key);
      return { ok: true };
    }),
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
  registerPlugin: () => secureStore,
}));

function apiPath(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return new URL(raw).pathname.replace(/^\/api/, '');
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function bodyJson(init: RequestInit | undefined): Record<string, unknown> {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : {};
}

async function loadApiModules() {
  vi.resetModules();
  const [http, tokenStore] = await Promise.all([import('./http'), import('./tokenStore')]);
  return { http, tokenStore };
}

describe('apiFetch refresh handling', () => {
  beforeEach(() => {
    secureStore.values.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    try {
      window.localStorage?.clear?.();
    } catch {
      // The jsdom runner used in this project can provide a partial localStorage stub.
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one trader refresh across parallel 401 responses and retries every request', async () => {
    const { http, tokenStore } = await loadApiModules();
    await tokenStore.setTraderToken('trader-old-access');
    await tokenStore.setTraderRefreshToken('trader-old-refresh');

    let protectedCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = apiPath(input);
      if (path === '/auth/refresh') {
        refreshCalls += 1;
        expect(headerValue(init, http.REFRESH_TOKEN_HEADER)).toBe('trader-old-refresh');
        expect(bodyJson(init).refresh_token).toBe('trader-old-refresh');
        return jsonResponse(200, { id_token: 'trader-new-access', refresh_token: 'trader-new-refresh' }, {
          [http.REFRESH_TOKEN_HEADER]: 'trader-new-refresh',
        });
      }
      if (path === '/billing/summaries') {
        protectedCalls += 1;
        return protectedCalls <= 5 ? emptyResponse(401) : jsonResponse(200, { ok: true });
      }
      throw new Error(`Unexpected request to ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => http.apiFetch('/billing/summaries', { method: 'GET' })),
    );

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(10);
    expect(await tokenStore.getTraderToken()).toBe('trader-new-access');
    expect(await tokenStore.getTraderRefreshToken()).toBe('trader-new-refresh');
  });

  it('shares one contact refresh across parallel 401 responses and retries every request', async () => {
    const { http, tokenStore } = await loadApiModules();
    await tokenStore.setContactToken('contact-old-access');
    await tokenStore.setContactRefreshToken('contact-old-refresh');

    let protectedCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = apiPath(input);
      if (path === '/portal/auth/refresh') {
        refreshCalls += 1;
        expect(headerValue(init, http.REFRESH_TOKEN_HEADER)).toBe('contact-old-refresh');
        expect(bodyJson(init).refresh_token).toBe('contact-old-refresh');
        return jsonResponse(200, { token: 'contact-new-access', refresh_token: 'contact-new-refresh' }, {
          [http.REFRESH_TOKEN_HEADER]: 'contact-new-refresh',
        });
      }
      if (path === '/portal/arrivals') {
        protectedCalls += 1;
        return protectedCalls <= 5 ? emptyResponse(401) : jsonResponse(200, { ok: true });
      }
      throw new Error(`Unexpected request to ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => http.apiFetch('/portal/arrivals', { method: 'GET' })),
    );

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(10);
    expect(await tokenStore.getContactToken()).toBe('contact-new-access');
    expect(await tokenStore.getContactRefreshToken()).toBe('contact-new-refresh');
  });

  it('clears trader tokens only when the shared refresh fails', async () => {
    const { http, tokenStore } = await loadApiModules();
    await tokenStore.setTraderToken('trader-old-access');
    await tokenStore.setTraderRefreshToken('trader-old-refresh');

    let protectedCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = apiPath(input);
      if (path === '/auth/refresh') {
        refreshCalls += 1;
        return emptyResponse(401);
      }
      if (path === '/billing/summaries') {
        protectedCalls += 1;
        return emptyResponse(401);
      }
      throw new Error(`Unexpected request to ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await http.apiFetch('/billing/summaries', { method: 'GET' });

    expect(res.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(1);
    expect(await tokenStore.getTraderToken()).toBeNull();
    expect(await tokenStore.getTraderRefreshToken()).toBeNull();
  });

  it('shares a direct trader session refresh with an API retry refresh', async () => {
    vi.resetModules();
    const [http, tokenStore, authModule] = await Promise.all([
      import('./http'),
      import('./tokenStore'),
      import('./auth'),
    ]);
    await tokenStore.setTraderToken('trader-old-access');
    await tokenStore.setTraderRefreshToken('trader-old-refresh');

    let resolveRefresh: () => void = () => {};
    const refreshCanFinish = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    let markRefreshStarted: () => void = () => {};
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });

    let protectedCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = apiPath(input);
      if (path === '/auth/refresh') {
        refreshCalls += 1;
        markRefreshStarted();
        await refreshCanFinish;
        return jsonResponse(200, { id_token: 'trader-new-access', refresh_token: 'trader-new-refresh' });
      }
      if (path === '/billing/summaries') {
        protectedCalls += 1;
        return protectedCalls === 1 ? emptyResponse(401) : jsonResponse(200, { ok: true });
      }
      throw new Error(`Unexpected request to ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const directRefresh = authModule.authApi.refreshSession();
    await refreshStarted;
    const retriedFetch = http.apiFetch('/billing/summaries', { method: 'GET' });
    resolveRefresh();

    await expect(directRefresh).resolves.toBe(true);
    const retriedResponse = await retriedFetch;
    expect(retriedResponse.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
  });
});
