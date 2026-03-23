import { Capacitor } from '@capacitor/core';

const TRADER_TOKEN_KEY = 'merco.traderToken';
const ADMIN_TOKEN_KEY = 'merco.adminToken';
const CONTACT_TOKEN_KEY = 'merco.contactToken';

const canPersistNativeToken =
  typeof window !== 'undefined' &&
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === 'android';

function readPersistedToken(key: string): string | null {
  if (!canPersistNativeToken) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function persistToken(key: string, token: string | null): void {
  if (!canPersistNativeToken) return;
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

let traderToken: string | null = readPersistedToken(TRADER_TOKEN_KEY);
let adminToken: string | null = readPersistedToken(ADMIN_TOKEN_KEY);
let contactToken: string | null = readPersistedToken(CONTACT_TOKEN_KEY);

export function getTraderToken(): string | null {
  return traderToken;
}

export function setTraderToken(token: string | null): void {
  traderToken = token;
  persistToken(TRADER_TOKEN_KEY, token);
}

export function getAdminToken(): string | null {
  return adminToken;
}

export function setAdminToken(token: string | null): void {
  adminToken = token;
  persistToken(ADMIN_TOKEN_KEY, token);
}

export function getContactToken(): string | null {
  return contactToken;
}

export function setContactToken(token: string | null): void {
  contactToken = token;
  persistToken(CONTACT_TOKEN_KEY, token);
}
