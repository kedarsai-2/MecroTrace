import type { Commodity } from '@/types/models';
import { apiFetch } from './http';

type CommodityDto = {
  commodity_id?: string | number;
  id?: string | number;
  trader_id?: string | number | null;
  traderId?: string | number | null;
  commodity_name?: string;
  created_at?: string;
  createdAt?: string;
};

/** API response/request for full commodity config (all stored in DB with audit) */
export type FullCommodityConfigDto = {
  commodityId: number;
  config?: {
    id?: number;
    commodityId: number;
    ratePerUnit: number;
    minWeight: number;
    maxWeight: number;
    govtDeductionEnabled: boolean;
    roundoffEnabled: boolean;
    commissionPercent: number;
    userFeePercent: number;
    hsnCode?: string;
    weighingCharge?: number;
    billPrefix?: string;
    hamaliEnabled: boolean;
    gstRate?: number;
    sgstRate?: number;
    cgstRate?: number;
    igstRate?: number;
    weighingThreshold?: number;
    createdBy?: string;
    createdDate?: string;
    lastModifiedBy?: string;
    lastModifiedDate?: string;
  };
  deductionRules?: Array<{
    id?: number;
    commodityId: number;
    minWeight: number;
    maxWeight: number;
    deductionValue: number;
    createdBy?: string;
    createdDate?: string;
    lastModifiedBy?: string;
    lastModifiedDate?: string;
  }>;
  hamaliSlabs?: Array<{
    id?: number;
    commodityId: number;
    thresholdWeight: number;
    fixedRate: number;
    perKgRate: number;
    createdBy?: string;
    createdDate?: string;
    lastModifiedBy?: string;
    lastModifiedDate?: string;
  }>;
  dynamicCharges?: Array<{
    id?: number;
    commodityId: number;
    traderId?: number;
    chargeName: string;
    chargeType: string;
    valueAmount: number;
    appliesTo: string;
    percentBasis?: string;
    fixedBasis?: string;
    createdBy?: string;
    createdDate?: string;
    lastModifiedBy?: string;
    lastModifiedDate?: string;
  }>;
};

function mapDtoToCommodity(dto: CommodityDto): Commodity {
  const commodityId = dto.commodity_id ?? dto.id;
  const traderId = dto.trader_id ?? dto.traderId ?? '';

  return {
    commodity_id: String(commodityId ?? ''),
    trader_id: String(traderId ?? ''),
    commodity_name: dto.commodity_name ?? '',
    created_at: dto.created_at ?? dto.createdAt ?? new Date().toISOString(),
  };
}

function mapCommodityToCreatePayload(data: Partial<Commodity>): Record<string, unknown> {
  return {
    commodity_name: data.commodity_name?.trim() ?? '',
    trader_id: data.trader_id && data.trader_id.length > 0 ? data.trader_id : undefined,
  };
}

function mapCommodityToUpdatePayload(id: string, data: Partial<Commodity>): Record<string, unknown> {
  return {
    commodity_id: id,
    commodity_name: data.commodity_name?.trim() ?? '',
  };
}

/** Error with optional errorKey from API problem body (e.g. commoditynameexistsinactive). */
export class CommodityApiError extends Error {
  errorKey?: string;
  constructor(message: string, errorKey?: string) {
    super(message);
    this.name = 'CommodityApiError';
    this.errorKey = errorKey;
  }
}

async function handleResponse<T>(res: Response, defaultMessage: string): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }

  let message = defaultMessage;
  let errorKey: string | undefined;
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      const problem = await res.json() as { detail?: string; title?: string; message?: string };
      if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
        message = problem.detail;
      } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
        message = problem.title;
      }
      if (typeof problem.message === 'string' && problem.message.startsWith('error.')) {
        errorKey = problem.message.replace(/^error\./, '');
      }
    } else {
      const text = await res.text();
      if (text && text.length < 200) {
        message = text;
      }
    }
  } catch {
    // ignore parse errors and keep default message
  }
  throw new CommodityApiError(message, errorKey);
}

export const commodityApi = {
  async list(): Promise<Commodity[]> {
    const res = await apiFetch('/commodities', {
      method: 'GET',
    });
    const data = await handleResponse<CommodityDto[]>(res, 'Failed to load commodities');
    return data.map(mapDtoToCommodity);
  },

  async adminList(): Promise<Commodity[]> {
    const res = await apiFetch('/admin/commodities', {
      method: 'GET',
    });
    const data = await handleResponse<CommodityDto[]>(res, 'Failed to load commodities');
    return data.map(mapDtoToCommodity);
  },

  async create(data: Partial<Commodity>): Promise<Commodity> {
    const res = await apiFetch('/commodities', {
      method: 'POST',
      body: JSON.stringify(mapCommodityToCreatePayload(data)),
    });
    const created = await handleResponse<CommodityDto>(res, 'Failed to add commodity');
    return mapDtoToCommodity(created);
  },

  /** Get commodity by name (active or inactive) for restore flow. Returns null if 404. */
  async getByName(name: string): Promise<Commodity | null> {
    const res = await apiFetch(`/commodities/by-name?name=${encodeURIComponent(name)}`, { method: 'GET' });
    if (res.status === 404) return null;
    const data = await handleResponse<CommodityDto>(res, 'Failed to load commodity');
    return mapDtoToCommodity(data);
  },

  /** Restore a soft-deleted commodity (set active = true). */
  async restore(commodityId: string): Promise<Commodity> {
    const res = await apiFetch(`/commodities/${encodeURIComponent(commodityId)}/restore`, { method: 'PATCH' });
    const data = await handleResponse<CommodityDto>(res, 'Failed to restore commodity');
    return mapDtoToCommodity(data);
  },

  async update(itemId: string, data: Partial<Commodity>): Promise<Commodity> {
    const res = await apiFetch(`/commodities/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      body: JSON.stringify(mapCommodityToUpdatePayload(itemId, data)),
    });
    const updated = await handleResponse<CommodityDto>(res, 'Failed to update commodity');
    return mapDtoToCommodity(updated);
  },

  async remove(itemId: string): Promise<void> {
    const res = await apiFetch(`/commodities/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      await handleResponse<unknown>(res, 'Failed to delete commodity');
    }
  },

  /** Get full config for all commodities (for billing/weighing pages). */
  async getAllFullConfigs(): Promise<FullCommodityConfigDto[]> {
    const res = await apiFetch('/commodities/full-configs', { method: 'GET' });
    const list = await handleResponse<Record<string, unknown>[]>(res, 'Failed to load configs');
    return list.map((raw) => mapFullConfigFromApi(raw));
  },

  /** Get full config (config, deduction rules, hamali slabs, dynamic charges) from DB. */
  async getFullConfig(commodityId: string): Promise<FullCommodityConfigDto> {
    const res = await apiFetch(`/commodities/${encodeURIComponent(commodityId)}/full-config`, {
      method: 'GET',
    });
    const raw = await handleResponse<Record<string, unknown>>(res, 'Failed to load commodity config');
    return mapFullConfigFromApi(raw);
  },

  /** Save full config to DB (replaces existing). All fields stored with audit. */
  async saveFullConfig(commodityId: string, payload: FullCommodityConfigDto): Promise<FullCommodityConfigDto> {
    const body = mapFullConfigToApi(payload);
    const res = await apiFetch(`/commodities/${encodeURIComponent(commodityId)}/full-config`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    const raw = await handleResponse<Record<string, unknown>>(res, 'Failed to save commodity config');
    return mapFullConfigFromApi(raw);
  },
};

function mapFullConfigFromApi(raw: Record<string, unknown>): FullCommodityConfigDto {
  const config = raw.config as Record<string, unknown> | undefined;
  const deductionRulesRaw = (raw.deduction_rules ?? raw.deductionRules) as Record<string, unknown>[] | undefined;
  const hamaliSlabsRaw = (raw.hamali_slabs ?? raw.hamaliSlabs) as Record<string, unknown>[] | undefined;
  const dynamicChargesRaw = (raw.dynamic_charges ?? raw.dynamicCharges) as Record<string, unknown>[] | undefined;

  return {
    commodityId: Number(raw.commodity_id ?? raw.commodityId),
    config: config
      ? {
          id: config.id as number | undefined,
          commodityId: Number(config.commodity_id ?? config.commodityId),
          ratePerUnit: Number(config.rate_per_unit ?? config.ratePerUnit ?? 0),
          minWeight: Number(config.min_weight ?? config.minWeight ?? 0),
          maxWeight: Number(config.max_weight ?? config.maxWeight ?? 0),
          govtDeductionEnabled: Boolean(config.govt_deduction_enabled ?? config.govtDeductionEnabled),
          roundoffEnabled: Boolean(config.roundoff_enabled ?? config.roundoffEnabled),
          commissionPercent: Number(config.commission_percent ?? config.commissionPercent ?? 0),
          userFeePercent: Number(config.user_fee_percent ?? config.userFeePercent ?? 0),
          hsnCode: (config.hsn_code ?? config.hsnCode) as string | undefined,
          weighingCharge: config.weighing_charge != null ? Number(config.weighing_charge) : (config.weighingCharge as number | undefined),
          billPrefix: (config.bill_prefix ?? config.billPrefix) as string | undefined,
          hamaliEnabled: Boolean(config.hamali_enabled ?? config.hamaliEnabled),
          gstRate: config.gst_rate != null ? Number(config.gst_rate) : (config.gstRate as number | undefined),
          sgstRate:
            config.sgst_rate != null ? Number(config.sgst_rate) : (config.sgstRate as number | undefined),
          cgstRate:
            config.cgst_rate != null ? Number(config.cgst_rate) : (config.cgstRate as number | undefined),
          igstRate:
            config.igst_rate != null ? Number(config.igst_rate) : (config.igstRate as number | undefined),
          weighingThreshold:
            config.weighing_threshold != null ? Number(config.weighing_threshold) : (config.weighingThreshold as number | undefined),
          createdBy: (config.created_by ?? config.createdBy) as string | undefined,
          createdDate: (config.created_date ?? config.createdDate) as string | undefined,
          lastModifiedBy: (config.last_modified_by ?? config.lastModifiedBy) as string | undefined,
          lastModifiedDate: (config.last_modified_date ?? config.lastModifiedDate) as string | undefined,
        }
      : undefined,
    deductionRules: (deductionRulesRaw ?? []).map((r) => ({
      id: r.id as number | undefined,
      commodityId: Number(r.commodity_id ?? r.commodityId),
      minWeight: Number(r.min_weight ?? r.minWeight),
      maxWeight: Number(r.max_weight ?? r.maxWeight),
      deductionValue: Number(r.deduction_value ?? r.deductionValue),
      createdBy: (r.created_by ?? r.createdBy) as string | undefined,
      createdDate: (r.created_date ?? r.createdDate) as string | undefined,
      lastModifiedBy: (r.last_modified_by ?? r.lastModifiedBy) as string | undefined,
      lastModifiedDate: (r.last_modified_date ?? r.lastModifiedDate) as string | undefined,
    })),
    hamaliSlabs: (hamaliSlabsRaw ?? []).map((s) => ({
      id: s.id as number | undefined,
      commodityId: Number(s.commodity_id ?? s.commodityId),
      thresholdWeight: Number(s.threshold_weight ?? s.thresholdWeight),
      fixedRate: Number(s.fixed_rate ?? s.fixedRate),
      perKgRate: Number(s.per_kg_rate ?? s.perKgRate ?? 0),
      createdBy: (s.created_by ?? s.createdBy) as string | undefined,
      createdDate: (s.created_date ?? s.createdDate) as string | undefined,
      lastModifiedBy: (s.last_modified_by ?? s.lastModifiedBy) as string | undefined,
      lastModifiedDate: (s.last_modified_date ?? s.lastModifiedDate) as string | undefined,
    })),
    dynamicCharges: (dynamicChargesRaw ?? []).map((c) => ({
      id: c.id as number | undefined,
      commodityId: Number(c.commodity_id ?? c.commodityId),
      traderId: c.trader_id != null ? Number(c.trader_id) : (c.traderId as number | undefined),
      chargeName: String(c.charge_name ?? c.chargeName ?? ''),
      chargeType: String(c.charge_type ?? c.chargeType ?? 'FIXED'),
      valueAmount: Number(c.value ?? c.valueAmount ?? 0),
      appliesTo: String(c.applies_to ?? c.appliesTo ?? 'BUYER'),
      percentBasis: (c.percent_basis ?? c.percentBasis) as string | undefined,
      fixedBasis: (c.fixed_basis ?? c.fixedBasis) as string | undefined,
      createdBy: (c.created_by ?? c.createdBy) as string | undefined,
      createdDate: (c.created_date ?? c.createdDate) as string | undefined,
      lastModifiedBy: (c.last_modified_by ?? c.lastModifiedBy) as string | undefined,
      lastModifiedDate: (c.last_modified_date ?? c.lastModifiedDate) as string | undefined,
    })),
  };
}

function mapFullConfigToApi(payload: FullCommodityConfigDto): Record<string, unknown> {
  const body: Record<string, unknown> = {
    commodityId: payload.commodityId,
  };
  if (payload.config) {
    body.config = {
      commodity_id: payload.config.commodityId,
      commodityId: payload.config.commodityId,
      rate_per_unit: payload.config.ratePerUnit,
      min_weight: payload.config.minWeight,
      max_weight: payload.config.maxWeight,
      govt_deduction_enabled: payload.config.govtDeductionEnabled,
      roundoff_enabled: payload.config.roundoffEnabled,
      commission_percent: payload.config.commissionPercent,
      user_fee_percent: payload.config.userFeePercent,
      hsn_code: payload.config.hsnCode ?? '',
      weighing_charge: payload.config.weighingCharge,
      bill_prefix: payload.config.billPrefix ?? '',
      hamali_enabled: payload.config.hamaliEnabled,
      gst_rate: payload.config.gstRate,
      sgst_rate: payload.config.sgstRate,
      cgst_rate: payload.config.cgstRate,
      igst_rate: payload.config.igstRate,
      weighing_threshold: payload.config.weighingThreshold,
    };
  }
  body.deductionRules = (payload.deductionRules ?? []).map((r) => ({
    commodity_id: r.commodityId,
    min_weight: r.minWeight,
    max_weight: r.maxWeight,
    deduction_value: r.deductionValue,
  }));
  body.hamaliSlabs = (payload.hamaliSlabs ?? []).map((s) => ({
    commodity_id: s.commodityId,
    threshold_weight: s.thresholdWeight,
    fixed_rate: s.fixedRate,
    per_kg_rate: s.perKgRate ?? 0,
  }));
  body.dynamicCharges = (payload.dynamicCharges ?? []).map((c) => ({
    commodity_id: c.commodityId,
    trader_id: c.traderId,
    charge_name: c.chargeName,
    charge_type: c.chargeType,
    value: c.valueAmount,
    applies_to: c.appliesTo,
    percent_basis: c.percentBasis,
    fixed_basis: c.fixedBasis,
  }));
  return body;
}
