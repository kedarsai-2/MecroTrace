import { apiFetch } from './http';

const BASE = '/trader/bluetooth-printers';

export type BluetoothPrinterAccessMode = 'OPEN' | 'RESTRICTED';

export interface BluetoothPrinterDTO {
  id: number;
  mac_address: string;
  display_name: string;
  access_mode: BluetoothPrinterAccessMode;
  allowed_user_ids?: number[];
  allowed_role_ids?: number[];
  current_user_can_use: boolean;
}

function normalizePrinterDto(p: BluetoothPrinterDTO): BluetoothPrinterDTO {
  return {
    ...p,
    allowed_user_ids: Array.isArray(p.allowed_user_ids) ? p.allowed_user_ids : [],
    allowed_role_ids: Array.isArray(p.allowed_role_ids) ? p.allowed_role_ids : [],
  };
}

export interface BluetoothPrinterRegisterRequest {
  mac_address: string;
  display_name?: string;
}

export interface BluetoothPrinterAccessUpdateRequest {
  access_mode: BluetoothPrinterAccessMode;
  allowed_user_ids: number[];
  allowed_role_ids: number[];
}

async function handleJson<T>(res: Response, fallback: string): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }
  let msg = fallback;
  try {
    const j = (await res.json()) as { detail?: string; message?: string };
    if (typeof j.detail === 'string' && j.detail.trim()) msg = j.detail.trim();
    else if (typeof j.message === 'string' && j.message.trim()) msg = j.message.trim();
  } catch {
    // ignore
  }
  throw new Error(msg);
}

export const bluetoothPrintersApi = {
  async list(): Promise<BluetoothPrinterDTO[]> {
    const res = await apiFetch(BASE, { method: 'GET' });
    const data = await handleJson<BluetoothPrinterDTO[]>(res, 'Failed to load Bluetooth printers');
    return Array.isArray(data) ? data : [];
  },

  /** Returns true when server allows this MAC for the current user (or MAC not registered). */
  async checkMacAccess(mac: string): Promise<boolean> {
    const q = encodeURIComponent(mac.trim());
    const res = await apiFetch(`${BASE}/access-check?mac=${q}`, { method: 'GET' });
    const data = await handleJson<{ allowed?: boolean }>(res, 'Failed to verify printer access');
    return !!data?.allowed;
  },

  async register(body: BluetoothPrinterRegisterRequest): Promise<BluetoothPrinterDTO> {
    const res = await apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) });
    const dto = await handleJson<BluetoothPrinterDTO>(res, 'Failed to register printer');
    return normalizePrinterDto(dto);
  },

  async updateAccess(printerId: number, body: BluetoothPrinterAccessUpdateRequest): Promise<BluetoothPrinterDTO> {
    const res = await apiFetch(`${BASE}/${printerId}/access`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    const dto = await handleJson<BluetoothPrinterDTO>(res, 'Failed to update printer access');
    return normalizePrinterDto(dto);
  },

  async remove(printerId: number): Promise<void> {
    const res = await apiFetch(`${BASE}/${printerId}`, { method: 'DELETE' });
    if (!res.ok) {
      await handleJson<unknown>(res, 'Failed to remove printer');
    }
  },
};
