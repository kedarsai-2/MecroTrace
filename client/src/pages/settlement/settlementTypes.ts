// ── Types ─────────────────────────────────────────────────
export interface SellerSettlement {
  sellerId: string;
  sellerName: string;
  sellerMark: string;
  /** Arrivals vehicle id (from settlement API) for direct arrival freight lookup. */
  vehicleId?: number;
  vehicleNumber: string;
  /** Same as Billing/Auction `formatAuctionLotIdentifier` vehicle mark segment. */
  vehicleMark?: string;
  /** Total bags on vehicle (all sellers); identifier segment. */
  vehicleTotalQty?: number;
  /** Arrivals: Σ lot bag counts for this seller. */
  arrivalTotalBags?: number;
  /** Arrivals: vehicle net billable kg from weighing (shared per vehicle). */
  vehicleArrivalNetBillableKg?: number;
  /** Billing: Σ commodity-group line weights for this seller's lots. */
  billingNetWeightKg?: number;
  contactId?: string | null;
  sellerPhone?: string | null;
  fromLocation?: string;
  sellerSerialNo?: string | number;
  createdAt?: string;
  date?: string;
  lots: SettlementLot[];
}


export interface SettlementLot {
  lotId: string;
  lotName: string;
  commodityName: string;
  /** Arrivals module: `lot.bag_count` (from settlement API). */
  arrivalBagCount?: number;
  /** Σ billing line weights for this lot (kg), when invoiced. */
  billingWeightKg?: number | null;
  entries: SettlementEntry[];
}


export interface SettlementEntry {
  bidNumber: number;
  buyerMark: string;
  buyerName: string;
  /** Auction base bid per bag */
  rate: number;
  /** Vehicle-ops summary rate per bag (final; pad preset already reflected). Not added to preset again on modified. */
  summarySellerRate?: number;
  /** From auction (signed); effective = base + presetMargin for original or modified */
  presetMargin?: number;
  quantity: number;
  weight: number;
}


export type SellerArrivalTally = {
  lots: number;
  bids: number;
  weighed: number;
};


export type SettlementHeaderParticle = {
  left: string;
  top: string;
  duration: number;
  delay: number;
};


export interface RateCluster {
  rate: number;
  totalQuantity: number;
  totalWeight: number;
  amount: number;
}


export interface DeductionItem {
  key: string;
  label: string;
  amount: number;
  editable: boolean;
  autoPulled: boolean;
}


export interface PattiData {
  pattiId: string;
  sellerName: string;
  rateClusters: RateCluster[];
  grossAmount: number;
  deductions: DeductionItem[];
  totalDeductions: number;
  netPayable: number;
  createdAt: string;
  useAverageWeight: boolean;
}


export interface ArrivalSummaryRow {
  key: string;
  vehicleNumber: string;
  fromLocation: string;
  serialNo: string | number | null;
  dateLabel: string;
  sellerNames: string;
  lots: number;
  bids: number;
  weighed: number;
  sellerIds: string[];
  representativeSeller: SellerSettlement;
}


export interface SavedArrivalSummaryRow {
  key: string;
  vehicleNumber: string;
  fromLocation: string;
  serialNo: string | number | null;
  dateLabel: string;
  sellerNames: string;
  sellerIds: string[];
  lots: number;
  bids: number;
  weighed: number;
  representativePattiId: number | null;
  /** Sum over pattis in this vehicle group: max(Σ rate-cluster qty, seller lots) per patti. */
  totalBags: number;
}


export type InProgressSettlementDraft = {
  key: string;
  updatedAt: string;
  representativeSellerId: string;
  sellerIds: string[];
  /** Settlement DB row id per seller (for updates when multiple sellers share one arrival). */
  dbPattiIdsBySellerId: Record<string, number>;
  vehicleNumber?: string;
  sellerNames?: string;
  fromLocation?: string;
  serialNo?: string;
  dateLabel?: string;
  lots?: number;
  bids?: number;
  weighed?: number;
  pattiData: PattiData;
  sellerExpensesById?: Record<string, SellerExpenseFormState>;
  removedLotsBySellerId?: Record<string, string[]>;
  lotSalesOverridesBySellerId?: Record<string, Record<string, LotSalesOverride>>;
};


/** Per-seller registration (Sales report): registered = linked to contact registry. */
export interface SellerRegFormState {
  registrationChosen: boolean;
  registered: boolean;
  contactId: string | null;
  replacementSellerId: string | null;
  mark: string;
  name: string;
  mobile: string;
  contactSearchQuery: string;
  addAndChangeSeller: boolean;
  allowRegisteredEdit: boolean;
  /** Manual confirmation for printing when the seller is not registry-linked (`registered` / `contactId`). Checkbox starts unchecked. */
  unregisteredPrintConfirmed: boolean;
}


export interface SellerExpenseFormState {
  freight: number;
  unloading: number;
  weighman: number;
  cashAdvance: number;
  gunnies: number;
  others: number;
}


/** Vehicle-level expense lines (Add Expense modal). */
export interface VehicleExpenseRow {
  id: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
  freight: number;
  unloading: number;
  weighing: number;
  gunnies: number;
}


export type VehicleExpenseField = 'freight' | 'unloading' | 'weighing' | 'gunnies';


export type VehicleExpenseFieldValues = Pick<VehicleExpenseRow, VehicleExpenseField>;


export interface AddVoucherRowState {
  id?: number;
  localId: string;
  voucherName: string;
  forWhoName: string;
  description: string;
  expenseAmount: string;
}


/** User edits in Sales report table (per lot row). */
export interface LotSalesOverride {
  qty?: number;
  weight?: number;
  /** Seller settlement rate per bag (₹/bag), aligned with Billing new-rate / divisor model. */
  ratePerBag?: number;
}


/** Saved-patti-only extra lot rows (split bid), persisted in `extensionJson`. */
export interface ExtraBidLot {
  id: string;
  lotName: string;
  commodityName: string;
  qty: number;
  weight: number;
  ratePerBag: number;
}


export type SettlementSalesTableRow =
  | { lot: SettlementLot; sid: string; isExtraBid: false; entryIndex: number }
  | { lot: SettlementLot; sid: string; isExtraBid: true; extraBid: ExtraBidLot };


export type PattiExtensionJsonV1 = {
  v: 1;
  removedLotIds?: string[];
  lotOverrides?: Record<string, { weight?: number; ratePerBag?: number; qty?: number }>;
  extraBidLots?: ExtraBidLot[];
  /** Display order: `a:${lotStableId}` then `e:${extraId}`; omit when default (API lots then extras). */
  salesRowOrder?: string[];
  /** Persisted Sales report “Unregistered” print confirmation for this sub-patti. */
  unregisteredPrintConfirmed?: boolean;
};


export type MainPattiPrintHeader = {
  sellerName: string;
  sellerMobile: string;
  sellerAddress: string;
  vehicleNumber: string;
} | null;


export type SalesRowOrderKey = string;


/** Cancel payload for inline split transaction (revert to single row). */
export type SplitCancelRestore =
  | {
      kind: 'api_plus_extra';
      apiSid: string;
      prevApiOverride: LotSalesOverride;
      newExtraId: string;
    }
  | {
      kind: 'extra_pair';
      firstExtraId: string;
      newExtraId: string;
      originalExtra: ExtraBidLot;
    };


/** Active split edit: two rows, fixed totals until Save or Cancel. */
export type SplitGroupSnapshot = {
  splitGroupId: string;
  sellerId: string;
  rowKeyA: SalesRowOrderKey;
  rowKeyB: SalesRowOrderKey;
  totalQty: number;
  totalWeight: number;
  isEditing: boolean;
  cancelRestore: SplitCancelRestore;
};
