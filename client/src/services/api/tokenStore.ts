import { Capacitor } from '@capacitor/core';
import { mercoSecureStore } from '@/plugins/mercoSecureStore';

const TRADER_TOKEN_KEY = 'merco.traderToken';
const ADMIN_TOKEN_KEY = 'merco.adminToken';
const CONTACT_TOKEN_KEY = 'merco.contactToken';
const TRADER_REFRESH_TOKEN_KEY = 'merco.traderRefreshToken';
const CONTACT_REFRESH_TOKEN_KEY = 'merco.contactRefreshToken';

function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

async function readNativeValue(key: string): Promise<string | null> {
  if (!isNativeApp()) return null;
  try {
    const secure = await mercoSecureStore.get({ key });
    if (secure.value) return secure.value;
    return window.localStorage.getItem(key);
  } catch {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

async function writeNativeValue(key: string, value: string | null): Promise<void> {
  if (!isNativeApp()) return;
  try {
    if (value) {
      await mercoSecureStore.set({ key, value });
      window.localStorage.removeItem(key);
    } else {
      await mercoSecureStore.remove({ key });
      window.localStorage.removeItem(key);
    }
  } catch {
    try {
      if (value) {
        window.localStorage.setItem(key, value);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore storage failures
    }
  }
}

async function readAndRemoveLegacyAccessToken(key: string): Promise<string | null> {
  if (!isNativeApp()) return null;
  const legacy = await readNativeValue(key);
  await writeNativeValue(key, null);
  return legacy;
}

// Access tokens stay in memory. Native Android persists only refresh tokens.
let traderToken: string | null | undefined;
let adminToken: string | null | undefined;
let contactToken: string | null | undefined;
let traderRefreshToken: string | null | undefined;
let contactRefreshToken: string | null | undefined;

export async function getTraderToken(): Promise<string | null> {
  if (!isNativeApp()) return traderToken ?? null;
  if (traderToken === undefined) traderToken = await readAndRemoveLegacyAccessToken(TRADER_TOKEN_KEY);
  return traderToken ?? null;
}

export async function setTraderToken(token: string | null): Promise<void> {
  traderToken = token;
  await writeNativeValue(TRADER_TOKEN_KEY, null);
}

export async function getAdminToken(): Promise<string | null> {
  if (!isNativeApp()) return adminToken ?? null;
  if (adminToken === undefined) adminToken = await readAndRemoveLegacyAccessToken(ADMIN_TOKEN_KEY);
  return adminToken ?? null;
}

export async function setAdminToken(token: string | null): Promise<void> {
  adminToken = token;
  await writeNativeValue(ADMIN_TOKEN_KEY, null);
}

export async function getContactToken(): Promise<string | null> {
  if (!isNativeApp()) return contactToken ?? null;
  if (contactToken === undefined) contactToken = await readAndRemoveLegacyAccessToken(CONTACT_TOKEN_KEY);
  return contactToken ?? null;
}

export async function setContactToken(token: string | null): Promise<void> {
  contactToken = token;
  await writeNativeValue(CONTACT_TOKEN_KEY, null);
}

export async function getTraderRefreshToken(): Promise<string | null> {
  if (!isNativeApp()) return null;
  if (traderRefreshToken === undefined) traderRefreshToken = await readNativeValue(TRADER_REFRESH_TOKEN_KEY);
  return traderRefreshToken ?? null;
}

export async function setTraderRefreshToken(token: string | null): Promise<void> {
  if (!isNativeApp()) {
    traderRefreshToken = null;
    return;
  }
  traderRefreshToken = token;
  await writeNativeValue(TRADER_REFRESH_TOKEN_KEY, token);
}

export async function getContactRefreshToken(): Promise<string | null> {
  if (!isNativeApp()) return null;
  if (contactRefreshToken === undefined) contactRefreshToken = await readNativeValue(CONTACT_REFRESH_TOKEN_KEY);
  return contactRefreshToken ?? null;
}

export async function setContactRefreshToken(token: string | null): Promise<void> {
  if (!isNativeApp()) {
    contactRefreshToken = null;
    return;
  }
  contactRefreshToken = token;
  await writeNativeValue(CONTACT_REFRESH_TOKEN_KEY, token);
}
