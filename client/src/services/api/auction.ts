import { apiFetch } from './http';

const BASE = '/module-auctions';

// ─── Response types (match backend DTOs, snake_case where @JsonProperty) ───
/** Buyer with at least one bid on the lot (registered contact or temporary scribble). */
export interface LotParticipatingBuyerDTO {
  group_key: string;
  buyer_name: string;
  buyer_mark: string;
  registered: boolean;
}

export interface LotSummaryDTO {
  lot_id: number;
  lot_name: string;
  bag_count: number;
  original_bag_count: number;
  commodity_name: string;
  seller_name: string;
  seller_mark: string;
  seller_vehicle_id: number;
  vehicle_number: string;
  was_modified: boolean;
  status?: string;
  sold_bags?: number;
  /** Total bags for the whole vehicle (all sellers on same vehicle). For lot identifier. */
  vehicle_total_qty?: number;
  /** Total bags for this seller (all lots of that seller). For lot identifier. */
  seller_total_qty?: number;
  /** Distinct buyers with bids (latest auction); for "By Buyer" lot navigation. */
  participating_buyers?: LotParticipatingBuyerDTO[];
}

export type PresetType = 'PROFIT' | 'LOSS';

export interface AuctionEntryDTO {
  auction_entry_id: number;
  auction_id: number;
  buyer_id?: number | null;
  bid_number: number;
  bid_rate: number;
  preset_margin?: number;
  preset_type?: PresetType;
  seller_rate?: number;
  buyer_rate?: number;
  quantity: number;
  amount: number;
  is_self_sale?: boolean;
  is_scribble?: boolean;
  token_advance?: number;
  extra_rate?: number;
  buyer_name: string;
  buyer_mark: string;
  created_at?: string;
  /** Epoch ms — optimistic concurrency when PATCHing this bid */
  last_modified_ms?: number;
}

export interface AuctionSessionDTO {
  auction_id: number;
  lot: LotSummaryDTO;
  entries: AuctionEntryDTO[];
  total_sold_bags: number;
  remaining_bags: number;
  highest_bid_rate: number;
  status: string;
  self_sale_context?: AuctionSelfSaleContextDTO | null;
}

export interface AuctionBidCreateRequest {
  buyer_id?: number | null;
  buyer_name: string;
  buyer_mark: string;
  is_scribble?: boolean;
  is_self_sale?: boolean;
  rate: number;
  quantity: number;
  extra_rate?: number;
  preset_applied?: number;
  preset_type?: PresetType;
  token_advance?: number;
  allow_lot_increase?: boolean;
}

export interface AuctionBidUpdateRequest {
  rate?: number;
  quantity?: number;
  token_advance?: number;
  extra_rate?: number;
  preset_applied?: number;
  preset_type?: PresetType;
  allow_lot_increase?: boolean;
  /** Must match `last_modified_ms` from session entry when edit started */
  expected_last_modified_ms?: number | null;
  /** Billing: set buyer on this auction row to match the sales bill buyer. */
  billing_reassign_buyer?: boolean;
  buyer_id?: number | null;
  buyer_name?: string;
  buyer_mark?: string;
}

export interface AuctionResultEntryDTO {
  bidNumber: number;
  auctionEntryId?: number | null;
  buyerId?: number | null;
  buyerMark: string;
  buyerName: string;
  rate: number;
  quantity: number;
  amount: number;
  isSelfSale?: boolean;
  isScribble?: boolean;
  presetApplied?: number;
  presetType?: PresetType;
   /** Token advance collected at auction stage for this bid (₹). */
  tokenAdvance?: number;
}

export interface AuctionResultDTO {
  auction_id: number;
  lotId: number;
  lotName: string;
  sellerName: string;
  sellerVehicleId: number;
  vehicleNumber: string;
  commodityName: string;
  auctionDatetime?: string;
  conductedBy?: string;
  completedAt?: string;
  selfSaleUnitId?: number | null;
  entries: AuctionResultEntryDTO[];
}

export interface AuctionSelfSaleContextDTO {
  self_sale_unit_id: number;
  rate: number;
  quantity: number;
  remaining_qty: number;
  amount: number;
  created_at?: string;
  previous_completed_auction_id?: number;
  previous_completed_at?: string;
  previous_entries: AuctionResultEntryDTO[];
}

export interface AuctionSelfSaleUnitDTO {
  self_sale_unit_id: number;
  lot_id: number;
  lot_name: string;
  bag_count: number;
  original_bag_count: number;
  commodity_name: string;
  seller_name: string;
  seller_mark: string;
  seller_vehicle_id: number;
  vehicle_number: string;
  self_sale_qty: number;
  remaining_qty: number;
  rate: number;
  amount: number;
  status: 'OPEN' | 'PARTIAL' | 'CLOSED';
  created_at?: string;
}

export interface ListLotsParams {
  page?: number;
  size?: number;
  sort?: string;
  status?: string;
  q?: string;
}

export interface ListResultsParams {
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
      else if (body?.title) message = body.title;
      else if (Array.isArray(body?.errors) && body.errors[0]?.message) message = body.errors[0].message;
    } else {
      const text = await res.text();
      if (text && text.length < 300) message = text;
    }
  } catch {
    // ignore
  }
  throw new Error(message);
}

export const auctionApi = {
  /** Distinct scribble (temporary) buyer marks for the trader for the current calendar day (server). */
  async listTemporaryBuyerMarksToday(): Promise<string[]> {
    const res = await apiFetch(`${BASE}/temporary-buyer-marks/today`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load temporary buyer marks');
    return res.json();
  },

  async listLots(params: ListLotsParams = {}): Promise<LotSummaryDTO[]> {
    const searchParams = new URLSearchParams();
    if (params.page != null) searchParams.set('page', String(params.page));
    if (params.size != null) searchParams.set('size', String(params.size));
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.status) searchParams.set('status', params.status);
    if (params.q) searchParams.set('q', params.q);
    const res = await apiFetch(`${BASE}/lots?${searchParams.toString()}`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load lots');
    return res.json();
  },

  async getOrStartSession(lotId: string | number): Promise<AuctionSessionDTO> {
    const id = typeof lotId === 'string' ? lotId : String(lotId);
    const res = await apiFetch(`${BASE}/lots/${encodeURIComponent(id)}/session`, { method: 'GET' });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Lot not found');
      await parseJsonOrThrow(res, 'Failed to get session');
    }
    return res.json();
  },

  async getOrStartSelfSaleSession(lotId: string | number): Promise<AuctionSessionDTO> {
    const id = typeof lotId === 'string' ? lotId : String(lotId);
    const res = await apiFetch(`${BASE}/self-sale-units/${encodeURIComponent(id)}/session`, { method: 'GET' });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Self-sale unit not found');
      await parseJsonOrThrow(res, 'Failed to get self-sale session');
    }
    return res.json();
  },

  async listSelfSaleUnits(params: ListLotsParams = {}): Promise<AuctionSelfSaleUnitDTO[]> {
    const searchParams = new URLSearchParams();
    if (params.page != null) searchParams.set('page', String(params.page));
    if (params.size != null) searchParams.set('size', String(params.size));
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.q) searchParams.set('q', params.q);
    const res = await apiFetch(`${BASE}/self-sale-units?${searchParams.toString()}`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load self-sale units');
    return res.json();
  },

  async addBid(lotId: string | number, body: AuctionBidCreateRequest): Promise<AuctionSessionDTO> {
    const id = typeof lotId === 'string' ? lotId : String(lotId);
    const res = await apiFetch(`${BASE}/lots/${encodeURIComponent(id)}/session/bids`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const err = new Error('Adding this bid exceeds lot quantity. You can retry with "Allow lot increase".') as Error & { isConflict?: boolean };
      err.isConflict = true;
      throw err;
    }
    if (!res.ok) {
      if (res.status === 404) throw new Error('Lot or session not found');
      await parseJsonOrThrow(res, 'Failed to add bid');
    }
    return res.json();
  },

  async updateBid(lotId: string | number, bidId: number, body: AuctionBidUpdateRequest): Promise<AuctionSessionDTO> {
    const id = typeof lotId === 'string' ? lotId : String(lotId);
    const res = await apiFetch(`${BASE}/lots/${encodeURIComponent(id)}/session/bids/${bidId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      let message = 'Bid update conflict';
      let field: string | undefined;
      try {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
          const errBody = await res.json();
          if (errBody?.message) message = errBody.message;
          else if (errBody?.detail) message = errBody.detail;
          if (Array.isArray(errBody?.errors) && errBody.errors[0]?.field) field = errBody.errors[0].field;
          else if (errBody?.field) field = errBody.field;
        }
      } catch {
        // ignore
      }
      const err = new Error(message) as Error & { isConflict?: boolean; isStaleBid?: boolean };
      if (field === 'stale_bid') err.isStaleBid = true;
      else err.isConflict = true;
      throw err;
    }
    if (!res.ok) {
      if (res.status === 404) throw new Error('Bid or lot not found');
      await parseJsonOrThrow(res, 'Failed to update bid');
    }
    return res.json();
  },

  async addSelfSaleBid(selfSaleUnitId: string | number, body: AuctionBidCreateRequest): Promise<AuctionSessionDTO> {
    const id = typeof selfSaleUnitId === 'string' ? selfSaleUnitId : String(selfSaleUnitId);
    const res = await apiFetch(`${BASE}/self-sale-units/${encodeURIComponent(id)}/session/bids`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const err = new Error('Adding this bid exceeds self-sale quantity.') as Error & { isConflict?: boolean };
      err.isConflict = true;
      throw err;
    }
    if (!res.ok) {
      if (res.status === 404) throw new Error('Self-sale unit or session not found');
      await parseJsonOrThrow(res, 'Failed to add self-sale bid');
    }
    return res.json();
  },

  async updateSelfSaleBid(selfSaleUnitId: string | number, bidId: number, body: AuctionBidUpdateRequest): Promise<AuctionSessionDTO> {
    const id = typeof selfSaleUnitId === 'string' ? selfSaleUnitId : String(selfSaleUnitId);
    const res = await apiFetch(`${BASE}/self-sale-units/${encodeURIComponent(id)}/session/bids/${bidId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      let message = 'Bid update conflict';
      let field: string | undefined;
      try {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
          const errBody = await res.json();
          if (errBody?.message) message = errBody.message;
          else if (errBody?.detail) message = errBody.detail;
          if (Array.isArray(errBody?.errors) && errBody.errors[0]?.field) field = errBody.errors[0].field;
          else if (errBody?.field) field = errBody.field;
        }
      } catch {
        // ignore
      }
      const err = new Error(message) as Error & { isConflict?: boolean; isStaleBid?: boolean };
      if (field === 'stale_bid') err.isStaleBid = true;
      else err.isConflict = true;
      throw err;
    }
    if (!res.ok) {
      if (res.status === 404) throw new Error('Self-sale bid or unit not found');
      await parseJsonOrThrow(res, 'Failed to update self-sale bid');
    }
    return res.json();
  },

  async deleteSelfSaleBid(selfSaleUnitId: string | number, bidId: number): Promise<AuctionSessionDTO> {
    const id = typeof selfSaleUnitId === 'string' ? selfSaleUnitId : String(selfSaleUnitId);
    const res = await apiFetch(`${BASE}/self-sale-units/${encodeURIComponent(id)}/session/bids/${bidId}`, { method: 'DELETE' });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Self-sale bid or unit not found');
      await parseJsonOrThrow(res, 'Failed to delete self-sale bid');
    }
    return res.json();
  },

  async deleteBid(lotId: string | number, bidId: number): Promise<AuctionSessionDTO> {
    const id = typeof lotId === 'string' ? lotId : String(lotId);
    const res = await apiFetch(`${BASE}/lots/${encodeURIComponent(id)}/session/bids/${bidId}`, { method: 'DELETE' });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Bid or lot not found');
      await parseJsonOrThrow(res, 'Failed to delete bid');
    }
    return res.json();
  },

  async completeAuction(lotId: string | number): Promise<AuctionResultDTO> {
    const id = typeof lotId === 'string' ? lotId : String(lotId);
    const res = await apiFetch(`${BASE}/lots/${encodeURIComponent(id)}/complete`, { method: 'POST' });
    if (res.status === 409) throw new Error('Cannot complete: quantity conflict or no bids');
    if (!res.ok) {
      if (res.status === 404) throw new Error('Lot not found');
      await parseJsonOrThrow(res, 'Failed to complete auction');
    }
    return res.json();
  },

  async completeSelfSaleAuction(selfSaleUnitId: string | number): Promise<AuctionResultDTO> {
    const id = typeof selfSaleUnitId === 'string' ? selfSaleUnitId : String(selfSaleUnitId);
    const res = await apiFetch(`${BASE}/self-sale-units/${encodeURIComponent(id)}/complete`, { method: 'POST' });
    if (res.status === 409) throw new Error('Cannot complete: quantity conflict or no bids');
    if (!res.ok) {
      if (res.status === 404) throw new Error('Self-sale unit not found');
      await parseJsonOrThrow(res, 'Failed to complete self-sale auction');
    }
    return res.json();
  },

  async listResults(params: ListResultsParams = {}): Promise<AuctionResultDTO[]> {
    const searchParams = new URLSearchParams();
    if (params.page != null) searchParams.set('page', String(params.page));
    if (params.size != null) searchParams.set('size', String(params.size));
    if (params.sort) searchParams.set('sort', params.sort);
    const res = await apiFetch(`${BASE}/results?${searchParams.toString()}`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load results');
    return res.json();
  },

  async getResultByLot(lotId: string | number): Promise<AuctionResultDTO | null> {
    const id = typeof lotId === 'string' ? lotId : String(lotId);
    const res = await apiFetch(`${BASE}/results/lots/${encodeURIComponent(id)}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load result');
    return res.json();
  },

  async getResultByBidNumber(bidNumber: number): Promise<AuctionResultDTO | null> {
    const res = await apiFetch(`${BASE}/results/bids/${bidNumber}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load result');
    return res.json();
  },
};

/**
 * Fetches all auction results (paginated) and returns a single array.
 * Use this so
 * downstream pages (Billing, Weighing, Logistics, etc.) need minimal changes.
 * Result shape is normalized to include lotId, entries[].bidNumber, etc.
 */
export async function fetchAllAuctionResults(maxPages = 50, pageSize = 100): Promise<AuctionResultDTO[]> {
  const all: AuctionResultDTO[] = [];
  let page = 0;
  while (page < maxPages) {
    const chunk = await auctionApi.listResults({
      page,
      size: pageSize,
      /** Newest first (matches server default); avoids missing today’s auctions when capped at maxPages × pageSize. */
      sort: 'completedAt,desc',
    });
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    page += 1;
  }
  return all;
}
