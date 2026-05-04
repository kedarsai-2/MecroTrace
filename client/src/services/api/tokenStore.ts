import { Capacitor } from '@capacitor/core';

const TRADER_TOKEN_KEY = 'merco.traderToken';
const ADMIN_TOKEN_KEY = 'merco.adminToken';
const CONTACT_TOKEN_KEY = 'merco.contactToken';

function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

function readPersistedToken(key: string): string | null {
  if (!isNativeApp()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function persistToken(key: string, token: string | null): void {
  if (!isNativeApp()) return;
  try {
    if (token) {
      window.localStorage.setItem(key, token);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore storage failures
  }
}

// In-memory cache for current session (browser); native iOS/Android also persist to localStorage for Authorization header.
let traderToken: string | null = null;
let adminToken: string | null = null;
let contactToken: string | null = null;

export function getTraderToken(): string | null {
  if (!isNativeApp()) return traderToken;
  if (traderToken === null) traderToken = readPersistedToken(TRADER_TOKEN_KEY);
  return traderToken;
}

export function setTraderToken(token: string | null): void {
  traderToken = token;
  persistToken(TRADER_TOKEN_KEY, token);
}

export function getAdminToken(): string | null {
  if (!isNativeApp()) return adminToken;
  if (adminToken === null) adminToken = readPersistedToken(ADMIN_TOKEN_KEY);
  return adminToken;
}

export function setAdminToken(token: string | null): void {
  adminToken = token;
  persistToken(ADMIN_TOKEN_KEY, token);
}

export function getContactToken(): string | null {
  if (!isNativeApp()) return contactToken;
  if (contactToken === null) contactToken = readPersistedToken(CONTACT_TOKEN_KEY);
  return contactToken;
}

export function setContactToken(token: string | null): void {
  contactToken = token;
  persistToken(CONTACT_TOKEN_KEY, token);
}
