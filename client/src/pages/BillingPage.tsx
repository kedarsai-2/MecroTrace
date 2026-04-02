import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Receipt, Search, User, Package, IndianRupee, Truck, Hash,
  Edit3, Lock, Unlock, Save, Printer, Plus, Trash2,
  Percent, FileText, ChevronDown, ChevronUp,
  AlertCircle, BookOpen, X, Loader2, Clock,
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
import { commodityApi, printLogApi, weighingApi, billingApi, arrivalsApi, contactApi, auctionApi } from '@/services/api';
import { ContactApiError } from '@/services/api/contacts';
import type { Contact } from '@/types/models';
import type { AuctionBidUpdateRequest, AuctionEntryDTO, AuctionResultDTO, LotSummaryDTO } from '@/services/api/auction';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';
import type { FullCommodityConfigDto } from '@/services/api/commodities';
import type { SalesBillDTO } from '@/services/api/billing';
import type { ArrivalDetail } from '@/services/api/arrivals';
import { directPrint } from '@/utils/printTemplates';
import { generateSalesBillPrintHTML } from '@/utils/printDocumentTemplates';

/**
 * Billing buttons/tabs match ArrivalsPage.tsx:
 * - Outline: `variant="outline"` + `rounded-xl` (+ height), same as e.g. "Show completed arrivals" / Add seller.
 * - Primary: `bg-[#6075FF] text-white shadow-lg hover:bg-[#5060e8]` (mobile "New Arrival" FAB pattern).
 */
const arrOutlineLg = 'rounded-xl h-11 sm:h-12 font-bold text-sm';
const arrOutlineMd = 'rounded-xl h-9 text-sm font-semibold';
const arrOutlineTall = 'rounded-xl h-12 text-sm font-semibold';
const arrOutlineSm = 'rounded-xl h-8 text-xs font-semibold';
const arrSolid =
  'rounded-xl font-bold bg-[#6075FF] text-white shadow-lg hover:!bg-slate-500 hover:!text-white border-transparent transition-colors';
const arrSolidLg = cn(arrSolid, 'h-11 sm:h-12 px-4 text-sm');
const arrSolidMd = cn(arrSolid, 'h-9 px-3 text-sm');
const arrSolidTall = cn(arrSolid, 'h-12 px-6 text-sm');
const arrSolidSm = cn(arrSolid, 'h-8 px-2.5 text-xs');
const arrSolidWide10 = cn(arrSolid, 'w-full h-10');
const arrSolidWide14 = cn(arrSolid, 'w-full h-14');

/** Desktop main tabs: same as Arrivals Summary / New Arrival (underline + #6075FF bar). */
const arrDeskTabBtn = (active: boolean) =>
  cn(
    'relative px-5 py-3 text-sm font-semibold transition-all flex items-center gap-2 shrink-0',
    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
  );

/** Mobile header tabs: pill style like Arrivals summary chips (`bg-[#6075FF]` when active). */
const arrMobTabPill = (active: boolean) =>
  cn(
    'shrink-0 min-w-[9rem] sm:min-w-[10.5rem] px-3 sm:px-4 py-2.5 sm:py-2 rounded-full min-h-10 text-xs sm:text-sm font-semibold transition-colors flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 text-center shadow-sm leading-none',
    active ? 'bg-[#6075FF] text-white' : 'bg-white/15 text-white/90 hover:bg-white/25 hover:text-white',
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
  if (lotId && reserved.has(`${bid}::${lotId}`)) return true;
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
  gstRate: number;
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
  return b.commodityGroups.reduce(
    (s, g) => s + g.items.reduce((ss, i) => ss + (Number(i.tokenAdvance) || 0), 0),
    0,
  );
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
  const configByCommName = new Map<string, { gstRate: number; divisor: number }>();
  const dynamicChargesByCommName = new Map<string, any[]>();
  if (fullConfigs && commodities) {
    commodities.forEach((c: any) => {
      const cfg = fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(c.commodity_id));
      const name = c.commodity_name ?? c.commodityName;
      if (!name) return;
      const gstRate = cfg?.config?.gstRate ?? 0;
      const divisorRaw = cfg?.config?.ratePerUnit ?? 50;
      const divisor = Number(divisorRaw) > 0 ? Number(divisorRaw) : 50;
      configByCommName.set(name, { gstRate, divisor });
      dynamicChargesByCommName.set(name, cfg?.dynamicCharges ?? []);
    });
  }
  const groups = (b.commodityGroups || []).map((g: any) => ({
    ...g,
    gstRate: g.gstRate ?? configByCommName.get(g.commodityName)?.gstRate ?? 0,
    divisor: g.divisor ?? configByCommName.get(g.commodityName)?.divisor ?? 50,
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
  }));

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

  return {
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
  };
}

// ── Validation ────────────────────────────────────────────
type ValidationErrors = Record<string, string>;

function validateBill(b: BillData): { isValid: boolean; errors: ValidationErrors } {
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

  const isBillingDirty = !!bill && !showPrint && !isBackendBillId(bill.billId);
  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isBillingDirty,
  });

  // Validation
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

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
  const [resyncing, setResyncing] = useState(false);
  const [savedBills, setSavedBills] = useState<SalesBillDTO[]>([]);
  const [savedBillsLoading, setSavedBillsLoading] = useState(false);
  const [commodities, setCommodities] = useState<any[]>([]);
  const [fullConfigs, setFullConfigs] = useState<FullCommodityConfigDto[]>([]);
  const [weighingSessions, setWeighingSessions] = useState<any[]>([]);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const [collapsedCommodityIndexes, setCollapsedCommodityIndexes] = useState<number[]>([]);
  const SUMMARY_COMMODITY_COL_WIDTH = 150;

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
  const [showAddBidCard, setShowAddBidCard] = useState(false);
  const [addBidLotSearch, setAddBidLotSearch] = useState('');
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
  const [searchBidInput, setSearchBidInput] = useState('');
  const [searchBidSourceBuyer, setSearchBidSourceBuyer] = useState<BuyerPurchase | null>(null);
  const [searchBidDialogOpen, setSearchBidDialogOpen] = useState(false);
  const [searchBidSelectedKeys, setSearchBidSelectedKeys] = useState<string[]>([]);
  const [showSearchBidBuyerSuggestions, setShowSearchBidBuyerSuggestions] = useState(false);
  const searchBidBuyerSelectRef = useRef<HTMLDivElement | null>(null);
  const searchBidInputRef = useRef<HTMLInputElement | null>(null);

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
    weighingApi.list({ page: 0, size: 2000 }).then(setWeighingSessions).catch(() => setWeighingSessions([]));
  }, []);

  useEffect(() => {
    if (!showAddBidCard) return;
    let active = true;
    setAddBidLotLoading(true);
    void auctionApi
      .listLots({ page: 0, size: 500 })
      .then(list => {
        if (!active) return;
        setAddBidLotOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!active) return;
        setAddBidLotOptions([]);
      })
      .finally(() => {
        if (active) setAddBidLotLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showAddBidCard]);

  const getAddBidLotIdentifier = useCallback((lot: LotSummaryDTO): string => {
    const lotQty = Number(lot.bag_count) || 0;
    const lotName = lot.lot_name || String(lotQty);
    const vTotal = Number(lot.vehicle_total_qty ?? lotQty) || lotQty;
    const sTotal = Number(lot.seller_total_qty ?? lotQty) || lotQty;
    return `${vTotal}/${sTotal}/${lotName}-${lotQty}`;
  }, []);

  const filteredAddBidLots = useMemo(() => {
    const q = addBidLotSearch.trim().toLowerCase();
    if (!q) return addBidLotOptions.slice(0, 25);
    return addBidLotOptions
      .filter(lot => {
        const identifier = getAddBidLotIdentifier(lot).toLowerCase();
        return (
          identifier.includes(q)
          || (lot.lot_name || '').toLowerCase().includes(q)
          || String(lot.lot_id || '').toLowerCase().includes(q)
          || (lot.seller_name || '').toLowerCase().includes(q)
          || (lot.vehicle_number || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
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
      if (k === 'x' || k === 'y' || k === 'z' || k === 'e' || k === 's' || k === 'p' || k === 'n') {
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
        void handleSaveDraft();
      }
      if (k === 'p' && hasSavedOnce) {
        void saveAndPreparePrint();
      }
      if (k === 'n') {
        handleCreateNewBill();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, bill, showPrint, hasSavedOnce]);

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

        const key = entry.buyerMark || entry.buyerName;
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

        const ws = weighingSessions.find((s: any) => s.bid_number === entry.bidNumber);
        const weight = ws ? ws.net_weight : entry.quantity * 50;

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

  const calculateGroupCharges = (group: CommodityGroup) => {
    const commissionAmount = Math.round(group.subtotal * (group.commissionPercent || 0) / 100);
    const userFeeAmount = Math.round(group.subtotal * (group.userFeePercent || 0) / 100);
    const gstAmount = Math.round(group.subtotal * ((group.gstRate ?? 0) / 100));
    const totalCharges = commissionAmount + userFeeAmount + gstAmount;
    return { commissionAmount, userFeeAmount, totalCharges };
  };

  // Recalculate grand total (includes per-commodity discount and round-off)
  const recalcGrandTotal = useCallback((b: BillData): BillData => {
    const commodityGroups = b.commodityGroups.map(group => {
      const next = { ...group };
      const charges = calculateGroupCharges(next);
      next.commissionAmount = charges.commissionAmount;
      next.userFeeAmount = charges.userFeeAmount;
      next.totalCharges = charges.totalCharges;
      return next;
    });
    
    // Calculate per-commodity totals: Subtotal + Commission + UserFee + Coolie + Weighman + GST - Discount + RoundOff
    let grandTotal = 0;
    commodityGroups.forEach(group => {
      const subtotalWithCharges = group.subtotal + group.totalCharges;
      const additionsSum = (group.coolieAmount || 0) + (group.weighmanChargeAmount || 0);
      let discountAmount = group.discount || 0;
      if (group.discountType === 'PERCENT') {
        discountAmount = Math.round(subtotalWithCharges * discountAmount / 100);
      }
      const commodityTotal = subtotalWithCharges + additionsSum - discountAmount + (group.manualRoundOff || 0);
      grandTotal += commodityTotal;
    });
    
    // Add outbound freight charges (bill-level only)
    grandTotal += b.outboundFreight || 0;
    
    const tokenAdvance = sumLineTokenAdvances(b);
    const pendingBalance = grandTotal - tokenAdvance;
    return { ...b, commodityGroups, grandTotal, pendingBalance, tokenAdvance };
  }, []);

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
          gstRate: config?.gstRate ?? 0,
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
      const otherCharges = computeBuyerOtherChargesRateAdd(entry, commName, group.divisor); // preset-based extra price
      const sellerOtherCharges = computeSellerOtherChargesRateAdd(entry, commName, group.divisor);
      const presetApplied = entry.presetApplied ?? 0;
      const newRate = entry.rate + presetApplied + brokerage + otherCharges;

      group.items.push({
        bidNumber: entry.bidNumber,
        lotName: entry.lotName,
        lotId: String(entry.lotId ?? ''),
        auctionEntryId: entry.auctionEntryId ?? null,
        selfSaleUnitId: entry.selfSaleUnitId ?? null,
        lotTotalQty: (entry as any).lotTotalQty ?? entry.quantity,
        sellerName: entry.sellerName,
        quantity: entry.quantity,
        weight: entry.weight,
        baseRate: entry.rate,
        presetApplied,
        brokerage,
        otherCharges,
        sellerOtherCharges,
        vehicleTotalQty: (entry as any).vehicleTotalQty,
        sellerVehicleQty: (entry as any).sellerVehicleQty,
        newRate,
        amount: (entry.weight * newRate) / group.divisor,
        tokenAdvance: Number(entry.tokenAdvance) || 0,
      });
    });
    
    // Calculate per-commodity totals
    commodityMap.forEach(group => {
      group.subtotal = group.items.reduce((s, item) => s + item.amount, 0);
      // REQ-BIL-005: CA = BG × C%
      group.commissionAmount = Math.round(group.subtotal * group.commissionPercent / 100);
      // REQ-BIL-006: UFA = BG × UF%
      group.userFeeAmount = Math.round(group.subtotal * group.userFeePercent / 100);
      group.totalCharges = group.commissionAmount + group.userFeeAmount;
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
    const subtotalSum = commodityGroups.reduce((s, g) => s + g.subtotal + g.totalCharges, 0);
    
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
            await auctionApi.updateSelfSaleBid(selfSaleUnitId, entryId, body);
          } else {
            await auctionApi.updateBid(lotId, entryId, body);
          }
        }
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

  const handleSelectBidMode = useCallback(() => {
    const buyer = findBuyerByInput();
    if (!buyer) return;
    setShowBuyerSuggestions(false);
    setSelectBidBuyer(buyer);
    setSelectedBidKeys([]);
    toast.success(`Loaded ${buyer.entries.length} bids. Select required bids to create bill.`);
  }, [findBuyerByInput]);

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

  const handleAddBidToCurrentBuyer = useCallback(async () => {
    if (!bill || !selectedBuyer) {
      toast.error('Open a buyer bill first');
      return;
    }
    if (!addBidSelectedLot) {
      toast.error('Select lot mark');
      return;
    }
    const qty = Number(addBidQty);
    const rate = Number(addBidBaseRate);
    const extra = Number(addBidExtraAmount || 0);
    const tokenAdvance = Number(addBidTokenAdvance || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Enter valid bid quantity');
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error('Enter valid base rate');
      return;
    }
    if (qty > addBidRemainingQty) {
      toast.error(`Bid quantity cannot exceed remaining (${addBidRemainingQty})`);
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

    try {
      setAddBidSaving(true);
      const session = await auctionApi.addBid(addBidSelectedLot.lot_id, {
        buyer_id: buyerIdNum,
        buyer_name: (bill.billingName || bill.buyerName || '').trim(),
        buyer_mark: (bill.buyerMark || '').trim(),
        rate,
        quantity: qty,
        extra_rate: extra,
        token_advance: tokenAdvance,
      });
      const billBuyerNameNorm = (bill.billingName || bill.buyerName || '').trim().toLowerCase();
      const ownEntries = (session.entries || []).filter(
        e =>
          (e.buyer_mark || '').trim().toLowerCase() === (bill.buyerMark || '').trim().toLowerCase()
          && (e.buyer_name || '').trim().toLowerCase() === billBuyerNameNorm,
      );
      const latest: AuctionEntryDTO | undefined = [...ownEntries].sort((a, b) => (a.auction_entry_id ?? 0) - (b.auction_entry_id ?? 0)).pop();
      if (!latest) {
        toast.error('Bid saved but failed to map in bill. Refresh billing data.');
        return;
      }
      const ws = weighingSessions.find((s: any) => s.bid_number === latest.bid_number);
      const newBillEntry: BillEntry = {
        bidNumber: latest.bid_number,
        lotId: String(addBidSelectedLot.lot_id),
        auctionEntryId: latest.auction_entry_id ?? null,
        selfSaleUnitId: null,
        lotName: addBidSelectedLot.lot_name || String(addBidSelectedLot.bag_count || ''),
        lotTotalQty: addBidSelectedLot.bag_count ?? latest.quantity,
        sellerName: addBidSelectedLot.seller_name || 'Unknown',
        commodityName: addBidSelectedLot.commodity_name || 'Unknown',
        rate: Number(latest.bid_rate) || rate,
        quantity: latest.quantity ?? qty,
        weight: ws ? ws.net_weight : (latest.quantity ?? qty) * 50,
        vehicleTotalQty: addBidSelectedLot.vehicle_total_qty ?? latest.quantity ?? qty,
        sellerVehicleQty: addBidSelectedLot.seller_total_qty ?? latest.quantity ?? qty,
        presetApplied: Number(latest.preset_margin) || 0,
        isSelfSale: false,
        tokenAdvance: Number(latest.token_advance ?? tokenAdvance) || 0,
      };
      const buyerKey = `${(bill.buyerMark || '').toLowerCase()}::${(bill.buyerName || '').toLowerCase()}`;
      appendBidForBuyer(buyerKey, bill.buyerName, bill.buyerMark, selectedBuyer.buyerContactId ?? null, newBillEntry);
      const mergedBuyer: BuyerPurchase = {
        buyerMark: bill.buyerMark,
        buyerName: bill.buyerName,
        buyerContactId: selectedBuyer.buyerContactId ?? null,
        entries: [...selectedBuyer.entries, newBillEntry],
        tokenAdvanceTotal: (selectedBuyer.tokenAdvanceTotal || 0) + (Number(newBillEntry.tokenAdvance) || 0),
      };
      generateBill(mergedBuyer);
      await refetchAuctions();
      setAddBidRemainingQty(Number(session.remaining_bags) || 0);
      resetAddBidForm();
      setShowAddBidCard(false);
      toast.success('Bid added and bill updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add bid');
    } finally {
      setAddBidSaving(false);
    }
  }, [
    addBidBaseRate,
    addBidExtraAmount,
    addBidQty,
    addBidRemainingQty,
    addBidSelectedLot,
    addBidTokenAdvance,
    appendBidForBuyer,
    bill,
    generateBill,
    resetAddBidForm,
    refetchAuctions,
    selectedBuyer,
    weighingSessions,
  ]);

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
    const selectedEntries = searchBidSourceBuyer.entries.filter(e => searchBidSelectedKeys.includes(getBidSelectionKey(e)));
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
    const finalBill = generateBill(mergedBuyer);
    const addedKeys = new Set(toAdd.map(e => getBidSelectionKey(e)));
    if (finalBill) {
      void (async () => {
        try {
          await syncAuctionEntriesToBillBuyer(finalBill, {
            lineFilter: it => addedKeys.has(`${it.bidNumber}::${String(it.lotId ?? '').trim()}`),
          });
          await refetchAuctions();
        } catch {
          toast.warning(
            'Lots added to the bill, but auction buyer update failed for some bids. Save the bill to retry sync.',
          );
        }
      })();
    }
    setSearchBidDialogOpen(false);
    setSearchBidSelectedKeys([]);
    toast.success(`${toAdd.length} lot(s) added into current bill`);
  }, [
    bill,
    generateBill,
    refetchAuctions,
    searchBidSelectedKeys,
    searchBidSourceBuyer,
    selectedBuyer,
    syncAuctionEntriesToBillBuyer,
  ]);

  const searchBidBuyerOptions = useMemo(() => {
    if (!bill) return [];
    const q = searchBidInput.trim().toLowerCase();
    const isSameBuyer = (b: BuyerPurchase) =>
      (b.buyerMark || '').toLowerCase() === (bill.buyerMark || '').toLowerCase()
      && (b.buyerName || '').toLowerCase() === (bill.buyerName || '').toLowerCase();
    const candidates = buyersForBilling.filter(b => !isSameBuyer(b));
    if (!q) return candidates.slice(0, 12);
    return candidates
      .filter(
        b =>
          (b.buyerMark || '').toLowerCase().includes(q)
          || (b.buyerName || '').toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [bill, buyersForBilling, searchBidInput]);

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
    if (field === 'tokenAdvance') {
      const updated = { ...bill };
      const group = { ...updated.commodityGroups[commIdx] };
      const item = { ...group.items[itemIdx], tokenAdvance: value };
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
    (item as any)[field] = value;
    const preset = (item as { presetApplied?: number }).presetApplied ?? 0;
    // REQ-BIL-002: NR = B + P + BRK + Other
    item.newRate = item.baseRate + preset + item.brokerage + item.otherCharges;
    item.amount = (item.weight * item.newRate) / (group.divisor > 0 ? group.divisor : 50);

    // Seller-side dynamic Other Charges (appliesTo=SELLER) - read-only visualization.
    const commName = group.commodityName;
    const commodity = commodities.find((c: any) => c.commodity_name === commName);
    const fullCfg = commodity
      ? fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(commodity.commodity_id))
      : null;
    const dynCharges = fullCfg?.dynamicCharges ?? [];
    const divisorUsed = group.divisor > 0 ? group.divisor : 50;
    const weight = item.weight || 0;
    const qty = item.quantity || 0;
    const baseNewRateWithoutOther = item.baseRate + preset + item.brokerage;
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
      } else {
        const fixedBasis = String(ch.fixedBasis || ch.fixed_basis || 'PER_50KG').toUpperCase();
        if (fixedBasis === 'PER_COUNT') {
          const chargeTotal = value * qty;
          const rateAdd = weight > 0 ? (chargeTotal * divisorUsed) / weight : 0;
          sellerOtherCharges += rateAdd;
        } else {
          sellerOtherCharges += value * (divisorUsed / 50);
        }
      }
    });
    item.sellerOtherCharges = sellerOtherCharges;

    group.items = [...group.items];
    group.items[itemIdx] = item;
    group.subtotal = group.items.reduce((s, i) => s + i.amount, 0);
    group.commissionAmount = Math.round(group.subtotal * group.commissionPercent / 100);
    group.userFeeAmount = Math.round(group.subtotal * group.userFeePercent / 100);
    group.totalCharges = group.commissionAmount + group.userFeeAmount;
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
      group.subtotal = items.reduce((s, i) => s + i.amount, 0);
      group.commissionAmount = Math.round(group.subtotal * group.commissionPercent / 100);
      group.userFeeAmount = Math.round(group.subtotal * group.userFeePercent / 100);
      group.totalCharges = group.commissionAmount + group.userFeeAmount;
      groups[commIdx] = group;
    }

    updated.commodityGroups = groups;
    setBill(recalcGrandTotal(updated));
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
          ? Math.round((item.baseRate + preset) * bill.brokerageValue / 100)
          : bill.brokerageValue;
        const newItem = {
          ...item,
          brokerage: brk,
          otherCharges: bill.globalOtherCharges,
          newRate: item.baseRate + preset + brk + bill.globalOtherCharges,
          amount: 0,
        };
        newItem.amount = (newItem.weight * newItem.newRate) / (group.divisor > 0 ? group.divisor : 50);

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
        newItem.sellerOtherCharges = sellerOtherCharges;
        return newItem;
      });
      const subtotal = items.reduce((s, i) => s + i.amount, 0);
      return {
        ...group,
        items,
        subtotal,
        commissionAmount: Math.round(subtotal * group.commissionPercent / 100),
        userFeeAmount: Math.round(subtotal * group.userFeePercent / 100),
        totalCharges: Math.round(subtotal * group.commissionPercent / 100) + Math.round(subtotal * group.userFeePercent / 100),
      };
    });
    setBill(recalcGrandTotal(updated));
    toast.success('Global charges applied to all line items');
  };

  const buildSavePayload = () => {
    if (!bill) return;
    const { isValid, errors } = validateBill(bill);
    setValidationErrors(errors);
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
      // Backend DTO excludes frontend-only fields (`divisor`, `coolieRate`, `coolieAmount`, `weighmanChargeRate`, `weighmanChargeAmount`).
      // Per-commodity discount and round-off are now in commodityGroups, not at bill level.
      commodityGroups: bill.commodityGroups.map(({ divisor: _divisor, coolieRate: _cr, coolieAmount: _ca, weighmanChargeRate: _wcr, weighmanChargeAmount: _wca, ...g }: any) => ({
        ...g,
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
      await refetchAuctions();
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save bill');
      return null;
    }
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
    loadSavedBills();
    toast.success(`Draft for ${currentBuyerLabel} moved to Bill In Progress.`);
    return true;
  }

  const handleSaveDraft = async () => {
    if (!bill) return;
    const result = await persistBill();
    if (!result) return;
    // Assign bill number on save (completed bill), idempotent if already numbered.
    const assigned = await billingApi.assignNumber(result.billId);
    const normalized = normalizeBillFromApi(assigned, fullConfigs, commodities) as BillData;
    setBill(recalcGrandTotal(normalized));
    setHasSavedOnce(true);
    toast.success(result.billNumber ? `Bill ${result.billNumber} updated.` : 'Bill saved.');
    loadSavedBills();
  };

  // Save bill and open print preview (bill number assigned via separate assign-number call)
  const saveAndPreparePrint = async () => {
    if (!bill) return;
    const result = await persistBill();
    if (!result) return;
    try {
      const assigned = await billingApi.assignNumber(result.billId);
      const normalized = normalizeBillFromApi(assigned, fullConfigs, commodities) as BillData;
      setBill(recalcGrandTotal(normalized));
      setHasSavedOnce(true);
      toast.success(`Bill ${assigned.billNumber} ready for print.`);
      setShowPrint(true);
      loadSavedBills();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to prepare bill for print');
      return;
    }
  };

  const filteredBuyerOptions = useMemo(() => {
    const q = buyerBidMarkInput.trim().toLowerCase();
    if (!q) return buyersForBilling.slice(0, 12);
    return buyersForBilling
      .filter(
        b =>
          b.buyerMark?.toLowerCase().includes(q)
          || b.buyerName?.toLowerCase().includes(q),
      )
      .slice(0, 12);
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
          <div className="bg-card border border-border rounded-xl p-4 font-mono text-xs space-y-2 shadow-lg">
            <div className="text-center border-b border-dashed border-border pb-2">
              <p className="font-bold text-sm text-foreground">MERCOTRACE</p>
              <p className="text-muted-foreground">Sales Bill (Buyer Invoice)</p>
              <p className="text-muted-foreground">{new Date(activePrintBill.billDate).toLocaleDateString()}</p>
            </div>

            <div className="border-b border-dashed border-border pb-2 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Bill No.</span><span className="font-bold text-foreground">{activePrintBill.billNumber || 'DRAFT'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span className="font-bold text-foreground">{activePrintBill.billingName} ({activePrintBill.buyerMark})</span></div>
              {activePrintBill.outboundVehicle && <div className="flex justify-between"><span className="text-muted-foreground">Out Vehicle</span><span className="font-bold text-foreground">{activePrintBill.outboundVehicle}</span></div>}
            </div>

            {/* Per-commodity tables — REQ-BIL-004 */}
            {activePrintBill.commodityGroups.map((group, gi) => (
              <div key={gi} className="border-b border-dashed border-border pb-2">
                <p className="font-bold text-foreground mb-1">{group.commodityName} {group.hsnCode && `(HSN: ${group.hsnCode})`}{(group.gstRate ?? 0) > 0 && ` · GST: ${group.gstRate}%`}</p>
                {group.items.map((item, ii) => (
                  <div key={ii} className="flex justify-between text-[10px] gap-2">
                    <span className="text-foreground min-w-0">
                      {item.quantity}×{item.weight.toFixed(0)}kg @₹{item.newRate}
                      {(item.tokenAdvance ?? 0) > 0 && (
                        <span className="text-muted-foreground"> · Tok ₹{item.tokenAdvance}</span>
                      )}
                    </span>
                    <span className="font-bold text-foreground shrink-0">₹{item.amount.toLocaleString()}</span>
                  </div>
                ))}
                <div className="mt-1 pt-1 border-t border-dotted border-border/50 space-y-0.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="text-foreground">₹{group.subtotal.toLocaleString()}</span></div>
                  {group.commissionPercent > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Commission ({group.commissionPercent}%)</span><span className="text-foreground">₹{group.commissionAmount.toLocaleString()}</span></div>}
                  {group.userFeePercent > 0 && <div className="flex justify-between"><span className="text-muted-foreground">User Fee ({group.userFeePercent}%)</span><span className="text-foreground">₹{group.userFeeAmount.toLocaleString()}</span></div>}
                  {(group.gstRate ?? 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">GST ({group.gstRate}%)</span><span className="text-foreground">₹{Math.round(group.subtotal * (group.gstRate ?? 0) / 100).toLocaleString()}</span></div>}
                </div>
              </div>
            ))}

            {/* Additions */}
            {(() => {
              const totalCoolie = activePrintBill.commodityGroups.reduce((s, g) => s + (g.coolieAmount || 0), 0);
              const totalWeighman = activePrintBill.commodityGroups.reduce((s, g) => s + (g.weighmanChargeAmount || 0), 0);
              return (totalCoolie > 0 || totalWeighman > 0 || activePrintBill.outboundFreight > 0) && (
              <div className="border-b border-dashed border-border pb-2">
                <p className="font-bold text-foreground mb-1">ADDITIONS</p>
                {totalCoolie > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Coolie Charge</span><span className="text-foreground">₹{totalCoolie.toLocaleString()}</span></div>}
                {totalWeighman > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Weighman Charge</span><span className="text-foreground">₹{totalWeighman.toLocaleString()}</span></div>}
                {activePrintBill.outboundFreight > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Outbound Freight</span><span className="text-foreground">₹{activePrintBill.outboundFreight.toLocaleString()}</span></div>}
              </div>
            );
            })()} 

            {/* REQ-BIL-010: Cumulative tax table (Commission, User Fee, GST) */}
            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">TAX SUMMARY</p>
              {activePrintBill.commodityGroups.filter(g => g.commissionPercent > 0 || g.userFeePercent > 0 || (g.gstRate ?? 0) > 0).map((g, i) => (
                <div key={i} className="text-[10px] space-y-0.5">
                  <span className="text-muted-foreground">{g.commodityName}:</span>
                  {g.commissionPercent > 0 && <div className="flex justify-between pl-2"><span>Commission</span><span>₹{g.commissionAmount}</span></div>}
                  {g.userFeePercent > 0 && <div className="flex justify-between pl-2"><span>User Fee</span><span>₹{g.userFeeAmount}</span></div>}
                  {(g.gstRate ?? 0) > 0 && <div className="flex justify-between pl-2"><span>GST ({g.gstRate}%)</span><span>₹{Math.round(g.subtotal * (g.gstRate ?? 0) / 100).toLocaleString()}</span></div>}
                </div>
              ))}

              {/* Overall cumulative row (REQ-BIL-010) */}
              {(() => {
                const groups = activePrintBill.commodityGroups.filter(g => g.commissionPercent > 0 || g.userFeePercent > 0 || (g.gstRate ?? 0) > 0);
                const totalCommission = groups.reduce((s, g) => s + g.commissionAmount, 0);
                const totalUserFee = groups.reduce((s, g) => s + g.userFeeAmount, 0);
                const totalGst = groups.reduce(
                  (s, g) => s + ((g.gstRate ?? 0) > 0 ? Math.round(g.subtotal * (g.gstRate ?? 0) / 100) : 0),
                  0,
                );
                return (
                  <div className="mt-1 pt-1 border-t border-dotted border-border/60 text-[10px] space-y-0.5">
                    <div className="flex justify-between pl-2">
                      <span className="text-muted-foreground font-semibold">TOTAL</span>
                      <span className="font-bold">₹{(totalCommission + totalUserFee + totalGst).toLocaleString()}</span>
                    </div>
                    {totalCommission > 0 && <div className="flex justify-between pl-2"><span>Commission Total</span><span>₹{totalCommission.toLocaleString()}</span></div>}
                    {totalUserFee > 0 && <div className="flex justify-between pl-2"><span>User Fee Total</span><span>₹{totalUserFee.toLocaleString()}</span></div>}
                    {totalGst > 0 && <div className="flex justify-between pl-2"><span>GST Total</span><span>₹{totalGst.toLocaleString()}</span></div>}
                  </div>
                );
              })()}
            </div>

            {/* Discount & Adjustments (now per-commodity) */}
            {(() => {
              const totalDiscount = activePrintBill.commodityGroups.reduce((s, g) => {
                let discountAmount = g.discount || 0;
                if (g.discountType === 'PERCENT') {
                  const subtotalWithCharges = (g.subtotal || 0) + (g.commissionAmount || 0) + (g.userFeeAmount || 0) + (g.coolieAmount || 0) + (g.weighmanChargeAmount || 0) + Math.round((g.subtotal || 0) * ((g.gstRate ?? 0) / 100));
                  discountAmount = Math.round(subtotalWithCharges * discountAmount / 100);
                }
                return s + discountAmount;
              }, 0);
              const totalRoundOff = activePrintBill.commodityGroups.reduce((s, g) => s + (g.manualRoundOff || 0), 0);
              return (totalDiscount > 0 || totalRoundOff !== 0) && (
                <div className="border-b border-dashed border-border pb-2">
                  <p className="font-bold text-foreground mb-1">DISCOUNT & ADJUSTMENTS</p>
                  {totalDiscount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">−₹{totalDiscount.toLocaleString()}</span></div>}
                  {totalRoundOff !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">Round Off</span><span className="text-foreground">{totalRoundOff > 0 ? '+' : ''}₹{totalRoundOff}</span></div>}
                </div>
              );
            })()}

            <div className="flex justify-between text-sm border-t border-dashed border-border pt-2">
              <span className="font-bold text-foreground">GRAND TOTAL</span>
              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">₹{activePrintBill.grandTotal.toLocaleString()}</span>
            </div>

            <div className="text-center text-muted-foreground/70 text-[9px] border-t border-dashed border-border pt-2">
              <p>NR = B + P + BRK + Other</p>
              <p>GT = Σ(Commodity Totals) + Additions − Discount + Round Off</p>
            </div>

            <div className="text-center border-t border-dashed border-border pt-2">
              <p className="text-muted-foreground">--- END OF BILL ---</p>
            </div>
          </div>

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
      const ok = await directPrint(generateSalesBillPrintHTML(activePrintBill), { mode: "system" });
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
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      <UnsavedChangesDialog />

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
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Search & Migrate Bid - {searchBidSourceBuyer ? `${searchBidSourceBuyer.buyerName} (${searchBidSourceBuyer.buyerMark})` : 'Buyer'}
            </DialogTitle>
          </DialogHeader>
          {!searchBidSourceBuyer || searchBidSourceBuyer.entries.length === 0 ? (
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
              {searchBidSourceBuyer.entries.map(entry => {
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

          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1 touch-pan-x">
            <button type="button" onClick={() => setBillingMainTab('create')}
              className={arrMobTabPill(billingMainTab === 'create')}>
              <Plus className="w-4 h-4 shrink-0 hidden sm:block" />
              <span>Create New Bill{tabHint('Alt X')}</span>
            </button>
            <button type="button" onClick={() => setBillingMainTab('progress')}
              className={arrMobTabPill(billingMainTab === 'progress')}>
              <Clock className="w-4 h-4 shrink-0 hidden sm:block" />
              <span>Bill In Progress{tabHint('Alt Y')}</span>
            </button>
            <button type="button" onClick={() => setBillingMainTab('saved')}
              className={arrMobTabPill(billingMainTab === 'saved')}>
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
          <div className="flex items-center gap-1 border-b border-border/40 w-full lg:w-auto overflow-x-auto">
            <button type="button" onClick={() => setBillingMainTab('create')} className={arrDeskTabBtn(billingMainTab === 'create')}>
              <Plus className="w-4 h-4" /> Create New Bill{tabHint('Alt X')}
              {billingMainTab === 'create' && (
                <motion.div layoutId="billing-main-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6075FF] rounded-full" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
            </button>
            <button type="button" onClick={() => setBillingMainTab('progress')} className={arrDeskTabBtn(billingMainTab === 'progress')}>
              <Clock className="w-4 h-4" /> Bill In Progress{tabHint('Alt Y')}
              {billingMainTab === 'progress' && (
                <motion.div layoutId="billing-main-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6075FF] rounded-full" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
            </button>
            <button type="button" onClick={() => setBillingMainTab('saved')} className={arrDeskTabBtn(billingMainTab === 'saved')}>
              <FileText className="w-4 h-4" /> Bills Saved{tabHint('Alt Z')}
              {billingMainTab === 'saved' && (
                <motion.div layoutId="billing-main-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6075FF] rounded-full" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
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
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
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
              {showBuyerSuggestions && (
                <div className="absolute z-50 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
                  {filteredBuyerOptions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No buyers match your search.</p>
                  ) : (
                    filteredBuyerOptions.map(b => (
                      <button
                        type="button"
                        key={`${b.buyerMark}-${b.buyerName}`}
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
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter the same mark or name used on auction bids, then open the bill form.
            </p>
            {selectBidBuyer && (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-foreground">{selectBidBuyer.buyerName} ({selectBidBuyer.buyerMark})</p>
                    <p className="text-xs text-muted-foreground">{selectBidBuyer.entries.length} bid(s) found</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setSelectBidBuyer(null); setSelectedBidKeys([]); }}
                    className={arrSolidSm}
                  >
                    Clear
                  </Button>
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
            <div className="glass-card rounded-2xl p-3 sm:p-4 space-y-3 overflow-visible">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Receipt className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-foreground">
                      Sales bill — {bill.buyerName} ({bill.buyerMark})
                    </h3>
                    <p className="text-[10px] sm:text-sm text-muted-foreground">
                      {bill.billNumber || 'New Bill'} · {bill.commodityGroups.reduce((s, g) => s + g.items.length, 0)} item(s) · ₹{bill.grandTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Button type="button" variant="outline" className={arrSolidMd} onClick={() => void handleClearBillEditor()}>
                    Change buyer
                  </Button>
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
                      ₹{bill.grandTotal.toLocaleString()}
                    </p>
                  </div>
                  <IndianRupee className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
                </div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-3 sm:p-4 space-y-3 overflow-visible relative z-[80]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Search & Migrate Bid</Label>
                  <div ref={searchBidBuyerSelectRef} className="relative w-full sm:w-48">
                    <Input
                      ref={searchBidInputRef}
                      value={searchBidInput}
                      onFocus={() => setShowSearchBidBuyerSuggestions(true)}
                      onChange={e => {
                        setSearchBidInput(e.target.value);
                        setShowSearchBidBuyerSuggestions(true);
                      }}
                      aria-label="Search & Migrate Bid"
                      title={`Search & Migrate Bid${tabHint('Alt L')}`}
                      placeholder="Search & Migrate Bid"
                      className="h-9 rounded-xl text-xs"
                    />
                    {showSearchBidBuyerSuggestions && (
                      <div className="absolute z-[95] top-full mt-1 w-full min-w-[12rem] max-h-44 overflow-y-auto rounded-xl border border-border/50 bg-background shadow-lg">
                        {searchBidBuyerOptions.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No buyer found.</p>
                        ) : (
                          searchBidBuyerOptions.map(b => (
                            <button
                              key={`${b.buyerMark}-${b.buyerName}`}
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
                  className={cn(arrSolidMd, 'shrink-0', showAddBidCard && 'ring-2 ring-[#6075FF] ring-offset-2 ring-offset-background')}
                  onClick={() => {
                    setShowAddBidCard(prev => {
                      const next = !prev;
                      if (!next) resetAddBidForm();
                      return next;
                    });
                  }}
                >
                  {showAddBidCard ? 'Hide Add Bid' : 'Add Bid'}
                </Button>
              </div>
              {showAddBidCard && (
                <div className="rounded-xl border border-border/60 bg-muted/10 p-2 sm:p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Add Bid</p>
                  <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
                    <div className="relative space-y-0.5 min-w-[10rem] flex-1 basis-[min(100%,14rem)]">
                      <Label className="text-[10px]">Lot Mark Search *</Label>
                      <Input
                        value={addBidLotSearch}
                        onFocus={() => setShowAddBidLotDropdown(true)}
                        onBlur={() => {
                          window.setTimeout(() => setShowAddBidLotDropdown(false), 120);
                        }}
                        onChange={e => {
                          setAddBidLotSearch(e.target.value);
                          setAddBidSelectedLot(null);
                          setShowAddBidLotDropdown(true);
                        }}
                        placeholder="Lot identifier"
                        className="h-8 rounded-lg text-xs px-2"
                      />
                      {addBidLotLoading && <p className="text-[10px] text-muted-foreground">Loading lots…</p>}
                      {!addBidLotLoading && showAddBidLotDropdown && !addBidSelectedLot && (
                        <div className="absolute z-[96] left-0 right-0 top-full mt-1 max-h-36 overflow-y-auto rounded-lg border border-border/50 bg-background shadow-lg">
                          {filteredAddBidLots.length === 0 && (
                            <p className="px-2 py-2 text-[10px] text-muted-foreground">No auction lots found.</p>
                          )}
                          {filteredAddBidLots.map(lot => (
                            <button
                              key={lot.lot_id}
                              type="button"
                              className="w-full px-2 py-1.5 text-left border-b border-border/30 last:border-b-0 hover:bg-muted/40"
                              onClick={async () => {
                                setAddBidSelectedLot(lot);
                                setAddBidLotSearch(getAddBidLotIdentifier(lot));
                                setShowAddBidLotDropdown(false);
                                try {
                                  const session = await auctionApi.getOrStartSession(lot.lot_id);
                                  setAddBidRemainingQty(Number(session.remaining_bags) || 0);
                                } catch {
                                  setAddBidRemainingQty(0);
                                }
                              }}
                            >
                              <p className="text-[11px] font-semibold leading-tight">{getAddBidLotIdentifier(lot)}</p>
                              <p className="text-[10px] text-muted-foreground">{lot.seller_name} · {lot.vehicle_number}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5 w-[4.25rem] shrink-0">
                      <Label className="text-[10px]">Buyer *</Label>
                      <Input value={bill.buyerMark} disabled className="h-8 rounded-lg bg-muted/30 text-xs px-1.5" title={bill.buyerMark} />
                    </div>
                    <div className="space-y-0.5 w-[3.5rem] sm:w-16 shrink-0">
                      <Label className="text-[10px]">Qty *</Label>
                      <Input
                        type="number"
                        value={addBidQty}
                        onChange={e => setAddBidQty(e.target.value)}
                        placeholder={String(addBidRemainingQty)}
                        className="h-8 rounded-lg text-xs px-1.5"
                        title={`Remaining bags: ${addBidRemainingQty}`}
                      />
                    </div>
                    <div className="space-y-0.5 w-[4.25rem] sm:w-[4.5rem] shrink-0">
                      <Label className="text-[10px]">Base *</Label>
                      <Input type="number" value={addBidBaseRate} onChange={e => setAddBidBaseRate(e.target.value)} className="h-8 rounded-lg text-xs px-1.5" />
                    </div>
                    <div className="space-y-0.5 w-[3.25rem] sm:w-14 shrink-0">
                      <Label className="text-[10px]">Extra</Label>
                      <Input type="number" value={addBidExtraAmount} onChange={e => setAddBidExtraAmount(e.target.value)} className="h-8 rounded-lg text-xs px-1.5" />
                    </div>
                    <div className="space-y-0.5 w-[3.75rem] sm:w-16 shrink-0">
                      <Label className="text-[10px]">Token</Label>
                      <Input type="number" value={addBidTokenAdvance} onChange={e => setAddBidTokenAdvance(e.target.value)} className="h-8 rounded-lg text-xs px-1.5" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className={arrSolidSm}
                      onClick={() => void handleAddBidToCurrentBuyer()}
                      disabled={addBidSaving}
                    >
                      {addBidSaving ? 'Saving...' : 'Save Bid'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={arrSolidSm}
                      onClick={() => {
                        resetAddBidForm();
                        setShowAddBidCard(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {/* Select Or Replace Buyer & broker — one row (wraps on narrow screens); no separate Save */}
            <div className="glass-card rounded-2xl p-3 space-y-2 relative z-[70] overflow-visible">
              <div className="flex flex-wrap items-center gap-2">
                <RadioGroup
                  value={replaceTarget}
                  onValueChange={v => {
                    if (v === 'BUYER' || v === 'BROKER') {
                      setReplaceTarget(v);
                      clearReplacementInline();
                    }
                  }}
                  className="flex flex-row flex-wrap gap-x-3 gap-y-1 min-h-9 shrink-0 items-center rounded-xl border border-border/30 bg-muted/20 px-2.5 py-1.5"
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
                <div className="relative min-w-[7rem] flex-1 basis-0 max-w-none">
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
                  {!replaceSearchLoading && replaceMarkInput.trim() && replaceSearchResults.length > 0 && (
                    <div className="absolute z-[90] mt-1 max-h-44 w-full min-w-[12rem] overflow-y-auto rounded-xl border border-border/50 bg-background shadow-lg">
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
                    'h-9 rounded-lg bg-muted/10 border-border/30 text-sm font-medium min-w-[5.5rem] flex-1 basis-[5.5rem] max-w-[14rem]',
                    replaceErrors.name && 'border-destructive',
                  )}
                  disabled={!bill}
                />
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
              </div>
              {(replaceErrors.mark || replaceErrors.name || replaceErrors.phone) && (
                <p className="text-[11px] text-destructive">
                  {[replaceErrors.mark, replaceErrors.name, replaceErrors.phone].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-2xl p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="sm:flex-1 sm:max-w-xs">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Billing Name (appears on print) <span className="text-destructive">*</span>
                  </p>
                  <Input
                    value={bill.billingName}
                    onChange={e => {
                      setBill({ ...bill, billingName: e.target.value });
                      setValidationErrors(prev => {
                        const n = { ...prev };
                        delete n.billingName;
                        return n;
                      });
                    }}
                    className={cn(
                      "h-9 rounded-xl text-sm font-medium bg-muted/20 border-border/30",
                      validationErrors.billingName && "border-destructive ring-1 ring-destructive/30",
                    )}
                  />
                  {validationErrors.billingName && (
                    <p className="text-[10px] text-destructive mt-1">{validationErrors.billingName}</p>
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 sm:text-right">
                    Global Charges (Apply to All Items)
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                        BROKERAGE
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setBill({
                              ...bill,
                              brokerageType: bill.brokerageType === 'PERCENT' ? 'AMOUNT' : 'PERCENT',
                            })
                          }
                          className="px-2 py-1.5 rounded-lg bg-muted/30 text-[10px] font-bold text-muted-foreground"
                        >
                          {bill.brokerageType === 'PERCENT' ? '%' : '₹'}
                        </button>
                        <Input
                          type="number"
                          value={bill.brokerageValue || ""}
                          onChange={e => {
                            setBill({ ...bill, brokerageValue: parseFloat(e.target.value) || 0 });
                            setValidationErrors(prev => {
                              const n = { ...prev };
                              delete n.brokerageValue;
                              return n;
                            });
                          }}
                          placeholder="Brokerage"
                          className={cn(
                            "h-8 rounded-lg text-xs text-center font-bold bg-muted/10 flex-1",
                            validationErrors.brokerageValue && "border-destructive ring-1 ring-destructive/30",
                          )}
                        />
                      </div>
                      {validationErrors.brokerageValue && (
                        <p className="text-[9px] text-destructive mt-0.5 text-right">
                          {validationErrors.brokerageValue}
                        </p>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                        OTHER CHARGES
                      </p>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={bill.globalOtherCharges || ""}
                          onChange={e => {
                            setBill({ ...bill, globalOtherCharges: parseFloat(e.target.value) || 0 });
                            setValidationErrors(prev => {
                              const n = { ...prev };
                              delete n.globalOtherCharges;
                              return n;
                            });
                          }}
                          placeholder="Other Charges (₹)"
                          className={cn(
                            "h-8 rounded-lg text-xs text-center font-bold bg-muted/10 flex-1",
                            validationErrors.globalOtherCharges && "border-destructive ring-1 ring-destructive/30",
                          )}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={applyGlobalCharges}
                          className={cn(arrSolidSm, 'whitespace-nowrap')}
                        >
                          Apply to All
                        </Button>
                      </div>
                      {validationErrors.globalOtherCharges && (
                        <p className="text-[9px] text-destructive mt-0.5 text-right">
                          {validationErrors.globalOtherCharges}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {bill.commodityGroups.map((group, gi) => (
              <motion.div key={gi} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + gi * 0.05 }}
                className="glass-card rounded-2xl overflow-hidden">
                {(() => {
                  const isCollapsed = collapsedCommodityIndexes.includes(gi);
                  return (
                    <>
                <div className="p-3 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border-b border-border/30">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-bold text-foreground">{group.commodityName}</p>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-[9px] font-bold text-emerald-700 dark:text-emerald-200">
                        Gross: ₹{group.subtotal.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCommodityCollapse(gi)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border/50 bg-background/80 hover:bg-muted/40 text-[10px] font-semibold text-foreground transition-colors"
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
                      {(group.gstRate ?? 0) > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-[9px] font-bold text-amber-800 dark:text-amber-200">
                          GST: {group.gstRate}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {!isCollapsed && (
                <div className="p-3 space-y-2">
                  {/* Table header for commodity items */}
                  <div className="hidden lg:grid lg:grid-cols-[minmax(140px,1.5fr),repeat(10,minmax(72px,1fr)),minmax(48px,0.5fr)] gap-2 px-1 pb-1 text-[10px] font-semibold text-muted-foreground uppercase text-center">
                    <span>Item</span>
                    <span>Qty</span>
                    <span>Weight (kg)</span>
                    <span>Avg Wt (kg)</span>
                    <span>Other Charges</span>
                    <span>Brokerage (₹)</span>
                    <span>Token (₹)</span>
                    <span>Value</span>
                    <span>Bid Rate (₹)</span>
                    <span>New Rate (₹)</span>
                    <span>Amount (₹)</span>
                    <span>Action</span>
                  </div>

                  <div className="space-y-2">
                    {group.items.map((item, ii) => {
                      const avgWeight = item.quantity > 0 ? item.weight / item.quantity : 0;
                      const baseValue = (item.weight * item.baseRate) / (group.divisor || 50 || 50);
                      const bounds = commodityAvgWeightBounds[group.commodityName];
                      const avgBelowMin = bounds != null && bounds.min > 0 && avgWeight < bounds.min;
                      const avgAboveMax = bounds != null && bounds.max > 0 && avgWeight > bounds.max;
                      const avgOutOfRange = avgBelowMin || avgAboveMax;
                      return (
                        <div
                          key={ii}
                      className="grid grid-cols-1 gap-1.5 text-[11px] lg:text-[10px] lg:grid-cols-[minmax(140px,1.5fr),repeat(10,minmax(72px,1fr)),minmax(48px,0.5fr)] items-start lg:items-center rounded-xl bg-card border border-border/60 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-2 py-1.5 text-left lg:text-center"
                        >
                          <div className="min-w-0">
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Item</p>
                            <p className="text-[11px] font-semibold text-foreground truncate">
                              {formatLotIdentifierForBillEntry(item)}
                            </p>
                          </div>

                          <div>
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Qty</p>
                            <Input
                              type="number"
                              value={item.quantity || ""}
                              onChange={e => {
                                updateLineItem(gi, ii, "quantity", parseInt(e.target.value, 10) || 0);
                                setValidationErrors(prev => {
                                  const n = { ...prev };
                                  delete n[`items.${gi}.${ii}.quantity`];
                                  return n;
                                });
                              }}
                              className={cn(
                                "h-10 lg:h-6 text-[11px] lg:text-[10px] text-right px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
                                validationErrors[`items.${gi}.${ii}.quantity`] &&
                                  "ring-1 ring-destructive/40 rounded",
                              )}
                            />
                            {validationErrors[`items.${gi}.${ii}.quantity`] && (
                              <p className="mt-0.5 text-[9px] lg:text-[8px] text-destructive">
                                {validationErrors[`items.${gi}.${ii}.quantity`]}
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Weight (kg)</p>
                            <Input
                              type="number"
                              value={item.weight || ""}
                              onChange={e => {
                                updateLineItem(gi, ii, "weight", parseFloat(e.target.value) || 0);
                                setValidationErrors(prev => {
                                  const n = { ...prev };
                                  delete n[`items.${gi}.${ii}.weight`];
                                  return n;
                                });
                              }}
                              className={cn(
                                "h-10 lg:h-6 text-[11px] lg:text-[10px] text-right px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
                                (validationErrors[`items.${gi}.${ii}.weight`] || item.weight === 0) &&
                                  "ring-1 ring-destructive/40 rounded",
                              )}
                            />
                            {item.weight === 0 && (
                              <p className="mt-0.5 text-[9px] lg:text-[8px] text-destructive">Weight can&apos;t be zero.</p>
                            )}
                            {validationErrors[`items.${gi}.${ii}.weight`] && (
                              <p className="mt-0.5 text-[9px] lg:text-[8px] text-destructive">
                                {validationErrors[`items.${gi}.${ii}.weight`]}
                              </p>
                            )}
                          </div>

                          <div className={cn("text-foreground", avgOutOfRange && "text-amber-600 font-semibold")}>
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Avg Wt (kg)</p>
                            {avgWeight.toFixed(1)}
                            {avgBelowMin && item.weight > 0 && (
                              <p className="mt-0.5 text-[8px] text-amber-600">
                                Avg weight below min ({bounds!.min}kg).
                              </p>
                            )}
                            {avgAboveMax && item.weight > 0 && (
                              <p className="mt-0.5 text-[8px] text-amber-600">
                                Avg weight above max ({bounds!.max}kg).
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Other Charges</p>
                            <Input
                              type="number"
                              value={item.otherCharges || ""}
                              onChange={e => {
                                updateLineItem(gi, ii, "otherCharges", parseFloat(e.target.value) || 0);
                                setValidationErrors(prev => {
                                  const n = { ...prev };
                                  delete n[`items.${gi}.${ii}.otherCharges`];
                                  return n;
                                });
                              }}
                              className={cn(
                                "h-10 lg:h-6 text-[11px] lg:text-[10px] text-right px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
                                validationErrors[`items.${gi}.${ii}.otherCharges`] &&
                                  "ring-1 ring-destructive/40 rounded",
                              )}
                            />
                            {validationErrors[`items.${gi}.${ii}.otherCharges`] && (
                              <p className="text-[9px] lg:text-[8px] text-destructive mt-0.5">
                                {validationErrors[`items.${gi}.${ii}.otherCharges`]}
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Brokerage (₹)</p>
                            <Input
                              type="number"
                              value={item.brokerage || ""}
                              onChange={e => {
                                updateLineItem(gi, ii, "brokerage", parseFloat(e.target.value) || 0);
                                setValidationErrors(prev => {
                                  const n = { ...prev };
                                  delete n[`items.${gi}.${ii}.brokerage`];
                                  return n;
                                });
                              }}
                              className={cn(
                                "h-10 lg:h-6 text-[11px] lg:text-[10px] text-right px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
                                validationErrors[`items.${gi}.${ii}.brokerage`] &&
                                  "ring-1 ring-destructive/40 rounded",
                              )}
                            />
                            {validationErrors[`items.${gi}.${ii}.brokerage`] && (
                              <p className="text-[9px] lg:text-[8px] text-destructive mt-0.5">
                                {validationErrors[`items.${gi}.${ii}.brokerage`]}
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Token (₹)</p>
                            <Input
                              type="number"
                              value={item.tokenAdvance ?? ''}
                              onChange={e => {
                                updateLineItem(gi, ii, 'tokenAdvance', parseFloat(e.target.value) || 0);
                              }}
                              className="h-10 lg:h-6 text-[11px] lg:text-[10px] text-right px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                              title="Token advance from auction for this bid/lot"
                            />
                          </div>

                          <div className="text-foreground font-semibold">
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Value</p>
                            ₹{baseValue.toFixed(2)}
                          </div>

                          <div>
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Bid Rate (₹)</p>
                            <Input
                              type="number"
                              value={item.baseRate || ""}
                              onChange={e => {
                                updateLineItem(gi, ii, "baseRate", parseFloat(e.target.value) || 0);
                              }}
                              className="h-10 lg:h-6 text-[11px] lg:text-[10px] text-right px-2 lg:px-1 py-1 lg:py-0 border border-border rounded bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                            />
                          </div>

                          <div className="text-primary font-semibold">
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">New Rate (₹)</p>
                            ₹{item.newRate}
                          </div>

                          <div className="text-foreground font-bold">
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Amount (₹)</p>
                            ₹{item.amount.toLocaleString()}
                          </div>

                          <div className="flex flex-col items-center gap-1 lg:flex-row lg:items-center lg:justify-center">
                            <p className="lg:hidden text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Action</p>
                            <button
                              type="button"
                              onClick={() => removeLineItem(gi, ii)}
                              className="inline-flex items-center justify-center rounded-lg p-2 lg:p-1.5 text-destructive hover:bg-destructive/10"
                              aria-label="Remove line item"
                            >
                              <Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="hidden lg:grid lg:grid-cols-[minmax(140px,1.5fr),repeat(10,minmax(72px,1fr)),minmax(48px,0.5fr)] gap-2 items-center rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 px-2 py-2 text-[11px] font-bold text-center text-white shadow-md">
                      <div className="text-left text-white">Total</div>
                      <div className="text-white">
                        {group.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0).toLocaleString()}
                      </div>
                      <div className="text-white">
                        {group.items.reduce((s, i) => s + (Number(i.weight) || 0), 0).toLocaleString()}
                      </div>
                      <div />
                      <div />
                      <div />
                      <div className="text-white">
                        ₹{group.items.reduce((s, i) => s + (Number(i.tokenAdvance) || 0), 0).toLocaleString()}
                      </div>
                      <div />
                      <div />
                      <div />
                      <div className="text-white">
                        ₹{group.items.reduce((s, i) => s + (Number(i.amount) || 0), 0).toLocaleString()}
                      </div>
                      <div />
                    </div>

                    <div className="pt-2 border-t border-border/30 space-y-1 text-xs">
                    </div>
                  </div>
                </div>
                )}
                {isCollapsed && (
                  <div className="px-3 py-2 bg-muted/10 border-t border-border/20">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-medium">Items: {group.items.length}</span>
                      <span className="text-foreground font-semibold">
                        Subtotal/Gross: ₹{group.subtotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
                    </>
                  );
                })()}
              </motion.div>
            ))}

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="glass-card rounded-2xl p-3 sm:p-4 space-y-3">
              <p className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                Bill Summary
              </p>
              <div
                ref={summaryTableScrollRef}
                onScroll={handleSummaryTableScroll}
                className="overflow-x-auto rounded-xl border border-border/50 bg-background/40 shadow-sm"
              >
                <table className="w-full min-w-[1100px] text-[11px] leading-tight border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-700 dark:to-slate-700 shadow-sm">
                      <th className="lg:sticky lg:top-0 lg:left-0 z-30 text-center px-3 py-3 font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-widest whitespace-normal bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700 border-b border-border/40 border-r border-border/50 min-w-[145px] max-w-[145px] w-[145px] shadow-sm">📋 Activity</th>
                      {bill.commodityGroups.map((g, gi) => (
                        <th
                          key={`${g.commodityName}-${gi}`}
                          className={cn(
                            'lg:sticky lg:top-0 z-20 text-center px-3 py-3 font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-widest min-w-[150px] border-b border-border/40 border-l border-border/50 dark:border-border/70 bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700 shadow-sm',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-300">📦</span>
                          <div>{g.commodityName || `Commodity ${gi + 1}`}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground whitespace-normal bg-background dark:bg-slate-900 border-b border-border/30 border-r border-border/50 min-w-[145px] max-w-[145px] w-[145px]">Gross Amt</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`gross-${gi}`}
                          className={cn(
                            'px-2 py-1.5 text-foreground dark:text-neutral-900 font-semibold border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          ₹{g.subtotal.toLocaleString()}
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <td
                        colSpan={bill.commodityGroups.length + 1}
                        className="lg:sticky lg:left-0 z-50 px-3 py-3 font-extrabold uppercase tracking-wider text-center whitespace-normal text-violet-800 dark:text-violet-200 bg-violet-500/20 dark:bg-violet-500/30 border-t-2 border-b-2 border-violet-500/50 dark:border-violet-400/40 shadow-sm"
                      >
                        💎 Commodity Additional Expenses
                      </td>
                    </tr>
                    <tr>
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-b border-border/30 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">Commission</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`com-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={g.commissionPercent}
                              min="0"
                              onChange={e => {
                                const val = Math.max(0, parseFloat(e.target.value) || 0);
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.commissionPercent = val;
                                cg.commissionAmount = Math.round(cg.subtotal * cg.commissionPercent / 100);
                                cg.totalCharges = cg.commissionAmount + cg.userFeeAmount;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                              className="h-10 w-16 lg:h-6 lg:w-14 rounded text-right text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                            />
                            <span className="text-[10px] font-semibold text-muted-foreground">%</span>
                            <span className="text-[10px] font-semibold text-foreground ml-1">₹{(g.commissionAmount || 0).toLocaleString()}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-b border-border/30 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">User Fee</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`uf-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={g.userFeePercent}
                              min="0"
                              onChange={e => {
                                const val = Math.max(0, parseFloat(e.target.value) || 0);
                                const updated = { ...bill };
                                const cg = { ...updated.commodityGroups[gi] };
                                cg.userFeePercent = val;
                                cg.userFeeAmount = Math.round(cg.subtotal * cg.userFeePercent / 100);
                                cg.totalCharges = cg.commissionAmount + cg.userFeeAmount;
                                updated.commodityGroups = [...updated.commodityGroups];
                                updated.commodityGroups[gi] = cg;
                                setBill(recalcGrandTotal(updated));
                              }}
                              className="h-10 w-16 lg:h-6 lg:w-14 rounded text-right text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                            />
                            <span className="text-[10px] font-semibold text-muted-foreground">%</span>
                            <span className="text-[10px] font-semibold text-foreground ml-1">₹{(g.userFeeAmount || 0).toLocaleString()}</span>
                          </div>
                        </td>
                      ))}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">Coolie Charge</td>
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
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={g.coolieRate || ""}
                                onChange={e => {
                                  const rate = parseFloat(e.target.value) || 0;
                                  const updated = { ...bill };
                                  const cg = { ...updated.commodityGroups[gi] };
                                  cg.coolieRate = rate;
                                  cg.coolieAmount = rate > 0 && qty > 0 ? Math.round(rate * qty) : 0;
                                  updated.commodityGroups = [...updated.commodityGroups];
                                  updated.commodityGroups[gi] = cg;
                                  setBill(recalcGrandTotal(updated));
                                  setValidationErrors(prev => {
                                    const n = { ...prev };
                                    delete n[`coolie-${gi}`];
                                    return n;
                                  });
                                }}
                                className={cn("h-10 w-24 lg:h-6 lg:w-20 rounded text-right text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50", validationErrors[`coolie-${gi}`] && "border-destructive ring-1 ring-destructive/30")}
                                placeholder="Rate"
                              />
                              <span className="text-[10px] font-semibold text-muted-foreground">x</span>
                              <span className="h-10 lg:h-6 px-2 inline-flex items-center justify-center rounded border border-border bg-background text-[10px] font-bold text-foreground min-w-[2.5rem]">
                                {qty}
                              </span>
                              <span className="text-[10px] font-semibold text-foreground ml-1">₹{(g.coolieAmount || 0).toLocaleString()}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">Weighman Charge</td>
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
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={g.weighmanChargeRate || ""}
                                onChange={e => {
                                  const rate = parseFloat(e.target.value) || 0;
                                  const updated = { ...bill };
                                  const cg = { ...updated.commodityGroups[gi] };
                                  cg.weighmanChargeRate = rate;
                                  cg.weighmanChargeAmount = rate > 0 && qty > 0 ? Math.round(rate * qty) : 0;
                                  updated.commodityGroups = [...updated.commodityGroups];
                                  updated.commodityGroups[gi] = cg;
                                  setBill(recalcGrandTotal(updated));
                                  setValidationErrors(prev => {
                                    const n = { ...prev };
                                    delete n[`weighman-${gi}`];
                                    return n;
                                  });
                                }}
                                className={cn("h-10 w-24 lg:h-6 lg:w-20 rounded text-right text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50", validationErrors[`weighman-${gi}`] && "border-destructive ring-1 ring-destructive/30")}
                                placeholder="Rate"
                              />
                              <span className="text-[10px] font-semibold text-muted-foreground">x</span>
                              <span className="h-10 lg:h-6 px-2 inline-flex items-center justify-center rounded border border-border bg-background text-[10px] font-bold text-foreground min-w-[2.5rem]">
                                {qty}
                              </span>
                              <span className="text-[10px] font-semibold text-foreground ml-1">₹{(g.weighmanChargeAmount || 0).toLocaleString()}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">GST</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`gst-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          ₹{Math.round((g.subtotal || 0) * ((g.gstRate ?? 0) / 100)).toLocaleString()}
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <td
                        colSpan={bill.commodityGroups.length + 1}
                        className="lg:sticky lg:left-0 z-50 px-3 py-3 font-extrabold uppercase tracking-wider text-center whitespace-normal text-amber-800 dark:text-amber-200 bg-amber-500/20 dark:bg-amber-500/30 border-t-2 border-b-2 border-amber-500/50 dark:border-amber-400/40 shadow-sm"
                      >
                        📊 Discount & Adjustment
                      </td>
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">Discount</td>
                      {bill.commodityGroups.map((g, gi) => {
                        const subtotalWithCharges = (g.subtotal || 0) + (g.commissionAmount || 0) + (g.userFeeAmount || 0) + (g.coolieAmount || 0) + (g.weighmanChargeAmount || 0) + Math.round((g.subtotal || 0) * ((g.gstRate ?? 0) / 100));
                        let discountAmount = g.discount || 0;
                        if (g.discountType === 'PERCENT') {
                          discountAmount = Math.round(subtotalWithCharges * discountAmount / 100);
                        }
                        return (
                          <td
                            key={`discount-${gi}`}
                            className={cn(
                              'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                              gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                            )}
                          >
                            <div className="flex items-center gap-1">
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
                              <Input
                                type="number"
                                value={g.discount || ""}
                                min="0"
                                onChange={e => {
                                  const val = Math.max(0, parseFloat(e.target.value) || 0);
                                  const updated = { ...bill };
                                  const cg = { ...updated.commodityGroups[gi] };
                                  cg.discount = val;
                                  updated.commodityGroups = [...updated.commodityGroups];
                                  updated.commodityGroups[gi] = cg;
                                  setBill(recalcGrandTotal(updated));
                                }}
                                className="h-10 w-20 lg:h-6 lg:w-16 rounded text-right text-[10px] lg:text-[9px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                                placeholder="0"
                              />
                              <span className="text-[10px] font-semibold text-foreground ml-1">₹{discountAmount.toLocaleString()}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">Round Off</td>
                      {bill.commodityGroups.map((g, gi) => (
                        <td
                          key={`roundoff-${gi}`}
                          className={cn(
                            'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500',
                            gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                          )}
                        >
                          <Input
                            type="number"
                            value={g.manualRoundOff || ""}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              const updated = { ...bill };
                              const cg = { ...updated.commodityGroups[gi] };
                              cg.manualRoundOff = val;
                              updated.commodityGroups = [...updated.commodityGroups];
                              updated.commodityGroups[gi] = cg;
                              setBill(recalcGrandTotal(updated));
                            }}
                            className="h-10 w-24 lg:h-6 lg:w-20 rounded text-right text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                            placeholder="0"
                          />
                        </td>
                      ))}
                    </tr>

                    <tr className="border-t border-border/30">
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">Overall Rate</td>
                      {bill.commodityGroups.map((g, gi) => {
                        const subtotalWithCharges = (g.subtotal || 0) + (g.commissionAmount || 0) + (g.userFeeAmount || 0) + (g.coolieAmount || 0) + (g.weighmanChargeAmount || 0) + Math.round((g.subtotal || 0) * ((g.gstRate ?? 0) / 100));
                        let discountAmount = g.discount || 0;
                        if (g.discountType === 'PERCENT') {
                          discountAmount = Math.round(subtotalWithCharges * discountAmount / 100);
                        }
                        const totalAmount = subtotalWithCharges - discountAmount + (g.manualRoundOff || 0);
                        return (
                          <td
                            key={`overallrate-${gi}`}
                            className={cn(
                              'px-2 py-1.5 border-b border-border/30 border-l border-border/50 dark:border-border/70 bg-white text-foreground dark:text-neutral-900 dark:[&_.text-muted-foreground]:text-neutral-500 font-bold',
                              gi === bill.commodityGroups.length - 1 && 'border-r border-border/50 dark:border-border/70',
                            )}
                          >
                            ₹{totalAmount.toLocaleString()}
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <td
                        colSpan={bill.commodityGroups.length + 1}
                        className="lg:sticky lg:left-0 z-50 px-3 py-3 font-extrabold uppercase tracking-wider text-center whitespace-normal text-indigo-800 dark:text-indigo-200 bg-indigo-500/20 dark:bg-indigo-500/30 border-t-2 border-b-2 border-indigo-500/50 dark:border-indigo-400/40 shadow-sm"
                      >
                        🚚 Freight Charges
                      </td>
                    </tr>
                    <tr className="border-t border-border/30">
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">Outbound Freight (Rate/Value)</td>
                      <td colSpan={bill.commodityGroups.length} className="px-2 py-1.5 bg-white text-foreground dark:text-neutral-900 border-l border-border/30 border-b border-border/30 border-r border-border/30 dark:border-border/70 dark:[&_.text-muted-foreground]:text-neutral-500">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input
                            type="number"
                            value={bill.outboundFreight || ''}
                            onChange={e => {
                              setBill(recalcGrandTotal({ ...bill, outboundFreight: parseInt(e.target.value, 10) || 0 }));
                              setValidationErrors(prev => {
                                const n = { ...prev };
                                delete n.outboundFreight;
                                return n;
                              });
                            }}
                            className={cn("h-10 w-28 lg:h-6 lg:w-24 rounded text-right text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50", validationErrors.outboundFreight && "border-destructive ring-1 ring-destructive/30")}
                          />
                          {validationErrors.outboundFreight && <span className="text-[10px] text-destructive">{validationErrors.outboundFreight}</span>}
                        </div>
                      </td>
                    </tr>
                    <tr className="border-t border-border/30">
                      <td className="lg:sticky lg:left-0 z-20 px-2 py-1.5 font-semibold text-foreground bg-background dark:bg-slate-900 border-r border-border/50 whitespace-normal min-w-[145px] max-w-[145px] w-[145px]">Outbound Vehicle #</td>
                      <td colSpan={bill.commodityGroups.length} className="px-2 py-1.5 bg-white text-foreground dark:text-neutral-900 border-l border-border/30 border-b border-border/30 border-r border-border/30 dark:border-border/70">
                        <Input
                          value={bill.outboundVehicle}
                          onChange={e => {
                            setBill({ ...bill, outboundVehicle: e.target.value });
                            setValidationErrors(prev => {
                              const n = { ...prev };
                              delete n.outboundVehicle;
                              return n;
                            });
                          }}
                          placeholder="AP03 CK 4323"
                          className={cn("h-10 w-40 lg:h-6 lg:w-36 rounded text-left text-[11px] lg:text-[10px] px-2 lg:px-1 py-1 lg:py-0 border border-border bg-background font-bold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50", validationErrors.outboundVehicle && "border-destructive ring-1 ring-destructive/30")}
                        />
                      </td>
                    </tr>

                    <tr className="border-t-2 border-violet-500/60">
                      <td className="lg:sticky lg:left-0 z-20 px-3 py-2.5 font-extrabold text-white bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 dark:from-violet-700 dark:via-purple-700 dark:to-indigo-700 whitespace-normal min-w-[145px] max-w-[145px] w-[145px] border-r border-white/30 shadow-lg text-center uppercase tracking-wider text-sm">
                        💰 Final Summary
                      </td>
                      <td colSpan={bill.commodityGroups.length} className="px-3 py-2.5 bg-gradient-to-b from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border-l border-violet-500/30 border-r border-violet-500/30 dark:border-indigo-500/30 shadow-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-xl bg-white dark:bg-slate-800 border-2 border-violet-500/40 dark:border-violet-400/30 px-3 py-2 shadow-md hover:shadow-lg transition-shadow">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">💵 Grand Total</p>
                            <p className="font-extrabold text-lg text-violet-900 dark:text-violet-100 mt-1">₹{bill.grandTotal.toLocaleString()}</p>
                          </div>
                          <div className="rounded-xl bg-white dark:bg-slate-800 border-2 border-indigo-500/40 dark:border-indigo-400/30 px-3 py-2 shadow-md hover:shadow-lg transition-shadow">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-300">📊 Pending Balance</p>
                            <p className="font-extrabold text-lg text-indigo-900 dark:text-indigo-100 mt-1">₹{bill.pendingBalance.toLocaleString()}</p>
                          </div>
                          <div className="rounded-xl bg-white dark:bg-slate-800 border-2 border-emerald-500/40 dark:border-emerald-400/30 px-3 py-2 shadow-md hover:shadow-lg transition-shadow">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">🎟️ Token Advance</p>
                            <p className="font-extrabold text-lg text-emerald-900 dark:text-emerald-100 mt-1">₹{sumLineTokenAdvances(bill).toLocaleString()}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="glass-card rounded-2xl p-4 border-2 border-emerald-500/30">
              <div className="mt-1 space-y-2">
                <div className="flex flex-wrap gap-2 justify-between items-center">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'gap-1.5')}
                      onClick={() => setEditLocked(false)}
                      disabled={!isBackendBillId(bill.billId)}
                    >
                      <Edit3 className="w-4 h-4" /> Edit (Alt+E)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'gap-1.5')}
                      onClick={() => void handleSaveDraft()}
                    >
                      <Save className="w-4 h-4" /> {bill.billId && isBackendBillId(bill.billId) ? 'Update (Alt+S)' : 'Save (Alt+S)'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'gap-1.5')}
                      onClick={() => void saveAndPreparePrint()}
                      disabled={!hasSavedOnce}
                    >
                      <Printer className="w-4 h-4" /> Print (Alt+P)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrSolidMd, 'gap-1.5')}
                      onClick={handleCreateNewBill}
                    >
                      <Plus className="w-4 h-4" /> Create New (Alt+N)
                    </Button>
                  </div>
                  {Array.isArray((bill as any).versions) && (bill as any).versions.length > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-semibold">Version:</span>
                      <select
                        value={selectedPrintVersion === 'latest' ? 'latest' : String(selectedPrintVersion)}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'latest') {
                            setSelectedPrintVersion('latest');
                          } else {
                            const num = Number(val);
                            setSelectedPrintVersion(Number.isFinite(num) ? num : 'latest');
                          }
                        }}
                        className="h-8 rounded-md border border-border bg-background px-2 text-[10px]"
                      >
                        <option value="latest">Latest (current)</option>
                        {(bill as any).versions.map((v: any) => (
                          <option key={v.version} value={String(v.version)}>
                            v{v.version}{v.savedAt ? ` — ${new Date(v.savedAt).toLocaleString()}` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedPrintVersion !== 'latest' && (
                        <span className="text-[10px] text-primary font-semibold">v{selectedPrintVersion} selected</span>
                      )}
                    </div>
                  )}
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
                    <p className="text-sm font-bold text-foreground">₹{b.grandTotal?.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(b.billDate).toLocaleDateString()}</p>
                  </div>
                </div>
              </motion.button>
            ))
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
                    <p className="text-sm font-bold text-foreground">₹{b.grandTotal?.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(b.billDate).toLocaleDateString()}</p>
                  </div>
                </div>
              </motion.button>
            ))
          )
        )}
      </div>
      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default BillingPage;
