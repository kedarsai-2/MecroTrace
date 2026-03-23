import { apiFetch } from './http';

const BASE = '/settlements';

// ─── Types (aligned with SettlementPage.tsx and backend DTOs) ───
export interface RateClusterDTO {
  rate: number;
  totalQuantity: number;
  totalWeight: number;
  amount: number;
}

export interface DeductionItemDTO {
  key: string;
  label: string;
  amount: number;
  editable: boolean;
  autoPulled: boolean;
}

export interface PattiDTO {
  id?: number;
  pattiId: string;
  sellerId?: string;
  sellerName: string;
  rateClusters: RateClusterDTO[];
  grossAmount: number;
  deductions: DeductionItemDTO[];
  totalDeductions: number;
  netPayable: number;
  createdAt: string;
  useAverageWeight?: boolean;
}

export interface PattiSaveRequest {
  sellerId?: string;
  sellerName: string;
  rateClusters: RateClusterDTO[];
  grossAmount: number;
  deductions: DeductionItemDTO[];
  totalDeductions: number;
  netPayable: number;
  useAverageWeight?: boolean;
}

export interface SettlementEntryDTO {
  bidNumber: number;
  buyerMark: string;
  buyerName: string;
  /** Auction base bid per bag */
  rate: number;
  /** Preset margin from auction; seller settlement rate = rate + presetMargin */
  presetMargin?: number;
  quantity: number;
  weight: number;
}

export interface SettlementLotDTO {
  lotId: string;
  lotName: string;
  commodityName: string;
  entries: SettlementEntryDTO[];
}

export interface SellerSettlementDTO {
  sellerId: string;
  sellerName: string;
  sellerMark: string;
  vehicleNumber: string;
  lots: SettlementLotDTO[];
}

export interface SellerChargesDTO {
  freight: number;
  advance: number;
  freightAutoPulled?: boolean;
  advanceAutoPulled?: boolean;
}

export interface ListSellersParams {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
}

export interface ListPattisParams {
  page?: number;
  size?: number;
  sort?: string;
}

async function parseJsonOrThrow(res: Response, defaultMessage: string): Promise<never> {
  let message = defaultMessage;
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.detail) message = body.detail;
      else if (body?.errors?.[0]?.message) message = body.errors[0].message;
    }
  } catch {
    // ignore
  }
  throw new Error(message);
}

export const settlementApi = {
  /** List sellers for settlement (paginated). Backend builds from completed auctions and weighing. */
  async listSellers(params: ListSellersParams = {}): Promise<SellerSettlementDTO[]> {
    const q = new URLSearchParams();
    if (params.page != null) q.set('page', String(params.page));
    if (params.size != null) q.set('size', String(params.size));
    if (params.sort) q.set('sort', params.sort);
    if (params.search) q.set('search', params.search);
    const res = await apiFetch(`${BASE}/sellers?${q}`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load settlement sellers');
    return res.json();
  },

  /** List saved pattis (paginated). */
  async listPattis(params: ListPattisParams = {}): Promise<PattiDTO[]> {
    const q = new URLSearchParams();
    if (params.page != null) q.set('page', String(params.page));
    if (params.size != null) q.set('size', String(params.size));
    if (params.sort) q.set('sort', params.sort);
    const res = await apiFetch(`${BASE}/pattis?${q}`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load pattis');
    return res.json();
  },

  /** Create patti. Server generates pattiId (PT-YYYYMMDD-NNNN). */
  async createPatti(body: PattiSaveRequest): Promise<PattiDTO> {
    const res = await apiFetch(`${BASE}/pattis`, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to save patti');
    const dto = await res.json();
    if (dto.createdAt) dto.createdAt = typeof dto.createdAt === 'string' ? dto.createdAt : new Date(dto.createdAt).toISOString();
    return dto;
  },

  /** Get patti by database id. */
  async getPattiById(id: number): Promise<PattiDTO | null> {
    const res = await apiFetch(`${BASE}/pattis/${id}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load patti');
    const dto = await res.json();
    if (dto.createdAt) dto.createdAt = typeof dto.createdAt === 'string' ? dto.createdAt : new Date(dto.createdAt).toISOString();
    return dto;
  },

  /** Get patti by business key (e.g. PT-20250302-0001). */
  async getPattiByPattiId(pattiId: string): Promise<PattiDTO | null> {
    const res = await apiFetch(`${BASE}/pattis/by-patti-id/${encodeURIComponent(pattiId)}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load patti');
    const dto = await res.json();
    if (dto.createdAt) dto.createdAt = typeof dto.createdAt === 'string' ? dto.createdAt : new Date(dto.createdAt).toISOString();
    return dto;
  },

  /** Update patti (e.g. deductions). */
  async updatePatti(id: number, body: PattiSaveRequest): Promise<PattiDTO | null> {
    const res = await apiFetch(`${BASE}/pattis/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    if (res.status === 404) return null;
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to update patti');
    const dto = await res.json();
    if (dto.createdAt) dto.createdAt = typeof dto.createdAt === 'string' ? dto.createdAt : new Date(dto.createdAt).toISOString();
    return dto;
  },

  /** Get computed seller-level charges (freight, advance) for a new patti. */
  async getSellerCharges(sellerId: string): Promise<SellerChargesDTO> {
    const res = await apiFetch(`${BASE}/sellers/${encodeURIComponent(sellerId)}/charges`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load seller charges');
    const data = await res.json();
    return {
      freight: Number(data.freight ?? 0),
      advance: Number(data.advance ?? 0),
      freightAutoPulled: Boolean(data.freightAutoPulled),
      advanceAutoPulled: Boolean(data.advanceAutoPulled),
    };
  },
};
