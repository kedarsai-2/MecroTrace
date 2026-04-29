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
  pattiBaseNumber?: string;
  sellerSequenceNumber?: number;
  sellerId?: string;
  sellerName: string;
  vehicleNumber?: string;
  fromLocation?: string;
  sellerSerialNo?: number | string;
  date?: string;
  rateClusters: RateClusterDTO[];
  grossAmount: number;
  deductions: DeductionItemDTO[];
  totalDeductions: number;
  netPayable: number;
  createdAt: string;
  useAverageWeight?: boolean;
  inProgress?: boolean;
  /** Optional JSON: per-seller lot overrides and removed lot ids (see SettlementPage extension v1). */
  extensionJson?: string;
  /** Parsed first-open snapshot (from original_snapshot_json). */
  originalData?: Record<string, unknown>;
}

export interface PattiSaveRequest {
  sellerId?: string;
  pattiBaseNumber?: string;
  sellerSequenceNumber?: number;
  sellerName: string;
  rateClusters: RateClusterDTO[];
  grossAmount: number;
  deductions: DeductionItemDTO[];
  totalDeductions: number;
  netPayable: number;
  useAverageWeight?: boolean;
  inProgress?: boolean;
  extensionJson?: string;
  /** Set on first create/update when server has no original snapshot yet (JSON string of patti body). */
  originalSnapshotJson?: string;
}

export interface SettlementEntryDTO {
  bidNumber: number;
  buyerMark: string;
  buyerName: string;
  /** Auction base bid per bag */
  rate: number;
  /** Vehicle-ops final per-bag rate (incl. pad preset). Modified settlement does not add preset again. */
  summarySellerRate?: number;
  /** Preset from auction (signed). Original settlement = rate + preset; not added on top of summarySellerRate. */
  presetMargin?: number;
  quantity: number;
  weight: number;
}

export interface SettlementLotDTO {
  lotId: string;
  lotName: string;
  commodityName: string;
  /** Arrivals: lot bag count (`lot.bag_count`). */
  arrivalBagCount?: number;
  /** Σ billing line weights for this lot (Sales bill), when invoiced. */
  billingWeightKg?: number;
  entries: SettlementEntryDTO[];
}

export interface SellerSettlementDTO {
  sellerId: string;
  sellerName: string;
  sellerMark: string;
  /** Arrivals `vehicle.id` — load freight via GET /arrivals/:id without list scan. */
  vehicleId?: number;
  vehicleNumber: string;
  /** Arrivals: Σ bag counts for this seller's lots. */
  arrivalTotalBags?: number;
  /** Arrivals: vehicle net billable kg (net − deducted) from weighing; shared across sellers on same vehicle. */
  vehicleArrivalNetBillableKg?: number;
  /** Billing: Σ line weights in sales bills for this seller's lots (commodity groups). */
  billingNetWeightKg?: number;
  /** Linked contact (seller_in_vehicle.contact_id), when registered. */
  contactId?: string | null;
  /** Phone from contact or free-text seller phone. */
  sellerPhone?: string | null;
  fromLocation?: string;
  sellerSerialNo?: number | string;
  date?: string;
  lots: SettlementLotDTO[];
}

/** Response from linking a settlement seller to a contact. */
export interface SellerRegistrationDTO {
  sellerId: string;
  contactId: string;
  sellerName: string;
  sellerMark: string;
  sellerPhone: string;
}

export interface SellerReplacementDTO {
  sellerId: string;
  contactId?: string | null;
  sellerName: string;
  sellerMark: string;
  sellerPhone: string;
}

export interface SellerChargesDTO {
  freight: number;
  advance: number;
  freightAutoPulled?: boolean;
  advanceAutoPulled?: boolean;
}

/** Server-computed lines for Sales Patti (no client-side recomputation for display). */
export interface SellerExpenseSnapshotDTO {
  freight: number;
  unloading: number;
  weighing: number;
  cashAdvance: number;
  freightAutoPulled?: boolean;
  unloadingAutoPulled?: boolean;
  weighingAutoPulled?: boolean;
  /** When true, show Journal-module pending tooltip on cash advance. */
  cashAdvanceJournalPending?: boolean;
}

/** Amount card: Arrivals freight + billing (sales bill) aggregates for this seller's lots. */
export interface SettlementAmountSummaryDTO {
  arrivalFreightAmount: number;
  freightInvoiced: number;
  payableInvoiced: number;
}

export interface QuickExpenseStateRowInputDTO {
  sellerId: string;
  freight: number;
  unloading: number;
  weighing: number;
  gunnies: number;
}

export interface QuickExpenseStateRowDTO {
  sellerId: string;
  freightOriginal: number;
  unloadingOriginal: number;
  weighingOriginal: number;
  gunniesOriginal: number;
  freightCurrent: number;
  unloadingCurrent: number;
  weighingCurrent: number;
  gunniesCurrent: number;
}

export interface SettlementVoucherTempCreateRequestDTO {
  voucherName: string;
  forWhoName?: string;
  description?: string;
  expenseAmount: number;
}

export interface SettlementVoucherTempDTO {
  id: number;
  sellerId: string;
  voucherName: string;
  forWhoName?: string;
  description?: string;
  expenseAmount: number;
  createdAt?: string;
}

export interface SettlementVoucherTempUpsertRowDTO {
  id?: number;
  voucherName: string;
  forWhoName?: string;
  description?: string;
  expenseAmount: number;
}

export interface SettlementVoucherTempListResponseDTO {
  rows: SettlementVoucherTempDTO[];
  totalExpenseAmount: number;
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
  /** Reserve next Sales Patti base number (commodity prefix when available). */
  async reserveNextPattiBaseNumber(sellerId?: string): Promise<string> {
    const q = new URLSearchParams();
    if (sellerId != null && sellerId.trim() !== '') q.set('sellerId', sellerId.trim());
    const res = await apiFetch(`${BASE}/pattis/next-base-number${q.toString() ? `?${q.toString()}` : ''}`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to reserve patti base number');
    return (await res.text()).trim();
  },

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

  /** List in-progress pattis (paginated). */
  async listInProgressPattis(params: ListPattisParams = {}): Promise<PattiDTO[]> {
    const q = new URLSearchParams();
    if (params.page != null) q.set('page', String(params.page));
    if (params.size != null) q.set('size', String(params.size));
    if (params.sort) q.set('sort', params.sort);
    const res = await apiFetch(`${BASE}/pattis/in-progress?${q}`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load in-progress pattis');
    return res.json();
  },

  /** Create patti. Server generates pattiId as base-sequence (e.g. 2255-1). */
  async createPatti(body: PattiSaveRequest): Promise<PattiDTO> {
    const res = await apiFetch(`${BASE}/pattis`, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to save patti');
    const dto = await res.json();
    if (dto.createdAt) dto.createdAt = typeof dto.createdAt === 'string' ? dto.createdAt : new Date(dto.createdAt).toISOString();
    return dto;
  },

  /** Get patti by database id. */
  async getPattiById(id: number): Promise<PattiDTO | null> {
    const res = await apiFetch(`${BASE}/pattis/${id}?_=${Date.now()}`, { method: 'GET' });
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

  /** Freight (bag share), unloading/weighing (commodity slabs), cash advance — all computed server-side. */
  async getSellerExpenseSnapshot(sellerId: string): Promise<SellerExpenseSnapshotDTO> {
    const res = await apiFetch(`${BASE}/sellers/${encodeURIComponent(sellerId)}/expense-snapshot`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load seller expense snapshot');
    const data = await res.json();
    return {
      freight: Number(data.freight ?? 0),
      unloading: Number(data.unloading ?? 0),
      weighing: Number(data.weighing ?? 0),
      cashAdvance: Number(data.cashAdvance ?? 0),
      freightAutoPulled: Boolean(data.freightAutoPulled),
      unloadingAutoPulled: Boolean(data.unloadingAutoPulled),
      weighingAutoPulled: Boolean(data.weighingAutoPulled),
      cashAdvanceJournalPending: Boolean(data.cashAdvanceJournalPending),
    };
  },

  /** Freight / payable invoiced totals from sales bills for this seller's lots; optional invoice name filter. */
  async getSettlementAmountSummary(sellerId: string, invoiceName?: string): Promise<SettlementAmountSummaryDTO> {
    const q = new URLSearchParams();
    if (invoiceName != null && invoiceName.trim() !== '') q.set('invoiceName', invoiceName.trim());
    const qs = q.toString();
    const res = await apiFetch(
      `${BASE}/sellers/${encodeURIComponent(sellerId)}/amount-summary${qs ? `?${qs}` : ''}`,
      { method: 'GET' }
    );
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load settlement amount summary');
    const data = await res.json();
    return {
      arrivalFreightAmount: Number(data.arrivalFreightAmount ?? 0),
      freightInvoiced: Number(data.freightInvoiced ?? 0),
      payableInvoiced: Number(data.payableInvoiced ?? 0),
    };
  },

  async hydrateQuickExpenseState(rows: QuickExpenseStateRowInputDTO[]): Promise<QuickExpenseStateRowDTO[]> {
    const res = await apiFetch(`${BASE}/quick-expenses/hydrate`, {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to hydrate quick expense state');
    const data = await res.json();
    const list = Array.isArray(data?.rows) ? data.rows : [];
    return list.map((r: Record<string, unknown>) => ({
      sellerId: String(r.sellerId ?? ''),
      freightOriginal: Number(r.freightOriginal ?? 0),
      unloadingOriginal: Number(r.unloadingOriginal ?? 0),
      weighingOriginal: Number(r.weighingOriginal ?? 0),
      gunniesOriginal: Number(r.gunniesOriginal ?? 0),
      freightCurrent: Number(r.freightCurrent ?? 0),
      unloadingCurrent: Number(r.unloadingCurrent ?? 0),
      weighingCurrent: Number(r.weighingCurrent ?? 0),
      gunniesCurrent: Number(r.gunniesCurrent ?? 0),
    }));
  },

  async saveQuickExpenseState(rows: QuickExpenseStateRowInputDTO[]): Promise<QuickExpenseStateRowDTO[]> {
    const res = await apiFetch(`${BASE}/quick-expenses/save`, {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to save quick expense state');
    const data = await res.json();
    const list = Array.isArray(data?.rows) ? data.rows : [];
    return list.map((r: Record<string, unknown>) => ({
      sellerId: String(r.sellerId ?? ''),
      freightOriginal: Number(r.freightOriginal ?? 0),
      unloadingOriginal: Number(r.unloadingOriginal ?? 0),
      weighingOriginal: Number(r.weighingOriginal ?? 0),
      gunniesOriginal: Number(r.gunniesOriginal ?? 0),
      freightCurrent: Number(r.freightCurrent ?? 0),
      unloadingCurrent: Number(r.unloadingCurrent ?? 0),
      weighingCurrent: Number(r.weighingCurrent ?? 0),
      gunniesCurrent: Number(r.gunniesCurrent ?? 0),
    }));
  },

  /** Link settlement seller (seller_in_vehicle id) to an existing registered contact. */
  async linkSellerContact(sellerId: string, contactId: string | number): Promise<SellerRegistrationDTO> {
    const res = await apiFetch(`${BASE}/sellers/${encodeURIComponent(sellerId)}/contact`, {
      method: 'PUT',
      body: JSON.stringify({ contactId: Number(contactId) }),
    });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to link seller to contact');
    const data = await res.json();
    return {
      sellerId: String(data.sellerId ?? sellerId),
      contactId: String(data.contactId ?? contactId),
      sellerName: String(data.sellerName ?? ''),
      sellerMark: String(data.sellerMark ?? ''),
      sellerPhone: String(data.sellerPhone ?? ''),
    };
  },

  /** Replace current settlement seller identity from another settlement seller row. */
  async replaceSellerFromSeller(sourceSellerId: string, replacementSellerId: string): Promise<SellerReplacementDTO> {
    const res = await apiFetch(`${BASE}/sellers/${encodeURIComponent(sourceSellerId)}/replace`, {
      method: 'PUT',
      body: JSON.stringify({ replacementSellerId }),
    });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to replace seller');
    const data = await res.json();
    return {
      sellerId: String(data.sellerId ?? sourceSellerId),
      contactId: data.contactId != null ? String(data.contactId) : null,
      sellerName: String(data.sellerName ?? ''),
      sellerMark: String(data.sellerMark ?? ''),
      sellerPhone: String(data.sellerPhone ?? ''),
    };
  },

  async createTemporaryVoucher(
    sellerId: string,
    body: SettlementVoucherTempCreateRequestDTO
  ): Promise<SettlementVoucherTempDTO> {
    const res = await apiFetch(`${BASE}/sellers/${encodeURIComponent(sellerId)}/vouchers/temp`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to save voucher');
    const data = await res.json();
    return {
      id: Number(data.id ?? 0),
      sellerId: String(data.sellerId ?? sellerId),
      voucherName: String(data.voucherName ?? ''),
      forWhoName: data.forWhoName != null ? String(data.forWhoName) : undefined,
      description: data.description != null ? String(data.description) : undefined,
      expenseAmount: Number(data.expenseAmount ?? 0),
      createdAt: data.createdAt != null ? String(data.createdAt) : undefined,
    };
  },

  async listTemporaryVouchers(sellerId: string): Promise<SettlementVoucherTempListResponseDTO> {
    const res = await apiFetch(`${BASE}/sellers/${encodeURIComponent(sellerId)}/vouchers/temp`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load vouchers');
    const data = await res.json();
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return {
      rows: rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id ?? 0),
        sellerId: String(r.sellerId ?? sellerId),
        voucherName: String(r.voucherName ?? ''),
        forWhoName: r.forWhoName != null ? String(r.forWhoName) : undefined,
        description: r.description != null ? String(r.description) : undefined,
        expenseAmount: Number(r.expenseAmount ?? 0),
        createdAt: r.createdAt != null ? String(r.createdAt) : undefined,
      })),
      totalExpenseAmount: Number(data?.totalExpenseAmount ?? 0),
    };
  },

  async saveTemporaryVouchers(
    sellerId: string,
    rows: SettlementVoucherTempUpsertRowDTO[]
  ): Promise<SettlementVoucherTempListResponseDTO> {
    const res = await apiFetch(`${BASE}/sellers/${encodeURIComponent(sellerId)}/vouchers/temp`, {
      method: 'PUT',
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to save vouchers');
    const data = await res.json();
    const outRows = Array.isArray(data?.rows) ? data.rows : [];
    return {
      rows: outRows.map((r: Record<string, unknown>) => ({
        id: Number(r.id ?? 0),
        sellerId: String(r.sellerId ?? sellerId),
        voucherName: String(r.voucherName ?? ''),
        forWhoName: r.forWhoName != null ? String(r.forWhoName) : undefined,
        description: r.description != null ? String(r.description) : undefined,
        expenseAmount: Number(r.expenseAmount ?? 0),
        createdAt: r.createdAt != null ? String(r.createdAt) : undefined,
      })),
      totalExpenseAmount: Number(data?.totalExpenseAmount ?? 0),
    };
  },
};
