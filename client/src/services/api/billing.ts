import { apiFetch } from './http';

/** Line item (backend BillLineItemDTO). */
export interface BillLineItemDTO {
  id?: number;
  bidNumber: number;
  lotName?: string;
  /** Auction lot id; stored for matching bids across bills. */
  lotId?: string | null;
  auctionEntryId?: number | null;
  selfSaleUnitId?: number | null;
  sellerName?: string;
  /** Lot-level bag count for canonical lot identifier (Sales Pad format); not billed qty. */
  lotTotalQty?: number | null;
  vehicleTotalQty?: number | null;
  sellerVehicleQty?: number | null;
  vehicleMark?: string | null;
  sellerMark?: string | null;
  quantity: number;
  weight: number;
  baseRate: number;
  brokerage?: number;
  /** Signed auction preset (₹ rate add); not merged into otherCharges. */
  presetApplied?: number;
  otherCharges?: number;
  newRate: number;
  amount: number;
  /** Token advance from auction for this bid/lot (₹). */
  tokenAdvance?: number;
}

/** Commodity group (backend CommodityGroupDTO). */
export interface CommodityGroupDTO {
  id?: number;
  commodityName: string;
  hsnCode?: string;
  commissionPercent?: number;
  userFeePercent?: number;
  items: BillLineItemDTO[];
  subtotal: number;
  commissionAmount?: number;
  userFeeAmount?: number;
  totalCharges?: number;
  /** Per-bill GST % (combined and split); persisted on sales_bill_commodity_group. */
  gstRate?: number;
  gstInputMode?: 'PERCENT' | 'AMOUNT';
  sgstRate?: number;
  sgstInputMode?: 'PERCENT' | 'AMOUNT';
  cgstRate?: number;
  cgstInputMode?: 'PERCENT' | 'AMOUNT';
  igstRate?: number;
  igstInputMode?: 'PERCENT' | 'AMOUNT';
  coolieRate?: number;
  coolieAmount?: number;
  /** When omitted, server uses sum of line quantities for coolie amount. */
  coolieChargeQty?: number | null;
  weighmanChargeRate?: number;
  weighmanChargeAmount?: number;
  /** When omitted, server uses sum of line quantities for weighman amount. */
  weighmanChargeQty?: number | null;
  discount?: number;
  discountType?: 'PERCENT' | 'AMOUNT';
  manualRoundOff?: number;
}

/** Version snapshot (backend BillVersionDTO). */
export interface BillVersionDTO {
  version: number;
  savedAt?: string;
  data?: unknown;
}

/** Full bill (backend SalesBillDTO). Matches BillingPage BillData. */
export interface SalesBillDTO {
  billId: string;
  billNumber: string;
  buyerName: string;
  buyerMark: string;
  buyerContactId?: string | null;
  buyerPhone?: string;
  buyerAddress?: string;
  buyerAsBroker?: boolean;
  brokerName?: string;
  brokerMark?: string;
  brokerContactId?: string | null;
  brokerPhone?: string;
  brokerAddress?: string;
  billingName: string;
  billDate: string;
  commodityGroups: CommodityGroupDTO[];
  buyerCoolie: number;
  outboundFreight: number;
  outboundVehicle?: string;
  discount: number;
  discountType: 'PERCENT' | 'AMOUNT';
  tokenAdvance: number;
  manualRoundOff: number;
  grandTotal: number;
  brokerageType: 'PERCENT' | 'AMOUNT';
  brokerageValue: number;
  globalOtherCharges: number;
  pendingBalance: number;
  versions?: BillVersionDTO[];
}

/** Create/update request body. */
export interface SalesBillCreateOrUpdateRequest {
  billId?: string;
  billNumber?: string;
  buyerName: string;
  buyerMark: string;
  buyerContactId?: string | null;
  buyerPhone?: string;
  buyerAddress?: string;
  buyerAsBroker?: boolean;
  brokerName?: string;
  brokerMark?: string;
  brokerContactId?: string | null;
  brokerPhone?: string;
  brokerAddress?: string;
  billingName: string;
  billDate: string;
  commodityGroups: CommodityGroupDTO[];
  buyerCoolie?: number;
  outboundFreight?: number;
  outboundVehicle?: string;
  discount?: number;
  discountType?: 'PERCENT' | 'AMOUNT';
  tokenAdvance?: number;
  manualRoundOff?: number;
  brokerageType?: 'PERCENT' | 'AMOUNT';
  brokerageValue?: number;
  globalOtherCharges?: number;
  pendingBalance?: number;
  grandTotal: number;
}

/** Paginated response (Spring Page). */
export interface SalesBillPage {
  content: SalesBillDTO[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

const BASE = '/sales-bills';

async function handleResponse<T>(res: Response, defaultMessage: string): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }
  let message = defaultMessage;
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      const problem = await res.json() as { detail?: string; title?: string; message?: string; fieldErrors?: Array<{ field: string; message: string }> };
      if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
        message = problem.detail;
      } else if (typeof problem.message === 'string' && problem.message.trim().length > 0) {
        message = problem.message;
      } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
        message = problem.title;
      }
      if (problem.fieldErrors && Array.isArray(problem.fieldErrors) && problem.fieldErrors.length > 0) {
        message = problem.fieldErrors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join('; ');
      }
    } else {
      const text = await res.text();
      if (text && text.length < 200) message = text;
    }
  } catch {
    // ignore
  }
  throw new Error(message);
}

/**
 * Billing (Sales Bill) API. Base path: /sales-bills.
 */
export const billingApi = {
  /**
   * Get paginated sales bills. Optional filters: billNumber, buyerName, dateFrom, dateTo.
   */
  async getPage(params: {
    page?: number;
    size?: number;
    sort?: string;
    billNumber?: string;
    buyerName?: string;
    dateFrom?: string;
    dateTo?: string;
    signal?: AbortSignal;
  } = {}): Promise<SalesBillPage> {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(params.page ?? 0));
    searchParams.set('size', String(params.size ?? 10));
    searchParams.set('sort', params.sort ?? 'billDate,desc');
    if (params.billNumber != null && params.billNumber.trim() !== '') {
      searchParams.set('billNumber', params.billNumber.trim());
    }
    if (params.buyerName != null && params.buyerName.trim() !== '') {
      searchParams.set('buyerName', params.buyerName.trim());
    }
    if (params.dateFrom != null && params.dateFrom.trim() !== '') {
      searchParams.set('dateFrom', params.dateFrom);
    }
    if (params.dateTo != null && params.dateTo.trim() !== '') {
      searchParams.set('dateTo', params.dateTo);
    }
    const res = await apiFetch(`${BASE}?${searchParams.toString()}`, { method: 'GET', signal: params.signal });
    return handleResponse<SalesBillPage>(res, 'Failed to load sales bills');
  },

  /**
   * Get one sales bill by id.
   */
  async getById(id: string | number): Promise<SalesBillDTO> {
    const res = await apiFetch(`${BASE}/${encodeURIComponent(String(id))}`, { method: 'GET' });
    return handleResponse<SalesBillDTO>(res, 'Failed to load sales bill');
  },

  /**
   * Create a new sales bill. Server assigns bill number.
   */
  async create(payload: SalesBillCreateOrUpdateRequest): Promise<SalesBillDTO> {
    const res = await apiFetch(BASE, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return handleResponse<SalesBillDTO>(res, 'Failed to create sales bill');
  },

  /**
   * Update an existing sales bill. Version snapshot appended on server.
   */
  async update(id: string | number, payload: SalesBillCreateOrUpdateRequest): Promise<SalesBillDTO> {
    const res = await apiFetch(`${BASE}/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return handleResponse<SalesBillDTO>(res, 'Failed to update sales bill');
  },

  /**
   * Assign a bill number based on commodity combination and prefixes.
   * If the bill already has a number, this is a no-op and returns the existing bill.
   */
  async assignNumber(id: string | number): Promise<SalesBillDTO> {
    const res = await apiFetch(`${BASE}/${encodeURIComponent(String(id))}/assign-number`, {
      method: 'POST',
    });
    return handleResponse<SalesBillDTO>(res, 'Failed to assign bill number');
  },
};
