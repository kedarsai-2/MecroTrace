import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, FileText, Search, Users, Package, Truck,
  Edit3, Save, Printer, PlusCircle, Receipt, Scale, Gavel, IndianRupee, Trash2, Loader2,
  ChevronDown, ChevronUp, Info, RotateCcw, AlertTriangle, Check, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { SettlementNumericInput } from '@/components/settlement/SettlementNumericInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import {
  parsePrintCopiesJson,
  printLogApi,
  printSettingsApi,
  settlementApi,
  arrivalsApi,
  commodityApi,
  contactApi,
  type PattiDTO,
  type PattiSaveRequest,
} from '@/services/api';
import { ContactApiError } from '@/services/api/contacts';
import type { ArrivalFullDetail, ArrivalSellerFullDetail } from '@/services/api/arrivals';
import type { FullCommodityConfigDto } from '@/services/api/commodities';
import type { Commodity, Contact } from '@/types/models';
import { directPrint } from '@/utils/printTemplates';
import {
  generateSalesPattiPrintHTMLForCopies,
  generateSalesPattiPrintHTMLPages,
  type PattiPrintData,
} from '@/utils/printDocumentTemplates';
import { useAuth } from '@/context/AuthContext';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Settlement button language:
 * - Premium gradient (same family as table headers)
 * - Hover highlight border + stronger glow
 */
const settlementBtnGradient =
  '!bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] !text-white border border-white/25 shadow-[0_10px_24px_-12px_rgba(91,140,255,0.85)] hover:!brightness-110 hover:border-white/45 hover:shadow-[0_14px_30px_-12px_rgba(123,97,255,0.9)] active:scale-[0.99] transition-all';
const arrOutlineMd = cn('rounded-xl h-9 text-sm font-semibold', settlementBtnGradient);
const arrOutlineTall = cn('rounded-xl h-12 text-sm font-semibold', settlementBtnGradient);
const arrOutlineSm = cn('rounded-xl h-8 text-xs font-semibold', settlementBtnGradient);
const arrSolid =
  cn('rounded-xl font-bold', settlementBtnGradient);
const arrSolidMd = cn(arrSolid, 'h-9 px-3 text-sm');
const arrSolidTall = cn(arrSolid, 'h-12 px-6 text-sm');
const arrSolidSm = cn(arrSolid, 'h-8 px-2.5 text-xs');

/**
 * Settlement toggle row: same visual language as New Patti / Saved Patti (rounded-xl, gradient active).
 * Used for main tabs (Arrival summary / Create settlements) and arrival-summary sub-tabs.
 */
const settlementToggleTabBtn = (active: boolean) =>
  cn(
    'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-10',
    active
      ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
      : 'glass-card text-muted-foreground hover:text-foreground',
  );

/** Same as settlementToggleTabBtn but inactive state readable on the teal mobile hero. */
const settlementToggleTabBtnOnHero = (active: boolean) =>
  cn(
    'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-10',
    active
      ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
      : 'bg-white/15 text-white/90 hover:bg-white/25 border border-white/10 backdrop-blur-sm',
  );

/** Lightweight inline hint for keyboard shortcuts (same pattern as Billing). */
const tabHint = (key: string) => ` (${key})`;

/** Commodity-settings style toggle shell for settlement expense card. */
const settlementExpenseToggleBtnClass = (
  checked: boolean,
  tone: 'emerald' | 'violet',
  disabled?: boolean
) =>
  cn(
    'w-[54px] h-[30px] rounded-full transition-all relative shadow-inner',
    checked
      ? tone === 'emerald'
        ? 'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] shadow-[0_8px_20px_-12px_rgba(91,140,255,0.9)]'
        : 'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] shadow-[0_8px_20px_-12px_rgba(123,97,255,0.9)]'
      : 'bg-slate-300 dark:bg-slate-600',
    disabled && 'opacity-60 cursor-not-allowed'
  );

/** Sales report: outer card border per seller (same accent idea as Vehicle details tiles). */
const SALES_REPORT_SELLER_CARD_STYLES = [
  'border-blue-500/20 bg-muted/30',
  'border-cyan-500/20 bg-muted/30',
  'border-amber-500/20 bg-muted/30',
  'border-emerald-500/20 bg-muted/30',
  'border-violet-500/20 bg-muted/30',
  'border-fuchsia-500/20 bg-muted/30',
] as const;

/** Same gradient language as `DesktopSidebar` (linear + radial shine). */
const DESKTOP_SIDEBAR_LIKE_GRADIENT_BG =
  'bg-[linear-gradient(180deg,#4B7CF3_0%,#5B8CFF_30%,#7B61FF_100%)]';
const DESKTOP_SIDEBAR_LIKE_SHINE =
  'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15)_0%,transparent_60%)]';
/** Horizontal variant so the full sweep reads across column headers. */
const SETTLEMENT_LOTS_TABLE_HEADER_GRADIENT =
  'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)]';

// ── Types ─────────────────────────────────────────────────
interface SellerSettlement {
  sellerId: string;
  sellerName: string;
  sellerMark: string;
  /** Arrivals vehicle id (from settlement API) for direct arrival freight lookup. */
  vehicleId?: number;
  vehicleNumber: string;
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

interface SettlementLot {
  lotId: string;
  lotName: string;
  commodityName: string;
  /** Arrivals module: `lot.bag_count` (from settlement API). */
  arrivalBagCount?: number;
  /** Σ billing line weights for this lot (kg), when invoiced. */
  billingWeightKg?: number | null;
  entries: SettlementEntry[];
}

interface SettlementEntry {
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

/** Sales Patti print footers: auction-based vs summary-based settlement. */
const SETTLEMENT_PATTI_FOOTER_ALT_O = 'Original (ALT O) — Bid + preset';
const SETTLEMENT_PATTI_FOOTER_ALT_M = 'Modified (ALT M) — Summary new seller rate (incl. preset)';

interface RateCluster {
  rate: number;
  totalQuantity: number;
  totalWeight: number;
  amount: number;
}

interface DeductionItem {
  key: string;
  label: string;
  amount: number;
  editable: boolean;
  autoPulled: boolean;
}

interface PattiData {
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

interface ArrivalSummaryRow {
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

interface SavedArrivalSummaryRow {
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
}

type InProgressSettlementDraft = {
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

/** Lower SL No. sorts first; missing serial sorts last (stable tie-break on sellerId). */
function sellerSerialSortKey(serial: string | number | null | undefined): number {
  if (serial == null || serial === '') return Number.POSITIVE_INFINITY;
  const n = Number(serial);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function pickFirstArrivalSeller(
  sellerIds: string[],
  sellerById: Map<string, SellerSettlement>
): SellerSettlement | undefined {
  const list = sellerIds
    .map(id => sellerById.get(String(id)))
    .filter((s): s is SellerSettlement => s != null);
  if (list.length === 0) return undefined;
  list.sort((a, b) => {
    const d = sellerSerialSortKey(a.sellerSerialNo) - sellerSerialSortKey(b.sellerSerialNo);
    if (d !== 0) return d;
    return String(a.sellerId).localeCompare(String(b.sellerId));
  });
  return list[0];
}

function formatSettlementSellerLabel(s: SellerSettlement): string {
  const name = (s.sellerName || '').trim();
  const mark = (s.sellerMark || '').trim();
  if (!name && !mark) return '-';
  return mark ? `${name} – ${mark}` : name;
}

/** One label for the arrival-summary table: first seller on the vehicle by arrival serial. */
function firstArrivalSellerLabel(
  sellerIds: string[],
  sellerById: Map<string, SellerSettlement>,
  fallbackName?: string
): string {
  const first = pickFirstArrivalSeller(sellerIds, sellerById);
  if (first) return formatSettlementSellerLabel(first);
  const fb = (fallbackName || '').trim();
  return fb || '-';
}

function uniqueArrivalSellerCount(sellerIds: string[] | undefined): number {
  const set = new Set<string>();
  for (const raw of sellerIds ?? []) {
    const s = String(raw ?? '').trim();
    if (s) set.add(s);
  }
  return set.size;
}

function InlineCalcTip({ label, lines }: { label: string; lines: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60"
          aria-label={label}
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="z-[99999] max-w-[300px] text-xs leading-relaxed">
        <div className="space-y-0.5">
          {lines.map((line, idx) => (
            <p key={`${label}-${idx}`}>{line}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Map backend PattiDTO to form PattiData (numbers and ISO date). */
function mapPattiDTOToPattiData(dto: PattiDTO): PattiData {
  const toNum = (v: unknown): number => (typeof v === 'number' && !Number.isNaN(v) ? v : Number(v) || 0);
  const rateClusters = (dto.rateClusters ?? []).map((c: { rate?: unknown; totalQuantity?: unknown; totalWeight?: unknown; amount?: unknown }) => ({
    rate: toNum(c.rate),
    totalQuantity: toNum(c.totalQuantity),
    totalWeight: toNum(c.totalWeight),
    amount: toNum(c.amount),
  }));
  const deductions: DeductionItem[] = (dto.deductions ?? []).map((d: { key?: string; label?: string; amount?: unknown; editable?: boolean; autoPulled?: boolean }) => ({
    key: d.key ?? `ded_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    label: d.label ?? 'Deduction',
    amount: toNum(d.amount),
    editable: d.editable ?? true,
    autoPulled: d.autoPulled ?? false,
  }));
  const grossAmount = toNum(dto.grossAmount);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netPayable = toNum(dto.netPayable);
  let createdAt = '';
  if (dto.createdAt != null) {
    if (typeof dto.createdAt === 'string') createdAt = dto.createdAt;
    else createdAt = new Date(dto.createdAt as number | Date).toISOString();
  } else {
    createdAt = new Date().toISOString();
  }
  return {
    pattiId: dto.pattiId ?? '',
    sellerName: dto.sellerName ?? '',
    rateClusters,
    grossAmount,
    deductions,
    totalDeductions,
    netPayable,
    createdAt,
    useAverageWeight: dto.useAverageWeight ?? false,
  };
}

/**
 * Alt+O original view: body fields (clusters, extensionJson, amounts) come only from immutable snapshot `raw`.
 * Do not fall back to current `pattiDetailDto` for those keys — missing keys mean empty/default, not “live” split/edit state.
 */
function pattiDtoFromOriginalSnapshotPayload(baseDto: PattiDTO, raw: Record<string, unknown>): PattiDTO {
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(raw, key);

  const rateClusters: PattiDTO['rateClusters'] =
    has('rateClusters') && Array.isArray(raw.rateClusters)
      ? (raw.rateClusters as PattiDTO['rateClusters'])
      : [];

  const deductions: PattiDTO['deductions'] =
    has('deductions') && Array.isArray(raw.deductions)
      ? (raw.deductions as PattiDTO['deductions'])
      : [];

  const toNum = (key: string, defaultValue: number): number => {
    if (!has(key)) return defaultValue;
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : defaultValue;
  };

  const totalDeductionsFromLines = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const grossAmount = toNum('grossAmount', 0);
  const totalDeductions = has('totalDeductions') ? toNum('totalDeductions', totalDeductionsFromLines) : totalDeductionsFromLines;
  const netPayable = has('netPayable') ? toNum('netPayable', grossAmount - totalDeductions) : grossAmount - totalDeductions;

  let extensionJson: string | undefined;
  if (has('extensionJson')) {
    const ej = raw.extensionJson;
    if (ej == null || ej === '') extensionJson = undefined;
    else extensionJson = typeof ej === 'string' ? ej : String(ej);
  } else {
    extensionJson = undefined;
  }

  const useAverageWeight = has('useAverageWeight') ? Boolean(raw.useAverageWeight) : false;

  const sellerName =
    has('sellerName') && raw.sellerName != null ? String(raw.sellerName) : baseDto.sellerName;
  const vehicleNumber = has('vehicleNumber')
    ? raw.vehicleNumber == null
      ? undefined
      : String(raw.vehicleNumber)
    : baseDto.vehicleNumber;
  const fromLocation = has('fromLocation')
    ? raw.fromLocation == null
      ? undefined
      : String(raw.fromLocation)
    : baseDto.fromLocation;

  const createdAt = has('createdAt')
    ? raw.createdAt == null
      ? baseDto.createdAt
      : typeof raw.createdAt === 'string'
        ? raw.createdAt
        : String(raw.createdAt)
    : baseDto.createdAt;

  const pattiBaseNumber = has('pattiBaseNumber')
    ? raw.pattiBaseNumber == null
      ? undefined
      : String(raw.pattiBaseNumber)
    : baseDto.pattiBaseNumber;

  let sellerSequenceNumber = baseDto.sellerSequenceNumber;
  if (has('sellerSequenceNumber')) {
    const v = raw.sellerSequenceNumber;
    if (typeof v === 'number' && Number.isFinite(v)) sellerSequenceNumber = v;
    else {
      const n = Number(v);
      if (Number.isFinite(n)) sellerSequenceNumber = n;
    }
  }

  const sellerSerialNo = has('sellerSerialNo')
    ? (raw.sellerSerialNo as PattiDTO['sellerSerialNo'])
    : baseDto.sellerSerialNo;

  const date = has('date') ? (raw.date == null ? baseDto.date : String(raw.date)) : baseDto.date;

  return {
    id: baseDto.id,
    pattiId: baseDto.pattiId,
    pattiBaseNumber,
    sellerSequenceNumber,
    sellerId: baseDto.sellerId,
    sellerName,
    vehicleNumber,
    fromLocation,
    sellerSerialNo,
    date,
    rateClusters,
    grossAmount,
    deductions,
    totalDeductions,
    netPayable,
    createdAt,
    useAverageWeight,
    inProgress: has('inProgress') ? Boolean(raw.inProgress) : baseDto.inProgress,
    extensionJson,
    originalData: baseDto.originalData,
  };
}

/** Arrival-summary stats from saved patti body (stays in sync after weight/qty edits are saved). */
function tallyFromPattiDtoClusters(dto: PattiDTO): { lots: number; bids: number; weighed: number } {
  const clusters = dto.rateClusters ?? [];
  let lots = 0;
  let weighed = 0;
  for (const c of clusters) {
    lots += Number(c.totalQuantity) || 0;
    weighed += Number(c.totalWeight) || 0;
  }
  return { lots, bids: clusters.length, weighed };
}

function sumPattiClusterQty(pd: PattiData): number {
  return pd.rateClusters.reduce((s, c) => s + (Number(c.totalQuantity) || 0), 0);
}

function sumPattiClusterWeight(pd: PattiData): number {
  return pd.rateClusters.reduce((s, c) => s + (Number(c.totalWeight) || 0), 0);
}

/** INR display: always two decimals (en-IN), signed-safe (unlike `roundMoney2` which floors negatives). */
function formatMoney2Display(n: number): string {
  if (!Number.isFinite(n)) {
    return (0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const x = Math.round((n + Number.EPSILON) * 100) / 100;
  return x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Restore per-seller expense form from saved patti deduction lines. */
function deductionsToSellerExpenseForm(
  deds: DeductionItem[],
  opts?: { inferredWeighmanFromSlabs?: number }
): SellerExpenseFormState {
  const byKey = Object.fromEntries(deds.map(d => [d.key, d.amount])) as Record<string, number>;
  const freightDed = deds.find(d => d.key === 'freight');
  const hasWeighingLine = deds.some(d => d.key === 'weighing' || d.key === 'weighman');

  let freight = Number(byKey.freight ?? 0);
  let weighman = Number(byKey.weighing ?? byKey.weighman ?? 0);

  /**
   * Legacy saves (Add to freight ON): single `freight` row held freight+weighing with no `weighing` key.
   * Split using slab-derived weighing when freight label indicates merged line.
   */
  if (
    !hasWeighingLine &&
    freight > 0 &&
    weighman === 0 &&
    opts?.inferredWeighmanFromSlabs != null &&
    Number.isFinite(opts.inferredWeighmanFromSlabs)
  ) {
    const inf = clampMoney(opts.inferredWeighmanFromSlabs);
    const lab = String(freightDed?.label ?? '').toLowerCase();
    const looksMergedFreight = lab.includes('incl');
    if (looksMergedFreight && inf > 0) {
      const w = Math.min(inf, freight);
      weighman = w;
      freight = clampMoney(freight - w);
    }
  }

  return {
    freight: clampMoney(freight),
    unloading: Number(byKey.coolie ?? byKey.unloading ?? 0),
    weighman: clampMoney(weighman),
    cashAdvance: Number(byKey.advance ?? 0),
    gunnies: Number(byKey.gunnies ?? 0),
    others: Number(byKey.others ?? 0),
  };
}

/** Main patti deduction rows from primary seller expense state (labels for print/save). */
function buildDeductionItemsFromSellerExpenses(
  exp: SellerExpenseFormState,
  coolieMode: 'FLAT' | 'RECALCULATED',
  weighingEnabled: boolean,
  mergeWeighingIntoFreight: boolean
): DeductionItem[] {
  const coolieLabel =
    coolieMode === 'FLAT'
      ? 'Unloading (Coolie) — commodity slab'
      : 'Unloading (Coolie) — commodity slab (weight mode reference)';

  const merged = weighingEnabled && mergeWeighingIntoFreight;
  /** Always persist base freight + weighing on separate rows so reopening saved pattis restores `weighman` (Quick Adjustment + expense card). UI merge only affects display, not stored shape. */
  const freightAmt = exp.freight;

  const items: DeductionItem[] = [
    {
      key: 'freight',
      label: merged ? 'Freight (incl. weighing)' : 'Freight',
      amount: freightAmt,
      editable: true,
      autoPulled: true,
    },
    { key: 'coolie', label: coolieLabel, amount: exp.unloading, editable: true, autoPulled: true },
  ];
  if (weighingEnabled) {
    items.push({
      key: 'weighing',
      label: 'Weighing Charges',
      amount: exp.weighman,
      editable: true,
      autoPulled: true,
    });
  }
  items.push(
    { key: 'advance', label: 'Cash Advance', amount: exp.cashAdvance, editable: true, autoPulled: false },
    { key: 'gunnies', label: 'Gunnies', amount: exp.gunnies, editable: true, autoPulled: false },
    { key: 'others', label: 'Others', amount: exp.others, editable: true, autoPulled: false }
  );
  return items;
}

function totalSellerExpenses(
  exp: SellerExpenseFormState,
  weighingEnabled: boolean,
  mergeWeighingIntoFreight: boolean
): number {
  let freight = exp.freight;
  let w = 0;
  if (weighingEnabled) {
    if (mergeWeighingIntoFreight) {
      freight = exp.freight + exp.weighman;
    } else {
      w = exp.weighman;
    }
  }
  return freight + exp.unloading + w + exp.cashAdvance + exp.gunnies + exp.others;
}

// ── Validation constants (align with ArrivalService multi-seller: 2–12 chars) ──
const DEDUCTION_MAX = 10_000_000;
const VEHICLE_NUMBER_MIN = 2;
const VEHICLE_NUMBER_MAX = 12;

function clampMoney(value: number, min = 0, max = DEDUCTION_MAX): number {
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function isVehicleNumberValid(v: string): boolean {
  return v.length >= VEHICLE_NUMBER_MIN && v.length <= VEHICLE_NUMBER_MAX;
}

function presetDelta(entry: SettlementEntry): number {
  const p = entry.presetMargin;
  if (p == null) return 0;
  const n = Number(p);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Per-bag amount for settlement:
 * - Original: bid (rate) + preset (signed, from pad).
 * - Modified: vehicle-ops summary new seller rate only — that value is the final per-bag amount (pad preset already incorporated there). Do not add preset again. If missing, fall back to bid + preset (legacy / extra-bid rows).
 */
function settlementEffectiveRatePerBag(entry: SettlementEntry, mode: 'original' | 'modified'): number {
  if (mode === 'original') {
    return (Number(entry.rate) || 0) + presetDelta(entry);
  }
  if (entry.summarySellerRate != null && Number.isFinite(Number(entry.summarySellerRate))) {
    return Number(entry.summarySellerRate);
  }
  return (Number(entry.rate) || 0) + presetDelta(entry);
}

function normalizeVehicleKey(v: string | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function totalBagsForSeller(s: SellerSettlement): number {
  return s.lots.reduce((acc, l) => acc + l.entries.reduce((a2, e) => a2 + (Number(e.quantity) || 0), 0), 0);
}

/** Sales Pad style estimate: Σ (bags × 50 kg) when actual weight not yet applied. */
function totalPadEstimateWeightForSeller(s: SellerSettlement): number {
  return s.lots.reduce(
    (acc, l) => acc + l.entries.reduce((a2, e) => a2 + (Number(e.quantity) || 0) * 50, 0),
    0
  );
}

/** Arrivals module: total bags (lot.bag_count) for this seller. */
function totalArrivalBagsForSeller(s: SellerSettlement): number {
  if (typeof s.arrivalTotalBags === 'number' && !Number.isNaN(s.arrivalTotalBags)) {
    return s.arrivalTotalBags;
  }
  return s.lots.reduce((acc, l) => acc + (Number(l.arrivalBagCount) || 0), 0);
}

/** Billing module: Σ persisted line weights for this seller's lots; falls back to pad estimate if API omitted. */
function totalBillingNetWeightForSeller(s: SellerSettlement): number {
  if (s.billingNetWeightKg != null && Number.isFinite(Number(s.billingNetWeightKg))) {
    return Number(s.billingNetWeightKg);
  }
  return totalPadEstimateWeightForSeller(s);
}

function vehicleArrivalNetBillableKgForSeller(s: SellerSettlement): number | null {
  if (s.vehicleArrivalNetBillableKg == null || !Number.isFinite(Number(s.vehicleArrivalNetBillableKg))) {
    return null;
  }
  return Number(s.vehicleArrivalNetBillableKg);
}

function roundMoney2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

/** SRS hamali / weighing slab: charge = Rf × max(1, W / T). Round only after bag distribution (see modal / auto-pull). */
function computeSlabChargeTotal(actualWeight: number, fixedRate: number, threshold: number): number {
  const w = Math.max(0, Number(actualWeight) || 0);
  const T = Math.max(0, Number(threshold) || 0);
  const F = Math.max(0, Number(fixedRate) || 0);
  if (T <= 0) return 0;
  return F * Math.max(1, w / T);
}

function findArrivalSellerForSettlement(
  arrival: ArrivalFullDetail,
  settlement: SellerSettlement
): ArrivalSellerFullDetail | undefined {
  const sellers = arrival.sellers ?? [];
  const byMark = sellers.find(
    x =>
      (x.sellerName || '').trim().toLowerCase() === (settlement.sellerName || '').trim().toLowerCase() &&
      (x.sellerMark || '').trim().toLowerCase() === (settlement.sellerMark || '').trim().toLowerCase()
  );
  if (byMark) return byMark;
  return sellers.find(
    x => (x.sellerName || '').trim().toLowerCase() === (settlement.sellerName || '').trim().toLowerCase()
  );
}

function bagsFromArrivalSeller(arrivalSeller: ArrivalSellerFullDetail | undefined): number {
  if (!arrivalSeller) return 0;
  return arrivalSeller.lots.reduce((a, l) => a + (Number(l.bagCount) || 0), 0);
}

function formatOptionalKg(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

function formatOptionalInt(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return String(Math.round(value));
}

function formatRupeeInr(value: number): string {
  return `₹ ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Parsed `grossAmount` from a stored original snapshot body (session JSON or API `originalData`). */
function grossAmountFromOriginalPayloadRecord(raw: Record<string, unknown> | null | undefined): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw.grossAmount;
  if (typeof g === 'number' && Number.isFinite(g)) return g;
  const n = Number(g);
  return Number.isFinite(n) ? n : null;
}

function stringifyOriginalDataForHydration(od: unknown): string | null {
  if (!od || typeof od !== 'object' || Array.isArray(od)) return null;
  try {
    return JSON.stringify(od);
  } catch {
    return null;
  }
}

/** Copy API `originalData` into session ref so multi-seller footers can sum every seller's first snapshot. */
function hydrateSessionOriginalSnapshotFromDto(bucket: Record<string, string>, p: PattiDTO | null | undefined): void {
  if (!p?.sellerId) return;
  const sid = String(p.sellerId).trim();
  if (!sid) return;
  const s = stringifyOriginalDataForHydration(p.originalData);
  if (s) bucket[sid] = s;
}

function clearSessionOriginalSnapshotsForSellerIds(bucket: Record<string, string>, ids: Iterable<string>): void {
  for (const raw of ids) {
    const sid = String(raw ?? '').trim();
    if (sid) delete bucket[sid];
  }
}

function readOriginalGrossForSellerId(
  sellerId: string,
  sessionJsonBySellerId: Record<string, string>,
  pattiDetail: PattiDTO | null,
): number | null {
  const sid = String(sellerId ?? '').trim();
  if (!sid) return null;
  const json = sessionJsonBySellerId[sid];
  if (json) {
    try {
      const g = grossAmountFromOriginalPayloadRecord(JSON.parse(json) as Record<string, unknown>);
      if (g != null) return g;
    } catch {
      /* ignore */
    }
  }
  if (pattiDetail && String(pattiDetail.sellerId ?? '').trim() === sid) {
    return grossAmountFromOriginalPayloadRecord(pattiDetail.originalData as Record<string, unknown>);
  }
  return null;
}

/** Same visual language as Billing commodity read-only cells (computed fields). */
const settlementReadOnlyCellClass =
  'h-9 lg:h-8 min-h-[2.25rem] px-2 lg:px-1.5 border border-dashed border-border/70 rounded-md bg-muted/50 text-muted-foreground inline-flex items-center justify-center w-full text-xs lg:text-[11px] cursor-not-allowed shadow-inner select-text tabular-nums';

/** Uniform editable expense amount fields (per seller). */
const settlementExpenseInputClass =
  'h-9 w-full min-w-[5.5rem] max-w-[6.75rem] rounded-md border border-border bg-background px-2 text-right text-xs tabular-nums shadow-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** Per-seller registration (Sales report): registered = linked to contact registry. */
interface SellerRegFormState {
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

/** True when the bill treats this seller as registry-backed (no manual Unregistered print confirmation needed). */
function isSettlementSellerPrintRegistered(form: SellerRegFormState): boolean {
  if (form.registered) return true;
  const cid = form.contactId;
  return cid != null && String(cid).trim() !== '';
}

/** Print allowed for registered (or linked-contact) sellers without checking Unregistered; otherwise requires `unregisteredPrintConfirmed`. */
function isSettlementSellerPrintAllowed(_seller: SellerSettlement, form: SellerRegFormState): boolean {
  if (isSettlementSellerPrintRegistered(form)) return true;
  return form.unregisteredPrintConfirmed === true;
}

function settlementSellerPrintGateMessage(seller: SellerSettlement, form: SellerRegFormState): string | null {
  if (isSettlementSellerPrintAllowed(seller, form)) return null;
  const name = (seller.sellerName || 'Seller').trim();
  const mark = (seller.sellerMark || '').trim();
  const label = mark ? `${name} – ${mark}` : name;
  return `${label}: check Unregistered to confirm printing for this non-registered seller.`;
}

interface SellerExpenseFormState {
  freight: number;
  unloading: number;
  weighman: number;
  cashAdvance: number;
  gunnies: number;
  others: number;
}

/** Vehicle-level expense lines (Add Expense modal). */
interface VehicleExpenseRow {
  id: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
  freight: number;
  unloading: number;
  weighing: number;
  gunnies: number;
}
type VehicleExpenseField = 'freight' | 'unloading' | 'weighing' | 'gunnies';
type VehicleExpenseFieldValues = Pick<VehicleExpenseRow, VehicleExpenseField>;

interface AddVoucherRowState {
  id?: number;
  localId: string;
  voucherName: string;
  forWhoName: string;
  description: string;
  expenseAmount: string;
}

/** Distribute total lot weight across entries (billing total or sum of entry weights). */
function distributeLotEntryWeights(lot: SettlementLot, totalW: number): number[] {
  const sumEw = lot.entries.reduce((s, e) => s + (Number(e.weight) || 0), 0);
  const qty = lot.entries.reduce((s, e) => s + (Number(e.quantity) || 0), 0);
  return lot.entries.map(e => {
    const ew = Number(e.weight) || 0;
    const q = Number(e.quantity) || 0;
    if (sumEw > 0) return (ew / sumEw) * totalW;
    if (qty > 0) return (q / qty) * totalW;
    return 0;
  });
}

/**
 * Lot-level Sales Patti row: amount = Σ (distributedWeight × rate per bag) / commodity divisor (same as Billing).
 */
function lotBaseSalesRow(
  lot: SettlementLot,
  divisor: number,
  settlementRateMode: 'original' | 'modified' = 'modified'
) {
  const div = divisor > 0 ? divisor : 50;
  const qty = lot.entries.reduce((s, e) => s + (Number(e.quantity) || 0), 0);
  const sumEntryW = lot.entries.reduce((s, e) => s + (Number(e.weight) || 0), 0);
  const bw = lot.billingWeightKg;
  const useBilling = bw != null && Number.isFinite(Number(bw)) && Number(bw) > 0;
  const weight = useBilling ? Number(bw) : sumEntryW;
  const itemLabel = lot.lotName || lot.commodityName || '—';
  if (qty <= 0 || weight <= 0) {
    return {
      itemLabel,
      qty,
      weight,
      avg: 0,
      ratePerBag: 0,
      amount: 0,
      divisor: div,
    };
  }
  const distW = distributeLotEntryWeights(lot, weight);
  let amount = 0;
  lot.entries.forEach((e, i) => {
    const w = distW[i] ?? 0;
    amount += (w * settlementEffectiveRatePerBag(e, settlementRateMode)) / div;
  });
  amount = roundMoney2(amount);
  const ratePerBag = weight > 0 ? roundMoney2((amount * div) / weight) : 0;
  const avg = qty > 0 ? weight / qty : 0;
  return {
    itemLabel,
    qty,
    weight,
    avg,
    ratePerBag,
    amount,
    divisor: div,
  };
}

/** User edits in Sales report table (per lot row). */
interface LotSalesOverride {
  qty?: number;
  weight?: number;
  /** Seller settlement rate per bag (₹/bag), aligned with Billing new-rate / divisor model. */
  ratePerBag?: number;
}

function hasLotSalesOverride(o: LotSalesOverride | undefined): boolean {
  if (!o) return false;
  return o.qty !== undefined || o.weight !== undefined || o.ratePerBag !== undefined;
}

/** Saved-patti-only extra lot rows (split bid), persisted in `extensionJson`. */
interface ExtraBidLot {
  id: string;
  lotName: string;
  commodityName: string;
  qty: number;
  weight: number;
  ratePerBag: number;
}

function parseExtraBidLotsArray(raw: unknown): ExtraBidLot[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtraBidLot[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const id = String(o.id ?? '').trim();
    if (!id) continue;
    const qty = Math.max(0, Math.round(Number(o.qty) || 0));
    const weight = Number(o.weight);
    const ratePerBag = Number(o.ratePerBag);
    if (!Number.isFinite(weight) || !Number.isFinite(ratePerBag)) continue;
    out.push({
      id,
      lotName: String(o.lotName ?? '').trim(),
      commodityName: String(o.commodityName ?? '').trim(),
      qty,
      weight: Math.max(0, weight),
      ratePerBag: Math.max(0, ratePerBag),
    });
  }
  return out;
}

function settlementLotFromExtraBid(e: ExtraBidLot): SettlementLot {
  return {
    lotId: e.id,
    lotName: e.lotName,
    commodityName: e.commodityName,
    arrivalBagCount: 0,
    billingWeightKg: null,
    entries: [
      {
        bidNumber: 0,
        buyerMark: '',
        buyerName: '',
        rate: e.ratePerBag,
        presetMargin: 0,
        quantity: e.qty,
        weight: e.weight,
      },
    ],
  };
}

type SettlementSalesTableRow =
  | { lot: SettlementLot; sid: string; isExtraBid: false }
  | { lot: SettlementLot; sid: string; isExtraBid: true; extraBid: ExtraBidLot };

const PATTI_EXTENSION_JSON_VERSION = 1 as const;

type PattiExtensionJsonV1 = {
  v: typeof PATTI_EXTENSION_JSON_VERSION;
  removedLotIds?: string[];
  lotOverrides?: Record<string, { weight?: number; ratePerBag?: number; qty?: number }>;
  extraBidLots?: ExtraBidLot[];
  /** Display order: `a:${lotStableId}` then `e:${extraId}`; omit when default (API lots then extras). */
  salesRowOrder?: string[];
  /** Persisted Sales report “Unregistered” print confirmation for this sub-patti. */
  unregisteredPrintConfirmed?: boolean;
};

function buildPattiExtensionJsonForSeller(
  sellerId: string,
  removedLotsBySellerId: Record<string, string[]>,
  lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride>>,
  extraBidLotsBySellerId: Record<string, ExtraBidLot[]>,
  unregisteredPrintConfirmed: boolean,
  salesRowOrderBySellerId?: Record<string, SalesRowOrderKey[]>,
  sellerForOrder?: SellerSettlement
): string | undefined {
  const removed = removedLotsBySellerId[sellerId] ?? [];
  const ov = lotSalesOverridesBySellerId[sellerId] ?? {};
  const slimOverrides: Record<string, { weight?: number; ratePerBag?: number; qty?: number }> = {};
  for (const [lotSid, v] of Object.entries(ov)) {
    if (!v) continue;
    const entry: { weight?: number; ratePerBag?: number; qty?: number } = {};
    if (v.weight !== undefined) entry.weight = v.weight;
    if (v.ratePerBag !== undefined) entry.ratePerBag = v.ratePerBag;
    if (v.qty !== undefined) entry.qty = v.qty;
    if (Object.keys(entry).length > 0) slimOverrides[lotSid] = entry;
  }
  const extraBidLots = extraBidLotsBySellerId[sellerId] ?? [];
  const storedOrder = salesRowOrderBySellerId?.[sellerId];
  let persistOrder: SalesRowOrderKey[] | undefined;
  if (storedOrder?.length && sellerForOrder) {
    const removedSet = new Set(removed);
    const def = buildDefaultSalesRowOrder(sellerForOrder, removedSet, extraBidLots);
    if (JSON.stringify(storedOrder) !== JSON.stringify(def)) {
      persistOrder = storedOrder;
    }
  }
  if (
    removed.length === 0 &&
    Object.keys(slimOverrides).length === 0 &&
    extraBidLots.length === 0 &&
    !unregisteredPrintConfirmed &&
    !persistOrder?.length
  ) {
    return undefined;
  }
  const payload: PattiExtensionJsonV1 = { v: PATTI_EXTENSION_JSON_VERSION };
  if (removed.length > 0) payload.removedLotIds = [...removed];
  if (Object.keys(slimOverrides).length > 0) payload.lotOverrides = slimOverrides;
  if (extraBidLots.length > 0) payload.extraBidLots = extraBidLots.map(e => ({ ...e }));
  if (persistOrder?.length) payload.salesRowOrder = [...persistOrder];
  if (unregisteredPrintConfirmed) payload.unregisteredPrintConfirmed = true;
  return JSON.stringify(payload);
}

function parsePattiExtensionJson(
  extensionJson: string | null | undefined
): {
  removedLotIds: string[];
  lotOverrides: Record<string, LotSalesOverride>;
  extraBidLots: ExtraBidLot[];
  salesRowOrder: SalesRowOrderKey[];
  unregisteredPrintConfirmed: boolean;
} | null {
  if (extensionJson == null || !String(extensionJson).trim()) return null;
  try {
    const parsed = JSON.parse(extensionJson) as PattiExtensionJsonV1;
    if (parsed.v !== PATTI_EXTENSION_JSON_VERSION) return null;
    const removedLotIds = Array.isArray(parsed.removedLotIds) ? parsed.removedLotIds.map(String) : [];
    const lotOverrides: Record<string, LotSalesOverride> = {};
    if (parsed.lotOverrides && typeof parsed.lotOverrides === 'object') {
      for (const [k, v] of Object.entries(parsed.lotOverrides)) {
        if (!v || typeof v !== 'object') continue;
        const o: LotSalesOverride = {};
        if (typeof v.weight === 'number' && Number.isFinite(v.weight)) o.weight = v.weight;
        if (typeof v.ratePerBag === 'number' && Number.isFinite(v.ratePerBag)) o.ratePerBag = v.ratePerBag;
        if (typeof v.qty === 'number' && Number.isFinite(v.qty)) o.qty = v.qty;
        if (hasLotSalesOverride(o)) lotOverrides[k] = o;
      }
    }
    const extraBidLots = parseExtraBidLotsArray(parsed.extraBidLots);
    const unregisteredPrintConfirmed = parsed.unregisteredPrintConfirmed === true;
    const rawOrder = Array.isArray(parsed.salesRowOrder)
      ? parsed.salesRowOrder.map(String).filter(Boolean)
      : [];
    return {
      removedLotIds,
      lotOverrides,
      extraBidLots,
      salesRowOrder: rawOrder as SalesRowOrderKey[],
      unregisteredPrintConfirmed,
    };
  } catch {
    return null;
  }
}

/** Merge API lot totals with optional user overrides. Amount = (weight × rate per bag) / divisor. */
function mergeLotDisplayRow(
  lot: SettlementLot,
  o: LotSalesOverride | undefined,
  divisor: number,
  settlementRateMode: 'original' | 'modified' = 'modified'
) {
  const base = lotBaseSalesRow(lot, divisor, settlementRateMode);
  if (!hasLotSalesOverride(o)) return base;
  const qty =
    o!.qty !== undefined && Number.isFinite(o!.qty) ? Math.max(0, Math.round(Number(o!.qty))) : base.qty;
  const weight = o!.weight !== undefined ? o!.weight : base.weight;
  const div = base.divisor;
  const ratePerBag =
    settlementRateMode === 'modified' && o!.ratePerBag !== undefined ? o!.ratePerBag : base.ratePerBag;
  const amount = roundMoney2((weight * ratePerBag) / div);
  const avg = qty > 0 ? weight / qty : 0;
  return {
    ...base,
    qty,
    weight,
    avg,
    ratePerBag,
    amount,
  };
}

type MainPattiPrintHeader = {
  sellerName: string;
  sellerMobile: string;
  sellerAddress: string;
  vehicleNumber: string;
} | null;

/**
 * Main vehicle patti: two printable payloads (ALT O vs ALT M detail rows / gross & net only).
 * Freight, weighing merge, and every deduction line use the same loop that legacy single-page
 * `printPayload` used (scope sellers → `sellerExpensesById` → `deductionTotals` → `deductions`); that block is not altered here beyond feeding one shared `printBase`.
 */
function buildMainVehiclePattiPrintPayloadPair(
  pattiData: PattiData,
  scopeSellers: SellerSettlement[],
  removedLotsBySellerId: Record<string, string[]>,
  lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride> | undefined>,
  extraBidLotsBySellerId: Record<string, ExtraBidLot[]>,
  getLotDivisor: (lot: SettlementLot) => number,
  vehicleNetPayableFromPatti: number,
  headerId: MainPattiPrintHeader,
  displayMainSalesPattiNo: string,
  firmInfo: PattiPrintData['firm'],
  sellerExpensesById: Record<string, SellerExpenseFormState>,
  isWeighingEnabledForSeller: (id: string) => boolean,
  isWeighingMergedIntoFreight: (id: string) => boolean
): { printPayloadOrig: PattiPrintData; printPayloadMod: PattiPrintData } {
  const detailRowsMod = buildMainVehiclePattiDetailRows(
    scopeSellers,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
    'modified',
  );
  const detailRowsOrig = buildMainVehiclePattiDetailRows(
    scopeSellers,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
    'original',
  );
  const totalBags = detailRowsMod.reduce((s, r) => s + (Number(r.bags) || 0), 0);
  const commodityNames = Array.from(
    new Set(
      scopeSellers.flatMap(s => [
        ...s.lots.map(l => String(l.commodityName || '').trim()).filter(Boolean),
        ...(extraBidLotsBySellerId[s.sellerId] ?? []).map(e => String(e.commodityName || '').trim()).filter(Boolean),
      ])
    )
  );
  const commodityName =
    commodityNames.length === 1
      ? commodityNames[0]
      : (commodityNames.length > 1 ? 'Mixed Commodity' : 'Commodity');
  const deductionTotals = {
    freight: 0,
    unloading: 0,
    weighing: 0,
    advance: 0,
    gunnies: 0,
    others: 0,
  };
  for (const seller of scopeSellers) {
    const exp = sellerExpensesById[seller.sellerId] ?? defaultSellerExpenses();
    const mergeIntoFreight = isWeighingMergedIntoFreight(seller.sellerId);
    if (isWeighingEnabledForSeller(seller.sellerId)) {
      if (mergeIntoFreight) {
        deductionTotals.freight += (Number(exp.freight) || 0) + (Number(exp.weighman) || 0);
      } else {
        deductionTotals.freight += Number(exp.freight) || 0;
        deductionTotals.weighing += Number(exp.weighman) || 0;
      }
    } else {
      deductionTotals.freight += Number(exp.freight) || 0;
    }
    deductionTotals.unloading += Number(exp.unloading) || 0;
    deductionTotals.advance += Number(exp.cashAdvance) || 0;
    deductionTotals.gunnies += Number(exp.gunnies) || 0;
    deductionTotals.others += Number(exp.others) || 0;
  }
  const deductions: PattiPrintData['deductions'] = [
    { key: 'freight', label: 'Freight', amount: roundMoney2(deductionTotals.freight) },
    { key: 'coolie', label: 'Unloading', amount: roundMoney2(deductionTotals.unloading) },
    ...(deductionTotals.weighing > 0
      ? [{ key: 'weighing', label: 'Weighing', amount: roundMoney2(deductionTotals.weighing) }]
      : []),
    { key: 'advance', label: 'Cash Advance', amount: roundMoney2(deductionTotals.advance) },
    { key: 'gunnies', label: 'Gunnies', amount: roundMoney2(deductionTotals.gunnies) },
    { key: 'others', label: 'Others', amount: roundMoney2(deductionTotals.others) },
  ];
  const primarySeller = scopeSellers[0];
  const totalDeductions = roundMoney2(deductions.reduce((s, d) => s + d.amount, 0));
  const grossMod = roundMoney2(detailRowsMod.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const grossOrig = roundMoney2(detailRowsOrig.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const netMod = roundMoney2(vehicleNetPayableFromPatti);
  const netOrig = roundMoney2(grossOrig - totalDeductions);
  const printBase: PattiPrintData = {
    ...pattiData,
    sellerName: headerId?.sellerName || pattiData.sellerName || primarySeller.sellerName,
    sellerMobile: headerId?.sellerMobile || '',
    sellerAddress: headerId?.sellerAddress || '',
    vehicleNumber: headerId?.vehicleNumber || '',
    pattiNoDisplay: mainPattiNumberForDisplay(displayMainSalesPattiNo, pattiData.pattiId),
    commodityName,
    totalBags,
    deductions,
    totalDeductions,
    firm: firmInfo,
  };
  return {
    printPayloadOrig: {
      ...printBase,
      detailRows: detailRowsOrig,
      grossAmount: grossOrig,
      rateClusters: [],
      netPayable: netOrig,
    },
    printPayloadMod: {
      ...printBase,
      detailRows: detailRowsMod,
      grossAmount: grossMod,
      rateClusters: pattiData.rateClusters,
      netPayable: netMod,
    },
  };
}

/** All sellers on the vehicle: detail rows for main patti print (per rate mode). */
function buildMainVehiclePattiDetailRows(
  scopeSellers: SellerSettlement[],
  removedLotsBySellerId: Record<string, string[]>,
  lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride> | undefined>,
  extraBidLotsBySellerId: Record<string, ExtraBidLot[]>,
  getLotDivisor: (lot: SettlementLot) => number,
  mode: 'original' | 'modified'
): { mark: string; bags: number; weight: number; rate: number; amount: number }[] {
  return scopeSellers.flatMap(seller => {
    const removedSet = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
    const lotOverrides = lotSalesOverridesBySellerId[seller.sellerId];
    const fromApi = seller.lots.flatMap((lot, lotIndex) => {
      const sid = lotStableId(lot, lotIndex);
      if (removedSet.has(sid)) return [];
      const row = mergeLotDisplayRow(lot, lotOverrides?.[sid], getLotDivisor(lot), mode);
      return [
        {
          mark: (seller.sellerMark || '-').trim() || '-',
          bags: Number(row.qty) || 0,
          weight: Number(row.weight) || 0,
          rate: Number(row.ratePerBag) || 0,
          amount: Number(row.amount) || 0,
        },
      ];
    });
    const extras = extraBidLotsBySellerId[seller.sellerId] ?? [];
    const fromExtra = extras.map(e => {
      const lot = settlementLotFromExtraBid(e);
      const row = mergeLotDisplayRow(lot, undefined, getLotDivisor(lot), mode);
      return {
        mark: (seller.sellerMark || '-').trim() || '-',
        bags: Number(row.qty) || 0,
        weight: Number(row.weight) || 0,
        rate: Number(row.ratePerBag) || 0,
        amount: Number(row.amount) || 0,
      };
    });
    return [...fromApi, ...fromExtra];
  });
}

/** Stable row id for delete/hide when `lotId` is missing from API. */
function lotStableId(lot: SettlementLot, index: number): string {
  if (lot.lotId && String(lot.lotId).trim()) return String(lot.lotId).trim();
  return `__idx_${index}_${encodeURIComponent(lot.lotName || '')}_${encodeURIComponent(lot.commodityName || '')}`;
}

type SalesRowOrderKey = string;

function salesRowKeyApi(sid: string): SalesRowOrderKey {
  return `a:${sid}`;
}

function salesRowKeyExtra(id: string): SalesRowOrderKey {
  return `e:${id}`;
}

function parseSalesRowOrderKey(k: string): { type: 'api'; sid: string } | { type: 'extra'; id: string } | null {
  if (k.startsWith('a:')) return { type: 'api', sid: k.slice(2) };
  if (k.startsWith('e:')) return { type: 'extra', id: k.slice(2) };
  return null;
}

function newExtraBidLotId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `eb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildDefaultSalesRowOrder(
  seller: SellerSettlement,
  removedSet: Set<string>,
  extraLots: ExtraBidLot[]
): SalesRowOrderKey[] {
  const keys: SalesRowOrderKey[] = [];
  for (let i = 0; i < (seller.lots ?? []).length; i++) {
    const lot = seller.lots![i];
    const sid = lotStableId(lot, i);
    if (removedSet.has(sid)) continue;
    keys.push(salesRowKeyApi(sid));
  }
  for (const e of extraLots) keys.push(salesRowKeyExtra(e.id));
  return keys;
}

function sanitizeSalesRowOrder(
  order: SalesRowOrderKey[] | undefined,
  seller: SellerSettlement,
  removedSet: Set<string>,
  extraLots: ExtraBidLot[]
): SalesRowOrderKey[] {
  const fallback = buildDefaultSalesRowOrder(seller, removedSet, extraLots);
  const validApi = new Set(
    (seller.lots ?? [])
      .map((lot, i) => lotStableId(lot, i))
      .filter(sid => !removedSet.has(sid))
  );
  const validExtra = new Set(extraLots.map(e => e.id));
  if (!order?.length) return fallback;
  const seen = new Set<SalesRowOrderKey>();
  const out: SalesRowOrderKey[] = [];
  for (const k of order) {
    const p = parseSalesRowOrderKey(k);
    if (!p) continue;
    if (p.type === 'api' && validApi.has(p.sid) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
    if (p.type === 'extra' && validExtra.has(p.id) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of fallback) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

/** Cancel payload for inline split transaction (revert to single row). */
type SplitCancelRestore =
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
type SplitGroupSnapshot = {
  splitGroupId: string;
  sellerId: string;
  rowKeyA: SalesRowOrderKey;
  rowKeyB: SalesRowOrderKey;
  totalQty: number;
  totalWeight: number;
  isEditing: boolean;
  cancelRestore: SplitCancelRestore;
};

function splitGroupHasRowKey(g: SplitGroupSnapshot, k: SalesRowOrderKey): boolean {
  return g.rowKeyA === k || g.rowKeyB === k;
}

function getSalesRowKeyForTableRow(isExtraBid: boolean, sid: string): SalesRowOrderKey {
  return isExtraBid ? salesRowKeyExtra(sid) : salesRowKeyApi(sid);
}

function addSlabChargesForLotWeight(
  lot: SettlementLot,
  actualW: number,
  nameToId: Map<string, number>,
  configById: Map<number, FullCommodityConfigDto>
): { unloading: number; weighing: number } {
  let unloading = 0;
  let weighing = 0;
  const cname = (lot.commodityName || '').trim();
  if (!cname) return { unloading, weighing };
  const cid = nameToId.get(cname.toLowerCase());
  if (cid == null) return { unloading, weighing };
  const full = configById.get(cid);
  if (!full?.config) return { unloading, weighing };

  const slabs = [...(full.hamaliSlabs ?? [])].sort((a, b) => a.thresholdWeight - b.thresholdWeight);
  const slab = slabs[0];
  if (slab && slab.thresholdWeight > 0) {
    unloading += computeSlabChargeTotal(actualW, slab.fixedRate, slab.thresholdWeight);
  }

  const cfg = full.config;
  const wTh = cfg.weighingThreshold ?? 0;
  const wCh = cfg.weighingCharge ?? 0;
  if (wTh > 0) {
    weighing += computeSlabChargeTotal(actualW, wCh, wTh);
  }
  return { unloading, weighing };
}

/** Lot-level unloading (hamali slab) + weighing (commodity threshold/charge) using Sales report weights. */
function sumLotSlabChargesForSeller(
  seller: SellerSettlement,
  extraBidLots: ExtraBidLot[],
  removed: Set<string>,
  lotOv: Record<string, LotSalesOverride>,
  nameToId: Map<string, number>,
  configById: Map<number, FullCommodityConfigDto>,
  getDivisor: (lot: SettlementLot) => number
): { unloading: number; weighing: number } {
  let unloading = 0;
  let weighing = 0;
  seller.lots.forEach((lot, i) => {
    const sid = lotStableId(lot, i);
    if (removed.has(sid)) return;
    const merged = mergeLotDisplayRow(lot, lotOv[sid], getDivisor(lot));
    const actualW = merged.weight;
    const add = addSlabChargesForLotWeight(lot, actualW, nameToId, configById);
    unloading += add.unloading;
    weighing += add.weighing;
  });
  for (const e of extraBidLots) {
    const lot = settlementLotFromExtraBid(e);
    const merged = mergeLotDisplayRow(lot, undefined, getDivisor(lot));
    const add = addSlabChargesForLotWeight(lot, merged.weight, nameToId, configById);
    unloading += add.unloading;
    weighing += add.weighing;
  }
  return { unloading, weighing };
}

/**
 * Recompute commodity weighing slab total for a patti row (extensionJson + seller lots).
 * Used when hydrating legacy saves that merged weighing into `freight` with no `weighing` deduction line.
 */
function inferWeighmanSlabHintForPattiHydration(
  p: PattiDTO,
  sellers: SellerSettlement[],
  commodityList: Commodity[],
  fullCommodityConfigs: FullCommodityConfigDto[],
  getLotDivisor: (lot: SettlementLot) => number
): number | undefined {
  const sidKey = String(p.sellerId ?? '').trim();
  if (!sidKey) return undefined;
  const sellerModel =
    sellers.find(s => s.sellerId === sidKey) ??
    ({
      sellerId: sidKey,
      sellerName: (p.sellerName ?? '').trim(),
      sellerMark: '',
      vehicleNumber: '',
      lots: [],
    } as SellerSettlement);
  const parsed = parsePattiExtensionJson(p.extensionJson);
  const removed = new Set(parsed?.removedLotIds ?? []);
  const lotOv = parsed?.lotOverrides ?? {};
  const extraLots = parsed?.extraBidLots ?? [];
  if ((sellerModel.lots?.length ?? 0) === 0 && extraLots.length === 0) return undefined;
  const nameToId = new Map<string, number>();
  for (const c of commodityList) {
    const name = String(c.commodity_name ?? '').trim().toLowerCase();
    const id = Number(c.commodity_id);
    if (name && Number.isFinite(id)) nameToId.set(name, id);
  }
  const configById = new Map(fullCommodityConfigs.map(c => [c.commodityId, c]));
  const { weighing } = sumLotSlabChargesForSeller(
    sellerModel,
    extraLots,
    removed,
    lotOv,
    nameToId,
    configById,
    getLotDivisor
  );
  const w = roundMoney2(weighing);
  return w > 0 ? w : undefined;
}

/** Per-seller slab sums + qty/weight for vehicle; shared by Quick Adjustment modal and expense auto-pull. */
function buildSellerSlabChargeBaseForPattiSellers(
  arrivalSellersForPatti: SellerSettlement[],
  removedLotsBySellerId: Record<string, string[]>,
  lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride>>,
  extraBidLotsBySellerId: Record<string, ExtraBidLot[]>,
  nameToId: Map<string, number>,
  configById: Map<number, FullCommodityConfigDto>,
  getDivisor: (lot: SettlementLot) => number
): Array<{
  sellerId: string;
  sellerName: string;
  quantity: number;
  unloading: number;
  weighing: number;
  actualWeight: number;
}> {
  return arrivalSellersForPatti.map(s => {
    const removed = new Set(removedLotsBySellerId[s.sellerId] ?? []);
    const lotOv = lotSalesOverridesBySellerId[s.sellerId] ?? {};
    const extras = extraBidLotsBySellerId[s.sellerId] ?? [];
    const { unloading, weighing } = sumLotSlabChargesForSeller(
      s,
      extras,
      removed,
      lotOv,
      nameToId,
      configById,
      getDivisor
    );
    const actualWeight =
      s.lots.reduce((sum, lot, i) => {
        const sid = lotStableId(lot, i);
        if (removed.has(sid)) return sum;
        const merged = mergeLotDisplayRow(lot, lotOv[sid], getDivisor(lot));
        return sum + (Number(merged.weight) || 0);
      }, 0) +
      extras.reduce((sum, e) => {
        const lot = settlementLotFromExtraBid(e);
        const merged = mergeLotDisplayRow(lot, undefined, getDivisor(lot));
        return sum + (Number(merged.weight) || 0);
      }, 0);
    const qty = Math.max(
      0,
      Math.round(
        s.lots.reduce((sum, lot, i) => {
          const sid = lotStableId(lot, i);
          if (removed.has(sid)) return sum;
          const merged = mergeLotDisplayRow(lot, lotOv[sid], getDivisor(lot));
          return sum + (Number(merged.qty) || 0);
        }, 0) +
          extras.reduce((sum, e) => {
            const lot = settlementLotFromExtraBid(e);
            const merged = mergeLotDisplayRow(lot, undefined, getDivisor(lot));
            return sum + (Number(merged.qty) || 0);
          }, 0)
      )
    );
    return {
      sellerId: s.sellerId,
      sellerName: s.sellerName || 'Seller',
      quantity: qty,
      unloading,
      weighing,
      actualWeight,
    };
  });
}

function buildRateClustersFromSellerLots(
  seller: SellerSettlement,
  removedIds: Set<string>,
  lotOverrides?: Record<string, LotSalesOverride>,
  getDivisor?: (lot: SettlementLot) => number,
  extraBidLots?: ExtraBidLot[],
  settlementRateMode: 'original' | 'modified' = 'modified'
): RateCluster[] {
  const divFn = getDivisor ?? (() => 50);
  const rateMap = new Map<number, RateCluster>();
  const pushRow = (row: ReturnType<typeof mergeLotDisplayRow>) => {
    const ratePerBag = row.ratePerBag;
    const qty = row.qty;
    const weight = row.weight;
    const amount = row.amount;
    const existing = rateMap.get(ratePerBag);
    if (existing) {
      existing.totalQuantity += qty;
      existing.totalWeight += weight;
      existing.amount += amount;
    } else {
      rateMap.set(ratePerBag, {
        rate: ratePerBag,
        totalQuantity: qty,
        totalWeight: weight,
        amount,
      });
    }
  };
  seller.lots.forEach((lot, i) => {
    const sid = lotStableId(lot, i);
    if (removedIds.has(sid)) return;
    const ov = lotOverrides?.[sid];
    pushRow(mergeLotDisplayRow(lot, ov, divFn(lot), settlementRateMode));
  });
  for (const e of extraBidLots ?? []) {
    const lot = settlementLotFromExtraBid(e);
    pushRow(mergeLotDisplayRow(lot, undefined, divFn(lot), settlementRateMode));
  }
  return Array.from(rateMap.values()).sort((a, b) => b.rate - a.rate);
}

function defaultSellerExpenses(): SellerExpenseFormState {
  return { freight: 0, unloading: 0, weighman: 0, cashAdvance: 0, gunnies: 0, others: 0 };
}

/** Quick Adjustment: amounts from expense card; quantities/names from slab base rows. */
function rowsFromExpenseCardAndSlabQuantities(
  sellerComputedBase: Array<{ sellerId: string; sellerName: string; quantity: number }>,
  sellerExpensesById: Record<string, SellerExpenseFormState>
): VehicleExpenseRow[] {
  return sellerComputedBase.map(s => {
    const exp = sellerExpensesById[s.sellerId] ?? defaultSellerExpenses();
    return {
      id: `ve_${s.sellerId}`,
      sellerId: s.sellerId,
      sellerName: s.sellerName,
      quantity: s.quantity,
      freight: roundMoney2(exp.freight),
      unloading: roundMoney2(exp.unloading),
      weighing: roundMoney2(exp.weighman),
      gunnies: roundMoney2(exp.gunnies),
    };
  });
}

/** Fresh slab + bag distribution only (no DB hydrate, no expense-card freight/unloading/weighing). Gunnies kept per seller from `gunniesBySellerId`. */
function buildVehicleExpenseRowsComputedFromSlabs(
  sellerComputedBase: Array<{
    sellerId: string;
    sellerName: string;
    quantity: number;
    unloading: number;
    weighing: number;
    actualWeight: number;
  }>,
  freightTotal: number,
  equalShareFreight: number,
  gunniesBySellerId: Record<string, number>
): VehicleExpenseRow[] {
  const nSellers = sellerComputedBase.length;
  const totalActualWeightOnSettlement = sellerComputedBase.reduce((sum, s) => sum + s.actualWeight, 0);
  const perKgFreight = totalActualWeightOnSettlement > 0 ? freightTotal / totalActualWeightOnSettlement : 0;
  const unloadingTotal = sellerComputedBase.reduce((sum, s) => sum + (Number(s.unloading) || 0), 0);
  const weighingTotal = sellerComputedBase.reduce((sum, s) => sum + (Number(s.weighing) || 0), 0);
  const totalQtyOnSettlement = sellerComputedBase.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
  const perBagUnloading = totalQtyOnSettlement > 0 ? unloadingTotal / totalQtyOnSettlement : 0;
  const perBagWeighing = totalQtyOnSettlement > 0 ? weighingTotal / totalQtyOnSettlement : 0;
  const equalShareUnloading = nSellers > 0 ? unloadingTotal / nSellers : 0;
  const equalShareWeighing = nSellers > 0 ? weighingTotal / nSellers : 0;

  return sellerComputedBase.map(s => {
    const freight = roundMoney2(
      perKgFreight > 0 ? perKgFreight * s.actualWeight : equalShareFreight
    );
    const unloading = roundMoney2(
      perBagUnloading > 0
        ? perBagUnloading * s.quantity
        : equalShareUnloading > 0
          ? equalShareUnloading
          : s.unloading
    );
    const weighing = roundMoney2(
      perBagWeighing > 0
        ? perBagWeighing * s.quantity
        : equalShareWeighing > 0
          ? equalShareWeighing
          : s.weighing
    );
    return {
      id: `ve_${s.sellerId}`,
      sellerId: s.sellerId,
      sellerName: s.sellerName,
      quantity: s.quantity,
      freight,
      unloading,
      weighing,
      gunnies: roundMoney2(gunniesBySellerId[s.sellerId] ?? 0),
    };
  });
}

function vehicleExpenseOriginalsFromRows(rows: VehicleExpenseRow[]): Record<string, VehicleExpenseFieldValues> {
  return rows.reduce<Record<string, VehicleExpenseFieldValues>>((acc, row) => {
    acc[row.id] = {
      freight: row.freight,
      unloading: row.unloading,
      weighing: row.weighing,
      gunnies: row.gunnies,
    };
    return acc;
  }, {});
}

function moneyNearEqual(a: number, b: number): boolean {
  return Math.abs(roundMoney2(a) - roundMoney2(b)) < 0.005;
}

/** Main vehicle patti number for print (e.g. "16"), not seller sub-card "16-2". */
function mainPattiNumberForDisplay(displayMainFromMemo: string, pattiId: string): string {
  const d = String(displayMainFromMemo || '').trim();
  if (d) return d;
  const raw = String(pattiId || '').trim();
  const m = raw.match(/^(.*)-\d+$/);
  return (m ? m[1] : raw) || '-';
}

function buildSellerSubPattiPrintData(
  seller: SellerSettlement,
  displayName: string,
  expenses: SellerExpenseFormState,
  removedIds: Set<string>,
  pattiId: string,
  createdAt: string,
  lotOverrides?: Record<string, LotSalesOverride>,
  getDivisor?: (lot: SettlementLot) => number,
  weighingEnabled = true,
  mergeWeighingIntoFreight = true,
  sellerMobile = '',
  sellerPattiNoForPrint = '',
  extraBidLots: ExtraBidLot[] = [],
  settlementRateMode: 'original' | 'modified' = 'modified'
): PattiPrintData {
  const divisorFn = getDivisor ?? (() => 50);
  const lotRowsFromApi = seller.lots.flatMap((lot, lotIndex) => {
    const sid = lotStableId(lot, lotIndex);
    if (removedIds.has(sid)) return [];
    const ov = lotOverrides?.[sid];
    const row = mergeLotDisplayRow(lot, ov, divisorFn(lot), settlementRateMode);
    return [{
      mark: (seller.sellerMark || '-').trim() || '-',
      bags: Number(row.qty) || 0,
      weight: Number(row.weight) || 0,
      rate: Number(row.ratePerBag) || 0,
      amount: Number(row.amount) || 0,
    }];
  });
  const lotRowsFromExtra = extraBidLots.map(e => {
    const lot = settlementLotFromExtraBid(e);
    const row = mergeLotDisplayRow(lot, undefined, divisorFn(lot), settlementRateMode);
    return {
      mark: (seller.sellerMark || '-').trim() || '-',
      bags: Number(row.qty) || 0,
      weight: Number(row.weight) || 0,
      rate: Number(row.ratePerBag) || 0,
      amount: Number(row.amount) || 0,
    };
  });
  const lotRows = [...lotRowsFromApi, ...lotRowsFromExtra];

  const rateClusters = buildRateClustersFromSellerLots(
    seller,
    removedIds,
    lotOverrides,
    getDivisor,
    extraBidLots,
    settlementRateMode
  );
  const grossAmount = lotRows.reduce((s, r) => s + r.amount, 0);
  const merged = weighingEnabled && mergeWeighingIntoFreight;
  let freightAmount = expenses.freight;
  let weighingAmount = 0;
  if (weighingEnabled) {
    if (merged) {
      freightAmount += expenses.weighman;
    } else {
      weighingAmount = expenses.weighman;
    }
  }

  const deductions = [
    {
      key: 'freight',
      label: merged ? 'Freight Amount (incl. weighing)' : 'Freight Amount',
      amount: freightAmount,
      autoPulled: false,
    },
    { key: 'unloading', label: 'Unloading Charges', amount: expenses.unloading, autoPulled: false },
    { key: 'advance', label: 'Cash Advance', amount: expenses.cashAdvance, autoPulled: false },
    { key: 'gunnies', label: 'Gunnies', amount: expenses.gunnies, autoPulled: false },
    { key: 'others', label: 'Others', amount: expenses.others, autoPulled: false },
  ];
  if (weighingEnabled && !merged) {
    deductions.splice(2, 0, { key: 'weighing', label: 'Weighing Charges', amount: weighingAmount, autoPulled: false });
  }

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const subLabel = pattiId ? `${pattiId} · Sub` : 'Sub-patti';
  const displayNo = String(sellerPattiNoForPrint || '').trim();
  const commodityNames = Array.from(
    new Set([
      ...seller.lots.map(l => String(l.commodityName || '').trim()).filter(Boolean),
      ...extraBidLots.map(e => String(e.commodityName || '').trim()).filter(Boolean),
    ]),
  );
  const commodityName = commodityNames.length === 1
    ? commodityNames[0]
    : (commodityNames.length > 1 ? 'Mixed Commodity' : 'Commodity');
  const totalBags = lotRows.reduce((s, r) => s + r.bags, 0);

  return {
    pattiId: subLabel,
    pattiNoDisplay: displayNo || undefined,
    sellerName: displayName,
    sellerMobile,
    sellerAddress: seller.fromLocation || '',
    vehicleNumber: seller.vehicleNumber || '',
    commodityName,
    totalBags,
    detailRows: lotRows,
    rateClusters,
    grossAmount,
    deductions,
    totalDeductions,
    netPayable: grossAmount - totalDeductions,
    createdAt,
    useAverageWeight: false,
  };
}

function defaultSellerForm(seller: SellerSettlement): SellerRegFormState {
  const linked = seller.contactId != null && String(seller.contactId).trim() !== '';
  return {
    registrationChosen: false,
    registered: false,
    contactId: linked ? String(seller.contactId) : null,
    replacementSellerId: null,
    mark: seller.sellerMark || '',
    name: seller.sellerName || '',
    mobile: (seller.sellerPhone ?? '').trim(),
    contactSearchQuery: '',
    addAndChangeSeller: false,
    allowRegisteredEdit: false,
    unregisteredPrintConfirmed: false,
  };
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const SettlementPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const { trader } = useAuth();
  const canView = canAccessModule('Settlement');
  if (!canView) {
    return <ForbiddenPage moduleName="Settlement" />;
  }
  const [sellers, setSellers] = useState<SellerSettlement[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<SellerSettlement | null>(null);
  const [selectedArrivalSellerIds, setSelectedArrivalSellerIds] = useState<string[]>([]);
  const [draftMainPattiNo, setDraftMainPattiNo] = useState('');
  const [draftPattiNoBySellerId, setDraftPattiNoBySellerId] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [settlementMainTab, setSettlementMainTab] = useState<'arrival-summary' | 'create-settlements'>('arrival-summary');
  const [arrivalSummaryTab, setArrivalSummaryTab] = useState<'new-patti' | 'in-progress-patti' | 'saved-patti'>('new-patti');
  const [inProgressPattiDtos, setInProgressPattiDtos] = useState<PattiDTO[]>([]);
  /** Drives Sales Patti header subtitle: new vs draft vs completed edit. */
  const [settlementFormMode, setSettlementFormMode] = useState<'idle' | 'new' | 'in-progress' | 'saved'>('idle');
  /** Bumps when dirty baseline ref is synced so `isSettlementDirty` recomputes (refs alone do not render). */
  const [settlementDirtyNonce, setSettlementDirtyNonce] = useState(0);
  /** Bumps when async patti hydration finishes so baseline effect can capture a full workspace snapshot once. */
  const [settlementWorkspaceHydrateEpoch, setSettlementWorkspaceHydrateEpoch] = useState(0);
  /** Bumps after multi-seller patti load hydrates per-seller `originalData` into session ref (refs alone do not render). */
  const [pattiOriginalHydrationNonce, setPattiOriginalHydrationNonce] = useState(0);

  // Patti state
  const [pattiData, setPattiData] = useState<PattiData | null>(null);
  /** DB row id per settlement seller — supports multi-seller saves without overwriting another seller's patti. */
  const [existingPattiIdBySellerId, setExistingPattiIdBySellerId] = useState<Record<string, number>>({});
  const [savedPattis, setSavedPattis] = useState<PattiDTO[]>([]);
  /** Full DTO from API. */
  const [pattiDetailDto, setPattiDetailDto] = useState<PattiDTO | null>(null);
  const [isLatestEditUnlocked, setIsLatestEditUnlocked] = useState(true);
  /** Alt+O: show immutable original snapshot (read-only). */
  const [isOriginalReferenceMode, setIsOriginalReferenceMode] = useState(false);
  /** Per seller: JSON string of first-open patti body for create / one-time server original. */
  const sessionOriginalSnapshotJsonBySellerIdRef = useRef<Record<string, string>>({});
  const originalReferenceStashRef = useRef<{
    pattiData: PattiData;
    sellerExpensesById: Record<string, SellerExpenseFormState>;
    lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride>>;
    removedLotsBySellerId: Record<string, string[]>;
    extraBidLotsBySellerId: Record<string, ExtraBidLot[]>;
    salesReportRowOrderBySellerId: Record<string, SalesRowOrderKey[]>;
    sellerFormById: Record<string, SellerRegFormState>;
    coolieMode: 'FLAT' | 'RECALCULATED';
    settlementWeighingEnabledBySellerId: Record<string, boolean>;
    settlementWeighingMergeIntoFreightBySellerId: Record<string, boolean>;
    gunniesAmount: number;
    sellerExpenseRestoreBaselineById: Record<string, SellerExpenseFormState>;
  } | null>(null);
  /** Expand/collapse for saved-patti workspace vs original compare footer (after Alt+M unlock). */
  const [originalCompareFooterExpanded, setOriginalCompareFooterExpanded] = useState(true);
  const settlementDirtyBaselineRef = useRef<string | null>(null);
  /** True while `openPattiForEdit` is applying multi-step / awaited hydration — blocks premature dirty baseline capture. */
  const settlementWorkspaceHydratingRef = useRef(false);
  /** Latest workspace JSON for deferred dirty baseline sync after save (must match `settlementWorkspaceSnapshot`). */
  const settlementWorkspaceSnapshotRef = useRef<string>('');
  /** Fresh arrival-freight totals when applying expense auto-pull (avoid re-running the effect when only this changes). */
  const amountSummaryForExpensePullRef = useRef<{ arrivalFreightAmount: number; freightInvoiced: number; payableInvoiced: number }>({
    arrivalFreightAmount: 0,
    freightInvoiced: 0,
    payableInvoiced: 0,
  });
  /** Prevents repeated auto-pull overwrites for the same open patti (invoice filter / amount API must not wipe user edits). */
  const lastExpenseAutoPullKeyRef = useRef<string>('');
  const [loadingPattis, setLoadingPattis] = useState(false);
  const [coolieMode, setCoolieMode] = useState<'FLAT' | 'RECALCULATED'>('FLAT');
  /**
   * Toggle 1 (per seller): Use weighman — when OFF, weighing excluded from totals for that seller; amounts stay in state.
   * When ON, see Add to freight for merged vs line item. Missing key = ON (same default as Add to freight).
   */
  const [settlementWeighingEnabledBySellerId, setSettlementWeighingEnabledBySellerId] = useState<Record<string, boolean>>({});
  /**
   * Toggle 2 (per seller): Add to freight — when ON (default), weighing is merged into the Freight line for that seller.
   * Independent of Use weighman; only affects layout/totals when Use weighman is ON.
   */
  const [settlementWeighingMergeIntoFreightBySellerId, setSettlementWeighingMergeIntoFreightBySellerId] = useState<
    Record<string, boolean>
  >({});
  const [gunniesAmount, setGunniesAmount] = useState(0);
  /** Per seller: `false` = expanded; missing/`true` = collapsed (default collapsed). */
  const [salesReportCollapsedBySellerId, setSalesReportCollapsedBySellerId] = useState<Record<string, boolean>>({});
  const [showPrint, setShowPrint] = useState(false);
  const [settlementPaperWithHeader, setSettlementPaperWithHeader] = useState<'A4' | 'A5'>('A4');
  const [settlementPaperWithoutHeader, setSettlementPaperWithoutHeader] = useState<'A4' | 'A5'>('A4');
  const [settlementIncludeHeader, setSettlementIncludeHeader] = useState(true);
  const settlementEffectivePrintSize = useMemo(
    () => (settlementIncludeHeader ? settlementPaperWithHeader : settlementPaperWithoutHeader),
    [settlementIncludeHeader, settlementPaperWithHeader, settlementPaperWithoutHeader],
  );
  const [settlementPrintCopyLabels, setSettlementPrintCopyLabels] = useState<string[]>(['ORIGINAL COPY']);
  const settlementCopyLabelsResolved = useMemo(
    () => (settlementPrintCopyLabels.length > 0 ? settlementPrintCopyLabels : ['ORIGINAL COPY']),
    [settlementPrintCopyLabels],
  );
  /** Prevents overlapping save/update requests (buttons + shortcut). */
  const pattiSaveBusyRef = useRef(false);
  /** After a successful save, re-baseline dirty tracking once `pattiSaveBusy` is false and state has settled. */
  const resyncBaselineAfterSaveRef = useRef(false);
  /** True after quick-adjustment apply; prevents background bootstrap from overriding manual values. */
  const quickAdjustmentAppliedRef = useRef(false);
  const [pattiSaveBusy, setPattiSaveBusy] = useState(false);

  /** Arrival freight + billing aggregates (invoiced freight & payable); optional invoice name filter. */
  const [amountSummaryFromApi, setAmountSummaryFromApi] = useState({
    arrivalFreightAmount: 0,
    freightInvoiced: 0,
    payableInvoiced: 0,
  });
  const [arrivalFreightBaseline, setArrivalFreightBaseline] = useState(0);
  const [salesPadNetWeightBaseline, setSalesPadNetWeightBaseline] = useState(0);
  const [auctionAmountBaseline, setAuctionAmountBaseline] = useState(0);
  const [auctionQtyBaseline, setAuctionQtyBaseline] = useState(0);
  const [auctionWeightBaseline, setAuctionWeightBaseline] = useState(0);
  const [invoiceNameSearch, setInvoiceNameSearch] = useState('');
  const debouncedInvoiceName = useDebouncedValue(invoiceNameSearch, 300);

  const [amountSummaryNonce, setAmountSummaryNonce] = useState(0);
  const firmInfo = useMemo(() => trader ? ({
    businessName: trader.business_name,
    ownerName: trader.owner_name,
    address: trader.address,
    city: trader.city,
    state: trader.state,
    pinCode: trader.pin_code,
    category: trader.category,
    rmcApmcCode: trader.rmc_apmc_code,
    mobile: trader.mobile,
    email: trader.email,
  }) : null, [trader]);

  useEffect(() => {
    const loadPrintSetting = async () => {
      try {
        const list = await printSettingsApi.list();
        const row = list.find((item) => item.module_key === 'SETTLEMENT');
        if (row) {
          setSettlementPaperWithHeader(row.paper_size_with_header === 'A5' ? 'A5' : 'A4');
          setSettlementPaperWithoutHeader(row.paper_size_without_header === 'A5' ? 'A5' : 'A4');
          setSettlementIncludeHeader(row.include_header !== false);
          setSettlementPrintCopyLabels(parsePrintCopiesJson(row.print_copies_json ?? null).map((c) => c.label));
        }
      } catch {
        // keep defaults
      }
    };
    void loadPrintSetting();
  }, []);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') setAmountSummaryNonce(n => n + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const amountSummarySellerId = useMemo(() => {
    if (selectedSeller?.sellerId) return selectedSeller.sellerId;
    if (!selectedSeller) return '';
    const vKey = normalizeVehicleKey(selectedSeller.vehicleNumber);
    if (!vKey) return '';
    const candidate = sellers.find(s => normalizeVehicleKey(s.vehicleNumber) === vKey && !!s.sellerId);
    return candidate?.sellerId ?? '';
  }, [selectedSeller, sellers]);

  useEffect(() => {
    if (!amountSummarySellerId) {
      setAmountSummaryFromApi({ arrivalFreightAmount: 0, freightInvoiced: 0, payableInvoiced: 0 });
      return;
    }
    let cancelled = false;
    settlementApi
      .getSettlementAmountSummary(amountSummarySellerId, debouncedInvoiceName.trim() || undefined)
      .then(data => {
        if (!cancelled) setAmountSummaryFromApi(data);
      })
      .catch(() => {
        if (!cancelled) {
          setAmountSummaryFromApi({ arrivalFreightAmount: 0, freightInvoiced: 0, payableInvoiced: 0 });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [amountSummarySellerId, debouncedInvoiceName, amountSummaryNonce]);

  /** Lot IDs removed from UI per seller (pending API sync). */
  const [removedLotsBySellerId, setRemovedLotsBySellerId] = useState<Record<string, string[]>>({});
  const [deleteLotConfirm, setDeleteLotConfirm] = useState<{
    sellerId: string;
    lotId: string;
    itemLabel: string;
    isExtraBid?: boolean;
  } | null>(null);
  const saveMainPattiShortcutRef = useRef<() => void>(() => {});

  const salesReportCarouselRef = useRef<HTMLDivElement | null>(null);
  const [activeSalesReportSlide, setActiveSalesReportSlide] = useState(0);

  const [sellerFormById, setSellerFormById] = useState<Record<string, SellerRegFormState>>({});
  const [registeredBaselineById, setRegisteredBaselineById] = useState<Record<string, SellerRegFormState>>({});
  const [sellerExpensesById, setSellerExpensesById] = useState<Record<string, SellerExpenseFormState>>({});
  /** After a blocked save, seller cards to ring-scroll (Unregistered / other blocking validation). Avg bounds are UI-only warnings. */
  const [pattiSaveHighlightSellerIds, setPattiSaveHighlightSellerIds] = useState<string[]>([]);
  const [vehicleExpenseModalOpen, setVehicleExpenseModalOpen] = useState(false);
  const [vehicleExpenseLoading, setVehicleExpenseLoading] = useState(false);
  const [vehicleExpenseRows, setVehicleExpenseRows] = useState<VehicleExpenseRow[]>([]);
  const [vehicleExpenseOriginalByRowId, setVehicleExpenseOriginalByRowId] = useState<
    Record<string, VehicleExpenseFieldValues>
  >({});

  const [addVoucherSellerId, setAddVoucherSellerId] = useState<string | null>(null);
  const [addVoucherRows, setAddVoucherRows] = useState<AddVoucherRowState[]>([]);
  const [addVoucherLoading, setAddVoucherLoading] = useState(false);
  const [addVoucherSaving, setAddVoucherSaving] = useState(false);
  const [weighmanDraftBySellerId, setWeighmanDraftBySellerId] = useState<Record<string, string>>({});
  /** Last auto-pulled / applied expense snapshot per seller (redo target on the Expense card). */
  const [sellerExpenseRestoreBaselineById, setSellerExpenseRestoreBaselineById] = useState<
    Record<string, SellerExpenseFormState>
  >({});

  const isWeighingMergedIntoFreight = useCallback(
    (sellerId?: string) => (sellerId ? settlementWeighingMergeIntoFreightBySellerId[sellerId] !== false : true),
    [settlementWeighingMergeIntoFreightBySellerId]
  );

  const isWeighingEnabledForSeller = useCallback(
    (sellerId?: string) => (sellerId ? settlementWeighingEnabledBySellerId[sellerId] !== false : true),
    [settlementWeighingEnabledBySellerId]
  );

  const buildEmptyVoucherRow = useCallback((): AddVoucherRowState => ({
    localId: `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    voucherName: '',
    forWhoName: '',
    description: '',
    expenseAmount: '',
  }), []);

  useEffect(() => {
    if (!addVoucherSellerId) return;
    let cancelled = false;
    setAddVoucherLoading(true);
    (async () => {
      try {
        const response = await settlementApi.listTemporaryVouchers(addVoucherSellerId);
        if (cancelled) return;
        const rows =
          response.rows.length > 0
            ? response.rows.map(r => ({
                id: r.id,
                localId: `v_${r.id ?? Math.random().toString(36).slice(2, 8)}`,
                voucherName: r.voucherName ?? '',
                forWhoName: r.forWhoName ?? '',
                description: r.description ?? '',
                expenseAmount: (Number(r.expenseAmount ?? 0) || 0).toFixed(2),
              }))
            : [buildEmptyVoucherRow()];
        setAddVoucherRows(rows);
      } catch {
        if (!cancelled) {
          setAddVoucherRows([buildEmptyVoucherRow()]);
          toast.error('Failed to load vouchers.');
        }
      } finally {
        if (!cancelled) setAddVoucherLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addVoucherSellerId, buildEmptyVoucherRow]);

  /** Per-seller per-lot edits for Sales report qty / weight / rate per bag. */
  const [lotSalesOverridesBySellerId, setLotSalesOverridesBySellerId] = useState<
    Record<string, Record<string, LotSalesOverride>>
  >({});
  /** Saved patti only: extra lot rows (inline split / legacy add-bid), persisted in `extensionJson`. */
  const [extraBidLotsBySellerId, setExtraBidLotsBySellerId] = useState<Record<string, ExtraBidLot[]>>({});
  /** Per seller: sales table row order (`a:${sid}` / `e:${id}`); default derived when missing. */
  const [salesReportRowOrderBySellerId, setSalesReportRowOrderBySellerId] = useState<
    Record<string, SalesRowOrderKey[]>
  >({});
  /** Inline split transactions: keyed by splitGroupId (not persisted). */
  const [splitGroupsById, setSplitGroupsById] = useState<Record<string, SplitGroupSnapshot>>({});
  /** At most one active split edit per seller (row pair). */
  const [activeSplitGroupIdBySellerId, setActiveSplitGroupIdBySellerId] = useState<Record<string, string | null>>({});
  const splitGroupsByIdRef = useRef(splitGroupsById);
  splitGroupsByIdRef.current = splitGroupsById;
  const activeSplitGroupIdBySellerIdRef = useRef(activeSplitGroupIdBySellerId);
  activeSplitGroupIdBySellerIdRef.current = activeSplitGroupIdBySellerId;

  /** Full workspace fingerprint for leave / unsaved prompts (not only `pattiData`). */
  const settlementWorkspaceSnapshot = useMemo(() => {
    if (!pattiData) return '';
    return JSON.stringify({
      patti: pattiData,
      lot: lotSalesOverridesBySellerId,
      exp: sellerExpensesById,
      rem: removedLotsBySellerId,
      extraBid: extraBidLotsBySellerId,
      rowOrder: salesReportRowOrderBySellerId,
      splitTxn: { splitGroupsById, activeSplitGroupIdBySellerId },
      sform: sellerFormById,
      coolie: coolieMode,
      wOn: settlementWeighingEnabledBySellerId,
      mergeF: settlementWeighingMergeIntoFreightBySellerId,
      gunnies: gunniesAmount,
      vehExp: vehicleExpenseRows,
      vehExpOrig: vehicleExpenseOriginalByRowId,
      draftMain: draftMainPattiNo,
      draftNoBySeller: draftPattiNoBySellerId,
      dbIds: existingPattiIdBySellerId,
      vouchers: addVoucherSellerId != null ? { sellerId: addVoucherSellerId, rows: addVoucherRows } : null,
      invoiceNameSearch,
    });
  }, [
    pattiData,
    lotSalesOverridesBySellerId,
    sellerExpensesById,
    removedLotsBySellerId,
    extraBidLotsBySellerId,
    salesReportRowOrderBySellerId,
    splitGroupsById,
    activeSplitGroupIdBySellerId,
    sellerFormById,
    coolieMode,
    settlementWeighingEnabledBySellerId,
    settlementWeighingMergeIntoFreightBySellerId,
    gunniesAmount,
    vehicleExpenseRows,
    vehicleExpenseOriginalByRowId,
    draftMainPattiNo,
    draftPattiNoBySellerId,
    existingPattiIdBySellerId,
    addVoucherSellerId,
    addVoucherRows,
    invoiceNameSearch,
  ]);
  settlementWorkspaceSnapshotRef.current = settlementWorkspaceSnapshot;

  const [fullCommodityConfigs, setFullCommodityConfigs] = useState<FullCommodityConfigDto[]>([]);
  const [commodityList, setCommodityList] = useState<Commodity[]>([]);

  useEffect(() => {
    Promise.all([commodityApi.getAllFullConfigs(), commodityApi.list()])
      .then(([cfgs, comms]) => {
        setFullCommodityConfigs(Array.isArray(cfgs) ? cfgs : []);
        setCommodityList(Array.isArray(comms) ? comms : []);
      })
      .catch(() => {
        /* optional */
      });
  }, []);

  /** Same divisor source as Billing: commodity config `ratePerUnit` (bag divisor). */
  const commodityDivisorByName = useMemo(() => {
    const map: Record<string, number> = {};
    commodityList.forEach(c => {
      const name = String(c.commodity_name ?? '').trim().toLowerCase();
      if (!name) return;
      const cid = Number(c.commodity_id);
      if (!Number.isFinite(cid)) return;
      const cfg = fullCommodityConfigs.find(f => f.commodityId === cid);
      const d = Number(cfg?.config?.ratePerUnit);
      if (d > 0) map[name] = d;
    });
    return map;
  }, [fullCommodityConfigs, commodityList]);

  const commodityAvgWeightBounds = useMemo(() => {
    const map: Record<string, { min: number; max: number }> = {};
    commodityList.forEach(c => {
      const cid = Number(c.commodity_id);
      const cfg = fullCommodityConfigs.find(f => f.commodityId === cid);
      const min = Number(cfg?.config?.minWeight ?? 0);
      const max = Number(cfg?.config?.maxWeight ?? 0);
      const name = String(c.commodity_name ?? '').trim();
      if (name && (min > 0 || max > 0)) {
        map[name] = { min, max };
      }
    });
    return map;
  }, [fullCommodityConfigs, commodityList]);

  const getLotDivisor = useCallback(
    (lot: SettlementLot) => {
      const n = (lot.commodityName || '').trim().toLowerCase();
      const d = commodityDivisorByName[n];
      return d != null && d > 0 ? d : 50;
    },
    [commodityDivisorByName]
  );

  /** Contact search (registered sellers / contact registry) per seller card in Sales report. */
  const [sellerContactSearchById, setSellerContactSearchById] = useState<Record<string, Contact[]>>({});
  const [sellerContactSearchLoading, setSellerContactSearchLoading] = useState<Record<string, boolean>>({});
  const [sellerRegSaving, setSellerRegSaving] = useState<Record<string, boolean>>({});

  // Load sellers from backend only (no localStorage or mock data).
  useEffect(() => {
    settlementApi
      .listSellers({ page: 0, size: 500 })
      .then((apiSellers: SellerSettlement[]) => {
        setSellers(Array.isArray(apiSellers) ? apiSellers : []);
      })
      .catch(() => {
        setSellers([]);
        toast.error('Failed to load settlement sellers');
      });
  }, []);

  // Load saved pattis when on seller list (no patti open).
  const loadSavedPattis = useCallback(() => {
    setLoadingPattis(true);
    settlementApi
      .listPattis({ page: 0, size: 500 })
      .then((list: PattiDTO[]) => {
        setSavedPattis(Array.isArray(list) ? list : []);
      })
      .catch(() => setSavedPattis([]))
      .finally(() => setLoadingPattis(false));
  }, []);

  useEffect(() => {
    if (selectedSeller == null && pattiData == null) {
      loadSavedPattis();
    }
  }, [selectedSeller, pattiData, loadSavedPattis]);

  const loadInProgressPattis = useCallback(() => {
    settlementApi
      .listInProgressPattis({ page: 0, size: 500 })
      .then((list: PattiDTO[]) => {
        setInProgressPattiDtos(Array.isArray(list) ? list.filter(p => p.id != null) : []);
      })
      .catch(() => setInProgressPattiDtos([]));
  }, []);

  useEffect(() => {
    if (selectedSeller == null && pattiData == null) {
      loadInProgressPattis();
    }
  }, [selectedSeller, pattiData, loadInProgressPattis]);

  /** One row per arrival: group in-progress DB rows that share vehicle + from + date so multi-seller saves stay together. */
  const inProgressPattiDrafts = useMemo((): InProgressSettlementDraft[] => {
    const sellerById = new Map(sellers.map(s => [String(s.sellerId), s]));
    const groupMap = new Map<string, PattiDTO[]>();
    for (const p of inProgressPattiDtos) {
      if (p.id == null) continue;
      const vehicleNumber = (p.vehicleNumber || '').trim();
      const fromLocation = (p.fromLocation || '').trim();
      const dateRaw = (p.date ?? p.createdAt ?? '').toString();
      const gKey = [vehicleNumber.toLowerCase(), fromLocation.toLowerCase(), dateRaw].join('|');
      const arr = groupMap.get(gKey);
      if (arr) arr.push(p);
      else groupMap.set(gKey, [p]);
    }
    const rows: InProgressSettlementDraft[] = [];
    for (const [gKey, pattis] of groupMap) {
      const dbPattiIdsBySellerId: Record<string, number> = {};
      const sellerIdSet = new Set<string>();
      let updatedMs = 0;
      for (const p of pattis) {
        const sid = String(p.sellerId ?? '').trim();
        if (sid) {
          sellerIdSet.add(sid);
          dbPattiIdsBySellerId[sid] = Number(p.id);
        }
        const t = new Date(p.createdAt ?? '').getTime();
        if (Number.isFinite(t) && t > updatedMs) updatedMs = t;
      }
      const primaryPatti = pattis[0];
      if (!primaryPatti) continue;
      let sellerIds = Array.from(sellerIdSet);
      if (sellerIds.length === 0 && primaryPatti.sellerId) {
        const lone = String(primaryPatti.sellerId).trim();
        if (lone) {
          sellerIds = [lone];
          if (primaryPatti.id != null) dbPattiIdsBySellerId[lone] = Number(primaryPatti.id);
        }
      }
      const first = pickFirstArrivalSeller(sellerIds, sellerById);
      const repId = String(first?.sellerId ?? sellerIds[0] ?? '').trim();
      const repPatti =
        (repId ? pattis.find(x => String(x.sellerId ?? '').trim() === repId) : undefined) ?? primaryPatti;
      const v = (repPatti.vehicleNumber || '').trim();
      const from = (repPatti.fromLocation || '').trim();
      const dateRaw = (repPatti.date ?? repPatti.createdAt ?? '').toString();
      const dateObj = dateRaw ? new Date(dateRaw) : null;
      const dateLabel = dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : '-';
      let lots = 0;
      let bids = 0;
      let weighed = 0;
      for (const p of pattis) {
        const t = tallyFromPattiDtoClusters(p);
        lots += t.lots;
        bids += t.bids;
        weighed += t.weighed;
      }
      if (lots === 0 && bids === 0 && weighed === 0) {
        for (const sid of sellerIds) {
          const s = sellerById.get(sid);
          if (s) {
            lots += getSellerLots(s);
            bids += getSellerBids(s);
            weighed += getSellerWeighed(s);
          }
        }
      }
      const sellerNames = firstArrivalSellerLabel(sellerIds, sellerById, repPatti.sellerName);
      rows.push({
        key: `db:group:${gKey}|${[...sellerIds].sort().join(',')}`,
        updatedAt: updatedMs ? new Date(updatedMs).toISOString() : String(repPatti.createdAt ?? ''),
        representativeSellerId: repId || String(repPatti.sellerId ?? ''),
        sellerIds,
        dbPattiIdsBySellerId,
        vehicleNumber: v || '-',
        sellerNames,
        fromLocation: from || '-',
        serialNo:
          first?.sellerSerialNo != null
            ? String(first.sellerSerialNo)
            : repPatti.sellerSerialNo != null
              ? String(repPatti.sellerSerialNo)
              : '',
        dateLabel,
        lots,
        bids,
        weighed,
        pattiData: mapPattiDTOToPattiData(repPatti),
      });
    }
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return rows;
  }, [inProgressPattiDtos, sellers]);

  // Generate Patti when seller is selected (new patti; clear edit id).
  // Overrides: pass when toggling to avoid stale closure (React state updates are async).
  const generatePatti = useCallback(async (seller: SellerSettlement, overrides?: { coolieMode?: 'FLAT' | 'RECALCULATED'; gunniesAmount?: number; arrivalSellerIds?: string[] }) => {
    setPattiDetailDto(null);
    setIsOriginalReferenceMode(false);
    settlementDirtyBaselineRef.current = null;
    lastExpenseAutoPullKeyRef.current = '';
    setExistingPattiIdBySellerId({});
    setRemovedLotsBySellerId({});
    setLotSalesOverridesBySellerId({});
    setExtraBidLotsBySellerId({});
    setSalesReportRowOrderBySellerId({});
    setSplitGroupsById({});
    setActiveSplitGroupIdBySellerId({});
    setVehicleExpenseRows([]);
    setVehicleExpenseOriginalByRowId({});
    setVehicleExpenseModalOpen(false);
    setDraftMainPattiNo('');
    setDraftPattiNoBySellerId({});
    /** Default Add to freight ON (missing seller id in map => merged); clear stale false from prior sessions. */
    setSettlementWeighingMergeIntoFreightBySellerId({});
    setSelectedSeller(seller);
    const scopeSellerIds = (overrides?.arrivalSellerIds?.length ? overrides.arrivalSellerIds : [seller.sellerId]).map(String);
    setSelectedArrivalSellerIds(scopeSellerIds);
    setIsLatestEditUnlocked(true);
    setSettlementFormMode('new');

    if (!isVehicleNumberValid(seller.vehicleNumber)) {
      toast.warning(`Vehicle number should be ${VEHICLE_NUMBER_MIN}–${VEHICLE_NUMBER_MAX} characters`);
    }

    const rateClusters = buildRateClustersFromSellerLots(seller, new Set(), undefined, getLotDivisor);

    const grossAmount = rateClusters.reduce((sum, c) => sum + c.amount, 0);

    const effectiveCoolieMode = overrides?.coolieMode ?? coolieMode;
    const placeholderExp: SellerExpenseFormState = {
      ...defaultSellerExpenses(),
      gunnies: overrides?.gunniesAmount ?? gunniesAmount,
    };
    const baseDeductions = buildDeductionItemsFromSellerExpenses(
      placeholderExp,
      effectiveCoolieMode,
      isWeighingEnabledForSeller(seller.sellerId),
      isWeighingMergedIntoFreight(seller.sellerId)
    );

    const baseTotalDeductions = baseDeductions.reduce((s, d) => s + d.amount, 0);
    const baseNetPayable = grossAmount - baseTotalDeductions;

    const createdAt = new Date().toISOString();
    const parseBaseFromPattiId = (pid?: string): string => {
      const raw = String(pid ?? '').trim();
      const m = raw.match(/^(.*)-(\d+)$/);
      return m ? m[1] : '';
    };
    const parseSequenceFromPattiId = (pid?: string): number | null => {
      const raw = String(pid ?? '').trim();
      const m = raw.match(/^(.*)-(\d+)$/);
      if (!m) return null;
      const n = Number(m[2]);
      return Number.isFinite(n) ? n : null;
    };
    const scopedSellersOrdered: SellerSettlement[] = scopeSellerIds
      .map(id => sellers.find(s => String(s.sellerId) === id))
      .filter((s): s is SellerSettlement => !!s);
    const scopedSaved = savedPattis.filter(p => scopeSellerIds.includes(String(p.sellerId ?? '').trim()));
    const existingBase =
      scopedSaved.map(p => String(p.pattiBaseNumber ?? '').trim()).find(v => v.length > 0) ||
      scopedSaved.map(p => parseBaseFromPattiId(p.pattiId)).find(v => v.length > 0) ||
      '';
    /** Only show real numbers from already-saved pattis; server assigns base+seq on first save. */
    const baseNo = existingBase;
    const draftBySeller: Record<string, string> = {};
    if (baseNo) {
      let seqCounter = 0;
      for (const p of scopedSaved) {
        const pBase = String(p.pattiBaseNumber ?? '').trim() || parseBaseFromPattiId(p.pattiId);
        if (pBase !== baseNo) continue;
        const seq =
          typeof p.sellerSequenceNumber === 'number' && Number.isFinite(p.sellerSequenceNumber) && p.sellerSequenceNumber > 0
            ? p.sellerSequenceNumber
            : parseSequenceFromPattiId(p.pattiId);
        if (seq != null) seqCounter = Math.max(seqCounter, seq);
      }
      for (const s of scopedSellersOrdered) {
        const sid = String(s.sellerId);
        const saved = scopedSaved.find(p => String(p.sellerId ?? '').trim() === sid);
        if (saved?.pattiId) {
          draftBySeller[sid] = String(saved.pattiId);
          continue;
        }
        seqCounter += 1;
        draftBySeller[sid] = `${baseNo}-${seqCounter}`;
      }
    }
    setDraftMainPattiNo(baseNo);
    setDraftPattiNoBySellerId(draftBySeller);

    for (const s of scopedSellersOrdered) {
      const sid = String(s.sellerId);
      if (sessionOriginalSnapshotJsonBySellerIdRef.current[sid]) continue;
      const pid = draftBySeller[sid] ?? '';
      const rc = buildRateClustersFromSellerLots(s, new Set(), undefined, getLotDivisor);
      const ga = rc.reduce((sum, c) => sum + c.amount, 0);
      const exp: SellerExpenseFormState = {
        ...defaultSellerExpenses(),
        gunnies: overrides?.gunniesAmount ?? gunniesAmount,
      };
      const ded = buildDeductionItemsFromSellerExpenses(
        exp,
        effectiveCoolieMode,
        isWeighingEnabledForSeller(sid),
        isWeighingMergedIntoFreight(sid)
      );
      const td = ded.reduce((x, d) => x + d.amount, 0);
      const ext = buildPattiExtensionJsonForSeller(sid, {}, {}, {}, false);
      const body: Record<string, unknown> = {
        pattiId: pid,
        sellerId: sid,
        sellerName: s.sellerName,
        rateClusters: rc,
        grossAmount: ga,
        deductions: ded,
        totalDeductions: td,
        netPayable: ga - td,
        useAverageWeight: false,
      };
      if (ext !== undefined) body.extensionJson = ext;
      sessionOriginalSnapshotJsonBySellerIdRef.current[sid] = JSON.stringify(body);
    }

    const initialPattiData: PattiData = {
      pattiId: draftBySeller[String(seller.sellerId)] ?? '',
      sellerName: seller.sellerName,
      rateClusters,
      grossAmount,
      deductions: baseDeductions,
      totalDeductions: baseTotalDeductions,
      netPayable: baseNetPayable,
      createdAt,
      useAverageWeight: false,
    };
    setPattiData(initialPattiData);
  }, [coolieMode, gunniesAmount, getLotDivisor, isWeighingEnabledForSeller, isWeighingMergedIntoFreight, sellers, savedPattis]);

  // Open a saved patti for edit: fetch by id and pre-fill form.
  const openPattiForEdit = useCallback(
    async (
      id: number,
      arrivalSellerIds?: string[],
      opts?: { mergeExistingPattiIds?: Record<string, number>; formContext?: 'in-progress' | 'saved' }
    ) => {
    try {
      settlementDirtyBaselineRef.current = null;
      settlementWorkspaceHydratingRef.current = true;
      setDraftMainPattiNo('');
      setDraftPattiNoBySellerId({});
      const dto = await settlementApi.getPattiById(id);
      if (!dto) {
        toast.error('Patti not found');
        settlementWorkspaceHydratingRef.current = false;
        setSettlementWorkspaceHydrateEpoch(e => e + 1);
        return;
      }
      setSettlementFormMode(opts?.formContext ?? (dto.inProgress ? 'in-progress' : 'saved'));
      setRemovedLotsBySellerId({});
      setLotSalesOverridesBySellerId({});
      setExtraBidLotsBySellerId({});
      setSalesReportRowOrderBySellerId({});
      setSplitGroupsById({});
      setActiveSplitGroupIdBySellerId({});
      setVehicleExpenseRows([]);
      setVehicleExpenseOriginalByRowId({});
      setVehicleExpenseModalOpen(false);
      /** Default Add to freight ON; merge flags are client-only and must not inherit from a previous patti. */
      setSettlementWeighingMergeIntoFreightBySellerId({});
      const data = mapPattiDTOToPattiData(dto);
      if (data.createdAt && new Date(data.createdAt) > new Date()) {
        toast.warning('Patti date is in the future — please verify');
      }
      setPattiData(data);
      setPattiDetailDto(dto);
      setIsOriginalReferenceMode(false);
      setIsLatestEditUnlocked(false);
      const idMap: Record<string, number> = {};
      const editSid = String(dto.sellerId ?? '').trim();
      if (editSid && (dto.id ?? id) != null) {
        idMap[editSid] = Number(dto.id ?? id);
      }
      for (const rawSid of arrivalSellerIds ?? []) {
        const sidKey = String(rawSid ?? '').trim();
        if (!sidKey) continue;
        const saved = savedPattis.find(p => String(p.sellerId ?? '').trim() === sidKey && p.id != null);
        if (saved?.id != null) {
          idMap[sidKey] = Number(saved.id);
        }
      }
      const mergeIds = opts?.mergeExistingPattiIds;
      if (mergeIds) {
        for (const [k, v] of Object.entries(mergeIds)) {
          const ks = String(k ?? '').trim();
          if (!ks || v == null) continue;
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) {
            idMap[ks] = n;
          }
        }
      }
      setExistingPattiIdBySellerId(idMap);

      const scopeForOriginalHydration = new Set<string>();
      if (editSid) scopeForOriginalHydration.add(editSid);
      for (const rawSid of arrivalSellerIds ?? []) {
        const k = String(rawSid ?? '').trim();
        if (k) scopeForOriginalHydration.add(k);
      }
      for (const k of Object.keys(idMap)) {
        const ks = String(k ?? '').trim();
        if (ks) scopeForOriginalHydration.add(ks);
      }
      clearSessionOriginalSnapshotsForSellerIds(
        sessionOriginalSnapshotJsonBySellerIdRef.current,
        scopeForOriginalHydration,
      );
      hydrateSessionOriginalSnapshotFromDto(sessionOriginalSnapshotJsonBySellerIdRef.current, dto);

      const applyExtensionFromPattiDto = (p: PattiDTO | null | undefined) => {
        if (!p) return;
        const sidKey = String(p.sellerId ?? '').trim();
        if (!sidKey) return;
        const sellerModel: SellerSettlement =
          sellers.find(s => s.sellerId === sidKey) ??
          ({
            sellerId: sidKey,
            sellerName: (p.sellerName ?? '').trim(),
            sellerMark: '',
            vehicleNumber: '',
            lots: [],
          } as SellerSettlement);
        const parsed = parsePattiExtensionJson(p.extensionJson);
        if (!parsed) {
          const patchClearUnreg = (prev: Record<string, SellerRegFormState>) => {
            const cur = prev[sidKey] ?? defaultSellerForm(sellerModel);
            return {
              ...prev,
              [sidKey]: { ...cur, unregisteredPrintConfirmed: false },
            };
          };
          setSellerFormById(patchClearUnreg);
          setRegisteredBaselineById(patchClearUnreg);
          setSalesReportRowOrderBySellerId(prev => {
            if (!(sidKey in prev)) return prev;
            const next = { ...prev };
            delete next[sidKey];
            return next;
          });
          return;
        }
        if (parsed.removedLotIds.length > 0) {
          setRemovedLotsBySellerId(prev => ({ ...prev, [sidKey]: [...parsed.removedLotIds] }));
        }
        if (Object.keys(parsed.lotOverrides).length > 0) {
          setLotSalesOverridesBySellerId(prev => ({
            ...prev,
            [sidKey]: { ...(prev[sidKey] ?? {}), ...parsed.lotOverrides },
          }));
        }
        if (parsed.extraBidLots.length > 0) {
          setExtraBidLotsBySellerId(prev => ({
            ...prev,
            [sidKey]: [...parsed.extraBidLots],
          }));
        }
        {
          const removedSetForOrder = new Set(parsed.removedLotIds);
          const ord = sanitizeSalesRowOrder(parsed.salesRowOrder, sellerModel, removedSetForOrder, parsed.extraBidLots);
          setSalesReportRowOrderBySellerId(prev => ({ ...prev, [sidKey]: ord }));
        }
        const unreg = parsed.unregisteredPrintConfirmed === true;
        const patchSellerReg = (prev: Record<string, SellerRegFormState>) => {
          const cur = prev[sidKey] ?? defaultSellerForm(sellerModel);
          return {
            ...prev,
            [sidKey]: {
              ...cur,
              unregisteredPrintConfirmed: unreg,
              ...(unreg
                ? {
                    registrationChosen: true,
                    registered: false,
                    contactId: null,
                    replacementSellerId: null,
                    allowRegisteredEdit: false,
                  }
                : {}),
            },
          };
        };
        setSellerFormById(patchSellerReg);
        setRegisteredBaselineById(patchSellerReg);
      };

      applyExtensionFromPattiDto(dto);

      const expensePatch: Record<string, SellerExpenseFormState> = {};
      const mergeExpensesFromPattiDto = (p: PattiDTO | null | undefined) => {
        if (!p) return;
        const sidKey = String(p.sellerId ?? '').trim();
        if (!sidKey) return;
        const slabHint = inferWeighmanSlabHintForPattiHydration(
          p,
          sellers,
          commodityList,
          fullCommodityConfigs,
          getLotDivisor
        );
        expensePatch[sidKey] = {
          ...defaultSellerExpenses(),
          ...deductionsToSellerExpenseForm(p.deductions ?? [], {
            inferredWeighmanFromSlabs: slabHint,
          }),
        };
      };
      mergeExpensesFromPattiDto(dto);

      const primaryNumericId = Number(dto.id ?? id);
      for (const [, dbid] of Object.entries(idMap)) {
        const nid = Number(dbid);
        if (!Number.isFinite(nid) || nid <= 0 || nid === primaryNumericId) continue;
        try {
          const other = await settlementApi.getPattiById(nid);
          hydrateSessionOriginalSnapshotFromDto(sessionOriginalSnapshotJsonBySellerIdRef.current, other ?? undefined);
          applyExtensionFromPattiDto(other ?? undefined);
          mergeExpensesFromPattiDto(other ?? undefined);
        } catch {
          /* ignore per-seller extension load */
        }
      }

      setSelectedArrivalSellerIds(arrivalSellerIds ?? []);
      if (Object.keys(expensePatch).length > 0) {
        setSellerExpensesById(prev => ({ ...prev, ...expensePatch }));
        setSellerExpenseRestoreBaselineById(prev => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(expensePatch)) {
            next[k] = { ...v };
          }
          return next;
        });
      }
      const dtoSellerId = String(dto.sellerId ?? '').trim();
      const fromSellers = dtoSellerId ? sellers.find(s => s.sellerId === dtoSellerId) : undefined;
      setSelectedSeller(
        fromSellers ?? {
          sellerId: dto.sellerId ?? '',
          sellerName: dto.sellerName ?? '',
          sellerMark: '',
          vehicleId: undefined,
          vehicleNumber: (dto.vehicleNumber ?? '').trim(),
          fromLocation: (dto.fromLocation ?? '').trim(),
          sellerSerialNo: dto.sellerSerialNo ?? undefined,
          createdAt: dto.createdAt ?? undefined,
          date: dto.date ?? dto.createdAt ?? undefined,
          lots: [],
        }
      );
      settlementWorkspaceHydratingRef.current = false;
      setSettlementWorkspaceHydrateEpoch(e => e + 1);
      setPattiOriginalHydrationNonce(n => n + 1);
    } catch {
      toast.error('Failed to load patti');
      settlementWorkspaceHydratingRef.current = false;
      setSettlementWorkspaceHydrateEpoch(e => e + 1);
    }
  },
  [sellers, savedPattis, commodityList, fullCommodityConfigs, getLotDivisor]);

  const openInProgressDraft = useCallback(async (draft: InProgressSettlementDraft) => {
    const rep = String(draft.representativeSellerId ?? '').trim();
    const primaryDbId =
      (rep ? draft.dbPattiIdsBySellerId[rep] : undefined) ??
      Number(Object.values(draft.dbPattiIdsBySellerId)[0]);
    if (!Number.isFinite(primaryDbId) || primaryDbId <= 0) {
      toast.error('Invalid in-progress patti id.');
      return;
    }
    await openPattiForEdit(primaryDbId, draft.sellerIds, {
      mergeExistingPattiIds: draft.dbPattiIdsBySellerId,
      formContext: 'in-progress',
    });
    toast.success('In-progress patti restored.');
  }, [openPattiForEdit]);

  const isPattiEditLocked = !!selectedSeller && !!pattiData && !isLatestEditUnlocked;
  const isSettlementFormReadOnly = isPattiEditLocked || isOriginalReferenceMode;

  const exitOriginalReferenceMode = useCallback(() => {
    const st = originalReferenceStashRef.current;
    if (!st) {
      setIsOriginalReferenceMode(false);
      return;
    }
    originalReferenceStashRef.current = null;
    settlementDirtyBaselineRef.current = null;
    setPattiData(st.pattiData);
    setSellerExpensesById(st.sellerExpensesById);
    setLotSalesOverridesBySellerId(st.lotSalesOverridesBySellerId);
    setRemovedLotsBySellerId(st.removedLotsBySellerId);
    setExtraBidLotsBySellerId(st.extraBidLotsBySellerId);
    setSalesReportRowOrderBySellerId(st.salesReportRowOrderBySellerId);
    setSellerFormById(st.sellerFormById);
    setCoolieMode(st.coolieMode);
    setSettlementWeighingEnabledBySellerId(st.settlementWeighingEnabledBySellerId);
    setSettlementWeighingMergeIntoFreightBySellerId(st.settlementWeighingMergeIntoFreightBySellerId);
    setGunniesAmount(st.gunniesAmount);
    setSellerExpenseRestoreBaselineById(st.sellerExpenseRestoreBaselineById);
    setIsOriginalReferenceMode(false);
  }, []);

  const resolveOriginalPayload = useCallback((): Record<string, unknown> | null => {
    const od = pattiDetailDto?.originalData;
    if (od && typeof od === 'object' && !Array.isArray(od)) {
      return od as Record<string, unknown>;
    }
    const sid = String(selectedSeller?.sellerId ?? '').trim();
    if (sid && sessionOriginalSnapshotJsonBySellerIdRef.current[sid]) {
      try {
        return JSON.parse(sessionOriginalSnapshotJsonBySellerIdRef.current[sid]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }, [pattiDetailDto, selectedSeller?.sellerId]);

  const enterOriginalReferenceMode = useCallback(() => {
    if (!pattiData || !selectedSeller) return;
    const raw = resolveOriginalPayload();
    if (!raw || typeof raw !== 'object') {
      toast.message('No original snapshot for this patti.');
      return;
    }
    const sid = String(pattiDetailDto?.sellerId ?? selectedSeller.sellerId ?? '').trim();
    originalReferenceStashRef.current = {
      pattiData: JSON.parse(JSON.stringify(pattiData)) as PattiData,
      sellerExpensesById: JSON.parse(JSON.stringify(sellerExpensesById)) as Record<string, SellerExpenseFormState>,
      lotSalesOverridesBySellerId: JSON.parse(JSON.stringify(lotSalesOverridesBySellerId)),
      removedLotsBySellerId: JSON.parse(JSON.stringify(removedLotsBySellerId)),
      extraBidLotsBySellerId: JSON.parse(JSON.stringify(extraBidLotsBySellerId)) as Record<string, ExtraBidLot[]>,
      salesReportRowOrderBySellerId: JSON.parse(JSON.stringify(salesReportRowOrderBySellerId)) as Record<
        string,
        SalesRowOrderKey[]
      >,
      sellerFormById: JSON.parse(JSON.stringify(sellerFormById)),
      coolieMode,
      settlementWeighingEnabledBySellerId: { ...settlementWeighingEnabledBySellerId },
      settlementWeighingMergeIntoFreightBySellerId: { ...settlementWeighingMergeIntoFreightBySellerId },
      gunniesAmount,
      sellerExpenseRestoreBaselineById: JSON.parse(JSON.stringify(sellerExpenseRestoreBaselineById)),
    };
    const baseDto: PattiDTO = pattiDetailDto
      ? { ...pattiDetailDto }
      : ({
          pattiId: pattiData.pattiId,
          sellerId: selectedSeller.sellerId,
          sellerName: pattiData.sellerName || selectedSeller.sellerName,
          vehicleNumber: selectedSeller.vehicleNumber,
          fromLocation: selectedSeller.fromLocation,
          sellerSerialNo: selectedSeller.sellerSerialNo,
          rateClusters: pattiData.rateClusters,
          grossAmount: pattiData.grossAmount,
          deductions: pattiData.deductions,
          totalDeductions: pattiData.totalDeductions,
          netPayable: pattiData.netPayable,
          createdAt: pattiData.createdAt,
          useAverageWeight: pattiData.useAverageWeight,
        } as PattiDTO);
    const merged = pattiDtoFromOriginalSnapshotPayload(baseDto, raw);
    const next = mapPattiDTOToPattiData(merged);
    settlementDirtyBaselineRef.current = null;
    setPattiData(next);
    if (sid) {
      const slabHint = inferWeighmanSlabHintForPattiHydration(
        merged,
        sellers,
        commodityList,
        fullCommodityConfigs,
        getLotDivisor
      );
      const loadedExp: SellerExpenseFormState = {
        ...defaultSellerExpenses(),
        ...deductionsToSellerExpenseForm(next.deductions, { inferredWeighmanFromSlabs: slabHint }),
      };
      setSellerExpensesById(prev => ({
        ...prev,
        [sid]: loadedExp,
      }));
      setSellerExpenseRestoreBaselineById(prev => ({ ...prev, [sid]: { ...loadedExp } }));
    }
    setRemovedLotsBySellerId({});
    setLotSalesOverridesBySellerId({});
    setExtraBidLotsBySellerId({});
    setSalesReportRowOrderBySellerId({});
    setSplitGroupsById({});
    setActiveSplitGroupIdBySellerId({});
    const parsed = parsePattiExtensionJson(merged.extensionJson);
    if (parsed && sid) {
      if (parsed.removedLotIds.length > 0) {
        setRemovedLotsBySellerId({ [sid]: [...parsed.removedLotIds] });
      }
      if (Object.keys(parsed.lotOverrides).length > 0) {
        setLotSalesOverridesBySellerId({ [sid]: { ...parsed.lotOverrides } });
      }
      if (parsed.extraBidLots.length > 0) {
        setExtraBidLotsBySellerId({ [sid]: [...parsed.extraBidLots] });
      }
      if (selectedSeller?.sellerId === sid) {
        const rs = new Set(parsed.removedLotIds);
        const ord = sanitizeSalesRowOrder(parsed.salesRowOrder, selectedSeller, rs, parsed.extraBidLots);
        setSalesReportRowOrderBySellerId({ [sid]: ord });
      }
    }
    setIsOriginalReferenceMode(true);
    toast.message('Original snapshot (read-only). Press Alt+M to return.');
  }, [
    pattiData,
    selectedSeller,
    pattiDetailDto,
    resolveOriginalPayload,
    sellerExpensesById,
    lotSalesOverridesBySellerId,
    removedLotsBySellerId,
    sellerFormById,
    coolieMode,
    settlementWeighingEnabledBySellerId,
    settlementWeighingMergeIntoFreightBySellerId,
    gunniesAmount,
    sellerExpenseRestoreBaselineById,
    extraBidLotsBySellerId,
    salesReportRowOrderBySellerId,
    commodityList,
    fullCommodityConfigs,
    getLotDivisor,
    sellers,
  ]);

  useEffect(() => {
    if (!selectedSeller || !pattiData) {
      settlementDirtyBaselineRef.current = null;
      return;
    }
    if (settlementWorkspaceHydratingRef.current) return;
    if (settlementDirtyBaselineRef.current != null) return;
    if (!settlementWorkspaceSnapshot) return;
    /** Defer so later workspace effects (seller form seeding, etc.) run first — avoids a stale baseline string. */
    const t = window.setTimeout(() => {
      if (settlementWorkspaceHydratingRef.current) return;
      if (settlementDirtyBaselineRef.current != null) return;
      settlementDirtyBaselineRef.current = settlementWorkspaceSnapshotRef.current;
      setSettlementDirtyNonce(n => n + 1);
    }, 0);
    return () => window.clearTimeout(t);
  }, [selectedSeller, pattiData, settlementWorkspaceSnapshot, settlementWorkspaceHydrateEpoch]);

  /** After save, deduction/gross effects may update `pattiData` on the next frame — defer baseline sync so leave/save prompts do not flicker or stay stuck “dirty”. */
  useEffect(() => {
    if (!resyncBaselineAfterSaveRef.current) return;
    if (pattiSaveBusy) return;
    if (!selectedSeller || !pattiData || !isLatestEditUnlocked || showPrint || isOriginalReferenceMode) return;
    const run = () => {
      if (!resyncBaselineAfterSaveRef.current) return;
      resyncBaselineAfterSaveRef.current = false;
      settlementDirtyBaselineRef.current = settlementWorkspaceSnapshotRef.current;
      setSettlementDirtyNonce(n => n + 1);
    };
    let raf1 = 0;
    let raf2 = 0;
    const t = window.setTimeout(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(run);
      });
    }, 0);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pattiSaveBusy, selectedSeller, pattiData, isLatestEditUnlocked, showPrint, settlementWorkspaceSnapshot, isOriginalReferenceMode]);

  const enableSettlementEdit = useCallback(() => {
    if (isOriginalReferenceMode) {
      const wasLocked = !isLatestEditUnlocked;
      exitOriginalReferenceMode();
      if (wasLocked) {
        settlementDirtyBaselineRef.current = null;
        setSettlementDirtyNonce(n => n + 1);
        setIsLatestEditUnlocked(true);
        toast.success('Editing enabled.');
      }
      return;
    }
    settlementDirtyBaselineRef.current = null;
    setSettlementDirtyNonce(n => n + 1);
    setIsLatestEditUnlocked(true);
    toast.success('Editing enabled.');
  }, [isOriginalReferenceMode, isLatestEditUnlocked, exitOriginalReferenceMode]);

  const computePattiSavePayloadForSeller = useCallback(
    (
      seller: SellerSettlement,
      numbering?: { pattiBaseNumber?: string; sellerSequenceNumber?: number }
    ): PattiSaveRequest | null => {
      if (!pattiData) return null;
      const removed = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
      const ov = lotSalesOverridesBySellerId[seller.sellerId];
      const extraLots = extraBidLotsBySellerId[seller.sellerId] ?? [];
      const rateClusters = buildRateClustersFromSellerLots(
        seller,
        removed,
        ov,
        getLotDivisor,
        extraLots
      );
      const grossAmount = rateClusters.reduce((s, c) => s + c.amount, 0);
      const exp = sellerExpensesById[seller.sellerId] ?? defaultSellerExpenses();
      const form = sellerFormById[seller.sellerId] ?? defaultSellerForm(seller);
      const sellerName = (form.name || seller.sellerName || '').trim() || seller.sellerName;
      const deductions = buildDeductionItemsFromSellerExpenses(
        exp,
        coolieMode,
        isWeighingEnabledForSeller(seller.sellerId),
        isWeighingMergedIntoFreight(seller.sellerId)
      );
      const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
      const netPayable = grossAmount - totalDeductions;
      const extensionJson = buildPattiExtensionJsonForSeller(
        seller.sellerId,
        removedLotsBySellerId,
        lotSalesOverridesBySellerId,
        extraBidLotsBySellerId,
        form.unregisteredPrintConfirmed === true,
        salesReportRowOrderBySellerId,
        seller
      );
      return {
        sellerId: seller.sellerId,
        pattiBaseNumber: numbering?.pattiBaseNumber,
        sellerSequenceNumber: numbering?.sellerSequenceNumber,
        sellerName,
        rateClusters,
        grossAmount,
        deductions,
        totalDeductions,
        netPayable,
        useAverageWeight: pattiData.useAverageWeight,
        ...(extensionJson !== undefined ? { extensionJson } : {}),
      };
    },
    [
      pattiData,
      removedLotsBySellerId,
      lotSalesOverridesBySellerId,
      extraBidLotsBySellerId,
      salesReportRowOrderBySellerId,
      getLotDivisor,
      sellerExpensesById,
      sellerFormById,
      coolieMode,
      isWeighingEnabledForSeller,
      isWeighingMergedIntoFreight,
    ]
  );

  const getSellerValidationError = useCallback(
    (seller: SellerSettlement): string | null => {
      const form = sellerFormById[seller.sellerId] ?? defaultSellerForm(seller);
      const sellerName = (form.name || seller.sellerName || '').trim();
      if (!sellerName) {
        return `${seller.sellerName || 'Seller'}: seller name is required`;
      }
      if (!isVehicleNumberValid((seller.vehicleNumber ?? '').trim())) {
        return `${sellerName}: vehicle number must be ${VEHICLE_NUMBER_MIN}–${VEHICLE_NUMBER_MAX} characters`;
      }
      const removedSet = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
      const lotOv = lotSalesOverridesBySellerId[seller.sellerId] ?? {};
      const visibleLots = (seller.lots ?? [])
        .map((lot, i) => ({ lot, sid: lotStableId(lot, i) }))
        .filter(x => !removedSet.has(x.sid));
      const extraLots = extraBidLotsBySellerId[seller.sellerId] ?? [];
      if (visibleLots.length === 0 && extraLots.length === 0) {
        return `${sellerName}: at least one lot is required`;
      }
      for (const { lot, sid } of visibleLots) {
        const row = mergeLotDisplayRow(lot, lotOv[sid], getLotDivisor(lot));
        if (!Number.isFinite(row.qty) || row.qty <= 0) {
          return `${sellerName}: quantity must be greater than 0`;
        }
        if (!Number.isFinite(row.weight) || row.weight <= 0) {
          return `${sellerName}: weight must be greater than 0`;
        }
        if (!Number.isFinite(row.ratePerBag) || row.ratePerBag <= 0) {
          return `${sellerName}: rate must be greater than 0`;
        }
      }
      for (const e of extraLots) {
        const lot = settlementLotFromExtraBid(e);
        const row = mergeLotDisplayRow(lot, undefined, getLotDivisor(lot));
        if (!Number.isFinite(row.qty) || row.qty <= 0) {
          return `${sellerName}: quantity must be greater than 0 (extra bid)`;
        }
        if (!Number.isFinite(row.weight) || row.weight <= 0) {
          return `${sellerName}: weight must be greater than 0 (extra bid)`;
        }
        if (!Number.isFinite(row.ratePerBag) || row.ratePerBag <= 0) {
          return `${sellerName}: rate must be greater than 0 (extra bid)`;
        }
      }
      // Avg vs commodity min/max: non-blocking (amber UI in item table only); do not gate save/print.
      const allowedQty = Math.round(totalArrivalBagsForSeller(seller));
      let qtyTot = 0;
      for (const { lot, sid } of visibleLots) {
        qtyTot += mergeLotDisplayRow(lot, lotOv[sid], getLotDivisor(lot)).qty;
      }
      for (const e of extraLots) {
        const lot = settlementLotFromExtraBid(e);
        qtyTot += mergeLotDisplayRow(lot, undefined, getLotDivisor(lot)).qty;
      }
      if (allowedQty > 0 && qtyTot !== allowedQty) {
        if (qtyTot > allowedQty) {
          return `${sellerName}: total quantity (${qtyTot}) exceeds arrival bags (${allowedQty}); reduce quantities before save.`;
        }
        return `${sellerName}: total quantity (${qtyTot}) is less than arrival bags (${allowedQty}); adjust rows to match.`;
      }
      if (!isSettlementSellerPrintAllowed(seller, form)) {
        return (
          settlementSellerPrintGateMessage(seller, form) ??
          `${sellerName}: check Unregistered to confirm saving/printing, or link a registered contact`
        );
      }
      return null;
    },
    [
      sellerFormById,
      removedLotsBySellerId,
      lotSalesOverridesBySellerId,
      extraBidLotsBySellerId,
      getLotDivisor,
    ]
  );

  type SaveSellerOptions = {
    silent?: boolean;
    /** When true, open print preview after a successful save (default: false). */
    showPrintAfterSave?: boolean;
    pattiBaseNumber?: string;
    sellerSequenceNumber?: number;
    /** When true, caller owns patti save busy locking (e.g. Save Main Patti batch). */
    skipBusyGuard?: boolean;
    inProgress?: boolean;
  };

  /** Save or update Sales Patti for one settlement seller. */
  const savePattiForSeller = useCallback(
    async (seller: SellerSettlement, options?: SaveSellerOptions): Promise<boolean> => {
      if (!pattiData) return false;
      if (!options?.inProgress && isSettlementFormReadOnly) {
        if (!options?.silent) {
          if (isOriginalReferenceMode) toast.message('Press Alt+M to leave original view before saving.');
          else toast.message('Enable edit (Alt+M) to save.');
        }
        return false;
      }
      const skipBusy = options?.skipBusyGuard === true;
      if (!skipBusy) {
        if (pattiSaveBusyRef.current) return false;
        pattiSaveBusyRef.current = true;
        setPattiSaveBusy(true);
      }
      try {
        const silent = options?.silent === true;
        const showPrintAfterSave = options?.showPrintAfterSave === true;
        const payload = computePattiSavePayloadForSeller(seller, {
          pattiBaseNumber: options?.pattiBaseNumber,
          sellerSequenceNumber: options?.sellerSequenceNumber,
        });
        if (!payload) return false;
        const validationError = getSellerValidationError(seller);
        if (validationError) {
          setPattiSaveHighlightSellerIds([seller.sellerId]);
          toast.error(validationError, { duration: 8500 });
          queueMicrotask(() => {
            document
              .getElementById(`settlement-seller-card-${seller.sellerId}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          return false;
        }
        payload.inProgress = options?.inProgress === true;
        const sid = seller.sellerId;
        const existingDbId = existingPattiIdBySellerId[sid];
        const sessionOrig = sessionOriginalSnapshotJsonBySellerIdRef.current[sid];
        if (existingDbId == null && sessionOrig) {
          payload.originalSnapshotJson = sessionOrig;
        } else if (
          existingDbId != null &&
          sessionOrig &&
          pattiDetailDto?.originalData == null &&
          pattiDetailDto?.id === existingDbId
        ) {
          payload.originalSnapshotJson = sessionOrig;
        }
        const inProgressDbId = (() => {
          if (!payload.inProgress) return undefined;
          for (const d of inProgressPattiDrafts) {
            const n = d.dbPattiIdsBySellerId?.[String(sid)];
            if (n != null && Number(n) > 0) return Number(n);
          }
          return undefined;
        })();
        const dbId = existingDbId ?? inProgressDbId;
        const actionWord = dbId != null ? 'updated' : 'saved';
        if (!can('Settlement', dbId != null ? 'Edit' : 'Create')) {
          if (!silent) toast.error('You do not have permission to save settlements.');
          return false;
        }
        const applySavedToPrimaryUi = (p: PattiSaveRequest, businessPattiId: string, createdAtIso: string) => {
          if (selectedSeller?.sellerId !== sid) return;
          setPattiData(prev =>
            prev
              ? {
                  ...prev,
                  pattiId: businessPattiId || prev.pattiId,
                  sellerName: p.sellerName,
                  rateClusters: p.rateClusters,
                  grossAmount: p.grossAmount,
                  deductions: p.deductions,
                  totalDeductions: p.totalDeductions,
                  netPayable: p.netPayable,
                  createdAt: createdAtIso || prev.createdAt,
                }
              : null
          );
        };
        try {
          if (dbId != null) {
            const updated = await settlementApi.updatePatti(dbId, payload);
            if (updated) {
              applySavedToPrimaryUi(payload, updated.pattiId ?? '', updated.createdAt ?? '');
              setPattiDetailDto(updated);
              hydrateSessionOriginalSnapshotFromDto(sessionOriginalSnapshotJsonBySellerIdRef.current, updated);
              if (!silent) toast.success(payload.inProgress ? `Sales Patti ${updated.pattiId} saved in progress.` : `Sales Patti ${updated.pattiId} ${actionWord}.`);
              if (showPrintAfterSave) setShowPrint(true);
              setPattiSaveHighlightSellerIds(prev => prev.filter(x => x !== sid));
              loadSavedPattis();
              loadInProgressPattis();
              resyncBaselineAfterSaveRef.current = true;
              setArrivalSummaryTab(payload.inProgress ? 'in-progress-patti' : 'saved-patti');
              if (!payload.inProgress) setSettlementFormMode('saved');
              else setSettlementFormMode('in-progress');
              return true;
            }
            if (!silent) toast.error('Failed to update patti');
            return false;
          }
          const created = await settlementApi.createPatti(payload);
          if (created?.pattiId) {
            if (created.id != null) {
              setExistingPattiIdBySellerId(prev => ({ ...prev, [sid]: created.id! }));
            }
            const at = created.createdAt ?? new Date().toISOString();
            applySavedToPrimaryUi(payload, created.pattiId, at);
            setPattiDetailDto(created);
            delete sessionOriginalSnapshotJsonBySellerIdRef.current[sid];
            hydrateSessionOriginalSnapshotFromDto(sessionOriginalSnapshotJsonBySellerIdRef.current, created);
            if (!silent && selectedSeller?.sellerId === sid) {
              toast.success(payload.inProgress ? `Sales Patti ${created.pattiId} saved in progress.` : `Sales Patti ${created.pattiId} ${actionWord}.`);
            } else if (!silent) {
              toast.success(payload.inProgress ? `Sales Patti ${created.pattiId} saved in progress for ${payload.sellerName}.` : `Sales Patti ${created.pattiId} ${actionWord} for ${payload.sellerName}.`);
            }
            if (showPrintAfterSave) setShowPrint(true);
            setPattiSaveHighlightSellerIds(prev => prev.filter(x => x !== sid));
            loadSavedPattis();
            loadInProgressPattis();
            resyncBaselineAfterSaveRef.current = true;
            setArrivalSummaryTab(payload.inProgress ? 'in-progress-patti' : 'saved-patti');
            if (!payload.inProgress) setSettlementFormMode('saved');
            else setSettlementFormMode('in-progress');
            return true;
          }
          if (!silent) toast.error('Failed to save patti');
          return false;
        } catch {
          if (!silent) toast.error(dbId != null ? 'Failed to update patti' : 'Failed to save patti');
          return false;
        }
      } finally {
        if (!skipBusy) {
          pattiSaveBusyRef.current = false;
          setPattiSaveBusy(false);
        }
      }
    },
    [
      pattiData,
      computePattiSavePayloadForSeller,
      existingPattiIdBySellerId,
      inProgressPattiDrafts,
      can,
      selectedSeller?.sellerId,
      loadSavedPattis,
      loadInProgressPattis,
      isSettlementFormReadOnly,
      isOriginalReferenceMode,
      pattiDetailDto?.originalData,
      pattiDetailDto?.id,
      getSellerValidationError,
      setArrivalSummaryTab,
      setSettlementFormMode,
    ]
  );

  const savePatti = async (): Promise<boolean> => {
    if (!selectedSeller || !pattiData) return false;
    if (pattiSaveBusyRef.current) return false;
    const scopeSellers = (
      selectedArrivalSellerIds.length > 0
        ? selectedArrivalSellerIds.map(id => sellers.find(s => String(s.sellerId) === String(id)))
        : [selectedSeller]
    ).filter((s): s is SellerSettlement => !!s);
    const failingPreview = scopeSellers
      .map(s => ({ s, err: getSellerValidationError(s) }))
      .filter((x): x is { s: SellerSettlement; err: string } => x.err != null);
    if (failingPreview.length > 0) {
      setPattiSaveHighlightSellerIds(failingPreview.map(x => x.s.sellerId));
      const desc = failingPreview.map(x => x.err).join('\n');
      toast.error(
        failingPreview.length === 1 ? failingPreview[0].err : `Fix ${failingPreview.length} sellers before saving`,
        { description: failingPreview.length > 1 ? desc : undefined, duration: 9000 }
      );
      queueMicrotask(() => {
        document
          .getElementById(`settlement-seller-card-${failingPreview[0].s.sellerId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return false;
    }
    setPattiSaveHighlightSellerIds([]);
    pattiSaveBusyRef.current = true;
    setPattiSaveBusy(true);
    try {
      const failures: string[] = [];
      const sellersNeedingCreate = scopeSellers.filter(s => existingPattiIdBySellerId[s.sellerId] == null);
      let sharedPattiBaseNumber: string | null = draftMainPattiNo || null;
      const sellerSequenceBySellerId: Record<string, number> = {};
      const parseSeqFromPattiId = (pid?: string): number | undefined => {
        const m = String(pid ?? '').trim().match(/^(.*)-(\d+)$/);
        if (!m) return undefined;
        const n = Number(m[2]);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      for (const s of sellersNeedingCreate) {
        const seq = parseSeqFromPattiId(draftPattiNoBySellerId[s.sellerId]);
        if (seq != null) sellerSequenceBySellerId[s.sellerId] = seq;
      }
      if (sellersNeedingCreate.length > 0) {
        const scopedSids = new Set(scopeSellers.map(s => String(s.sellerId)));
        const scopedSaved = savedPattis.filter(p => scopedSids.has(String(p.sellerId ?? '').trim()));
        const parseBaseFromPattiId = (pid?: string): string => {
          const raw = String(pid ?? '').trim();
          const m = raw.match(/^(.*)-(\d+)$/);
          return m ? m[1] : '';
        };
        const parseSequenceFromPattiId = (pid?: string): number | null => {
          const raw = String(pid ?? '').trim();
          const m = raw.match(/^(.*)-(\d+)$/);
          if (!m) return null;
          const n = Number(m[2]);
          return Number.isFinite(n) ? n : null;
        };
        const existingBase =
          scopedSaved.map(p => String(p.pattiBaseNumber ?? '').trim()).find(v => v.length > 0) ||
          scopedSaved.map(p => parseBaseFromPattiId(p.pattiId)).find(v => v.length > 0) ||
          '';
        if (!sharedPattiBaseNumber && existingBase) {
          sharedPattiBaseNumber = existingBase;
        } else if (!sharedPattiBaseNumber) {
          try {
            sharedPattiBaseNumber = await settlementApi.reserveNextPattiBaseNumber(sellersNeedingCreate[0]?.sellerId);
          } catch {
            toast.error('Failed to reserve Sales Patti number.');
            return false;
          }
        }

        let seqCounter = Object.values(sellerSequenceBySellerId).reduce((mx, n) => Math.max(mx, n), 0);
        for (const p of scopedSaved) {
          const pBase =
            String(p.pattiBaseNumber ?? '').trim() ||
            parseBaseFromPattiId(p.pattiId);
          if (!pBase || pBase !== sharedPattiBaseNumber) continue;
          const seqRaw = p.sellerSequenceNumber;
          const seqNum =
            typeof seqRaw === 'number' && Number.isFinite(seqRaw) && seqRaw > 0
              ? seqRaw
              : parseSequenceFromPattiId(p.pattiId);
          if (seqNum != null) seqCounter = Math.max(seqCounter, seqNum);
        }
        for (const seller of sellersNeedingCreate) {
          if (sellerSequenceBySellerId[seller.sellerId] != null) continue;
          seqCounter += 1;
          sellerSequenceBySellerId[seller.sellerId] = seqCounter;
        }
      }
      for (const seller of scopeSellers) {
        const needsCreate = existingPattiIdBySellerId[seller.sellerId] == null;
        const sellerSequenceNumber = needsCreate ? sellerSequenceBySellerId[seller.sellerId] : undefined;
        const ok = await savePattiForSeller(seller, {
          silent: true,
          showPrintAfterSave: false,
          skipBusyGuard: true,
          pattiBaseNumber: needsCreate ? sharedPattiBaseNumber ?? undefined : undefined,
          sellerSequenceNumber: needsCreate ? sellerSequenceNumber : undefined,
        });
        if (!ok) failures.push(seller.sellerName || seller.sellerId);
      }
      if (failures.length > 0) {
        toast.error(`Failed to save ${failures.length} seller patti(s): ${failures.join(', ')}`);
        return false;
      }
      const allInUpdateMode = scopeSellers.every(s => existingPattiIdBySellerId[s.sellerId] != null);
      toast.success(
        `Main patti ${allInUpdateMode ? 'updated' : 'saved'} for all ${scopeSellers.length} seller(s). Use Print when ready.`
      );
      setSettlementFormMode('saved');
      setPattiSaveHighlightSellerIds([]);
      resyncBaselineAfterSaveRef.current = true;
      loadInProgressPattis();
      return true;
    } finally {
      pattiSaveBusyRef.current = false;
      setPattiSaveBusy(false);
    }
  };

  const savePattiInProgress = useCallback(async (): Promise<boolean> => {
    if (!selectedSeller || !pattiData) return false;
    if (pattiSaveBusyRef.current) return false;
    pattiSaveBusyRef.current = true;
    setPattiSaveBusy(true);
    try {
      const scopeSellers = (
        selectedArrivalSellerIds.length > 0
          ? selectedArrivalSellerIds.map(id => sellers.find(s => String(s.sellerId) === String(id)))
          : [selectedSeller]
      ).filter((s): s is SellerSettlement => !!s);
      const failingInProg = scopeSellers
        .map(s => ({ s, err: getSellerValidationError(s) }))
        .filter((x): x is { s: SellerSettlement; err: string } => x.err != null);
      if (failingInProg.length > 0) {
        setPattiSaveHighlightSellerIds(failingInProg.map(x => x.s.sellerId));
        const desc = failingInProg.map(x => x.err).join('\n');
        toast.error(
          failingInProg.length === 1 ? failingInProg[0].err : `Fix ${failingInProg.length} sellers before saving in progress`,
          { description: failingInProg.length > 1 ? desc : undefined, duration: 9000 }
        );
        queueMicrotask(() => {
          document
            .getElementById(`settlement-seller-card-${failingInProg[0].s.sellerId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        return false;
      }
      const failures: string[] = [];
      for (const seller of scopeSellers) {
        const ok = await savePattiForSeller(seller, {
          silent: true,
          showPrintAfterSave: false,
          skipBusyGuard: true,
          inProgress: true,
        });
        if (!ok) failures.push(seller.sellerName || seller.sellerId);
      }
      if (failures.length > 0) {
        toast.error(`Failed to save in-progress patti for ${failures.join(', ')}`);
        return false;
      }
      setPattiSaveHighlightSellerIds([]);
      toast.success('Settlement progress saved.');
      /** Per-seller save sets `resyncBaselineAfterSaveRef`; one explicit sync avoids repeated dirty/baseline churn before navigation. */
      resyncBaselineAfterSaveRef.current = false;
      loadInProgressPattis();
      requestAnimationFrame(() => {
        settlementDirtyBaselineRef.current = settlementWorkspaceSnapshotRef.current;
        setSettlementDirtyNonce(n => n + 1);
      });
      return true;
    } finally {
      pattiSaveBusyRef.current = false;
      setPattiSaveBusy(false);
    }
  }, [
    pattiData,
    savePattiForSeller,
    selectedArrivalSellerIds,
    selectedSeller,
    sellers,
    loadInProgressPattis,
    getSellerValidationError,
  ]);

  const clearActiveSettlementScreen = useCallback(() => {
    settlementWorkspaceHydratingRef.current = false;
    setSelectedSeller(null);
    setSelectedArrivalSellerIds([]);
    setPattiData(null);
    setPattiDetailDto(null);
    setIsOriginalReferenceMode(false);
    setIsLatestEditUnlocked(true);
    settlementDirtyBaselineRef.current = null;
    lastExpenseAutoPullKeyRef.current = '';
    resyncBaselineAfterSaveRef.current = false;
    setSettlementFormMode('idle');
    setSettlementMainTab('arrival-summary');
    setExistingPattiIdBySellerId({});
    setDraftMainPattiNo('');
    setDraftPattiNoBySellerId({});
  }, []);

  const isSettlementDirty = useMemo(() => {
    if (!selectedSeller || !pattiData || showPrint) return false;
    if (isOriginalReferenceMode) return false;
    if (!settlementDirtyBaselineRef.current) return false;
    return settlementWorkspaceSnapshot !== settlementDirtyBaselineRef.current;
  }, [
    selectedSeller,
    pattiData,
    showPrint,
    isOriginalReferenceMode,
    settlementWorkspaceSnapshot,
    settlementDirtyNonce,
  ]);

  const settlementSecondaryTabLabel = useMemo(() => {
    if (settlementFormMode !== 'idle') {
      if (settlementFormMode === 'in-progress') return 'Patti in progress';
      if (settlementFormMode === 'saved') return 'Saved patti';
      if (settlementFormMode === 'new') return 'New patti';
    }
    if (arrivalSummaryTab === 'in-progress-patti') return 'Patti in progress';
    if (arrivalSummaryTab === 'saved-patti') return 'Saved patti';
    return 'Create New Patti';
  }, [settlementFormMode, arrivalSummaryTab]);

  const saveSettlementProgressBeforeLeave = useCallback(async (): Promise<boolean> => {
    if (!selectedSeller || !pattiData) return true;
    return await savePattiInProgress();
  }, [pattiData, savePattiInProgress, selectedSeller]);
  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isSettlementDirty,
    title: 'Save your progress?',
    description: 'You have unsaved changes. Would you like to save your progress before leaving?',
    continueLabel: 'Save Patti In Progress',
    stayLabel: 'Discard',
    closeLabel: 'Stay On Page',
    onBeforeContinue: saveSettlementProgressBeforeLeave,
  });

  saveMainPattiShortcutRef.current = () => {
    if (selectedSeller && !isSettlementFormReadOnly) void savePatti();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 's' && e.key !== 'S')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      saveMainPattiShortcutRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'm' && e.key !== 'M')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!selectedSeller || !pattiData || showPrint) return;
      if (!isOriginalReferenceMode && !isPattiEditLocked) return;
      e.preventDefault();
      enableSettlementEdit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enableSettlementEdit, isOriginalReferenceMode, isPattiEditLocked, pattiData, selectedSeller, showPrint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'o' && e.key !== 'O')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!selectedSeller || !pattiData || showPrint || isOriginalReferenceMode) return;
      e.preventDefault();
      enterOriginalReferenceMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enterOriginalReferenceMode, isOriginalReferenceMode, pattiData, selectedSeller, showPrint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Only apply on seller list screen; avoid conflict with Alt+X inside patti form.
      if (selectedSeller || pattiData || showPrint) return;
      const k = e.key.toLowerCase();
      if (k !== 'x' && k !== 'y' && k !== 'z') return;
      e.preventDefault();
      setSettlementMainTab('arrival-summary');
      if (k === 'x') setArrivalSummaryTab('new-patti');
      else if (k === 'y') setArrivalSummaryTab('in-progress-patti');
      else setArrivalSummaryTab('saved-patti');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedSeller, pattiData, showPrint]);

  function getSellerLots(seller: SellerSettlement): number {
    return seller.lots.reduce((s, l) => s + l.entries.reduce((s2, e) => s2 + e.quantity, 0), 0);
  }

  function getSellerBids(seller: SellerSettlement): number {
    return seller.lots.reduce((s, l) => s + l.entries.length, 0);
  }

  function getSellerWeighed(seller: SellerSettlement): number {
    return seller.lots.reduce((s, l) => s + l.entries.reduce((s2, e) => s2 + (e.weight > 0 ? e.quantity : 0), 0), 0);
  }

  const filteredSellers = useMemo(() => {
    if (!searchQuery) return sellers;
    const q = searchQuery.toLowerCase();
    return sellers.filter(s =>
      s.sellerName.toLowerCase().includes(q) ||
      s.sellerMark.toLowerCase().includes(q) ||
      s.vehicleNumber.toLowerCase().includes(q)
    );
  }, [sellers, searchQuery]);

  const filteredSavedPattis = useMemo(() => {
    if (!searchQuery) return savedPattis;
    const q = searchQuery.toLowerCase();
    return savedPattis.filter(p =>
      (p.pattiId ?? '').toLowerCase().includes(q) ||
      (p.sellerName ?? '').toLowerCase().includes(q)
    );
  }, [savedPattis, searchQuery]);

  const sellerSalesPattiNumberBySellerId = useMemo(() => {
    const map: Record<string, string> = { ...draftPattiNoBySellerId };
    for (const p of savedPattis) {
      const sid = String(p.sellerId ?? '').trim();
      const pid = String(p.pattiId ?? '').trim();
      if (!sid || !pid) continue;
      map[sid] = pid;
    }
    const currentSid = String(selectedSeller?.sellerId ?? '').trim();
    const currentPid = String(pattiData?.pattiId ?? '').trim();
    if (currentSid && currentPid) {
      map[currentSid] = currentPid;
    }
    return map;
  }, [savedPattis, selectedSeller?.sellerId, pattiData?.pattiId, draftPattiNoBySellerId]);

  const displayMainSalesPattiNo = useMemo(() => {
    if (draftMainPattiNo) return draftMainPattiNo;
    const dtoBase = String(pattiDetailDto?.pattiBaseNumber ?? '').trim();
    if (dtoBase) return dtoBase;
    const sid = String(selectedSeller?.sellerId ?? '').trim();
    const sellerPattiNo = sid ? String(sellerSalesPattiNumberBySellerId[sid] ?? '').trim() : '';
    const raw = sellerPattiNo || String(pattiData?.pattiId ?? '').trim();
    const m = raw.match(/^(.*)-(\d+)$/);
    return m ? m[1] : '';
  }, [
    draftMainPattiNo,
    pattiDetailDto?.pattiBaseNumber,
    selectedSeller?.sellerId,
    sellerSalesPattiNumberBySellerId,
    pattiData?.pattiId,
  ]);

  /** Settlement sellers that already have a saved Sales Patti — hide from New Patti tab. */
  const sellerIdsWithSavedPatti = useMemo(() => {
    const set = new Set<string>();
    for (const p of savedPattis) {
      const sid = String(p.sellerId ?? '').trim();
      if (sid) set.add(sid);
    }
    return set;
  }, [savedPattis]);

  /** Sellers already present in in-progress drafts — hide from New Patti tab to avoid duplicates. */
  const sellerIdsWithInProgressPatti = useMemo(() => {
    const set = new Set<string>();
    for (const d of inProgressPattiDrafts) {
      const rep = String(d.representativeSellerId ?? '').trim();
      if (rep) set.add(rep);
      for (const sid of d.sellerIds ?? []) {
        const s = String(sid ?? '').trim();
        if (s) set.add(s);
      }
    }
    return set;
  }, [inProgressPattiDrafts]);

  const sellersEligibleForNewPatti = useMemo(
    () => filteredSellers.filter(s => !sellerIdsWithSavedPatti.has(s.sellerId) && !sellerIdsWithInProgressPatti.has(s.sellerId)),
    [filteredSellers, sellerIdsWithSavedPatti, sellerIdsWithInProgressPatti]
  );

  const newPattiArrivalRows = useMemo<ArrivalSummaryRow[]>(() => {
    const groups = new Map<string, ArrivalSummaryRow>();
    for (const seller of sellersEligibleForNewPatti) {
      const v = (seller.vehicleNumber || '').trim();
      const from = (seller.fromLocation || '').trim();
      const dateRaw = seller.createdAt ?? seller.date ?? '';
      const dateObj = dateRaw ? new Date(dateRaw) : null;
      const dateLabel = dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : '-';
      const key = [v.toLowerCase(), from.toLowerCase(), dateRaw].join('|');
      const existing = groups.get(key);
      const lots = getSellerLots(seller);
      const bids = getSellerBids(seller);
      const weighed = getSellerWeighed(seller);
      if (!existing) {
        groups.set(key, {
          key,
          vehicleNumber: v || '-',
          fromLocation: from || '-',
          serialNo: seller.sellerSerialNo ?? null,
          dateLabel,
          sellerNames: '',
          lots,
          bids,
          weighed,
          sellerIds: [seller.sellerId],
          representativeSeller: seller,
        });
        continue;
      }
      existing.lots += lots;
      existing.bids += bids;
      existing.weighed += weighed;
      if (!existing.sellerIds.includes(seller.sellerId)) existing.sellerIds.push(seller.sellerId);
      if (existing.serialNo == null && seller.sellerSerialNo != null) existing.serialNo = seller.sellerSerialNo;
    }
    const eligibleById = new Map(sellersEligibleForNewPatti.map(s => [String(s.sellerId), s]));
    return Array.from(groups.values()).map(row => {
      const first = pickFirstArrivalSeller(row.sellerIds, eligibleById) ?? row.representativeSeller;
      return {
        ...row,
        sellerNames: firstArrivalSellerLabel(row.sellerIds, eligibleById),
        representativeSeller: first,
        serialNo: first.sellerSerialNo ?? row.serialNo,
      };
    });
  }, [sellersEligibleForNewPatti]);

  const savedPattiArrivalRows = useMemo<SavedArrivalSummaryRow[]>(() => {
    const groups = new Map<string, SavedArrivalSummaryRow & { _fallbackName?: string }>();
    const sellerById = new Map<string, SellerSettlement>(sellers.map(s => [String(s.sellerId), s]));
    for (const p of filteredSavedPattis) {
      const vehicleNumber = (p.vehicleNumber || '').trim();
      const fromLocation = (p.fromLocation || '').trim();
      const serialNo = p.sellerSerialNo ?? null;
      const dateRaw = (p.date ?? p.createdAt ?? '').toString();
      const dateObj = dateRaw ? new Date(dateRaw) : null;
      const dateLabel = dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : '-';
      const key = [vehicleNumber.toLowerCase(), fromLocation.toLowerCase(), dateRaw].join('|');
      const existing = groups.get(key);
      const sid = p.sellerId ? String(p.sellerId) : '';
      const seller = sid ? sellerById.get(sid) : undefined;
      const lots = seller ? getSellerLots(seller) : 0;
      const bids = seller ? getSellerBids(seller) : 0;
      const weighed = seller ? getSellerWeighed(seller) : 0;
      if (!existing) {
        groups.set(key, {
          key,
          vehicleNumber: vehicleNumber || '-',
          fromLocation: fromLocation || '-',
          serialNo,
          dateLabel,
          sellerNames: '',
          sellerIds: sid ? [sid] : [],
          lots,
          bids,
          weighed,
          representativePattiId: p.id ?? null,
          _fallbackName: (p.sellerName || '').trim() || undefined,
        });
        continue;
      }
      if (sid && !existing.sellerIds.includes(sid)) {
        existing.sellerIds.push(sid);
        existing.lots += lots;
        existing.bids += bids;
        existing.weighed += weighed;
      }
      if (existing.serialNo == null && serialNo != null) existing.serialNo = serialNo;
      if (existing.representativePattiId == null && p.id != null) existing.representativePattiId = p.id;
      if (!existing._fallbackName && (p.sellerName || '').trim()) {
        existing._fallbackName = (p.sellerName || '').trim();
      }
    }
    return Array.from(groups.values()).map(row => {
      const { _fallbackName, ...rest } = row;
      const first = pickFirstArrivalSeller(rest.sellerIds, sellerById);
      return {
        ...rest,
        sellerNames: firstArrivalSellerLabel(rest.sellerIds, sellerById, _fallbackName),
        serialNo: first?.sellerSerialNo ?? rest.serialNo,
      };
    });
  }, [filteredSavedPattis, sellers]);

  /** Vehicle-level summary for the patti form (first row unchanged; this drives the second card). */
  const vehicleFormDetails = useMemo(() => {
    if (!selectedSeller || !pattiData) return null;

    const vKey = normalizeVehicleKey(selectedSeller.vehicleNumber);
    const sameVehicleSellers = vKey ? sellers.filter(s => normalizeVehicleKey(s.vehicleNumber) === vKey) : [];
    const scope = sameVehicleSellers.length > 0 ? sameVehicleSellers : [selectedSeller];
    const pattiNetWeight = scope.reduce((sum, seller) => {
      const removed = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
      const ov = lotSalesOverridesBySellerId[seller.sellerId];
      const extras = extraBidLotsBySellerId[seller.sellerId] ?? [];
      const recountClusters = buildRateClustersFromSellerLots(seller, removed, ov, getLotDivisor, extras);
      return sum + recountClusters.reduce((s, c) => s + (Number(c.totalWeight) || 0), 0);
    }, 0);

    const scopeHasLotData = scope.some(s => s.lots.some(l => (l.entries?.length ?? 0) > 0));

    let arrivalWeightVehicleKg: number | null = null;
    for (const s of scope) {
      const w = vehicleArrivalNetBillableKgForSeller(s);
      if (w != null) {
        arrivalWeightVehicleKg = w;
        break;
      }
    }

    const arrivalQty = scope.reduce((acc, s) => acc + totalArrivalBagsForSeller(s), 0);
    const salesPadNetWeight = scope.reduce((acc, s) => acc + totalBillingNetWeightForSeller(s), 0);

    return {
      vKey,
      sellersCount: vKey ? scope.length : null,
      arrivalQty: scopeHasLotData ? arrivalQty : null,
      arrivalWeightKg: scopeHasLotData ? arrivalWeightVehicleKg : null,
      salesPadNetWeightKg: scopeHasLotData ? salesPadNetWeight : null,
      pattiNetWeightKg: pattiNetWeight,
    };
  }, [
    sellers,
    selectedSeller,
    pattiData,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
  ]);

  /** All sellers on the same vehicle as the current settlement (arrival scope). */
  const arrivalSellersForPatti = useMemo(() => {
    if (!selectedSeller || !pattiData) return [];
    if (selectedArrivalSellerIds.length > 0) {
      const scoped = sellers.filter(s => selectedArrivalSellerIds.includes(s.sellerId));
      if (scoped.length > 0) return scoped;
    }
    const vKey = normalizeVehicleKey(selectedSeller.vehicleNumber);
    if (!vKey) return [selectedSeller];
    const scope = sellers.filter(s => normalizeVehicleKey(s.vehicleNumber) === vKey);
    return scope.length > 0 ? scope : [selectedSeller];
  }, [sellers, selectedSeller, pattiData, selectedArrivalSellerIds]);

  /** First seller on the vehicle — main patti print header (no “+N others”). */
  const mainPattiPrintHeaderIdentity = useMemo(() => {
    const s = arrivalSellersForPatti[0];
    if (!s) return null;
    const form = sellerFormById[s.sellerId] ?? defaultSellerForm(s);
    return {
      sellerName: (form.name || s.sellerName || '').trim(),
      sellerMobile: form.mobile || s.sellerPhone || '',
      sellerAddress: s.fromLocation || '',
      vehicleNumber: s.vehicleNumber || '',
    };
  }, [arrivalSellersForPatti, sellerFormById]);

  const mainPattiValidationError = useMemo(() => {
    if (!pattiData) return 'Patti is not generated yet';
    if (arrivalSellersForPatti.length === 0) return 'No sellers available for this main patti';
    const errs: string[] = [];
    for (const seller of arrivalSellersForPatti) {
      const err = getSellerValidationError(seller);
      if (err) errs.push(err);
    }
    if (errs.length === 0) return null;
    return errs.join(' | ');
  }, [pattiData, arrivalSellersForPatti, getSellerValidationError]);

  const canRunMainPattiActions = mainPattiValidationError == null;

  const settlementPrintPermissionError = useMemo(() => {
    if (!pattiData) return null;
    for (const s of arrivalSellersForPatti) {
      const form = sellerFormById[s.sellerId] ?? defaultSellerForm(s);
      const msg = settlementSellerPrintGateMessage(s, form);
      if (msg) return msg;
    }
    return null;
  }, [pattiData, arrivalSellersForPatti, sellerFormById]);

  const isMainUpdateMode = useMemo(
    () =>
      arrivalSellersForPatti.length > 0 &&
      arrivalSellersForPatti.every(s => existingPattiIdBySellerId[s.sellerId] != null),
    [arrivalSellersForPatti, existingPattiIdBySellerId]
  );

  const arrivalSalesReportSellerIdsKey = useMemo(
    () => arrivalSellersForPatti.map(s => s.sellerId).join(','),
    [arrivalSellersForPatti]
  );
  const arrivalFreightBaselineKey = useMemo(
    () =>
      `${selectedSeller?.sellerId ?? ''}__${selectedSeller?.vehicleId ?? ''}__${arrivalSalesReportSellerIdsKey}__${pattiData?.createdAt ?? ''}`,
    [selectedSeller?.sellerId, selectedSeller?.vehicleId, arrivalSalesReportSellerIdsKey, pattiData?.createdAt]
  );

  /** Vehicle-level net payable across all visible seller cards in current patti scope. */
  const vehicleNetPayableFromPatti = useMemo(() => {
    if (!selectedSeller || !pattiData || arrivalSellersForPatti.length === 0) return 0;
    return arrivalSellersForPatti.reduce((sum, seller) => {
      const exp = sellerExpensesById[seller.sellerId] ?? defaultSellerExpenses();
      const removedSet = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
      const lotOv = lotSalesOverridesBySellerId[seller.sellerId] ?? {};
      const extras = extraBidLotsBySellerId[seller.sellerId] ?? [];
      const amountFromApi = (seller.lots ?? [])
        .map((lot, i) => ({ lot, sid: lotStableId(lot, i) }))
        .filter(x => !removedSet.has(x.sid))
        .map(({ lot, sid }) => mergeLotDisplayRow(lot, lotOv[sid], getLotDivisor(lot)))
        .reduce((s, r) => s + r.amount, 0);
      const amountFromExtras = extras.reduce((s, e) => {
        const lot = settlementLotFromExtraBid(e);
        const row = mergeLotDisplayRow(lot, undefined, getLotDivisor(lot));
        return s + row.amount;
      }, 0);
      const amountTot = amountFromApi + amountFromExtras;
      const expenseTotal = totalSellerExpenses(
        exp,
        isWeighingEnabledForSeller(seller.sellerId),
        isWeighingMergedIntoFreight(seller.sellerId)
      );
      return sum + (amountTot - expenseTotal);
    }, 0);
  }, [
    selectedSeller,
    pattiData,
    arrivalSellersForPatti,
    sellerExpensesById,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
    settlementWeighingEnabledBySellerId,
    isWeighingEnabledForSeller,
    isWeighingMergedIntoFreight,
  ]);

  const amountSummaryDisplay = useMemo(() => {
    const runtimeFreight = arrivalSellersForPatti.reduce((sum, s) => {
      const exp = sellerExpensesById[s.sellerId];
      return sum + (exp?.freight ?? 0);
    }, 0);
    const runtimeInvoicePayable = vehicleNetPayableFromPatti;
    /** Arrival vehicle freight: only from API or arrivals module scan — never from expense-card edits (those drive invoiced/runtime only). */
    const apiArrival = amountSummaryFromApi.arrivalFreightAmount;
    const arrivalDisplay = apiArrival > 0 ? apiArrival : arrivalFreightBaseline;
    return {
      arrivalFreightAmount: arrivalDisplay,
      freightInvoiced:
        amountSummaryFromApi.freightInvoiced > 0 ? amountSummaryFromApi.freightInvoiced : runtimeFreight,
      payableInvoiced:
        amountSummaryFromApi.payableInvoiced !== 0 ? amountSummaryFromApi.payableInvoiced : runtimeInvoicePayable,
    };
  }, [arrivalSellersForPatti, sellerExpensesById, amountSummaryFromApi, vehicleNetPayableFromPatti, arrivalFreightBaseline]);
  amountSummaryForExpensePullRef.current = amountSummaryDisplay;

  /**
   * Saved patti, after Enable edit (Alt+M): sticky compare summary. Hidden while viewing original snapshot (Alt+O).
   * Uses same figures as Vehicle details and Expenses & Invoice where noted.
   */
  const savedPattiCompareStickyFooter = useMemo(() => {
    if (
      !isLatestEditUnlocked ||
      isOriginalReferenceMode ||
      settlementFormMode !== 'saved' ||
      !pattiData ||
      !selectedSeller
    ) {
      return null;
    }
    const sellersInScope = arrivalSellersForPatti;
    if (sellersInScope.length === 0) return null;
    const sessionMap = sessionOriginalSnapshotJsonBySellerIdRef.current;
    const hasAnyOriginal = sellersInScope.some(
      s => readOriginalGrossForSellerId(s.sellerId, sessionMap, pattiDetailDto) != null,
    );
    if (!hasAnyOriginal) return null;

    let billOriginalAmt: number | null = 0;
    let allSellersHaveOriginalGross = true;
    for (const s of sellersInScope) {
      const g = readOriginalGrossForSellerId(s.sellerId, sessionMap, pattiDetailDto);
      if (g == null) {
        allSellersHaveOriginalGross = false;
        break;
      }
      billOriginalAmt += g;
    }
    if (!allSellersHaveOriginalGross) {
      billOriginalAmt = null;
    }

    const arrivalWeightKg = vehicleFormDetails?.arrivalWeightKg ?? null;
    const fromSalesAuction = auctionAmountBaseline;
    const pattiNetWtKg = vehicleFormDetails?.pattiNetWeightKg ?? null;
    const rateDiff =
      billOriginalAmt != null && Number.isFinite(billOriginalAmt) && Number.isFinite(fromSalesAuction)
        ? billOriginalAmt - fromSalesAuction
        : null;
    const weightDiff =
      arrivalWeightKg != null && pattiNetWtKg != null ? arrivalWeightKg - pattiNetWtKg : null;
    return {
      billOriginalAmt,
      arrivalWeightKg,
      fromSalesAuction,
      pattiNetWtKg,
      rateDiff,
      weightDiff,
    };
  }, [
    isLatestEditUnlocked,
    isOriginalReferenceMode,
    settlementFormMode,
    pattiData,
    selectedSeller,
    pattiDetailDto,
    vehicleFormDetails,
    auctionAmountBaseline,
    arrivalSellersForPatti,
    pattiOriginalHydrationNonce,
  ]);

  useEffect(() => {
    if (!selectedSeller || !pattiData) {
      setArrivalFreightBaseline(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const vidRaw =
        selectedSeller.vehicleId ??
        arrivalSellersForPatti.find(s => s.vehicleId != null && Number.isFinite(Number(s.vehicleId)))?.vehicleId;
      const vid = vidRaw != null && Number(vidRaw) > 0 ? Number(vidRaw) : null;

      if (vid != null) {
        try {
          const detail = await arrivalsApi.getById(vid);
          if (!cancelled) setArrivalFreightBaseline(Number(detail.freightTotal ?? 0));
        } catch {
          if (!cancelled) setArrivalFreightBaseline(0);
        }
        return;
      }

      let fromArrival = 0;
      const candidateVehicle =
        selectedSeller.vehicleNumber ||
        arrivalSellersForPatti.find(s => (s.vehicleNumber || '').trim().length > 0)?.vehicleNumber ||
        '';
      const vKey = normalizeVehicleKey(candidateVehicle);
      if (vKey) {
        try {
          const size = 200;
          for (let page = 0; page < 25; page += 1) {
            const summaries = await arrivalsApi.list(page, size);
            if (!Array.isArray(summaries) || summaries.length === 0) break;
            const match = summaries.find(s => normalizeVehicleKey(String(s.vehicleNumber)) === vKey);
            if (match) {
              fromArrival = Number(match.freightTotal ?? 0);
              break;
            }
            if (summaries.length < size) break;
          }
        } catch {
          fromArrival = 0;
        }
      }
      if (!cancelled) setArrivalFreightBaseline(fromArrival);
    })();
    return () => {
      cancelled = true;
    };
  }, [arrivalFreightBaselineKey, arrivalSellersForPatti, selectedSeller]);

  useEffect(() => {
    if (!selectedSeller || !pattiData) {
      setSalesPadNetWeightBaseline(0);
      setAuctionAmountBaseline(0);
      setAuctionQtyBaseline(0);
      setAuctionWeightBaseline(0);
      return;
    }
    const scope = arrivalSellersForPatti;
    const salesPad = scope.reduce((acc, s) => acc + totalBillingNetWeightForSeller(s), 0);
    const auction = scope.reduce(
      (acc, seller) => {
        const rows = (seller.lots ?? []).map(lot => lotBaseSalesRow(lot, getLotDivisor(lot), 'original'));
        return {
          qty: acc.qty + rows.reduce((s, r) => s + (Number(r.qty) || 0), 0),
          weight: acc.weight + rows.reduce((s, r) => s + (Number(r.weight) || 0), 0),
          amount: acc.amount + rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
        };
      },
      { qty: 0, weight: 0, amount: 0 }
    );
    setSalesPadNetWeightBaseline(salesPad);
    setAuctionAmountBaseline(auction.amount);
    setAuctionQtyBaseline(auction.qty);
    setAuctionWeightBaseline(auction.weight);
  }, [arrivalFreightBaselineKey]);

  const handleSalesReportCarouselScroll = useCallback(() => {
    const el = salesReportCarouselRef.current;
    const n = arrivalSellersForPatti.length;
    if (!el || n <= 0) return;
    const step = el.scrollWidth / n;
    if (step <= 0) return;
    const idx = Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / step)));
    setActiveSalesReportSlide(idx);
  }, [arrivalSellersForPatti.length]);

  useEffect(() => {
    setActiveSalesReportSlide(0);
    salesReportCarouselRef.current?.scrollTo({ left: 0 });
  }, [selectedSeller?.sellerId, arrivalSalesReportSellerIdsKey]);

  useEffect(() => {
    if (!selectedSeller || !pattiData) return;
    if (isSettlementFormReadOnly) return;
    setSellerFormById(prev => {
      let changed = false;
      const next = { ...prev };
      for (const s of arrivalSellersForPatti) {
        if (!next[s.sellerId]) {
          changed = true;
          next[s.sellerId] = defaultSellerForm(s);
        }
      }
      return changed ? next : prev;
    });
    setRegisteredBaselineById(prev => {
      let changed = false;
      const next = { ...prev };
      for (const s of arrivalSellersForPatti) {
        if (!next[s.sellerId]) {
          changed = true;
          next[s.sellerId] = defaultSellerForm(s);
        }
      }
      return changed ? next : prev;
    });
    setSellerExpensesById(prev => {
      let changed = false;
      const next = { ...prev };
      for (const s of arrivalSellersForPatti) {
        if (!next[s.sellerId]) {
          changed = true;
          next[s.sellerId] = { freight: 0, unloading: 0, weighman: 0, cashAdvance: 0, gunnies: 0, others: 0 };
        }
      }
      return changed ? next : prev;
    });
  }, [arrivalSellersForPatti, selectedSeller, pattiData, isSettlementFormReadOnly]);

  /**
   * Pull unloading / weighing (same slab + per-bag split as Quick Adjustment), freight by weight share, cash advance from API.
   * Runs once per newly opened bill (no DB row yet). Intentionally does not depend on arrival freight display
   * updates — re-running would overwrite seller-level edits and look like “save then data reverted”.
   * Latest freight is read from `amountSummaryForExpensePullRef` when the async work finishes.
   */
  useEffect(() => {
    if (!pattiData || arrivalSellersForPatti.length === 0) {
      lastExpenseAutoPullKeyRef.current = '';
      return;
    }
    if (Object.keys(existingPattiIdBySellerId).length > 0) return;
    if (quickAdjustmentAppliedRef.current) return;
    const pullKey = `${pattiData.createdAt ?? ''}|${arrivalSalesReportSellerIdsKey}`;
    if (lastExpenseAutoPullKeyRef.current === pullKey) return;

    let cancelled = false;
    void (async () => {
      const [snapBySellerId, configsRaw, commoditiesRaw] = await Promise.all([
        Promise.all(
          arrivalSellersForPatti.map(async s => {
            try {
              return { id: s.sellerId, snap: await settlementApi.getSellerExpenseSnapshot(s.sellerId) };
            } catch {
              return { id: s.sellerId, snap: null };
            }
          })
        ).then(rows => {
          const m: Record<string, Awaited<ReturnType<typeof settlementApi.getSellerExpenseSnapshot>> | null> = {};
          for (const r of rows) m[r.id] = r.snap;
          return m;
        }),
        commodityApi.getAllFullConfigs(),
        commodityApi.list(),
      ]);
      if (cancelled) return;
      if (quickAdjustmentAppliedRef.current) return;

      const configs = Array.isArray(configsRaw) ? configsRaw : [];
      const commodities = Array.isArray(commoditiesRaw) ? commoditiesRaw : [];
      const nameToId = new Map(
        commodities.map(c => [String(c.commodity_name || '').trim().toLowerCase(), Number(c.commodity_id)])
      );
      const configById = new Map(configs.map(c => [c.commodityId, c]));
      const getDivisorLocal = (lot: SettlementLot) => {
        const n = (lot.commodityName || '').trim().toLowerCase();
        const cid = nameToId.get(n);
        if (cid == null) return 50;
        const d = Number(configById.get(cid)?.config?.ratePerUnit);
        return d > 0 ? d : 50;
      };

      const sellerSlabBase = buildSellerSlabChargeBaseForPattiSellers(
        arrivalSellersForPatti,
        removedLotsBySellerId,
        lotSalesOverridesBySellerId,
        extraBidLotsBySellerId,
        nameToId,
        configById,
        getDivisorLocal
      );
      const unloadingTotal = sellerSlabBase.reduce((sum, r) => sum + (Number(r.unloading) || 0), 0);
      const weighingTotal = sellerSlabBase.reduce((sum, r) => sum + (Number(r.weighing) || 0), 0);
      const totalQty = sellerSlabBase.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
      const totalActualWeight = sellerSlabBase.reduce((sum, r) => sum + (Number(r.actualWeight) || 0), 0);
      const nSellers = arrivalSellersForPatti.length;
      const perBagUnloading = totalQty > 0 ? unloadingTotal / totalQty : 0;
      const perBagWeighing = totalQty > 0 ? weighingTotal / totalQty : 0;
      const equalShareUnloading = nSellers > 0 ? unloadingTotal / nSellers : 0;
      const equalShareWeighing = nSellers > 0 ? weighingTotal / nSellers : 0;

      const freightTotal = Math.max(0, Number(amountSummaryForExpensePullRef.current.arrivalFreightAmount) || 0);
      const perKgFreight = totalActualWeight > 0 ? freightTotal / totalActualWeight : 0;

      if (cancelled) return;
      if (quickAdjustmentAppliedRef.current) return;

      setSellerExpensesById(prev => {
        const next = { ...prev };
        const baselinePatch: Record<string, SellerExpenseFormState> = {};
        for (const row of sellerSlabBase) {
          const snap = snapBySellerId[row.sellerId];
          const prevRow = prev[row.sellerId] ?? defaultSellerExpenses();
          const computedFreight =
            perKgFreight > 0 ? roundMoney2(perKgFreight * (row.actualWeight ?? 0)) : prevRow.freight;
          const computedUnloading =
            perBagUnloading > 0
              ? roundMoney2(perBagUnloading * row.quantity)
              : equalShareUnloading > 0
                ? roundMoney2(equalShareUnloading)
                : prevRow.unloading;
          const computedWeighing =
            perBagWeighing > 0
              ? roundMoney2(perBagWeighing * row.quantity)
              : equalShareWeighing > 0
                ? roundMoney2(equalShareWeighing)
                : prevRow.weighman;
          const updated: SellerExpenseFormState = {
            ...prevRow,
            freight: computedFreight,
            unloading: computedUnloading,
            weighman: computedWeighing,
            cashAdvance: snap != null ? Number(snap.cashAdvance ?? prevRow.cashAdvance) : prevRow.cashAdvance,
          };
          next[row.sellerId] = updated;
          baselinePatch[row.sellerId] = { ...updated };
        }
        if (Object.keys(baselinePatch).length > 0) {
          queueMicrotask(() => {
            setSellerExpenseRestoreBaselineById(bPrev => ({ ...bPrev, ...baselinePatch }));
          });
        }
        return next;
      });
      lastExpenseAutoPullKeyRef.current = pullKey;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: do not re-run when lot rows / overrides change (would overwrite user edits)
  }, [pattiData?.createdAt, arrivalSalesReportSellerIdsKey, existingPattiIdBySellerId]);

  useEffect(() => {
    quickAdjustmentAppliedRef.current = false;
  }, [pattiData?.createdAt, arrivalSalesReportSellerIdsKey]);

  /** Main patti deduction lines mirror primary seller expenses + weighing toggles. */
  useEffect(() => {
    if (!selectedSeller || !pattiData) return;
    if (isSettlementFormReadOnly) return;
    const exp = sellerExpensesById[selectedSeller.sellerId] ?? defaultSellerExpenses();
    const deds = buildDeductionItemsFromSellerExpenses(
      exp,
      coolieMode,
      isWeighingEnabledForSeller(selectedSeller.sellerId),
      isWeighingMergedIntoFreight(selectedSeller.sellerId)
    );
    const total = deds.reduce((s, d) => s + d.amount, 0);
    setPattiData(prev => {
      if (!prev) return null;
      if (Math.abs(prev.totalDeductions - total) < 1e-9 && JSON.stringify(prev.deductions) === JSON.stringify(deds)) {
        return prev;
      }
      return { ...prev, deductions: deds, totalDeductions: total, netPayable: prev.grossAmount - total };
    });
  }, [
    selectedSeller?.sellerId,
    sellerExpensesById,
    coolieMode,
    settlementWeighingEnabledBySellerId,
    isWeighingEnabledForSeller,
    isWeighingMergedIntoFreight,
    isSettlementFormReadOnly,
  ]);

  /** Keep main patti rate clusters / gross in sync with lot row edits (primary seller only). */
  useEffect(() => {
    if (!selectedSeller) return;
    if (isSettlementFormReadOnly) return;
    const hasApiLots = (selectedSeller.lots?.length ?? 0) > 0;
    const hasExtras = (extraBidLotsBySellerId[selectedSeller.sellerId]?.length ?? 0) > 0;
    if (!hasApiLots && !hasExtras) return;
    setPattiData(prev => {
      if (!prev) return null;
      const removed = new Set(removedLotsBySellerId[selectedSeller.sellerId] ?? []);
      const ov = lotSalesOverridesBySellerId[selectedSeller.sellerId];
      const extras = extraBidLotsBySellerId[selectedSeller.sellerId] ?? [];
      const clusters = buildRateClustersFromSellerLots(selectedSeller, removed, ov, getLotDivisor, extras);
      const gross = clusters.reduce((s, c) => s + c.amount, 0);
      const sameGross = Math.abs(prev.grossAmount - gross) < 0.01;
      const sameClusters = JSON.stringify(prev.rateClusters) === JSON.stringify(clusters);
      if (sameGross && sameClusters) return prev;
      return { ...prev, rateClusters: clusters, grossAmount: gross, netPayable: gross - prev.totalDeductions };
    });
  }, [
    selectedSeller,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
    isSettlementFormReadOnly,
  ]);

  const runSellerContactSearch = useCallback(async (sellerId: string, query: string) => {
    setSellerContactSearchLoading(prev => ({ ...prev, [sellerId]: true }));
    try {
      const list = query.trim()
        ? await contactApi.search(query.trim())
        : await contactApi.list({ scope: 'participants' });
      setSellerContactSearchById(prev => ({ ...prev, [sellerId]: list }));
    } catch {
      toast.error('Contact search failed');
    } finally {
      setSellerContactSearchLoading(prev => ({ ...prev, [sellerId]: false }));
    }
  }, []);

  const sellerMarkSearchTimersRef = useRef<Record<string, number>>({});
  const scheduleMarkContactSearch = useCallback(
    (sellerId: string, query: string) => {
      window.clearTimeout(sellerMarkSearchTimersRef.current[sellerId]);
      sellerMarkSearchTimersRef.current[sellerId] = window.setTimeout(() => {
        void runSellerContactSearch(sellerId, query);
      }, 350);
    },
    [runSellerContactSearch]
  );

  const setLotSalesField = useCallback((sellerId: string, sid: string, field: keyof LotSalesOverride, raw: string) => {
    setLotSalesOverridesBySellerId(prev => {
      const curSeller = { ...(prev[sellerId] ?? {}) };
      const curLot = { ...(curSeller[sid] ?? {}) };
      if (raw.trim() === '') {
        delete curLot[field];
      } else {
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return prev;
        curLot[field] = field === 'qty' ? Math.round(n) : n;
      }
      if (Object.keys(curLot).length === 0) {
        delete curSeller[sid];
      } else {
        curSeller[sid] = curLot;
      }
      if (Object.keys(curSeller).length === 0) {
        const next = { ...prev };
        delete next[sellerId];
        return next;
      }
      return { ...prev, [sellerId]: curSeller };
    });
  }, []);

  const updateExtraBidLotField = useCallback(
    (sellerId: string, extraId: string, field: 'qty' | 'weight' | 'ratePerBag', raw: string) => {
      if (raw.trim() === '') return;
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return;
      setExtraBidLotsBySellerId(prev => {
        const list = [...(prev[sellerId] ?? [])];
        const idx = list.findIndex(e => e.id === extraId);
        if (idx < 0) return prev;
        const cur = { ...list[idx] };
        if (field === 'qty') cur.qty = Math.max(0, Math.round(n));
        else if (field === 'weight') cur.weight = Math.max(0, n);
        else cur.ratePerBag = Math.max(0, n);
        list[idx] = cur;
        return { ...prev, [sellerId]: list };
      });
    },
    []
  );

  const updateExtraBidLotName = useCallback((sellerId: string, extraId: string, lotName: string) => {
    setExtraBidLotsBySellerId(prev => {
      const list = [...(prev[sellerId] ?? [])];
      const idx = list.findIndex(e => e.id === extraId);
      if (idx < 0) return prev;
      list[idx] = { ...list[idx], lotName: lotName.trim() };
      return { ...prev, [sellerId]: list };
    });
  }, []);

  useEffect(() => {
    if (!isSettlementFormReadOnly) return;
    setSplitGroupsById({});
    setActiveSplitGroupIdBySellerId({});
  }, [isSettlementFormReadOnly]);

  /** Qty/weight sync only inside active split group; totals stay constant. */
  const applySplitGroupQtyWeightSync = useCallback(
    (
      seller: SellerSettlement,
      snap: SplitGroupSnapshot,
      editedKey: SalesRowOrderKey,
      field: 'qty' | 'weight',
      raw: string
    ) => {
      if (raw.trim() === '') return;
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return;
      if (activeSplitGroupIdBySellerIdRef.current[seller.sellerId] !== snap.splitGroupId) return;
      const partnerKey = editedKey === snap.rowKeyA ? snap.rowKeyB : snap.rowKeyA;
      const sid = seller.sellerId;
      const pEdit = parseSalesRowOrderKey(editedKey);
      const pPartner = parseSalesRowOrderKey(partnerKey);
      if (!pEdit || !pPartner) return;

      if (field === 'qty') {
        const qE = Math.max(0, Math.min(Math.round(n), snap.totalQty));
        const qP = snap.totalQty - qE;
        /** Keep total weight fixed; split by bag share so avg kg/bag matches across both rows. */
        let wE = 0;
        let wP = 0;
        if (snap.totalQty > 0 && snap.totalWeight > 0) {
          wE = (qE / snap.totalQty) * snap.totalWeight;
          wP = snap.totalWeight - wE;
        } else if (snap.totalWeight > 0) {
          wP = snap.totalWeight;
        }
        const applyQtyWeight = (key: SalesRowOrderKey, q: number, w: number) => {
          const p = parseSalesRowOrderKey(key);
          if (!p) return;
          if (p.type === 'api') {
            setLotSalesOverridesBySellerId(prevOv => {
              const curSeller = { ...(prevOv[sid] ?? {}) };
              const lo = { ...(curSeller[p.sid] ?? {}) };
              lo.qty = q;
              lo.weight = w;
              curSeller[p.sid] = lo;
              return { ...prevOv, [sid]: curSeller };
            });
          } else {
            setExtraBidLotsBySellerId(prevEx => {
              const list = [...(prevEx[sid] ?? [])];
              const i = list.findIndex(e => e.id === p.id);
              if (i < 0) return prevEx;
              list[i] = { ...list[i], qty: q, weight: w };
              return { ...prevEx, [sid]: list };
            });
          }
        };
        flushSync(() => {
          applyQtyWeight(editedKey, qE, wE);
        });
        applyQtyWeight(partnerKey, qP, wP);
        return;
      }

      const wE = Math.max(0, Math.min(n, snap.totalWeight));
      const wP = snap.totalWeight - wE;
      if (pEdit.type === 'api') {
        flushSync(() => {
          setLotSalesOverridesBySellerId(prevOv => {
            const curSeller = { ...(prevOv[sid] ?? {}) };
            const lo = { ...(curSeller[pEdit.sid] ?? {}) };
            lo.weight = wE;
            curSeller[pEdit.sid] = lo;
            return { ...prevOv, [sid]: curSeller };
          });
        });
      } else {
        flushSync(() => {
          setExtraBidLotsBySellerId(prevEx => {
            const list = [...(prevEx[sid] ?? [])];
            const i = list.findIndex(e => e.id === pEdit.id);
            if (i < 0) return prevEx;
            list[i] = { ...list[i], weight: wE };
            return { ...prevEx, [sid]: list };
          });
        });
      }
      if (pPartner.type === 'api') {
        setLotSalesOverridesBySellerId(prevOv => {
          const curSeller = { ...(prevOv[sid] ?? {}) };
          const lo = { ...(curSeller[pPartner.sid] ?? {}) };
          lo.weight = wP;
          curSeller[pPartner.sid] = lo;
          return { ...prevOv, [sid]: curSeller };
        });
      } else {
        setExtraBidLotsBySellerId(prevEx => {
          const list = [...(prevEx[sid] ?? [])];
          const i = list.findIndex(e => e.id === pPartner.id);
          if (i < 0) return prevEx;
          list[i] = { ...list[i], weight: wP };
          return { ...prevEx, [sid]: list };
        });
      }
    },
    []
  );

  const commitSplitGroup = useCallback((splitGroupId: string) => {
    const snap = splitGroupsByIdRef.current[splitGroupId];
    if (!snap) return;
    const sid = snap.sellerId;
    setSplitGroupsById(prev => {
      if (!prev[splitGroupId]) return prev;
      const next = { ...prev };
      delete next[splitGroupId];
      return next;
    });
    setActiveSplitGroupIdBySellerId(prev =>
      prev[sid] === splitGroupId ? { ...prev, [sid]: null } : prev
    );
  }, []);

  const cancelSplitGroup = useCallback((splitGroupId: string) => {
    const snap = splitGroupsByIdRef.current[splitGroupId];
    if (!snap) return;
    const sid = snap.sellerId;
    const cr = snap.cancelRestore;

    if (cr.kind === 'api_plus_extra') {
      const { apiSid, prevApiOverride, newExtraId } = cr;
      const kRm = salesRowKeyExtra(newExtraId);
      setExtraBidLotsBySellerId(prevEx => ({
        ...prevEx,
        [sid]: (prevEx[sid] ?? []).filter(e => e.id !== newExtraId),
      }));
      setLotSalesOverridesBySellerId(prevOv => {
        const curSeller = { ...(prevOv[sid] ?? {}) };
        const has = hasLotSalesOverride(prevApiOverride);
        if (!has) {
          delete curSeller[apiSid];
        } else {
          curSeller[apiSid] = { ...prevApiOverride };
        }
        if (Object.keys(curSeller).length === 0) {
          const next = { ...prevOv };
          delete next[sid];
          return next;
        }
        return { ...prevOv, [sid]: curSeller };
      });
      setSalesReportRowOrderBySellerId(prevOr => {
        const ord = prevOr[sid];
        if (!ord?.length) return prevOr;
        return { ...prevOr, [sid]: ord.filter(k => k !== kRm) };
      });
    } else {
      const { firstExtraId, newExtraId, originalExtra } = cr;
      setExtraBidLotsBySellerId(prevEx => {
        const list = [...(prevEx[sid] ?? [])];
        const i1 = list.findIndex(e => e.id === firstExtraId);
        const i2 = list.findIndex(e => e.id === newExtraId);
        if (i1 < 0 || i2 < 0) return prevEx;
        const lo = Math.min(i1, i2);
        const hi = Math.max(i1, i2);
        list.splice(lo, hi - lo + 1, { ...originalExtra });
        return { ...prevEx, [sid]: list };
      });
      setSalesReportRowOrderBySellerId(prevOr => {
        const ord = [...(prevOr[sid] ?? [])];
        const kNew = salesRowKeyExtra(newExtraId);
        return { ...prevOr, [sid]: ord.filter(k => k !== kNew) };
      });
    }

    setSplitGroupsById(prev => {
      if (!prev[splitGroupId]) return prev;
      const next = { ...prev };
      delete next[splitGroupId];
      return next;
    });
    setActiveSplitGroupIdBySellerId(prev =>
      prev[sid] === splitGroupId ? { ...prev, [sid]: null } : prev
    );
  }, []);

  const splitInlineSalesTableRow = useCallback(
    (
      seller: SellerSettlement,
      tr: SettlementSalesTableRow,
      merged: ReturnType<typeof mergeLotDisplayRow>,
      lotOvForSeller: Record<string, LotSalesOverride>
    ) => {
      if (settlementFormMode !== 'saved' || isSettlementFormReadOnly) return;
      const sid = seller.sellerId;
      if (activeSplitGroupIdBySellerIdRef.current[sid]) {
        toast.message('Save or cancel the current split edit first.');
        return;
      }
      const q = merged.qty;
      const w = merged.weight;
      const r = merged.ratePerBag;
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(w) || w <= 0) {
        toast.message('Need positive quantity and weight to split.');
        return;
      }
      const rowKeyA = getSalesRowKeyForTableRow(tr.isExtraBid, tr.sid);
      const splitGroupId = newExtraBidLotId();
      const newId = newExtraBidLotId();
      const removedSet = new Set(removedLotsBySellerId[sid] ?? []);

      const q1 = Math.floor(q / 2);
      const q2 = q - q1;
      const w1 = w / 2;
      const w2 = w - w1;
      if (q1 <= 0 || q2 <= 0) {
        toast.message('Need at least 2 bags to split.');
        return;
      }
      if (w1 <= 0 || w2 <= 0) {
        toast.message('Need positive weight on both split rows.');
        return;
      }

      const rowKeyB = salesRowKeyExtra(newId);

      if (!tr.isExtraBid) {
        const prevApiOverride: LotSalesOverride = { ...(lotOvForSeller[tr.sid] ?? {}) };
        const lot = tr.lot;
        const commodity = (lot.commodityName || '').trim();
        const lotName = (merged.itemLabel || lot.lotName || '—').trim();
        const nextExtra: ExtraBidLot = {
          id: newId,
          lotName: lotName || '—',
          commodityName: commodity,
          qty: q2,
          weight: w2,
          ratePerBag: r,
        };
        const prevExtras = extraBidLotsBySellerId[sid] ?? [];
        const nextExtras = [...prevExtras, nextExtra];
        flushSync(() => {
          setLotSalesOverridesBySellerId(prevOv => {
            const curSeller = { ...(prevOv[sid] ?? {}) };
            const lo = { ...(curSeller[tr.sid] ?? {}) };
            lo.qty = q1;
            lo.weight = w1;
            lo.ratePerBag = r;
            curSeller[tr.sid] = lo;
            return { ...prevOv, [sid]: curSeller };
          });
        });
        setExtraBidLotsBySellerId(prev => ({ ...prev, [sid]: nextExtras }));
        setSalesReportRowOrderBySellerId(prevOr => {
          const base = sanitizeSalesRowOrder(prevOr[sid], seller, removedSet, nextExtras);
          const kApi = salesRowKeyApi(tr.sid);
          const kNew = salesRowKeyExtra(newId);
          const ix = base.indexOf(kApi);
          const ins = ix >= 0 ? ix + 1 : base.length;
          const nextOrder = [...base.slice(0, ins), kNew, ...base.slice(ins)];
          return { ...prevOr, [sid]: nextOrder };
        });
        setSplitGroupsById(prev => ({
          ...prev,
          [splitGroupId]: {
            splitGroupId,
            sellerId: sid,
            rowKeyA,
            rowKeyB,
            totalQty: q,
            totalWeight: w,
            isEditing: true,
            cancelRestore: {
              kind: 'api_plus_extra',
              apiSid: tr.sid,
              prevApiOverride,
              newExtraId: newId,
            },
          },
        }));
        setActiveSplitGroupIdBySellerId(prev => ({ ...prev, [sid]: splitGroupId }));
        return;
      }

      const curList = [...(extraBidLotsBySellerId[sid] ?? [])];
      const idx = curList.findIndex(e => e.id === tr.sid);
      if (idx < 0) return;
      const cur = curList[idx];
      const originalExtra: ExtraBidLot = { ...cur };
      const nextA: ExtraBidLot = { ...cur, qty: q1, weight: w1 };
      const nextB: ExtraBidLot = {
        id: newId,
        lotName: cur.lotName,
        commodityName: cur.commodityName,
        qty: q2,
        weight: w2,
        ratePerBag: cur.ratePerBag,
      };
      curList.splice(idx, 1, nextA, nextB);
      setExtraBidLotsBySellerId(prev => ({ ...prev, [sid]: curList }));
      setSalesReportRowOrderBySellerId(prevOr => {
        const base = sanitizeSalesRowOrder(prevOr[sid], seller, removedSet, curList);
        const kOld = salesRowKeyExtra(tr.sid);
        const kNew = salesRowKeyExtra(newId);
        const ix = base.indexOf(kOld);
        const ins = ix >= 0 ? ix + 1 : base.length;
        const nextOrder = [...base.slice(0, ins), kNew, ...base.slice(ins)];
        return { ...prevOr, [sid]: nextOrder };
      });
      setSplitGroupsById(prev => ({
        ...prev,
        [splitGroupId]: {
          splitGroupId,
          sellerId: sid,
          rowKeyA,
          rowKeyB,
          totalQty: q,
          totalWeight: w,
          isEditing: true,
          cancelRestore: {
            kind: 'extra_pair',
            firstExtraId: tr.sid,
            newExtraId: newId,
            originalExtra,
          },
        },
      }));
      setActiveSplitGroupIdBySellerId(prev => ({ ...prev, [sid]: splitGroupId }));
    },
    [
      settlementFormMode,
      isSettlementFormReadOnly,
      removedLotsBySellerId,
      extraBidLotsBySellerId,
    ]
  );

  const runPrintMainPatti = useCallback(async () => {
    if (!pattiData) return;
    if (isSettlementFormReadOnly) {
      toast.message('Enable edit (Alt+M) to print.');
      return;
    }
    if (!canRunMainPattiActions) {
      toast.error(mainPattiValidationError ?? 'Please complete required fields before printing.');
      return;
    }
    for (const s of arrivalSellersForPatti) {
      const form = sellerFormById[s.sellerId] ?? defaultSellerForm(s);
      const gate = settlementSellerPrintGateMessage(s, form);
      if (gate) {
        toast.error(gate);
        return;
      }
    }
    const scopeSellers = arrivalSellersForPatti;
    if (scopeSellers.length === 0) {
      toast.error('No sellers available for main patti print.');
      return;
    }

    const { printPayloadOrig, printPayloadMod } = buildMainVehiclePattiPrintPayloadPair(
      pattiData,
      scopeSellers,
      removedLotsBySellerId,
      lotSalesOverridesBySellerId,
      extraBidLotsBySellerId,
      getLotDivisor,
      vehicleNetPayableFromPatti,
      mainPattiPrintHeaderIdentity,
      displayMainSalesPattiNo,
      firmInfo,
      sellerExpensesById,
      isWeighingEnabledForSeller,
      isWeighingMergedIntoFreight
    );
    const printedAt = new Date().toISOString();
    try {
      await printLogApi.create({
        reference_type: 'SALES_PATTI',
        reference_id: pattiData.pattiId,
        print_type: 'SALES_PATTI',
        printed_at: printedAt,
      });
    } catch {
      /* optional */
    }
    const ok = await directPrint(
      generateSalesPattiPrintHTMLPages(
        [
          { patti: printPayloadOrig, copyLabel: SETTLEMENT_PATTI_FOOTER_ALT_O },
          { patti: printPayloadMod, copyLabel: SETTLEMENT_PATTI_FOOTER_ALT_M },
        ],
        {
          pageSize: settlementEffectivePrintSize,
          includeHeader: settlementIncludeHeader,
        }
      ),
      { mode: 'system' },
    );
    if (ok) toast.success('Main patti sent to printer');
    else toast.error('Printer not connected.');
  }, [
    pattiData,
    isSettlementFormReadOnly,
    canRunMainPattiActions,
    mainPattiValidationError,
    arrivalSellersForPatti,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
    sellerExpensesById,
    settlementWeighingEnabledBySellerId,
    isWeighingEnabledForSeller,
    isWeighingMergedIntoFreight,
    sellerFormById,
    vehicleNetPayableFromPatti,
    settlementEffectivePrintSize,
    settlementIncludeHeader,
    firmInfo,
    displayMainSalesPattiNo,
    mainPattiPrintHeaderIdentity,
  ]);

  const runPrintSellerSubPatti = useCallback(
    async (seller: SellerSettlement) => {
      if (!pattiData) return;
      if (isSettlementFormReadOnly) {
        toast.message('Enable edit (Alt+M) to print.');
        return;
      }
      const sellerValidation = getSellerValidationError(seller);
      if (sellerValidation) {
        toast.error(sellerValidation);
        return;
      }
      const form = sellerFormById[seller.sellerId] ?? defaultSellerForm(seller);
      const printGate = settlementSellerPrintGateMessage(seller, form);
      if (printGate) {
        toast.error(printGate);
        return;
      }
      const displayName = form.name || seller.sellerName;
      const exp = sellerExpensesById[seller.sellerId] ?? defaultSellerExpenses();
      const removedSet = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
      const extras = extraBidLotsBySellerId[seller.sellerId] ?? [];
      const subNo = String(sellerSalesPattiNumberBySellerId[seller.sellerId] ?? '').trim();
      const baseArgs = [
        seller,
        displayName,
        exp,
        removedSet,
        pattiData.pattiId,
        pattiData.createdAt,
        lotSalesOverridesBySellerId[seller.sellerId],
        getLotDivisor,
        isWeighingEnabledForSeller(seller.sellerId),
        isWeighingMergedIntoFreight(seller.sellerId),
        form.mobile || seller.sellerPhone || '',
        subNo,
        extras,
      ] as const;
      const ok = await directPrint(
        generateSalesPattiPrintHTMLPages(
          [
            {
              patti: {
                ...buildSellerSubPattiPrintData(...baseArgs, 'original'),
                firm: firmInfo,
              },
              copyLabel: `${SETTLEMENT_PATTI_FOOTER_ALT_O} — ${displayName}`,
            },
            {
              patti: {
                ...buildSellerSubPattiPrintData(...baseArgs, 'modified'),
                firm: firmInfo,
              },
              copyLabel: `${SETTLEMENT_PATTI_FOOTER_ALT_M} — ${displayName}`,
            },
          ],
          {
            pageSize: settlementEffectivePrintSize,
            includeHeader: settlementIncludeHeader,
          }
        ),
        { mode: 'system' },
      );
      if (ok) toast.success('Seller sub-patti sent to printer');
      else toast.error('Printer not connected.');
    },
    [
      pattiData,
      isSettlementFormReadOnly,
      sellerFormById,
      sellerExpensesById,
      removedLotsBySellerId,
      lotSalesOverridesBySellerId,
      extraBidLotsBySellerId,
      getLotDivisor,
      getSellerValidationError,
      isWeighingEnabledForSeller,
      isWeighingMergedIntoFreight,
      settlementEffectivePrintSize,
      settlementIncludeHeader,
      firmInfo,
      sellerSalesPattiNumberBySellerId,
    ]
  );

  const runPrintAllSubPatti = useCallback(async () => {
    if (!pattiData) return;
    if (isSettlementFormReadOnly) {
      toast.message('Enable edit (Alt+M) to print.');
      return;
    }
    if (!canRunMainPattiActions) {
      toast.error(mainPattiValidationError ?? 'Please complete required fields before printing.');
      return;
    }
    for (const s of arrivalSellersForPatti) {
      const regForm = sellerFormById[s.sellerId] ?? defaultSellerForm(s);
      const gate = settlementSellerPrintGateMessage(s, regForm);
      if (gate) {
        toast.error(gate);
        return;
      }
    }
    const pages: { patti: PattiPrintData; copyLabel: string }[] = [];
    for (const s of arrivalSellersForPatti) {
      const form = sellerFormById[s.sellerId] ?? defaultSellerForm(s);
      const displayName = form.name || s.sellerName;
      const exp = sellerExpensesById[s.sellerId] ?? defaultSellerExpenses();
      const removedSet = new Set(removedLotsBySellerId[s.sellerId] ?? []);
      const extras = extraBidLotsBySellerId[s.sellerId] ?? [];
      const subNo = String(sellerSalesPattiNumberBySellerId[s.sellerId] ?? '').trim();
      const common = [
        s,
        displayName,
        exp,
        removedSet,
        pattiData.pattiId,
        pattiData.createdAt,
        lotSalesOverridesBySellerId[s.sellerId],
        getLotDivisor,
        isWeighingEnabledForSeller(s.sellerId),
        isWeighingMergedIntoFreight(s.sellerId),
        form.mobile || s.sellerPhone || '',
        subNo,
        extras,
      ] as const;
      pages.push(
        {
          patti: { ...buildSellerSubPattiPrintData(...common, 'original'), firm: firmInfo },
          copyLabel: `${SETTLEMENT_PATTI_FOOTER_ALT_O} — ${displayName}`,
        },
        {
          patti: { ...buildSellerSubPattiPrintData(...common, 'modified'), firm: firmInfo },
          copyLabel: `${SETTLEMENT_PATTI_FOOTER_ALT_M} — ${displayName}`,
        }
      );
    }
    if (pages.length === 0) {
      toast.error('No seller sub-patti data found to print.');
      return;
    }
    const ok = await directPrint(
      generateSalesPattiPrintHTMLPages(pages, {
        pageSize: settlementEffectivePrintSize,
        includeHeader: settlementIncludeHeader,
      }),
      { mode: 'system' },
    );
    if (!ok) {
      toast.error('Print failed or cancelled.');
      return;
    }
    toast.success('All sub-pattis sent to printer');
  }, [
    pattiData,
    isSettlementFormReadOnly,
    arrivalSellersForPatti,
    sellerFormById,
    sellerExpensesById,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
    canRunMainPattiActions,
    mainPattiValidationError,
    isWeighingEnabledForSeller,
    isWeighingMergedIntoFreight,
    settlementEffectivePrintSize,
    settlementIncludeHeader,
    firmInfo,
    sellerSalesPattiNumberBySellerId,
  ]);

  const vehicleExpenseTotals = useMemo(() => {
    return vehicleExpenseRows.reduce(
      (acc, r) => ({
        quantity: acc.quantity + r.quantity,
        freight: acc.freight + r.freight,
        unloading: acc.unloading + r.unloading,
        weighing: acc.weighing + r.weighing,
        gunnies: acc.gunnies + r.gunnies,
      }),
      { quantity: 0, freight: 0, unloading: 0, weighing: 0, gunnies: 0 }
    );
  }, [vehicleExpenseRows]);

  const updateVehicleExpenseCell = useCallback(
    (id: string, field: VehicleExpenseField, raw: string) => {
      setVehicleExpenseRows(prev =>
        prev.map(row => {
          if (row.id !== id) return row;
          if (raw.trim() === '') {
            return { ...row, [field]: 0 };
          }
          const n = parseFloat(raw);
          if (!Number.isFinite(n)) return row;
          return { ...row, [field]: clampMoney(n) };
        })
      );
    },
    []
  );

  const isVehicleExpenseFieldEdited = useCallback(
    (row: VehicleExpenseRow, field: VehicleExpenseField): boolean => {
      const original = vehicleExpenseOriginalByRowId[row.id]?.[field];
      if (original == null) return false;
      return !moneyNearEqual(row[field] ?? 0, original);
    },
    [vehicleExpenseOriginalByRowId]
  );

  const revertVehicleExpenseCell = useCallback(
    (id: string, field: VehicleExpenseField) => {
      const original = vehicleExpenseOriginalByRowId[id]?.[field];
      if (original == null) return;
      setVehicleExpenseRows(prev => prev.map(row => (row.id === id ? { ...row, [field]: original } : row)));
    },
    [vehicleExpenseOriginalByRowId]
  );

  const loadQuickExpenseModalRows = useCallback(
    async (
      mode: 'fromExpenseCard' | 'fromLatestSlabs' | 'openWithBaseline'
    ): Promise<VehicleExpenseRow[] | { cardRows: VehicleExpenseRow[]; slabBaselineRows: VehicleExpenseRow[] }> => {
      if (!selectedSeller || !pattiData || arrivalSellersForPatti.length === 0) {
        return [];
      }
      const selectedVehicleId =
        selectedSeller.vehicleId != null && Number(selectedSeller.vehicleId) > 0
          ? Number(selectedSeller.vehicleId)
          : null;
      const vKey = normalizeVehicleKey(selectedSeller.vehicleNumber);
      let match: { vehicleId: number } | null = null;
      if (selectedVehicleId == null && vKey) {
        const summaries = await arrivalsApi.list(0, 500);
        const found = summaries.find(s => normalizeVehicleKey(String(s.vehicleNumber)) === vKey);
        const foundVehicleId = found != null ? Number(found.vehicleId) : NaN;
        match = Number.isFinite(foundVehicleId) && foundVehicleId > 0 ? { vehicleId: foundVehicleId } : null;
      }

      const [configs, commodities] =
        fullCommodityConfigs.length > 0 && commodityList.length > 0
          ? [fullCommodityConfigs, commodityList]
          : await Promise.all([commodityApi.getAllFullConfigs(), commodityApi.list()]);
      const nameToId = new Map(
        commodities.map(c => [String(c.commodity_name || '').trim().toLowerCase(), Number(c.commodity_id)])
      );
      const configById = new Map(configs.map(c => [c.commodityId, c]));

      let arrival: ArrivalFullDetail | null = null;
      if (selectedVehicleId != null) {
        try {
          arrival = await arrivalsApi.getById(selectedVehicleId);
        } catch {
          arrival = null;
        }
      } else if (match != null) {
        try {
          arrival = await arrivalsApi.getById(match.vehicleId);
        } catch {
          arrival = null;
        }
      }

      const fallbackFreightTotal = arrivalSellersForPatti.reduce((sum, s) => {
        const exp = sellerExpensesById[s.sellerId];
        return sum + (exp?.freight ?? 0);
      }, 0);
      const freightTotalRaw = arrival ? Number(arrival.freightTotal ?? 0) : amountSummaryDisplay.arrivalFreightAmount;
      const freightTotal = freightTotalRaw > 0 ? freightTotalRaw : fallbackFreightTotal;
      const equalShareFreight = arrivalSellersForPatti.length > 0 ? freightTotal / arrivalSellersForPatti.length : 0;
      const getDivisorLocal = (lot: SettlementLot) => {
        const n = (lot.commodityName || '').trim().toLowerCase();
        const cid = nameToId.get(n);
        if (cid == null) return 50;
        const d = Number(configById.get(cid)?.config?.ratePerUnit);
        return d > 0 ? d : 50;
      };
      const slabRows = buildSellerSlabChargeBaseForPattiSellers(
        arrivalSellersForPatti,
        removedLotsBySellerId,
        lotSalesOverridesBySellerId,
        extraBidLotsBySellerId,
        nameToId,
        configById,
        getDivisorLocal
      );
      const sellerComputedBase = slabRows.map((row, i) => {
        const s = arrivalSellersForPatti[i];
        const arrSeller = arrival ? findArrivalSellerForSettlement(arrival, s) : undefined;
        return {
          ...row,
          sellerName: (arrSeller?.sellerName ?? s.sellerName) || 'Seller',
        };
      });

      const gunniesMap: Record<string, number> = {};
      for (const s of arrivalSellersForPatti) {
        gunniesMap[s.sellerId] = sellerExpensesById[s.sellerId]?.gunnies ?? 0;
      }

      if (mode === 'openWithBaseline') {
        const cardRows = rowsFromExpenseCardAndSlabQuantities(sellerComputedBase, sellerExpensesById);
        const slabBaselineRows = buildVehicleExpenseRowsComputedFromSlabs(
          sellerComputedBase,
          freightTotal,
          equalShareFreight,
          gunniesMap
        );
        return { cardRows, slabBaselineRows };
      }

      if (mode === 'fromExpenseCard') {
        return rowsFromExpenseCardAndSlabQuantities(sellerComputedBase, sellerExpensesById);
      }
      return buildVehicleExpenseRowsComputedFromSlabs(
        sellerComputedBase,
        freightTotal,
        equalShareFreight,
        gunniesMap
      );
    },
    [
      selectedSeller,
      pattiData,
      arrivalSellersForPatti,
      removedLotsBySellerId,
      lotSalesOverridesBySellerId,
      extraBidLotsBySellerId,
      amountSummaryDisplay.arrivalFreightAmount,
      sellerExpensesById,
      fullCommodityConfigs,
      commodityList,
    ]
  );

  const openVehicleExpenseModal = useCallback(async () => {
    if (!selectedSeller || !pattiData || arrivalSellersForPatti.length === 0) {
      toast.error('Open a vehicle settlement first.');
      return;
    }
    setVehicleExpenseModalOpen(true);
    setVehicleExpenseLoading(true);
    try {
      const pack = await loadQuickExpenseModalRows('openWithBaseline');
      if (Array.isArray(pack)) {
        toast.error('Failed to load quick expenses.');
      } else if (pack.cardRows.length === 0) {
        toast.error('Failed to load quick expenses.');
      } else {
        setVehicleExpenseRows(pack.cardRows);
        /** Redo targets slab-distributed freight / unloading / weighing (Reset logic), not a copy of saved card — so reopen after save still shows revert when card differs from slabs. */
        setVehicleExpenseOriginalByRowId(vehicleExpenseOriginalsFromRows(pack.slabBaselineRows));
      }
    } catch {
      toast.error('Failed to load quick expenses from arrivals.');
      const fallbackBase = arrivalSellersForPatti.map(s => ({
        sellerId: s.sellerId,
        sellerName: s.sellerName || 'Seller',
        quantity: totalArrivalBagsForSeller(s),
      }));
      const fbRows = rowsFromExpenseCardAndSlabQuantities(fallbackBase, sellerExpensesById);
      setVehicleExpenseRows(fbRows);
      setVehicleExpenseOriginalByRowId(vehicleExpenseOriginalsFromRows(fbRows));
    } finally {
      setVehicleExpenseLoading(false);
    }
  }, [selectedSeller, pattiData, arrivalSellersForPatti, sellerExpensesById, loadQuickExpenseModalRows]);

  const resetQuickAdjustmentToLatestSlabs = useCallback(async () => {
    if (!vehicleExpenseModalOpen) return;
    setVehicleExpenseLoading(true);
    try {
      const rows = await loadQuickExpenseModalRows('fromLatestSlabs');
      if (!Array.isArray(rows) || rows.length === 0) {
        toast.error('Could not recompute from latest pricing.');
      } else {
        setVehicleExpenseRows(rows);
        setVehicleExpenseOriginalByRowId(vehicleExpenseOriginalsFromRows(rows));
        toast.success('Reset to latest slab pricing.');
      }
    } catch {
      toast.error('Failed to reset to latest pricing.');
    } finally {
      setVehicleExpenseLoading(false);
    }
  }, [vehicleExpenseModalOpen, loadQuickExpenseModalRows]);

  /** Keep Quick Adjustment rows in sync when the Sales report expense card changes (modal stays open). */
  useEffect(() => {
    if (!vehicleExpenseModalOpen) return;
    setVehicleExpenseRows(prev => {
      if (prev.length === 0) return prev;
      return prev.map(row => {
        const exp = sellerExpensesById[row.sellerId] ?? defaultSellerExpenses();
        return {
          ...row,
          freight: roundMoney2(exp.freight),
          unloading: roundMoney2(exp.unloading),
          weighing: roundMoney2(exp.weighman),
          gunnies: roundMoney2(exp.gunnies),
        };
      });
    });
    setVehicleExpenseOriginalByRowId(prevOrig => {
      const ids = Object.keys(prevOrig);
      if (ids.length === 0) return prevOrig;
      const next = { ...prevOrig };
      for (const id of ids) {
        const sellerId = id.startsWith('ve_') ? id.slice(3) : id;
        const exp = sellerExpensesById[sellerId] ?? defaultSellerExpenses();
        next[id] = {
          freight: roundMoney2(exp.freight),
          unloading: roundMoney2(exp.unloading),
          weighing: roundMoney2(exp.weighman),
          gunnies: roundMoney2(exp.gunnies),
        };
      }
      return next;
    });
  }, [sellerExpensesById, vehicleExpenseModalOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'x' && e.key !== 'X')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!selectedSeller || !pattiData) return;
      e.preventDefault();
      void openVehicleExpenseModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedSeller, pattiData, openVehicleExpenseModal]);

  const renderVehicleExpenseInputCell = useCallback(
    (row: VehicleExpenseRow, field: VehicleExpenseField, ariaLabel: string) => {
      const edited = isVehicleExpenseFieldEdited(row, field);
      return (
        <div className="mx-auto flex w-full max-w-[12rem] items-center gap-1">
          <SettlementNumericInput
            value={row[field] ?? 0}
            onCommit={n => updateVehicleExpenseCell(row.id, field, String(n))}
            onClear={() => updateVehicleExpenseCell(row.id, field, '')}
            commitMode="live"
            fractionDigits={2}
            emptyWhenZero
            className={cn(
              'h-10 min-w-0 flex-1 rounded-md border-border/70 bg-background px-2 text-center text-sm tabular-nums shadow-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
              edited && 'border-amber-500/70'
            )}
            aria-label={ariaLabel}
          />
          {edited && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-background text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => revertVehicleExpenseCell(row.id, field)}
                title="Restore original value"
                aria-label={`Restore original ${ariaLabel.toLowerCase()}`}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      );
    },
    [isVehicleExpenseFieldEdited, revertVehicleExpenseCell, updateVehicleExpenseCell]
  );

  const sellerDateLabel = (seller: SellerSettlement): string => {
    const rawDate = seller.createdAt ?? seller.date;
    if (!rawDate) return '-';
    const d = new Date(rawDate);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
  };

  const shortAddressLabel = (value?: string | null): string => {
    const v = String(value ?? '').trim();
    if (!v) return '-';
    return v.length > 10 ? `${v.slice(0, 10)}...` : v;
  };

  const renderArrivalSummaryTable = (tab: 'new-patti' | 'in-progress-patti' | 'saved-patti') => {
    if (tab === 'new-patti' && newPattiArrivalRows.length === 0) {
      return (
        <div className="glass-card rounded-2xl p-8 text-center">
          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            {sellers.length === 0 ? 'No arrivals found' : 'No matching arrivals'}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {sellers.length === 0 ? 'Complete an auction to generate settlements' : 'Try a different search'}
          </p>
          {sellers.length === 0 && (
            <Button type="button" variant="outline" onClick={() => navigate('/auctions')} className={cn(arrSolidMd, 'mt-4')}>
              Go to Auctions
            </Button>
          )}
        </div>
      );
    }

    if (tab === 'saved-patti' && loadingPattis) {
      return <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</div>;
    }

    if (tab === 'saved-patti' && savedPattiArrivalRows.length === 0) {
      return (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            {savedPattis.length === 0 ? 'No saved pattis found' : 'No matching pattis'}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {savedPattis.length === 0 ? 'Create a patti from Create New Patti tab' : 'Try a different search'}
          </p>
        </div>
      );
    }

    if (tab === 'in-progress-patti') {
      const q = searchQuery.trim().toLowerCase();
      const rows = inProgressPattiDrafts
        .filter(r => {
          if (!q) return true;
          return (
            String(r.vehicleNumber ?? '').toLowerCase().includes(q) ||
            String(r.sellerNames ?? '').toLowerCase().includes(q) ||
            String(r.fromLocation ?? '').toLowerCase().includes(q)
          );
        })
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      if (rows.length === 0) {
        return (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Edit3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">
              {inProgressPattiDrafts.length === 0 ? 'No in-progress pattis found' : 'No matching in-progress pattis'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {inProgressPattiDrafts.length === 0 ? 'Open a patti and start editing to create in-progress entries.' : 'Try a different search'}
            </p>
          </div>
        );
      }
      return (
        <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto rounded-xl border border-border/50 bg-background/40 shadow-sm">
            <table className="w-full min-w-[1060px] border-separate border-spacing-0 text-sm">
              <thead className={cn(SETTLEMENT_LOTS_TABLE_HEADER_GRADIENT, 'shadow-md')}>
                <tr>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Vehicle Number</th>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Seller</th>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Total Sellers</th>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">From</th>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">SL No</th>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Lots</th>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Bids</th>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Weighed</th>
                  <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Status</th>
                  <th className="whitespace-nowrap border-b border-white/25 px-3 py-2 text-center font-semibold text-white">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => void openInProgressDraft(row)}
                    className="border-t border-border/30 hover:bg-muted/20 cursor-pointer"
                  >
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.vehicleNumber || '-'}</td>
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.sellerNames || '-'}</td>
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center tabular-nums text-foreground">
                      {uniqueArrivalSellerCount(row.sellerIds)}
                    </td>
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{shortAddressLabel(row.fromLocation)}</td>
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.serialNo || '-'}</td>
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.lots ?? 0}</td>
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.bids ?? 0}</td>
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.weighed ?? 0}</td>
                    <td className="border-t border-r border-border/30 px-3 py-2 text-center text-amber-600 dark:text-amber-400 font-medium">In Progress</td>
                    <td className="border-t border-border/30 px-3 py-2 text-center text-foreground">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto rounded-xl border border-border/50 bg-background/40 shadow-sm">
          <table className="w-full min-w-[1060px] border-separate border-spacing-0 text-sm">
            <thead className={cn(SETTLEMENT_LOTS_TABLE_HEADER_GRADIENT, 'shadow-md')}>
              <tr>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Vehicle Number</th>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Seller</th>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Total Sellers</th>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">From</th>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">SL No</th>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Lots</th>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Bids</th>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Weighed</th>
                <th className="whitespace-nowrap border-b border-r border-white/25 px-3 py-2 text-center font-semibold text-white">Status</th>
                <th className="whitespace-nowrap border-b border-white/25 px-3 py-2 text-center font-semibold text-white">Date</th>
              </tr>
            </thead>
            <tbody>
              {tab === 'new-patti'
                ? newPattiArrivalRows.map((row) => (
                    <tr
                      key={row.key}
                      onClick={() => generatePatti(row.representativeSeller, { arrivalSellerIds: row.sellerIds })}
                      className="border-t border-border/30 hover:bg-muted/20 cursor-pointer"
                    >
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">
                        <span className="inline-flex items-center rounded-full bg-[#eef0ff] px-2 py-0.5 text-[10px] font-bold text-[#6075FF] dark:bg-[#6075FF]/20">
                          {row.vehicleNumber}
                        </span>
                      </td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.sellerNames || '-'}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center tabular-nums text-foreground">
                        {uniqueArrivalSellerCount(row.sellerIds)}
                      </td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block max-w-[10ch] truncate align-bottom">
                              {shortAddressLabel(row.fromLocation)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={8} className="max-w-[260px] text-xs">
                            {row.fromLocation || '-'}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.serialNo ?? '-'}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.lots}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.bids}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.weighed}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-amber-600 dark:text-amber-400 font-medium">New Patti</td>
                      <td className="border-t border-border/30 px-3 py-2 text-center text-foreground">{row.dateLabel}</td>
                    </tr>
                  ))
                : savedPattiArrivalRows.map((row) => (
                    <tr
                      key={row.key}
                      onClick={() =>
                        row.representativePattiId != null &&
                        openPattiForEdit(row.representativePattiId, row.sellerIds, { formContext: 'saved' })
                      }
                      className="border-t border-border/30 hover:bg-muted/20 cursor-pointer"
                    >
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">
                        <span className="inline-flex items-center rounded-full bg-[#eef0ff] px-2 py-0.5 text-[10px] font-bold text-[#6075FF] dark:bg-[#6075FF]/20">
                          {row.vehicleNumber}
                        </span>
                      </td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.sellerNames || '-'}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center tabular-nums text-foreground">
                        {uniqueArrivalSellerCount(row.sellerIds)}
                      </td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block max-w-[10ch] truncate align-bottom">
                              {shortAddressLabel(row.fromLocation)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={8} className="max-w-[260px] text-xs">
                            {row.fromLocation || '-'}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.serialNo ?? '-'}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.lots}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.bids}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-foreground">{row.weighed}</td>
                      <td className="border-t border-r border-border/30 px-3 py-2 text-center text-emerald-600 dark:text-emerald-400 font-medium">Completed Patti</td>
                      <td className="border-t border-border/30 px-3 py-2 text-center text-foreground">{row.dateLabel}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ═══ PRINT PREVIEW ═══
  if (showPrint && pattiData) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        <UnsavedChangesDialog />
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18)_0%,transparent_50%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.2)_0%,transparent_42%)]" />
          <div className="relative z-10 flex items-center gap-3">
            <button onClick={() => setShowPrint(false)}
              aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Printer className="w-5 h-5" /> Sales Patti Print
              </h1>
              <p className="text-white/70 text-xs">{pattiData.pattiId || '(Number after save)'}</p>
            </div>
          </div>
        </div>
        ) : (
        <div className="px-8 py-5 flex items-center gap-4">
          <Button type="button" onClick={() => setShowPrint(false)} variant="outline" className={cn(arrSolidMd, 'gap-1.5')}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Sales Patti Print
            </h2>
            <p className="text-sm text-muted-foreground">{pattiData.pattiId}</p>
          </div>
        </div>
        )}

        {isOriginalReferenceMode && (
          <div className="px-4 mt-3 text-center text-[11px] font-semibold text-primary sm:text-xs">
            Viewing original snapshot (read-only) — Alt+M to return
          </div>
        )}

        <div className="px-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-4 font-mono text-xs space-y-2 shadow-lg">
            <div className="text-center border-b border-dashed border-border pb-2">
              <p className="font-bold text-sm text-foreground">MERCOTRACE</p>
              <p className="text-muted-foreground">Sales Patti (Settlement)</p>
              <p className="text-muted-foreground">{new Date(pattiData.createdAt).toLocaleDateString()} {new Date(pattiData.createdAt).toLocaleTimeString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {arrivalSellersForPatti.length > 0
                  ? `Print: ${SETTLEMENT_PATTI_FOOTER_ALT_O} + ${SETTLEMENT_PATTI_FOOTER_ALT_M}`
                  : `Print copies: ${settlementCopyLabelsResolved.join(', ')}`}
              </p>
            </div>

            <div className="border-b border-dashed border-border pb-2 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Patti ID</span><span className="font-bold text-foreground">{pattiData.pattiId || '(Number after save)'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span className="font-bold text-foreground">{pattiData.sellerName}</span></div>
              {pattiData.useAverageWeight && <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><span className="font-bold text-amber-500">AVG WEIGHT (Quick Close)</span></div>}
            </div>

            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">RATE CLUSTERS</p>
              {pattiData.rateClusters.map((c, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-foreground">
                    {c.totalQuantity} bags @ ₹{formatMoney2Display(c.rate)} ({c.totalWeight.toFixed(0)}kg)
                  </span>
                  <span className="font-bold text-foreground">₹{formatMoney2Display(c.amount)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold">
              <span className="text-foreground">Gross Amount</span>
              <span className="text-foreground">₹{formatMoney2Display(pattiData.grossAmount)}</span>
            </div>

            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">DEDUCTIONS</p>
              {pattiData.deductions.filter(d => d.amount > 0).map(d => (
                <div key={d.key} className="flex justify-between">
                  <span className="text-muted-foreground">{d.label}{d.autoPulled ? ' (Auto)' : ''}</span>
                  <span className="text-destructive">−₹{formatMoney2Display(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t border-dashed border-border pt-1 mt-1">
                <span className="text-foreground">Total Deductions</span>
                <span className="text-destructive">−₹{formatMoney2Display(pattiData.totalDeductions)}</span>
              </div>
            </div>

            <div className="flex justify-between text-sm border-t border-dashed border-border pt-2">
              <span className="font-bold text-foreground">NET PAYABLE</span>
              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                ₹{formatMoney2Display(pattiData.netPayable)}
              </span>
            </div>

            <div className="text-center text-muted-foreground/70 text-[9px] border-t border-dashed border-border pt-2 space-y-0.5">
              <p>GA = Σ (NW × SR) — SR = summary new seller rate (incl. preset from pad), or bid + preset for original copy</p>
              <p>NP = GA − TD</p>
              <p>TD = Freight + Coolie + Weighing + Advance + Gunnies + Other</p>
            </div>

            <div className="text-center border-t border-dashed border-border pt-2">
              <p className="text-muted-foreground">--- END OF PATTI ---</p>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={settlementPrintPermissionError != null}
              title={settlementPrintPermissionError ?? undefined}
              onClick={async () => {
              if (settlementPrintPermissionError) {
                toast.error(settlementPrintPermissionError);
                return;
              }
              const printedAt = new Date().toISOString();
              try {
                await printLogApi.create({
                  reference_type: 'SALES_PATTI',
                  reference_id: pattiData.pattiId,
                  print_type: 'SALES_PATTI',
                  printed_at: printedAt,
                });
              } catch {
                // backend optional
              }
              const modHeader: PattiPrintData = {
                ...pattiData,
                firm: firmInfo,
                ...(mainPattiPrintHeaderIdentity
                  ? {
                      sellerName: mainPattiPrintHeaderIdentity.sellerName,
                      sellerMobile: mainPattiPrintHeaderIdentity.sellerMobile,
                      sellerAddress: mainPattiPrintHeaderIdentity.sellerAddress,
                      vehicleNumber: mainPattiPrintHeaderIdentity.vehicleNumber,
                    }
                  : {}),
                pattiNoDisplay: mainPattiNumberForDisplay(displayMainSalesPattiNo, pattiData.pattiId),
              };
              const ok = await directPrint(
                arrivalSellersForPatti.length > 0
                  ? generateSalesPattiPrintHTMLPages(
                      (() => {
                        const { printPayloadOrig, printPayloadMod } = buildMainVehiclePattiPrintPayloadPair(
                          pattiData,
                          arrivalSellersForPatti,
                          removedLotsBySellerId,
                          lotSalesOverridesBySellerId,
                          extraBidLotsBySellerId,
                          getLotDivisor,
                          vehicleNetPayableFromPatti,
                          mainPattiPrintHeaderIdentity,
                          displayMainSalesPattiNo,
                          firmInfo,
                          sellerExpensesById,
                          isWeighingEnabledForSeller,
                          isWeighingMergedIntoFreight
                        );
                        return [
                          { patti: printPayloadOrig, copyLabel: SETTLEMENT_PATTI_FOOTER_ALT_O },
                          { patti: printPayloadMod, copyLabel: SETTLEMENT_PATTI_FOOTER_ALT_M },
                        ];
                      })(),
                      { pageSize: settlementEffectivePrintSize, includeHeader: settlementIncludeHeader }
                    )
                  : generateSalesPattiPrintHTMLForCopies(
                      modHeader,
                      settlementCopyLabelsResolved,
                      { pageSize: settlementEffectivePrintSize, includeHeader: settlementIncludeHeader }
                    ),
                { mode: "system" },
              );
              if (ok) toast.success('Sales Patti sent to printer!');
              else toast.error('Printer not connected.');
            }}
              className={cn(arrSolidTall, 'flex-1 sm:flex-none gap-2')}
            >
              <Printer className="w-5 h-5" /> Print Patti
            </Button>
            <Button
              type="button"
              onClick={() => { setShowPrint(false); clearActiveSettlementScreen(); }}
              variant="outline"
              className={arrOutlineTall}
            >
              Done
            </Button>
          </div>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ PATTI DETAIL SCREEN ═══
  if (selectedSeller && pattiData) {
    const totalBags = Math.round(
      (vehicleFormDetails?.arrivalQty ?? arrivalSellersForPatti.reduce((s, x) => s + totalArrivalBagsForSeller(x), 0))
    );
    const settlementFormSubtitle =
      settlementFormMode === 'new'
        ? 'New patti'
        : settlementFormMode === 'in-progress'
          ? 'Patti in progress'
          : settlementFormMode === 'saved'
            ? 'Saved patti'
            : '';

    const cmpFooter = savedPattiCompareStickyFooter;

    return (
      <div
        className={cn(
          'min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6',
          cmpFooter && 'pb-44 lg:pb-32',
        )}
      >
        <UnsavedChangesDialog />
        {/* Header */}
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.2)_0%,transparent_42%)]" />
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
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => {
                void (async () => {
                  const ok = await confirmIfDirty();
                  if (!ok) return;
                  clearActiveSettlementScreen();
                })();
              }}
                aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-lg font-bold text-white flex flex-wrap items-center gap-2">
                  <FileText className="w-5 h-5" /> Sales Patti
                  {settlementFormSubtitle ? (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/95">
                      {settlementFormSubtitle}
                    </span>
                  ) : null}
                </h1>
                <p className="text-white/70 text-xs">
                  Sales Patti No: {displayMainSalesPattiNo || '-'}
                </p>
              </div>
            </div>

          </div>
        </div>
        ) : (
        <div className="px-8 py-5">
          <div className="flex items-center gap-4 mb-4">
            <Button
              type="button"
              onClick={() => {
                void (async () => {
                  const ok = await confirmIfDirty();
                  if (!ok) return;
                  clearActiveSettlementScreen();
                })();
              }}
              variant="outline"
              className={cn(arrSolidMd, 'gap-1.5')}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground flex flex-wrap items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Sales Patti — {selectedSeller.sellerName}
                {settlementFormSubtitle ? (
                  <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {settlementFormSubtitle}
                  </span>
                ) : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                Sales Patti No: {displayMainSalesPattiNo || '-'} · {selectedSeller.vehicleNumber} · {totalBags} bags
              </p>
            </div>
          </div>
        </div>
        )}

        <div className="mt-4 space-y-3 px-4 sm:px-6 lg:px-8">
          {vehicleFormDetails && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-2xl border border-border/50 p-4 sm:p-5"
            >
              <h3 className="mb-4 text-center text-base font-bold tracking-tight text-foreground sm:text-lg">
                Vehicle Details
              </h3>
              <div className="grid grid-cols-2 items-stretch gap-2.5 text-center sm:gap-3 xl:grid-cols-6 xl:gap-4">
                <div className="col-span-2 flex h-full min-h-[6.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-blue-500/20 bg-muted/30 px-2.5 py-3 sm:col-span-1 sm:min-h-[7rem] sm:rounded-2xl sm:px-3 sm:py-4">
                  <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Vehicle No</p>
                  <p className="text-lg font-black tabular-nums text-foreground sm:text-xl md:text-2xl truncate max-w-full">
                    {selectedSeller.vehicleNumber || '-'}
                  </p>
                </div>
                <div className="flex h-full min-h-[6.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-cyan-500/20 bg-muted/30 px-2.5 py-3 sm:min-h-[7rem] sm:rounded-2xl sm:px-3 sm:py-4">
                  <Users className="h-4 w-4 text-cyan-600 dark:text-cyan-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sellers</p>
                  <p className="text-lg font-black tabular-nums text-foreground sm:text-xl md:text-2xl">
                    {formatOptionalInt(vehicleFormDetails.sellersCount)}
                  </p>
                </div>
                <div className="flex h-full min-h-[6.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-amber-500/20 bg-muted/30 px-2.5 py-3 sm:min-h-[7rem] sm:rounded-2xl sm:px-3 sm:py-4">
                  <Package className="h-4 w-4 text-amber-600 dark:text-amber-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Arrival Qty</p>
                  <p className="text-lg font-black tabular-nums text-foreground sm:text-xl md:text-2xl">
                    {formatOptionalInt(vehicleFormDetails.arrivalQty)}
                  </p>
                </div>
                <div className="flex h-full min-h-[6.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-muted/30 px-2.5 py-3 sm:min-h-[7rem] sm:rounded-2xl sm:px-3 sm:py-4">
                  <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Arrival Weight</p>
                  <p className="text-lg font-black tabular-nums text-foreground sm:text-xl md:text-2xl">
                    {formatOptionalKg(vehicleFormDetails.arrivalWeightKg)}
                  </p>
                </div>
                <div className="flex h-full min-h-[6.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-violet-500/20 bg-muted/30 px-2.5 py-3 sm:min-h-[7rem] sm:rounded-2xl sm:px-3 sm:py-4">
                  <Gavel className="h-4 w-4 text-violet-600 dark:text-violet-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase leading-tight text-muted-foreground">Sales Pad Net Wt</p>
                  <p className="text-lg font-black tabular-nums text-foreground sm:text-xl md:text-2xl">
                    {formatOptionalKg(salesPadNetWeightBaseline)}
                  </p>
                </div>
                <div className="col-span-2 flex h-full min-h-[6.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-fuchsia-500/20 bg-muted/30 px-2.5 py-3 sm:min-h-[7rem] sm:rounded-2xl sm:px-3 sm:py-4 xl:col-span-1">
                  <Receipt className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase leading-tight text-muted-foreground">Patti Net Wt</p>
                  <p className="text-lg font-black tabular-nums text-foreground sm:text-xl md:text-2xl">
                    {formatOptionalKg(vehicleFormDetails.pattiNetWeightKg)}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02 }}
            className="glass-card rounded-2xl border border-border/50 p-4 sm:p-5"
          >
            <h3 className="mb-4 text-center text-base font-bold tracking-tight text-foreground sm:text-lg">
              Expenses &amp; Invoice
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch sm:gap-4">
              <div className="flex min-h-[8.5rem] min-w-0 flex-col rounded-xl border border-teal-500/20 bg-muted/30 px-2.5 py-3 sm:min-h-[9rem] sm:rounded-2xl sm:px-3 sm:py-4">
                <div className="flex flex-1 items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 ring-1 ring-teal-500/20 dark:text-teal-400"
                    aria-hidden
                  >
                    <Truck className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground sm:text-base">Freight Amount</p>
                    <div className="mt-3 space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          Arrival Freight Amount
                          <InlineCalcTip
                            label="Arrival freight formula"
                            lines={[
                              'Source: Arrival freight total.',
                              'Quick Expenses uses: seller freight = (seller settlement weight / total settlement weight) x arrival freight.',
                              `Current arrival freight: ${formatRupeeInr(amountSummaryDisplay.arrivalFreightAmount)}`,
                            ]}
                          />
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatRupeeInr(amountSummaryDisplay.arrivalFreightAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          Invoiced
                          <InlineCalcTip
                            label="Invoiced freight formula"
                            lines={[
                              'Source: Sum of outbound freight from matching sales bills.',
                              `Current invoiced freight: ${formatRupeeInr(amountSummaryDisplay.freightInvoiced)}`,
                            ]}
                          />
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatRupeeInr(amountSummaryDisplay.freightInvoiced)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex min-h-[8.5rem] min-w-0 flex-col rounded-xl border border-amber-500/20 bg-muted/30 px-2.5 py-3 sm:min-h-[9rem] sm:rounded-2xl sm:px-3 sm:py-4">
                <div className="flex flex-1 items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400"
                    aria-hidden
                  >
                    <IndianRupee className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground sm:text-base">Payable</p>
                    <div className="mt-3 space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          From Sales Auction
                          <InlineCalcTip
                            label="Auction amount formula"
                            lines={[
                              'Across all sellers in current arrival scope.',
                              `Qty used: ${Math.round(auctionQtyBaseline)} bags`,
                              `Weight used: ${auctionWeightBaseline.toFixed(1)} kg`,
                              'Lot amount = (Weight x Seller rate per bag) / commodity divisor.',
                              `Current auction amount: ${formatRupeeInr(auctionAmountBaseline)}`,
                            ]}
                          />
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatRupeeInr(auctionAmountBaseline)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          Invoice
                          <InlineCalcTip
                            label="Invoice payable formula"
                            lines={[
                              'Source: Billing totals from matching sales bills.',
                              'Represents invoice-side payable after bill calculations.',
                              `Current invoice value: ${formatRupeeInr(amountSummaryDisplay.payableInvoiced)}`,
                            ]}
                          />
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatRupeeInr(amountSummaryDisplay.payableInvoiced)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div className="w-full min-w-0 sm:max-w-md">
                <label htmlFor="settlement-invoice-name-search" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Invoice Name
                </label>
                <Input
                  id="settlement-invoice-name-search"
                  type="search"
                  placeholder="Enter invoice name"
                  value={invoiceNameSearch}
                  onChange={e => setInvoiceNameSearch(e.target.value)}
                  className="h-10 rounded-xl border-border/60 bg-background/80"
                  autoComplete="off"
                  disabled={isSettlementFormReadOnly}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className={cn(arrSolidMd, 'w-full shrink-0 gap-1.5 sm:w-auto sm:min-w-[12rem]')}
                onClick={() => void openVehicleExpenseModal()}
                disabled={isSettlementFormReadOnly}
              >
                <PlusCircle className="h-4 w-4" />
                Add Quick Adjustment (Alt X)
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="glass-card rounded-2xl border border-border/50 p-4 sm:p-5"
          >
            <h3 className="mb-4 text-center text-base font-bold tracking-tight text-foreground sm:text-lg">Sales Report</h3>
            {arrivalSellersForPatti.length > 1 && (
              <div className="-mt-1 mb-3 flex items-center justify-center gap-1.5 lg:hidden">
                {arrivalSellersForPatti.map((_, si) => (
                  <button
                    key={`sales-report-dot-${si}`}
                    type="button"
                    onClick={() => {
                      const el = salesReportCarouselRef.current;
                      if (!el) return;
                      const n = arrivalSellersForPatti.length;
                      const left = (el.scrollWidth / n) * si;
                      el.scrollTo({ left, behavior: 'smooth' });
                    }}
                    className={cn(
                      'rounded-full transition-all bg-muted-foreground/40',
                      activeSalesReportSlide === si ? 'h-2 w-4 bg-primary' : 'h-2 w-2'
                    )}
                    aria-label={`Go to seller ${si + 1}`}
                  />
                ))}
              </div>
            )}
            <div
              ref={salesReportCarouselRef}
              onScroll={handleSalesReportCarouselScroll}
              className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 [-webkit-overflow-scrolling:touch] lg:block lg:overflow-visible lg:snap-none lg:space-y-4 lg:pb-0"
            >
              {arrivalSellersForPatti.map((seller, sellerIdx) => {
                const form = sellerFormById[seller.sellerId] ?? defaultSellerForm(seller);
                const baseline = registeredBaselineById[seller.sellerId] ?? form;
                const exp = sellerExpensesById[seller.sellerId] ?? defaultSellerExpenses();
                const sellerValidationError = getSellerValidationError(seller);
                const saveHighlightThisSeller = pattiSaveHighlightSellerIds.includes(seller.sellerId);
                /** Sticky save-highlight IDs clear visually once seller validates (live re-check). */
                const showSaveValidationChrome = saveHighlightThisSeller && sellerValidationError != null;
                const printSaveAllowed = isSettlementSellerPrintAllowed(seller, form);
                const contactSearchQuery = (form.contactSearchQuery ?? '').trim();
                const contactSearchQueryLower = contactSearchQuery.toLowerCase();
                const registeredContactRows = sellerContactSearchById[seller.sellerId] ?? [];
                const tempContactRows = sellers.filter(s => {
                  const noLinkedContact = s.contactId == null || String(s.contactId).trim() === '';
                  if (!noLinkedContact) return false;
                  if (!contactSearchQueryLower) return true;
                  const hay = `${s.sellerName ?? ''} ${s.sellerMark ?? ''} ${s.sellerPhone ?? ''}`.toLowerCase();
                  return hay.includes(contactSearchQueryLower);
                });
                const showContactSearchDropdown = contactSearchQuery.length > 0;
                const removedSet = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
                const lotOv = lotSalesOverridesBySellerId[seller.sellerId] ?? {};
                const agSplitId = activeSplitGroupIdBySellerId[seller.sellerId] ?? null;
                const splitSnapForSeller = agSplitId ? splitGroupsById[agSplitId] : null;
                const extraLotsRaw = extraBidLotsBySellerId[seller.sellerId] ?? [];
                const visibleApiLots = (seller.lots ?? [])
                  .map((lot, i) => ({ lot, i, sid: lotStableId(lot, i) }))
                  .filter(x => !removedSet.has(x.sid));
                const apiLotBySid = new Map(visibleApiLots.map(({ lot, sid }) => [sid, { lot, sid }] as const));
                const extraById = new Map(extraLotsRaw.map(e => [e.id, e] as const));
                const rowOrderKeys = sanitizeSalesRowOrder(
                  salesReportRowOrderBySellerId[seller.sellerId],
                  seller,
                  removedSet,
                  extraLotsRaw
                );
                const tableRows: SettlementSalesTableRow[] = [];
                for (const k of rowOrderKeys) {
                  const p = parseSalesRowOrderKey(k);
                  if (!p) continue;
                  if (p.type === 'api') {
                    const hit = apiLotBySid.get(p.sid);
                    if (!hit) continue;
                    tableRows.push({ lot: hit.lot, sid: hit.sid, isExtraBid: false as const });
                  } else {
                    const e = extraById.get(p.id);
                    if (!e) continue;
                    tableRows.push({
                      lot: settlementLotFromExtraBid(e),
                      sid: e.id,
                      isExtraBid: true as const,
                      extraBid: e,
                    });
                  }
                }
                const lotRows = tableRows.map(r =>
                  mergeLotDisplayRow(r.lot, r.isExtraBid ? undefined : lotOv[r.sid], getLotDivisor(r.lot))
                );
                const qtyTot = lotRows.reduce((s, r) => s + r.qty, 0);
                const weightTot = lotRows.reduce((s, r) => s + r.weight, 0);
                const amountTot = lotRows.reduce((s, r) => s + r.amount, 0);
                const allowedQtyBags = Math.round(totalArrivalBagsForSeller(seller));
                const qtyOutOfBalance = allowedQtyBags > 0 && qtyTot !== allowedQtyBags;
                const invalidLotFieldBySid: Record<string, { qty?: true; weight?: true; rate?: true }> = {};
                for (const tr of tableRows) {
                  const r = mergeLotDisplayRow(
                    tr.lot,
                    tr.isExtraBid ? undefined : lotOv[tr.sid],
                    getLotDivisor(tr.lot)
                  );
                  const inv: { qty?: true; weight?: true; rate?: true } = {};
                  if (!Number.isFinite(r.qty) || r.qty <= 0) inv.qty = true;
                  if (!Number.isFinite(r.weight) || r.weight <= 0) inv.weight = true;
                  if (!Number.isFinite(r.ratePerBag) || r.ratePerBag <= 0) inv.rate = true;
                  if (Object.keys(inv).length > 0) invalidLotFieldBySid[tr.sid] = inv;
                }
                const sellerNameMissing = !(form.name || seller.sellerName || '').trim();
                const highlightSellerName = showSaveValidationChrome && sellerNameMissing;
                const expenseTotal = totalSellerExpenses(
                  exp,
                  isWeighingEnabledForSeller(seller.sellerId),
                  isWeighingMergedIntoFreight(seller.sellerId)
                );
                const netSeller = amountTot - expenseTotal;
                /** Default collapsed; only explicit `false` expands. */
                const salesCollapsed = salesReportCollapsedBySellerId[seller.sellerId] !== false;

                return (
                  <div
                    key={seller.sellerId}
                    className="min-w-0 w-[calc(100%-0.1rem)] shrink-0 snap-start lg:w-auto lg:shrink"
                  >
                    <div
                      id={`settlement-seller-card-${seller.sellerId}`}
                      className={cn(
                        'rounded-2xl border p-3 sm:p-4',
                        SALES_REPORT_SELLER_CARD_STYLES[sellerIdx % SALES_REPORT_SELLER_CARD_STYLES.length],
                        showSaveValidationChrome &&
                          'ring-2 ring-destructive/80 ring-offset-2 ring-offset-background dark:ring-offset-background',
                      )}
                    >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-card/80 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per seller sales</p>
                        <p className="truncate text-sm font-bold text-foreground">
                          {seller.sellerName}
                          {seller.sellerMark ? ` – ${seller.sellerMark}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-border/50 bg-background/70 px-2 py-1 text-[11px] font-semibold text-foreground">
                          Patti No: {sellerSalesPattiNumberBySellerId[seller.sellerId] || '-'}
                        </span>
                        <Button
                          type="button"
                          className={cn(arrSolidSm, 'gap-1')}
                          onClick={() =>
                            setSalesReportCollapsedBySellerId(prev => {
                              const collapsed = prev[seller.sellerId] !== false;
                              return { ...prev, [seller.sellerId]: !collapsed };
                            })
                          }
                        >
                          {salesCollapsed ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronUp className="h-3.5 w-3.5" />
                          )}
                          {salesCollapsed ? 'Expand' : 'Collapse'}
                        </Button>
                      </div>
                    </div>

                    {salesCollapsed ? (
                      <div className="mb-3 rounded-xl border border-border/30 bg-muted/10 px-3 py-2.5 text-[11px]">
                        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-foreground sm:justify-start">
                          <span className="font-medium text-muted-foreground">Items: {tableRows.length}</span>
                          <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden>
                            ·
                          </span>
                          <span className="font-semibold tabular-nums">Total Qty: {qtyTot}</span>
                          <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden>
                            ·
                          </span>
                          <span className="font-semibold tabular-nums">Total Wt: {formatMoney2Display(weightTot)} kg</span>
                          <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden>
                            ·
                          </span>
                          <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                            Net: ₹{formatMoney2Display(netSeller)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                    <div className="mb-4 space-y-3 overflow-visible rounded-xl border border-border/50 bg-card/80 p-3 sm:p-4">
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seller contact</span>
                        <label
                          id={`seller-unregistered-confirm-${seller.sellerId}`}
                          className={cn(
                            'flex items-center gap-2 font-medium',
                            isSettlementFormReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
                            showSaveValidationChrome &&
                              !printSaveAllowed &&
                              'rounded-md px-1 py-0.5 ring-2 ring-destructive ring-offset-1 ring-offset-background dark:ring-offset-background'
                          )}
                        >
                          <Checkbox
                            className="h-4 w-4 rounded-none"
                            checked={form.unregisteredPrintConfirmed}
                            disabled={isSettlementFormReadOnly}
                            onCheckedChange={v => {
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                const nextChecked = v === true;
                                if (!nextChecked) {
                                  return {
                                    ...prev,
                                    [seller.sellerId]: {
                                      ...cur,
                                      unregisteredPrintConfirmed: false,
                                    },
                                  };
                                }
                                return {
                                  ...prev,
                                  [seller.sellerId]: {
                                    ...cur,
                                    unregisteredPrintConfirmed: true,
                                    registrationChosen: true,
                                    registered: false,
                                    contactId: null,
                                    replacementSellerId: null,
                                    allowRegisteredEdit: false,
                                    contactSearchQuery: '',
                                  },
                                };
                              });
                            }}
                          />
                          <span className="text-foreground">Unregistered</span>
                        </label>
                        <div className="relative ml-auto w-full min-w-0 sm:w-[18rem]">
                          <Input
                            value={form.contactSearchQuery}
                            onChange={e => {
                              const q = e.target.value;
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                return { ...prev, [seller.sellerId]: { ...cur, contactSearchQuery: q } };
                              });
                              scheduleMarkContactSearch(seller.sellerId, q);
                            }}
                            placeholder="Search seller by mark, name, or mobile..."
                            className="h-8 pr-8 text-xs sm:text-sm"
                            disabled={isSettlementFormReadOnly}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {sellerContactSearchLoading[seller.sellerId] ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Search className="h-3.5 w-3.5 opacity-70" />
                            )}
                          </span>
                          {showContactSearchDropdown ? (
                            <div className="absolute left-0 top-[calc(100%+0.25rem)] z-20 w-full max-h-[14rem] overflow-y-auto rounded-xl border border-border/50 bg-card shadow-lg">
                              {registeredContactRows.length === 0 && tempContactRows.length === 0 ? (
                                <p className="px-3 py-4 text-center text-xs text-muted-foreground">No sellers found.</p>
                              ) : (
                                <ul>
                                  {registeredContactRows.slice(0, 30).map(c => (
                                    <li key={c.contact_id} className="border-b border-border/30 last:border-b-0">
                                      <button
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40"
                                        onClick={() => {
                                          setSellerFormById(prev => {
                                            const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                            return {
                                              ...prev,
                                              [seller.sellerId]: {
                                                ...cur,
                                                registrationChosen: true,
                                                registered: true,
                                                contactId: String(c.contact_id),
                                                replacementSellerId: null,
                                                mark: c.mark ?? '',
                                                name: c.name ?? '',
                                                mobile: c.phone ?? '',
                                                allowRegisteredEdit: false,
                                                contactSearchQuery: '',
                                                unregisteredPrintConfirmed: false,
                                              },
                                            };
                                          });
                                          toast.success('Registered seller selected. You can update now.');
                                        }}
                                      >
                                        <span className="min-w-0">
                                          <span className="block truncate text-sm font-semibold text-foreground">{c.name}</span>
                                          <span className="block truncate text-xs text-muted-foreground">
                                            {c.phone}
                                            {c.mark ? ` · ${c.mark}` : ''}
                                          </span>
                                        </span>
                                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                          Registered · Select
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                  {tempContactRows.slice(0, 30).map(s => (
                                    <li key={`temp-${s.sellerId}`} className="border-b border-border/30 last:border-b-0">
                                      <button
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40"
                                        onClick={() => {
                                          setSellerFormById(prev => {
                                            const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                            return {
                                              ...prev,
                                              [seller.sellerId]: {
                                                ...cur,
                                                registrationChosen: true,
                                                registered: false,
                                                contactId: null,
                                                replacementSellerId: String(s.sellerId),
                                                mark: s.sellerMark ?? '',
                                                name: s.sellerName ?? '',
                                                mobile: s.sellerPhone ?? '',
                                                allowRegisteredEdit: false,
                                                contactSearchQuery: '',
                                                unregisteredPrintConfirmed: false,
                                              },
                                            };
                                          });
                                          toast.success('Temporary seller selected. You can replace now.');
                                        }}
                                      >
                                        <span className="min-w-0">
                                          <span className="block truncate text-sm font-semibold text-foreground">{s.sellerName || '-'}</span>
                                          <span className="block truncate text-xs text-muted-foreground">
                                            {s.sellerPhone || '-'}
                                            {s.sellerMark ? ` · ${s.sellerMark}` : ''}
                                          </span>
                                        </span>
                                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                          Temporary · Select
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(arrSolidMd, 'min-w-[8rem]')}
                          disabled={
                            isSettlementFormReadOnly ||
                            !!sellerRegSaving[seller.sellerId] ||
                            (!form.contactId && !form.replacementSellerId)
                          }
                          onClick={() => {
                            void (async () => {
                              if (!can('Settlement', 'Edit')) {
                                toast.error('You do not have permission to update seller details.');
                                return;
                              }
                              if (!form.contactId && !form.replacementSellerId) {
                                toast.error('Please search and select a seller first.');
                                return;
                              }
                              setSellerRegSaving(prev => ({ ...prev, [seller.sellerId]: true }));
                              try {
                                const baselineContactId = baseline.contactId ? String(baseline.contactId) : null;
                                const nextContactId = form.contactId ? String(form.contactId) : null;
                                const replacementSellerId = form.replacementSellerId ? String(form.replacementSellerId) : null;
                                let replaced: Awaited<ReturnType<typeof settlementApi.replaceSellerFromSeller>> | null = null;
                                let reg = null as Awaited<ReturnType<typeof settlementApi.linkSellerContact>> | null;
                                if (replacementSellerId && replacementSellerId !== seller.sellerId) {
                                  replaced = await settlementApi.replaceSellerFromSeller(seller.sellerId, replacementSellerId);
                                } else if (nextContactId && nextContactId !== baselineContactId) {
                                  reg = await settlementApi.linkSellerContact(seller.sellerId, nextContactId);
                                }
                                const nextForm: SellerRegFormState = {
                                  ...form,
                                  registrationChosen: true,
                                  registered: Boolean((replaced?.contactId ?? reg?.contactId ?? nextContactId) != null),
                                  contactId: replaced?.contactId ?? reg?.contactId ?? nextContactId,
                                  replacementSellerId: null,
                                  name: replaced?.sellerName ?? reg?.sellerName ?? form.name.trim(),
                                  mark: replaced?.sellerMark ?? reg?.sellerMark ?? form.mark.trim(),
                                  mobile: replaced?.sellerPhone ?? reg?.sellerPhone ?? form.mobile.trim(),
                                  contactSearchQuery: '',
                                  allowRegisteredEdit: false,
                                  unregisteredPrintConfirmed: false,
                                };
                                setSellerFormById(prev => ({ ...prev, [seller.sellerId]: nextForm }));
                                setRegisteredBaselineById(prev => ({ ...prev, [seller.sellerId]: nextForm }));
                                setSellers(prev =>
                                  prev.map(x =>
                                    x.sellerId === seller.sellerId
                                      ? {
                                          ...x,
                                          sellerName: nextForm.name,
                                          sellerMark: nextForm.mark,
                                          contactId: nextForm.contactId,
                                          sellerPhone: nextForm.mobile,
                                        }
                                      : x
                                  )
                                );
                                toast.success('Seller replaced successfully');
                              } catch {
                                toast.error('Failed to replace seller');
                              } finally {
                                setSellerRegSaving(prev => ({ ...prev, [seller.sellerId]: false }));
                              }
                            })();
                          }}
                        >
                          Update Seller
                        </Button>
                      </div>
                      <div className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-3">
                        {form.registrationChosen && !form.registered && (
                          <p className="col-span-full text-[10px] text-muted-foreground sm:col-span-3">
                            <span className="font-semibold text-destructive">*</span> Mark and mobile are required to register this seller; name is optional.
                          </p>
                        )}
                        <div className="min-w-0">
                          <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Mark
                            {form.registrationChosen && !form.registered ? (
                              <>
                                {' '}
                                <span className="text-destructive">*</span>
                                <span className="font-normal normal-case text-muted-foreground/70"> (unique)</span>
                              </>
                            ) : null}
                          </label>
                          <Input
                            value={form.mark}
                            onChange={e =>
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                return { ...prev, [seller.sellerId]: { ...cur, mark: e.target.value } };
                              })
                            }
                            className={cn(
                              'h-9 w-full min-w-0 rounded-lg text-sm',
                              form.registered && !form.allowRegisteredEdit && 'cursor-not-allowed border-dashed bg-muted/45 text-muted-foreground'
                            )}
                            disabled={isSettlementFormReadOnly || !form.registrationChosen || (form.registered && !form.allowRegisteredEdit)}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Seller name
                            {form.registrationChosen && !form.registered ? (
                              <span className="font-normal normal-case text-muted-foreground/70"> (optional)</span>
                            ) : null}
                          </label>
                          <Input
                            value={form.name}
                            onChange={e =>
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                return { ...prev, [seller.sellerId]: { ...cur, name: e.target.value } };
                              })
                            }
                            className={cn(
                              'h-9 min-w-0 w-full rounded-lg text-sm',
                              form.registered && !form.allowRegisteredEdit && 'cursor-not-allowed border-dashed bg-muted/45 text-muted-foreground',
                              highlightSellerName &&
                                'ring-2 ring-destructive/70 ring-offset-2 ring-offset-background dark:ring-offset-background'
                            )}
                            disabled={isSettlementFormReadOnly || !form.registrationChosen || (form.registered && !form.allowRegisteredEdit)}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Mobile
                            {form.registrationChosen && !form.registered ? (
                              <>
                                {' '}
                                <span className="text-destructive">*</span>
                                <span className="font-normal normal-case text-emerald-600 dark:text-emerald-400">
                                  {' '}
                                  (10 digits, unique)
                                </span>
                              </>
                            ) : null}
                          </label>
                          <Input
                            value={form.mobile}
                            onChange={e =>
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                return {
                                  ...prev,
                                  [seller.sellerId]: {
                                    ...cur,
                                    mobile: e.target.value.replace(/\D/g, '').slice(0, 10),
                                  },
                                };
                              })
                            }
                            className={cn(
                              'h-9 w-full min-w-0 rounded-lg text-sm',
                              form.registered && !form.allowRegisteredEdit && 'cursor-not-allowed border-dashed bg-muted/45 text-muted-foreground'
                            )}
                            inputMode="tel"
                            disabled={isSettlementFormReadOnly || !form.registrationChosen || (form.registered && !form.allowRegisteredEdit)}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                          <Checkbox
                            className="h-4 w-4 rounded-none"
                            checked={form.addAndChangeSeller}
                            disabled={isSettlementFormReadOnly}
                            onCheckedChange={v =>
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                return { ...prev, [seller.sellerId]: { ...cur, addAndChangeSeller: v === true } };
                              })
                            }
                          />
                          <span>Add & change seller</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(arrSolidMd, 'min-w-[8rem]')}
                            disabled={
                              isSettlementFormReadOnly ||
                              !!sellerRegSaving[seller.sellerId] ||
                              !form.registrationChosen ||
                              !form.mobile.trim() ||
                              !form.mark.trim() ||
                              form.registered
                            }
                            onClick={() => {
                              void (async () => {
                                if (!can('Settlement', 'Edit')) {
                                  toast.error('You do not have permission to add seller details.');
                                  return;
                                }
                                setSellerRegSaving(prev => ({ ...prev, [seller.sellerId]: true }));
                                try {
                                  const normalizedMark = form.mark.trim().toUpperCase();
                                  const normalizedMobile = form.mobile.trim();
                                  const normalizedName = form.name.trim() || normalizedMark;

                                  if (!normalizedMark) {
                                    toast.error('Mark is required');
                                    return;
                                  }
                                  if (!normalizedMobile) {
                                    toast.error('Mobile is required');
                                    return;
                                  }
                                  if (!/^[6-9]\d{9}$/.test(normalizedMobile)) {
                                    toast.error('Enter a valid 10-digit mobile number');
                                    return;
                                  }

                                  const contactsRegistry = await contactApi.list({ scope: 'registry' });
                                  const traderRegistry = contactsRegistry.filter(c => String(c.trader_id ?? '').trim().length > 0);
                                  const markExists = traderRegistry.some(
                                    c => (c.mark ?? '').trim().toLowerCase() === normalizedMark.toLowerCase()
                                  );
                                  if (markExists) {
                                    toast.error('This mark is already in use by another contact');
                                    return;
                                  }
                                  const mobileExists = traderRegistry.some(
                                    c => (c.phone ?? '').trim() === normalizedMobile
                                  );
                                  if (mobileExists) {
                                    toast.error('This phone number is already registered');
                                    return;
                                  }

                                  const created = await contactApi.create({
                                    name: normalizedName,
                                    phone: normalizedMobile,
                                    mark: normalizedMark,
                                  });
                                  const reg = await settlementApi.linkSellerContact(seller.sellerId, created.contact_id);
                                  const nextForm: SellerRegFormState = {
                                    ...form,
                                    registrationChosen: true,
                                    registered: true,
                                    contactId: reg.contactId,
                                    name: reg.sellerName,
                                    mark: reg.sellerMark,
                                    mobile: reg.sellerPhone,
                                    contactSearchQuery: '',
                                    addAndChangeSeller: false,
                                    allowRegisteredEdit: false,
                                    unregisteredPrintConfirmed: false,
                                  };
                                  setSellerFormById(prev => ({ ...prev, [seller.sellerId]: nextForm }));
                                  setRegisteredBaselineById(prev => ({ ...prev, [seller.sellerId]: nextForm }));
                                  setSellers(prev =>
                                    prev.map(x =>
                                      x.sellerId === seller.sellerId
                                        ? {
                                            ...x,
                                            sellerName: reg.sellerName,
                                            sellerMark: reg.sellerMark,
                                            contactId: reg.contactId,
                                            sellerPhone: reg.sellerPhone,
                                          }
                                        : x
                                    )
                                  );
                                  toast.success(
                                    form.addAndChangeSeller
                                      ? 'Seller added and changed for this sales bill'
                                      : 'Seller added successfully'
                                  );
                                } catch (e) {
                                  if (e instanceof ContactApiError && e.errorKey === 'markexists') {
                                    toast.error(e.message || 'This mark is already in use by another contact');
                                    return;
                                  }
                                  if (e instanceof ContactApiError && e.errorKey === 'phoneexistsinactive') {
                                    toast.error('Phone exists on inactive contact. Restore it from Contacts module first.');
                                    return;
                                  }
                                  toast.error(e instanceof Error ? e.message : 'Failed to add seller');
                                } finally {
                                  setSellerRegSaving(prev => ({ ...prev, [seller.sellerId]: false }));
                                }
                              })();
                            }}
                          >
                            Add
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(arrOutlineMd, 'min-w-[7rem]')}
                            disabled={isSettlementFormReadOnly}
                            onClick={() => {
                              setSellerFormById(prev => ({
                                ...prev,
                                [seller.sellerId]: {
                                  ...(registeredBaselineById[seller.sellerId] ?? defaultSellerForm(seller)),
                                  addAndChangeSeller: false,
                                  allowRegisteredEdit: false,
                                  contactSearchQuery: '',
                                },
                              }));
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>

                    {splitSnapForSeller?.isEditing ? (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/35 bg-primary/[0.07] px-3 py-2 dark:bg-primary/10">
                        <p className="min-w-0 text-xs font-medium text-foreground">
                          Split edit: qty/weight totals stay fixed across the two rows. Rates are independent per row.
                          Save to finish or Cancel to restore the single row.
                        </p>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            className={cn(arrSolidSm, 'h-8 gap-1 px-2.5')}
                            onClick={() => commitSplitGroup(splitSnapForSeller.splitGroupId)}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 px-2.5"
                            onClick={() => cancelSplitGroup(splitSnapForSeller.splitGroupId)}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
                      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto rounded-xl border border-border/50 bg-background/40 shadow-sm lg:max-w-[calc(100%-18.25rem)]">
                        <table className="w-full min-w-[700px] border-separate border-spacing-0 text-[11px] leading-tight sm:text-sm">
                          <thead className={cn(SETTLEMENT_LOTS_TABLE_HEADER_GRADIENT, 'shadow-md')}>
                            <tr>
                              <th className="border-b border-white/25 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-white lg:px-3">
                                #
                              </th>
                              <th className="border-b border-white/25 px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-white lg:px-3">
                                Item (lot)
                              </th>
                              <th className="border-b border-white/25 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-white lg:px-3">
                                Qty
                              </th>
                              <th className="border-b border-white/25 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-white lg:px-3">
                                Wt (kg)
                              </th>
                              <th className="border-b border-white/25 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-white lg:px-3">
                                Avg (kg)
                              </th>
                              <th className="border-b border-white/25 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-white lg:px-3">
                                Rate (₹/bag)
                              </th>
                              <th className="border-b border-white/25 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-white lg:px-3">
                                Amount
                              </th>
                              <th className="border-b border-white/25 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-white lg:px-3">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={8}
                                  className={cn(
                                    'px-2 py-8 text-center text-muted-foreground',
                                    showSaveValidationChrome &&
                                      'rounded-lg ring-2 ring-destructive/50 ring-inset'
                                  )}
                                >
                                  No lots for this seller
                                </td>
                              </tr>
                            ) : (
                              tableRows.map((tr, displayIdx) => {
                                const { lot, sid, isExtraBid } = tr;
                                const rowKey = getSalesRowKeyForTableRow(isExtraBid, sid);
                                const splitSnap = splitSnapForSeller;
                                const rowInActiveSplitGroup = !!(
                                  splitSnap &&
                                  splitSnap.isEditing &&
                                  (rowKey === splitSnap.rowKeyA || rowKey === splitSnap.rowKeyB)
                                );
                                const splitEditLocksOthers = !!(splitSnap && splitSnap.isEditing);
                                const fieldLocked =
                                  isSettlementFormReadOnly ||
                                  (splitEditLocksOthers && !rowInActiveSplitGroup);
                                const div = getLotDivisor(lot);
                                const row = mergeLotDisplayRow(
                                  lot,
                                  isExtraBid ? undefined : lotOv[sid],
                                  div
                                );
                                const bounds = commodityAvgWeightBounds[lot.commodityName || ''];
                                const avgBelowMin = bounds != null && bounds.min > 0 && row.avg < bounds.min;
                                const avgAboveMax = bounds != null && bounds.max > 0 && row.avg > bounds.max;
                                const avgWarn = avgBelowMin || avgAboveMax;
                                const qtyEditableInSalesReport =
                                  (settlementFormMode === 'new' ||
                                    settlementFormMode === 'in-progress' ||
                                    settlementFormMode === 'saved') &&
                                  !isSettlementFormReadOnly;
                                const qtyCellEditable =
                                  qtyEditableInSalesReport &&
                                  (!splitEditLocksOthers || rowInActiveSplitGroup);
                                return (
                                  <tr
                                    key={sid}
                                    data-split-group={splitSnap?.splitGroupId ?? ''}
                                    className="border-b border-border/40 bg-card/90 text-center transition-colors hover:bg-muted/25"
                                  >
                                    <td className="px-2 py-2 align-middle tabular-nums text-foreground lg:px-3">
                                      {displayIdx + 1}
                                    </td>
                                    <td className="px-2 py-2 align-middle text-left font-semibold text-foreground lg:px-3">
                                      {isExtraBid &&
                                      settlementFormMode === 'saved' &&
                                      !isSettlementFormReadOnly ? (
                                        <Input
                                          className="h-8 min-w-0 max-w-[14rem] text-xs font-semibold"
                                          value={tr.extraBid.lotName}
                                          disabled={fieldLocked}
                                          onChange={e =>
                                            updateExtraBidLotName(seller.sellerId, sid, e.target.value)
                                          }
                                          aria-label="Lot item name"
                                        />
                                      ) : (
                                        <>
                                          {row.itemLabel}
                                          {isExtraBid ? (
                                            <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                                              (split)
                                            </span>
                                          ) : null}
                                        </>
                                      )}
                                    </td>
                                    <td className="px-1 py-1.5 align-middle lg:px-2">
                                      {qtyCellEditable ? (
                                        <SettlementNumericInput
                                          value={Number.isFinite(row.qty) ? row.qty : 0}
                                          onCommit={n => {
                                            const s = String(Math.round(n));
                                            if (splitSnap && rowInActiveSplitGroup) {
                                              applySplitGroupQtyWeightSync(seller, splitSnap, rowKey, 'qty', s);
                                            } else if (isExtraBid) {
                                              updateExtraBidLotField(seller.sellerId, sid, 'qty', s);
                                            } else {
                                              setLotSalesField(seller.sellerId, sid, 'qty', s);
                                            }
                                          }}
                                          onClear={
                                            rowInActiveSplitGroup
                                              ? undefined
                                              : isExtraBid
                                                ? () =>
                                                    updateExtraBidLotField(seller.sellerId, sid, 'qty', '0')
                                                : () => setLotSalesField(seller.sellerId, sid, 'qty', '')
                                          }
                                          commitMode="live"
                                          integerOnly
                                          fractionDigits={0}
                                          className={cn(
                                            'mx-auto h-9 w-[4.5rem] rounded-md border border-border bg-background px-1.5 text-center text-xs font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                                            showSaveValidationChrome &&
                                              invalidLotFieldBySid[sid]?.qty &&
                                              'ring-2 ring-destructive/60 ring-offset-1 ring-offset-background dark:ring-offset-background'
                                          )}
                                          aria-label="Quantity bags"
                                          disabled={fieldLocked}
                                        />
                                      ) : (
                                        <div
                                          className={cn(
                                            settlementReadOnlyCellClass,
                                            'mx-auto w-[4.5rem] text-foreground'
                                          )}
                                          title="Quantity from auction / arrivals (editable in settlement)"
                                        >
                                          {row.qty}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-1 py-1.5 align-middle lg:px-2">
                                      <SettlementNumericInput
                                        value={Number.isFinite(row.weight) ? row.weight : 0}
                                        onCommit={n => {
                                          const s = String(n);
                                          if (splitSnap && rowInActiveSplitGroup) {
                                            applySplitGroupQtyWeightSync(seller, splitSnap, rowKey, 'weight', s);
                                          } else if (isExtraBid) {
                                            updateExtraBidLotField(seller.sellerId, sid, 'weight', s);
                                          } else {
                                            setLotSalesField(seller.sellerId, sid, 'weight', s);
                                          }
                                        }}
                                        onClear={
                                          rowInActiveSplitGroup
                                            ? undefined
                                            : isExtraBid
                                              ? () =>
                                                  updateExtraBidLotField(seller.sellerId, sid, 'weight', '0')
                                              : () => setLotSalesField(seller.sellerId, sid, 'weight', '')
                                        }
                                        commitMode="live"
                                        fractionDigits={2}
                                        className={cn(
                                          'mx-auto h-9 w-[5rem] rounded-md border border-border bg-background px-1.5 text-center text-xs font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                                          showSaveValidationChrome &&
                                            invalidLotFieldBySid[sid]?.weight &&
                                            'ring-2 ring-destructive/60 ring-offset-1 ring-offset-background dark:ring-offset-background'
                                        )}
                                        aria-label="Weight kg"
                                        disabled={fieldLocked}
                                      />
                                    </td>
                                    <td className="px-1 py-1.5 align-middle lg:px-2">
                                      <div
                                        className={cn(
                                          settlementReadOnlyCellClass,
                                          avgWarn &&
                                            'border-amber-500/45 bg-amber-500/[0.12] text-amber-800 dark:text-amber-300',
                                        )}
                                        title="Weight ÷ quantity (from Billing commodity rules)"
                                      >
                                        {row.avg.toFixed(2)}
                                      </div>
                                      {avgBelowMin && row.weight > 0 && bounds && (
                                        <p className="mt-0.5 text-[9px] text-amber-600">&lt; min {bounds.min} kg</p>
                                      )}
                                      {avgAboveMax && row.weight > 0 && bounds && (
                                        <p className="mt-0.5 text-[9px] text-amber-600">&gt; max {bounds.max} kg</p>
                                      )}
                                    </td>
                                    <td className="px-1 py-1.5 align-middle lg:px-2">
                                      <SettlementNumericInput
                                        value={Number.isFinite(row.ratePerBag) ? row.ratePerBag : 0}
                                        onCommit={n => {
                                          const s = String(n);
                                          if (isExtraBid) {
                                            updateExtraBidLotField(seller.sellerId, sid, 'ratePerBag', s);
                                          } else {
                                            setLotSalesField(seller.sellerId, sid, 'ratePerBag', s);
                                          }
                                        }}
                                        onClear={
                                          isExtraBid
                                            ? () =>
                                                updateExtraBidLotField(seller.sellerId, sid, 'ratePerBag', '0')
                                            : () => setLotSalesField(seller.sellerId, sid, 'ratePerBag', '')
                                        }
                                        commitMode="live"
                                        fractionDigits={2}
                                        className={cn(
                                          'mx-auto h-9 w-[5.25rem] rounded-md border border-border bg-background px-1.5 text-center text-xs font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                                          showSaveValidationChrome &&
                                            invalidLotFieldBySid[sid]?.rate &&
                                            'ring-2 ring-destructive/60 ring-offset-1 ring-offset-background dark:ring-offset-background'
                                        )}
                                        aria-label="Rate per bag"
                                        title="Seller settlement rate per bag; amount uses commodity divisor from settings"
                                        disabled={fieldLocked}
                                      />
                                    </td>
                                    <td className="px-1 py-1.5 align-middle lg:px-2">
                                      <div
                                        className={cn(
                                          settlementReadOnlyCellClass,
                                          'font-bold text-emerald-900/90 dark:text-emerald-300/95 border-emerald-600/25 bg-emerald-500/[0.08]'
                                        )}
                                        title={`(Weight × rate) ÷ divisor (${div})`}
                                      >
                                        ₹{formatMoney2Display(row.amount)}
                                      </div>
                                    </td>
                                    <td className="px-1 py-1.5 align-middle text-center lg:px-2">
                                      <div className="inline-flex items-center justify-center gap-0.5">
                                        {settlementFormMode === 'saved' && !isSettlementFormReadOnly && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 text-primary hover:bg-primary/10"
                                            aria-label="Split row 1:1"
                                            title="Split this row in half (enable edit with Alt+M)"
                                            disabled={
                                              splitEditLocksOthers ||
                                              row.qty <= 0 ||
                                              row.weight <= 0
                                            }
                                            onClick={() => splitInlineSalesTableRow(seller, tr, row, lotOv)}
                                          >
                                            <Edit3 className="h-4 w-4" />
                                          </Button>
                                        )}
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                          aria-label="Remove row"
                                          disabled={isSettlementFormReadOnly || fieldLocked}
                                          onClick={() =>
                                            setDeleteLotConfirm({
                                              sellerId: seller.sellerId,
                                              lotId: sid,
                                              itemLabel: row.itemLabel,
                                              isExtraBid,
                                            })
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          {tableRows.length > 0 ? (
                            <tfoot>
                              <tr className="border-t-2 border-violet-500/35 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-slate-500/10 text-[11px] font-bold text-foreground">
                                <td colSpan={2} className="px-2 py-2.5 text-center lg:px-3">
                                  Total
                                </td>
                                <td
                                  className={cn(
                                    'px-2 py-2.5 text-center tabular-nums lg:px-3',
                                    showSaveValidationChrome &&
                                      qtyOutOfBalance &&
                                      'rounded-md ring-2 ring-destructive/55 ring-offset-2 ring-offset-background dark:ring-offset-background'
                                  )}
                                >
                                  <span className="inline-flex items-center justify-center gap-1">
                                    {qtyTot}
                                    {qtyOutOfBalance && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex text-destructive" aria-label="Quantity mismatch">
                                            <AlertTriangle className="h-4 w-4 shrink-0" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[260px] text-xs">
                                          Total quantity ({qtyTot}) must equal arrival bags ({allowedQtyBags}) before
                                          save or update.
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </span>
                                </td>
                                <td className="px-2 py-2.5 text-center tabular-nums lg:px-3">{weightTot.toFixed(1)}</td>
                                <td className="px-2 py-2.5 text-center lg:px-3" />
                                <td className="px-2 py-2.5 text-center lg:px-3" />
                                <td className="px-2 py-2.5 text-center tabular-nums lg:px-3">
                                  ₹{formatMoney2Display(amountTot)}
                                </td>
                                <td className="px-2 py-2.5 text-center lg:px-3" />
                              </tr>
                            </tfoot>
                          ) : null}
                        </table>
                      </div>

                      <div className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/20 lg:w-[19.25rem]">
                        <div className="relative shrink-0 overflow-hidden px-3 py-2.5">
                          <div className={cn('absolute inset-0', SETTLEMENT_LOTS_TABLE_HEADER_GRADIENT)} />
                          <div className={DESKTOP_SIDEBAR_LIKE_SHINE} />
                          <p className="relative z-10 text-center text-sm font-bold text-white drop-shadow-sm">Expenses</p>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Use weighman</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60"
                                  aria-label="Weighman toggle help"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                                ON: weighing applies to this seller&apos;s totals (merged into freight or separate — see Add to
                                freight). OFF: excluded from totals; amounts are kept for this seller. While Add to freight is ON,
                                turn it off here first, then you can turn Use weighman off.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <button
                            type="button"
                            id={`sw-w-${seller.sellerId}`}
                            className={settlementExpenseToggleBtnClass(
                              isWeighingEnabledForSeller(seller.sellerId),
                              'emerald',
                              isSettlementFormReadOnly ||
                                (isWeighingEnabledForSeller(seller.sellerId) &&
                                  isWeighingMergedIntoFreight(seller.sellerId))
                            )}
                            disabled={
                              isSettlementFormReadOnly ||
                              (isWeighingEnabledForSeller(seller.sellerId) &&
                                isWeighingMergedIntoFreight(seller.sellerId))
                            }
                            onClick={() => {
                              if (isSettlementFormReadOnly) return;
                              const sid = seller.sellerId;
                              setSettlementWeighingEnabledBySellerId(prev => {
                                const cur = prev[sid] !== false;
                                return { ...prev, [sid]: !cur };
                              });
                            }}
                            aria-label="Use weighman in totals"
                            aria-pressed={isWeighingEnabledForSeller(seller.sellerId)}
                          >
                            <motion.div
                              className="absolute top-1 h-[22px] w-[22px] rounded-full bg-white shadow-md"
                              animate={{ x: isWeighingEnabledForSeller(seller.sellerId) ? 28 : 4 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                          </button>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Add to freight</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60"
                                  aria-label="Weighing merge toggle help"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                                Requires Use weighman ON. ON (default) merges weighing into the Freight line (single field). OFF keeps
                                weighing on its own line. Turn this off for this seller before you can turn Use weighman off on this
                                card.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <button
                            type="button"
                            id={`sw-wm-${seller.sellerId}`}
                            className={settlementExpenseToggleBtnClass(
                              isWeighingMergedIntoFreight(seller.sellerId),
                              'violet',
                              isSettlementFormReadOnly || !isWeighingEnabledForSeller(seller.sellerId)
                            )}
                            onClick={() => {
                              if (isSettlementFormReadOnly || !isWeighingEnabledForSeller(seller.sellerId)) return;
                              const sid = seller.sellerId;
                              const draft = weighmanDraftBySellerId[sid];
                              if (draft !== undefined && draft.trim() !== '') {
                                const v = clampMoney(parseFloat(draft) || 0);
                                quickAdjustmentAppliedRef.current = true;
                                setSellerExpensesById(prev => {
                                  const e0 = prev[sid] ?? defaultSellerExpenses();
                                  return { ...prev, [sid]: { ...e0, weighman: v } };
                                });
                              }
                              setWeighmanDraftBySellerId(prev => {
                                if (prev[sid] === undefined) return prev;
                                const next = { ...prev };
                                delete next[sid];
                                return next;
                              });
                              setSettlementWeighingMergeIntoFreightBySellerId(prev => {
                                const cur = prev[sid] !== false;
                                return { ...prev, [sid]: !cur };
                              });
                            }}
                            disabled={isSettlementFormReadOnly || !isWeighingEnabledForSeller(seller.sellerId)}
                            aria-label="Add weighing amount to freight"
                            aria-pressed={isWeighingMergedIntoFreight(seller.sellerId)}
                          >
                            <motion.div
                              className="absolute top-1 h-[22px] w-[22px] rounded-full bg-white shadow-md"
                              animate={{
                                x: isWeighingMergedIntoFreight(seller.sellerId) ? 28 : 4,
                              }}
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                          </button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                Freight
                                <InlineCalcTip
                                  label={`Freight formula ${seller.sellerId}`}
                                  lines={[
                                    'Quick Expenses default: (seller settlement weight / total settlement weight) x arrival freight.',
                                    isWeighingEnabledForSeller(seller.sellerId) &&
                                      isWeighingMergedIntoFreight(seller.sellerId)
                                      ? 'Add to freight ON: this field shows freight + weighing (edits adjust base freight).'
                                      : 'Freight always applies to net payable; weighing follows Use weighman / Add to freight.',
                                    `Stored freight: ${formatMoney2Display(exp.freight)}`,
                                  ]}
                                />
                              </span>
                              {(() => {
                                const mergeIntoFreightMode =
                                  isWeighingEnabledForSeller(seller.sellerId) &&
                                  isWeighingMergedIntoFreight(seller.sellerId);
                                const displayedFreight = mergeIntoFreightMode ? exp.freight + exp.weighman : exp.freight;
                                return (
                                  <div className="flex max-w-[8.5rem] shrink-0 items-center justify-end gap-1">
                                    <SettlementNumericInput
                                      id={`settlement-seller-expense-${seller.sellerId}-freight`}
                                      value={displayedFreight}
                                      onCommit={entered => {
                                        const v = clampMoney(entered);
                                        setSellerExpensesById(prev => {
                                          const e0 = prev[seller.sellerId] ?? defaultSellerExpenses();
                                          if (mergeIntoFreightMode) {
                                            const baseFreight = clampMoney(v - e0.weighman);
                                            return { ...prev, [seller.sellerId]: { ...e0, freight: baseFreight } };
                                          }
                                          return { ...prev, [seller.sellerId]: { ...e0, freight: v } };
                                        });
                                      }}
                                      commitMode="live"
                                      fractionDigits={2}
                                      emptyWhenZero
                                      className={settlementExpenseInputClass}
                                      aria-label="Freight amount"
                                      disabled={isSettlementFormReadOnly}
                                    />
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                Unloading
                                <InlineCalcTip
                                  label={`Unloading formula ${seller.sellerId}`}
                                  lines={[
                                    'Quick Adjustment auto distribution: (seller bags / total bags) x total unloading pool.',
                                    'Total unloading pool is computed from lot-level commodity slab rules.',
                                    `Current value: ${formatMoney2Display(exp.unloading)}`,
                                  ]}
                                />
                              </span>
                              <div className="flex max-w-[8.5rem] shrink-0 items-center justify-end gap-1">
                                <SettlementNumericInput
                                  value={exp.unloading}
                                  onCommit={v => {
                                    const x = clampMoney(v);
                                    quickAdjustmentAppliedRef.current = true;
                                    setSellerExpensesById(prev => {
                                      const e0 = prev[seller.sellerId] ?? defaultSellerExpenses();
                                      return { ...prev, [seller.sellerId]: { ...e0, unloading: x } };
                                    });
                                  }}
                                  commitMode="blur"
                                  fractionDigits={2}
                                  emptyWhenZero
                                  className={settlementExpenseInputClass}
                                  aria-label="Unloading amount"
                                  disabled={isSettlementFormReadOnly}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                Weighing
                                <InlineCalcTip
                                  label={`Weighing formula ${seller.sellerId}`}
                                  lines={[
                                    'Quick Adjustment auto distribution: (seller bags / total bags) x total weighing pool.',
                                    'Total weighing pool is computed from commodity weighing slab rules.',
                                    !isWeighingEnabledForSeller(seller.sellerId)
                                      ? 'Use weighman OFF: excluded from totals (amounts kept for this seller).'
                                      : isWeighingMergedIntoFreight(seller.sellerId)
                                        ? 'Add to freight ON: weighing merged into freight line.'
                                        : 'Add to freight OFF: weighing as its own deduction.',
                                    `Current value: ${formatMoney2Display(exp.weighman)}`,
                                  ]}
                                />
                              </span>
                              <div className="flex max-w-[8.5rem] shrink-0 items-center justify-end gap-1">
                                <SettlementNumericInput
                                  value={exp.weighman}
                                  onCommit={v => {
                                    const x = clampMoney(v);
                                    quickAdjustmentAppliedRef.current = true;
                                    setSellerExpensesById(prev => {
                                      const e0 = prev[seller.sellerId] ?? defaultSellerExpenses();
                                      return { ...prev, [seller.sellerId]: { ...e0, weighman: x } };
                                    });
                                  }}
                                  onRawChange={raw => {
                                    setWeighmanDraftBySellerId(prev => {
                                      if (raw === null) {
                                        const next = { ...prev };
                                        delete next[seller.sellerId];
                                        return next;
                                      }
                                      return { ...prev, [seller.sellerId]: raw };
                                    });
                                  }}
                                  commitMode="blur"
                                  fractionDigits={2}
                                  emptyWhenZero
                                  disabled={
                                    isSettlementFormReadOnly ||
                                    !isWeighingEnabledForSeller(seller.sellerId) ||
                                    isWeighingMergedIntoFreight(seller.sellerId)
                                  }
                                  className={cn(
                                    settlementExpenseInputClass,
                                    isWeighingMergedIntoFreight(seller.sellerId) &&
                                      isWeighingEnabledForSeller(seller.sellerId) &&
                                      'opacity-80'
                                  )}
                                  aria-label="Weighing charges"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">Cash Advance</span>
                              <SettlementNumericInput
                                value={exp.cashAdvance}
                                onCommit={v => {
                                  const x = clampMoney(v);
                                  setSellerExpensesById(prev => {
                                    const e0 = prev[seller.sellerId] ?? defaultSellerExpenses();
                                    return { ...prev, [seller.sellerId]: { ...e0, cashAdvance: x } };
                                  });
                                }}
                                commitMode="live"
                                fractionDigits={2}
                                emptyWhenZero
                                className={settlementExpenseInputClass}
                                aria-label="Cash advance"
                                disabled={isSettlementFormReadOnly}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">Gunnies</span>
                              <SettlementNumericInput
                                value={exp.gunnies}
                                onCommit={v => {
                                  const x = clampMoney(v);
                                  setSellerExpensesById(prev => {
                                    const e0 = prev[seller.sellerId] ?? defaultSellerExpenses();
                                    return { ...prev, [seller.sellerId]: { ...e0, gunnies: x } };
                                  });
                                }}
                                commitMode="live"
                                fractionDigits={2}
                                emptyWhenZero
                                className={settlementExpenseInputClass}
                                aria-label="Gunnies"
                                disabled={isSettlementFormReadOnly}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">Others</span>
                              <SettlementNumericInput
                                value={exp.others}
                                onCommit={v => {
                                  const x = clampMoney(v);
                                  setSellerExpensesById(prev => {
                                    const e0 = prev[seller.sellerId] ?? defaultSellerExpenses();
                                    return { ...prev, [seller.sellerId]: { ...e0, others: x } };
                                  });
                                }}
                                commitMode="live"
                                fractionDigits={2}
                                emptyWhenZero
                                className={settlementExpenseInputClass}
                                aria-label="Other expenses"
                                disabled={isSettlementFormReadOnly}
                              />
                            </div>
                          </div>
                        <div className="shrink-0 space-y-1 border-t border-border/50 p-3 pt-2 text-xs">
                          <div className="flex justify-between font-semibold">
                            <span className="inline-flex items-center gap-1 text-center">
                              Total expenses
                              <InlineCalcTip
                                label={`Total expenses formula ${seller.sellerId}`}
                                lines={[
                                  'Total = Freight + Unloading + (Use weighman ? Weighing : Add to freight ? weighing in freight : 0) + Cash Advance + Gunnies + Others.',
                                  `Current total expenses: ${formatMoney2Display(expenseTotal)}`,
                                ]}
                              />
                            </span>
                            <span className="tabular-nums text-center">{formatMoney2Display(expenseTotal)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-foreground">
                            <span className="inline-flex items-center gap-1 text-center">
                              Net payable
                              <InlineCalcTip
                                label={`Net payable formula ${seller.sellerId}`}
                                lines={[
                                  'Net payable = Auction amount - Total expenses.',
                                  `Qty used: ${Math.round(qtyTot)} bags`,
                                  `Weight used: ${weightTot.toFixed(1)} kg`,
                                  `Auction amount: ${formatMoney2Display(amountTot)}`,
                                  `Total expenses: ${formatMoney2Display(expenseTotal)}`,
                                  `Current net payable: ${formatMoney2Display(netSeller)}`,
                                ]}
                              />
                            </span>
                            <span className="tabular-nums text-center text-emerald-600 dark:text-emerald-400">
                              {formatMoney2Display(netSeller)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                      </>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(arrOutlineMd, 'gap-1.5')}
                        onClick={() => void runPrintSellerSubPatti(seller)}
                        disabled={
                          isSettlementFormReadOnly ||
                          !!sellerValidationError ||
                          !isSettlementSellerPrintAllowed(seller, form)
                        }
                        title={
                          isSettlementFormReadOnly
                            ? 'Enable edit (Alt+M) to print'
                            : sellerValidationError ??
                              settlementSellerPrintGateMessage(seller, form) ??
                              undefined
                        }
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print Sub Patti
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(arrOutlineMd, 'gap-1.5')}
                        disabled={isSettlementFormReadOnly}
                        title={isSettlementFormReadOnly ? 'Enable edit (Alt+M) to add vouchers' : undefined}
                        onClick={() => {
                          setAddVoucherSellerId(seller.sellerId);
                        }}
                      >
                        Add Voucher
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(arrSolidMd, 'gap-1.5')}
                        onClick={() => void savePattiForSeller(seller)}
                        disabled={isSettlementFormReadOnly || pattiSaveBusy}
                        title={
                          isSettlementFormReadOnly
                            ? 'Enable edit (Alt+M) to save'
                            : sellerValidationError ?? 'Validates on click'
                        }
                      >
                        <Save className="h-3.5 w-3.5" />
                        {existingPattiIdBySellerId[seller.sellerId] != null ? 'Update Patti' : 'Save Patti'}
                      </Button>
                    </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="glass-card rounded-2xl border border-border/50 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              {isOriginalReferenceMode && (
                <span className="w-full text-center text-xs font-semibold text-primary sm:w-auto sm:text-sm">
                  Viewing original (read-only) — Alt+M to return to modified
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => void savePatti()}
                disabled={!pattiData || pattiSaveBusy || isSettlementFormReadOnly}
                className={cn(arrSolidTall, 'gap-2 sm:min-w-[11rem]')}
                title={mainPattiValidationError ?? 'Validates on click; fix highlighted seller cards if save is rejected.'}
              >
                <Save className="h-5 w-5" />
                {isMainUpdateMode ? 'Update Main Patti (Alt S)' : 'Save Main Patti (Alt S)'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(arrOutlineTall, 'gap-2 sm:min-w-[10rem]')}
                disabled={
                  isSettlementFormReadOnly ||
                  !canRunMainPattiActions ||
                  settlementPrintPermissionError != null
                }
                onClick={() => void runPrintMainPatti()}
                title={
                  isSettlementFormReadOnly
                    ? 'Enable edit (Alt+M) to print'
                    : settlementPrintPermissionError ?? mainPattiValidationError ?? undefined
                }
              >
                <Printer className="h-4 w-4" />
                Print Main Patti
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(arrOutlineTall, 'gap-2 sm:min-w-[10rem]')}
                disabled={
                  isSettlementFormReadOnly ||
                  !canRunMainPattiActions ||
                  settlementPrintPermissionError != null
                }
                onClick={() => void runPrintAllSubPatti()}
                title={
                  isSettlementFormReadOnly
                    ? 'Enable edit (Alt+M) to print'
                    : settlementPrintPermissionError ?? mainPattiValidationError ?? undefined
                }
              >
                <Printer className="h-4 w-4" />
                Print All Sub Patti
              </Button>
            </div>
          </motion.div>

          {cmpFooter && (
            <div
              className={cn(
                'pointer-events-none fixed bottom-0 right-0 z-[90] flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] print:hidden',
                isDesktop ? 'left-[260px]' : 'left-0',
              )}
            >
              <div
                className={cn(
                  'pointer-events-auto w-full max-w-5xl overflow-hidden rounded-t-2xl border border-border/60 bg-card/95 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md dark:bg-card/90',
                  !originalCompareFooterExpanded && 'rounded-t-xl',
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-2">
                  <p className="min-w-0 text-xs font-bold text-foreground sm:text-sm">
                    Bill vs auction &amp; weights
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1 px-2 text-xs font-semibold"
                    onClick={() => setOriginalCompareFooterExpanded(e => !e)}
                    aria-expanded={originalCompareFooterExpanded}
                  >
                    {originalCompareFooterExpanded ? (
                      <>
                        Collapse <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      </>
                    ) : (
                      <>
                        Expand <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                      </>
                    )}
                  </Button>
                </div>
                {originalCompareFooterExpanded && (
                  <div className="grid max-h-[min(32vh,18rem)] grid-cols-1 gap-2.5 overflow-y-auto px-3 py-2.5 sm:grid-cols-3 sm:gap-3 sm:px-4 sm:py-3">
                    {(() => {
                      const { billOriginalAmt, arrivalWeightKg, fromSalesAuction, pattiNetWtKg, rateDiff, weightDiff } =
                        cmpFooter;
                      const signedMoneyClass = (d: number | null, eps = 0.005) =>
                        d == null || !Number.isFinite(d)
                          ? 'text-muted-foreground'
                          : d > eps
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : d < -eps
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-muted-foreground';
                      const signedKgClass = (d: number | null, eps = 0.05) => signedMoneyClass(d, eps);
                      const rateDiffText =
                        rateDiff == null || !Number.isFinite(rateDiff)
                          ? '—'
                          : `${rateDiff >= 0 ? '+' : '−'}${formatRupeeInr(Math.abs(rateDiff))}`;
                      const weightDiffText =
                        weightDiff == null || !Number.isFinite(weightDiff)
                          ? '—'
                          : Math.abs(weightDiff) < 0.05
                            ? '0 kg'
                            : `${weightDiff > 0 ? '+' : '−'}${Math.abs(weightDiff).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
                      return (
                        <>
                          <div className="flex flex-col gap-2.5 sm:gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Bill Original Amt
                                <InlineCalcTip
                                  label="Bill Original Amt"
                                  lines={[
                                    'Sum of each seller’s gross from their first snapshot on this arrival (all sellers must have a stored original).',
                                  ]}
                                />
                              </div>
                              <p className="text-sm font-bold tabular-nums text-foreground">
                                {billOriginalAmt != null ? formatRupeeInr(billOriginalAmt) : '—'}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Arrival weight
                                <InlineCalcTip
                                  label="Arrival weight"
                                  lines={[
                                    'Net billable kg from the arrival record — same value as Arrival Weight on Vehicle details.',
                                  ]}
                                />
                              </div>
                              <p className="text-sm font-bold tabular-nums text-foreground">
                                {formatOptionalKg(arrivalWeightKg)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2.5 sm:gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                From Sales Auction
                                <InlineCalcTip
                                  label="From Sales Auction"
                                  lines={[
                                    'Same total as “From Sales Auction” on the Expenses & Invoice card (sales lots on this arrival).',
                                  ]}
                                />
                              </div>
                              <p className="text-sm font-bold tabular-nums text-foreground">
                                {formatRupeeInr(fromSalesAuction)}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Patti Net Wt
                                <InlineCalcTip
                                  label="Patti Net Wt"
                                  lines={[
                                    'Same as Patti Net Wt on Vehicle details (rate-cluster weights for this scope).',
                                  ]}
                                />
                              </div>
                              <p className="text-sm font-bold tabular-nums text-foreground">
                                {formatOptionalKg(pattiNetWtKg)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2.5 sm:gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Rate Difference
                                <InlineCalcTip
                                  label="Rate Difference"
                                  lines={[
                                    'Bill Original Amt − From Sales Auction (only when Bill Original is the full multi-seller sum).',
                                    'Green when positive, red when negative.',
                                  ]}
                                />
                              </div>
                              <p
                                className={cn(
                                  'text-sm font-bold tabular-nums',
                                  rateDiff != null ? signedMoneyClass(rateDiff) : 'text-muted-foreground',
                                )}
                              >
                                {rateDiffText}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Weight Difference
                                <InlineCalcTip
                                  label="Weight Difference"
                                  lines={[
                                    'Arrival weight − Patti Net Wt.',
                                    'Green when positive, red when negative.',
                                  ]}
                                />
                              </div>
                              <p className={cn('text-sm font-bold tabular-nums', signedKgClass(weightDiff))}>
                                {weightDiffText}
                              </p>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          <Dialog
            open={vehicleExpenseModalOpen}
            onOpenChange={setVehicleExpenseModalOpen}
          >
            <DialogContent
              onOpenAutoFocus={e => e.preventDefault()}
              className="max-h-[90dvh] max-w-5xl overflow-y-auto rounded-2xl border border-border/60 bg-background p-0 sm:p-0"
            >
              <div className="border-b border-border/50 bg-muted/30 px-5 py-4 sm:px-6">
                <DialogHeader className="space-y-1.5 text-center sm:text-center">
                  <DialogTitle className="text-lg font-bold tracking-tight sm:text-xl">Add Quick Adjustment</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
                    Quantities come from settlement lot rows (read-only). Freight, unloading, and weighing are direct per-seller amounts you can edit here;
                    they are not driven by the Expense card toggles (Use weighman / Add to freight). Apply writes these values into each seller’s expense state.
                    Press Alt X to open.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="relative px-3 py-4 sm:px-5 sm:py-5">
                {vehicleExpenseLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-[1px]">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
                    <span className="sr-only">Loading expenses</span>
                  </div>
                )}
                <div className="overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm">
                  <table className="w-full min-w-[880px] border-collapse text-sm">
                    <thead className={cn(SETTLEMENT_LOTS_TABLE_HEADER_GRADIENT, 'shadow-md')}>
                      <tr>
                        <th className="min-w-[11rem] border-b border-white/25 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white">
                          Seller
                        </th>
                        <th className="min-w-[5.5rem] border-b border-white/25 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white">
                          Qty (bags)
                        </th>
                        <th className="min-w-[7.5rem] border-b border-white/25 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white">
                          <span className="inline-flex items-center gap-1.5">
                            Freight
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-white/90 hover:bg-white/15"
                                  aria-label="Quick adjustment freight formula"
                                >
                                  <Info className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" sideOffset={8} className="z-[99999] max-w-[320px] text-xs leading-relaxed">
                                <div className="space-y-0.5 text-left normal-case tracking-normal">
                                  <p>Freight = (seller settlement weight / total settlement weight) x arrival freight amount.</p>
                                  <p>If total settlement weight is 0, fallback to saved seller freight; otherwise equal share.</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </th>
                        <th className="min-w-[7.5rem] border-b border-white/25 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white">
                          <span className="inline-flex items-center gap-1.5">
                            Unloading
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-white/90 hover:bg-white/15"
                                  aria-label="Quick adjustment unloading formula"
                                >
                                  <Info className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" sideOffset={8} className="z-[99999] max-w-[320px] text-xs leading-relaxed">
                                <div className="space-y-0.5 text-left normal-case tracking-normal">
                                  <p>Unloading = (seller bags / total bags) x total unloading pool.</p>
                                  <p>If total bags is 0, fallback to equal share or existing seller unloading.</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </th>
                        <th className="min-w-[7.5rem] border-b border-white/25 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white">
                          <span className="inline-flex items-center gap-1.5">
                            Weighing
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-white/90 hover:bg-white/15"
                                  aria-label="Quick adjustment weighing formula"
                                >
                                  <Info className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" sideOffset={8} className="z-[99999] max-w-[320px] text-xs leading-relaxed">
                                <div className="space-y-0.5 text-left normal-case tracking-normal">
                                  <p>Weighing = (seller bags / total bags) x total weighing pool.</p>
                                  <p>If total bags is 0, fallback to equal share or existing seller weighing.</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </th>
                        <th className="min-w-[7.5rem] border-b border-white/25 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white">
                          Gunnies
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicleExpenseRows.map(row => (
                        <tr
                          key={row.id}
                          className="border-b border-border/40 transition-colors odd:bg-background even:bg-muted/20 hover:bg-muted/40"
                        >
                          <td className="px-3 py-3 text-center align-middle">
                            <span className="line-clamp-2 text-xs font-medium text-foreground sm:text-sm">{row.sellerName}</span>
                          </td>
                          <td className="px-3 py-3 text-center align-middle">
                            <div
                              className={cn(settlementReadOnlyCellClass, 'mx-auto w-20 text-foreground')}
                              title="Quantity comes from settlement lot rows (not editable)"
                            >
                              {row.quantity}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center align-middle">
                            {renderVehicleExpenseInputCell(row, 'freight', 'Freight amount')}
                          </td>
                          <td className="px-2 py-2.5 text-center align-middle">
                            {renderVehicleExpenseInputCell(row, 'unloading', 'Unloading charges')}
                          </td>
                          <td className="px-2 py-2.5 text-center align-middle">
                            {renderVehicleExpenseInputCell(row, 'weighing', 'Weighing charges')}
                          </td>
                          <td className="px-2 py-2.5 text-center align-middle">
                            {renderVehicleExpenseInputCell(row, 'gunnies', 'Gunnies')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border/60 bg-muted/60">
                        <td className="px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wide text-foreground">
                          Total
                        </td>
                        <td className="px-3 py-3.5 text-center text-sm font-bold tabular-nums text-foreground">
                          {vehicleExpenseTotals.quantity}
                        </td>
                        <td className="px-3 py-3.5 text-center text-sm font-bold tabular-nums text-foreground">
                          {vehicleExpenseTotals.freight.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3.5 text-center text-sm font-bold tabular-nums text-foreground">
                          {vehicleExpenseTotals.unloading.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3.5 text-center text-sm font-bold tabular-nums text-foreground">
                          {vehicleExpenseTotals.weighing.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3.5 text-center text-sm font-bold tabular-nums text-foreground">
                          {vehicleExpenseTotals.gunnies.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <DialogFooter className="border-t border-border/50 bg-muted/20 px-5 py-4 sm:px-6">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(arrOutlineMd, 'gap-1.5')}
                      disabled={vehicleExpenseLoading || vehicleExpenseRows.length === 0}
                      onClick={() => void resetQuickAdjustmentToLatestSlabs()}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="What Reset does"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={8} className="z-[99999] max-w-[300px] text-xs leading-relaxed">
                        <p>
                          Recomputes freight, unloading, and weighing from current commodity slabs and settlement lot weights.
                          It does not load the old saved quick-adjustment snapshot or copy from the expense card. Gunnies stay
                          as they are on the expense card. Use Apply to write the table to each seller’s expense card.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className={arrOutlineMd}
                    onClick={() => setVehicleExpenseModalOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(arrSolidMd, 'gap-1.5')}
                    onClick={async () => {
                      try {
                        await settlementApi.saveQuickExpenseState(
                          vehicleExpenseRows.map(r => ({
                            sellerId: r.sellerId,
                            freight: r.freight,
                            unloading: r.unloading,
                            weighing: r.weighing,
                            gunnies: r.gunnies,
                          }))
                        );
                      } catch {
                        toast.error('Failed to save quick expense edits.');
                        return;
                      }
                      setSellerExpensesById(prev => {
                        const next = { ...prev };
                        const baselinePatch: Record<string, SellerExpenseFormState> = {};
                        for (const row of vehicleExpenseRows) {
                          const merged: SellerExpenseFormState = {
                            ...(prev[row.sellerId] ?? defaultSellerExpenses()),
                            freight: row.freight,
                            unloading: row.unloading,
                            weighman: row.weighing,
                            gunnies: row.gunnies,
                          };
                          next[row.sellerId] = merged;
                          baselinePatch[row.sellerId] = { ...merged };
                        }
                        queueMicrotask(() => {
                          setSellerExpenseRestoreBaselineById(bPrev => ({ ...bPrev, ...baselinePatch }));
                        });
                        return next;
                      });
                      quickAdjustmentAppliedRef.current = true;
                      setVehicleExpenseModalOpen(false);
                      toast.success('Expenses applied to per-seller Sales report.');
                    }}
                  >
                    <PlusCircle className="h-4 w-4" />
                    Apply to settlement
                  </Button>
                  </div>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={addVoucherSellerId != null}
            onOpenChange={open => {
              if (!open) setAddVoucherSellerId(null);
            }}
          >
            <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto rounded-2xl border border-border/60 bg-background p-0 sm:p-0">
              <div className="border-b border-border/50 bg-muted/30 px-4 py-3 sm:px-5">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="text-base font-bold tracking-tight">Add Voucher</DialogTitle>
                  <DialogDescription className="text-[11px] text-muted-foreground">
                    Add or edit multiple voucher rows. Total is synced to Others charges.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="space-y-3 px-4 py-3 sm:px-5">
                {addVoucherLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading vouchers...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {addVoucherRows.map((row, idx) => (
                      <div key={row.localId} className="grid grid-cols-1 gap-2 md:grid-cols-4">
                        <Input
                          value={row.voucherName}
                          onChange={e =>
                            setAddVoucherRows(prev =>
                              prev.map(r => (r.localId === row.localId ? { ...r, voucherName: e.target.value } : r))
                            )
                          }
                          placeholder="Voucher name"
                          className="h-9 rounded-lg text-sm"
                          autoComplete="off"
                        />
                        <Input
                          value={row.forWhoName}
                          onChange={e =>
                            setAddVoucherRows(prev =>
                              prev.map(r => (r.localId === row.localId ? { ...r, forWhoName: e.target.value } : r))
                            )
                          }
                          placeholder="For who / Name"
                          className="h-9 rounded-lg text-sm"
                          autoComplete="off"
                        />
                        <Input
                          value={row.description}
                          onChange={e =>
                            setAddVoucherRows(prev =>
                              prev.map(r => (r.localId === row.localId ? { ...r, description: e.target.value } : r))
                            )
                          }
                          placeholder="Description"
                          className="h-9 rounded-lg text-sm"
                          autoComplete="off"
                        />
                        <div className="flex items-center gap-2">
                          <SettlementNumericInput
                            value={clampMoney(parseFloat(row.expenseAmount || '0') || 0)}
                            onCommit={n =>
                              setAddVoucherRows(prev =>
                                prev.map(r =>
                                  r.localId === row.localId ? { ...r, expenseAmount: clampMoney(n).toFixed(2) } : r
                                )
                              )
                            }
                            allowEmptyZero
                            commitMode="blur"
                            fractionDigits={2}
                            placeholder="0.00"
                            className="h-9 rounded-lg text-sm"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className={arrOutlineSm}
                            disabled={addVoucherRows.length === 1}
                            onClick={() => {
                              setAddVoucherRows(prev => (prev.length > 1 ? prev.filter(r => r.localId !== row.localId) : prev));
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        className={arrOutlineSm}
                        onClick={() => setAddVoucherRows(prev => [...prev, buildEmptyVoucherRow()])}
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        Add Row
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="border-t border-border/50 bg-muted/20 px-4 py-3 sm:px-5">
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className={arrOutlineMd}
                    onClick={() => setAddVoucherSellerId(null)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(arrSolidMd, 'gap-1.5')}
                    disabled={addVoucherSaving || addVoucherLoading}
                    onClick={async () => {
                      if (!addVoucherSellerId) {
                        toast.error('Seller is required.');
                        return;
                      }
                      const rows = addVoucherRows
                        .map(r => ({
                          id: r.id,
                          voucherName: r.voucherName.trim(),
                          forWhoName: r.forWhoName.trim(),
                          description: r.description.trim(),
                          expenseAmount: clampMoney(parseFloat(r.expenseAmount || '0') || 0),
                        }))
                        .filter(r => r.voucherName !== '' || r.forWhoName !== '' || r.description !== '' || r.expenseAmount > 0);
                      const invalid = rows.some(r => r.voucherName === '' || r.expenseAmount <= 0);
                      if (invalid) {
                        toast.message('Each voucher row needs name and amount > 0.');
                        return;
                      }
                      setAddVoucherSaving(true);
                      try {
                        const response = await settlementApi.saveTemporaryVouchers(addVoucherSellerId, rows);
                        setSellerExpensesById(prev => {
                          const e0 = prev[addVoucherSellerId] ?? defaultSellerExpenses();
                          return {
                            ...prev,
                            [addVoucherSellerId]: {
                              ...e0,
                              others: clampMoney(response.totalExpenseAmount ?? 0),
                            },
                          };
                        });
                        setAddVoucherRows(
                          response.rows.length > 0
                            ? response.rows.map(r => ({
                                id: r.id,
                                localId: `v_${r.id ?? Math.random().toString(36).slice(2, 8)}`,
                                voucherName: r.voucherName ?? '',
                                forWhoName: r.forWhoName ?? '',
                                description: r.description ?? '',
                                expenseAmount: (Number(r.expenseAmount ?? 0) || 0).toFixed(2),
                              }))
                            : [buildEmptyVoucherRow()]
                        );
                        toast.success('Vouchers saved and summed in Others.');
                        setAddVoucherSellerId(null);
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Failed to save voucher.';
                        toast.error(msg);
                      } finally {
                        setAddVoucherSaving(false);
                      }
                    }}
                  >
                    {addVoucherSaving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Add'
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={deleteLotConfirm != null}
            onOpenChange={open => {
              if (!open) setDeleteLotConfirm(null);
            }}
          >
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this lot row?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteLotConfirm
                    ? deleteLotConfirm.isExtraBid
                      ? `“${deleteLotConfirm.itemLabel}” will be removed from this sales report.`
                      : `“${deleteLotConfirm.itemLabel}” will be removed from this sales report for now. Regenerate the patti from the arrival list to restore full lot lines.`
                    : null}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className={arrOutlineMd}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-xl h-9 px-3 text-sm font-semibold bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                  onClick={() => {
                    if (!deleteLotConfirm) return;
                    const { sellerId, lotId, isExtraBid } = deleteLotConfirm;
                    const keyRm = isExtraBid ? salesRowKeyExtra(lotId) : salesRowKeyApi(lotId);
                    if (isExtraBid) {
                      setExtraBidLotsBySellerId(prev => ({
                        ...prev,
                        [sellerId]: (prev[sellerId] ?? []).filter(e => e.id !== lotId),
                      }));
                    } else {
                      setRemovedLotsBySellerId(prev => ({
                        ...prev,
                        [sellerId]: [...(prev[sellerId] ?? []), lotId],
                      }));
                    }
                    setSalesReportRowOrderBySellerId(prev => {
                      const ord = prev[sellerId];
                      if (!ord?.length) return prev;
                      return { ...prev, [sellerId]: ord.filter(k => k !== keyRm) };
                    });
                    const act = activeSplitGroupIdBySellerIdRef.current[sellerId];
                    if (act) {
                      const g = splitGroupsByIdRef.current[act];
                      if (g && g.sellerId === sellerId && splitGroupHasRowKey(g, keyRm)) {
                        commitSplitGroup(act);
                      }
                    }
                    setDeleteLotConfirm(null);
                  }}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ SELLER LIST SCREEN ═══
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      <UnsavedChangesDialog />
      {!isDesktop ? (
      <div className="bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.2)_0%,transparent_42%)]" />
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
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => {
              void (async () => {
                const ok = await confirmIfDirty();
                if (!ok) return;
                navigate('/home');
              })();
            }} aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-xl font-black">₹</span> Settlement (Sales Patti)
              </h1>
              <p className="text-white/70 text-xs mt-0.5">{sellers.length} sellers · Settlement & payment reconciliation</p>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSettlementMainTab('arrival-summary')}
              className={settlementToggleTabBtnOnHero(settlementMainTab === 'arrival-summary')}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Arrival Summary</span>
            </button>
            <button
              type="button"
              disabled
              aria-disabled
              title="Open a row in Create New Patti, Patti In Progress, or Saved Patti below."
              className={cn(settlementToggleTabBtnOnHero(settlementMainTab === 'create-settlements'), 'opacity-50')}
            >
              <Edit3 className="w-4 h-4 shrink-0" />
              <span>{settlementSecondaryTabLabel}</span>
            </button>
          </div>
          <p className="mb-3 text-center text-[11px] text-white/70">
            Use the tables below to start or resume a patti. The workspace tab stays here for future layout.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input aria-label="Search" placeholder="Search by vehicle, seller name..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30" />
          </div>
        </div>
      </div>
      ) : (
      <div className="px-8 py-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">₹</span> Settlement (Sales Patti)
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{sellers.length} sellers · Settlement & payment reconciliation</p>
        </div>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto" role="tablist" aria-label="Settlement views">
            <button
              type="button"
              role="tab"
              aria-selected={settlementMainTab === 'arrival-summary'}
              onClick={() => setSettlementMainTab('arrival-summary')}
              className={settlementToggleTabBtn(settlementMainTab === 'arrival-summary')}
            >
              <FileText className="w-4 h-4 shrink-0" /> Arrival Summary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settlementMainTab === 'create-settlements'}
              disabled
              aria-disabled
              title="Open a row in Create New Patti, Patti In Progress, or Saved Patti below."
              className={cn(settlementToggleTabBtn(settlementMainTab === 'create-settlements'), 'opacity-50 cursor-not-allowed')}
            >
              <Edit3 className="w-4 h-4 shrink-0" /> {settlementSecondaryTabLabel}
            </button>
          </div>
          <div className="relative w-full min-w-0 lg:flex-1 lg:max-w-md lg:order-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              aria-label="Search"
              placeholder="Search by vehicle, seller name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF]"
            />
          </div>
        </div>
      </div>
      )}

      <div className="mt-4 space-y-4 px-4 lg:px-8">
        {settlementMainTab === 'arrival-summary' ? (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Arrival summary">
              <button
                type="button"
                role="tab"
                aria-selected={arrivalSummaryTab === 'new-patti'}
                onClick={() => setArrivalSummaryTab('new-patti')}
                className={settlementToggleTabBtn(arrivalSummaryTab === 'new-patti')}
              >
                Create New Patti{tabHint('Alt X')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={arrivalSummaryTab === 'in-progress-patti'}
                onClick={() => setArrivalSummaryTab('in-progress-patti')}
                className={settlementToggleTabBtn(arrivalSummaryTab === 'in-progress-patti')}
              >
                Patti In Progress{tabHint('Alt Y')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={arrivalSummaryTab === 'saved-patti'}
                onClick={() => setArrivalSummaryTab('saved-patti')}
                className={settlementToggleTabBtn(arrivalSummaryTab === 'saved-patti')}
              >
                Saved Patti{tabHint('Alt Z')}
              </button>
            </div>
            {renderArrivalSummaryTable(arrivalSummaryTab)}
          </>
        ) : (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Edit3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Create settlements form section is ready.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Structure added. Share the form layout and fields next, and I will implement it.
            </p>
          </div>
        )}
      </div>
      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default SettlementPage;