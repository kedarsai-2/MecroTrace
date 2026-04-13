import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Receipt, Search, User, Package, IndianRupee, Truck, Hash,
  Edit3, Lock, Unlock, Save, Printer, Plus, Trash2,
  Percent, FileText, ChevronDown, ChevronUp,
  AlertCircle, AlertTriangle, BookOpen, X, Loader2, Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useAuctionResults } from '@/hooks/useAuctionResults';
import { commodityApi, printLogApi, printSettingsApi, weighingApi, billingApi, arrivalsApi, contactApi, auctionApi } from '@/services/api';
import { ContactApiError } from '@/services/api/contacts';
import type { Contact } from '@/types/models';
import type {
  AuctionBidCreateRequest,
  AuctionBidUpdateRequest,
  AuctionEntryDTO,
  AuctionResultDTO,
  AuctionSessionDTO,
  LotSummaryDTO,
} from '@/services/api/auction';
import ForbiddenPage from '@/components/ForbiddenPage';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { usePermissions } from '@/lib/permissions';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';
import type { FullCommodityConfigDto } from '@/services/api/commodities';
import type { SalesBillDTO } from '@/services/api/billing';
import type { ArrivalDetail } from '@/services/api/arrivals';
import { directPrint } from '@/utils/printTemplates';
import { generateSalesBillPrintHTML, generateNonGstSalesBillPrintHTML, type BillPrintData } from '@/utils/printDocumentTemplates';
import {
  billGroupSubtotalWithTaxAndCharges,
  effectiveGstPercent,
  formatBillingInr,
  gstOnSubtotal,
  percentOfAmount,
  roundMoney2,
} from '@/utils/billingMoney';
import { BillingMoneyInput } from '@/components/billing/BillingMoneyInput';

/**
 * Billing buttons follow Settlement premium gradient language for visual consistency.
 */
const billingBtnGradient =
  '!bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] !text-white border border-white/25 shadow-[0_10px_24px_-12px_rgba(91,140,255,0.85)] hover:!brightness-110 hover:border-white/45 hover:shadow-[0_14px_30px_-12px_rgba(123,97,255,0.9)] active:scale-[0.99] transition-all';
const arrOutlineLg = cn('rounded-xl h-11 sm:h-12 font-bold text-sm', billingBtnGradient);
const arrOutlineMd = cn('rounded-xl h-9 text-sm font-semibold', billingBtnGradient);
const arrOutlineTall = cn('rounded-xl h-12 text-sm font-semibold', billingBtnGradient);
const arrOutlineSm = cn('rounded-xl h-8 text-xs font-semibold', billingBtnGradient);
const arrSolid = cn('rounded-xl font-bold', billingBtnGradient);
const arrSolidLg = cn(arrSolid, 'h-11 sm:h-12 px-4 text-sm');
const arrSolidMd = cn(arrSolid, 'h-9 px-3 text-sm');
const arrSolidTall = cn(arrSolid, 'h-12 px-6 text-sm');
const arrSolidSm = cn(arrSolid, 'h-8 px-2.5 text-xs');
const arrSolidWide10 = cn(arrSolid, 'w-full h-10');
const arrSolidWide14 = cn(arrSolid, 'w-full h-14');
const numberInputNoSpinnerClass = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
const billingSummaryInputClass = `h-10 w-24 lg:h-6 lg:w-20 rounded text-right tabular-nums text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${numberInputNoSpinnerClass}`;
const billingSummaryValueClass = 'text-[10px] font-semibold text-foreground ml-auto tabular-nums min-w-[5.75rem] text-right inline-block';
const billingLoginImage = '/login-bg.webp';

/** Commodity line: computed fields (not inputs). Muted + dashed border + not-allowed cursor so they read as read-only. */
const billingCommodityReadOnlyCellClass =
  'h-10 lg:h-6 px-2 lg:px-1 border border-dashed border-border/70 rounded-md bg-muted/50 text-muted-foreground inline-flex items-center justify-center w-full text-[11px] lg:text-[10px] cursor-not-allowed shadow-inner select-text';

/** Billing main tabs mirror Settlement tabs (gradient active + glass-card inactive). */
const billingToggleTabBtn = (active: boolean) =>
  cn(
    'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-10',
    active
      ? 'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] text-white shadow-md'
      : 'glass-card text-muted-foreground hover:text-foreground',
  );

/** Same as billingToggleTabBtn but readable on the mobile hero background. */
const billingToggleTabBtnOnHero = (active: boolean) =>
  cn(
    'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-10',
    active
      ? 'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] text-white shadow-md'
      : 'bg-white/15 text-white/90 hover:bg-white/25 border border-white/10 backdrop-blur-sm',
  );

// ── Types ─────────────────────────────────────────────────

interface BuyerPurchase {
  buyerMark: string;
  buyerName: string;
  buyerContactId: string | null;
  entries: BillEntry[];
  /** Total token advance for this buyer across all bids (₹). */
  tokenAdvanceTotal: number;
}

interface BillEntry {
  bidNumber: number;
  lotId: string;
  lotName: string;
  /** {@link AuctionEntryDTO.auction_entry_id} for PATCH / billing ↔ auction sync. */
  auctionEntryId?: number | null;
  /** When set, use self-sale bid PATCH path. */
  selfSaleUnitId?: number | null;
  /** Original lot bag count at auction lot level (same for all buyers in this lot). */
  lotTotalQty?: number;
  sellerName: string;
  commodityName: string;
  rate: number;
  quantity: number;
  weight: number;
  /** Total bags for the whole vehicle (all sellers on same vehicle). */
  vehicleTotalQty?: number;
  /** Total bags for this seller on the vehicle (all lots of that seller). */
  sellerVehicleQty?: number;
  presetApplied: number;
  isSelfSale: boolean;
  /** Token advance collected at auction stage for this bid (₹). */
  tokenAdvance?: number;
}

function getBidSelectionKey(entry: Pick<BillEntry, 'bidNumber' | 'lotId'>): string {
  return `${entry.bidNumber}::${entry.lotId}`;
}

function normalizeLotNameKey(name: string): string {
  return (name || '').trim().toLowerCase();
}

/**
 * Line keys already used on another sales bill (draft in progress or numbered).
 * Excludes the bill currently open for edit so its own lines stay available.
 */
function collectReservedBidKeysFromSalesBills(
  bills: SalesBillDTO[],
  excludeBackendBillId: string | null,
): Set<string> {
  const set = new Set<string>();
  for (const b of bills) {
    if (excludeBackendBillId && String(b.billId) === excludeBackendBillId) continue;
    for (const g of b.commodityGroups || []) {
      for (const it of g.items || []) {
        const bid = Number(it.bidNumber);
        if (!Number.isFinite(bid)) continue;
        const lotId = (it.lotId != null && String(it.lotId).trim() !== '' ? String(it.lotId).trim() : '');
        if (lotId) {
          set.add(`${bid}::${lotId}`);
        } else {
          set.add(`legacy::${bid}::${normalizeLotNameKey(it.lotName || '')}`);
        }
      }
    }
  }
  return set;
}

function isBillEntryReservedOnOtherSalesBill(entry: BillEntry, reserved: Set<string>): boolean {
  const bid = entry.bidNumber;
  const lotId = String(entry.lotId || '').trim();
  /** When auction/billing has a real lot id, only that key counts. Legacy lotName keys are ambiguous (many lots share "100"). */
  if (lotId) {
    return reserved.has(`${bid}::${lotId}`);
  }
  return reserved.has(`legacy::${bid}::${normalizeLotNameKey(entry.lotName)}`);
}

function resolveAuctionEntryIdFromResults(
  item: { bidNumber: number; lotId?: string },
  auctions: AuctionResultDTO[],
): number | null {
  const lotId = String(item.lotId || '').trim();
  const bidNum = Number(item.bidNumber);
  if (!lotId || !Number.isFinite(bidNum)) return null;
  for (const a of auctions || []) {
    if (String(a.lotId) !== lotId) continue;
    const hit = (a.entries || []).find(e => Number(e.bidNumber) === bidNum);
    if (hit?.auctionEntryId != null && Number.isFinite(Number(hit.auctionEntryId))) return Number(hit.auctionEntryId);
  }
  return null;
}

function resolveSelfSaleUnitIdFromResults(lotId: string, auctions: AuctionResultDTO[]): number | null {
  const a = (auctions || []).find(x => String(x.lotId) === String(lotId));
  return a?.selfSaleUnitId != null ? Number(a.selfSaleUnitId) : null;
}

interface CommodityGroup {
  commodityName: string;
  hsnCode: string;
  taxMode?: 'GST' | 'IGST' | 'NONE';
  gstInputMode?: 'PERCENT' | 'AMOUNT';
  sgstInputMode?: 'PERCENT' | 'AMOUNT';
  cgstInputMode?: 'PERCENT' | 'AMOUNT';
  igstInputMode?: 'PERCENT' | 'AMOUNT';
  gstRate: number;
  /** Optional SGST/CGST (intra) or IGST (inter) split; see `effectiveGstPercent` in billingMoney. */
  sgstRate: number;
  cgstRate: number;
  igstRate: number;
  divisor: number;
  commissionPercent: number;
  userFeePercent: number;
  coolieRate: number; // Per-commodity coolie rate
  coolieAmount: number; // Per-commodity coolie amount (rate * qty)
  weighmanChargeRate: number; // Per-commodity weighman charge rate
  weighmanChargeAmount: number; // Per-commodity weighman charge amount (rate * qty)
  discount: number; // Per-commodity discount amount or percentage
  discountType: 'PERCENT' | 'AMOUNT'; // Per-commodity discount type
  manualRoundOff: number; // Per-commodity manual round off
  items: BillLineItem[];
  subtotal: number;
  commissionAmount: number;
  userFeeAmount: number;
  totalCharges: number;
}

interface BillLineItem {
  bidNumber: number;
  lotName: string;
  /** Auction lot id (matches BillEntry.lotId). */
  lotId?: string;
  auctionEntryId?: number | null;
  selfSaleUnitId?: number | null;
  /** Original lot bag count at auction lot level. */
  lotTotalQty?: number;
  /** Total bags for the whole vehicle (all sellers on same vehicle). */
  vehicleTotalQty?: number;
  /** Total bags for this seller on the vehicle (all lots of that seller). */
  sellerVehicleQty?: number;
  sellerName: string;
  quantity: number;
  weight: number;
  baseRate: number; // B = Auction bid
  presetApplied: number; // P = Preset
  brokerage: number; // BRK
  otherCharges: number; // Other (from preset or manual)
  sellerOtherCharges: number; // Other (dynamic, appliesTo=SELLER) - read-only for settlement deductions
  newRate: number; // REQ-BIL-002: NR = B + P + BRK + Other
  amount: number;
  /** Token advance for this bid/lot from auction (₹). Bill total = sum of lines. */
  tokenAdvance?: number;
}

interface BillData {
  billId: string;
  billNumber: string;
  buyerName: string;
  buyerMark: string;
  buyerContactId: string | null;
  buyerPhone: string;
  buyerAddress: string;
  buyerAsBroker: boolean;
  brokerName: string;
  brokerMark: string;
  brokerContactId: string | null;
  brokerPhone: string;
  brokerAddress: string;
  billingName: string;
  billDate: string;
  commodityGroups: CommodityGroup[];
  outboundFreight: number;
  outboundVehicle: string;
  /** Total token advance to deduct from payable (₹). */
  tokenAdvance: number;
  grandTotal: number;
  brokerageType: 'PERCENT' | 'AMOUNT';
  brokerageValue: number;
  globalOtherCharges: number;
  pendingBalance: number;
  versions: any[];
}

/** True if billId was issued by backend (numeric string). */
function isBackendBillId(billId: string): boolean {
  return /^\d+$/.test(billId);
}

/** Sum of per-line token advances (auction bid tokens). */
function sumLineTokenAdvances(b: { commodityGroups: CommodityGroup[] }): number {
  return roundMoney2(
    b.commodityGroups.reduce(
      (s, g) => s + g.items.reduce((ss, i) => ss + (Number(i.tokenAdvance) || 0), 0),
      0,
    ),
  );
}

/** Normalize every billing number to 2 decimal places for display and API consistency. */
function roundBillMoneyValues(b: BillData): BillData {
  const commodityGroups = b.commodityGroups.map(g => {
    const items = g.items.map(it => ({
      ...it,
      quantity: roundMoney2(Number(it.quantity) || 0),
      weight: roundMoney2(Number(it.weight) || 0),
      baseRate: roundMoney2(Number(it.baseRate) || 0),
      presetApplied: roundMoney2(Number(it.presetApplied) || 0),
      brokerage: roundMoney2(Number(it.brokerage) || 0),
      otherCharges: roundMoney2(Number(it.otherCharges) || 0),
      sellerOtherCharges: roundMoney2(Number(it.sellerOtherCharges) || 0),
      newRate: roundMoney2(Number(it.newRate) || 0),
      amount: roundMoney2(Number(it.amount) || 0),
      tokenAdvance: roundMoney2(Number(it.tokenAdvance) || 0),
    }));
    const div = Number(g.divisor) > 0 ? Number(g.divisor) : 50;
    return {
      ...g,
      divisor: roundMoney2(div),
      gstRate: roundMoney2(Number(g.gstRate) || 0),
      sgstRate: roundMoney2(Number(g.sgstRate) || 0),
      cgstRate: roundMoney2(Number(g.cgstRate) || 0),
      igstRate: roundMoney2(Number(g.igstRate) || 0),
      commissionPercent: roundMoney2(Number(g.commissionPercent) || 0),
      userFeePercent: roundMoney2(Number(g.userFeePercent) || 0),
      coolieRate: roundMoney2(Number(g.coolieRate) || 0),
      coolieAmount: roundMoney2(Number(g.coolieAmount) || 0),
      weighmanChargeRate: roundMoney2(Number(g.weighmanChargeRate) || 0),
      weighmanChargeAmount: roundMoney2(Number(g.weighmanChargeAmount) || 0),
      discount: roundMoney2(Number(g.discount) || 0),
      manualRoundOff: roundMoney2(Number(g.manualRoundOff) || 0),
      subtotal: roundMoney2(Number(g.subtotal) || 0),
      commissionAmount: roundMoney2(Number(g.commissionAmount) || 0),
      userFeeAmount: roundMoney2(Number(g.userFeeAmount) || 0),
      totalCharges: roundMoney2(Number(g.totalCharges) || 0),
      items,
    };
  });
  const tokenAdvance = sumLineTokenAdvances({ commodityGroups });
  return {
    ...b,
    outboundFreight: roundMoney2(Number(b.outboundFreight) || 0),
    grandTotal: roundMoney2(Number(b.grandTotal) || 0),
    pendingBalance: roundMoney2(Number(b.pendingBalance) || 0),
    brokerageValue: roundMoney2(Number(b.brokerageValue) || 0),
    globalOtherCharges: roundMoney2(Number(b.globalOtherCharges) || 0),
    tokenAdvance,
    commodityGroups,
  };
}

/** Lot identifier for billing rows: Vehicle QTY / Seller QTY / Lot Name - Lot QTY. */
function formatLotIdentifierForBillEntry(entry: BillEntry | BillLineItem): string {
  const lotQty = (entry as any).lotTotalQty ?? (entry as any).quantity ?? 0;
  const lotName = (entry as any).lotName || String(lotQty || '');
  // Use auction-lot identifier strictly at lot level (not buyer/vehicle split totals).
  const vTotal = lotQty;
  const sTotal = lotQty;
  return `${vTotal}/${sTotal}/${lotName}-${lotQty}`;
}

/** Normalize bill from API: add presetApplied (derived) and gstRate to items/groups. */
function normalizeBillFromApi(b: any, fullConfigs?: FullCommodityConfigDto[], commodities?: any[]): BillData {
  const configByCommName = new Map<
    string,
    { gstRate: number; sgstRate: number; cgstRate: number; igstRate: number; divisor: number }
  >();
  const dynamicChargesByCommName = new Map<string, any[]>();
  if (fullConfigs && commodities) {
    commodities.forEach((c: any) => {
      const cfg = fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(c.commodity_id));
      const name = c.commodity_name ?? c.commodityName;
      if (!name) return;
      const gstRate = cfg?.config?.gstRate ?? 0;
      const sgstRate = cfg?.config?.sgstRate ?? 0;
      const cgstRate = cfg?.config?.cgstRate ?? 0;
      const igstRate = cfg?.config?.igstRate ?? 0;
      const divisorRaw = cfg?.config?.ratePerUnit ?? 50;
      const divisor = Number(divisorRaw) > 0 ? Number(divisorRaw) : 50;
      configByCommName.set(name, { gstRate, sgstRate, cgstRate, igstRate, divisor });
      dynamicChargesByCommName.set(name, cfg?.dynamicCharges ?? []);
    });
  }
  const groups = (b.commodityGroups || []).map((g: any) => {
    const fromCfg = configByCommName.get(g.commodityName);
    const resolvedSgstRate = g.sgstRate ?? g.sgst_rate ?? fromCfg?.sgstRate ?? 0;
    const resolvedCgstRate = g.cgstRate ?? g.cgst_rate ?? fromCfg?.cgstRate ?? 0;
    const resolvedIgstRate = g.igstRate ?? g.igst_rate ?? fromCfg?.igstRate ?? 0;
    // hasAnyTaxConfigured: check commodity config first, then fall back to saved bill rates.
    // This ensures a saved bill that has GST rates is NOT downgraded to 'NONE' simply because
    // the commodity config is missing/not loaded yet (fixes mixed-GST multi-commodity bills).
    const hasAnyTaxConfigured =
      Number(fromCfg?.gstRate ?? 0) > 0
      || Number(fromCfg?.sgstRate ?? 0) > 0
      || Number(fromCfg?.cgstRate ?? 0) > 0
      || Number(fromCfg?.igstRate ?? 0) > 0
      || Number(resolvedSgstRate) > 0
      || Number(resolvedCgstRate) > 0
      || Number(resolvedIgstRate) > 0;
    const preferredTaxMode: 'GST' | 'IGST' | 'NONE' = hasAnyTaxConfigured
      ? (Number(resolvedIgstRate) > 0 ? 'IGST' : 'GST')
      : 'NONE';
    return {
    ...g,
    taxMode: preferredTaxMode,
    gstInputMode: (g.gstInputMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'),
    sgstInputMode: (g.sgstInputMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'),
    cgstInputMode: (g.cgstInputMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'),
    igstInputMode: (g.igstInputMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'),
    gstRate: 0,
    sgstRate: preferredTaxMode === 'NONE' ? 0 : (preferredTaxMode === 'IGST' ? 0 : resolvedSgstRate),
    cgstRate: preferredTaxMode === 'NONE' ? 0 : (preferredTaxMode === 'IGST' ? 0 : resolvedCgstRate),
    igstRate: preferredTaxMode === 'NONE' ? 0 : (preferredTaxMode === 'GST' ? 0 : resolvedIgstRate),
    divisor: g.divisor ?? fromCfg?.divisor ?? 50,
    items: (g.items || []).map((item: any) => {
      const base = Number(item.baseRate) || 0;
      const brk = Number(item.brokerage) || 0;
      const other = Number(item.otherCharges) || 0;
      const nr = Number(item.newRate) || 0;
      const preset = Math.max(0, nr - base - brk - other);
      const presetApplied = item.presetApplied ?? preset;

      const divisorUsed = (g.divisor ?? configByCommName.get(g.commodityName)?.divisor ?? 50) > 0
        ? (g.divisor ?? configByCommName.get(g.commodityName)?.divisor ?? 50)
        : 50;

      // Compute seller-side dynamic "Other Charges" (read-only for settlement deductions).
      const dynCharges = dynamicChargesByCommName.get(g.commodityName) ?? [];
      const weight = Number(item.weight) || 0;
      const qty = Number(item.quantity) || 0;

      const baseNewRateWithoutOther = base + presetApplied + brk;
      const baseAmount = (weight * baseNewRateWithoutOther) / divisorUsed;

      let sellerOtherCharges = 0;
      dynCharges.forEach((ch: any) => {
        const appliesTo = String(ch.appliesTo || 'BUYER').toUpperCase();
        if (appliesTo !== 'SELLER') return;

        const chargeType = String(ch.chargeType || ch.charge_type || 'FIXED').toUpperCase();
        const value = Number(ch.valueAmount ?? ch.value ?? 0) || 0;
        if (value <= 0) return;

        if (chargeType === 'PERCENT') {
          const chargeTotal = baseAmount * (value / 100);
          const rateAdd = weight > 0 ? (chargeTotal * divisorUsed) / weight : 0;
          sellerOtherCharges += rateAdd;
          return;
        }

        const fixedBasis = String(ch.fixedBasis || ch.fixed_basis || 'PER_50KG').toUpperCase();
        if (fixedBasis === 'PER_COUNT') {
          const chargeTotal = value * qty;
          const rateAdd = weight > 0 ? (chargeTotal * divisorUsed) / weight : 0;
          sellerOtherCharges += rateAdd;
        } else {
          sellerOtherCharges += value * (divisorUsed / 50);
        }
      });

      const tok = Number(item.tokenAdvance) || 0;
      return { ...item, presetApplied, sellerOtherCharges, tokenAdvance: tok };
    }),
  };
  });

  let migratedGroups = groups.map((g: any) => ({ ...g, items: g.items.map((it: any) => ({ ...it })) }));
  let lineTokenSum = 0;
  migratedGroups.forEach((g: any) => {
    g.items.forEach((it: any) => {
      lineTokenSum += Number(it.tokenAdvance) || 0;
    });
  });
  const headerToken = Number((b as any).tokenAdvance) || 0;
  // Legacy bills: only header token was stored; allocate to first line so per-lot editing works after save.
  if (lineTokenSum === 0 && headerToken > 0) {
    for (const g of migratedGroups) {
      if (g.items.length > 0) {
        g.items[0] = { ...g.items[0], tokenAdvance: headerToken };
        break;
      }
    }
  }
  const tokenAdvance = sumLineTokenAdvances({ commodityGroups: migratedGroups });

  return roundBillMoneyValues({
    ...b,
    buyerContactId: (b as any).buyerContactId ?? null,
    buyerPhone: (b as any).buyerPhone ?? '',
    buyerAddress: (b as any).buyerAddress ?? '',
    buyerAsBroker: Boolean((b as any).buyerAsBroker),
    brokerName: (b as any).brokerName ?? '',
    brokerMark: (b as any).brokerMark ?? '',
    brokerContactId: (b as any).brokerContactId ?? null,
    brokerPhone: (b as any).brokerPhone ?? '',
    brokerAddress: (b as any).brokerAddress ?? '',
    tokenAdvance,
    commodityGroups: migratedGroups,
  } as BillData);
}

// ── Validation ────────────────────────────────────────────
type ValidationErrors = Record<string, string>;

function validateBill(
  b: BillData,
  commodityAvgWeightBounds: Record<string, { min: number; max: number }>,
): { isValid: boolean; errors: ValidationErrors } {
  const errors: ValidationErrors = {};

  const trimmedName = (b.billingName ?? '').trim();
  if (!trimmedName) {
    errors.billingName = 'Billing name is required';
  } else if (trimmedName.length < 2) {
    errors.billingName = 'Minimum 2 characters';
  } else if (trimmedName.length > 150) {
    errors.billingName = 'Maximum 150 characters';
  }

  const v = (b.outboundVehicle ?? '').trim();
  if (v.length > 0) {
    if (v.length < 2 || v.length > 12) {
      errors.outboundVehicle = 'Must be 2–12 characters';
    } else if (v !== v.toUpperCase()) {
      errors.outboundVehicle = 'Must be uppercase';
    }
  }

  if (!Number.isFinite(b.brokerageValue) || b.brokerageValue < 0) {
    errors.brokerageValue = 'Must be a positive number';
  } else if (b.brokerageType === 'PERCENT' && b.brokerageValue > 100) {
    errors.brokerageValue = 'Percent cannot exceed 100';
  } else if (b.brokerageType === 'AMOUNT' && b.brokerageValue > 10000000) {
    errors.brokerageValue = 'Cannot exceed ₹1,00,00,000';
  }

  if (!Number.isFinite(b.globalOtherCharges) || b.globalOtherCharges < 0) {
    errors.globalOtherCharges = 'Must be a positive number';
  } else if (b.globalOtherCharges > 100000) {
    errors.globalOtherCharges = 'Cannot exceed ₹1,00,000';
  }

  // Validate per-commodity coolie charges
  b.commodityGroups.forEach((g, gi) => {
    if (!Number.isFinite(g.coolieAmount) || g.coolieAmount < 0) {
      errors[`coolie-${gi}`] = 'Must be a positive number';
    } else if (g.coolieAmount > 100000) {
      errors[`coolie-${gi}`] = 'Cannot exceed ₹1,00,000';
    }
    if (!Number.isFinite(g.weighmanChargeAmount) || g.weighmanChargeAmount < 0) {
      errors[`weighman-${gi}`] = 'Must be a positive number';
    } else if (g.weighmanChargeAmount > 100000) {
      errors[`weighman-${gi}`] = 'Cannot exceed ₹1,00,000';
    }
    if (!Number.isFinite(g.discount) || g.discount < 0) {
      errors[`discount-${gi}`] = 'Must be a positive number';
    } else if (g.discountType === 'PERCENT' && g.discount > 100) {
      errors[`discount-${gi}`] = 'Percent cannot exceed 100';
    } else if (g.discountType === 'AMOUNT' && g.discount > 100000) {
      errors[`discount-${gi}`] = 'Cannot exceed ₹1,00,000';
    }
    if (!Number.isFinite(g.manualRoundOff)) {
      errors[`roundoff-${gi}`] = 'Must be a valid number';
    } else if (Math.abs(g.manualRoundOff) > 100000) {
      errors[`roundoff-${gi}`] = 'Cannot exceed ±₹1,00,000';
    }
  });

  if (!Number.isFinite(b.outboundFreight) || b.outboundFreight < 0) {
    errors.outboundFreight = 'Must be a positive number';
  } else if (b.outboundFreight > 100000) {
    errors.outboundFreight = 'Cannot exceed ₹1,00,000';
  }


  b.commodityGroups.forEach((group, gi) => {
    group.items.forEach((item, ii) => {
      if (item.quantity < 1) {
        errors[`items.${gi}.${ii}.quantity`] = 'Quantity must be at least 1';
      }
      if (!item.weight || item.weight <= 0) {
        errors[`items.${gi}.${ii}.weight`] = 'Weight cannot be zero';
      }
      const avgWeight = item.quantity > 0 ? item.weight / item.quantity : 0;
      const bounds = commodityAvgWeightBounds[group.commodityName];
      const avgBelowMin = bounds != null && bounds.min > 0 && avgWeight < bounds.min;
      const avgAboveMax = bounds != null && bounds.max > 0 && avgWeight > bounds.max;
      if (avgBelowMin || avgAboveMax) {
        errors[`items.${gi}.${ii}.avgWeight`] = avgBelowMin
          ? `Avg Wt must be >= ${bounds!.min} kg`
          : `Avg Wt must be <= ${bounds!.max} kg`;
      }
      if (!Number.isFinite(item.brokerage) || item.brokerage < 0) {
        errors[`items.${gi}.${ii}.brokerage`] = 'Invalid';
      } else if (item.brokerage > 10000000) {
        errors[`items.${gi}.${ii}.brokerage`] = 'Too large';
      }
      if (!Number.isFinite(item.otherCharges) || item.otherCharges < 0) {
        errors[`items.${gi}.${ii}.otherCharges`] = 'Invalid';
      } else if (item.otherCharges > 10000) {
        errors[`items.${gi}.${ii}.otherCharges`] = 'Max ₹10,000';
      }
      if (item.newRate < 0.01 || item.newRate > 100000) {
        errors[`items.${gi}.${ii}.newRate`] = 'Rate out of range (0.01–1,00,000)';
      }
    });
  });

  return { isValid: Object.keys(errors).length === 0, errors };
}

const BillingPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { trader } = useAuth();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Billing');
  const canCreateContact = can('Contacts', 'Create');
  const canEditContact = can('Contacts', 'Edit');
  const [buyers, setBuyers] = useState<BuyerPurchase[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerPurchase | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Bill state
  const [bill, setBill] = useState<BillData | null>(null);
  const [editLocked, setEditLocked] = useState(true);
  const [hasSavedOnce, setHasSavedOnce] = useState(false);
  const [selectedPrintVersion, setSelectedPrintVersion] = useState<'latest' | number>('latest');
  const [showPrint, setShowPrint] = useState(false);
  const [billingPrintSize, setBillingPrintSize] = useState<'A4' | 'A5'>('A4');
  const [billingIncludeHeader, setBillingIncludeHeader] = useState(true);
  /** Page size used when the bill has no GST on any commodity. Defaults to A5. */
  const [nonGstPrintSize, setNonGstPrintSize] = useState<'A4' | 'A5'>('A5');

  type BillingMainTab = 'create' | 'progress' | 'saved';
  const [billingMainTab, setBillingMainTab] = useState<BillingMainTab>('create');
  const [buyerBidMarkInput, setBuyerBidMarkInput] = useState('');
  const [selectBidBuyer, setSelectBidBuyer] = useState<BuyerPurchase | null>(null);
  const [selectedBidKeys, setSelectedBidKeys] = useState<string[]>([]);
  const [selectedBuyerFromDropdown, setSelectedBuyerFromDropdown] = useState<BuyerPurchase | null>(null);
  const [showBuyerSuggestions, setShowBuyerSuggestions] = useState(false);
  const buyerSelectRef = useRef<HTMLDivElement | null>(null);
  const summaryTableScrollRef = useRef<HTMLDivElement | null>(null);
  const summarySnapTimerRef = useRef<number | null>(null);
  const latestVersionSnapshotRef = useRef<BillData | null>(null);
  const mobileCommodityCarouselRef = useRef<HTMLDivElement | null>(null);
  const mobileLotCarouselRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [resyncing, setResyncing] = useState(false);
  const [activeCommoditySlide, setActiveCommoditySlide] = useState(0);
  const [activeLotSlides, setActiveLotSlides] = useState<Record<number, number>>({});
  const [savedBills, setSavedBills] = useState<SalesBillDTO[]>([]);
  const [savedBillsLoading, setSavedBillsLoading] = useState(false);
  const [billPersisting, setBillPersisting] = useState(false);
  const persistBillPromiseRef = useRef<Promise<SalesBillDTO | null> | null>(null);
  const [commodities, setCommodities] = useState<any[]>([]);
  const [fullConfigs, setFullConfigs] = useState<FullCommodityConfigDto[]>([]);
  const [weighingSessions, setWeighingSessions] = useState<any[]>([]);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const [collapsedCommodityIndexes, setCollapsedCommodityIndexes] = useState<number[]>([]);
  const SUMMARY_COMMODITY_COL_WIDTH = 150;

  useEffect(() => {
    const loadPrintSetting = async () => {
      try {
        const list = await printSettingsApi.list();
        const gstRow    = list.find((item) => item.module_key === 'BILLING');
        const nonGstRow = list.find((item) => item.module_key === 'BILLING_NON_GST');
        if (gstRow?.paper_size === 'A5') setBillingPrintSize('A5');
        setBillingIncludeHeader(gstRow?.include_header !== false);
        if (nonGstRow?.paper_size) setNonGstPrintSize(nonGstRow.paper_size);
      } catch {
        // keep defaults
      }
    };
    void loadPrintSetting();
  }, []);

  const billPrintPayload = useMemo((): BillPrintData | null => {
    if (!bill) return null;
    return {
      ...bill,
      firm: trader
        ? {
            businessName: trader.business_name,
            ownerName: trader.owner_name,
            address: trader.address,
            city: trader.city,
            state: trader.state,
            pinCode: trader.pin_code,
            category: trader.category,
            gstNumber: trader.gst_number,
            rmcApmcCode: trader.rmc_apmc_code,
            mobile: trader.mobile,
            email: trader.email,
          }
        : null,
    };
  }, [bill, trader]);

  /**
   * True when ANY commodity group on the bill carries a GST / SGST / CGST / IGST rate.
   * Mixed bills (some GST, some non-GST commodities) are treated as GST bills — the full
   * GST template with print-settings header/size is used for the whole bill.
   *
   * Checks both the computed effective rate AND the stored taxMode so a mixed bill is
   * never incorrectly routed to the Non-GST template even if one group has no GST.
   */
  const isGstBill = useMemo(() => {
    if (!bill) return false;
    return bill.commodityGroups.some(
      (g) => effectiveGstPercent(g) > 0 || g.taxMode === 'GST' || g.taxMode === 'IGST',
    );
  }, [bill]);

  const salesBillPrintHtml = useMemo(() => {
    if (!billPrintPayload) return '';
    if (isGstBill) {
      // GST (or mixed) bill: respect print settings (page size + header toggle)
      return generateSalesBillPrintHTML(billPrintPayload, {
        pageSize: billingPrintSize,
        includeHeader: billingIncludeHeader,
      });
    }
    // Fully Non-GST: always no header; page size from BILLING_NON_GST print setting
    return generateNonGstSalesBillPrintHTML(billPrintPayload, {
      pageSize: nonGstPrintSize,
    });
  }, [billPrintPayload, billingPrintSize, billingIncludeHeader, nonGstPrintSize, isGstBill]);

  const handleSummaryTableScroll = useCallback(() => {
    const el = summaryTableScrollRef.current;
    if (!el) return;
    if (summarySnapTimerRef.current != null) {
      window.clearTimeout(summarySnapTimerRef.current);
    }
    summarySnapTimerRef.current = window.setTimeout(() => {
      const snappedLeft = Math.round(el.scrollLeft / SUMMARY_COMMODITY_COL_WIDTH) * SUMMARY_COMMODITY_COL_WIDTH;
      el.scrollTo({ left: snappedLeft, behavior: 'smooth' });
    }, 90);
  }, []);

  const toggleCommodityCollapse = useCallback((idx: number) => {
    setCollapsedCommodityIndexes(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx],
    );
  }, []);

  const handleCommodityCarouselScroll = useCallback(() => {
    const el = mobileCommodityCarouselRef.current;
    if (!el || !bill?.commodityGroups?.length) return;
    const step = el.scrollWidth / bill.commodityGroups.length;
    if (step <= 0) return;
    const idx = Math.max(0, Math.min(bill.commodityGroups.length - 1, Math.round(el.scrollLeft / step)));
    setActiveCommoditySlide(idx);
  }, [bill]);

  const handleLotCarouselScroll = useCallback((groupIdx: number) => {
    const el = mobileLotCarouselRefs.current[groupIdx];
    const total = bill?.commodityGroups?.[groupIdx]?.items?.length ?? 0;
    if (!el || total <= 0) return;
    const step = el.scrollWidth / total;
    if (step <= 0) return;
    const idx = Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / step)));
    setActiveLotSlides(prev => (prev[groupIdx] === idx ? prev : { ...prev, [groupIdx]: idx }));
  }, [bill]);

  const { auctionResults: auctionData, refetch: refetchAuctions } = useAuctionResults();

  // Precompute per-commodity average weight bounds from full config (minWeight/maxWeight).
  const commodityAvgWeightBounds = useMemo(() => {
    const map: Record<string, { min: number; max: number }> = {};
    if (!fullConfigs.length || !commodities.length) return map;
    commodities.forEach((c: any) => {
      const cfg = fullConfigs.find(
        (f: FullCommodityConfigDto) => String(f.commodityId) === String(c.commodity_id),
      );
      const min = Number(cfg?.config?.minWeight ?? 0);
      const max = Number(cfg?.config?.maxWeight ?? 0);
      if (min > 0 || max > 0) {
        const name = c.commodity_name ?? c.commodityName;
        if (name) {
          map[name] = { min, max };
        }
      }
    });
    return map;
  }, [fullConfigs, commodities]);

  /** Live validation for inline errors, Save/Update disable, and Alt+S gating. */
  const billValidation = useMemo(
    () =>
      bill
        ? validateBill(bill, commodityAvgWeightBounds)
        : { isValid: true as const, errors: {} as ValidationErrors },
    [bill, commodityAvgWeightBounds],
  );
  const validationErrors = billValidation.errors;
  const canPersistSalesBill = useMemo(() => {
    if (!bill) return false;
    const canCreate = can('Billing', 'Create');
    const canEdit = can('Billing', 'Edit');
    const isUpdate = !!(bill.billId && isBackendBillId(bill.billId));
    return isUpdate ? canEdit : canCreate;
  }, [bill, can]);
  const billSaveActionEnabled = billValidation.isValid && canPersistSalesBill;

  const commodityTaxConfigByName = useMemo(() => {
    const map = new Map<string, { hasTax: boolean; defaultMode: 'GST' | 'IGST' | 'NONE' }>();
    if (!fullConfigs.length || !commodities.length) return map;
    commodities.forEach((c: any) => {
      const name = c.commodity_name ?? c.commodityName;
      if (!name) return;
      const cfg = fullConfigs.find(
        (f: FullCommodityConfigDto) => String(f.commodityId) === String(c.commodity_id),
      );
      const gstRate = Number(cfg?.config?.gstRate ?? 0);
      const sgstRate = Number(cfg?.config?.sgstRate ?? 0);
      const cgstRate = Number(cfg?.config?.cgstRate ?? 0);
      const igstRate = Number(cfg?.config?.igstRate ?? 0);
      const hasTax = gstRate > 0 || sgstRate > 0 || cgstRate > 0 || igstRate > 0;
      const defaultMode: 'GST' | 'IGST' | 'NONE' = !hasTax ? 'NONE' : (igstRate > 0 ? 'IGST' : 'GST');
      map.set(name, { hasTax, defaultMode });
    });
    return map;
  }, [commodities, fullConfigs]);

  // Add contact from billing (same fields/validation as Contacts module — add only)
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', mark: '', address: '', enablePortal: false });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [contactsRegistry, setContactsRegistry] = useState<Contact[]>([]);
  const [restorePendingPhone, setRestorePendingPhone] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<'BUYER' | 'BROKER'>('BUYER');
  const [replaceMarkInput, setReplaceMarkInput] = useState('');
  const [replaceSearchResults, setReplaceSearchResults] = useState<Contact[]>([]);
  const [replaceSearchLoading, setReplaceSearchLoading] = useState(false);
  const [replaceSelectedContact, setReplaceSelectedContact] = useState<Contact | null>(null);
  const [replaceForm, setReplaceForm] = useState({ mark: '', name: '', phone: '' });
  const [replaceErrors, setReplaceErrors] = useState<Record<string, string>>({});
  const [addBidDialogOpen, setAddBidDialogOpen] = useState(false);
  const [addBidLotSearch, setAddBidLotSearch] = useState('');
  const addBidLotSearchRef = useRef('');
  addBidLotSearchRef.current = addBidLotSearch;
  /** Full browse list (no status filter — includes SOLD / PARTIAL / PENDING / AVAILABLE). */
  const addBidBrowseLotsRef = useRef<LotSummaryDTO[]>([]);
  const [showAddBidLotDropdown, setShowAddBidLotDropdown] = useState(false);
  const [addBidLotOptions, setAddBidLotOptions] = useState<LotSummaryDTO[]>([]);
  const [addBidLotLoading, setAddBidLotLoading] = useState(false);
  const [addBidSelectedLot, setAddBidSelectedLot] = useState<LotSummaryDTO | null>(null);
  const [addBidRemainingQty, setAddBidRemainingQty] = useState<number>(0);
  const [addBidQty, setAddBidQty] = useState('');
  const [addBidBaseRate, setAddBidBaseRate] = useState('');
  const [addBidExtraAmount, setAddBidExtraAmount] = useState('0');
  const [addBidTokenAdvance, setAddBidTokenAdvance] = useState('0');
  const [addBidSaving, setAddBidSaving] = useState(false);
  /** Cached session for the selected lot (auction parity: merge, lot increase). */
  const [addBidSession, setAddBidSession] = useState<AuctionSessionDTO | null>(null);
  const [addBidRetryAllowIncrease, setAddBidRetryAllowIncrease] = useState(false);
  const [addBidQtyIncreaseDialog, setAddBidQtyIncreaseDialog] = useState<{
    currentTotal: number;
    lotTotal: number;
    attemptedQty: number;
  } | null>(null);
  const [addBidDuplicateDialog, setAddBidDuplicateDialog] = useState<{
    existingEntry: AuctionEntryDTO;
    rate: number;
    qty: number;
  } | null>(null);
  const [searchBidInput, setSearchBidInput] = useState('');
  const [searchBidSourceBuyer, setSearchBidSourceBuyer] = useState<BuyerPurchase | null>(null);
  const [searchBidDialogOpen, setSearchBidDialogOpen] = useState(false);
  const [searchBidSelectedKeys, setSearchBidSelectedKeys] = useState<string[]>([]);
  const [showSearchBidBuyerSuggestions, setShowSearchBidBuyerSuggestions] = useState(false);
  const searchBidBuyerSelectRef = useRef<HTMLDivElement | null>(null);
  const searchBidInputRef = useRef<HTMLInputElement | null>(null);
  const versionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openPrintPreviewRef = useRef<() => void>(() => {});
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<{ commIdx: number; itemIdx: number } | null>(null);
  const billDirtyBaselineRef = useRef<string | null>(null);
  const billDirtyIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    commodityApi.list().then(setCommodities);
    commodityApi.getAllFullConfigs().then(setFullConfigs);
  }, []);

  useEffect(() => () => {
    if (summarySnapTimerRef.current != null) {
      window.clearTimeout(summarySnapTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!bill) {
      latestVersionSnapshotRef.current = null;
      return;
    }
    if (selectedPrintVersion === 'latest') {
      latestVersionSnapshotRef.current = bill;
    }
  }, [bill, selectedPrintVersion]);

  useEffect(() => {
    weighingApi.list({ page: 0, size: 2000 }).then(setWeighingSessions).catch(() => setWeighingSessions([]));
  }, []);

  useEffect(() => {
    if (!addBidDialogOpen) return;
    let cancelled = false;
    setAddBidLotLoading(true);
    void auctionApi
      .listLots({ page: 0, size: 4000 })
      .then(list => {
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        addBidBrowseLotsRef.current = arr;
        if (addBidLotSearchRef.current.trim().length < 2) setAddBidLotOptions(arr);
      })
      .catch(() => {
        if (!cancelled) {
          addBidBrowseLotsRef.current = [];
          if (addBidLotSearchRef.current.trim().length < 2) setAddBidLotOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setAddBidLotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addBidDialogOpen]);

  /** Server search by lot name (backend ignores status — sold lots remain discoverable). */
  useEffect(() => {
    if (!addBidDialogOpen) return;
    const q = addBidLotSearch.trim();
    if (q.length < 2) {
      setAddBidLotOptions(addBidBrowseLotsRef.current);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setAddBidLotLoading(true);
      void auctionApi
        .listLots({ page: 0, size: 1500, q })
        .then(list => {
          if (cancelled) return;
          setAddBidLotOptions(Array.isArray(list) ? list : []);
        })
        .catch(() => {
          if (!cancelled) setAddBidLotOptions([]);
        })
        .finally(() => {
          if (!cancelled) setAddBidLotLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [addBidDialogOpen, addBidLotSearch]);

  const getAddBidLotIdentifier = useCallback((lot: LotSummaryDTO): string => {
    const lotQty = Number(lot.bag_count) || 0;
    const lotName = lot.lot_name || String(lotQty);
    const vTotal = Number(lot.vehicle_total_qty ?? lotQty) || lotQty;
    const sTotal = Number(lot.seller_total_qty ?? lotQty) || lotQty;
    return `${vTotal}/${sTotal}/${lotName}-${lotQty}`;
  }, []);

  const filteredAddBidLots = useMemo(() => {
    const q = addBidLotSearch.trim().toLowerCase();
    const base = addBidLotOptions;
    if (!q) return base.slice(0, 150);
    return base
      .filter(lot => {
        const identifier = getAddBidLotIdentifier(lot).toLowerCase();
        const st = (lot.status || '').toLowerCase();
        return (
          identifier.includes(q)
          || (lot.lot_name || '').toLowerCase().includes(q)
          || String(lot.lot_id || '').toLowerCase().includes(q)
          || (lot.seller_name || '').toLowerCase().includes(q)
          || (lot.vehicle_number || '').toLowerCase().includes(q)
          || st.includes(q)
        );
      })
      .slice(0, 150);
  }, [addBidLotOptions, addBidLotSearch, getAddBidLotIdentifier]);

  // Load saved bills from backend
  const loadSavedBills = useCallback(async () => {
    setSavedBillsLoading(true);
    try {
      const page = await billingApi.getPage({ page: 0, size: 200, sort: 'billDate,desc' });
      setSavedBills(page.content ?? []);
    } catch {
      setSavedBills([]);
    } finally {
      setSavedBillsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSavedBills();
  }, [loadSavedBills]);

  const reloadArrivalDetails = useCallback(async () => {
    const all: ArrivalDetail[] = [];
    for (let page = 0; page < 20; page++) {
      const chunk = await arrivalsApi.listDetail(page, 100);
      if (chunk.length === 0) break;
      all.push(...chunk);
      if (chunk.length < 100) break;
    }
    setArrivalDetails(all);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadArrivalDetails();
      } catch {
        if (!cancelled) setArrivalDetails([]);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadArrivalDetails]);

  const handleResync = useCallback(async () => {
    setResyncing(true);
    try {
      await Promise.all([
        refetchAuctions(),
        commodityApi.list().then(setCommodities),
        commodityApi.getAllFullConfigs().then(setFullConfigs),
        weighingApi.list({ page: 0, size: 2000 }).then(setWeighingSessions).catch(() => setWeighingSessions([])),
        loadSavedBills(),
        reloadArrivalDetails(),
      ]);
      toast.success('Billing data refreshed');
    } catch {
      toast.error('Some data failed to refresh');
    } finally {
      setResyncing(false);
    }
  }, [refetchAuctions, loadSavedBills, reloadArrivalDetails]);

  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'x' || k === 'y' || k === 'z' || k === 'e' || k === 's' || k === 'p' || k === 'n' || k === 'v') {
        e.preventDefault();
      }
      if (k === 'x') setBillingMainTab('create');
      if (k === 'y') setBillingMainTab('progress');
      if (k === 'z') setBillingMainTab('saved');
      if (k === 'l') {
        e.preventDefault();
        if (billingMainTab === 'create' && bill) {
          searchBidInputRef.current?.focus();
        }
      }

      if (!bill || showPrint) return;
      const isUpdate = bill.billId && isBackendBillId(bill.billId);
      if (k === 'e' && isUpdate) {
        setEditLocked(false);
      }
      if (k === 's') {
        if (!bill) return;
        const { isValid } = validateBill(bill, commodityAvgWeightBounds);
        const upd = bill.billId && isBackendBillId(bill.billId);
        const okPerm = (upd && can('Billing', 'Edit')) || (!upd && can('Billing', 'Create'));
        if (!isValid || !okPerm) return;
        void handleSaveDraft();
      }
      if (k === 'p') {
        openPrintPreviewRef.current();
      }
      if (k === 'n') {
        handleCreateNewBill();
      }
      if (
        k === 'v'
        && Array.isArray((bill as any).versions)
        && (bill as any).versions.length > 0
      ) {
        versionTriggerRef.current?.focus();
        versionTriggerRef.current?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, bill, showPrint, commodityAvgWeightBounds, can]);

  const openContactFromBilling = async () => {
    if (!canCreateContact) {
      toast.error('You do not have permission to create contacts.');
      return;
    }
    setContactForm({ name: '', phone: '', mark: '', address: '', enablePortal: false });
    setContactErrors({});
    try {
      const list = await contactApi.list({ scope: 'registry' });
      setContactsRegistry(list);
    } catch {
      setContactsRegistry([]);
    }
    setContactSheetOpen(true);
  };

  const closeContactSheet = () => {
    setContactSheetOpen(false);
    setContactErrors({});
  };

  const validateBillingContactForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!contactForm.name.trim()) errs.name = 'Name is required';
    if (contactForm.phone.trim() && !/^[6-9]\d{9}$/.test(contactForm.phone.trim())) {
      errs.phone = 'Enter a valid 10-digit mobile number';
    } else if (contactForm.phone.trim() && contactsRegistry.some(c => c.phone === contactForm.phone.trim())) {
      errs.phone = 'This phone number is already registered';
    }
    if (contactForm.mark.trim()) {
      const markLower = contactForm.mark.trim().toLowerCase();
      const hasDuplicate = contactsRegistry.some(
        c => c.mark && c.mark.toLowerCase() === markLower,
      );
      if (hasDuplicate) errs.mark = 'This mark is already in use by another contact';
    }
    setContactErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitBillingContactAdd = async () => {
    if (!canCreateContact) {
      toast.error('You do not have permission to create contacts.');
      return;
    }
    if (!validateBillingContactForm()) return;
    try {
      await contactApi.create({
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        mark: contactForm.mark.trim().toUpperCase(),
        address: contactForm.address.trim(),
        trader_id: '',
      });
      closeContactSheet();
      toast.success(`Contact ${contactForm.name.trim()} registered`);
    } catch (err) {
      if (err instanceof ContactApiError && err.errorKey === 'phoneexistsinactive') {
        setRestorePendingPhone(contactForm.phone.trim());
        closeContactSheet();
        return;
      }
      if (err instanceof ContactApiError && err.errorKey === 'markexists') {
        setContactErrors(prev => ({ ...prev, mark: err.message }));
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to register contact');
    }
  };

  const handleRestoreContactFromBilling = async () => {
    if (!restorePendingPhone || !canEditContact) return;
    const phone = restorePendingPhone;
    try {
      const existing = await contactApi.getByPhone(phone);
      if (!existing) {
        toast.error('Contact no longer found');
        setRestorePendingPhone(null);
        return;
      }
      await contactApi.restore(existing.contact_id);
      setRestorePendingPhone(null);
      toast.success(`Contact with phone ${phone} restored.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore contact');
    }
  };

  const clearReplacementInline = () => {
    setReplaceMarkInput('');
    setReplaceSearchResults([]);
    setReplaceSearchLoading(false);
    setReplaceSelectedContact(null);
    setReplaceForm({ mark: '', name: '', phone: '' });
    setReplaceErrors({});
  };

  useEffect(() => {
    const q = replaceMarkInput.trim();
    const selectedKey = (replaceSelectedContact?.mark || replaceSelectedContact?.name || '').trim().toUpperCase();
    if (replaceSelectedContact && selectedKey && selectedKey === q.toUpperCase()) {
      setReplaceSearchResults([]);
      setReplaceSearchLoading(false);
      return;
    }
    if (!q) {
      setReplaceSearchResults([]);
      setReplaceSearchLoading(false);
      return;
    }
    let active = true;
    setReplaceSearchLoading(true);
    const timer = window.setTimeout(() => {
      void contactApi.search(q)
        .then(results => {
          if (!active) return;
          setReplaceSearchResults(Array.isArray(results) ? results.slice(0, 10) : []);
        })
        .catch(() => {
          if (!active) return;
          setReplaceSearchResults([]);
        })
        .finally(() => {
          if (active) setReplaceSearchLoading(false);
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [replaceMarkInput, replaceSelectedContact]);

  const pickReplacementContact = (contact: Contact) => {
    setReplaceSelectedContact(contact);
    setReplaceForm({
      mark: (contact.mark ?? '').toUpperCase(),
      name: contact.name ?? '',
      phone: contact.phone ?? '',
    });
    setReplaceMarkInput(contact.mark || contact.name || '');
    setReplaceSearchResults([]);
    setReplaceSearchLoading(false);
    setReplaceErrors({});
  };

  const validateReplacementForm = (): boolean => {
    const errs: Record<string, string> = {};
    const trimmedMark = replaceForm.mark.trim().toUpperCase();
    const trimmedName = replaceForm.name.trim();
    const trimmedPhone = replaceForm.phone.trim();
    if (!trimmedMark) errs.mark = 'Mark is required';
    if (!trimmedName) errs.name = 'Name is required';
    if (trimmedPhone && !/^[6-9]\d{9}$/.test(trimmedPhone)) errs.phone = 'Enter a valid 10-digit mobile number';
    setReplaceErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const applyReplacementContact = (contact: Contact) => {
    const nextName = contact.name?.trim() || '';
    const nextMark = (contact.mark?.trim() || nextName.slice(0, 4)).toUpperCase();
    if (replaceTarget === 'BUYER') {
      setSelectedBuyer(prev => (prev ? { ...prev, buyerName: nextName, buyerMark: nextMark, buyerContactId: contact.contact_id } : prev));
      setBuyerBidMarkInput(nextMark || nextName);
    }
    setBill(prev => {
      if (!prev) return prev;
      if (replaceTarget === 'BROKER') {
        return {
          ...prev,
          brokerName: nextName,
          brokerMark: nextMark,
          brokerContactId: contact.contact_id,
          brokerPhone: contact.phone ?? '',
          brokerAddress: contact.address ?? '',
          buyerAsBroker: false,
        };
      }
      return {
        ...prev,
        buyerName: nextName,
        buyerMark: nextMark,
        buyerContactId: contact.contact_id,
        buyerPhone: contact.phone ?? '',
        buyerAddress: contact.address ?? '',
        billingName: nextName,
      };
    });
  };

  const submitReplacement = async () => {
    const hadExistingSelection = !!replaceSelectedContact;
    let resolved: Contact | null = replaceSelectedContact;
    if (!resolved) {
      if (!canCreateContact) {
        toast.error('You do not have permission to create contacts.');
        return;
      }
      if (!validateReplacementForm()) return;
      try {
        resolved = await contactApi.create({
          name: replaceForm.name.trim(),
          phone: replaceForm.phone.trim(),
          mark: replaceForm.mark.trim().toUpperCase(),
          trader_id: '',
        });
      } catch (err) {
        if (err instanceof ContactApiError && err.errorKey === 'markexists') {
          setReplaceErrors(prev => ({ ...prev, mark: err.message }));
          return;
        }
        if (err instanceof ContactApiError && err.errorKey === 'phoneexistsinactive') {
          setReplaceErrors(prev => ({ ...prev, phone: 'Phone exists on inactive contact. Restore from Contacts module first.' }));
          return;
        }
        toast.error(err instanceof Error ? err.message : 'Failed to create contact');
        return;
      }
    }
    if (!resolved) return;
    applyReplacementContact(resolved);
    clearReplacementInline();
    const role = replaceTarget === 'BROKER' ? 'Broker' : 'Buyer';
    toast.success(hadExistingSelection ? `${role} updated for this bill.` : `${role} added to this bill.`);

    if (replaceTarget === 'BUYER' && bill) {
      const nextName = resolved.name?.trim() || '';
      const nextMark = (resolved.mark?.trim() || nextName.slice(0, 4)).toUpperCase();
      const patched: BillData = {
        ...bill,
        buyerName: nextName,
        buyerMark: nextMark,
        buyerContactId: resolved.contact_id ?? null,
        buyerPhone: resolved.phone ?? '',
        buyerAddress: resolved.address ?? '',
        billingName: nextName || bill.billingName,
      };
      void (async () => {
        try {
          if (patched.commodityGroups.some(g => (g.items?.length ?? 0) > 0)) {
            await syncAuctionEntriesToBillBuyer(patched);
          }
          await refetchAuctions();
        } catch {
          toast.warning(
            'Buyer updated on the bill, but some auction bids could not be reassigned. Save the bill to retry, or fix in Sales Pad.',
          );
        }
      })();
    }
  };

  // Load buyer data from completed auctions (arrivals from API; weighing from API)
  useEffect(() => {
    const buyerMap = new Map<string, BuyerPurchase>();
    const lotTotalsByLotId = new Map<string, number>();

    // Compute vehicle & seller totals (same logic as Auctions/Logistics)
    const vehicleTotals = new Map<string, number>();
    const vehicleSellerTotals = new Map<string, number>();
    auctionData.forEach((auction: any) => {
      const vKey = auction.vehicleNumber || '';
      const sKey = `${vKey}||${auction.sellerName || ''}`;
      const lotKey = String(auction.lotId ?? '');
      const lotTotal = (auction.entries || []).reduce((s: number, e: any) => {
        if (e.isSelfSale) return s;
        return s + (Number(e.quantity) || 0);
      }, 0);
      if (!lotTotalsByLotId.has(lotKey)) {
        lotTotalsByLotId.set(lotKey, lotTotal);
      }
      (auction.entries || []).forEach((entry: any) => {
        if (entry.isSelfSale) return;
        const qty = Number(entry.quantity) || 0;
        vehicleTotals.set(vKey, (vehicleTotals.get(vKey) ?? 0) + qty);
        vehicleSellerTotals.set(sKey, (vehicleSellerTotals.get(sKey) ?? 0) + qty);
      });
    });

    auctionData.forEach((auction: any) => {
      let sellerName = auction.sellerName || 'Unknown';
      let lotName = auction.lotName || '';
      const commodityName = auction.commodityName || '';

      arrivalDetails.forEach((arr) => {
        (arr.sellers || []).forEach((seller) => {
          (seller.lots || []).forEach((lot) => {
            if (String(lot.id) === String(auction.lotId)) {
              sellerName = seller.sellerName;
              lotName = lot.lotName || lotName;
            }
          });
        });
      });

      const vKey = auction.vehicleNumber || '';
      const sKey = `${vKey}||${sellerName || ''}`;

      (auction.entries || []).forEach((entry: any) => {
        if (entry.isSelfSale) return;

        /** Same grouping as Sales Pad participating buyers: registered contacts (incl. global) by id; scribble by mark+name. */
        const regId =
          entry.buyerId != null && Number.isFinite(Number(entry.buyerId)) ? Number(entry.buyerId) : null;
        const key =
          regId != null
            ? `r:${regId}`
            : `t:${(entry.buyerMark || '').trim().toLowerCase()}|${(entry.buyerName || '').trim().toLowerCase()}`;
        if (!buyerMap.has(key)) {
          buyerMap.set(key, {
            buyerMark: entry.buyerMark,
            buyerName: entry.buyerName,
            buyerContactId: entry.buyerContactId ?? (entry.buyerId != null ? String(entry.buyerId) : null),
            entries: [],
            tokenAdvanceTotal: 0,
          });
        }

        const tokenAdvance = Number(entry.tokenAdvance) || 0;
        const buyerEntry = buyerMap.get(key)!;
        buyerEntry.tokenAdvanceTotal += tokenAdvance;

        const weight = 0;

        buyerEntry.entries.push({
          bidNumber: entry.bidNumber,
          lotId: String(auction.lotId ?? ''),
          lotName,
          auctionEntryId: entry.auctionEntryId ?? null,
          selfSaleUnitId: auction.selfSaleUnitId != null ? Number(auction.selfSaleUnitId) : null,
          lotTotalQty: lotTotalsByLotId.get(String(auction.lotId ?? '')) ?? entry.quantity,
          sellerName,
          commodityName,
          rate: entry.rate,
          quantity: entry.quantity,
          weight,
          vehicleTotalQty: vehicleTotals.get(vKey) ?? entry.quantity,
          sellerVehicleQty: vehicleSellerTotals.get(sKey) ?? entry.quantity,
          presetApplied: entry.presetApplied || 0,
          isSelfSale: Boolean(entry.isSelfSale),
          tokenAdvance,
        });
      });
    });

    setBuyers(Array.from(buyerMap.values()));
  }, [auctionData, weighingSessions, arrivalDetails]);

  const excludeBillIdForReservation = bill && isBackendBillId(bill.billId) ? bill.billId : null;
  const reservedBidKeysOnOtherBills = useMemo(
    () => collectReservedBidKeysFromSalesBills(savedBills, excludeBillIdForReservation),
    [savedBills, excludeBillIdForReservation],
  );

  const buyersForBilling = useMemo(
    () =>
      buyers
        .map(b => {
          const entries = b.entries.filter(e => !isBillEntryReservedOnOtherSalesBill(e, reservedBidKeysOnOtherBills));
          const tokenAdvanceTotal = entries.reduce((s, e) => s + (Number(e.tokenAdvance) || 0), 0);
          return { ...b, entries, tokenAdvanceTotal };
        })
        .filter(b => b.entries.length > 0),
    [buyers, reservedBidKeysOnOtherBills],
  );

  useEffect(() => {
    if (!selectedBuyerFromDropdown) return;
    const still = buyersForBilling.some(
      b =>
        (b.buyerMark || '').toLowerCase() === (selectedBuyerFromDropdown.buyerMark || '').toLowerCase()
        && (b.buyerName || '').toLowerCase() === (selectedBuyerFromDropdown.buyerName || '').toLowerCase(),
    );
    if (!still) setSelectedBuyerFromDropdown(null);
  }, [buyersForBilling, selectedBuyerFromDropdown]);

  useEffect(() => {
    if (!selectBidBuyer) return;
    const still = buyersForBilling.some(
      b =>
        (b.buyerMark || '').toLowerCase() === (selectBidBuyer.buyerMark || '').toLowerCase()
        && (b.buyerName || '').toLowerCase() === (selectBidBuyer.buyerName || '').toLowerCase(),
    );
    if (!still) {
      setSelectBidBuyer(null);
      setSelectedBidKeys([]);
    }
  }, [buyersForBilling, selectBidBuyer]);

  // Recalculate grand total (includes per-commodity discount and round-off)
  const recalcGrandTotal = useCallback((b: BillData): BillData => {
    const calculateGroupCharges = (group: CommodityGroup) => {
      const sub = roundMoney2(group.subtotal);
      const commissionAmount = percentOfAmount(sub, group.commissionPercent || 0);
      const userFeeAmount = percentOfAmount(sub, group.userFeePercent || 0);
      const gstAmount = gstOnSubtotal(sub, effectiveGstPercent(group));
      const totalCharges = roundMoney2(commissionAmount + userFeeAmount + gstAmount);
      return { commissionAmount, userFeeAmount, totalCharges };
    };

    const commodityGroups = b.commodityGroups.map(group => {
      const next = { ...group };
      const charges = calculateGroupCharges(next);
      next.commissionAmount = charges.commissionAmount;
      next.userFeeAmount = charges.userFeeAmount;
      next.totalCharges = charges.totalCharges;
      return next;
    });

    let grandTotal = 0;
    commodityGroups.forEach(group => {
      const subtotalWithCharges = roundMoney2(group.subtotal + group.totalCharges);
      const additionsSum = roundMoney2((group.coolieAmount || 0) + (group.weighmanChargeAmount || 0));
      let discountAmount = roundMoney2(group.discount || 0);
      if (group.discountType === 'PERCENT') {
        discountAmount = percentOfAmount(subtotalWithCharges, discountAmount);
      }
      const commodityTotal = roundMoney2(
        subtotalWithCharges + additionsSum - discountAmount + roundMoney2(group.manualRoundOff || 0),
      );
      grandTotal = roundMoney2(grandTotal + commodityTotal);
    });

    grandTotal = roundMoney2(grandTotal + roundMoney2(b.outboundFreight || 0));

    const tokenAdvance = sumLineTokenAdvances({ ...b, commodityGroups });
    const pendingBalance = roundMoney2(grandTotal - tokenAdvance);
    return roundBillMoneyValues({ ...b, commodityGroups, grandTotal, pendingBalance, tokenAdvance });
  }, []);

  const serializeBillForDirty = useCallback((b: BillData): string => {
    return JSON.stringify({
      billId: b.billId,
      buyerName: b.buyerName,
      buyerMark: b.buyerMark,
      buyerContactId: b.buyerContactId,
      buyerPhone: b.buyerPhone,
      buyerAddress: b.buyerAddress,
      buyerAsBroker: b.buyerAsBroker,
      brokerName: b.brokerName,
      brokerMark: b.brokerMark,
      brokerContactId: b.brokerContactId,
      brokerPhone: b.brokerPhone,
      brokerAddress: b.brokerAddress,
      billingName: b.billingName,
      billDate: b.billDate,
      commodityGroups: b.commodityGroups,
      outboundFreight: b.outboundFreight,
      outboundVehicle: b.outboundVehicle,
      tokenAdvance: b.tokenAdvance,
      grandTotal: b.grandTotal,
      brokerageType: b.brokerageType,
      brokerageValue: b.brokerageValue,
      globalOtherCharges: b.globalOtherCharges,
      pendingBalance: b.pendingBalance,
    });
  }, []);

  useEffect(() => {
    if (!bill) {
      billDirtyBaselineRef.current = null;
      billDirtyIdentityRef.current = null;
      return;
    }
    const identity = String(bill.billId ?? '');
    if (billDirtyIdentityRef.current !== identity) {
      billDirtyIdentityRef.current = identity;
      billDirtyBaselineRef.current = serializeBillForDirty(bill);
    }
  }, [bill, serializeBillForDirty]);

  useEffect(() => {
    if (!bill) return;
    let mutated = false;
    const nextGroups: CommodityGroup[] = bill.commodityGroups.map(group => {
      const taxCfg = commodityTaxConfigByName.get(group.commodityName);
      const hasTax = taxCfg?.hasTax ?? false;
      if (!hasTax) {
        if ((group.gstRate ?? 0) !== 0 || (group.sgstRate ?? 0) !== 0 || (group.cgstRate ?? 0) !== 0 || (group.igstRate ?? 0) !== 0 || group.taxMode !== 'NONE') {
          mutated = true;
          return { 
            ...group, 
            taxMode: 'NONE' as const, 
            gstRate: 0, 
            sgstRate: 0, 
            cgstRate: 0, 
            igstRate: 0 
          };
        }
        return group;
      }
      if (group.taxMode === 'NONE') {
        mutated = true;
        return { 
          ...group, 
          taxMode: (taxCfg?.defaultMode === 'IGST' ? 'IGST' : 'GST') as 'IGST' | 'GST' 
        };
      }
      return group;
    });
    if (!mutated) return;
    setBill(recalcGrandTotal({ ...bill, commodityGroups: nextGroups }));
  }, [bill, commodityTaxConfigByName, recalcGrandTotal]);

  // Generate Bill (commodity config from API)
  const generateBill = useCallback((buyer: BuyerPurchase) => {
    setSelectedBuyer(buyer);
    const commodityMap = new Map<string, CommodityGroup>();

    // Derive "Other Charges" rate-add from commodity dynamic charges (REQ-BIL-002 / REQ-BIL-007).
    // These dynamic charges are configured as either PERCENT or FIXED with appliesTo=BUYER/SELLER.
    const computeBuyerOtherChargesRateAdd = (entry: BillEntry, commName: string, divisor: number): number => {
      const commodity = commodities.find((c: any) => c.commodity_name === commName);
      const fullCfg = commodity
        ? fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(commodity.commodity_id))
        : null;
      const dynCharges = fullCfg?.dynamicCharges ?? [];
      if (!dynCharges.length) return 0;

      const brokerage = 0; // initial; user can edit brokerage/otherCharges afterwards
      const presetApplied = entry.presetApplied ?? 0;
      const baseNewRateWithoutOther = (entry.rate || 0) + presetApplied + brokerage;

      const weight = entry.weight || 0;
      const baseAmount = (weight * baseNewRateWithoutOther) / (divisor > 0 ? divisor : 50);

      let sumRateAdd = 0;
      dynCharges.forEach((ch: any) => {
        const appliesTo = String(ch.appliesTo || 'BUYER').toUpperCase();
        if (appliesTo !== 'BUYER') return; // buyer bill only includes BUYER-side charges

        const chargeType = String(ch.chargeType || ch.charge_type || 'FIXED').toUpperCase();
        const value = Number(ch.valueAmount ?? ch.value ?? 0) || 0;
        if (value <= 0) return;

        if (chargeType === 'PERCENT') {
          const chargeTotal = baseAmount * (value / 100);
          const rateAdd = weight > 0 ? (chargeTotal * divisor) / weight : 0;
          sumRateAdd += rateAdd;
          return;
        }

        const fixedBasis = String(ch.fixedBasis || ch.fixed_basis || 'PER_50KG').toUpperCase();
        if (fixedBasis === 'PER_COUNT') {
          const qty = entry.quantity || 0;
          const chargeTotal = value * qty;
          const rateAdd = weight > 0 ? (chargeTotal * divisor) / weight : 0;
          sumRateAdd += rateAdd;
        } else {
          // PER_50KG default: value is configured as fixed ₹ per 50kg
          const rateAdd = value * (divisor / 50);
          sumRateAdd += rateAdd;
        }
      });

      return sumRateAdd;
    };

    const computeSellerOtherChargesRateAdd = (entry: BillEntry, commName: string, divisor: number): number => {
      const commodity = commodities.find((c: any) => c.commodity_name === commName);
      const fullCfg = commodity
        ? fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(commodity.commodity_id))
        : null;
      const dynCharges = fullCfg?.dynamicCharges ?? [];
      if (!dynCharges.length) return 0;

      const brokerage = 0; // initial; user can edit brokerage/otherCharges afterwards
      const presetApplied = entry.presetApplied ?? 0;
      const baseNewRateWithoutOther = (entry.rate || 0) + presetApplied + brokerage;

      const weight = entry.weight || 0;
      const baseAmount = (weight * baseNewRateWithoutOther) / (divisor > 0 ? divisor : 50);

      let sumRateAdd = 0;
      dynCharges.forEach((ch: any) => {
        const appliesTo = String(ch.appliesTo || 'BUYER').toUpperCase();
        if (appliesTo !== 'SELLER') return; // seller-side charges are for settlement deductions

        const chargeType = String(ch.chargeType || ch.charge_type || 'FIXED').toUpperCase();
        const value = Number(ch.valueAmount ?? ch.value ?? 0) || 0;
        if (value <= 0) return;

        if (chargeType === 'PERCENT') {
          const chargeTotal = baseAmount * (value / 100);
          const rateAdd = weight > 0 ? (chargeTotal * divisor) / weight : 0;
          sumRateAdd += rateAdd;
          return;
        }

        const fixedBasis = String(ch.fixedBasis || ch.fixed_basis || 'PER_50KG').toUpperCase();
        if (fixedBasis === 'PER_COUNT') {
          const qty = entry.quantity || 0;
          const chargeTotal = value * qty;
          const rateAdd = weight > 0 ? (chargeTotal * divisor) / weight : 0;
          sumRateAdd += rateAdd;
        } else {
          // PER_50KG default: value is configured as fixed ₹ per 50kg
          const rateAdd = value * (divisor / 50);
          sumRateAdd += rateAdd;
        }
      });

      return sumRateAdd;
    };

    buyer.entries.forEach(entry => {
      const commName = entry.commodityName || 'Unknown';
      if (!commodityMap.has(commName)) {
        const commodity = commodities.find((c: any) => c.commodity_name === commName);
        const fullCfg = commodity ? fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(commodity.commodity_id)) : null;
        const config = fullCfg?.config;
        const divisorRaw = config?.ratePerUnit ?? 50;
        const divisor = Number(divisorRaw) > 0 ? Number(divisorRaw) : 50;

        commodityMap.set(commName, {
          commodityName: commName,
          hsnCode: config?.hsnCode || '',
          taxMode:
            Number(config?.gstRate ?? 0) > 0
            || Number(config?.sgstRate ?? 0) > 0
            || Number(config?.cgstRate ?? 0) > 0
            || Number(config?.igstRate ?? 0) > 0
              ? (Number(config?.igstRate ?? 0) > 0 ? 'IGST' : 'GST')
              : 'NONE',
          gstInputMode: 'PERCENT',
          sgstInputMode: 'PERCENT',
          cgstInputMode: 'PERCENT',
          igstInputMode: 'PERCENT',
          gstRate: 0,
          sgstRate: config?.sgstRate ?? 0,
          cgstRate: config?.cgstRate ?? 0,
          igstRate: config?.igstRate ?? 0,
          divisor,
          commissionPercent: config?.commissionPercent || 0,
          userFeePercent: config?.userFeePercent || 0,
          coolieRate: 0,
          coolieAmount: 0,
          weighmanChargeRate: 0,
          weighmanChargeAmount: 0,
          discount: 0,
          discountType: 'AMOUNT' as const,
          manualRoundOff: 0,
          items: [],
          subtotal: 0,
          commissionAmount: 0,
          userFeeAmount: 0,
          totalCharges: 0,
        });
      }

      const group = commodityMap.get(commName)!;

      // REQ-BIL-002: NR = B + P + BRK + Other Charges
      const brokerage = 0; // default, can be edited
      const presetApplied = entry.presetApplied ?? 0;
      // Show preset inside "Other Charges" so UI displays total rate-add in one field.
      const otherCharges = presetApplied + computeBuyerOtherChargesRateAdd(entry, commName, group.divisor);
      const sellerOtherCharges = computeSellerOtherChargesRateAdd(entry, commName, group.divisor);
      const div = group.divisor > 0 ? group.divisor : 50;
      const newRate = roundMoney2(entry.rate + brokerage + otherCharges);
      const amount = roundMoney2((entry.weight * newRate) / div);

      group.items.push({
        bidNumber: entry.bidNumber,
        lotName: entry.lotName,
        lotId: String(entry.lotId ?? ''),
        auctionEntryId: entry.auctionEntryId ?? null,
        selfSaleUnitId: entry.selfSaleUnitId ?? null,
        lotTotalQty: (entry as any).lotTotalQty ?? entry.quantity,
        sellerName: entry.sellerName,
        quantity: roundMoney2(entry.quantity),
        weight: roundMoney2(entry.weight),
        baseRate: roundMoney2(entry.rate),
        presetApplied: roundMoney2(presetApplied),
        brokerage: roundMoney2(brokerage),
        otherCharges: roundMoney2(otherCharges),
        sellerOtherCharges: roundMoney2(sellerOtherCharges),
        vehicleTotalQty: (entry as any).vehicleTotalQty,
        sellerVehicleQty: (entry as any).sellerVehicleQty,
        newRate,
        amount,
        tokenAdvance: roundMoney2(Number(entry.tokenAdvance) || 0),
      });
    });

    // Calculate per-commodity totals
    commodityMap.forEach(group => {
      group.subtotal = roundMoney2(group.items.reduce((s, item) => s + item.amount, 0));
      group.commissionAmount = percentOfAmount(group.subtotal, group.commissionPercent);
      group.userFeeAmount = percentOfAmount(group.subtotal, group.userFeePercent);
      const gst = gstOnSubtotal(group.subtotal, effectiveGstPercent(group));
      group.totalCharges = roundMoney2(group.commissionAmount + group.userFeeAmount + gst);
    });

    const commodityGroups = Array.from(commodityMap.values()).map(g => ({
      ...g,
      coolieRate: 0,
      coolieAmount: 0,
      weighmanChargeRate: 0,
      weighmanChargeAmount: 0,
      discount: 0,
      discountType: 'AMOUNT' as const,
      manualRoundOff: 0,
    }));
    const subtotalSum = roundMoney2(commodityGroups.reduce((s, g) => s + g.subtotal + g.totalCharges, 0));

    // REQ-BIL-009: GT = Σ(Commodity Totals with per-commodity additions/discounts/round-off) + Outbound Freight
    const initialBill: BillData = {
      billId: crypto.randomUUID(),
      billNumber: '', // Generated on print (per SRS)
      buyerName: buyer.buyerName,
      buyerMark: buyer.buyerMark,
      buyerContactId: buyer.buyerContactId ?? null,
      buyerPhone: '',
      buyerAddress: '',
      buyerAsBroker: false,
      brokerName: '',
      brokerMark: '',
      brokerContactId: null,
      brokerPhone: '',
      brokerAddress: '',
      billingName: buyer.buyerName,
      billDate: new Date().toISOString(),
      commodityGroups,
      outboundFreight: 0,
      outboundVehicle: '',
      tokenAdvance: 0,
      grandTotal: subtotalSum,
      brokerageType: 'AMOUNT',
      brokerageValue: 0,
      globalOtherCharges: 0,
      pendingBalance: subtotalSum,
      versions: [],
    };
    const finalBill = recalcGrandTotal(initialBill);
    setBill(finalBill);
    setEditLocked(false);
    return finalBill;
  }, [commodities, fullConfigs, recalcGrandTotal]);

  const billingBuyerPatchBody = useCallback((billData: BillData): AuctionBidUpdateRequest => {
    const buyerIdNum =
      billData.buyerContactId && /^\d+$/.test(String(billData.buyerContactId))
        ? Number(billData.buyerContactId)
        : null;
    return {
      billing_reassign_buyer: true,
      buyer_name: (billData.billingName || billData.buyerName || '').trim(),
      buyer_mark: (billData.buyerMark || '').trim(),
      buyer_id: buyerIdNum,
    };
  }, []);

  const syncAuctionEntriesToBillBuyer = useCallback(
    async (billData: BillData, options?: { lineFilter?: (item: BillLineItem) => boolean }) => {
      const filter = options?.lineFilter ?? (() => true);
      const body = billingBuyerPatchBody(billData);
      const auctions: AuctionResultDTO[] = Array.isArray(auctionData) ? (auctionData as AuctionResultDTO[]) : [];
      const tasks: Promise<unknown>[] = [];
      for (const g of billData.commodityGroups || []) {
        for (const rawItem of g.items || []) {
          const item = rawItem as BillLineItem;
          if (!filter(item)) continue;
          const entryId =
            item.auctionEntryId != null && Number.isFinite(Number(item.auctionEntryId))
              ? Number(item.auctionEntryId)
              : resolveAuctionEntryIdFromResults(item, auctions);
          if (entryId == null) continue;
          const lotId = String(item.lotId || '').trim();
          if (!lotId) continue;
          const selfSaleUnitId =
            item.selfSaleUnitId != null && Number.isFinite(Number(item.selfSaleUnitId))
              ? Number(item.selfSaleUnitId)
              : resolveSelfSaleUnitIdFromResults(lotId, auctions);
          if (selfSaleUnitId != null) {
            tasks.push(auctionApi.updateSelfSaleBid(selfSaleUnitId, entryId, body));
          } else {
            tasks.push(auctionApi.updateBid(lotId, entryId, body));
          }
        }
      }
      // Was sequential await per line (N round-trips); batch parallel requests to cap server load.
      const concurrency = 12;
      for (let i = 0; i < tasks.length; i += concurrency) {
        await Promise.all(tasks.slice(i, i + concurrency));
      }
    },
    [auctionData, billingBuyerPatchBody],
  );

  const findBuyerByInput = useCallback((): BuyerPurchase | null => {
    if (selectedBuyerFromDropdown) {
      if (selectedBuyerFromDropdown.entries.length === 0) {
        toast.error('Selected buyer has no bids yet.');
        return null;
      }
      return selectedBuyerFromDropdown;
    }

    const raw = buyerBidMarkInput.trim();
    if (!raw) {
      toast.error('Enter buyer bid mark');
      return null;
    }
    const q = raw.toLowerCase();
    const exactBuyer = buyersForBilling.find(
      b =>
        (b.buyerMark?.trim().toLowerCase() === q)
        || (b.buyerName?.trim().toLowerCase() === q),
    );
    if (exactBuyer) {
      if (exactBuyer.entries.length === 0) {
        toast.error('Selected buyer has no bids yet.');
        return null;
      }
      return exactBuyer;
    }

    const partial = buyersForBilling.filter(
      b =>
        b.buyerMark?.toLowerCase().includes(q)
        || b.buyerName?.toLowerCase().includes(q),
    );
    if (partial.length === 1) {
      if (partial[0].entries.length === 0) {
        toast.error('Selected buyer has no bids yet.');
        return null;
      }
      return partial[0];
    }
    if (partial.length > 1) {
      toast.error('Multiple buyers found. Select one from dropdown.');
      setShowBuyerSuggestions(true);
      return null;
    }

    if (partial.length === 0) {
      toast.error('No buyer with unbilled bids found for this mark. Check auctions, weighing, or bills in progress / saved.');
      return null;
    }
    return null;
  }, [buyerBidMarkInput, buyersForBilling, selectedBuyerFromDropdown]);

  const handleGetBidsForMark = useCallback(async () => {
    const buyer = findBuyerByInput();
    if (!buyer) return;
    const switchingBuyer =
      !!selectedBuyer &&
      (selectedBuyer.buyerMark !== buyer.buyerMark || selectedBuyer.buyerName !== buyer.buyerName);
    if (switchingBuyer) {
      const saved = await autoSaveCurrentBillBeforeBuyerSwitch();
      if (!saved) return;
    }
    setShowBuyerSuggestions(false);
    setSelectBidBuyer(null);
    setSelectedBidKeys([]);
    generateBill(buyer);
  }, [autoSaveCurrentBillBeforeBuyerSwitch, findBuyerByInput, generateBill, selectedBuyer]);

  const currentBillBidKeys = useMemo(() => {
    if (!bill) return new Set<string>();
    const keys = new Set<string>();
    for (const group of bill.commodityGroups || []) {
      for (const item of group.items || []) {
        keys.add(`${item.bidNumber}::${String(item.lotId ?? '').trim()}`);
      }
    }
    return keys;
  }, [bill]);

  const handleSelectBidMode = useCallback(() => {
    const buyer = findBuyerByInput();
    if (!buyer) return;
    setShowBuyerSuggestions(false);
    setSelectBidBuyer(buyer);
    const preselected = buyer.entries
      .map(e => getBidSelectionKey(e))
      .filter(key => currentBillBidKeys.has(key));
    setSelectedBidKeys(preselected);
    toast.success(`Loaded ${buyer.entries.length} bids. Select required bids to create bill.`);
  }, [currentBillBidKeys, findBuyerByInput]);

  const toggleBidSelection = (entry: Pick<BillEntry, 'bidNumber' | 'lotId'>) => {
    const key = getBidSelectionKey(entry);
    setSelectedBidKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
    );
  };

  const handleCreateBillFromSelected = useCallback(async () => {
    if (!selectBidBuyer) return;
    if (selectedBidKeys.length === 0) {
      toast.error('Select at least one lot to create bill');
      return;
    }
    const selectedEntries = selectBidBuyer.entries.filter(e => selectedBidKeys.includes(getBidSelectionKey(e)));
    if (selectedEntries.length === 0) {
      toast.error('Selected lots are not available');
      return;
    }
    const switchingBuyer =
      !!selectedBuyer &&
      (selectedBuyer.buyerMark !== selectBidBuyer.buyerMark || selectedBuyer.buyerName !== selectBidBuyer.buyerName);
    if (switchingBuyer) {
      const saved = await autoSaveCurrentBillBeforeBuyerSwitch();
      if (!saved) return;
    }
    generateBill({ ...selectBidBuyer, entries: selectedEntries });
    setSelectBidBuyer(null);
    setSelectedBidKeys([]);
  }, [autoSaveCurrentBillBeforeBuyerSwitch, generateBill, selectBidBuyer, selectedBidKeys, selectedBuyer]);

  const resetAddBidForm = useCallback(() => {
    setAddBidLotSearch('');
    setShowAddBidLotDropdown(false);
    setAddBidLotOptions([]);
    setAddBidSelectedLot(null);
    setAddBidRemainingQty(0);
    setAddBidSession(null);
    setAddBidRetryAllowIncrease(false);
    setAddBidQtyIncreaseDialog(null);
    setAddBidDuplicateDialog(null);
    setAddBidQty('');
    setAddBidBaseRate('');
    setAddBidExtraAmount('0');
    setAddBidTokenAdvance('0');
  }, []);

  const appendBidForBuyer = useCallback((buyerKey: string, buyerName: string, buyerMark: string, buyerContactId: string | null, entry: BillEntry) => {
    setBuyers(prev => {
      const idx = prev.findIndex(
        b => (b.buyerMark || '').toLowerCase() === buyerMark.toLowerCase() && (b.buyerName || '').toLowerCase() === buyerName.toLowerCase(),
      );
      if (idx < 0) {
        return [...prev, { buyerName, buyerMark, buyerContactId, entries: [entry], tokenAdvanceTotal: Number(entry.tokenAdvance) || 0 }];
      }
      const next = [...prev];
      const existing = next[idx];
      next[idx] = {
        ...existing,
        entries: [...existing.entries, entry],
        tokenAdvanceTotal: (existing.tokenAdvanceTotal || 0) + (Number(entry.tokenAdvance) || 0),
      };
      return next;
    });
    setSelectedBuyer(prev => {
      if (!prev) return prev;
      const key = `${(prev.buyerMark || '').toLowerCase()}::${(prev.buyerName || '').toLowerCase()}`;
      if (key !== buyerKey) return prev;
      return {
        ...prev,
        entries: [...prev.entries, entry],
        tokenAdvanceTotal: (prev.tokenAdvanceTotal || 0) + (Number(entry.tokenAdvance) || 0),
      };
    });
  }, []);

  /** When auction merges bids (same mark + rate), update the existing bill line instead of appending. */
  const upsertBidForBuyer = useCallback(
    (buyerKey: string, buyerName: string, buyerMark: string, buyerContactId: string | null, entry: BillEntry) => {
      const lineKey = getBidSelectionKey(entry);
      const patch = (buyer: BuyerPurchase): BuyerPurchase => {
        const idx = buyer.entries.findIndex(e => getBidSelectionKey(e) === lineKey);
        if (idx < 0) {
          return {
            ...buyer,
            entries: [...buyer.entries, entry],
            tokenAdvanceTotal: (buyer.tokenAdvanceTotal || 0) + (Number(entry.tokenAdvance) || 0),
          };
        }
        const oldTa = Number(buyer.entries[idx].tokenAdvance) || 0;
        const newTa = Number(entry.tokenAdvance) || 0;
        const nextEntries = [...buyer.entries];
        nextEntries[idx] = entry;
        return {
          ...buyer,
          entries: nextEntries,
          tokenAdvanceTotal: (buyer.tokenAdvanceTotal || 0) - oldTa + newTa,
        };
      };
      setBuyers(prev => {
        const idx = prev.findIndex(
          b =>
            (b.buyerMark || '').toLowerCase() === buyerMark.toLowerCase()
            && (b.buyerName || '').toLowerCase() === buyerName.toLowerCase(),
        );
        if (idx < 0) {
          return [...prev, { buyerName, buyerMark, buyerContactId, entries: [entry], tokenAdvanceTotal: Number(entry.tokenAdvance) || 0 }];
        }
        const next = [...prev];
        next[idx] = patch(next[idx]);
        return next;
      });
      setSelectedBuyer(prev => {
        if (!prev) return prev;
        const key = `${(prev.buyerMark || '').toLowerCase()}::${(prev.buyerName || '').toLowerCase()}`;
        if (key !== buyerKey) return prev;
        return patch(prev);
      });
    },
    [],
  );

  const applyAddBidSessionToBill = useCallback(
    (session: AuctionSessionDTO) => {
      if (!bill || !selectedBuyer || !addBidSelectedLot) return;
      const billBuyerMarkNorm = (bill.buyerMark || '').trim().toLowerCase();
      const lotIdStr = String(addBidSelectedLot.lot_id);
      const buyerOwn = (session.entries || []).filter(
        e => (e.buyer_mark || '').trim().toLowerCase() === billBuyerMarkNorm,
      );
      const existingForLot = selectedBuyer.entries.filter(e => String(e.lotId) === lotIdStr);
      let matchedAuction: AuctionEntryDTO | undefined;
      for (const be of existingForLot) {
        if (be.auctionEntryId != null) {
          const hit = buyerOwn.find(a => a.auction_entry_id === be.auctionEntryId);
          if (hit) {
            matchedAuction = hit;
            break;
          }
        }
      }
      if (!matchedAuction && buyerOwn.length) {
        matchedAuction = [...buyerOwn].sort((a, b) => (a.auction_entry_id ?? 0) - (b.auction_entry_id ?? 0)).pop();
      }
      if (!matchedAuction) {
        toast.error('Bid saved but failed to map in bill. Refresh billing data.');
        return;
      }
      const newBillEntry: BillEntry = {
        bidNumber: matchedAuction.bid_number,
        lotId: lotIdStr,
        auctionEntryId: matchedAuction.auction_entry_id ?? null,
        selfSaleUnitId: null,
        lotName: addBidSelectedLot.lot_name || String(addBidSelectedLot.bag_count || ''),
        lotTotalQty: session.lot?.bag_count ?? addBidSelectedLot.bag_count ?? matchedAuction.quantity,
        sellerName: addBidSelectedLot.seller_name || 'Unknown',
        commodityName: addBidSelectedLot.commodity_name || 'Unknown',
        rate: Number(matchedAuction.bid_rate) || 0,
        quantity: matchedAuction.quantity ?? 0,
        weight: 0,
        vehicleTotalQty: addBidSelectedLot.vehicle_total_qty ?? matchedAuction.quantity ?? 0,
        sellerVehicleQty: addBidSelectedLot.seller_total_qty ?? matchedAuction.quantity ?? 0,
        presetApplied: Number(matchedAuction.preset_margin) || 0,
        isSelfSale: !!matchedAuction.is_self_sale,
        tokenAdvance: Number(matchedAuction.token_advance) || 0,
      };
      const buyerKey = `${(bill.buyerMark || '').toLowerCase()}::${(bill.buyerName || '').toLowerCase()}`;
      const existingLine = selectedBuyer.entries.find(
        e => String(e.lotId) === lotIdStr && e.bidNumber === newBillEntry.bidNumber,
      );
      if (existingLine) {
        upsertBidForBuyer(buyerKey, bill.buyerName, bill.buyerMark, selectedBuyer.buyerContactId ?? null, newBillEntry);
        const nextEntries = selectedBuyer.entries.map(e =>
          getBidSelectionKey(e) === getBidSelectionKey(newBillEntry) ? newBillEntry : e,
        );
        generateBill({
          ...selectedBuyer,
          entries: nextEntries,
          tokenAdvanceTotal: nextEntries.reduce((s, e) => s + (Number(e.tokenAdvance) || 0), 0),
        });
      } else {
        appendBidForBuyer(buyerKey, bill.buyerName, bill.buyerMark, selectedBuyer.buyerContactId ?? null, newBillEntry);
        const mergedBuyer: BuyerPurchase = {
          buyerMark: bill.buyerMark,
          buyerName: bill.buyerName,
          buyerContactId: selectedBuyer.buyerContactId ?? null,
          entries: [...selectedBuyer.entries, newBillEntry],
          tokenAdvanceTotal: (selectedBuyer.tokenAdvanceTotal || 0) + (Number(newBillEntry.tokenAdvance) || 0),
        };
        generateBill(mergedBuyer);
      }
    },
    [
      addBidSelectedLot,
      appendBidForBuyer,
      bill,
      generateBill,
      selectedBuyer,
      upsertBidForBuyer,
      weighingSessions,
    ],
  );

  const executeBillingAddBid = useCallback(
    async (allowLotIncrease: boolean) => {
      if (!bill || !selectedBuyer || !addBidSelectedLot) {
        toast.error('Open a buyer bill first');
        return;
      }
      const qty = roundMoney2(Number(addBidQty));
      const rate = roundMoney2(Number(addBidBaseRate));
      const extra = roundMoney2(Number(addBidExtraAmount || 0));
      const tokenAdvance = roundMoney2(Number(addBidTokenAdvance || 0));
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error('Enter valid bid quantity');
        return;
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error('Enter valid base rate');
        return;
      }
      if (!Number.isFinite(extra) || !Number.isFinite(tokenAdvance)) {
        toast.error('Enter valid extra/token values');
        return;
      }

      const buyerIdNum =
        selectedBuyer.buyerContactId && /^\d+$/.test(selectedBuyer.buyerContactId)
          ? Number(selectedBuyer.buyerContactId)
          : undefined;

      const allow = allowLotIncrease || addBidRetryAllowIncrease;
      const body: AuctionBidCreateRequest = {
        buyer_id: buyerIdNum,
        buyer_name: (bill.billingName || bill.buyerName || '').trim(),
        buyer_mark: (bill.buyerMark || '').trim(),
        rate,
        quantity: qty,
        extra_rate: extra,
        token_advance: tokenAdvance,
        preset_applied: 0,
        preset_type: 'PROFIT',
        is_scribble: false,
        is_self_sale: false,
        allow_lot_increase: allow,
      };

      try {
        setAddBidSaving(true);
        const session = await auctionApi.addBid(addBidSelectedLot.lot_id, body);
        setAddBidSession(session);
        setAddBidRemainingQty(Number(session.remaining_bags) || 0);
        setAddBidRetryAllowIncrease(false);
        applyAddBidSessionToBill(session);
        await refetchAuctions();
        resetAddBidForm();
        setAddBidDialogOpen(false);
        toast.success('Bid added and bill updated');
      } catch (err: unknown) {
        const e = err as { isConflict?: boolean; message?: string };
        if (e.isConflict) {
          setAddBidRetryAllowIncrease(true);
          toast.error('Quantity exceeds lot. Tap Save again to allow lot increase and retry.');
        } else {
          toast.error(e instanceof Error ? e.message : 'Failed to add bid');
        }
      } finally {
        setAddBidSaving(false);
      }
    },
    [
      addBidBaseRate,
      addBidExtraAmount,
      addBidQty,
      addBidRetryAllowIncrease,
      addBidSelectedLot,
      addBidTokenAdvance,
      applyAddBidSessionToBill,
      bill,
      refetchAuctions,
      resetAddBidForm,
      selectedBuyer,
    ],
  );

  const beginAddBidFlow = useCallback(
    (allowLotIncreaseFromStep: boolean) => {
      if (!bill || !selectedBuyer) {
        toast.error('Open a buyer bill first');
        return;
      }
      if (!addBidSelectedLot) {
        toast.error('Select lot mark');
        return;
      }
      if (!addBidSession) {
        toast.error('Lot session not loaded — re-select the lot');
        return;
      }
      const qty = Number(addBidQty);
      const rate = Number(addBidBaseRate);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error('Enter valid bid quantity');
        return;
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error('Enter valid base rate');
        return;
      }

      const lotTotal = addBidSession.lot?.bag_count ?? 0;
      const currentSold = Number(addBidSession.total_sold_bags) || 0;
      const newTotal = currentSold + qty;
      if (newTotal > lotTotal && !addBidRetryAllowIncrease && !allowLotIncreaseFromStep) {
        setAddBidQtyIncreaseDialog({ currentTotal: currentSold, lotTotal, attemptedQty: qty });
        return;
      }

      const markNorm = (bill.buyerMark || '').trim().toLowerCase();
      const dup = (addBidSession.entries || []).find(
        e => !e.is_self_sale && (e.buyer_mark || '').trim().toLowerCase() === markNorm,
      );
      if (dup) {
        setAddBidDuplicateDialog({ existingEntry: dup, rate, qty });
        return;
      }

      void executeBillingAddBid(allowLotIncreaseFromStep);
    },
    [
      addBidSession,
      addBidBaseRate,
      addBidQty,
      addBidRetryAllowIncrease,
      addBidSelectedLot,
      bill,
      executeBillingAddBid,
      selectedBuyer,
    ],
  );

  const handleAddBidToCurrentBuyer = useCallback(() => {
    beginAddBidFlow(false);
  }, [beginAddBidFlow]);

  const confirmAddBidQtyIncrease = useCallback(() => {
    setAddBidQtyIncreaseDialog(null);
    beginAddBidFlow(true);
  }, [beginAddBidFlow]);

  const handleAddBidDuplicateDifferentMark = useCallback(() => {
    setAddBidDuplicateDialog(null);
    toast.info('Change the buyer mark on the sales bill, then add the bid again.');
  }, []);

  const handleAddBidDuplicateConfirm = useCallback(() => {
    setAddBidDuplicateDialog(null);
    void executeBillingAddBid(false);
  }, [executeBillingAddBid]);

  const openSearchBidDialogForBuyer = useCallback((picked: BuyerPurchase) => {
    setSearchBidSourceBuyer(picked);
    setSearchBidInput(picked.buyerMark || picked.buyerName);
    setSearchBidSelectedKeys([]);
    setShowSearchBidBuyerSuggestions(false);
    setSearchBidDialogOpen(true);
  }, []);

  const toggleSearchBidSelection = useCallback((entry: Pick<BillEntry, 'bidNumber' | 'lotId'>) => {
    const key = getBidSelectionKey(entry);
    setSearchBidSelectedKeys(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  }, []);

  const addSearchedBidsToCurrentBill = useCallback(() => {
    if (!bill || !selectedBuyer || !searchBidSourceBuyer) return;
    if (searchBidSelectedKeys.length === 0) {
      toast.error('Select at least one lot');
      return;
    }
    const selectedEntries = searchBidSourceBuyer.entries
      .filter(e => !currentBillBidKeys.has(getBidSelectionKey(e)))
      .filter(e => searchBidSelectedKeys.includes(getBidSelectionKey(e)));
    if (selectedEntries.length === 0) {
      toast.error('No selected lots available');
      return;
    }
    const existingKeys = new Set(selectedBuyer.entries.map(e => getBidSelectionKey(e)));
    const toAdd = selectedEntries.filter(e => !existingKeys.has(getBidSelectionKey(e)));
    if (toAdd.length === 0) {
      toast.error('Selected lots already exist in current bill');
      return;
    }
    const mergedBuyer: BuyerPurchase = {
      ...selectedBuyer,
      entries: [...selectedBuyer.entries, ...toAdd],
      tokenAdvanceTotal:
        (selectedBuyer.tokenAdvanceTotal || 0) + toAdd.reduce((s, e) => s + (Number(e.tokenAdvance) || 0), 0),
    };
    setBuyers(prev =>
      prev.map(b =>
        (b.buyerMark || '').toLowerCase() === (selectedBuyer.buyerMark || '').toLowerCase()
          && (b.buyerName || '').toLowerCase() === (selectedBuyer.buyerName || '').toLowerCase()
          ? mergedBuyer
          : b,
      ),
    );
    generateBill(mergedBuyer);
    setSearchBidDialogOpen(false);
    setSearchBidSelectedKeys([]);
    toast.success(`${toAdd.length} lot(s) added into current bill. Save bill to finalize migration.`);
  }, [
    bill,
    currentBillBidKeys,
    generateBill,
    searchBidSelectedKeys,
    searchBidSourceBuyer,
    selectedBuyer,
  ]);

  const searchBidBuyerOptions = useMemo(() => {
    if (!bill) return [];
    const q = searchBidInput.trim().toLowerCase();
    const isSameBuyer = (b: BuyerPurchase) =>
      (b.buyerMark || '').toLowerCase() === (bill.buyerMark || '').toLowerCase()
      && (b.buyerName || '').toLowerCase() === (bill.buyerName || '').toLowerCase();
    const candidates = buyersForBilling.filter(b => !isSameBuyer(b));
    if (!q) return candidates;
    return candidates.filter(
      b =>
        (b.buyerMark || '').toLowerCase().includes(q)
        || (b.buyerName || '').toLowerCase().includes(q),
    );
  }, [bill, buyersForBilling, searchBidInput]);

  const searchBidVisibleEntries = useMemo(() => {
    if (!searchBidSourceBuyer) return [];
    return searchBidSourceBuyer.entries.filter(e => !currentBillBidKeys.has(getBidSelectionKey(e)));
  }, [currentBillBidKeys, searchBidSourceBuyer]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!searchBidBuyerSelectRef.current) return;
      if (!searchBidBuyerSelectRef.current.contains(e.target as Node)) {
        setShowSearchBidBuyerSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Add a bid from another buyer into the current bill (cross-buyer aggregation).

  // Update numeric fields on a line item (quantity, weight, bid rate, brokerage, other charges, token)
  const updateLineItem = (
    commIdx: number,
    itemIdx: number,
    field: 'quantity' | 'weight' | 'baseRate' | 'brokerage' | 'otherCharges' | 'tokenAdvance',
    value: number,
  ) => {
    if (!bill) return;
    const v = roundMoney2(value);
    if (field === 'tokenAdvance') {
      const updated = { ...bill };
      const group = { ...updated.commodityGroups[commIdx] };
      const item = { ...group.items[itemIdx], tokenAdvance: v };
      group.items = [...group.items];
      group.items[itemIdx] = item;
      updated.commodityGroups = [...updated.commodityGroups];
      updated.commodityGroups[commIdx] = group;
      setBill(recalcGrandTotal(updated));
      return;
    }
    const updated = { ...bill };
    const group = { ...updated.commodityGroups[commIdx] };
    const item = { ...group.items[itemIdx] };
    (item as any)[field] = v;
    const preset = (item as { presetApplied?: number }).presetApplied ?? 0;
    item.newRate = roundMoney2(item.baseRate + item.brokerage + item.otherCharges);
    const divisorUsed = group.divisor > 0 ? group.divisor : 50;
    item.amount = roundMoney2((item.weight * item.newRate) / divisorUsed);

    const commName = group.commodityName;
    const commodity = commodities.find((c: any) => c.commodity_name === commName);
    const fullCfg = commodity
      ? fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(commodity.commodity_id))
      : null;
    const dynCharges = fullCfg?.dynamicCharges ?? [];
    const weight = item.weight || 0;
    const qty = item.quantity || 0;
    const baseNewRateWithoutOther = item.baseRate + preset + item.brokerage;
    const baseAmount = (weight * baseNewRateWithoutOther) / divisorUsed;
    let sellerOtherCharges = 0;
    dynCharges.forEach((ch: any) => {
      const appliesTo = String(ch.appliesTo || 'BUYER').toUpperCase();
      if (appliesTo !== 'SELLER') return;
      const chargeType = String(ch.chargeType || ch.charge_type || 'FIXED').toUpperCase();
      const chVal = Number(ch.valueAmount ?? ch.value ?? 0) || 0;
      if (chVal <= 0) return;
      if (chargeType === 'PERCENT') {
        const chargeTotal = baseAmount * (chVal / 100);
        const rateAdd = weight > 0 ? (chargeTotal * divisorUsed) / weight : 0;
        sellerOtherCharges += rateAdd;
      } else {
        const fixedBasis = String(ch.fixedBasis || ch.fixed_basis || 'PER_50KG').toUpperCase();
        if (fixedBasis === 'PER_COUNT') {
          const chargeTotal = chVal * qty;
          const rateAdd = weight > 0 ? (chargeTotal * divisorUsed) / weight : 0;
          sellerOtherCharges += rateAdd;
        } else {
          sellerOtherCharges += chVal * (divisorUsed / 50);
        }
      }
    });
    item.sellerOtherCharges = roundMoney2(sellerOtherCharges);

    group.items = [...group.items];
    group.items[itemIdx] = item;
    group.subtotal = roundMoney2(group.items.reduce((s, i) => s + i.amount, 0));
    group.commissionAmount = percentOfAmount(group.subtotal, group.commissionPercent);
    group.userFeeAmount = percentOfAmount(group.subtotal, group.userFeePercent);
    const gst = gstOnSubtotal(group.subtotal, effectiveGstPercent(group));
    group.totalCharges = roundMoney2(group.commissionAmount + group.userFeeAmount + gst);
    updated.commodityGroups = [...updated.commodityGroups];
    updated.commodityGroups[commIdx] = group;
    setBill(recalcGrandTotal(updated));
  };

  const removeLineItem = (commIdx: number, itemIdx: number) => {
    if (!bill) return;
    const updated = { ...bill };
    const groups = [...updated.commodityGroups];
    const group = { ...groups[commIdx] };
    const items = [...group.items];
    items.splice(itemIdx, 1);

    if (items.length === 0) {
      groups.splice(commIdx, 1);
    } else {
      group.items = items;
      group.subtotal = roundMoney2(items.reduce((s, i) => s + i.amount, 0));
      group.commissionAmount = percentOfAmount(group.subtotal, group.commissionPercent);
      group.userFeeAmount = percentOfAmount(group.subtotal, group.userFeePercent);
      const gst = gstOnSubtotal(group.subtotal, effectiveGstPercent(group));
      group.totalCharges = roundMoney2(group.commissionAmount + group.userFeeAmount + gst);
      groups[commIdx] = group;
    }

    updated.commodityGroups = groups;
    setBill(recalcGrandTotal(updated));
  };

  const requestRemoveLineItem = (commIdx: number, itemIdx: number) => {
    setPendingDeleteTarget({ commIdx, itemIdx });
  };

  // Apply global brokerage/charges to all items
  const applyGlobalCharges = () => {
    if (!bill) return;
    const updated = { ...bill };
    updated.commodityGroups = updated.commodityGroups.map(group => {
      const commodity = commodities.find((c: any) => c.commodity_name === group.commodityName);
      const fullCfg = commodity
        ? fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(commodity.commodity_id))
        : null;
      const dynCharges = fullCfg?.dynamicCharges ?? [];
      const items = group.items.map(item => {
        const preset = item.presetApplied ?? 0;
        const brk = bill.brokerageType === 'PERCENT'
          ? percentOfAmount(item.baseRate + preset, bill.brokerageValue)
          : roundMoney2(bill.brokerageValue);
        const globalOther = roundMoney2(bill.globalOtherCharges);
        const newItem = {
          ...item,
          brokerage: brk,
          otherCharges: globalOther,
          newRate: roundMoney2(item.baseRate + brk + globalOther),
          amount: 0,
        };
        newItem.amount = roundMoney2(
          (newItem.weight * newItem.newRate) / (group.divisor > 0 ? group.divisor : 50),
        );

        // Seller-side dynamic Other Charges (appliesTo=SELLER) - read-only visualization.
        const divisorUsed = group.divisor > 0 ? group.divisor : 50;
        const weight = newItem.weight || 0;
        const qty = newItem.quantity || 0;
        const baseNewRateWithoutOther = newItem.baseRate + preset + newItem.brokerage;
        const baseAmount = (weight * baseNewRateWithoutOther) / divisorUsed;
        let sellerOtherCharges = 0;
        dynCharges.forEach((ch: any) => {
          const appliesTo = String(ch.appliesTo || 'BUYER').toUpperCase();
          if (appliesTo !== 'SELLER') return;
          const chargeType = String(ch.chargeType || ch.charge_type || 'FIXED').toUpperCase();
          const value = Number(ch.valueAmount ?? ch.value ?? 0) || 0;
          if (value <= 0) return;

          if (chargeType === 'PERCENT') {
            const chargeTotal = baseAmount * (value / 100);
            const rateAdd = weight > 0 ? (chargeTotal * divisorUsed) / weight : 0;
            sellerOtherCharges += rateAdd;
            return;
          }

          const fixedBasis = String(ch.fixedBasis || ch.fixed_basis || 'PER_50KG').toUpperCase();
          if (fixedBasis === 'PER_COUNT') {
            const chargeTotal = value * qty;
            const rateAdd = weight > 0 ? (chargeTotal * divisorUsed) / weight : 0;
            sellerOtherCharges += rateAdd;
          } else {
            sellerOtherCharges += value * (divisorUsed / 50);
          }
        });
        newItem.sellerOtherCharges = roundMoney2(sellerOtherCharges);
        return newItem;
      });
      const subtotal = roundMoney2(items.reduce((s, i) => s + i.amount, 0));
      const gst = gstOnSubtotal(subtotal, effectiveGstPercent(group));
      return {
        ...group,
        items,
        subtotal,
        commissionAmount: percentOfAmount(subtotal, group.commissionPercent),
        userFeeAmount: percentOfAmount(subtotal, group.userFeePercent),
        totalCharges: roundMoney2(
          percentOfAmount(subtotal, group.commissionPercent)
          + percentOfAmount(subtotal, group.userFeePercent)
          + gst,
        ),
      };
    });
    setBill(recalcGrandTotal(updated));
    toast.success('Global charges applied to all line items');
  };

  const buildSavePayload = () => {
    if (!bill) return;
    const { isValid, errors } = validateBill(bill, commodityAvgWeightBounds);
    if (!isValid) {
      const count = Object.keys(errors).length;
      toast.error(`Please fix ${count} validation ${count === 1 ? 'error' : 'errors'} before saving`);
      return null;
    }
    const payload = {
      buyerName: bill.buyerName,
      buyerMark: bill.buyerMark,
      buyerContactId: bill.buyerContactId,
      buyerPhone: bill.buyerPhone ?? '',
      buyerAddress: bill.buyerAddress ?? '',
      buyerAsBroker: !!bill.buyerAsBroker,
      brokerName: bill.buyerAsBroker ? '' : (bill.brokerName ?? ''),
      brokerMark: bill.buyerAsBroker ? '' : (bill.brokerMark ?? ''),
      brokerContactId: bill.buyerAsBroker ? null : (bill.brokerContactId ?? null),
      brokerPhone: bill.buyerAsBroker ? '' : (bill.brokerPhone ?? ''),
      brokerAddress: bill.buyerAsBroker ? '' : (bill.brokerAddress ?? ''),
      billingName: bill.billingName,
      billDate: typeof bill.billDate === 'string' ? bill.billDate : new Date(bill.billDate).toISOString(),
      // Keep all persisted commodity-group values; only remove frontend-only helper fields.
      commodityGroups: bill.commodityGroups.map(({ divisor: _divisor, taxMode: _taxMode, ...g }: any) => ({
        ...g,
        ...(g.taxMode === 'IGST'
          ? { gstRate: 0, sgstRate: 0, cgstRate: 0, igstRate: Number(g.igstRate) || 0 }
          : { gstRate: Number(g.gstRate) || 0, sgstRate: Number(g.sgstRate) || 0, cgstRate: Number(g.cgstRate) || 0, igstRate: 0 }),
        items: (g.items ?? []).map((it: any) => {
          const {
            sellerOtherCharges: _soc,
            lotTotalQty: _ltq,
            vehicleTotalQty: _vtq,
            sellerVehicleQty: _svq,
            ...restIt
          } = it;
          return restIt;
        }),
      })),
      outboundFreight: bill.outboundFreight ?? 0,
      outboundVehicle: bill.outboundVehicle ?? '',
      tokenAdvance: sumLineTokenAdvances(bill),
      grandTotal: bill.grandTotal,
      brokerageType: bill.brokerageType ?? 'AMOUNT',
      brokerageValue: bill.brokerageValue ?? 0,
      globalOtherCharges: bill.globalOtherCharges ?? 0,
      pendingBalance: bill.pendingBalance ?? bill.grandTotal,
    };
    const canCreate = can('Billing', 'Create');
    const canEdit = can('Billing', 'Edit');
    const isUpdate = bill.billId && isBackendBillId(bill.billId);
    if ((isUpdate && !canEdit) || (!isUpdate && !canCreate)) {
      toast.error('You do not have permission to save bills.');
      return null;
    }
    return { payload, isUpdate };
  };

  const persistBill = async (): Promise<SalesBillDTO | null> => {
    if (persistBillPromiseRef.current) {
      return persistBillPromiseRef.current;
    }
    const run = (async (): Promise<SalesBillDTO | null> => {
      setBillPersisting(true);
    const built = buildSavePayload();
    if (!built) return null;
    const { payload, isUpdate } = built;
    try {
      const result = isUpdate
        ? await billingApi.update(bill!.billId, payload)
        : await billingApi.create(payload);
      try {
        const norm = normalizeBillFromApi(result, fullConfigs, commodities) as BillData;
        if (norm.commodityGroups.some(g => (g.items?.length ?? 0) > 0)) {
          await syncAuctionEntriesToBillBuyer(norm);
        }
      } catch (syncErr) {
        console.warn(syncErr);
        toast.warning(
          'Bill saved, but some auction bids could not be updated to match this buyer. Refresh billing data or check Sales Pad.',
        );
      }
      void refetchAuctions().catch(() => {});
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save bill');
      return null;
    } finally {
      setBillPersisting(false);
      persistBillPromiseRef.current = null;
    }
    })();
    persistBillPromiseRef.current = run;
    return run;
  };

  async function autoSaveCurrentBillBeforeBuyerSwitch(): Promise<boolean> {
    if (!bill) return true;
    const hasItems = bill.commodityGroups.some(g => (g.items?.length ?? 0) > 0);
    if (!hasItems) return true;

    const currentBuyerLabel = bill.buyerMark || bill.buyerName || 'current buyer';
    const saved = await persistBill();
    if (!saved) {
      toast.error('Could not auto-save current bill. Please fix highlighted fields and try again.');
      return false;
    }

    setHasSavedOnce(isBackendBillId(String(saved.billId)));
    void loadSavedBills();
    toast.success(`Draft for ${currentBuyerLabel} moved to Bill In Progress.`);
    return true;
  }

  const handleSaveDraft = async () => {
    if (!bill) return;
    const result = await persistBill();
    if (!result) return;
    // Assign bill number on save (completed bill), idempotent if already numbered.
    const assigned = await billingApi.assignNumber(result.billId);
    const normalized = recalcGrandTotal(normalizeBillFromApi(assigned, fullConfigs, commodities) as BillData);
    setBill(normalized);
    billDirtyBaselineRef.current = serializeBillForDirty(normalized);
    setHasSavedOnce(true);
    toast.success(result.billNumber ? `Bill ${result.billNumber} updated.` : 'Bill saved.');
    void loadSavedBills();
  };

  /** True when local bill differs from last baseline (load or successful save). Used to require Save before Print for persisted bills. */
  const billHasUnsavedEditsSinceSave = useMemo(() => {
    if (!bill || !billDirtyBaselineRef.current) return false;
    return serializeBillForDirty(bill) !== billDirtyBaselineRef.current;
  }, [bill, serializeBillForDirty]);

  const isBillingDirty = useMemo(() => {
    if (!bill || showPrint) return false;
    if (isBackendBillId(bill.billId)) return false;
    if (!billDirtyBaselineRef.current) return false;
    return serializeBillForDirty(bill) !== billDirtyBaselineRef.current;
  }, [bill, showPrint, serializeBillForDirty]);
  const handleBillingPartialSave = async (): Promise<boolean> => {
    if (!bill) return true;
    const hasItems = bill.commodityGroups.some(g => (g.items?.length ?? 0) > 0);
    if (!hasItems) return true;
    const saved = await persistBill();
    if (!saved) {
      toast.error('Failed to save bill progress.');
      return false;
    }
    setHasSavedOnce(isBackendBillId(String(saved.billId)));
    billDirtyBaselineRef.current = serializeBillForDirty(bill);
    void loadSavedBills();
    toast.success('Bill progress saved.');
    return true;
  };
  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isBillingDirty,
    title: 'Save your progress?',
    description: 'You have unsaved changes. Would you like to save your progress before leaving?',
    continueLabel: 'Save',
    stayLabel: 'Discard',
    onBeforeContinue: handleBillingPartialSave,
  });

  /** Opens print preview only — does not persist. Use Save/Update first. */
  const canPrintBill = useMemo(
    () =>
      !!bill
      && hasSavedOnce
      && isBackendBillId(bill.billId)
      && selectedPrintVersion === 'latest'
      && billValidation.isValid
      && !billPersisting
      && !billHasUnsavedEditsSinceSave,
    [
      bill,
      hasSavedOnce,
      selectedPrintVersion,
      billValidation.isValid,
      billPersisting,
      billHasUnsavedEditsSinceSave,
    ],
  );

  const openPrintPreview = () => {
    if (!bill) return;
    if (!canPrintBill) {
      if (selectedPrintVersion !== 'latest') {
        toast.error('Only the latest version can be printed. Select “Latest (current)” in the version dropdown.');
      } else if (billHasUnsavedEditsSinceSave) {
        toast.error('Save your changes before printing.');
      } else if (!billValidation.isValid) {
        toast.error('Fix validation errors, save the bill, then print.');
      } else if (!hasSavedOnce || !isBackendBillId(bill.billId)) {
        toast.error('Save the bill before printing.');
      }
      return;
    }
    setShowPrint(true);
  };
  openPrintPreviewRef.current = openPrintPreview;

  const filteredBuyerOptions = useMemo(() => {
    const q = buyerBidMarkInput.trim().toLowerCase();
    /** Show every unbilled buyer when empty (scrollable panel); the old slice(0,12) hid everyone past 12 with no hint to type. */
    if (!q) return buyersForBilling;
    return buyersForBilling.filter(
      b =>
        b.buyerMark?.toLowerCase().includes(q)
        || b.buyerName?.toLowerCase().includes(q),
    );
  }, [buyersForBilling, buyerBidMarkInput]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!buyerSelectRef.current) return;
      if (!buyerSelectRef.current.contains(e.target as Node)) {
        setShowBuyerSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const inProgressBills = useMemo(
    () => savedBills.filter(b => !b.billNumber?.trim()),
    [savedBills],
  );

  const numberedBills = useMemo(
    () => savedBills.filter(b => !!b.billNumber?.trim()),
    [savedBills],
  );

  const filteredInProgressBills = useMemo(() => {
    if (!searchQuery.trim()) return inProgressBills;
    const q = searchQuery.toLowerCase();
    return inProgressBills.filter((b: any) =>
      b.buyerMark?.toLowerCase().includes(q) ||
      b.buyerName?.toLowerCase().includes(q) ||
      b.billingName?.toLowerCase().includes(q) ||
      b.outboundVehicle?.toLowerCase().includes(q)
    );
  }, [inProgressBills, searchQuery]);

  const filteredSavedBillsOnly = useMemo(() => {
    if (!searchQuery.trim()) return numberedBills;
    const q = searchQuery.toLowerCase();
    return numberedBills.filter((b: any) =>
      b.buyerMark?.toLowerCase().includes(q) ||
      b.buyerName?.toLowerCase().includes(q) ||
      b.billNumber?.toLowerCase().includes(q) ||
      b.billingName?.toLowerCase().includes(q) ||
      b.outboundVehicle?.toLowerCase().includes(q)
    );
  }, [numberedBills, searchQuery]);

  const applySelectedVersion = useCallback((versionSel: 'latest' | number) => {
    if (!bill) return;
    if (versionSel === 'latest') {
      const latestSource = latestVersionSnapshotRef.current ?? bill;
      const normalizedLatest = normalizeBillFromApi(latestSource, fullConfigs, commodities) as BillData;
      setBill(recalcGrandTotal(normalizedLatest));
      return;
    }
    const versions = Array.isArray((bill as any).versions) ? (bill as any).versions : [];
    const picked = versions.find((v: any) => Number(v?.version) === Number(versionSel));
    const rawSnapshot = picked?.data;
    if (!rawSnapshot || typeof rawSnapshot !== 'object') {
      toast.error(`Version v${versionSel} data not available`);
      return;
    }
    const mergedSnapshot = {
      ...(rawSnapshot as any),
      billId: bill.billId,
      versions,
    };
    const normalizedVersion = normalizeBillFromApi(mergedSnapshot, fullConfigs, commodities) as BillData;
    setBill(recalcGrandTotal(normalizedVersion));
  }, [bill, fullConfigs, commodities, recalcGrandTotal]);

  if (!canView) {
    return <ForbiddenPage moduleName="Billing" />;
  }

  // ═══ PRINT PREVIEW ═══
  if (showPrint && bill) {
    const activePrintBill: BillData = bill;
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        <UnsavedChangesDialog />
        {!isDesktop ? (
          <div className="bg-gradient-to-br from-indigo-400 via-blue-500 to-cyan-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-[2rem]">
            <div className="relative z-10 flex items-center gap-3">
              <button onClick={() => setShowPrint(false)}
                aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <Printer className="w-5 h-5" /> Sales Bill Print
                </h1>
                <p className="text-white/70 text-xs">{activePrintBill.billNumber || 'Draft'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-8 py-5 flex items-center gap-4">
            <Button onClick={() => setShowPrint(false)} variant="outline" className={cn(arrSolidMd, 'gap-1.5')}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-500" /> Sales Bill Print
              </h2>
              <p className="text-sm text-muted-foreground">{activePrintBill.billNumber || 'Draft'}</p>
            </div>
          </div>
        )}

        <div className="px-4 mt-4">
          <iframe
            title="GST sales bill print preview"
            className="w-full min-h-[72vh] border border-border rounded-xl bg-white shadow-lg"
            srcDoc={salesBillPrintHtml}
          />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 mt-4">
            <div className="flex gap-3 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={async () => {
                  const printedAt = new Date().toISOString();
                  try {
                    await printLogApi.create({
                      reference_type: 'SALES_BILL',
                      reference_id: activePrintBill.billId,
                      print_type: 'SALES_BILL',
                      printed_at: printedAt,
                    });
                  } catch {
                    // backend optional
                  }
                  const printHtml = isGstBill
                    ? generateSalesBillPrintHTML(billPrintPayload!, {
                        pageSize: billingPrintSize,
                        includeHeader: billingIncludeHeader,
                      })
                    : generateNonGstSalesBillPrintHTML(billPrintPayload!, {
                        pageSize: nonGstPrintSize,
                      });
                  const ok = await directPrint(printHtml, { mode: "system" });
                  ok ? toast.success('Sales Bill sent to printer!') : toast.error('Printer not connected.');
                }}
                className={cn(arrSolidTall, 'flex-1 sm:flex-none gap-2')}>
                <Printer className="w-5 h-5" /> Print Bill
              </Button>
              <Button
                onClick={() => {
                  void (async () => {
                    const ok = await confirmIfDirty();
                    if (!ok) return;
                    setShowPrint(false);
                    setBill(null);
                    setSelectedBuyer(null);
                  })();
                }}
                variant="outline"
                className={arrOutlineTall}>
                Done
              </Button>
            </div>
          </div>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ BILLING HOME: TABS + LISTS ═══
  const handleClearBillEditor = async () => {
    const saved = await autoSaveCurrentBillBeforeBuyerSwitch();
    if (!saved) return;
    setSelectedBuyer(null);
    setBill(null);
    setBuyerBidMarkInput('');
    setSelectedBuyerFromDropdown(null);
    setShowBuyerSuggestions(false);
    setSelectBidBuyer(null);
    setSelectedBidKeys([]);
    setHasSavedOnce(false);
  };

  const handleCreateNewBill = () => {
    setBill(null);
    setHasSavedOnce(false);
    setSelectedPrintVersion('latest');
    setEditLocked(false);
    setBillingMainTab('create');
  };

  const openBillFromList = (b: SalesBillDTO) => {
    setSelectedBuyer({
      buyerMark: b.buyerMark,
      buyerName: b.buyerName,
      buyerContactId: b.buyerContactId ?? null,
      entries: [],
      tokenAdvanceTotal: 0,
    });
    setBill(recalcGrandTotal(normalizeBillFromApi(b, fullConfigs, commodities) as BillData));
    setHasSavedOnce(isBackendBillId(String(b.billId)));
    setSelectedPrintVersion('latest');
    setEditLocked(false);
    setBillingMainTab('create');
  };

  const tabHint = (code: string) => (isDesktop ? ` (${code})` : '');

  return (
    <div className={cn("min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6", (searchBidDialogOpen || addBidDialogOpen) && "no-hover")}>
      {(searchBidDialogOpen || addBidDialogOpen) && (
        <style dangerouslySetInnerHTML={{
          __html: `
            .no-hover *:hover {
              background-color: inherit !important;
              box-shadow: none !important;
              transform: none !important;
              opacity: 1 !important;
            }
            .no-hover .dialog-content,
            .no-hover .dialog-content *,
            .no-hover [data-radix-dialog-content],
            .no-hover [data-radix-dialog-content] * {
              pointer-events: auto !important;
            }
          `
        }} />
      )}
      <UnsavedChangesDialog />
      <ConfirmDeleteDialog
        open={!!pendingDeleteTarget}
        onOpenChange={open => {
          if (!open) setPendingDeleteTarget(null);
        }}
        title="Remove lot from bill?"
        description="This lot line will be removed from the current bill. You can add it again later if needed."
        confirmLabel="Remove"
        onConfirm={() => {
          if (!pendingDeleteTarget) return;
          removeLineItem(pendingDeleteTarget.commIdx, pendingDeleteTarget.itemIdx);
        }}
      />

      <Dialog open={!!restorePendingPhone} onOpenChange={open => { if (!open) setRestorePendingPhone(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Restore contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This phone exists on an inactive contact. Restore it to use again?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestorePendingPhone(null)} className={arrSolidMd}>Cancel</Button>
            <Button variant="outline" onClick={handleRestoreContactFromBilling} disabled={!canEditContact} className={arrSolidMd}>Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={searchBidDialogOpen}
        onOpenChange={open => {
          setSearchBidDialogOpen(open);
          if (!open) {
            setSearchBidSelectedKeys([]);
            setShowSearchBidBuyerSuggestions(false);
            setShowBuyerSuggestions(false);
          }
        }}
      >
        <DialogContent className="max-w-lg dialog-content">
          <DialogHeader>
            <DialogTitle>
              Search & Migrate Bid - {searchBidSourceBuyer ? `${searchBidSourceBuyer.buyerName} (${searchBidSourceBuyer.buyerMark})` : 'Buyer'}
            </DialogTitle>
          </DialogHeader>
          {!searchBidSourceBuyer || searchBidVisibleEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No buyer lots found.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2">
              <div className="grid grid-cols-[1.6rem_1.8fr_0.9fr_1fr_1fr] gap-2 px-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span />
                <span>Item</span>
                <span>Quantity</span>
                <span>Base Rate</span>
                <span>Extra Rate</span>
              </div>
              {searchBidVisibleEntries.map(entry => {
                const checked = searchBidSelectedKeys.includes(getBidSelectionKey(entry));
                return (
                  <button
                    key={`${entry.bidNumber}-${entry.lotId}`}
                    type="button"
                    onClick={() => toggleSearchBidSelection(entry)}
                    className={cn(
                      'w-full text-left rounded-lg border p-2.5 transition-all',
                      checked ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-background hover:bg-muted/40',
                    )}
                  >
                    <div className="grid grid-cols-[1.6rem_1.8fr_0.9fr_1fr_1fr] gap-2 items-start">
                      <input
                        type="checkbox"
                        checked={checked}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSearchBidSelection(entry)}
                        className="mt-0.5 h-4 w-4 rounded border-border"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{formatLotIdentifierForBillEntry(entry)}</p>
                      </div>
                      <p className="text-xs">{entry.quantity}</p>
                      <p className="text-xs">{Number(entry.rate || 0)}</p>
                      <p className="text-xs">{Number(entry.presetApplied || 0)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSearchBidDialogOpen(false)} className={arrSolidMd}>Cancel</Button>
            <Button
              variant="outline"
              onClick={addSearchedBidsToCurrentBill}
              disabled={searchBidSelectedKeys.length === 0}
              className={arrSolidMd}
            >
              Add Selected ({searchBidSelectedKeys.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addBidDialogOpen}
        onOpenChange={open => {
          setAddBidDialogOpen(open);
          if (!open) resetAddBidForm();
        }}
      >
        <DialogContent
          className={cn(
            'dialog-content max-h-[min(92dvh,900px)] w-[calc(100vw-1rem)] max-w-xl sm:max-w-2xl gap-0 overflow-y-auto p-4 sm:p-6',
            'top-[8%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]',
          )}
        >
          <DialogHeader className="text-left pr-8">
            <DialogTitle>Add New Bid</DialogTitle>
            <p className="text-sm text-muted-foreground font-normal pt-1">
              {bill ? `${bill.buyerName} (${bill.buyerMark})` : 'Select a bill first'}
            </p>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 pt-1">
            <div className="relative space-y-1">
              <Label className="text-xs sm:text-sm">Lot Mark Search *</Label>
              <Input
                value={addBidLotSearch}
                onFocus={() => setShowAddBidLotDropdown(true)}
                onBlur={() => {
                  window.setTimeout(() => setShowAddBidLotDropdown(false), 120);
                }}
                onChange={e => {
                  setAddBidLotSearch(e.target.value);
                  setAddBidSelectedLot(null);
                  setAddBidSession(null);
                  setAddBidRemainingQty(0);
                  setShowAddBidLotDropdown(true);
                }}
                placeholder="Search lot, vehicle, seller (includes sold / full lots)"
                className="h-10 sm:h-9 rounded-lg text-sm"
                autoComplete="off"
              />
              {addBidLotLoading && <p className="text-xs text-muted-foreground">Loading lots…</p>}
              {!addBidLotLoading && addBidLotSearch.trim().length === 1 && (
                <p className="text-xs text-muted-foreground">
                  Add a character to search the full catalog by lot name; one letter still filters the loaded list below.
                </p>
              )}
              {!addBidLotLoading && showAddBidLotDropdown && !addBidSelectedLot && (
                <div className="absolute z-[100] left-0 right-0 top-full mt-1 max-h-[40vh] sm:max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-background shadow-lg">
                  {filteredAddBidLots.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No auction lots found.</p>
                  )}
                  {filteredAddBidLots.map(lot => (
                    <button
                      key={lot.lot_id}
                      type="button"
                      className="w-full px-3 py-2 text-left border-b border-border/30 last:border-b-0 hover:bg-muted/40 min-h-[44px] sm:min-h-0"
                      onClick={async () => {
                        setAddBidSelectedLot(lot);
                        setAddBidLotSearch(getAddBidLotIdentifier(lot));
                        setShowAddBidLotDropdown(false);
                        try {
                          const session = await auctionApi.getOrStartSession(lot.lot_id);
                          setAddBidSession(session);
                          setAddBidRemainingQty(Number(session.remaining_bags) || 0);
                        } catch {
                          setAddBidSession(null);
                          setAddBidRemainingQty(0);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">{getAddBidLotIdentifier(lot)}</p>
                        {lot.status && (
                          <span
                            className={cn(
                              'shrink-0 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded',
                              lot.status === 'SOLD' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                              lot.status === 'AVAILABLE' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                              (lot.status === 'PARTIAL' || lot.status === 'PENDING')
                                && 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
                              !['SOLD', 'AVAILABLE', 'PARTIAL', 'PENDING'].includes(String(lot.status || ''))
                                && 'bg-muted text-muted-foreground',
                            )}
                          >
                            {lot.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{lot.seller_name} · {lot.vehicle_number}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">Buyer *</Label>
              <Input
                value={bill?.buyerMark ?? ''}
                disabled
                className="h-10 sm:h-9 rounded-lg bg-muted/30 text-sm"
                title={bill?.buyerMark}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Qty *</Label>
                <BillingMoneyInput
                  value={Number(addBidQty) || 0}
                  min={0}
                  onCommit={n => setAddBidQty(n > 0 ? String(roundMoney2(n)) : '')}
                  placeholder={String(addBidRemainingQty)}
                  className={cn('h-10 sm:h-9 rounded-lg text-sm', numberInputNoSpinnerClass)}
                  title={`Remaining bags: ${addBidRemainingQty}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Base *</Label>
                <BillingMoneyInput
                  value={Number(addBidBaseRate) || 0}
                  min={0}
                  onCommit={n => setAddBidBaseRate(n > 0 ? String(roundMoney2(n)) : '')}
                  className={cn('h-10 sm:h-9 rounded-lg text-sm', numberInputNoSpinnerClass)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Extra</Label>
                <BillingMoneyInput
                  value={Number(addBidExtraAmount) || 0}
                  min={0}
                  onCommit={n => setAddBidExtraAmount(String(roundMoney2(n)))}
                  className={cn('h-10 sm:h-9 rounded-lg text-sm', numberInputNoSpinnerClass)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Token</Label>
                <BillingMoneyInput
                  value={Number(addBidTokenAdvance) || 0}
                  min={0}
                  onCommit={n => setAddBidTokenAdvance(String(roundMoney2(n)))}
                  className={cn('h-10 sm:h-9 rounded-lg text-sm', numberInputNoSpinnerClass)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 pt-4 sm:flex-row sm:justify-end sm:gap-2 border-t mt-4">
            <Button
              type="button"
              variant="outline"
              className={cn(arrSolidMd, 'w-full sm:w-auto order-2 sm:order-1')}
              onClick={() => setAddBidDialogOpen(false)}
              disabled={addBidSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(arrSolidMd, 'w-full sm:w-auto order-1 sm:order-2')}
              onClick={() => void handleAddBidToCurrentBuyer()}
              disabled={addBidSaving}
            >
              {addBidSaving ? 'Saving...' : addBidRetryAllowIncrease ? 'Save (allow lot increase)' : 'Save Bid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!addBidDuplicateDialog}
        onOpenChange={open => {
          if (!open) setAddBidDuplicateDialog(null);
        }}
      >
        <DialogContent
          hideCloseButton
          overlayClassName="z-[200] bg-black/50 backdrop-blur-sm"
          className={cn(
            'dialog-content z-[200] w-[calc(100vw-1.5rem)] max-w-sm gap-0 overflow-hidden border border-border/50 bg-card p-5 shadow-2xl sm:rounded-2xl',
          )}
        >
          {addBidDuplicateDialog && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">
                Reusing mark &quot;{addBidDuplicateDialog.existingEntry.buyer_mark}&quot;?
              </h3>
              <p className="text-sm text-center text-muted-foreground mb-4">
                This mark already exists on this lot (Bid #{addBidDuplicateDialog.existingEntry.bid_number}).
                {addBidDuplicateDialog.existingEntry.bid_rate === addBidDuplicateDialog.rate
                  ? ' Same rate — new quantity will merge into that bid.'
                  : ' Different rate — a separate bid row will be created.'}
              </p>
              <div className="flex gap-3">
                <Button onClick={handleAddBidDuplicateDifferentMark} variant="outline" className="flex-1 h-12 rounded-xl">
                  Different mark
                </Button>
                <Button
                  onClick={handleAddBidDuplicateConfirm}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                >
                  {addBidDuplicateDialog.existingEntry.bid_rate === addBidDuplicateDialog.rate ? 'Merge' : 'Keep separate'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!addBidQtyIncreaseDialog}
        onOpenChange={open => {
          if (!open) setAddBidQtyIncreaseDialog(null);
        }}
      >
        <DialogContent
          hideCloseButton
          overlayClassName="z-[200] bg-black/50 backdrop-blur-sm"
          className={cn(
            'dialog-content z-[200] w-[calc(100vw-1.5rem)] max-w-sm gap-0 overflow-hidden border border-border/50 bg-card p-5 shadow-2xl sm:rounded-2xl',
          )}
        >
          {addBidQtyIncreaseDialog && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Plus className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">Increase lot quantity?</h3>
              <p className="text-sm text-center text-muted-foreground mb-4">
                Lot has <strong>{addBidQtyIncreaseDialog.lotTotal}</strong> bags,{' '}
                <strong>{addBidQtyIncreaseDialog.currentTotal}</strong> already sold. Adding{' '}
                <strong>{addBidQtyIncreaseDialog.attemptedQty}</strong> bags exceeds the limit.
                <br />
                New total will be:{' '}
                <strong>
                  {addBidQtyIncreaseDialog.currentTotal + addBidQtyIncreaseDialog.attemptedQty}
                </strong>{' '}
                bags.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setAddBidQtyIncreaseDialog(null)} variant="outline" className="flex-1 h-12 rounded-xl">
                  Cancel
                </Button>
                <Button
                  onClick={confirmAddBidQtyIncrease}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white"
                >
                  Increase &amp; add
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {contactSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) closeContactSheet(); }}
          >
            <motion.div
              initial={{ y: 400 }}
              animate={{ y: 0 }}
              exit={{ y: 400 }}
              transition={{ type: 'spring', damping: 30 }}
              className="w-full max-w-lg rounded-t-3xl lg:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl border border-border/30"
              style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-1 lg:hidden" />
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-foreground">Register Contact</h3>
                <button type="button" onClick={closeContactSheet} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center" aria-label="Close">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Full Name *</label>
                <Input placeholder="e.g., Ramesh Kumar" value={contactForm.name}
                  onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))}
                  className={cn('h-12 rounded-xl', contactErrors.name && 'border-destructive')} />
                {contactErrors.name && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{contactErrors.name}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Phone Number * <span className="text-emerald-500 font-normal">(Primary ID)</span></label>
                <Input placeholder="e.g., 9876543210" value={contactForm.phone}
                  onChange={e => setContactForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  className={cn('h-12 rounded-xl', contactErrors.phone && 'border-destructive')}
                  type="tel" maxLength={10} />
                {contactErrors.phone && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{contactErrors.phone}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Mark <span className="text-muted-foreground/60 font-normal">(Short Code)</span></label>
                <Input placeholder="e.g., VT, ML, AB" value={contactForm.mark}
                  onChange={e => setContactForm(p => ({ ...p, mark: e.target.value.toUpperCase().slice(0, 4) }))}
                  className={cn('h-12 rounded-xl', contactErrors.mark && 'border-destructive')} maxLength={4} />
                {contactErrors.mark && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{contactErrors.mark}</p>}
                {!contactErrors.mark && <p className="text-[10px] text-muted-foreground mt-1">Used for quick auto-complete in transaction screens</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Address</label>
                <Input placeholder="e.g., Village Pune, Market Yard" value={contactForm.address}
                  onChange={e => setContactForm(p => ({ ...p, address: e.target.value }))}
                  className="h-12 rounded-xl" />
              </div>
              <div className="flex items-center gap-2">
                <input id="billing-enable-portal" type="checkbox" className="w-4 h-4 rounded border border-emerald-500" checked={contactForm.enablePortal} onChange={e => setContactForm(p => ({ ...p, enablePortal: e.target.checked }))} disabled />
                <label htmlFor="billing-enable-portal" className="text-xs text-muted-foreground">Contact Portal login (managed from self-signup/profile in this version)</label>
              </div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 px-3 py-2 flex items-start gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Contact registered. A receivable ledger is created automatically.</p>
              </div>
              <Button variant="outline" onClick={submitBillingContactAdd} className={arrSolidWide14}>
                Register Contact
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isDesktop ? (
        <div className="bg-gradient-to-br from-indigo-400 via-blue-500 to-cyan-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div key={i} className="absolute w-1.5 h-1.5 bg-white/40 rounded-full"
                style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%` }}
                animate={{ y: [-10, 10], opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
              />
            ))}
          </div>
          <div className="relative z-10">
            <div className="flex items-start gap-2 mb-3">
              <button type="button" onClick={() => navigate('/home')} aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0 mt-0.5">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-xl font-black">₹</span> Billing
                </h1>
                <p className="text-white/70 text-xs mt-0.5">Sales bill · {buyersForBilling.length} buyer{buyersForBilling.length !== 1 ? 's' : ''} with unbilled bids</p>
              </div>
              <div className="flex-shrink-0" />
            </div>

            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1 touch-pan-x" role="tablist" aria-label="Billing views">
              <button type="button" onClick={() => setBillingMainTab('create')}
                className={billingToggleTabBtnOnHero(billingMainTab === 'create')}>
                <Plus className="w-4 h-4 shrink-0 hidden sm:block" />
                <span>Create New Bill{tabHint('Alt X')}</span>
              </button>
              <button type="button" onClick={() => setBillingMainTab('progress')}
                className={billingToggleTabBtnOnHero(billingMainTab === 'progress')}>
                <Clock className="w-4 h-4 shrink-0 hidden sm:block" />
                <span>Bill In Progress{tabHint('Alt Y')}</span>
              </button>
              <button type="button" onClick={() => setBillingMainTab('saved')}
                className={billingToggleTabBtnOnHero(billingMainTab === 'saved')}>
                <FileText className="w-4 h-4 shrink-0 hidden sm:block" />
                <span>Bills Saved{tabHint('Alt Z')}</span>
              </button>
            </div>

            {(billingMainTab === 'progress' || billingMainTab === 'saved') && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <input aria-label="Search bills" placeholder="Search mark, vehicle, bill #…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 sm:px-8 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <span className="text-xl font-black text-indigo-500">₹</span> Billing (Sales Bill)
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">{buyersForBilling.length} buyers with unbilled bids · Invoicing & generation</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end w-full lg:w-auto" />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4 mb-4">
            <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto" role="tablist" aria-label="Billing views">
              <button type="button" onClick={() => setBillingMainTab('create')} className={billingToggleTabBtn(billingMainTab === 'create')}>
                <Plus className="w-4 h-4" /> Create New Bill{tabHint('Alt X')}
              </button>
              <button type="button" onClick={() => setBillingMainTab('progress')} className={billingToggleTabBtn(billingMainTab === 'progress')}>
                <Clock className="w-4 h-4" /> Bill In Progress{tabHint('Alt Y')}
              </button>
              <button type="button" onClick={() => setBillingMainTab('saved')} className={billingToggleTabBtn(billingMainTab === 'saved')}>
                <FileText className="w-4 h-4" /> Bills Saved{tabHint('Alt Z')}
              </button>
            </div>
            {(billingMainTab === 'progress' || billingMainTab === 'saved') && (
              <div className="relative w-full min-w-0 lg:flex-1 lg:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input aria-label="Search bills" placeholder="Bill #, mark, vehicle…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF]" />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-4 mt-4 space-y-2">
        {billingMainTab === 'create' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-4 sm:p-5 space-y-4 overflow-visible relative z-30">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2">
              <div ref={buyerSelectRef} className="relative">
                <Input
                  value={buyerBidMarkInput}
                  onFocus={() => setShowBuyerSuggestions(true)}
                  onChange={e => {
                    setBuyerBidMarkInput(e.target.value);
                    setSelectedBuyerFromDropdown(null);
                    setShowBuyerSuggestions(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleGetBidsForMark();
                    }
                    if (e.key === 'Escape') setShowBuyerSuggestions(false);
                  }}
                  placeholder="Search buyer mark or name..."
                  className="h-11 sm:h-12 rounded-xl text-base font-medium bg-muted/20 border-border/30 pr-9"
                  autoCapitalize="characters"
                />
                <button
                  type="button"
                  onClick={() => setShowBuyerSuggestions(prev => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/40"
                  aria-label="Toggle buyer suggestions"
                >
                  <ChevronDown className={cn('w-4 h-4 transition-transform', showBuyerSuggestions && 'rotate-180')} />
                </button>
                {showBuyerSuggestions && !searchBidDialogOpen && (
                  <div className={cn("absolute z-50 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-background shadow-lg", searchBidDialogOpen && "z-[20]")}>
                    {filteredBuyerOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No buyers match your search.</p>
                    ) : (
                      filteredBuyerOptions.map((b, idx) => (
                        <button
                          type="button"
                          key={`${b.buyerContactId ?? 'n'}::${b.buyerMark ?? ''}::${b.buyerName ?? ''}::${idx}`}
                          onClick={() => {
                            setSelectedBuyerFromDropdown(b);
                            setBuyerBidMarkInput(b.buyerMark || b.buyerName);
                            setShowBuyerSuggestions(false);
                          }}
                          className={cn(
                            'w-full text-left px-3 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 transition-colors',
                            selectedBuyerFromDropdown?.buyerMark === b.buyerMark && selectedBuyerFromDropdown?.buyerName === b.buyerName && 'bg-primary/10',
                          )}
                        >
                          <p className="text-xs font-semibold text-foreground">{b.buyerMark} - {b.buyerName}</p>
                          <p className="text-[11px] text-muted-foreground">{b.entries.length} bid(s)</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <Button type="button" variant="outline" onClick={() => void handleGetBidsForMark()} className={cn(arrSolidLg, 'sm:self-end')}>
                Get Bid
              </Button>
              <Button type="button" variant="outline" onClick={handleSelectBidMode} className={cn(arrSolidLg, 'sm:self-end')}>
                Select Bid
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleClearBillEditor()}
                disabled={!bill && !selectedBuyer}
                className={cn(arrSolidLg, 'sm:self-end')}
              >
                Change Buyer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter the same mark or name used on auction bids, then open the bill form.
            </p>
            {selectBidBuyer && (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-foreground">{selectBidBuyer.buyerName} ({selectBidBuyer.buyerMark})</p>
                    <p className="text-xs text-muted-foreground">{selectBidBuyer.entries.length} bid(s) found</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedBidKeys(selectBidBuyer.entries.map(getBidSelectionKey))}
                      disabled={selectBidBuyer.entries.length === 0}
                      className={arrSolidSm}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedBidKeys([])}
                      disabled={selectedBidKeys.length === 0}
                      className={arrSolidSm}
                    >
                      Deselect All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setSelectBidBuyer(null); setSelectedBidKeys([]); }}
                      className={arrSolidSm}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {selectBidBuyer.entries.map((entry) => {
                    const checked = selectedBidKeys.includes(getBidSelectionKey(entry));
                    return (
                      <button
                        type="button"
                        key={`${entry.bidNumber}-${entry.lotId}`}
                        onClick={() => toggleBidSelection(entry)}
                        className={cn(
                          "w-full text-left rounded-lg border p-2.5 transition-all",
                          checked ? "border-primary/50 bg-primary/10" : "border-border/50 bg-background/50 hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleBidSelection(entry)}
                            className="mt-0.5 h-4 w-4 rounded border-border"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {formatLotIdentifierForBillEntry(entry)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleCreateBillFromSelected()}
                  disabled={selectedBidKeys.length === 0}
                  className={arrSolidWide10}
                >
                  Create Bill From Selected ({selectedBidKeys.length})
                </Button>
              </div>
            )}
            {buyersForBilling.length === 0 && (
              <div className="rounded-xl bg-muted/30 p-4 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No auction bids loaded yet.</p>
                <Button type="button" variant="outline" onClick={() => navigate('/auctions')} className={arrSolidMd}>Go to Auctions</Button>
              </div>
            )}
          </motion.div>
        )}

        {billingMainTab === 'create' && bill && selectedBuyer && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={cn("glass-card rounded-2xl p-3 sm:p-4 space-y-3 overflow-visible", searchBidDialogOpen ? "z-[20]" : "z-[20]")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <Receipt className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h3
                      className="text-sm sm:text-base font-bold text-foreground truncate"
                      title={`Sales bill — ${(bill.billingName || bill.buyerName)} (${bill.buyerMark})`}
                    >
                      Sales bill — {bill.billingName || bill.buyerName} ({bill.buyerMark})
                    </h3>
                    <p className="text-[10px] sm:text-sm text-muted-foreground truncate">
                      {bill.billNumber || 'New Bill'} · {bill.commodityGroups.reduce((s, g) => s + g.items.length, 0)} item(s) · ₹{formatBillingInr(bill.grandTotal)}
                    </p>
                  </div>
                </div>
                <div className={cn("flex flex-col gap-2 shrink-0 w-full sm:w-auto sm:max-w-none sm:items-end", searchBidDialogOpen ? "z-[30]" : "z-[40]")}>
                  <div className="flex flex-col gap-2 w-full sm:flex-row sm:items-end sm:justify-end sm:gap-2">
                    <div className="w-full sm:w-auto sm:min-w-[16rem]">
                      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block text-left sm:text-right">
                        Billing Name (appears on print) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={bill.billingName}
                        onChange={e => {
                          setBill({ ...bill, billingName: e.target.value });
                        }}
                        className={cn(
                          'h-9 rounded-xl text-xs',
                          validationErrors.billingName && 'border-destructive ring-1 ring-destructive/30',
                        )}
                      />
                      {validationErrors.billingName && (
                        <p className="text-[10px] text-destructive mt-1 text-left sm:text-right">{validationErrors.billingName}</p>
                      )}
                    </div>
                    <div className="w-full sm:w-auto sm:min-w-[11rem]">
                      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block text-left sm:text-right">Search & Migrate</Label>
                      <div ref={searchBidBuyerSelectRef} className="relative w-full sm:w-48 sm:ml-auto">
                        <Input
                          ref={searchBidInputRef}
                          value={searchBidInput}
                          onFocus={() => setShowSearchBidBuyerSuggestions(true)}
                          onChange={e => {
                            setSearchBidInput(e.target.value);
                            setShowSearchBidBuyerSuggestions(true);
                          }}
                          aria-label="Search & Migrate"
                          title={`Search & Migrate${tabHint('Alt L')}`}
                          placeholder="Search & Migrate"
                          className="h-9 rounded-xl text-xs"
                        />
                        {showSearchBidBuyerSuggestions && !searchBidDialogOpen && (
                          <div className={cn("absolute top-full mt-1 w-full min-w-[12rem] max-h-44 overflow-y-auto rounded-xl border border-border/50 bg-background shadow-lg", searchBidDialogOpen ? "z-[20]" : "z-[100]")}>
                            {searchBidBuyerOptions.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-muted-foreground">No buyer found.</p>
                            ) : (
                              searchBidBuyerOptions.map((b, idx) => (
                                <button
                                  key={`${b.buyerContactId ?? 'n'}::${b.buyerMark ?? ''}::${b.buyerName ?? ''}::${idx}`}
                                  type="button"
                                  onClick={() => openSearchBidDialogForBuyer(b)}
                                  className="w-full text-left px-3 py-2 border-b border-border/40 last:border-b-0 hover:bg-muted/40"
                                >
                                  <p className="text-xs font-semibold">{b.buyerMark} - {b.buyerName}</p>
                                  <p className="text-[11px] text-muted-foreground">{b.entries.length} bid(s)</p>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'w-full sm:w-auto shrink-0', addBidDialogOpen && 'ring-2 ring-[#6075FF] ring-offset-2 ring-offset-background')}
                      onClick={() => setAddBidDialogOpen(true)}
                    >
                      Add New Bid
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div className="rounded-xl border border-border/40 p-3">
                  <p className="text-[10px] text-primary font-semibold uppercase">Buyer</p>
                  <p className="text-sm sm:text-base font-bold text-foreground truncate">{bill.buyerName || '—'}</p>
                  <p className="text-xs text-muted-foreground">{bill.buyerPhone || 'No phone'}</p>
                  <p className="text-xs text-muted-foreground truncate">{bill.buyerAddress || 'No address'}</p>
                </div>
                <div className="rounded-xl border border-border/40 p-3">
                  <p className="text-[10px] text-primary font-semibold uppercase">Broker</p>
                  <p className="text-sm sm:text-base font-bold text-foreground truncate">
                    {bill.buyerAsBroker ? (bill.buyerName || 'Not selected') : (bill.brokerName || 'Not selected')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bill.buyerAsBroker ? (bill.buyerPhone || 'No phone') : (bill.brokerPhone || 'No phone')}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {bill.buyerAsBroker ? (bill.buyerAddress || 'No address') : (bill.brokerAddress || 'No address')}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/30 dark:bg-muted/15 px-2 py-1.5 min-h-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] text-muted-foreground uppercase leading-none tracking-wide">Items</p>
                    <p className="text-xs font-semibold text-foreground tabular-nums leading-tight mt-0.5">
                      {bill.commodityGroups.reduce((s, g) => s + g.items.length, 0)}
                    </p>
                  </div>
                  <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/30 dark:bg-muted/15 px-2 py-1.5 min-h-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] text-muted-foreground uppercase leading-none tracking-wide">Total</p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight mt-0.5 truncate">
                      ₹{formatBillingInr(bill.grandTotal)}
                    </p>
                  </div>
                  <IndianRupee className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
                </div>
              </div>
            </div>
            {/* Select Or Replace Buyer & broker — one row (wraps on narrow screens); no separate Save */}
            <div className={cn("glass-card rounded-2xl p-3 space-y-2 relative overflow-visible", searchBidDialogOpen ? "z-[20]" : "z-[30]")}>
              <div className="space-y-3">
                <div className="min-w-0 rounded-xl border border-border/40 bg-muted/10 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    BUYER & BROKER
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                <RadioGroup
                  value={replaceTarget}
                  onValueChange={v => {
                    if (v === 'BUYER' || v === 'BROKER') {
                      setReplaceTarget(v);
                      clearReplacementInline();
                    }
                  }}
                  className="flex flex-row gap-x-3 min-h-9 shrink-0 items-center rounded-xl border border-border/30 bg-muted/20 px-2.5 py-1.5"
                  disabled={!bill}
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="BUYER" id="billing-replace-target-buyer" disabled={!bill} />
                    <Label htmlFor="billing-replace-target-buyer" className="cursor-pointer text-sm font-medium whitespace-nowrap">
                      Buyer
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="BROKER" id="billing-replace-target-broker" disabled={!bill} />
                    <Label htmlFor="billing-replace-target-broker" className="cursor-pointer text-sm font-medium whitespace-nowrap">
                      Broker
                    </Label>
                  </div>
                </RadioGroup>
                <div className="relative min-w-[7rem] flex-1 basis-[10rem]">
                  <Input
                    value={replaceMarkInput}
                    onChange={e => {
                      const value = e.target.value.toUpperCase();
                      setReplaceMarkInput(value);
                      setReplaceSelectedContact(null);
                      setReplaceForm(prev => ({ ...prev, mark: value }));
                    }}
                    placeholder="Mark"
                    className={cn('h-9 rounded-lg bg-muted/10 border-border/30 text-sm font-medium', replaceErrors.mark && 'border-destructive')}
                    disabled={!bill}
                  />
                  {!replaceSearchLoading && replaceMarkInput.trim() && replaceSearchResults.length > 0 && !searchBidDialogOpen && (
                    <div className={cn("absolute mt-1 max-h-44 w-full min-w-[12rem] overflow-y-auto rounded-xl border border-border/50 bg-background shadow-lg", searchBidDialogOpen ? "z-[20]" : "z-[90]")}>
                      {replaceSearchResults.map(c => (
                        <button
                          key={c.contact_id}
                          type="button"
                          onClick={() => pickReplacementContact(c)}
                          className={cn(
                            'w-full border-b border-border/30 px-3 py-2 text-left last:border-b-0 hover:bg-muted/40',
                            replaceSelectedContact?.contact_id === c.contact_id && 'bg-primary/10',
                          )}
                        >
                          <p className="text-xs font-semibold">{(c.mark || 'NO MARK').toUpperCase()} - {c.name}</p>
                          <p className="text-[11px] text-muted-foreground">{c.phone || 'No phone'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  value={replaceForm.phone}
                  onChange={e => {
                    setReplaceSelectedContact(null);
                    setReplaceForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }));
                  }}
                  placeholder="Mobile"
                  inputMode="numeric"
                  autoComplete="tel"
                  className={cn('h-9 w-[9.25rem] shrink-0 rounded-lg bg-muted/10 border-border/30 text-sm font-medium sm:w-40', replaceErrors.phone && 'border-destructive')}
                  disabled={!bill}
                />
                <Input
                  value={replaceForm.name}
                  onChange={e => {
                    setReplaceSelectedContact(null);
                    setReplaceForm(prev => ({ ...prev, name: e.target.value }));
                  }}
                  placeholder="Name"
                  className={cn(
                    'h-9 rounded-lg bg-muted/10 border-border/30 text-sm font-medium min-w-[5.5rem] flex-1 basis-[10rem] max-w-[14rem]',
                    replaceErrors.name && 'border-destructive',
                  )}
                  disabled={!bill}
                />
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border border-border"
                    checked={!!bill?.buyerAsBroker}
                    onChange={e => {
                      const checked = e.target.checked;
                      if (!bill) return;
                      if (!checked) {
                        setBill({ ...bill, buyerAsBroker: false });
                        return;
                      }
                      setBill({
                        ...bill,
                        buyerAsBroker: true,
                        brokerName: bill.buyerName,
                        brokerMark: bill.buyerMark,
                        brokerContactId: bill.buyerContactId,
                        brokerPhone: bill.buyerPhone,
                        brokerAddress: bill.buyerAddress,
                      });
                    }}
                    disabled={!bill}
                  />
                  Use buyer as broker
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(arrSolidMd, 'whitespace-nowrap shrink-0')}
                  onClick={() => void submitReplacement()}
                  disabled={
                    !bill || (!replaceSelectedContact && !canCreateContact)
                  }
                  title={
                    !replaceSelectedContact && !canCreateContact
                      ? 'You do not have permission to create contacts.'
                      : undefined
                  }
                >
                  {replaceSelectedContact
                    ? `Update ${replaceTarget === 'BROKER' ? 'Broker' : 'Buyer'}`
                    : `Add ${replaceTarget === 'BROKER' ? 'Broker' : 'Buyer'}`}
                </Button>
                <Button type="button" variant="outline" className={cn(arrSolidMd, 'shrink-0')} onClick={clearReplacementInline}>
                  Clear
                </Button>
                  </div>
                </div>
                <div className="min-w-0 rounded-xl border border-border/40 bg-muted/10 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    CHARGES
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide cursor-pointer select-none"
                        onClick={() =>
                          setBill({
                            ...bill,
                            brokerageType: bill.brokerageType === 'PERCENT' ? 'AMOUNT' : 'PERCENT',
                          })
                        }
                        title={`Click to switch type (${bill.brokerageType === 'PERCENT' ? '%' : '₹'})`}
                      >
                        BROKERAGE
                      </p>
                      <BillingMoneyInput
                        value={bill.brokerageValue}
                        min={0}
                        onCommit={n => {
                          setBill({ ...bill, brokerageValue: n });
                        }}
                        placeholder={bill.brokerageType === 'PERCENT' ? '% Brokerage' : '₹ Brokerage'}
                        className={cn(
                          'h-9 w-full rounded-lg text-xs text-center font-bold bg-muted/10',
                          validationErrors.brokerageValue && 'border-destructive ring-1 ring-destructive/30',
                          numberInputNoSpinnerClass,
                        )}
                      />
                      {validationErrors.brokerageValue && (
                        <p className="text-[9px] text-destructive mt-0.5 text-right">
                          {validationErrors.brokerageValue}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                        OTHER CHARGES
                      </p>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <BillingMoneyInput
                          value={bill.globalOtherCharges}
                          min={0}
                          onCommit={n => {
                            setBill({ ...bill, globalOtherCharges: n });
                          }}
                          placeholder="Other Charges (₹)"
                          className={cn(
                            'h-9 min-w-0 flex-1 rounded-lg text-xs text-center font-bold bg-muted/10',
                            validationErrors.globalOtherCharges && 'border-destructive ring-1 ring-destructive/30',
                            numberInputNoSpinnerClass,
                          )}
                        />
                      </div>
                      {validationErrors.globalOtherCharges && (
                        <p className="text-[9px] text-destructive mt-0.5 text-right">
                          {validationErrors.globalOtherCharges}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={applyGlobalCharges}
                      className={cn(arrSolidSm, 'h-9 shrink-0 whitespace-nowrap px-2.5 sm:px-3')}
                    >
                      Apply to All
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground">
                Global charges: brokerage and other amounts apply to all items in this bill.
              </p>
              {(replaceErrors.mark || replaceErrors.name || replaceErrors.phone) && (
                <p className="text-[11px] text-destructive">
                  {[replaceErrors.mark, replaceErrors.name, replaceErrors.phone].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            {bill.commodityGroups.length > 1 && (
              <div className="lg:hidden flex items-center justify-center gap-1.5 -mt-1 mb-1">
                {bill.commodityGroups.map((_, gi) => (
                  <button
                    key={`commodity-dot-${gi}`}
                    type="button"
                    onClick={() => {
                      const el = mobileCommodityCarouselRef.current;
                      if (!el) return;
                      const left = (el.scrollWidth / bill.commodityGroups.length) * gi;
                      el.scrollTo({ left, behavior: 'smooth' });
                    }}
                    className={cn(
                      'rounded-full transition-all bg-muted-foreground/40',
                      activeCommoditySlide === gi ? 'w-4 h-2 bg-primary' : 'w-2 h-2',
                    )}
                    aria-label={`Go to commodity ${gi + 1}`}
                  />
                ))}
              </div>
            )}
            <div
              ref={mobileCommodityCarouselRef}
              onScroll={handleCommodityCarouselScroll}
              className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 lg:block lg:overflow-visible lg:snap-none lg:pb-0 lg:space-y-3"
            >
              {bill.commodityGroups.map((group, gi) => (
                <motion.div key={gi} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + gi * 0.05 }}
                  className="glass-card rounded-2xl overflow-hidden shrink-0 w-[calc(100%-0.1rem)] snap-start lg:w-auto">
                {(() => {
                  const isCollapsed = collapsedCommodityIndexes.includes(gi);
                  const groupTotalQty = roundMoney2(
                    group.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
                  );
                  const groupTotalWeight = roundMoney2(
                    group.items.reduce((s, i) => s + (Number(i.weight) || 0), 0),
                  );
                  return (
                    <>
                      <div className="p-3 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border-b border-border/30">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="text-base font-bold text-foreground leading-snug">{group.commodityName}</p>
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <button
                              type="button"
                              onClick={() => toggleCommodityCollapse(gi)}
                              className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold',
                                billingBtnGradient,
                              )}
                              aria-label={isCollapsed ? 'Expand commodity details' : 'Collapse commodity details'}
                              aria-expanded={!isCollapsed}
                            >
                              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                              {isCollapsed ? 'Expand' : 'Collapse'}
                            </button>
                            {group.hsnCode && (
                              <span className="px-2 py-0.5 rounded bg-muted/40 text-[9px] font-bold text-muted-foreground">
                                HSN: {group.hsnCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {!isCollapsed && (
                        <div className="p-3 space-y-2">
                          {/* Table header for commodity items */}
                          <div className="hidden lg:grid lg:grid-cols-[minmax(140px,1.6fr),repeat(9,minmax(0,1fr)),minmax(44px,0.5fr)] gap-1.5 px-1 pb-1 text-[10px] font-semibold text-muted-foreground uppercase text-center">
                            <span>Item</span>
                            <span>Qty</span>
                            <span>Weight (kg)</span>
                            <span>Avg Wt (kg)</span>
                            <span>Other Charges</span>
                            <span>Brokerage (₹)</span>
                            <span>Token (₹)</span>
                            <span>Bid Rate (₹)</span>
                            <span>New Rate (₹)</span>
                            <span>Amount (₹)</span>
                            <span>Action</span>
                          </div>

                          {group.items.length > 1 && (
                            <div className="lg:hidden flex items-center justify-center gap-1.5 mb-1">
                              {group.items.map((_, ii) => (
                                <button
                                  key={`lot-dot-${gi}-${ii}`}
                                  type="button"
                                  onClick={() => {
                                    const el = mobileLotCarouselRefs.current[gi];
                                    if (!el) return;
                                    const left = (el.scrollWidth / group.items.length) * ii;
                                    el.scrollTo({ left, behavior: 'smooth' });
                                  }}
                                  className={cn(
                                    'rounded-full transition-all bg-muted-foreground/40',
                                    (activeLotSlides[gi] ?? 0) === ii ? 'w-4 h-2 bg-primary' : 'w-2 h-2',
                                  )}
                                  aria-label={`Go to lot ${ii + 1}`}
                                />
                              ))}
                            </div>
                          )}
                          <div
                            ref={el => {
                              mobileLotCarouselRefs.current[gi] = el;
                            }}
                            onScroll={() => handleLotCarouselScroll(gi)}
                            className="space-y-2 lg:space-y-2 flex lg:block overflow-x-auto lg:overflow-visible snap-x snap-mandatory gap-2 lg:gap-0"
                          >
                            {group.items.map((item, ii) => {
                              const avgWeight = item.quantity > 0 ? item.weight / item.quantity : 0;
                              const bounds = commodityAvgWeightBounds[group.commodityName];
                              const avgBelowMin = bounds != null && bounds.min > 0 && avgWeight < bounds.min;
                              const avgAboveMax = bounds != null && bounds.max > 0 && avgWeight > bounds.max;
                              const avgOutOfRange = avgBelowMin || avgAboveMax;
                              return (
                                <div
                                  key={ii}
                                  className="relative shrink-0 w-full snap-start grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1 text-[11px] lg:text-[10px] lg:grid-cols-[minmax(140px,1.6fr),repeat(9,minmax(0,1fr)),minmax(44px,0.5fr)] lg:gap-x-1.5 items-start lg:items-center rounded-xl bg-card border border-border/60 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-2.5 py-2 lg:px-2 lg:py-1.5 text-center lg:w-auto"
                                >
                                  <button
                                    type="button"
                                    onClick={() => requestRemoveLineItem(gi, ii)}
                                    className="absolute top-1.5 right-1.5 lg:hidden inline-flex items-center justify-center rounded-md p-1.5 text-destructive hover:bg-destructive/10 active:bg-destructive/20"
                                    aria-label="Remove line item"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                  <div className="min-w-0 col-span-2 sm:col-span-3 lg:col-span-1">
                                    <p className="lg:hidden text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 text-center">Item</p>
                                    <p className="text-[11px] font-semibold text-foreground truncate leading-tight text-center">
                                      {formatLotIdentifierForBillEntry(item)}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="lg:hidden text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 text-center">Qty</p>
                                    <BillingMoneyInput
                                      value={item.quantity}
                                      min={0}
                                      onCommit={n => {
                                        updateLineItem(gi, ii, 'quantity', Math.max(1, n));
                                      }}
                                      className={cn(
                                        'h-10 lg:h-6 text-[11px] lg:text-[10px] text-center px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
                                        validationErrors[`items.${gi}.${ii}.quantity`] &&
                                          'ring-1 ring-destructive/40 rounded',
                                      )}
                                    />
                                    {validationErrors[`items.${gi}.${ii}.quantity`] && (
                                      <p className="mt-0.5 text-[9px] lg:text-[8px] text-destructive text-center">
                                        {validationErrors[`items.${gi}.${ii}.quantity`]}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <p className="lg:hidden text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 text-center">Wt (kg)</p>
                                    <BillingMoneyInput
                                      value={item.weight}
                                      min={0}
                                      onCommit={n => {
                                        updateLineItem(gi, ii, 'weight', n);
                                      }}
                                      className={cn(
                                        'h-10 lg:h-6 text-[11px] lg:text-[10px] text-center px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
                                        (validationErrors[`items.${gi}.${ii}.weight`] || item.weight === 0) &&
                                          'ring-1 ring-destructive/40 rounded',
                                      )}
                                    />
                                    {item.weight === 0 && (
                                      <p className="mt-0.5 text-[9px] lg:text-[8px] text-destructive text-center">Can&apos;t be 0</p>
                                    )}
                                    {validationErrors[`items.${gi}.${ii}.weight`] && (
                                      <p className="mt-0.5 text-[9px] lg:text-[8px] text-destructive text-center">
                                        {validationErrors[`items.${gi}.${ii}.weight`]}
                                      </p>
                                    )}
                                  </div>

                                  <div className={cn("text-foreground", avgOutOfRange && "text-amber-600 font-semibold")}>
                                    <p className="lg:hidden text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 text-center">Avg Wt</p>
                                    <div
                                      className={cn(
                                        billingCommodityReadOnlyCellClass,
                                        avgOutOfRange &&
                                          'border-amber-500/45 bg-amber-500/[0.12] text-amber-800 dark:text-amber-300',
                                      )}
                                      title="Calculated: weight ÷ quantity (not editable)"
                                      aria-label={`Average weight ${formatBillingInr(avgWeight)} kilograms, calculated, read-only`}
                                    >
                                      {formatBillingInr(avgWeight)}
                                    </div>
                                    {avgBelowMin && item.weight > 0 && (
                                      <p className="mt-0.5 text-[8px] text-amber-600 text-center">
                                        &lt;min {bounds!.min}kg
                                      </p>
                                    )}
                                    {avgAboveMax && item.weight > 0 && (
                                      <p className="mt-0.5 text-[8px] text-amber-600 text-center">
                                        &gt;max {bounds!.max}kg
                                      </p>
                                    )}
                                    {validationErrors[`items.${gi}.${ii}.avgWeight`] && (
                                      <p className="mt-0.5 text-[8px] text-destructive text-center">
                                        {validationErrors[`items.${gi}.${ii}.avgWeight`]}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <p className="lg:hidden text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 text-center">Other ₹</p>
                                    <BillingMoneyInput
                                      value={item.otherCharges}
                                      min={0}
                                      onCommit={n => {
                                        updateLineItem(gi, ii, 'otherCharges', n);
                                      }}
                                      className={cn(
                                        'h-10 lg:h-6 text-[11px] lg:text-[10px] text-center px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
                                        validationErrors[`items.${gi}.${ii}.otherCharges`] &&
                                          'ring-1 ring-destructive/40 rounded',
                                      )}
                                    />
                                    {validationErrors[`items.${gi}.${ii}.otherCharges`] && (
                                      <p className="text-[9px] lg:text-[8px] text-destructive mt-0.5 text-center">
                                        {validationErrors[`items.${gi}.${ii}.otherCharges`]}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <p className="lg:hidden text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 text-center">Brok ₹</p>
                                    <BillingMoneyInput
                                      value={item.brokerage}
                                      min={0}
                                      onCommit={n => {
                                        updateLineItem(gi, ii, 'brokerage', n);
                                      }}
                                      className={cn(
                                        'h-10 lg:h-6 text-[11px] lg:text-[10px] text-center px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
                                        validationErrors[`items.${gi}.${ii}.brokerage`] &&
                                          'ring-1 ring-destructive/40 rounded',
                                      )}
                                    />
                                    {validationErrors[`items.${gi}.${ii}.brokerage`] && (
                                      <p className="text-[9px] lg:text-[8px] text-destructive mt-0.5 text-center">
                                        {validationErrors[`items.${gi}.${ii}.brokerage`]}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <p className="lg:hidden text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 text-center">Token ₹</p>
                                    <BillingMoneyInput
                                      value={item.tokenAdvance ?? 0}
                                      min={0}
                                      onCommit={n => updateLineItem(gi, ii, 'tokenAdvance', n)}
                                      className={`h-10 lg:h-6 text-[11px] lg:text-[10px] text-center px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${numberInputNoSpinnerClass}`}
                                      title="Token advance from auction"
                                    />
                                  </div>

                                  <div>
                                    <p className="lg:hidden text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 text-center">Bid Rate ₹</p>
                                    <BillingMoneyInput
                                      value={item.baseRate || 0}
                                      min={0}
                                      onCommit={n => {
                                        updateLineItem(gi, ii, 'baseRate', n);
                                      }}
                                      className={`h-10 lg:h-6 text-[11px] lg:text-[10px] text-center px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${numberInputNoSpinnerClass}`}
                                    />
                                  </div>

                                  <div className="text-primary font-semibold">
                                    <p className="lg:hidden text-[9px] font-semibold text-primary/80 uppercase tracking-wide mb-0.5 text-center">New Rate ₹</p>
                                    <div
                                      className={cn(
                                        billingCommodityReadOnlyCellClass,
                                        'font-bold text-primary/85 dark:text-primary/75 border-primary/25 bg-primary/[0.07]',
                                      )}
                                      title="Calculated from bid rate, brokerage, and other charges (not editable)"
                                      aria-label={`New rate ₹${formatBillingInr(item.newRate)}, calculated, read-only`}
                                    >
                                      ₹{formatBillingInr(item.newRate)}
                                    </div>
                                  </div>

                                  <div className="text-foreground font-bold">
                                    <p className="lg:hidden text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-0.5 text-center">Amount ₹</p>
                                    <div
                                      className={cn(
                                        billingCommodityReadOnlyCellClass,
                                        'font-bold text-emerald-900/90 dark:text-emerald-300/95 border-emerald-600/25 bg-emerald-500/[0.08]',
                                      )}
                                      title="Calculated from weight and new rate (not editable)"
                                      aria-label={`Amount ₹${formatBillingInr(item.amount)}, calculated, read-only`}
                                    >
                                      ₹{formatBillingInr(item.amount)}
                                    </div>
                                  </div>

                                  <div className="hidden lg:col-span-1 lg:flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => requestRemoveLineItem(gi, ii)}
                                      className="inline-flex items-center justify-center rounded-lg p-2 lg:p-1.5 text-destructive hover:bg-destructive/10 active:bg-destructive/20"
                                      aria-label="Remove line item"
                                    >
                                      <Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            <div className="hidden lg:grid lg:grid-cols-[minmax(140px,1.6fr),repeat(9,minmax(0,1fr)),minmax(44px,0.5fr)] gap-1.5 items-center rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 px-2 py-2 text-[11px] font-bold text-center text-white shadow-md">
                              <div className="text-white">Total</div>
                              <div className="text-white">
                                {formatBillingInr(groupTotalQty)}
                              </div>
                              <div className="text-white">
                                {formatBillingInr(groupTotalWeight)}
                              </div>
                              <div />
                              <div />
                              <div />
                              <div className="text-white">
                                ₹{formatBillingInr(roundMoney2(group.items.reduce((s, i) => s + (Number(i.tokenAdvance) || 0), 0)))}
                              </div>
                              <div />
                              <div />
                              <div className="text-white">
                                ₹{formatBillingInr(roundMoney2(group.items.reduce((s, i) => s + (Number(i.amount) || 0), 0)))}
                              </div>
                              <div />
                            </div>

                            <div className="pt-2 border-t border-border/30 space-y-1 text-xs">
                            </div>

                          </div>
                        </div>
                      )}
                      {isCollapsed && (
                        <div className="px-3 py-2.5 bg-muted/10 border-t border-border/20">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 text-[11px]">
                            <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 min-w-0 sm:justify-start text-center sm:text-left">
                              <span className="text-muted-foreground font-medium shrink-0">
                                Items: {group.items.length}
                              </span>
                              <span className="hidden sm:inline text-muted-foreground/50 select-none" aria-hidden>
                                ·
                              </span>
                              <span className="font-semibold text-foreground tabular-nums">
                                Total Qty: {formatBillingInr(groupTotalQty)}
                              </span>
                              <span className="hidden sm:inline text-muted-foreground/50 select-none" aria-hidden>
                                ·
                              </span>
                              <span className="font-semibold text-foreground tabular-nums">
                                Total Wt: {formatBillingInr(groupTotalWeight)} kg
                              </span>
                            </div>
                            <span className="text-center sm:text-right font-semibold text-foreground tabular-nums border-t border-border/30 pt-2 sm:border-0 sm:pt-0 shrink-0">
                              Subtotal/Gross: ₹{formatBillingInr(group.subtotal)}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
                </motion.div>
              ))}
            </div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="glass-card rounded-2xl p-3 sm:p-4 space-y-3">
              <p className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                Bill Summary
              </p>
              <div className="flex items-stretch gap-2">
                <div
                  ref={summaryTableScrollRef}
                  onScroll={handleSummaryTableScroll}
                  className="overflow-x-auto rounded-xl border border-border/50 bg-background/40 shadow-sm xl:flex-none xl:w-fit xl:max-w-[78%]"
                >
                  <table
                    className="w-max text-[11px] leading-tight border-separate border-spacing-0"
                    style={{ minWidth: `${110 + (bill.commodityGroups.length * 150)}px` }}
                  >
                  <thead>
                    <tr className="bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] shadow-sm">
                      <th className="sticky top-0 left-0 z-30 text-center px-2 py-2.5 font-extrabold text-white uppercase tracking-widest whitespace-normal bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] border-b border-white/30 border-r border-white/20 min-w-[110px] max-w-[110px] w-[110px] shadow-sm text-[10px]">Activity</th>
                      {bill.commodityGroups.map((g, gi) => (
                        <th
                          key={`${g.commodityName}-${gi}`}
                          className={cn(
                            'lg:sticky lg:top-0 z-20 text-center px-3 py-3 font-extrabold text-white uppercase tracking-widest min-w-[150px] border-b border-white/30 border-l border-white/20 bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] shadow-sm',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-white/20',
                          )}
                        >
                          <span className="text-xs font-bold text-blue-100">📦</span>
                          <div>{g.commodityName || `Commodity ${gi + 1}`}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-b border-border/30 border-r border-border/50 min-w-[110px] max-w-[110px] w-[110px]">Gross Amt</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`gross-${gi}`}
                          className={cn(
                            'px-2 py-1.5 text-foreground dark:text-neutral-900 font-semibold border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          ₹{formatBillingInr(g.subtotal)}
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <td
                        colSpan={bill.commodityGroups.length + 1}
                        className="sticky left-0 z-50 px-3 py-3 font-extrabold uppercase tracking-wider text-center whitespace-normal text-violet-800 dark:text-violet-200 bg-violet-500/20 dark:bg-violet-500/30 border-t-2 border-b-2 border-violet-500/50 dark:border-violet-400/40 shadow-sm"
                      >
                        💎 Commodity Additional Expenses
                      </td>
                    </tr>
                    <tr>
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-b border-border/30 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">Commission</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`com-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          <div className="flex items-center justify-start gap-1 w-full">
                            <BillingMoneyInput
                              value={g.commissionPercent}
                              min={0}
                              commitMode="blur"
                              onCommit={val => {
                                const v = Math.max(0, val);
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.commissionPercent = v;
                                cg.commissionAmount = percentOfAmount(cg.subtotal, cg.commissionPercent);
                                const gst = gstOnSubtotal(cg.subtotal, effectiveGstPercent(cg));
                                cg.totalCharges = roundMoney2(cg.commissionAmount + cg.userFeeAmount + gst);
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                              className={billingSummaryInputClass}
                            />
                            <span className="text-[10px] font-semibold text-muted-foreground">%</span>
                            <span className={billingSummaryValueClass}>₹{formatBillingInr(g.commissionAmount || 0)}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-b border-border/30 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">User Fee</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`uf-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          <div className="flex items-center justify-start gap-1 w-full">
                            <BillingMoneyInput
                              value={g.userFeePercent}
                              min={0}
                              commitMode="blur"
                              onCommit={val => {
                                const v = Math.max(0, val);
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.userFeePercent = v;
                                cg.userFeeAmount = percentOfAmount(cg.subtotal, cg.userFeePercent);
                                const gst = gstOnSubtotal(cg.subtotal, effectiveGstPercent(cg));
                                cg.totalCharges = roundMoney2(cg.commissionAmount + cg.userFeeAmount + gst);
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                              className={billingSummaryInputClass}
                            />
                            <span className="text-[10px] font-semibold text-muted-foreground">%</span>
                            <span className={billingSummaryValueClass}>₹{formatBillingInr(g.userFeeAmount || 0)}</span>
                          </div>
                        </td>
                      ))}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">Coolie Charge</td>
                      {bill.commodityGroups.map((g, gi) => {
                        const qty = g.items.reduce((s, i) => s + (i.quantity || 0), 0);
                        return (
                          <td
                            key={`coolie-${gi}`}
                            className={cn(
                              'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                              gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                            )}
                          >
                            <div className="flex items-center justify-start gap-1 w-full">
                              <BillingMoneyInput
                                value={g.coolieRate || 0}
                                min={0}
                                commitMode="blur"
                                onCommit={rate => {
                                  const updated = { ...bill };
                                  const cg = { ...updated.commodityGroups[gi] };
                                  cg.coolieRate = rate;
                                  cg.coolieAmount = rate > 0 && qty > 0 ? roundMoney2(rate * qty) : 0;
                                  updated.commodityGroups = [...updated.commodityGroups];
                                  updated.commodityGroups[gi] = cg;
                                  setBill(recalcGrandTotal(updated));
                                }}
                                className={cn(billingSummaryInputClass, validationErrors[`coolie-${gi}`] && 'border-destructive ring-1 ring-destructive/30')}
                                placeholder="Rate"
                              />
                              <span className="text-[10px] font-semibold text-muted-foreground">x</span>
                              <span className="h-10 lg:h-6 px-2 inline-flex items-center justify-center rounded border border-border bg-background text-[10px] font-bold text-foreground min-w-[2.5rem]">
                                {formatBillingInr(qty)}
                              </span>
                              <span className={billingSummaryValueClass}>₹{formatBillingInr(g.coolieAmount || 0)}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">Weighman Charge</td>
                      {bill.commodityGroups.map((g, gi) => {
                        const qty = g.items.reduce((s, i) => s + (i.quantity || 0), 0);
                        return (
                          <td
                            key={`weighman-${gi}`}
                            className={cn(
                              'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                              gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                            )}
                          >
                            <div className="flex items-center justify-start gap-1 w-full">
                              <BillingMoneyInput
                                value={g.weighmanChargeRate || 0}
                                min={0}
                                commitMode="blur"
                                onCommit={rate => {
                                  const updated = { ...bill };
                                  const cg = { ...updated.commodityGroups[gi] };
                                  cg.weighmanChargeRate = rate;
                                  cg.weighmanChargeAmount = rate > 0 && qty > 0 ? roundMoney2(rate * qty) : 0;
                                  updated.commodityGroups = [...updated.commodityGroups];
                                  updated.commodityGroups[gi] = cg;
                                  setBill(recalcGrandTotal(updated));
                                }}
                                className={cn(billingSummaryInputClass, validationErrors[`weighman-${gi}`] && 'border-destructive ring-1 ring-destructive/30')}
                                placeholder="Rate"
                              />
                              <span className="text-[10px] font-semibold text-muted-foreground">x</span>
                              <span className="h-10 lg:h-6 px-2 inline-flex items-center justify-center rounded border border-border bg-background text-[10px] font-bold text-foreground min-w-[2.5rem]">
                                {formatBillingInr(qty)}
                              </span>
                              <span className={billingSummaryValueClass}>₹{formatBillingInr(g.weighmanChargeAmount || 0)}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">
                        Tax Type
                      </td>
                      {bill.commodityGroups.map((g, gi) => {
                        const taxCfg = commodityTaxConfigByName.get(g.commodityName);
                        const hasTax = taxCfg?.hasTax ?? ((g.gstRate ?? 0) > 0 || (g.sgstRate ?? 0) > 0 || (g.cgstRate ?? 0) > 0 || (g.igstRate ?? 0) > 0);
                        const selectedMode: 'GST' | 'IGST' = (g.taxMode === 'IGST' ? 'IGST' : 'GST');
                        return (
                          <td
                            key={`tax-mode-${gi}`}
                            className={cn(
                              'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                              gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                            )}
                          >
                            {!hasTax ? (
                              <span className="text-[10px] font-semibold text-muted-foreground">Not Applicable</span>
                            ) : (
                              <RadioGroup
                                value={selectedMode}
                                onValueChange={(value: 'GST' | 'IGST') => {
                                  const updated = { ...bill };
                                  const cg = { ...updated.commodityGroups[gi] };
                                  cg.taxMode = value;
                                  if (value === 'GST') {
                                    cg.igstRate = 0;
                                    cg.gstRate = 0;
                                  } else {
                                    cg.sgstRate = 0;
                                    cg.cgstRate = 0;
                                    cg.gstRate = 0;
                                  }
                                  cg.commissionAmount = percentOfAmount(cg.subtotal, cg.commissionPercent);
                                  cg.userFeeAmount = percentOfAmount(cg.subtotal, cg.userFeePercent);
                                  const gst = gstOnSubtotal(cg.subtotal, effectiveGstPercent(cg));
                                  cg.totalCharges = roundMoney2(cg.commissionAmount + cg.userFeeAmount + gst);
                                  updated.commodityGroups = [...updated.commodityGroups];
                                  updated.commodityGroups[gi] = cg;
                                  setBill(recalcGrandTotal(updated));
                                }}
                                className="flex items-center gap-3"
                              >
                                <div className="flex items-center gap-1.5">
                                  <RadioGroupItem value="GST" id={`gst-mode-${gi}`} />
                                  <label htmlFor={`gst-mode-${gi}`} className="text-[10px] font-semibold">GST</label>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <RadioGroupItem value="IGST" id={`igst-mode-${gi}`} />
                                  <label htmlFor={`igst-mode-${gi}`} className="text-[10px] font-semibold">IGST</label>
                                </div>
                              </RadioGroup>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {bill.commodityGroups.some((g) => {
                      const taxCfg = commodityTaxConfigByName.get(g.commodityName);
                      const hasTax = taxCfg?.hasTax ?? ((g.gstRate ?? 0) > 0 || (g.sgstRate ?? 0) > 0 || (g.cgstRate ?? 0) > 0 || (g.igstRate ?? 0) > 0);
                      const gstMode = (g.taxMode ?? taxCfg?.defaultMode ?? 'GST') === 'GST';
                      return hasTax && gstMode;
                    }) && (
                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">
                        SGST <span className="text-muted-foreground font-normal">(opt.)</span>
                      </td>
                      {bill.commodityGroups.map((g, gi) => {
                        const taxCfg = commodityTaxConfigByName.get(g.commodityName);
                        const hasTax = taxCfg?.hasTax ?? ((g.gstRate ?? 0) > 0 || (g.sgstRate ?? 0) > 0 || (g.cgstRate ?? 0) > 0 || (g.igstRate ?? 0) > 0);
                        const gstMode = (g.taxMode ?? taxCfg?.defaultMode ?? 'GST') === 'GST';
                        return (
                        <td
                          key={`sgst-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          {!hasTax || !gstMode ? (
                            <div className="text-[10px] text-muted-foreground font-semibold">—</div>
                          ) : (
                          <div className="flex flex-wrap items-center gap-1 justify-start w-full">
                            <Select
                              value={g.sgstInputMode || 'PERCENT'}
                              onValueChange={(value: 'PERCENT' | 'AMOUNT') => {
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.sgstInputMode = value;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                            >
                              <SelectTrigger className="h-10 w-12 lg:h-6 lg:w-11 rounded text-center text-[10px] px-1 py-1 lg:py-0">
                                <SelectValue placeholder="%" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PERCENT">%</SelectItem>
                                <SelectItem value="AMOUNT">₹</SelectItem>
                              </SelectContent>
                            </Select>
                            <BillingMoneyInput
                              value={g.sgstInputMode === 'AMOUNT'
                                ? gstOnSubtotal(g.subtotal || 0, g.sgstRate ?? 0)
                                : g.sgstRate}
                              min={0}
                              commitMode="blur"
                              onCommit={val => {
                                const v = Math.max(0, val);
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.sgstRate = (cg.sgstInputMode === 'AMOUNT')
                                  ? (cg.subtotal > 0 ? roundMoney2((v * 100) / cg.subtotal) : 0)
                                  : v;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                              className={billingSummaryInputClass}
                            />
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {g.sgstInputMode === 'AMOUNT' ? '₹' : '%'}
                            </span>
                            <span className={billingSummaryValueClass}>
                              ₹{formatBillingInr(gstOnSubtotal(g.subtotal || 0, g.sgstRate ?? 0))}
                            </span>
                          </div>
                          )}
                        </td>
                      )})}
                    </tr>
                    )}
                    {bill.commodityGroups.some((g) => {
                      const taxCfg = commodityTaxConfigByName.get(g.commodityName);
                      const hasTax = taxCfg?.hasTax ?? ((g.gstRate ?? 0) > 0 || (g.sgstRate ?? 0) > 0 || (g.cgstRate ?? 0) > 0 || (g.igstRate ?? 0) > 0);
                      const gstMode = (g.taxMode ?? taxCfg?.defaultMode ?? 'GST') === 'GST';
                      return hasTax && gstMode;
                    }) && (
                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">
                        CGST <span className="text-muted-foreground font-normal">(opt.)</span>
                      </td>
                      {bill.commodityGroups.map((g, gi) => {
                        const taxCfg = commodityTaxConfigByName.get(g.commodityName);
                        const hasTax = taxCfg?.hasTax ?? ((g.gstRate ?? 0) > 0 || (g.sgstRate ?? 0) > 0 || (g.cgstRate ?? 0) > 0 || (g.igstRate ?? 0) > 0);
                        const gstMode = (g.taxMode ?? taxCfg?.defaultMode ?? 'GST') === 'GST';
                        return (
                        <td
                          key={`cgst-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          {!hasTax || !gstMode ? (
                            <div className="text-[10px] text-muted-foreground font-semibold">—</div>
                          ) : (
                          <div className="flex flex-wrap items-center gap-1 justify-start w-full">
                            <Select
                              value={g.cgstInputMode || 'PERCENT'}
                              onValueChange={(value: 'PERCENT' | 'AMOUNT') => {
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.cgstInputMode = value;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                            >
                              <SelectTrigger className="h-10 w-12 lg:h-6 lg:w-11 rounded text-center text-[10px] px-1 py-1 lg:py-0">
                                <SelectValue placeholder="%" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PERCENT">%</SelectItem>
                                <SelectItem value="AMOUNT">₹</SelectItem>
                              </SelectContent>
                            </Select>
                            <BillingMoneyInput
                              value={g.cgstInputMode === 'AMOUNT'
                                ? gstOnSubtotal(g.subtotal || 0, g.cgstRate ?? 0)
                                : g.cgstRate}
                              min={0}
                              commitMode="blur"
                              onCommit={val => {
                                const v = Math.max(0, val);
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.cgstRate = (cg.cgstInputMode === 'AMOUNT')
                                  ? (cg.subtotal > 0 ? roundMoney2((v * 100) / cg.subtotal) : 0)
                                  : v;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                              className={billingSummaryInputClass}
                            />
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {g.cgstInputMode === 'AMOUNT' ? '₹' : '%'}
                            </span>
                            <span className={billingSummaryValueClass}>
                              ₹{formatBillingInr(gstOnSubtotal(g.subtotal || 0, g.cgstRate ?? 0))}
                            </span>
                          </div>
                          )}
                        </td>
                      )})}
                    </tr>
                    )}
                    {bill.commodityGroups.some((g) => {
                      const taxCfg = commodityTaxConfigByName.get(g.commodityName);
                      const hasTax = taxCfg?.hasTax ?? ((g.gstRate ?? 0) > 0 || (g.sgstRate ?? 0) > 0 || (g.cgstRate ?? 0) > 0 || (g.igstRate ?? 0) > 0);
                      const igstMode = (g.taxMode ?? taxCfg?.defaultMode ?? 'GST') === 'IGST';
                      return hasTax && igstMode;
                    }) && (
                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">
                        IGST <span className="text-muted-foreground font-normal">(opt.)</span>
                      </td>
                      {bill.commodityGroups.map((g, gi) => {
                        const taxCfg = commodityTaxConfigByName.get(g.commodityName);
                        const hasTax = taxCfg?.hasTax ?? ((g.gstRate ?? 0) > 0 || (g.sgstRate ?? 0) > 0 || (g.cgstRate ?? 0) > 0 || (g.igstRate ?? 0) > 0);
                        const igstMode = (g.taxMode ?? taxCfg?.defaultMode ?? 'GST') === 'IGST';
                        return (
                        <td
                          key={`igst-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          {!hasTax || !igstMode ? (
                            <div className="text-[10px] text-muted-foreground font-semibold">—</div>
                          ) : (
                          <div className="flex flex-wrap items-center gap-1 justify-start w-full">
                            <Select
                              value={g.igstInputMode || 'PERCENT'}
                              onValueChange={(value: 'PERCENT' | 'AMOUNT') => {
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.igstInputMode = value;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                            >
                              <SelectTrigger className="h-10 w-12 lg:h-6 lg:w-11 rounded text-center text-[10px] px-1 py-1 lg:py-0">
                                <SelectValue placeholder="%" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PERCENT">%</SelectItem>
                                <SelectItem value="AMOUNT">₹</SelectItem>
                              </SelectContent>
                            </Select>
                            <BillingMoneyInput
                              value={g.igstInputMode === 'AMOUNT'
                                ? gstOnSubtotal(g.subtotal || 0, g.igstRate ?? 0)
                                : g.igstRate}
                              min={0}
                              commitMode="blur"
                              onCommit={val => {
                                const v = Math.max(0, val);
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.igstRate = (cg.igstInputMode === 'AMOUNT')
                                  ? (cg.subtotal > 0 ? roundMoney2((v * 100) / cg.subtotal) : 0)
                                  : v;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                              className={billingSummaryInputClass}
                            />
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {g.igstInputMode === 'AMOUNT' ? '₹' : '%'}
                            </span>
                            <span className={billingSummaryValueClass}>
                              ₹{formatBillingInr(gstOnSubtotal(g.subtotal || 0, g.igstRate ?? 0))}
                            </span>
                          </div>
                          )}
                        </td>
                      )})}
                    </tr>
                    )}

                    <tr>
                      <td
                        colSpan={bill.commodityGroups.length + 1}
                        className="sticky left-0 z-50 px-3 py-3 font-extrabold uppercase tracking-wider text-center whitespace-normal text-amber-800 dark:text-amber-200 bg-amber-500/20 dark:bg-amber-500/30 border-t-2 border-b-2 border-amber-500/50 dark:border-amber-400/40 shadow-sm"
                      >
                        📊 Discount & Adjustment
                      </td>
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">Discount</td>
                      {bill.commodityGroups.map((g, gi) => {
                        const subtotalWithCharges = billGroupSubtotalWithTaxAndCharges(g);
                        let discountAmount = g.discount || 0;
                        if (g.discountType === 'PERCENT') {
                          discountAmount = percentOfAmount(subtotalWithCharges, discountAmount);
                        } else {
                          discountAmount = roundMoney2(discountAmount);
                        }
                        return (
                          <td
                            key={`discount-${gi}`}
                            className={cn(
                              'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                              gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                            )}
                          >
                            <div className="flex items-center justify-start gap-1 w-full">
                              <Select value={g.discountType || 'AMOUNT'} onValueChange={(value: any) => {
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.discountType = value;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}>
                                <SelectTrigger className="h-10 w-12 lg:h-6 lg:w-11 rounded text-center text-[10px] px-1 py-1 lg:py-0">
                                  <SelectValue placeholder="%" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PERCENT">%</SelectItem>
                                  <SelectItem value="AMOUNT">₹</SelectItem>
                                </SelectContent>
                              </Select>
                              <BillingMoneyInput
                                value={g.discount || 0}
                                min={0}
                                commitMode="blur"
                                onCommit={val => {
                                  const v = Math.max(0, val);
                                  const updated = { ...bill };
                                  const cg = { ...updated.commodityGroups[gi] };
                                  cg.discount = v;
                                  updated.commodityGroups = [...updated.commodityGroups];
                                  updated.commodityGroups[gi] = cg;
                                  setBill(recalcGrandTotal(updated));
                                }}
                                className={billingSummaryInputClass}
                                placeholder="0"
                              />
                              <span className={billingSummaryValueClass}>₹{formatBillingInr(discountAmount)}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">Round Off</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`roundoff-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          <BillingMoneyInput
                            value={g.manualRoundOff || 0}
                            commitMode="blur"
                            onCommit={val => {
                              const updated = { ...bill };
                              const cg = { ...updated.commodityGroups[gi] };
                              cg.manualRoundOff = val;
                              updated.commodityGroups = [...updated.commodityGroups];
                              updated.commodityGroups[gi] = cg;
                              setBill(recalcGrandTotal(updated));
                            }}
                            className={billingSummaryInputClass}
                            placeholder="0"
                          />
                        </td>
                      ))}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">Overall Rate</td>
                      {bill.commodityGroups.map((g, gi) => {
                        const subtotalWithCharges = billGroupSubtotalWithTaxAndCharges(g);
                        let discountAmount = g.discount || 0;
                        if (g.discountType === 'PERCENT') {
                          discountAmount = percentOfAmount(subtotalWithCharges, discountAmount);
                        } else {
                          discountAmount = roundMoney2(discountAmount);
                        }
                        const totalAmount = roundMoney2(subtotalWithCharges - discountAmount + (g.manualRoundOff || 0));
                        return (
                          <td
                            key={`overallrate-${gi}`}
                            className={cn(
                              'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500 font-bold tabular-nums text-right',
                              gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                            )}
                          >
                            ₹{formatBillingInr(totalAmount)}
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <td
                        colSpan={bill.commodityGroups.length + 1}
                        className="sticky left-0 z-50 px-3 py-3 font-extrabold uppercase tracking-wider text-center whitespace-normal text-indigo-800 dark:text-indigo-200 bg-indigo-500/20 dark:bg-indigo-500/30 border-t-2 border-b-2 border-indigo-500/50 dark:border-indigo-400/40 shadow-sm"
                      >
                        🚚 Freight Charges
                      </td>
                    </tr>
                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">Outbound Freight (Rate/Value)</td>
                      <td colSpan={bill.commodityGroups.length} className="px-2 py-1.5 bg-white text-foreground dark:text-neutral-900 border-l border-border/30 border-b border-border/30 border-r border-border/30 dark:border-border/70 dark:[&_.text-muted-foreground]:text-neutral-500">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <BillingMoneyInput
                            value={bill.outboundFreight || 0}
                            min={0}
                            commitMode="blur"
                            onCommit={n => {
                              setBill(recalcGrandTotal({ ...bill, outboundFreight: n }));
                            }}
                            className={cn(billingSummaryInputClass, validationErrors.outboundFreight && 'border-destructive ring-1 ring-destructive/30')}
                          />
                          {validationErrors.outboundFreight && <span className="text-[10px] text-destructive">{validationErrors.outboundFreight}</span>}
                        </div>
                      </td>
                    </tr>
                    <tr className="border-t border-border/30">
                      <td className="sticky left-0 z-20 px-2 py-1.5 text-[10px] font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[110px] max-w-[110px] w-[110px]">Outbound Vehicle #</td>
                      <td colSpan={bill.commodityGroups.length} className="px-2 py-1.5 bg-white text-foreground dark:text-neutral-900 border-l border-border/30 border-b border-border/30 border-r border-border/30 dark:border-border/70">
                        <Input
                          value={bill.outboundVehicle}
                          onChange={e => {
                            setBill({ ...bill, outboundVehicle: e.target.value });
                          }}
                          placeholder="AP03 CK 4323"
                          className={cn("h-10 w-40 lg:h-6 lg:w-36 rounded text-left text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50", validationErrors.outboundVehicle && "border-destructive ring-1 ring-destructive/30")}
                        />
                      </td>
                    </tr>

                    <tr className="border-t-2 border-violet-500/60">
                      <td className="sticky left-0 z-20 px-2 py-2.5 font-extrabold text-white bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 dark:from-violet-700 dark:via-purple-700 dark:to-indigo-700 whitespace-normal min-w-[110px] max-w-[110px] w-[110px] border-r border-white/30 shadow-lg text-center uppercase tracking-wider text-xs">
                        💰 Final Summary
                      </td>
                      <td colSpan={bill.commodityGroups.length} className="px-3 py-2.5 bg-gradient-to-b from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border-l border-violet-500/30 border-r border-violet-500/30 dark:border-indigo-500/30 shadow-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-xl bg-white dark:bg-slate-800 border-2 border-violet-500/40 dark:border-violet-400/30 px-3 py-2 shadow-md hover:shadow-lg transition-shadow">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">💵 Grand Total</p>
                            <p className="font-extrabold text-lg text-violet-900 dark:text-violet-100 mt-1">₹{formatBillingInr(bill.grandTotal)}</p>
                          </div>
                          <div className="rounded-xl bg-white dark:bg-slate-800 border-2 border-indigo-500/40 dark:border-indigo-400/30 px-3 py-2 shadow-md hover:shadow-lg transition-shadow">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-300">📊 Pending Balance</p>
                            <p className="font-extrabold text-lg text-indigo-900 dark:text-indigo-100 mt-1">₹{formatBillingInr(bill.pendingBalance)}</p>
                          </div>
                          <div className="rounded-xl bg-white dark:bg-slate-800 border-2 border-emerald-500/40 dark:border-emerald-400/30 px-3 py-2 shadow-md hover:shadow-lg transition-shadow">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">🎟️ Token Advance</p>
                            <p className="font-extrabold text-lg text-emerald-900 dark:text-emerald-100 mt-1">₹{formatBillingInr(sumLineTokenAdvances(bill))}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                  </table>
                </div>
                <div className="hidden xl:flex xl:flex-1 rounded-xl border border-border/40 bg-background/30 overflow-hidden items-center justify-center">
                  <img
                    src={billingLoginImage}
                    alt="Billing visual"
                    className="h-full w-full object-cover opacity-85"
                    loading="lazy"
                  />
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="glass-card rounded-2xl p-4 border-2 border-emerald-500/30">
              <div className="mt-1 space-y-2">
                <div className="flex justify-center">
                  <div className="flex w-full flex-wrap items-center justify-center gap-2">
                    {Array.isArray((bill as any).versions) && (bill as any).versions.length > 0 && (
                      <div className="flex w-full items-center justify-center gap-2 text-[10px] text-muted-foreground sm:w-auto">
                        <span className="font-semibold">Version{tabHint('Alt V')}:</span>
                        <Select
                          value={selectedPrintVersion === 'latest' ? 'latest' : String(selectedPrintVersion)}
                          onValueChange={val => {
                            if (val === 'latest') {
                              setSelectedPrintVersion('latest');
                              applySelectedVersion('latest');
                              return;
                            }
                            const num = Number(val);
                            const next = Number.isFinite(num) ? num : 'latest';
                            setSelectedPrintVersion(next);
                            if (next === 'latest') {
                              applySelectedVersion('latest');
                            } else {
                              applySelectedVersion(next);
                            }
                          }}
                        >
                          <SelectTrigger
                            ref={versionTriggerRef}
                            className="h-8 min-w-0 flex-1 text-[10px] sm:w-auto sm:min-w-[14rem] sm:flex-none"
                          >
                            <SelectValue placeholder="Latest (current)" />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="latest">Latest (current)</SelectItem>
                            {(bill as any).versions.map((v: any) => (
                              <SelectItem key={v.version} value={String(v.version)}>
                                v{v.version}{v.savedAt ? ` — ${new Date(v.savedAt).toLocaleString()}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedPrintVersion !== 'latest' && (
                          <span className="hidden lg:inline text-[10px] text-primary font-semibold">v{selectedPrintVersion} selected</span>
                        )}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'gap-1.5')}
                      onClick={() => setEditLocked(false)}
                      disabled={!isBackendBillId(bill.billId)}
                    >
                      <Edit3 className="w-4 h-4" /> Edit{tabHint('Alt E')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'gap-1.5')}
                      onClick={() => void handleSaveDraft()}
                      disabled={billPersisting || !billSaveActionEnabled}
                      title={
                        !canPersistSalesBill
                          ? 'You do not have permission to save this bill.'
                          : !billValidation.isValid
                            ? 'Fix the highlighted validation errors before saving or updating.'
                            : undefined
                      }
                    >
                      {billPersisting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {billPersisting
                        ? (bill.billId && isBackendBillId(bill.billId) ? 'Updating...' : 'Saving...')
                        : (bill.billId && isBackendBillId(bill.billId) ? `Update${tabHint('Alt S')}` : `Save${tabHint('Alt S')}`)}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'gap-1.5')}
                      onClick={() => openPrintPreview()}
                      disabled={!canPrintBill}
                      title={
                        !bill || selectedPrintVersion !== 'latest'
                          ? 'Only the latest version can be printed. Select “Latest (current)”.'
                          : billHasUnsavedEditsSinceSave
                            ? 'Save your changes before printing.'
                            : !billValidation.isValid
                              ? 'Fix validation errors and save before printing.'
                              : !hasSavedOnce || !isBackendBillId(bill.billId)
                                ? 'Save the bill before printing.'
                                : billPersisting
                                  ? 'Please wait…'
                                  : undefined
                      }
                    >
                      <Printer className="w-4 h-4" /> Print{tabHint('Alt P')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'gap-1.5')}
                      onClick={handleCreateNewBill}
                    >
                      <Plus className="w-4 h-4" /> New Bill{tabHint('Alt N')}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>

          </motion.div>
        )}


        {billingMainTab === 'progress' && (
          savedBillsLoading ? (
            <div className="glass-card rounded-2xl p-8 flex justify-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filteredInProgressBills.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No bills in progress</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Drafts without a bill number appear here</p>
            </div>
          ) : (
            isDesktop ? (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] border-b border-white/25">
                        <th className="px-4 py-3 text-center font-semibold text-white first:rounded-tl-xl">Mark</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Buyer Name</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Broker Name</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Bids</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Bag Quantity</th>
                        <th className="px-4 py-3 text-center font-semibold text-white last:rounded-tr-xl">Bill Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInProgressBills.map((b: SalesBillDTO) => {
                        const bidsCount = (b.commodityGroups || []).reduce((sum, g) => sum + (g.items?.length || 0), 0);
                        const bagQuantity = (b.commodityGroups || []).reduce(
                          (sum, g) => sum + (g.items || []).reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0),
                          0,
                        );
                        const brokerDisplay = b.buyerAsBroker
                          ? (b.buyerName || b.buyerMark || '-')
                          : (b.brokerName || b.brokerMark || '-');
                        return (
                          <tr
                            key={String(b.billId)}
                            onClick={() => openBillFromList(b)}
                            className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3 text-center text-foreground">{b.buyerMark || '-'}</td>
                            <td className="px-4 py-3 text-center text-foreground">{b.buyerName || '-'}</td>
                            <td className="px-4 py-3 text-center text-foreground">{brokerDisplay}</td>
                            <td className="px-4 py-3 text-center text-foreground tabular-nums">{bidsCount}</td>
                            <td className="px-4 py-3 text-center text-foreground tabular-nums">{roundMoney2(bagQuantity).toLocaleString()}</td>
                            <td className="px-4 py-3 text-center text-foreground">{b.billingName || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              filteredInProgressBills.map((b: SalesBillDTO, i: number) => (
                <motion.button type="button" key={String(b.billId)}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => openBillFromList(b)}
                  className="w-full glass-card rounded-2xl p-4 text-left hover:shadow-lg transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md flex-shrink-0">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{b.billingName || b.buyerName}</p>
                      <p className="text-xs text-muted-foreground">{b.buyerMark} · In progress</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-foreground">₹{formatBillingInr(b.grandTotal ?? 0)}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(b.billDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                </motion.button>
              ))
            )
          )
        )}

        {billingMainTab === 'saved' && (
          savedBillsLoading ? (
            <div className="glass-card rounded-2xl p-8 flex justify-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filteredSavedBillsOnly.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No saved bills found</p>
            </div>
          ) : (
            isDesktop ? (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead>
                      <tr className="bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] border-b border-white/25">
                        <th className="px-4 py-3 text-center font-semibold text-white first:rounded-tl-xl">Bill Number</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Buyer</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Broker</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">No of Bids</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Amount</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Balance</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Date</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Pending Since</th>
                        <th className="px-4 py-3 text-center font-semibold text-white">Print Status</th>
                        <th className="px-4 py-3 text-center font-semibold text-white last:rounded-tr-xl">Billing Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSavedBillsOnly.map((b: SalesBillDTO) => {
                        const bidsCount = (b.commodityGroups || []).reduce((sum, g) => sum + (g.items?.length || 0), 0);
                        const pendingDays = Math.max(
                          0,
                          Math.floor((Date.now() - new Date(b.billDate).getTime()) / (1000 * 60 * 60 * 24)),
                        );
                        const brokerDisplay = b.buyerAsBroker
                          ? (b.buyerName || b.buyerMark || '-')
                          : (b.brokerName || b.brokerMark || '-');
                        return (
                          <tr
                            key={String(b.billId)}
                            onClick={() => openBillFromList(b)}
                            className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3 text-center text-foreground">{b.billNumber || '-'}</td>
                            <td className="px-4 py-3 text-center text-foreground">{b.buyerName || '-'}</td>
                            <td className="px-4 py-3 text-center text-foreground">{brokerDisplay}</td>
                            <td className="px-4 py-3 text-center text-foreground tabular-nums">{bidsCount}</td>
                            <td className="px-4 py-3 text-center text-foreground tabular-nums">₹{formatBillingInr(b.grandTotal ?? 0)}</td>
                            <td className="px-4 py-3 text-center text-foreground tabular-nums">₹{formatBillingInr(b.pendingBalance ?? 0)}</td>
                            <td className="px-4 py-3 text-center text-foreground">{new Date(b.billDate).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-center text-foreground">
                              {(b.pendingBalance ?? 0) > 0 ? `${pendingDays} day${pendingDays === 1 ? '' : 's'}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-foreground">-</td>
                            <td className="px-4 py-3 text-center text-foreground">{b.billingName || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              filteredSavedBillsOnly.map((b: SalesBillDTO, i: number) => (
                <motion.button type="button" key={String(b.billId)}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => openBillFromList(b)}
                  className="w-full glass-card rounded-2xl p-4 text-left hover:shadow-lg transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-md flex-shrink-0">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{b.billNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.billingName} ({b.buyerMark})</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">₹{formatBillingInr(b.grandTotal ?? 0)}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(b.billDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                </motion.button>
              ))
            )
          )
        )}
      </div>
      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default BillingPage;
