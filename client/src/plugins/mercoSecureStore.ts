import { registerPlugin } from '@capacitor/core';

export type MercoSecureStorePlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<{ ok: boolean }>;
  remove(options: { key: string }): Promise<{ ok: boolean }>;
};

const g = globalThis as unknown as { __mercoSecureStorePlugin?: MercoSecureStorePlugin };

export const mercoSecureStore: MercoSecureStorePlugin =
  g.__mercoSecureStorePlugin ??
  (g.__mercoSecureStorePlugin = registerPlugin<MercoSecureStorePlugin>('MercoSecureStore'));
