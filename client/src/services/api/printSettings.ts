import { apiFetch } from './http';

const BASE = '/trader/print-settings';

export type PrintModuleKey = 'SETTLEMENT' | 'BILLING' | 'BILLING_NON_GST';
export type PrintPaperSize = 'A4' | 'A5';

export interface PrintSettingDTO {
  id?: number;
  module_key: PrintModuleKey;
  paper_size_with_header: PrintPaperSize;
  paper_size_without_header: PrintPaperSize;
  include_header: boolean;
}

export const printSettingsApi = {
  list: async (): Promise<PrintSettingDTO[]> => {
    const res = await apiFetch(BASE, { method: 'GET' });
    if (!res.ok) throw new Error(res.statusText || 'Failed to load print settings');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  upsert: async (body: PrintSettingDTO): Promise<PrintSettingDTO> => {
    const res = await apiFetch(BASE, { method: 'PUT', body: JSON.stringify(body) });
    if (!res.ok) throw new Error(res.statusText || 'Failed to save print setting');
    return res.json();
  },
};
