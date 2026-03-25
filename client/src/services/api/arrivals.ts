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
  is_multi_seller: boolean;
  loaded_weight: number;
  empty_weight: number;
  deducted_weight: number;
  freight_method: FreightMethod;
  freight_rate: number;
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
  sellerCount: number;
  lotCount: number;
  netWeight: number;
  finalBillableWeight: number;
  freightTotal: number;
  freightMethod: FreightMethod | null;
  arrivalDatetime: string;
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
  contactId?: number;
  origin?: string;
  lots: ArrivalLotDetail[];
}

/** Arrival with nested sellers/lots; mirrors backend ArrivalDetailDTO. */
export interface ArrivalDetail {
  vehicleId: number;
  vehicleNumber: string;
  arrivalDatetime: string;
  godown?: string;
  origin?: string;
  sellers: ArrivalSellerDetail[];
}

/** Full arrival detail for expand panel; mirrors backend ArrivalFullDetailDTO. */
export interface ArrivalFullDetail {
  vehicleId: number;
  vehicleNumber: string;
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
  freightTotal?: number;
  noRental?: boolean;
  advancePaid?: number;
  partiallyCompleted?: boolean;
  /** Persisted multi-seller vs single-seller mode (restored on edit). */
  multiSeller?: boolean;
  sellers: ArrivalSellerFullDetail[];
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
  freight_rate?: number;
  no_rental?: boolean;
  advance_paid?: number;
  multi_seller?: boolean;
  partially_completed?: boolean;
  sellers?: ArrivalSellerPayload[];
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

export const arrivalsApi = {
  async list(page = 0, size = 10, status?: string, partiallyCompleted?: boolean): Promise<ArrivalSummary[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('size', String(size));
    if (status && status !== 'ALL') searchParams.set('status', status);
    if (partiallyCompleted !== undefined) searchParams.set('partiallyCompleted', String(partiallyCompleted));

    const res = await apiFetch(`/arrivals?${searchParams.toString()}`, { method: 'GET' });
    const data = await handleArrivalResponse<ArrivalSummary[]>(res, 'Failed to load arrivals');
    return data;
  },

  /**
   * List arrivals with nested sellers and lots (id, lotName, sellerName) for lot-level lookup (e.g. WeighingPage).
   * Paginated; use multiple pages if you need all arrivals.
   */
  async listDetail(page = 0, size = 100): Promise<ArrivalDetail[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('size', String(size));

    const res = await apiFetch(`/arrivals/detail?${searchParams.toString()}`, { method: 'GET' });
    const data = await handleArrivalResponse<ArrivalDetail[]>(res, 'Failed to load arrival details');
    return data;
  },

  async create(payload: ArrivalCreatePayload): Promise<ArrivalSummary> {
    const body = {
      vehicleNumber: payload.vehicle_number,
      multiSeller: payload.is_multi_seller,
      loadedWeight: payload.loaded_weight,
      emptyWeight: payload.empty_weight,
      deductedWeight: payload.deducted_weight,
      freightMethod: payload.freight_method,
      freightRate: payload.freight_rate,
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
    if (payload.godown !== undefined) body.godown = payload.godown;
    if (payload.gatepass_number !== undefined) body.gatepassNumber = payload.gatepass_number;
    if (payload.origin !== undefined) body.origin = payload.origin;
    if (payload.broker_name !== undefined) body.brokerName = payload.broker_name;
    if (payload.broker_contact_id !== undefined) body.brokerContactId = payload.broker_contact_id;
    if (payload.narration !== undefined) body.narration = payload.narration;
    if (payload.loaded_weight !== undefined) body.loadedWeight = payload.loaded_weight;
    if (payload.empty_weight !== undefined) body.emptyWeight = payload.empty_weight;
    if (payload.deducted_weight !== undefined) body.deductedWeight = payload.deducted_weight;
    if (payload.freight_method !== undefined) body.freightMethod = payload.freight_method;
    if (payload.freight_rate !== undefined) body.freightRate = payload.freight_rate;
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
    if (!res.ok) {
      await handleArrivalResponse<never>(res, 'Failed to delete arrival');
    }
  },
};

