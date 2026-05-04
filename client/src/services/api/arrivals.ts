import { apiFetch } from './http';
import type { FreightMethod } from '@/types/models';

export interface ArrivalLotPayload {
  lot_name: string;
  lot_serial_number?: number;
  quantity: number;
  commodity_name: string;
  broker_tag?: string;
  variant?: string;
}

/** When from contact: contact_id set. When free-text: contact_id null/omitted, seller_name + seller_phone required. */
export interface ArrivalSellerPayload {
  contact_id?: number | null;
  seller_serial_number?: number;
  seller_name: string;
  seller_phone: string;
  seller_mark?: string;
  lots: ArrivalLotPayload[];
}

export interface ArrivalCreatePayload {
  vehicle_number?: string;
  /** Optional global-unique mark/alias: letters/digits only, max 8 chars; omit or empty = unset. */
  vehicle_mark_alias?: string;
  is_multi_seller: boolean;
  loaded_weight: number;
  empty_weight: number;
  deducted_weight: number;
  freight_method: FreightMethod;
  freight_mode?: FreightMethod;
  freight_rate: number;
  freight_kgs?: number;
  no_rental: boolean;
  advance_paid: number;
  broker_name?: string;
  broker_contact_id?: number;
  narration?: string;
  godown?: string;
  gatepass_number?: string;
  origin?: string;
  sellers: ArrivalSellerPayload[];
  partially_completed?: boolean;
}

/**
 * Mirrors backend ArrivalSummaryDTO (camelCase fields).
 */
export interface ArrivalSummary {
  vehicleId: string | number;
  vehicleNumber: string;
  vehicleMarkAlias?: string | null;
  sellerCount: number;
  lotCount: number;
  netWeight: number;
  finalBillableWeight: number;
  freightTotal: number;
  freightMethod: FreightMethod | null;
  arrivalDatetime: string;
  /** From server auditing; list uses this so edited rows surface first */
  lastModifiedDate?: string;
  godown?: string;
  gatepassNumber?: string;
  origin?: string;
  /** First seller name for table: vehicle | seller name */
  primarySellerName?: string;
  /** Total bags across all lots of this arrival */
  totalBags?: number;
  /** Number of lots with at least one bid */
  bidsCount?: number;
  /** Number of lots with a weighing session */
  weighedCount?: number;
  /** Whether this is a partially completed (draft) record */
  partiallyCompleted?: boolean;
}

/** Lot in arrival detail (id for lot lookup, e.g. WeighingPage bid enrichment). */
export interface ArrivalLotDetail {
  id: number;
  lotName: string;
}

/** Seller in arrival detail. */
export interface ArrivalSellerDetail {
  sellerName: string;
  sellerMark?: string;
  contactId?: number;
  origin?: string;
  lots: ArrivalLotDetail[];
}

/** Arrival with nested sellers/lots; mirrors backend ArrivalDetailDTO. */
export interface ArrivalDetail {
  vehicleId: number;
  vehicleNumber: string;
  vehicleMarkAlias?: string | null;
  arrivalDatetime: string;
  godown?: string;
  origin?: string;
  sellers: ArrivalSellerDetail[];
}

/** Full arrival detail for expand panel; mirrors backend ArrivalFullDetailDTO. */
export interface ArrivalFullDetail {
  vehicleId: number;
  vehicleNumber: string;
  vehicleMarkAlias?: string | null;
  arrivalDatetime: string;
  godown?: string;
  gatepassNumber?: string;
  origin?: string;
  brokerName?: string;
  brokerContactId?: number;
  narration?: string;
  loadedWeight?: number;
  emptyWeight?: number;
  deductedWeight?: number;
  netWeight?: number;
  freightMethod?: FreightMethod | null;
  freightRate?: number;
  freightKgs?: number;
  freightTotal?: number;
  noRental?: boolean;
  advancePaid?: number;
  partiallyCompleted?: boolean;
  /** Persisted multi-seller vs single-seller mode (restored on edit). */
  multiSeller?: boolean;
  sellers: ArrivalSellerFullDetail[];
  /** Server-side reasons delete is blocked; enum names (e.g. `BILLING`). */
  deleteBlockers?: string[];
}

export interface ArrivalLotFullDetail {
  id: number;
  lotName: string;
  lotSerialNumber?: number | null;
  commodityName: string;
  bagCount: number;
  brokerTag?: string | null;
  variant?: string | null;
}

export interface ArrivalSellerFullDetail {
  contactId?: number;
  sellerSerialNumber?: number | null;
  sellerName: string;
  sellerPhone?: string;
  sellerMark?: string;
  lots: ArrivalLotFullDetail[];
}

/** PATCH body for updating arrival (all fields optional). When sellers present, replaces all sellers/lots. */
export interface ArrivalUpdatePayload {
  vehicle_number?: string;
  /** Send empty string to clear. Omit property to leave unchanged. */
  vehicle_mark_alias?: string;
  godown?: string;
  gatepass_number?: string;
  origin?: string;
  broker_name?: string;
  broker_contact_id?: number;
  narration?: string;
  loaded_weight?: number;
  empty_weight?: number;
  deducted_weight?: number;
  freight_method?: FreightMethod;
  freight_mode?: FreightMethod;
  freight_rate?: number;
  freight_kgs?: number;
  no_rental?: boolean;
  advance_paid?: number;
  multi_seller?: boolean;
  partially_completed?: boolean;
  sellers?: ArrivalSellerPayload[];
}

export class ArrivalDeletionBlockedError extends Error {
  readonly blockers: string[];

  constructor(message: string, blockers: string[]) {
    super(message);
    this.name = 'ArrivalDeletionBlockedError';
    this.blockers = blockers;
  }
}

/** Human-readable list for tooltips (English). */
export function formatArrivalDeletionBlockerCodes(codes: string[]): string {
  const labels: Record<string, string> = {
    BILLING: 'Billing',
    AUCTION_SELF_SALE: 'Auction self-sale',
    SELF_SALE_CLOSURE: 'Self-sale closure',
    CDN: 'CDN',
    STOCK_PURCHASE: 'Stock purchase',
    WEIGHING: 'Weighing',
    WRITER_PAD: 'Writer pad',
  };
  return codes.map(c => labels[c] ?? c).join(', ');
}

async function handleArrivalResponse<T>(res: Response, defaultMessage: string): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }

  let message = defaultMessage;
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      const problem = await res.json();
      if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
        message = problem.detail;
      } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
        message = problem.title;
      }
    } else {
      const text = await res.text();
      if (text && text.length < 200) {
        message = text;
      }
    }
  } catch {
    // ignore parse errors
  }
  throw new Error(message);
}

function readTotalCount(res: Response, fallback: number): number {
  const raw = res.headers.get('X-Total-Count');
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Paginated list response with Spring `X-Total-Count` (progressive load). */
export interface ArrivalPagedResult<T> {
  items: T[];
  totalElements: number;
}

export interface ListArrivalsPageParams {
  page?: number;
  size?: number;
  /** Stable sort for paging, e.g. `arrivalDatetime,desc`. */
  sort?: string;
  status?: string;
  partiallyCompleted?: boolean;
}

export interface ListArrivalDetailPageParams {
  page?: number;
  size?: number;
  sort?: string;
}

export const arrivalsApi = {
  async list(page = 0, size = 10, status?: string, partiallyCompleted?: boolean): Promise<ArrivalSummary[]> {
    const { items } = await arrivalsApi.listPage({ page, size, status, partiallyCompleted });
    return items;
  },

  /**
   * One page of arrival summaries plus total from `X-Total-Count` (fallback: items.length).
   */
  async listPage(
    params: ListArrivalsPageParams = {},
    init?: RequestInit
  ): Promise<ArrivalPagedResult<ArrivalSummary>> {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(params.page ?? 0));
    searchParams.set('size', String(params.size ?? 10));
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.status && params.status !== 'ALL') searchParams.set('status', params.status);
    if (params.partiallyCompleted !== undefined) searchParams.set('partiallyCompleted', String(params.partiallyCompleted));

    const res = await apiFetch(`/arrivals?${searchParams.toString()}`, { method: 'GET', ...init });
    const data = await handleArrivalResponse<ArrivalSummary[]>(res, 'Failed to load arrivals');
    return { items: data, totalElements: readTotalCount(res, data.length) };
  },

  /**
   * List arrivals with nested sellers and lots (id, lotName, sellerName) for lot-level lookup (e.g. WeighingPage).
   * Paginated; use multiple pages if you need all arrivals.
   */
  async listDetail(page = 0, size = 100): Promise<ArrivalDetail[]> {
    const { items } = await arrivalsApi.listDetailPage({ page, size });
    return items;
  },

  /**
   * One page of arrival detail rows plus total from `X-Total-Count` (fallback: items.length).
   */
  async listDetailPage(
    params: ListArrivalDetailPageParams = {},
    init?: RequestInit
  ): Promise<ArrivalPagedResult<ArrivalDetail>> {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(params.page ?? 0));
    searchParams.set('size', String(params.size ?? 100));
    if (params.sort) searchParams.set('sort', params.sort);

    const res = await apiFetch(`/arrivals/detail?${searchParams.toString()}`, { method: 'GET', ...init });
    const data = await handleArrivalResponse<ArrivalDetail[]>(res, 'Failed to load arrival details');
    return { items: data, totalElements: readTotalCount(res, data.length) };
  },

  async create(payload: ArrivalCreatePayload): Promise<ArrivalSummary> {
    const body = {
      vehicleNumber: payload.vehicle_number,
      vehicleMarkAlias: payload.vehicle_mark_alias,
      multiSeller: payload.is_multi_seller,
      loadedWeight: payload.loaded_weight,
      emptyWeight: payload.empty_weight,
      deductedWeight: payload.deducted_weight,
      freightMethod: payload.freight_mode ?? payload.freight_method,
      freightRate: payload.freight_rate,
      freightKgs: payload.freight_kgs,
      noRental: payload.no_rental,
      advancePaid: payload.advance_paid,
      brokerName: payload.broker_name,
      brokerContactId: payload.broker_contact_id,
      narration: payload.narration,
      godown: payload.godown,
      gatepassNumber: payload.gatepass_number,
      origin: payload.origin,
      partiallyCompleted: payload.partially_completed ?? false,
      sellers: payload.sellers.map(s => ({
        contactId: s.contact_id !== undefined && s.contact_id !== null ? s.contact_id : null,
        sellerSerialNumber: s.seller_serial_number,
        sellerName: s.seller_name,
        sellerPhone: s.seller_phone,
        sellerMark: s.seller_mark,
        lots: s.lots.map(l => ({
          lotName: l.lot_name,
          lotSerialNumber: l.lot_serial_number,
          bagCount: l.quantity,
          commodityName: l.commodity_name,
          brokerTag: l.broker_tag,
          variant: l.variant,
        })),
      })),
    };

    const path = payload.partially_completed ? '/arrivals/partial' : '/arrivals';

    const res = await apiFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const created = await handleArrivalResponse<ArrivalSummary>(res, 'Failed to submit arrival');
    return created;
  },

  async getById(vehicleId: number | string): Promise<ArrivalFullDetail> {
    const res = await apiFetch(`/arrivals/${vehicleId}`, { method: 'GET' });
    return handleArrivalResponse<ArrivalFullDetail>(res, 'Failed to load arrival detail');
  },

  async update(vehicleId: number | string, payload: ArrivalUpdatePayload): Promise<ArrivalSummary> {
    const body: Record<string, unknown> = {};
    if (payload.vehicle_number !== undefined) body.vehicleNumber = payload.vehicle_number;
    if (payload.vehicle_mark_alias !== undefined) body.vehicleMarkAlias = payload.vehicle_mark_alias;
    if (payload.godown !== undefined) body.godown = payload.godown;
    if (payload.gatepass_number !== undefined) body.gatepassNumber = payload.gatepass_number;
    if (payload.origin !== undefined) body.origin = payload.origin;
    if (payload.broker_name !== undefined) body.brokerName = payload.broker_name;
    if (payload.broker_contact_id !== undefined) body.brokerContactId = payload.broker_contact_id;
    if (payload.narration !== undefined) body.narration = payload.narration;
    if (payload.loaded_weight !== undefined) body.loadedWeight = payload.loaded_weight;
    if (payload.empty_weight !== undefined) body.emptyWeight = payload.empty_weight;
    if (payload.deducted_weight !== undefined) body.deductedWeight = payload.deducted_weight;
    if (payload.freight_mode !== undefined || payload.freight_method !== undefined) {
      body.freightMethod = payload.freight_mode ?? payload.freight_method;
    }
    if (payload.freight_rate !== undefined) body.freightRate = payload.freight_rate;
    if (payload.freight_kgs !== undefined) body.freightKgs = payload.freight_kgs;
    if (payload.no_rental !== undefined) body.noRental = payload.no_rental;
    if (payload.advance_paid !== undefined) body.advancePaid = payload.advance_paid;
    if (payload.multi_seller !== undefined) body.multiSeller = payload.multi_seller;
    if (payload.partially_completed !== undefined) body.partiallyCompleted = payload.partially_completed;
    if (payload.sellers !== undefined && payload.sellers.length > 0) {
      body.sellers = payload.sellers.map(s => ({
        contactId: s.contact_id !== undefined && s.contact_id !== null ? s.contact_id : null,
        sellerSerialNumber: s.seller_serial_number,
        sellerName: s.seller_name,
        sellerPhone: s.seller_phone,
        sellerMark: s.seller_mark,
        lots: s.lots.map(l => ({
          lotName: l.lot_name,
          lotSerialNumber: l.lot_serial_number,
          bagCount: l.quantity,
          commodityName: l.commodity_name,
          brokerTag: l.broker_tag,
          variant: l.variant,
        })),
      }));
    }
    const res = await apiFetch(`/arrivals/${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return handleArrivalResponse<ArrivalSummary>(res, 'Failed to update arrival');
  },

  async delete(vehicleId: number | string): Promise<void> {
    const res = await apiFetch(`/arrivals/${vehicleId}`, { method: 'DELETE' });
    if (res.ok) return;
    let message = 'Failed to delete arrival';
    let blockers: string[] = [];
    try {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
        const problem: { detail?: unknown; title?: unknown; blockers?: unknown } = await res.json();
        if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
          message = problem.detail.trim();
        } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
          message = problem.title.trim();
        }
        if (Array.isArray(problem.blockers)) {
          blockers = problem.blockers.filter((x): x is string => typeof x === 'string');
        }
      }
    } catch {
      // ignore parse errors
    }
    if (res.status === 409 && blockers.length > 0) {
      throw new ArrivalDeletionBlockedError(message, blockers);
    }
    throw new Error(message);
  },
};

