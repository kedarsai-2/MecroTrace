import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Gavel, Plus, Trash2,
  ShoppingCart, User, Users, Package, Truck, Banknote, ChevronDown,
  Search, AlertTriangle, Merge, Hash,
  ChevronLeft, ChevronRight, ChevronUp, List, Filter, Printer,
  Pencil, Check, X, RotateCcw, Settings2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { isNative, hapticSelection, hapticImpact, hapticNotification, hideNativeKeyboard, NotificationType } from '@/hooks/use-native';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import BottomNav from '@/components/BottomNav';
import ScribblePad from '@/components/ScribblePad';
import InlineScribblePad, { MAX_MARK_LEN, type MarkDetectionMeta } from '@/components/InlineScribblePad';
import { contactApi, auctionApi, presetMarksApi } from '@/services/api';
import type {
  LotSummaryDTO,
  LotParticipatingBuyerDTO,
  AuctionSelfSaleUnitDTO,
  AuctionSessionDTO,
  AuctionEntryDTO,
  AuctionResultDTO,
  AuctionSelfSaleContextDTO,
  AuctionBidCreateRequest,
  AuctionBidUpdateRequest,
} from '@/services/api/auction';
import type { Contact } from '@/types/models';
import { toast } from 'sonner';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { formatAuctionLotIdentifier } from '@/utils/auctionLotIdentifier';

/** API may send snake_case or camelCase; normalize for lot identifier. */
function pickVehicleMarkFromDto(dto: { vehicle_mark?: string; vehicleMark?: string }): string | undefined {
  const raw = dto.vehicle_mark ?? dto.vehicleMark;
  if (raw == null || typeof raw !== 'string') return undefined;
  const t = raw.trim();
  return t ? t : undefined;
}
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { directPrint } from '@/utils/printTemplates';
import { generateAuctionCompletionPrintHTML } from '@/utils/printDocumentTemplates';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_AUCTION_TOUCH_LAYOUT,
  parseAuctionTouchLayout,
  persistLocalAuctionTouchLayout,
  readLocalAuctionTouchLayout,
  type AuctionTouchHeroLayout,
  type AuctionTouchLayoutConfig,
} from '@/lib/auctionTouchLayoutConfig';
import { auctionTouchLayoutApi } from '@/services/api/auctionTouchLayout';

// ── Types ─────────────────────────────────────────────────
interface LotInfo {
  lot_id: string;
  selfSaleUnitId?: string | null;
  lot_name: string;
  bag_count: number;
  original_bag_count: number;
  commodity_name: string;
  seller_name: string;
  seller_mark: string;
  /** Vehicle mark alias from arrival. */
  vehicle_mark?: string;
  seller_vehicle_id: string;
  vehicle_number: string;
  was_modified: boolean;
  status?: LotStatus;
  vehicle_total_qty?: number;
  seller_total_qty?: number;
  selfSaleQty?: number;
  remainingQty?: number;
  selfSaleRate?: number;
  selfSaleAmount?: number;
  createdAt?: string;
  /** From API: buyers with bids on latest auction (for By Buyer navigation). */
  participatingBuyers?: Array<{
    groupKey: string;
    buyerName: string;
    buyerMark: string;
    registered: boolean;
  }>;
  /** Latest auction bags sold (list + session sync). Self-sale: derived from unit qty − remaining. */
  sold_bags?: number;
}

type LotStatus = 'available' | 'sold' | 'partial' | 'pending' | 'self_sale';
type LotSource = 'regular' | 'self_sale';

type PresetType = 'PROFIT' | 'LOSS';

interface SaleEntry {
  id: string;
  bidNumber: number;
  buyerName: string;
  buyerMark: string;
  buyerContactId: string | null;
  rate: number;
  quantity: number;
  amount: number;
  isSelfSale: boolean;
  isScribble: boolean;
  tokenAdvance: number;
  extraRate: number;
  presetApplied: number;
  presetType: PresetType;
  sellerRate: number;
  buyerRate: number;
  /** From API `last_modified_ms` — sent back on PATCH for concurrency */
  lastModifiedMs?: number | null;
}

// ── In-memory draft only (no localStorage). Session-only; backend draft API not implemented. ──
interface AuctionDraft {
  selectedLotId: string | null;
  entries: SaleEntry[];
  rate: string;
  qty: string;
  preset: number;
  presetType: PresetType;
  showPresetMargin: boolean;
  scribbleMark: string;
}

let inMemoryAuctionDraft: AuctionDraft | null = null;

function saveDraft(draft: AuctionDraft) {
  inMemoryAuctionDraft = draft;
}

function loadDraft(): AuctionDraft | null {
  return inMemoryAuctionDraft;
}

function clearDraft() {
  inMemoryAuctionDraft = null;
}

function touchHeroShell(layout: AuctionTouchHeroLayout) {
  switch (layout) {
    case 'compact':
      return {
        expandedClass: 'pt-[max(1rem,env(safe-area-inset-top))] pb-4 px-3 rounded-b-[1.5rem]',
        stripGrid: 'grid grid-cols-2 gap-1.5',
        stripCard: 'bg-white/15 backdrop-blur-md rounded-lg p-2 text-center',
        lotMeta: 'mt-2 flex flex-col items-center justify-center gap-0.5',
        backBtn: 'w-10 h-10',
        backIcon: 'w-4 h-4',
        titleRow: 'gap-2 mb-3',
        gavelBox: 'w-10 h-10',
        gavelIcon: 'w-4 h-4',
        subtitleClass: 'text-white/75',
        stripIcon: 'w-3.5 h-3.5 text-white/80 mx-auto mb-0.5 md:w-4 md:h-4',
        stripLabel: 'text-[9px] text-white/75 uppercase tracking-wide',
        stripValue: 'text-[11px] font-semibold text-white truncate',
        lotIndex: 'text-[10px] text-white/75',
        hint: 'text-[9px] font-medium uppercase tracking-wide text-white/55',
      };
    case 'spacious':
      return {
        expandedClass: 'pt-[max(1.75rem,env(safe-area-inset-top))] pb-8 px-5 rounded-b-[2rem]',
        stripGrid: 'grid grid-cols-4 gap-3',
        stripCard: 'bg-white/15 backdrop-blur-md rounded-2xl p-3 md:p-4 text-center',
        lotMeta: 'mt-3 flex flex-col items-center justify-center gap-1.5',
        backBtn: 'w-14 h-14',
        backIcon: 'w-6 h-6',
        titleRow: 'gap-3 mb-5',
        gavelBox: 'w-14 h-14 md:w-16 md:h-16',
        gavelIcon: 'w-7 h-7 md:w-8 md:h-8',
        subtitleClass: 'text-white/85',
        stripIcon: 'w-5 h-5 text-white/80 mx-auto mb-1 md:w-[22px] md:h-[22px]',
        stripLabel: 'text-[11px] text-white/75 uppercase tracking-wide md:text-xs',
        stripValue: 'text-sm font-semibold text-white truncate md:text-base',
        lotIndex: 'text-sm text-white/75 md:text-base',
        hint: 'text-[11px] font-medium uppercase tracking-wide text-white/55',
      };
    default:
      return {
        expandedClass: 'pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem]',
        stripGrid: 'grid grid-cols-4 gap-2',
        stripCard: 'bg-white/15 backdrop-blur-md rounded-xl p-2.5 text-center md:p-3',
        lotMeta: 'mt-2 flex flex-col items-center justify-center gap-1',
        backBtn: 'w-12 h-12',
        backIcon: 'w-5 h-5',
        titleRow: 'gap-3 mb-4',
        gavelBox: 'w-12 h-12',
        gavelIcon: 'w-5 h-5 md:w-7 md:h-7',
        subtitleClass: 'text-white/80',
        stripIcon: 'w-4 h-4 text-white/80 mx-auto mb-1 md:w-[18px] md:h-[18px]',
        stripLabel: 'text-[10px] text-white/75 uppercase tracking-wide md:text-[11px]',
        stripValue: 'text-xs font-semibold text-white truncate md:text-sm',
        lotIndex: 'text-xs text-white/75 md:text-sm',
        hint: 'text-[10px] font-medium uppercase tracking-wide text-white/55',
      };
  }
}

function AuctionTouchLayoutSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: AuctionTouchLayoutConfig;
  onLayoutChange: (next: AuctionTouchLayoutConfig) => void;
}) {
  const { open, onOpenChange, layout, onLayoutChange } = props;
  const patch = useCallback((p: Partial<AuctionTouchLayoutConfig>) => {
    onLayoutChange({ ...layout, ...p });
  }, [layout, onLayoutChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl px-4 pb-8 pt-2 sm:px-6">
        <SheetHeader className="text-left">
          <SheetTitle>Sales Pad layout</SheetTitle>
          <SheetDescription>
            Mobile and tablet widths only (not desktop). Saved to your trader account on the server so every device and session reuse the same layout; this device also keeps a local copy when offline.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-8 pb-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Hero density</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.heroLayout}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['compact', 'balanced', 'spacious'] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={layout.heroLayout === mode ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-lg capitalize"
                  onClick={() => patch({ heroLayout: mode })}
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Text scale (grid + hero)</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.textScale.toFixed(2)}×</span>
            </div>
            <Slider
              value={[layout.textScale]}
              min={0.82}
              max={1.28}
              step={0.02}
              onValueChange={([v]) => patch({ textScale: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Scribble column min height (phone)</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.scribbleMinRemPhone} rem</span>
            </div>
            <Slider
              value={[layout.scribbleMinRemPhone]}
              min={14}
              max={38}
              step={1}
              onValueChange={([v]) => patch({ scribbleMinRemPhone: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Scribble column min height (tablet)</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.scribbleMinRemTablet} rem</span>
            </div>
            <Slider
              value={[layout.scribbleMinRemTablet]}
              min={20}
              max={46}
              step={1}
              onValueChange={([v]) => patch({ scribbleMinRemTablet: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Scribble canvas height (recognition)</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.scribbleCanvasHeight}px</span>
            </div>
            <Slider
              value={[layout.scribbleCanvasHeight]}
              min={220}
              max={380}
              step={10}
              onValueChange={([v]) => patch({ scribbleCanvasHeight: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Scribble vs numpad width</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.round(layout.scribbleColRatio * 100)}% pad</span>
            </div>
            <Slider
              value={[layout.scribbleColRatio]}
              min={0.48}
              max={0.74}
              step={0.02}
              onValueChange={([v]) => patch({ scribbleColRatio: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Numpad key height</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.numpadKeyHeight}px</span>
            </div>
            <Slider
              value={[layout.numpadKeyHeight]}
              min={40}
              max={90}
              step={2}
              onValueChange={([v]) => patch({ numpadKeyHeight: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Numpad key font</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.numpadKeyFontPx}px</span>
            </div>
            <Slider
              value={[layout.numpadKeyFontPx]}
              min={14}
              max={26}
              step={1}
              onValueChange={([v]) => patch({ numpadKeyFontPx: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Numpad second row height</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.numpadSecondaryRowHeight}px</span>
            </div>
            <Slider
              value={[layout.numpadSecondaryRowHeight]}
              min={38}
              max={88}
              step={2}
              onValueChange={([v]) => patch({ numpadSecondaryRowHeight: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Auction table min width</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.gridMinWidthPx}px</span>
            </div>
            <Slider
              value={[layout.gridMinWidthPx]}
              min={320}
              max={540}
              step={10}
              onValueChange={([v]) => patch({ gridMinWidthPx: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Grid max height (expanded hero)</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.gridMaxVhExpanded}vh</span>
            </div>
            <Slider
              value={[layout.gridMaxVhExpanded]}
              min={28}
              max={56}
              step={1}
              onValueChange={([v]) => patch({ gridMaxVhExpanded: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Grid max height (collapsed hero, phone)</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.gridMaxVhCollapsed}vh</span>
            </div>
            <Slider
              value={[layout.gridMaxVhCollapsed]}
              min={48}
              max={82}
              step={1}
              onValueChange={([v]) => patch({ gridMaxVhCollapsed: v })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Grid max height (collapsed hero, tablet)</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{layout.gridMaxVhCollapsedMd}vh</span>
            </div>
            <Slider
              value={[layout.gridMaxVhCollapsedMd]}
              min={48}
              max={82}
              step={1}
              onValueChange={([v]) => patch({ gridMaxVhCollapsedMd: v })}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onLayoutChange({ ...DEFAULT_AUCTION_TOUCH_LAYOUT })}
          >
            Reset layout defaults
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Get lot status (uses API status when available, else draft for pending) ──────────────────
function getLotStatus(lotId: string, bagCount: number, apiStatus?: string): LotStatus {
  const draft = loadDraft();
  if (draft?.selectedLotId === lotId && draft.entries.length > 0) return 'pending';
  if (apiStatus === 'sold' || apiStatus === 'partial' || apiStatus === 'available' || apiStatus === 'pending' || apiStatus === 'self_sale')
    return apiStatus as LotStatus;
  return 'available';
}

/** Badge row status: Self-Sale tab shows Self-Sale label; otherwise auction-derived status. */
function getRowLotStatus(lot: LotInfo, statusFilter: LotStatus | 'all'): LotStatus {
  if (statusFilter === 'self_sale') return 'self_sale';
  return getLotStatus(lot.lot_id, lot.bag_count, lot.status);
}

const STATUS_CONFIG: Record<LotStatus, { label: string; bg: string; text: string; dot: string }> = {
  available: { label: 'Available', bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  sold: { label: 'Sold', bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  partial: { label: 'Partial', bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  pending: { label: 'Pending', bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  self_sale: { label: 'Self-Sale', bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-700 dark:text-fuchsia-400', dot: 'bg-fuchsia-500' },
};

/**
 * Lot identifier: {vehicleMark}-{vehicleTotal}/{sellerMark}-{sellerTotal}/{lotName}/{lotQty}
 * e.g. AB-200/SA-122/SA1/22
 */
function formatLotDisplayName(lot: {
  vehicle_number: string;
  seller_name: string;
  bag_count: number;
  lot_name?: string;
  vehicle_mark?: string;
  vehicleMark?: string;
  seller_mark?: string;
  vehicle_total_qty?: number;
  seller_total_qty?: number;
}): string {
  const vTotal = lot.vehicle_total_qty ?? lot.bag_count;
  const sTotal = lot.seller_total_qty ?? lot.bag_count;
  const lotName = lot.lot_name ?? String(lot.bag_count);
  const lotQty = lot.bag_count;
  return formatAuctionLotIdentifier({
    vehicleMark: pickVehicleMarkFromDto(lot),
    vehicleTotalQty: vTotal,
    sellerMark: lot.seller_mark,
    sellerTotalQty: sTotal,
    lotName,
    lotQty,
  });
}

// ── Map API DTOs to UI types ──────────────────────────────
function lotSummaryToLotInfo(dto: LotSummaryDTO): LotInfo {
  const participatingBuyers = (dto.participating_buyers ?? []).map((p: LotParticipatingBuyerDTO) => ({
    groupKey: p.group_key,
    buyerName: p.buyer_name ?? '',
    buyerMark: p.buyer_mark ?? '',
    registered: p.registered ?? false,
  }));
  return {
    lot_id: String(dto.lot_id),
    lot_name: dto.lot_name ?? '',
    bag_count: dto.bag_count ?? 0,
    original_bag_count: dto.original_bag_count ?? dto.bag_count ?? 0,
    sold_bags: dto.sold_bags ?? 0,
    commodity_name: dto.commodity_name ?? '',
    seller_name: dto.seller_name ?? '',
    seller_mark: dto.seller_mark ?? '',
    vehicle_mark: pickVehicleMarkFromDto(dto as LotSummaryDTO & { vehicleMark?: string }),
    seller_vehicle_id: String(dto.seller_vehicle_id ?? ''),
    vehicle_number: dto.vehicle_number ?? '',
    was_modified: dto.was_modified ?? false,
    status: (dto.status?.toLowerCase() as LotStatus) ?? 'available',
    vehicle_total_qty: dto.vehicle_total_qty,
    seller_total_qty: dto.seller_total_qty,
    participatingBuyers: participatingBuyers.length > 0 ? participatingBuyers : undefined,
  };
}

function selfSaleUnitToLotInfo(dto: AuctionSelfSaleUnitDTO): LotInfo {
  const remaining = dto.remaining_qty ?? dto.bag_count ?? 0;
  const unitQty = dto.self_sale_qty ?? 0;
  return {
    lot_id: String(dto.lot_id),
    selfSaleUnitId: String(dto.self_sale_unit_id),
    lot_name: dto.lot_name ?? '',
    bag_count: remaining,
    original_bag_count: dto.original_bag_count ?? dto.self_sale_qty ?? dto.bag_count ?? 0,
    sold_bags: Math.max(0, unitQty - remaining),
    commodity_name: dto.commodity_name ?? '',
    seller_name: dto.seller_name ?? '',
    seller_mark: dto.seller_mark ?? '',
    vehicle_mark: pickVehicleMarkFromDto(dto as AuctionSelfSaleUnitDTO & { vehicleMark?: string }),
    seller_vehicle_id: String(dto.seller_vehicle_id ?? ''),
    vehicle_number: dto.vehicle_number ?? '',
    was_modified: false,
    status: 'self_sale',
    vehicle_total_qty: dto.vehicle_total_qty,
    seller_total_qty: dto.seller_total_qty,
    selfSaleQty: dto.self_sale_qty ?? 0,
    remainingQty: dto.remaining_qty ?? 0,
    selfSaleRate: dto.rate ?? 0,
    selfSaleAmount: dto.amount ?? 0,
    createdAt: dto.created_at,
  };
}

function getLotRenderKey(lot: LotInfo): string {
  return lot.selfSaleUnitId ? `self-sale-${lot.selfSaleUnitId}` : `lot-${lot.lot_id}`;
}

/** Display signed preset margin in grid (+10, −20) or em dash when zero. */
function formatPresetMarginCell(margin: number): string {
  const m = Number(margin);
  if (!Number.isFinite(m) || m === 0) return '—';
  return m > 0 ? `+${m}` : String(m);
}

/** Pill switch matching Commodity Settings (Deduction / Round-off). */
function PresetMarginSwitch({
  checked,
  onCheckedChange,
  'aria-label': ariaLabel,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  'aria-label'?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-8 w-14 shrink-0 rounded-full shadow-inner transition-all disabled:pointer-events-none disabled:opacity-50',
        checked ? 'bg-gradient-to-r from-violet-500 to-purple-600 shadow-violet-500/30' : 'bg-slate-300 dark:bg-slate-600'
      )}
    >
      <motion.div
        className="pointer-events-none absolute top-1 h-6 w-6 rounded-full bg-white shadow-md"
        animate={{ x: checked ? 28 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

function normalizeScribbleBuyerName(name: string, isScribble: boolean): string {
  if (!isScribble) return name;
  const trimmed = (name ?? '').trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length > 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function sessionEntryToSaleEntry(e: AuctionEntryDTO): SaleEntry {
  return {
    id: String(e.auction_entry_id),
    bidNumber: e.bid_number,
    buyerName: e.buyer_name ?? '',
    buyerMark: e.buyer_mark ?? '',
    buyerContactId: e.buyer_id != null ? String(e.buyer_id) : null,
    rate: Number(e.bid_rate),
    quantity: e.quantity ?? 0,
    amount: Number(e.amount ?? 0),
    isSelfSale: e.is_self_sale ?? false,
    isScribble: e.is_scribble ?? false,
    tokenAdvance: Number(e.token_advance ?? 0),
    extraRate: Number(e.extra_rate ?? 0),
    presetApplied: Number(e.preset_margin ?? 0),
    presetType: (e.preset_type as PresetType) ?? 'PROFIT',
    // API keeps seller bid and preset separate; UI shows buyer total as bid + preset on the subline
    sellerRate: Number(e.bid_rate) + Number(e.preset_margin ?? 0),
    buyerRate: Number(e.buyer_rate ?? e.bid_rate),
    lastModifiedMs: e.last_modified_ms ?? null,
  };
}

function mapOrderedSessionEntries(entries: AuctionEntryDTO[]): SaleEntry[] {
  return entries
    .map(sessionEntryToSaleEntry)
    .sort((a, b) => {
      if (a.bidNumber !== b.bidNumber) return a.bidNumber - b.bidNumber;
      return a.id.localeCompare(b.id);
    });
}

const AUCTION_SCROLL_EPS = 2;

function AuctionsGridScrollPanel({
  className,
  style: scrollPanelStyle,
  children,
  contentLayoutKey,
  autoScrollToBottomKey,
  gridSectionRef,
  scrollPageIntoViewOnAutoScroll = true,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  contentLayoutKey: number;
  autoScrollToBottomKey: number;
  gridSectionRef?: React.RefObject<HTMLDivElement>;
  /** When false (e.g. mobile), skip scrolling the window to the grid — avoids hiding sticky hero / fighting inner scroll. */
  scrollPageIntoViewOnAutoScroll?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  /** User scrolled away from bottom — do not fight them with auto scroll-to-bottom. */
  const suppressAutoScrollToBottomRef = useRef(false);
  /** Ignore scroll events right after programmatic scroll (smooth scroll would otherwise set suppress). */
  const ignoreScrollForAutoDetectionUntilRef = useRef(0);
  const [hintBottom, setHintBottom] = useState(false);
  const [hintRight, setHintRight] = useState(false);
  const [horizontalThumbMetrics, setHorizontalThumbMetrics] = useState<{ visible: boolean; left: number; width: number }>({
    visible: false,
    left: 0,
    width: 0,
  });
  const [horizontalThumbPressed, setHorizontalThumbPressed] = useState(false);

  const updateHorizontalThumbMetrics = useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const totalScrollableX = Math.max(0, outer.scrollWidth - outer.clientWidth);
    if (totalScrollableX <= AUCTION_SCROLL_EPS) {
      setHorizontalThumbMetrics({ visible: false, left: 0, width: 0 });
      return;
    }
    const insetPx = 10;
    const available = Math.max(0, outer.clientWidth - insetPx * 2);
    if (available <= 0) return;
    const thumbWidth = Math.max(32, Math.min(available, Math.round(outer.clientWidth * 0.18)));
    const maxLeft = Math.max(0, available - thumbWidth);
    const ratio = outer.scrollLeft / totalScrollableX;
    const left = insetPx + maxLeft * Math.max(0, Math.min(1, ratio));
    setHorizontalThumbMetrics({ visible: true, left, width: thumbWidth });
  }, []);

  const updateHints = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    const vOverflow = el.scrollHeight > el.clientHeight + AUCTION_SCROLL_EPS;
    const hOverflow = el.scrollWidth > el.clientWidth + AUCTION_SCROLL_EPS;
    const notAtBottom = el.scrollTop < el.scrollHeight - el.clientHeight - AUCTION_SCROLL_EPS;
    const notAtRight = el.scrollLeft < el.scrollWidth - el.clientWidth - AUCTION_SCROLL_EPS;
    setHintBottom(vOverflow && notAtBottom);
    setHintRight(hOverflow && notAtRight);
  }, []);

  const runMetrics = useCallback(() => {
    updateHints();
    updateHorizontalThumbMetrics();
  }, [updateHints, updateHorizontalThumbMetrics]);

  useLayoutEffect(() => {
    runMetrics();
  }, [runMetrics, contentLayoutKey]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    runMetrics();
    const ro = new ResizeObserver(() => runMetrics());
    ro.observe(outer);
    outer.addEventListener('scroll', runMetrics, { passive: true });
    return () => {
      ro.disconnect();
      outer.removeEventListener('scroll', runMetrics);
    };
  }, [runMetrics]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || autoScrollToBottomKey <= 0) return;

    suppressAutoScrollToBottomRef.current = false;

    let cleanedUp = false;
    const timeouts: number[] = [];
    const rafs: number[] = [];

    const scrollPageToGrid = () => {
      if (cleanedUp || !scrollPageIntoViewOnAutoScroll) return;

      if (gridSectionRef?.current) {
        gridSectionRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        });
      }
    };

    const scrollToBottom = (smooth: boolean) => {
      if (cleanedUp) return;
      
      const maxScroll = Math.max(0, outer.scrollHeight - outer.clientHeight);
      
      if (maxScroll <= 0) return;

      ignoreScrollForAutoDetectionUntilRef.current = performance.now() + (smooth ? 650 : 120);

      if (smooth) {
        outer.scrollTo({ top: maxScroll, behavior: 'smooth' });
      } else {
        outer.scrollTop = maxScroll;
      }

      const raf = requestAnimationFrame(() => {
        if (cleanedUp || maxScroll <= 0) return;
        outer.scrollTop = maxScroll;
      });
      rafs.push(raf);
    };

    const onUserScroll = () => {
      if (cleanedUp) return;
      if (performance.now() < ignoreScrollForAutoDetectionUntilRef.current) return;
      const maxScroll = Math.max(0, outer.scrollHeight - outer.clientHeight);
      const atBottom =
        maxScroll <= AUCTION_SCROLL_EPS ||
        outer.scrollTop >= maxScroll - AUCTION_SCROLL_EPS;
      suppressAutoScrollToBottomRef.current = !atBottom;
    };
    outer.addEventListener('scroll', onUserScroll, { passive: true });

    const isLatestRowFullyVisible = (): boolean => {
      const rows = Array.from(
        outer.querySelectorAll('tr[data-auction-entry-row="true"]')
      ) as HTMLTableRowElement[];

      if (rows.length === 0) return true;

      const latestRow = rows.reduce<HTMLTableRowElement | null>((latest, row) => {
        const bid = Number(row.dataset.bidNumber ?? 0);
        if (!latest) return row;
        const latestBid = Number(latest.dataset.bidNumber ?? 0);
        return bid >= latestBid ? row : latest;
      }, null);

      if (!latestRow) return true;

      const outerRect = outer.getBoundingClientRect();
      const rowRect = latestRow.getBoundingClientRect();
      const thead = outer.querySelector('thead');
      const theadH = thead ? thead.getBoundingClientRect().height : 0;
      /** Visible band inside scrollport below sticky thead (tbody rows must sit here, not under thead). */
      const visibleTop = outerRect.top + theadH;
      const visibleBottom = outerRect.bottom;

      return (
        rowRect.top >= visibleTop - AUCTION_SCROLL_EPS &&
        rowRect.bottom <= visibleBottom + AUCTION_SCROLL_EPS
      );
    };

    const checkAndScroll = () => {
      if (cleanedUp) return;
      if (suppressAutoScrollToBottomRef.current) return;
      if (!isLatestRowFullyVisible()) {
        scrollToBottom(false);
      }
    };

    scrollPageToGrid();
    
    timeouts.push(window.setTimeout(() => scrollToBottom(false), 200));
    timeouts.push(window.setTimeout(() => scrollToBottom(true), 400));
    timeouts.push(window.setTimeout(() => checkAndScroll(), 600));
    timeouts.push(window.setTimeout(() => checkAndScroll(), 900));
    timeouts.push(window.setTimeout(() => checkAndScroll(), 1200));

    const resizeObserver = new ResizeObserver(() => {
      if (cleanedUp) return;
      if (suppressAutoScrollToBottomRef.current) return;
      scrollToBottom(false);
      const timeout = window.setTimeout(() => checkAndScroll(), 100);
      timeouts.push(timeout);
    });
    resizeObserver.observe(outer);

    const mutationObserver = new MutationObserver(() => {
      if (cleanedUp) return;
      if (suppressAutoScrollToBottomRef.current) return;
      const timeout = window.setTimeout(() => scrollToBottom(false), 50);
      timeouts.push(timeout);
    });
    mutationObserver.observe(outer, { childList: true, subtree: true });

    return () => {
      cleanedUp = true;
      outer.removeEventListener('scroll', onUserScroll);
      rafs.forEach(id => cancelAnimationFrame(id));
      timeouts.forEach(id => clearTimeout(id));
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [autoScrollToBottomKey, gridSectionRef, scrollPageIntoViewOnAutoScroll]);

  const setScrollLeftFromPointerX = useCallback((clientX: number) => {
    const outer = outerRef.current;
    if (!outer) return;
    const totalScrollableX = Math.max(0, outer.scrollWidth - outer.clientWidth);
    if (totalScrollableX <= AUCTION_SCROLL_EPS) return;
    const insetPx = 10;
    const rect = outer.getBoundingClientRect();
    const xInPanel = clientX - rect.left;
    const available = Math.max(0, outer.clientWidth - insetPx * 2);
    if (available <= 0) return;
    const ratio = Math.max(0, Math.min(1, (xInPanel - insetPx) / available));
    outer.scrollLeft = ratio * totalScrollableX;
  }, []);

  const onHorizontalThumbPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setHorizontalThumbPressed(true);
    setScrollLeftFromPointerX(e.clientX);
    const onMove = (ev: PointerEvent) => setScrollLeftFromPointerX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setHorizontalThumbPressed(false);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
  }, [setScrollLeftFromPointerX]);

  return (
    <div className="relative">
      <div
        ref={outerRef}
        className={cn(
          'auctions-grid-scroll-panel lot-fields-x-scroll isolate min-h-0 overflow-y-auto overflow-x-auto overscroll-contain touch-auto pb-5',
          className
        )}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          ...scrollPanelStyle,
        }}
      >
        {children}
      </div>
      {hintBottom && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex h-11 items-end justify-center bg-gradient-to-t from-background from-40% via-background/75 to-transparent pb-1.5"
          aria-hidden
        >
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/80" strokeWidth={2.5} />
        </div>
      )}
      {hintRight && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] flex w-10 items-center justify-end bg-gradient-to-l from-background from-35% via-background/75 to-transparent pr-1"
          aria-hidden
        >
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/80" strokeWidth={2.5} />
        </div>
      )}
      {horizontalThumbMetrics.visible && (
        <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-[18px] z-[4]">
          <div
            className="pointer-events-auto absolute left-2 right-2 bottom-0 h-[14px] rounded-full"
            style={{
              backgroundColor: 'hsl(var(--card))',
              boxShadow: 'inset 0 0 0 1px hsl(var(--foreground) / 0.28)',
            }}
          />
          <div
            className="pointer-events-auto absolute bottom-0 h-[14px] rounded-full border-2 cursor-ew-resize select-none touch-none z-[6] transition-[box-shadow,transform] duration-150 active:scale-[0.99]"
            style={{
              left: horizontalThumbMetrics.left,
              width: horizontalThumbMetrics.width,
              borderColor: horizontalThumbPressed ? 'hsl(229 76% 61%)' : 'hsl(229 100% 69%)',
              backgroundColor: horizontalThumbPressed ? 'hsl(229 76% 61%)' : 'hsl(229 100% 69%)',
              boxShadow:
                horizontalThumbPressed
                  ? 'inset 0 0 0 1px hsl(0 0% 100% / 0.4), 0 0 26px hsl(229 100% 69% / 0.35)'
                  : 'inset 0 0 0 1px hsl(0 0% 100% / 0.3), 0 0 18px hsl(229 100% 69% / 0.25)',
            }}
            onPointerDown={onHorizontalThumbPointerDown}
            role="slider"
            aria-label="Drag to scroll auction grid horizontally"
            aria-valuemin={0}
            aria-valuemax={1}
          >
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5">
              <span
                className="block h-[8px] w-[8px] -rotate-45 border-t-2 border-l-2"
                style={{ borderColor: 'hsl(0 0% 100% / 0.92)' }}
                aria-hidden
              />
              <span
                className="grid h-[10px] w-[10px] place-items-center rounded-full"
                style={{ backgroundColor: 'hsl(0 0% 100% / 0.92)' }}
                aria-hidden
              >
                <span
                  className="block h-[2px] w-[2px] rounded-full"
                  style={{ backgroundColor: 'hsl(229 100% 69%)' }}
                />
              </span>
              <span
                className="block h-[8px] w-[8px] rotate-[135deg] border-t-2 border-l-2"
                style={{ borderColor: 'hsl(0 0% 100% / 0.92)' }}
                aria-hidden
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const AuctionsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { trader } = useAuth();
  const { canAccessModule, can } = usePermissions();
  const canUsePreset = trader?.preset_enabled !== false;
  const canView = canAccessModule('Auctions / Sales');
  if (!canView) {
    return <ForbiddenPage moduleName="Auctions" />;
  }
  const [buyers, setBuyers] = useState<Contact[]>([]);
  /** Distinct scribble marks for current trader calendar day (from API); not tied to current lot only. */
  const [temporaryBuyerMarks, setTemporaryBuyerMarks] = useState<string[]>([]);
  const [entries, setEntries] = useState<SaleEntry[]>([]);
  const [showPresetMargin, setShowPresetMargin] = useState(false);
  const [showScribble, setShowScribble] = useState(false);
  const [scribbleMark, setScribbleMark] = useState('');
  const [preset, setPreset] = useState(0);
  const [presetType, setPresetType] = useState<PresetType>('PROFIT');
  const [showTokenInput, setShowTokenInput] = useState<string | null>(null);
  const [scribblePadResetTrigger, setScribblePadResetTrigger] = useState(0);
  /** Last segment appended from the inline scribble pad (for correcting via candidate chip in append mode). */
  const lastScribbleSegmentRef = useRef('');
  const markInputRef = useRef<HTMLInputElement>(null);
  const pendingMarkCaretPosRef = useRef<number | null>(null);
  const markInsertPosRef = useRef<number | null>(null);
  const forceMarkFocusRef = useRef(false);
  const braceLockActiveRef = useRef(false);
  const manualMarkSelectionRef = useRef(false);
  const [activeNumpadField, setActiveNumpadField] = useState<'rate' | 'qty' | 'mark'>('rate');
  const [mobileKeyboardEnabled, setMobileKeyboardEnabled] = useState(false);
  const rateInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const userClearedRateRef = useRef(false);
  const [preferRateForFirstBidFormFocus, setPreferRateForFirstBidFormFocus] = useState(true);
  /** Session-local MRU for buyer strip ordering (newest first when not searching by prefix). */
  const [contactLastUsedMs, setContactLastUsedMs] = useState<Record<string, number>>({});
  const [tempMarkLastUsedMs, setTempMarkLastUsedMs] = useState<Record<string, number>>({});

  // Lot selection
  const [showLotSelector, setShowLotSelector] = useState(true);
  const [availableLots, setAvailableLots] = useState<LotInfo[]>([]);
  const [selfSaleLots, setSelfSaleLots] = useState<LotInfo[]>([]);
  const [selectedLot, setSelectedLot] = useState<LotInfo | null>(null);
  const [selectedLotSource, setSelectedLotSource] = useState<LotSource>('regular');
  const [selfSaleContext, setSelfSaleContext] = useState<AuctionSelfSaleContextDTO | null>(null);
  const [lotSearchQuery, setLotSearchQuery] = useState('');
  const [lotNavMode, setLotNavMode] = useState<'all' | 'vehicle' | 'seller' | 'buyer' | 'lot_number'>('all');
  const [lotNumberSearch, setLotNumberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LotStatus | 'all'>('all');
  const [showLotList, setShowLotList] = useState(false);
  /** Mobile/tablet: collapse gradient hero to maximize auction grid vertical space. */
  const [mobileAuctionHeroCollapsed, setMobileAuctionHeroCollapsed] = useState(false);
  /** Matches fixed collapsed hero + spacer — sticky auction block / thead sit below this offset. */
  const auctionCollapsedBarHeight = 'calc(max(0.5rem, env(safe-area-inset-top, 0px)) + 2.75rem + 0.5rem)';
  /** Expanded mobile hero height — ResizeObserver so sticky grid section pins below hero when scrolling. */
  const expandedHeroMeasureRef = useRef<HTMLDivElement>(null);
  const [expandedHeroHeightPx, setExpandedHeroHeightPx] = useState(0);

  const [touchLayoutSheetOpen, setTouchLayoutSheetOpen] = useState(false);
  const touchLayoutSaveTimerRef = useRef<number | null>(null);
  const touchLayoutLatestForSaveRef = useRef<AuctionTouchLayoutConfig>(readLocalAuctionTouchLayout());
  const [touchLayout, setTouchLayout] = useState<AuctionTouchLayoutConfig>(() => readLocalAuctionTouchLayout());

  const commitTouchLayout = useCallback((next: AuctionTouchLayoutConfig) => {
    setTouchLayout(next);
    persistLocalAuctionTouchLayout(next);
    touchLayoutLatestForSaveRef.current = next;
    if (touchLayoutSaveTimerRef.current != null) {
      window.clearTimeout(touchLayoutSaveTimerRef.current);
    }
    touchLayoutSaveTimerRef.current = window.setTimeout(() => {
      touchLayoutSaveTimerRef.current = null;
      void auctionTouchLayoutApi.save(JSON.stringify(touchLayoutLatestForSaveRef.current)).catch(() => {
        toast.error('Could not sync Sales Pad layout to server; stored on this device only.');
      });
    }, 750);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await auctionTouchLayoutApi.get();
        if (cancelled) return;
        if (raw != null && raw.trim()) {
          const parsed = parseAuctionTouchLayout(raw);
          setTouchLayout(parsed);
          persistLocalAuctionTouchLayout(parsed);
          touchLayoutLatestForSaveRef.current = parsed;
        }
      } catch {
        if (!cancelled) {
          const loc = readLocalAuctionTouchLayout();
          setTouchLayout(loc);
          touchLayoutLatestForSaveRef.current = loc;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (touchLayoutSaveTimerRef.current != null) {
        window.clearTimeout(touchLayoutSaveTimerRef.current);
        touchLayoutSaveTimerRef.current = null;
      }
    },
    []
  );

  const [isMdViewport, setIsMdViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const on = () => setIsMdViewport(mql.matches);
    mql.addEventListener('change', on);
    on();
    return () => mql.removeEventListener('change', on);
  }, []);

  // Duplicate mark dialog
  const [duplicateMarkDialog, setDuplicateMarkDialog] = useState<{
    mark: string; buyerName: string; buyerContactId: string | null;
    rate: number; qty: number; isScribble: boolean;
    existingEntry: SaleEntry;
  } | null>(null);

  // Quantity increase confirmation
  const [qtyIncreaseDialog, setQtyIncreaseDialog] = useState<{
    currentTotal: number; lotTotal: number; attemptedQty: number;
    pendingEntry: Omit<SaleEntry, 'id' | 'bidNumber'>;
  } | null>(null);

  // Preset options from Settings (dynamic only; no local fallback)
  const [presetOptions, setPresetOptions] = useState<{ label: string; value: number }[]>([]);

  // API loading / 409 retry
  const [lotsLoading, setLotsLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [completedAuction, setCompletedAuction] = useState<AuctionResultDTO | null>(null);
  const [addBidRetryAllowIncrease, setAddBidRetryAllowIncrease] = useState(false);
  const [pendingDeleteBid, setPendingDeleteBid] = useState<{ id: string; label: string } | null>(null);

  /** ENH-34: inline edit bid row */
  const [editingBidId, setEditingBidId] = useState<string | null>(null);
  const entriesRef = useRef<SaleEntry[]>([]);
  const editingBidIdRef = useRef<string | null>(null);
  entriesRef.current = entries;
  editingBidIdRef.current = editingBidId;
  const presetSyncChainRef = useRef(Promise.resolve());
  const [editBidDraft, setEditBidDraft] = useState<{
    rate: string;
    qty: string;
    preset: number;
    presetType: PresetType;
    extraRate: string;
    token: string;
    lastModifiedMs: number | null;
  } | null>(null);
  const [editBidRetryAllowIncrease, setEditBidRetryAllowIncrease] = useState(false);
  const [editBidQtyDialog, setEditBidQtyDialog] = useState<{
    currentTotal: number; lotTotal: number; attemptedQty: number;
    pendingBody: AuctionBidUpdateRequest;
    bidNumericId: number;
  } | null>(null);

  type EditBidFormSnapshot = {
    selectedBuyer: Contact | null;
    scribbleMark: string;
    rate: string;
    qty: string;
    showPresetMargin: boolean;
    preset: number;
    presetType: PresetType;
    activeNumpadField: 'rate' | 'qty' | 'mark';
    mobileKeyboardEnabled: boolean;
    lastScribbleSegment: string;
  };

  const editBidFormSnapshotRef = useRef<EditBidFormSnapshot | null>(null);

  // New entry form
  const [selectedBuyer, setSelectedBuyer] = useState<Contact | null>(null);
  const [rate, setRate] = useState('');
  const [qty, setQty] = useState('');
  const autoPrintedAuctionRef = useRef<string | null>(null);
  const isTouchLayout = !isDesktop;

  const mobileTouchHero = useMemo(() => touchHeroShell(touchLayout.heroLayout), [touchLayout.heroLayout]);
  const auctionGridMobileMaxHeight = useMemo(() => {
    if (isDesktop) return undefined as string | undefined;
    return mobileAuctionHeroCollapsed
      ? (isMdViewport
        ? `min(${touchLayout.gridMaxVhCollapsedMd}vh, 34rem)`
        : `min(${touchLayout.gridMaxVhCollapsed}vh, 30rem)`)
      : `min(${touchLayout.gridMaxVhExpanded}vh, 18rem)`;
  }, [
    isDesktop,
    isMdViewport,
    mobileAuctionHeroCollapsed,
    touchLayout.gridMaxVhCollapsed,
    touchLayout.gridMaxVhCollapsedMd,
    touchLayout.gridMaxVhExpanded,
  ]);

  const heroTitleFontRem = useMemo(() => {
    const ts = touchLayout.textScale;
    switch (touchLayout.heroLayout) {
      case 'compact':
        return 1.25 * ts;
      case 'spacious':
        return 1.875 * ts;
      default:
        return (isMdViewport ? 1.875 : 1.5) * ts;
    }
  }, [touchLayout.heroLayout, touchLayout.textScale, isMdViewport]);

  const heroSubtitleFontRem = useMemo(() => {
    const ts = touchLayout.textScale;
    switch (touchLayout.heroLayout) {
      case 'compact':
        return 0.8 * ts;
      case 'spacious':
        return 1.05 * ts;
      default:
        return (isMdViewport ? 1 : 0.875) * ts;
    }
  }, [touchLayout.heroLayout, touchLayout.textScale, isMdViewport]);

  const scribbleDockMinRem = isMdViewport ? touchLayout.scribbleMinRemTablet : touchLayout.scribbleMinRemPhone;

  const numpadMainRowStyle = useMemo(
    () => ({
      height: touchLayout.numpadKeyHeight,
      fontSize: touchLayout.numpadKeyFontPx,
    }),
    [touchLayout.numpadKeyHeight, touchLayout.numpadKeyFontPx]
  );
  const numpadSecondaryRowStyle = useMemo(
    () => ({
      height: touchLayout.numpadSecondaryRowHeight,
      fontSize: Math.max(12, touchLayout.numpadKeyFontPx - 2),
    }),
    [touchLayout.numpadSecondaryRowHeight, touchLayout.numpadKeyFontPx]
  );
  const numpadActionRowStyle = useMemo(
    () => ({
      height: Math.max(touchLayout.numpadKeyHeight, touchLayout.numpadSecondaryRowHeight + 4),
      fontSize: Math.max(13, touchLayout.numpadKeyFontPx - 1),
    }),
    [touchLayout.numpadKeyHeight, touchLayout.numpadSecondaryRowHeight, touchLayout.numpadKeyFontPx]
  );

  // Skip initial draft restore flag
  const draftRestored = useRef(false);

  // Horizontal scroll: mouse-drag and arrow-key support (desktop + touch)
  const contactScrollRef = useRef<HTMLDivElement>(null);
  const markScrollRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);
  const didDragContactRef = useRef(false);
  const didDragMarkRef = useRef(false);
  const pendingBidAutoScrollRef = useRef(false);
  const [autoScrollKey, setAutoScrollKey] = useState(0);
  const auctionGridSectionRef = useRef<HTMLDivElement>(null);

  const makeScrollHandlers = useCallback((
    ref: React.RefObject<HTMLDivElement | null>,
    didDragRef: React.MutableRefObject<boolean>
  ) => {
    return {
      onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
        if (!ref.current) return;
        dragStartX.current = e.clientX;
        dragStartScroll.current = ref.current.scrollLeft;
        didDragContactRef.current = false;
        didDragMarkRef.current = false;
        const onMove = (moveE: MouseEvent) => {
          if (!ref.current) return;
          const dx = dragStartX.current - moveE.clientX;
          ref.current.scrollLeft = dragStartScroll.current + dx;
          if (Math.abs(dx) > 5) didDragRef.current = true;
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          setTimeout(() => {
            didDragContactRef.current = false;
            didDragMarkRef.current = false;
          }, 0);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        if (!ref.current) return;
        if (e.key === 'ArrowLeft') {
          ref.current.scrollLeft -= 140;
          e.preventDefault();
        }
        if (e.key === 'ArrowRight') {
          ref.current.scrollLeft += 140;
          e.preventDefault();
        }
      },
    };
  }, []);

  const loadLots = useCallback(async (opts?: { q?: string; status?: string }) => {
    setLotsLoading(true);
    try {
      const list = await auctionApi.listLots({
        page: 0,
        size: 500,
        q: opts?.q || undefined,
        status: opts?.status || undefined,
      });
      const lots: LotInfo[] = list.map(lotSummaryToLotInfo);
      setAvailableLots(lots);
      return lots;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load lots');
      setAvailableLots([]);
      return [];
    } finally {
      setLotsLoading(false);
    }
  }, []);

  const loadSelfSaleLots = useCallback(async (opts?: { q?: string }) => {
    try {
      const list = await auctionApi.listSelfSaleUnits({
        page: 0,
        size: 500,
        q: opts?.q || undefined,
      });
      const lots: LotInfo[] = list.map(selfSaleUnitToLotInfo);
      setSelfSaleLots(lots);
      return lots;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load self-sale lots');
      setSelfSaleLots([]);
      return [];
    }
  }, []);

  const loadTemporaryBuyerMarks = useCallback(async () => {
    try {
      const marks = await auctionApi.listTemporaryBuyerMarksToday();
      setTemporaryBuyerMarks(Array.isArray(marks) ? marks : []);
    } catch {
      setTemporaryBuyerMarks([]);
    }
  }, []);

  // Load buyers, lots, and preset settings from API
  useEffect(() => {
    contactApi.list({ scope: 'participants' }).then(setBuyers);
    loadTemporaryBuyerMarks();
    loadLots();
    loadSelfSaleLots();
    presetMarksApi
      .list()
      .then((list) => {
        if (list && list.length > 0) {
          setPresetOptions(
            list.map((p) => ({
              label: p.predefined_mark ?? String(p.extra_amount),
              value: Number(p.extra_amount),
            }))
          );
        } else {
          setPresetOptions([]);
        }
      })
      .catch(() => { setPresetOptions([]); });
  }, [loadTemporaryBuyerMarks, loadLots, loadSelfSaleLots]);

  useEffect(() => {
    if (canUsePreset) return;
    if (showPresetMargin) setShowPresetMargin(false);
    if (preset !== 0) setPreset(0);
  }, [canUsePreset, showPresetMargin, preset]);

  // ── Restore draft after lots are loaded from API ─────────
  useEffect(() => {
    if (draftRestored.current || availableLots.length === 0) return;
    const draft = loadDraft();
    if (!draft || !draft.selectedLotId) return;
    draftRestored.current = true;
    const lot = availableLots.find(l => l.lot_id === draft.selectedLotId);
    if (!lot) return;
    setSelectedLot(lot);
    setShowLotSelector(false);
    setRate(draft.rate || '');
    setQty(draft.qty || '');
    setPreset(draft.preset || 0);
    setPresetType(draft.presetType || 'PROFIT');
    setShowPresetMargin(draft.showPresetMargin || false);
    setScribbleMark(draft.scribbleMark || '');
    lastScribbleSegmentRef.current = '';
    setSessionLoading(true);
    auctionApi
      .getOrStartSession(lot.lot_id)
      .then((session: AuctionSessionDTO) => {
        setEntries(mapOrderedSessionEntries(session.entries));
        void loadTemporaryBuyerMarks();
      })
      .catch(() => { /* entries stay empty from draft if API fails */ })
      .finally(() => setSessionLoading(false));
    toast.info('Draft restored from previous session');
  }, [availableLots, loadTemporaryBuyerMarks]);

  // ── Auto-save draft on state change ─────────────────────
  useEffect(() => {
    if (!draftRestored.current) return;
    saveDraft({
      selectedLotId: selectedLot?.lot_id || null,
      entries,
      rate,
      qty,
      preset,
      presetType,
      showPresetMargin,
      scribbleMark,
    });
  }, [selectedLot, entries, rate, qty, preset, presetType, showPresetMargin, scribbleMark]);

  // Filter lots (lot identifier format e.g. AB-200/SA-122/SA1/22 also searchable)
  const filteredLots = useMemo(() => {
    let result = statusFilter === 'self_sale' ? selfSaleLots : availableLots;
    if (lotSearchQuery) {
      const q = lotSearchQuery.toLowerCase();
      result = result.filter(l =>
        l.lot_name.toLowerCase().includes(q) ||
        l.seller_name.toLowerCase().includes(q) ||
        l.seller_mark.toLowerCase().includes(q) ||
        l.vehicle_number.toLowerCase().includes(q) ||
        l.commodity_name.toLowerCase().includes(q) ||
        formatLotDisplayName(l).toLowerCase().includes(q)
      );
    }
    if (lotNumberSearch) {
      const q = lotNumberSearch.toLowerCase();
      result = result.filter(l =>
        l.lot_name.toLowerCase().includes(q) ||
        l.lot_id.toLowerCase().includes(q) ||
        formatLotDisplayName(l).toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all' && statusFilter !== 'self_sale') {
      result = result.filter(l => getLotStatus(l.lot_id, l.bag_count, l.status) === statusFilter);
    }
    return result;
  }, [availableLots, selfSaleLots, lotSearchQuery, lotNumberSearch, statusFilter]);

  const selectorLots = useMemo(
    () => (statusFilter === 'self_sale' ? selfSaleLots : availableLots),
    [statusFilter, selfSaleLots, availableLots]
  );

  // Group lots by vehicle for navigation
  const lotsByVehicle = useMemo(() => {
    const map = new Map<string, LotInfo[]>();
    filteredLots.forEach(l => {
      const key = l.vehicle_number || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return map;
  }, [filteredLots]);

  // Group lots by seller (same structure as vehicle: seller_vehicle_id = unique seller-in-vehicle)
  const lotsBySeller = useMemo(() => {
    const map = new Map<string, LotInfo[]>();
    filteredLots.forEach(l => {
      const key = l.seller_vehicle_id || `sv-${l.seller_name}-${l.vehicle_number}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return map;
  }, [filteredLots]);

  /** Group lots by buyer (registered contact or temp scribble) who has bids on that lot — same pattern as By Seller. */
  const lotsByBuyer = useMemo(() => {
    const map = new Map<string, LotInfo[]>();
    filteredLots.forEach(l => {
      const pbs = l.participatingBuyers;
      if (!pbs?.length) return;
      pbs.forEach(pb => {
        const key = pb.groupKey;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(l);
      });
    });
    return map;
  }, [filteredLots]);

  // Row 1: Contacts from contact module — filter by scribble pad search (name/mark/phone)
  const filteredContacts = useMemo(() => {
    const q = (scribbleMark || '').trim().toLowerCase();
    const list = buyers;
    const filtered = !q
      ? list
      : list.filter(
          b =>
            b.name?.toLowerCase().startsWith(q) ||
            (b.phone && b.phone.startsWith(q)) ||
            (b.mark && b.mark.toLowerCase().startsWith(q))
        );
    return [...filtered].sort((a, b) => {
      const ta = contactLastUsedMs[String(a.contact_id)] ?? 0;
      const tb = contactLastUsedMs[String(b.contact_id)] ?? 0;
      if (tb !== ta) return tb - ta;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
  }, [buyers, scribbleMark, contactLastUsedMs]);

  // Row 2: Temporary (scribble) marks for today — server-scoped; filter by search box
  const filteredTemporaryMarks = useMemo(() => {
    const q = (scribbleMark || '').trim().toLowerCase();
    const list = temporaryBuyerMarks;
    const filtered = !q ? list : list.filter(m => m.toLowerCase().startsWith(q));
    return [...filtered].sort((a, b) => {
      const ta = tempMarkLastUsedMs[a] ?? 0;
      const tb = tempMarkLastUsedMs[b] ?? 0;
      if (tb !== ta) return tb - ta;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }, [temporaryBuyerMarks, scribbleMark, tempMarkLastUsedMs]);

  const clampInsideClosingParen = useCallback((value: string, proposedPos: number, allowManualExit = false) => {
    if (!braceLockActiveRef.current) return proposedPos;
    const closeIdx = value.indexOf(')');
    if (closeIdx === -1) {
      braceLockActiveRef.current = false;
      return proposedPos;
    }
    const openIdx = value.lastIndexOf('(', closeIdx);
    if (openIdx === -1) {
      braceLockActiveRef.current = false;
      return proposedPos;
    }
    if (allowManualExit && proposedPos > closeIdx) {
      braceLockActiveRef.current = false;
      return proposedPos;
    }
    return Math.min(proposedPos, closeIdx);
  }, []);

  const handleScribbleSegmentDetected = useCallback((segment: string, meta?: MarkDetectionMeta) => {
    if (editingBidId) return;
    const up = segment.toUpperCase().slice(0, MAX_MARK_LEN);
    setScribbleMark((prev) => {
      const insertAtRaw = markInsertPosRef.current;
      const basePos = insertAtRaw == null ? prev.length : Math.max(0, Math.min(insertAtRaw, prev.length));
      const insertAt = clampInsideClosingParen(prev, basePos);
      if (meta?.replaceLastSegment && lastScribbleSegmentRef.current) {
        const cutLen = lastScribbleSegmentRef.current.length;
        const replaceStart = Math.max(0, insertAt - cutLen);
        const next = `${prev.slice(0, replaceStart)}${up}${prev.slice(insertAt)}`.slice(0, MAX_MARK_LEN);
        markInsertPosRef.current = clampInsideClosingParen(next, Math.min(replaceStart + up.length, next.length));
        lastScribbleSegmentRef.current = up;
        return next;
      }
      const next = `${prev.slice(0, insertAt)}${up}${prev.slice(insertAt)}`.slice(0, MAX_MARK_LEN);
      markInsertPosRef.current = clampInsideClosingParen(next, Math.min(insertAt + up.length, next.length));
      lastScribbleSegmentRef.current = up;
      return next;
    });
    setSelectedBuyer(null);
    // Do not bump scribblePadResetTrigger here: InlineScribblePad append mode clears ink internally;
    // incrementing would run the reset effect and wipe candidate chips before the user can tap one.
  }, [editingBidId, clampInsideClosingParen]);

  const appendMarkParenFromNumpad = useCallback(() => {
    if (editingBidId) return;
    lastScribbleSegmentRef.current = '';
    setScribbleMark((prev) => {
      const el = markInputRef.current;
      const hasSelection = !!el && document.activeElement === el;
      const start = hasSelection ? (el.selectionStart ?? prev.length) : prev.length;
      const end = hasSelection ? (el.selectionEnd ?? prev.length) : prev.length;
      const next = `${prev.slice(0, start)}()${prev.slice(end)}`.slice(0, MAX_MARK_LEN);
      braceLockActiveRef.current = true;
      pendingMarkCaretPosRef.current = Math.min(start + 1, next.length);
      markInsertPosRef.current = pendingMarkCaretPosRef.current;
      forceMarkFocusRef.current = true;
      return next;
    });
    setSelectedBuyer(null);
    hapticSelection();
  }, [editingBidId]);

  useLayoutEffect(() => {
    const caretPos = pendingMarkCaretPosRef.current;
    if (caretPos == null) return;
    const markEl = markInputRef.current;
    if (!markEl) return;
    const shouldForceFocus = forceMarkFocusRef.current || braceLockActiveRef.current;
    if (shouldForceFocus) markEl.focus();
    if (document.activeElement !== markEl && !shouldForceFocus) return;
    markEl.setSelectionRange(caretPos, caretPos);
    markInsertPosRef.current = caretPos;
    pendingMarkCaretPosRef.current = null;
    forceMarkFocusRef.current = false;
  }, [scribbleMark]);

  const handleMarkBackspace = useCallback(() => {
    if (editingBidId) return;
    lastScribbleSegmentRef.current = '';
    setScribbleMark((prev) => prev.slice(0, -1));
    hapticSelection();
  }, [editingBidId]);

  const totalSold = useMemo(() => entries.reduce((s, e) => s + e.quantity, 0), [entries]);
  const remaining = selectedLot ? selectedLot.bag_count - totalSold : 0;
  const highestBid = useMemo(() => Math.max(0, ...entries.map(e => e.rate)), [entries]);
  const isSelfSaleReauction = selectedLotSource === 'self_sale';
  const previousSelfSaleEntries = selfSaleContext?.previous_entries ?? [];
  const previousBidRate = useMemo(() => {
    if (entries.length === 0) return 0;
    return Math.trunc(entries[entries.length - 1]?.rate ?? 0);
  }, [entries]);
  useEffect(() => {
    if (!pendingBidAutoScrollRef.current) return;
    pendingBidAutoScrollRef.current = false;
    
    const timeoutId = window.setTimeout(() => {
      setAutoScrollKey((prev) => prev + 1);
    }, 50);
    
    return () => window.clearTimeout(timeoutId);
  }, [entries.length]);

  /** Mobile/tablet: when token row opens, scroll it above fixed scribble/numpad dock. */
  useEffect(() => {
    if (!showTokenInput || isDesktop) return;
    const id = showTokenInput;
    const t = window.setTimeout(() => {
      try {
        const safe = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id.replace(/"/g, '\\"');
        document.querySelector(`[data-auction-token-panel="${safe}"]`)?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
          inline: 'nearest',
        });
      } catch {
        document.querySelector(`[data-auction-token-panel="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 100);
    return () => window.clearTimeout(t);
  }, [showTokenInput, isDesktop]);

  /**
   * When preset is on, the rate field shows buyer total (bid + preset); this returns seller bid for API / grid `rate`.
   * When preset is off, the field is the seller bid.
   */
  const getBidRateFromInput = useCallback((rawRate: string) => {
    const parsed = parseInt(rawRate, 10);
    if (!Number.isFinite(parsed)) return 0;
    return showPresetMargin ? Math.max(0, parsed - preset) : parsed;
  }, [showPresetMargin, preset]);

  const editingEntry = useMemo(() => {
    if (!editingBidId) return null;
    return entries.find(e => e.id === editingBidId) ?? null;
  }, [editingBidId, entries]);

  const applyAuctionSession = useCallback((session: AuctionSessionDTO) => {
    setEntries(mapOrderedSessionEntries(session.entries));
    setSelfSaleContext(session.self_sale_context ?? null);
    const lotId = selectedLot?.lot_id;
    const selfSaleUnitId = selectedLot?.selfSaleUnitId;
    if (session.lot && lotId) {
      const sl = session.lot as LotSummaryDTO & { vehicleMark?: string };
      const vm = pickVehicleMarkFromDto(sl);
      setSelectedLot(prev =>
        prev && prev.lot_id === lotId
          ? {
            ...prev,
            bag_count: sl.bag_count ?? prev.bag_count,
            original_bag_count: sl.original_bag_count ?? prev.original_bag_count,
            sold_bags: sl.sold_bags ?? session.total_sold_bags ?? prev.sold_bags,
            was_modified: sl.was_modified ?? prev.was_modified,
            vehicle_mark: vm ?? prev.vehicle_mark,
            seller_mark: sl.seller_mark ?? prev.seller_mark,
            vehicle_total_qty: sl.vehicle_total_qty ?? prev.vehicle_total_qty,
            seller_total_qty: sl.seller_total_qty ?? prev.seller_total_qty,
            vehicle_number: sl.vehicle_number ?? prev.vehicle_number,
            seller_name: sl.seller_name ?? prev.seller_name,
            commodity_name: sl.commodity_name ?? prev.commodity_name,
          }
          : prev
      );
      setAvailableLots(prev =>
        prev.map(l =>
          l.lot_id === lotId && session.lot
            ? {
              ...l,
              bag_count: sl.bag_count ?? l.bag_count,
              original_bag_count: sl.original_bag_count ?? l.original_bag_count,
              sold_bags: sl.sold_bags ?? session.total_sold_bags ?? l.sold_bags,
              was_modified: sl.was_modified ?? l.was_modified,
              vehicle_mark: vm ?? l.vehicle_mark,
              seller_mark: sl.seller_mark ?? l.seller_mark,
              vehicle_total_qty: sl.vehicle_total_qty ?? l.vehicle_total_qty,
              seller_total_qty: sl.seller_total_qty ?? l.seller_total_qty,
              vehicle_number: sl.vehicle_number ?? l.vehicle_number,
              seller_name: sl.seller_name ?? l.seller_name,
              commodity_name: sl.commodity_name ?? l.commodity_name,
            }
            : l
        )
      );
      setSelfSaleLots(prev =>
        prev.map(l =>
          l.selfSaleUnitId === selfSaleUnitId && session.lot
            ? {
              ...l,
              bag_count: session.remaining_bags ?? sl.bag_count ?? l.bag_count,
              original_bag_count: sl.original_bag_count ?? l.original_bag_count,
              was_modified: sl.was_modified ?? l.was_modified,
              remainingQty: session.remaining_bags ?? sl.bag_count ?? l.remainingQty,
              sold_bags: Math.max(
                0,
                (sl.original_bag_count ?? l.selfSaleQty ?? l.original_bag_count ?? 0) -
                  (session.remaining_bags ?? sl.bag_count ?? l.bag_count ?? 0)
              ),
              selfSaleQty: l.selfSaleQty ?? sl.original_bag_count,
              vehicle_mark: vm ?? l.vehicle_mark,
              seller_mark: sl.seller_mark ?? l.seller_mark,
              vehicle_total_qty: sl.vehicle_total_qty ?? l.vehicle_total_qty,
              seller_total_qty: sl.seller_total_qty ?? l.seller_total_qty,
              vehicle_number: sl.vehicle_number ?? l.vehicle_number,
              seller_name: sl.seller_name ?? l.seller_name,
              commodity_name: sl.commodity_name ?? l.commodity_name,
            }
            : l
        )
      );
    }
  }, [selectedLot?.lot_id, selectedLot?.selfSaleUnitId]);

  const refetchAuctionSession = useCallback(async () => {
    if (!selectedLot) return;
    try {
      const session = selectedLotSource === 'self_sale'
        ? await auctionApi.getOrStartSelfSaleSession(selectedLot.selfSaleUnitId ?? selectedLot.lot_id)
        : await auctionApi.getOrStartSession(selectedLot.lot_id);
      applyAuctionSession(session);
    } catch {
      toast.error('Failed to refresh session');
    }
  }, [selectedLot, selectedLotSource, applyAuctionSession]);

  const addBidForCurrentSelection = useCallback(async (body: AuctionBidCreateRequest) => {
    if (!selectedLot) throw new Error('No lot selected');
    return selectedLotSource === 'self_sale'
      ? auctionApi.addSelfSaleBid(selectedLot.selfSaleUnitId ?? selectedLot.lot_id, body)
      : auctionApi.addBid(selectedLot.lot_id, body);
  }, [selectedLot, selectedLotSource]);

  const updateBidForCurrentSelection = useCallback(async (bidId: number, body: AuctionBidUpdateRequest) => {
    if (!selectedLot) throw new Error('No lot selected');
    return selectedLotSource === 'self_sale'
      ? auctionApi.updateSelfSaleBid(selectedLot.selfSaleUnitId ?? selectedLot.lot_id, bidId, body)
      : auctionApi.updateBid(selectedLot.lot_id, bidId, body);
  }, [selectedLot, selectedLotSource]);

  /** When preset margin changes, persist the same margin on every bid in the session (all traders). */
  const syncPresetToAllSessionBids = useCallback(
    (applied: number, type: PresetType) => {
      if (!selectedLot) return;
      if (!can('Auctions / Sales', 'Edit')) return;

      presetSyncChainRef.current = presetSyncChainRef.current
        .then(async () => {
          let lastSession: AuctionSessionDTO | null = null;
          let iterations = 0;
          while (iterations < 500) {
            iterations += 1;
            const fresh = lastSession
              ? mapOrderedSessionEntries(lastSession.entries)
              : entriesRef.current;
            const next = fresh.find(
              e => !(e.presetApplied === applied && e.presetType === type)
            );
            if (!next) break;
            lastSession = await updateBidForCurrentSelection(Number(next.id), {
              rate: next.rate,
              quantity: next.quantity,
              extra_rate: next.extraRate ?? 0,
              token_advance: next.tokenAdvance ?? 0,
              preset_applied: applied,
              preset_type: type,
              expected_last_modified_ms: next.lastModifiedMs ?? undefined,
            });
            applyAuctionSession(lastSession);
          }

          const editId = editingBidIdRef.current;
          if (editId && lastSession) {
            const updated = mapOrderedSessionEntries(lastSession.entries).find(x => x.id === editId);
            if (updated) {
              setEditBidDraft(d => {
                if (!d) return d;
                return {
                  ...d,
                  lastModifiedMs: updated.lastModifiedMs ?? null,
                  preset: updated.presetApplied,
                  presetType: updated.presetType,
                };
              });
            }
          }
        })
        .catch(async err => {
          toast.error(err instanceof Error ? err.message : 'Failed to sync preset on bids');
          await refetchAuctionSession();
        });
    },
    [selectedLot, can, updateBidForCurrentSelection, applyAuctionSession, refetchAuctionSession]
  );

  const deleteBidForCurrentSelection = useCallback(async (bidId: number) => {
    if (!selectedLot) throw new Error('No lot selected');
    return selectedLotSource === 'self_sale'
      ? auctionApi.deleteSelfSaleBid(selectedLot.selfSaleUnitId ?? selectedLot.lot_id, bidId)
      : auctionApi.deleteBid(selectedLot.lot_id, bidId);
  }, [selectedLot, selectedLotSource]);

  const completeAuctionForCurrentSelection = useCallback(async () => {
    if (!selectedLot) throw new Error('No lot selected');
    return selectedLotSource === 'self_sale'
      ? auctionApi.completeSelfSaleAuction(selectedLot.selfSaleUnitId ?? selectedLot.lot_id)
      : auctionApi.completeAuction(selectedLot.lot_id);
  }, [selectedLot, selectedLotSource]);

  // ── Lot navigation (prev/next) ─────────────────────────
  const navigationLots = useMemo(
    () => (selectedLotSource === 'self_sale' || statusFilter === 'self_sale' ? selfSaleLots : availableLots),
    [selectedLotSource, statusFilter, selfSaleLots, availableLots]
  );

  const currentLotIndex = useMemo(() => {
    if (!selectedLot) return -1;
    return navigationLots.findIndex(l =>
      selectedLotSource === 'self_sale'
        ? l.selfSaleUnitId === selectedLot.selfSaleUnitId
        : l.lot_id === selectedLot.lot_id
    );
  }, [selectedLot, selectedLotSource, navigationLots]);

  const navigateToLot = (direction: 'prev' | 'next') => {
    if (currentLotIndex === -1) return;
    const newIndex = direction === 'prev' ? currentLotIndex - 1 : currentLotIndex + 1;
    if (newIndex < 0 || newIndex >= navigationLots.length) return;
    selectLot(navigationLots[newIndex], selectedLotSource);
  };

  const canGoPrev = currentLotIndex > 0;
  const canGoNext = currentLotIndex >= 0 && currentLotIndex < navigationLots.length - 1;

  /** Mobile expanded hero height → sticky offset for auction grid below gradient header. */
  useLayoutEffect(() => {
    if (isDesktop || mobileAuctionHeroCollapsed) {
      setExpandedHeroHeightPx(0);
      return;
    }
    const el = expandedHeroMeasureRef.current;
    if (!el) return;
    const measure = () => {
      const h = Math.round(el.offsetHeight || el.getBoundingClientRect().height);
      setExpandedHeroHeightPx(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop, mobileAuctionHeroCollapsed, selectedLot?.lot_id]);

  // Status counts for lot selector
  const statusCounts = useMemo(() => {
    const counts = { available: 0, sold: 0, partial: 0, pending: 0, self_sale: 0 };
    availableLots.forEach(l => {
      const s = getLotStatus(l.lot_id, l.bag_count, l.status);
      counts[s]++;
    });
    counts.self_sale = selfSaleLots.length;
    return counts;
  }, [availableLots, selfSaleLots]);

  /** Buyer-facing total = seller bid + signed preset margin (stored on entries / API). */
  const calcSellerRate = useCallback((bidRate: number, presetVal: number) => {
    if (presetVal === 0) return bidRate;
    return bidRate + presetVal;
  }, []);

  // REQ-AUC-009: Allow quantity increase with confirmation
  const tryAddEntry = (entry: Omit<SaleEntry, 'id' | 'bidNumber'>) => {
    if (!can('Auctions / Sales', 'Create')) {
      toast.error('You do not have permission to add auction bids.');
      return;
    }
    if (!selectedLot) return;
    const currentSold = entries.reduce((s, e) => s + e.quantity, 0);
    const newTotal = currentSold + entry.quantity;

    if (newTotal > selectedLot.bag_count) {
      setQtyIncreaseDialog({
        currentTotal: currentSold,
        lotTotal: selectedLot.bag_count,
        attemptedQty: entry.quantity,
        pendingEntry: entry,
      });
      return;
    }

    commitEntry(entry);
  };

  const commitEntry = (entry: Omit<SaleEntry, 'id' | 'bidNumber'>) => {
    const existingWithMark = entries.find(e => e.buyerMark === entry.buyerMark && !e.isSelfSale);
    if (existingWithMark && !entry.isSelfSale) {
      setDuplicateMarkDialog({
        mark: entry.buyerMark,
        buyerName: entry.buyerName,
        buyerContactId: entry.buyerContactId,
        rate: entry.rate,
        qty: entry.quantity,
        isScribble: entry.isScribble,
        existingEntry: existingWithMark,
      });
      return;
    }

    finalizeEntry(entry);
  };

  const finalizeEntry = useCallback(async (entry: Omit<SaleEntry, 'id' | 'bidNumber'>, allowLotIncrease?: boolean) => {
    if (!selectedLot) return;
    const allow = allowLotIncrease ?? addBidRetryAllowIncrease;
    const body: AuctionBidCreateRequest = {
      buyer_name: entry.buyerName,
      buyer_mark: entry.buyerMark,
      buyer_id: entry.buyerContactId ? parseInt(entry.buyerContactId, 10) : undefined,
      rate: entry.rate,
      quantity: entry.quantity,
      is_scribble: entry.isScribble,
      is_self_sale: entry.isSelfSale,
      extra_rate: entry.extraRate ?? 0,
      preset_applied: entry.presetApplied ?? 0,
      preset_type: entry.presetType ?? 'PROFIT',
      token_advance: entry.tokenAdvance ?? 0,
      allow_lot_increase: allow,
    };
    try {
      pendingBidAutoScrollRef.current = true;
      const session = await addBidForCurrentSelection(body);
      applyAuctionSession(session);
      void loadTemporaryBuyerMarks();
      hapticNotification(NotificationType.Success);
      const t = Date.now();
      if (entry.buyerContactId) {
        setContactLastUsedMs(p => ({ ...p, [String(entry.buyerContactId)]: t }));
      } else if (entry.isScribble && !entry.isSelfSale) {
        const m = (entry.buyerMark || '').trim();
        if (m) setTempMarkLastUsedMs(p => ({ ...p, [m]: t }));
      }
      setRate('');
      setQty('');
      setSelectedBuyer(null);
      lastScribbleSegmentRef.current = '';
      setScribbleMark('');
      setAddBidRetryAllowIncrease(false);
      userClearedRateRef.current = false;
    } catch (err: unknown) {
      pendingBidAutoScrollRef.current = false;
      const isConflict = err && typeof err === 'object' && (err as { isConflict?: boolean }).isConflict === true;
      if (isConflict) {
        setAddBidRetryAllowIncrease(true);
        toast.error('Quantity exceeds lot. Tap "Add" again to allow lot increase and retry.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to add bid');
      }
    }
  }, [selectedLot, addBidRetryAllowIncrease, loadTemporaryBuyerMarks, addBidForCurrentSelection, applyAuctionSession]);

  const confirmQtyIncrease = async () => {
    if (!qtyIncreaseDialog || !selectedLot) return;
    await finalizeEntry(qtyIncreaseDialog.pendingEntry, true);
    setQtyIncreaseDialog(null);
    toast.success('Bid added with lot increase allowed.');
  };

  const handleDuplicateMerge = async () => {
    if (!duplicateMarkDialog || !selectedLot) return;
    const { existingEntry, rate: newRate, qty: newQty } = duplicateMarkDialog;
    const mergeEffectivePreset = showPresetMargin ? preset : 0;
    if (existingEntry.rate === newRate) {
      try {
        await deleteBidForCurrentSelection(Number(existingEntry.id));
        const mergedQty = existingEntry.quantity + newQty;
        pendingBidAutoScrollRef.current = true;
        const session = await addBidForCurrentSelection({
          buyer_name: duplicateMarkDialog.buyerName,
          buyer_mark: duplicateMarkDialog.mark,
          buyer_id: duplicateMarkDialog.buyerContactId ? parseInt(duplicateMarkDialog.buyerContactId, 10) : undefined,
          rate: newRate,
          quantity: mergedQty,
          is_scribble: duplicateMarkDialog.isScribble,
          is_self_sale: false,
          extra_rate: 0,
          preset_applied: mergeEffectivePreset,
          preset_type: presetType,
          token_advance: existingEntry.tokenAdvance ?? 0,
        });
        applyAuctionSession(session);
        void loadTemporaryBuyerMarks();
        {
          const t = Date.now();
          if (duplicateMarkDialog.buyerContactId) {
            setContactLastUsedMs(p => ({ ...p, [String(duplicateMarkDialog.buyerContactId)]: t }));
          } else if (duplicateMarkDialog.isScribble) {
            setTempMarkLastUsedMs(p => ({ ...p, [duplicateMarkDialog.mark]: t }));
          }
        }
        toast.success(`Merged ${newQty} bags into existing bid #${existingEntry.bidNumber}`);
        setRate('');
        setQty('');
        lastScribbleSegmentRef.current = '';
        setScribbleMark('');
        setSelectedBuyer(null);
        userClearedRateRef.current = false;
      } catch (e) {
        pendingBidAutoScrollRef.current = false;
        toast.error(e instanceof Error ? e.message : 'Failed to merge bid');
      }
    } else {
      await finalizeEntry({
        buyerName: duplicateMarkDialog.buyerName,
        buyerMark: duplicateMarkDialog.mark,
        buyerContactId: duplicateMarkDialog.buyerContactId,
        rate: newRate,
        quantity: newQty,
        amount: newRate * newQty,
        isSelfSale: false,
        isScribble: duplicateMarkDialog.isScribble,
        tokenAdvance: 0,
        extraRate: 0,
        presetApplied: mergeEffectivePreset,
        presetType,
        sellerRate: calcSellerRate(newRate, mergeEffectivePreset),
        buyerRate: newRate,
      });
      toast.info(`Kept as separate bid (different rate)`);
    }
    setDuplicateMarkDialog(null);
  };

  const handleDuplicateNewMark = () => {
    setDuplicateMarkDialog(null);
    toast.info('Enter a different mark for this buyer');
  };

  const handleFormSubmit = () => {
    if (!selectedBuyer || !rate || !qty) return;
    const entryRate = getBidRateFromInput(rate);
    const entryQty = parseInt(qty);
    if (entryRate <= 0 || entryQty <= 0) return;
    const effectivePreset = showPresetMargin ? preset : 0;
    tryAddEntry({
      buyerName: selectedBuyer.name,
      buyerMark: selectedBuyer.mark || selectedBuyer.name.charAt(0),
      buyerContactId: selectedBuyer.contact_id,
      rate: entryRate,
      quantity: entryQty,
      amount: entryRate * entryQty,
      isSelfSale: false,
      isScribble: false,
      tokenAdvance: 0,
      extraRate: 0,
      presetApplied: effectivePreset,
      presetType,
      sellerRate: calcSellerRate(entryRate, effectivePreset),
      buyerRate: entryRate,
    });
  };

  const handleScribbleConfirm = (initials: string, quantity: number) => {
    if (editingBidId) return;
    const currentRate = getBidRateFromInput(rate) || highestBid || 0;
    if (currentRate <= 0) return;
    const effectivePreset = showPresetMargin ? preset : 0;
    tryAddEntry({
      buyerName: initials,
      buyerMark: initials,
      buyerContactId: null,
      rate: currentRate,
      quantity,
      amount: currentRate * quantity,
      isSelfSale: false,
      isScribble: true,
      tokenAdvance: 0,
      extraRate: 0,
      presetApplied: effectivePreset,
      presetType,
      sellerRate: calcSellerRate(currentRate, effectivePreset),
      buyerRate: currentRate,
    });
    setShowScribble(false);
    lastScribbleSegmentRef.current = '';
    setScribbleMark('');
  };

  const handleScribbleInlineAdd = () => {
    if (!scribbleMark || !rate || !qty) return;
    const entryRate = getBidRateFromInput(rate);
    const entryQty = parseInt(qty);
    if (entryRate <= 0 || entryQty <= 0) return;
    const effectivePreset = showPresetMargin ? preset : 0;
    tryAddEntry({
      buyerName: scribbleMark,
      buyerMark: scribbleMark,
      buyerContactId: null,
      rate: entryRate,
      quantity: entryQty,
      amount: entryRate * entryQty,
      isSelfSale: false,
      isScribble: true,
      tokenAdvance: 0,
      extraRate: 0,
      presetApplied: effectivePreset,
      presetType,
      sellerRate: calcSellerRate(entryRate, effectivePreset),
      buyerRate: entryRate,
    });
    lastScribbleSegmentRef.current = '';
    setScribbleMark('');
    setRate('');
    setQty('');
    userClearedRateRef.current = false;
  };

  // Unified Add Bid: use selected contact (name + mark) or scribble mark only — fast path for live auction
  const handleUnifiedAdd = () => {
    const entryRate = getBidRateFromInput(rate);
    const entryQty = parseInt(qty);
    if (!rate || !qty || entryRate <= 0 || entryQty <= 0) return;
    const effectivePreset = showPresetMargin ? preset : 0;

    hapticImpact();

    if (selectedBuyer) {
      tryAddEntry({
        buyerName: selectedBuyer.name,
        buyerMark: selectedBuyer.mark || selectedBuyer.name.charAt(0),
        buyerContactId: selectedBuyer.contact_id,
        rate: entryRate,
        quantity: entryQty,
        amount: entryRate * entryQty,
        isSelfSale: false,
        isScribble: false,
        tokenAdvance: 0,
        extraRate: 0,
        presetApplied: effectivePreset,
        presetType,
        sellerRate: calcSellerRate(entryRate, effectivePreset),
        buyerRate: entryRate,
      });
      setSelectedBuyer(null);
    } else if (scribbleMark.trim()) {
      tryAddEntry({
        buyerName: scribbleMark,
        buyerMark: scribbleMark,
        buyerContactId: null,
        rate: entryRate,
        quantity: entryQty,
        amount: entryRate * entryQty,
        isSelfSale: false,
        isScribble: true,
        tokenAdvance: 0,
        extraRate: 0,
        presetApplied: effectivePreset,
        presetType,
        sellerRate: calcSellerRate(entryRate, effectivePreset),
        buyerRate: entryRate,
      });
    } else return;

    lastScribbleSegmentRef.current = '';
    setScribbleMark('');
    setRate('');
    setQty('');
    userClearedRateRef.current = false;
  };

  const updateActiveNumpadField = (next: string) => {
    if (activeNumpadField === 'rate') {
      setRate(next);
      if (next.trim() !== '') {
        userClearedRateRef.current = false;
      }
      if (editingBidId) setEditBidDraft((d) => (d ? { ...d, rate: next } : d));
    } else if (activeNumpadField === 'qty') {
      setQty(next);
      if (editingBidId) setEditBidDraft((d) => (d ? { ...d, qty: next } : d));
    } else if (activeNumpadField === 'mark') {
      lastScribbleSegmentRef.current = '';
      const v = next.toUpperCase().slice(0, MAX_MARK_LEN);
      setScribbleMark(v);
      markInsertPosRef.current = clampInsideClosingParen(v, v.length);
      pendingMarkCaretPosRef.current = markInsertPosRef.current;
      setSelectedBuyer(null);
    }
  };

  const getCurrentNumpadValue = () => {
    if (activeNumpadField === 'rate') return rate;
    if (activeNumpadField === 'qty') return qty;
    if (activeNumpadField === 'mark') return scribbleMark;
    return '';
  };

  const handleNumpadKey = (key: string) => {
    const current = getCurrentNumpadValue();
    if (key >= '0' && key <= '9') {
      updateActiveNumpadField(`${current}${key}`.slice(0, 8));
      return;
    }
    if (key === '.') {
      if (activeNumpadField === 'mark') return;
      if (activeNumpadField === 'rate') {
        // Fast entry helper: dot key appends double-zero for rates.
        updateActiveNumpadField(`${current}00`.slice(0, 8));
      }
      return;
    }
    if (key === '+') {
      if (activeNumpadField === 'mark') return;
      const n = parseInt(String(current || '0'), 10) || 0;
      updateActiveNumpadField(String(n + 1));
      return;
    }
    if (key === '*') {
      if (activeNumpadField === 'mark') return;
      const n = parseInt(String(current || '0'), 10) || 0;
      updateActiveNumpadField(String(n * 10));
    }
  };

  const handleNumpadBackspace = () => {
    if (activeNumpadField === 'mark') {
      handleMarkBackspace();
      return;
    }
    const current = getCurrentNumpadValue();
    updateActiveNumpadField(String(current).slice(0, -1));
  };

  const handleNumpadClear = () => {
    if (activeNumpadField === 'rate') {
      userClearedRateRef.current = true;
    }
    updateActiveNumpadField('');
  };

  const handleOpenSystemKeyboard = () => {
    setMobileKeyboardEnabled(true);
    if (activeNumpadField === 'rate') rateInputRef.current?.focus();
    else if (activeNumpadField === 'qty') qtyInputRef.current?.focus();
    else if (activeNumpadField === 'mark') markInputRef.current?.focus();
  };

  const handleSelfSale = () => {
    if (remaining <= 0 || !selectedLot) return;
    hapticImpact();
    const currentRate = highestBid || getBidRateFromInput(rate) || 0;
    tryAddEntry({
      buyerName: 'Self Sale',
      buyerMark: 'SS',
      buyerContactId: null,
      rate: currentRate,
      quantity: remaining,
      amount: currentRate * remaining,
      isSelfSale: true,
      isScribble: false,
      tokenAdvance: 0,
      extraRate: 0,
      presetApplied: 0,
      presetType,
      sellerRate: currentRate,
      buyerRate: currentRate,
    });
  };

  const runAuctionCompletion = useCallback(async (openPrintAfter: boolean) => {
    if (!selectedLot) return;
    setCompleteLoading(true);
    if (!can('Auctions / Sales', 'Approve')) {
      toast.error('You do not have permission to complete auctions.');
      setCompleteLoading(false);
      return;
    }
    const partial = remaining > 0;
    try {
      const completed = await completeAuctionForCurrentSelection();
      if (openPrintAfter) {
        setCompletedAuction(completed);
        setShowPrint(true);
      } else {
        setCompletedAuction(null);
        setShowPrint(false);
      }
      clearDraft();
      setShowLotSelector(true);
      setSelectedLot(null);
      setSelectedLotSource('regular');
      setSelfSaleContext(null);
      setEntries([]);
      void loadTemporaryBuyerMarks();
      loadLots();
      loadSelfSaleLots();
      if (openPrintAfter) {
        toast.success(partial ? 'Auction saved (partial). Opening print…' : 'Auction completed. Opening print…');
      } else {
        toast.success(partial ? 'Auction saved (partial). Back to lot list.' : 'Auction completed. Back to lot list.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete auction');
    } finally {
      setCompleteLoading(false);
    }
  }, [
    selectedLot,
    can,
    remaining,
    completeAuctionForCurrentSelection,
    loadTemporaryBuyerMarks,
    loadLots,
    loadSelfSaleLots,
  ]);

  const handleSaveAndCompleteAuction = useCallback(() => {
    void runAuctionCompletion(false);
  }, [runAuctionCompletion]);

  const handleCompleteAndPrint = useCallback(() => {
    void runAuctionCompletion(true);
  }, [runAuctionCompletion]);

  useEffect(() => {
    if (!showPrint || !completedAuction) return;
    const printKey = String(completedAuction.auction_id);
    if (autoPrintedAuctionRef.current === printKey) return;
    autoPrintedAuctionRef.current = printKey;
    void (async () => {
      const ok = await directPrint(generateAuctionCompletionPrintHTML({
        auctionId: completedAuction.auction_id,
        lotId: completedAuction.lotId,
        lotName: completedAuction.lotName,
        sellerName: completedAuction.sellerName,
        vehicleNumber: completedAuction.vehicleNumber,
        commodityName: completedAuction.commodityName,
        completedAt: completedAuction.completedAt,
        entries: completedAuction.entries,
      }), { mode: "system" });
      ok ? toast.success('Auction completion print opened') : toast.error('Printer not connected.');
    })();
  }, [showPrint, completedAuction]);

  const removeEntry = useCallback(async (id: string) => {
    if (!selectedLot) return;
    if (editingBidId && editingBidId !== id) {
      toast.info('Finish or cancel bid edit first.');
      return;
    }
    if (!can('Auctions / Sales', 'Delete')) {
      toast.error('You do not have permission to delete auction bids.');
      return;
    }
    if (editingBidId === id) {
      setEditingBidId(null);
      setEditBidDraft(null);
      setEditBidRetryAllowIncrease(false);
      setEditBidQtyDialog(null);
      setShowTokenInput(null);
      editBidFormSnapshotRef.current = null;
    }
    try {
      const session = await deleteBidForCurrentSelection(Number(id));
      applyAuctionSession(session);
      void loadTemporaryBuyerMarks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove bid');
    }
  }, [selectedLot, loadTemporaryBuyerMarks, editingBidId, can, getBidRateFromInput]);

  const setTokenAdvanceAmount = useCallback(async (id: string, amount: number) => {
    if (!selectedLot) return;
    if (editingBidId === id) {
      toast.info('Save or cancel the bid edit first.');
      return;
    }
    if (!can('Auctions / Sales', 'Edit')) {
      toast.error('You do not have permission to edit auction bids.');
      return;
    }
    try {
      const session = await updateBidForCurrentSelection(Number(id), { token_advance: amount });
      applyAuctionSession(session);
      setShowTokenInput(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update token advance');
    }
  }, [selectedLot, editingBidId, can, applyAuctionSession, updateBidForCurrentSelection]);

  const cancelEditBid = useCallback(() => {
    const snap = editBidFormSnapshotRef.current;

    setEditingBidId(null);
    setEditBidDraft(null);
    setEditBidRetryAllowIncrease(false);
    setEditBidQtyDialog(null);
    setShowTokenInput(null);

    editBidFormSnapshotRef.current = null;

    if (snap) {
      setSelectedBuyer(snap.selectedBuyer);
      setScribbleMark(snap.scribbleMark);
      setRate(snap.rate);
      setQty(snap.qty);
      setShowPresetMargin(snap.showPresetMargin);
      setPreset(snap.preset);
      setPresetType(snap.presetType);
      setActiveNumpadField(snap.activeNumpadField);
      setMobileKeyboardEnabled(snap.mobileKeyboardEnabled);
      lastScribbleSegmentRef.current = snap.lastScribbleSegment;
    }
  }, []);

  const startEditBid = useCallback((entry: SaleEntry) => {
    if (!can('Auctions / Sales', 'Edit')) {
      toast.error('You do not have permission to edit auction bids.');
      return;
    }

    // Snapshot current Sales Pad state so Cancel restores it.
    editBidFormSnapshotRef.current = {
      selectedBuyer,
      scribbleMark,
      rate,
      qty,
      showPresetMargin,
      preset,
      presetType,
      activeNumpadField,
      mobileKeyboardEnabled,
      lastScribbleSegment: lastScribbleSegmentRef.current,
    };

    setShowTokenInput(null);
    setEditBidQtyDialog(null);
    setEditingBidId(entry.id);
    setEditBidRetryAllowIncrease(false);
    const displayRateForInput =
      entry.presetApplied !== 0
        ? Math.trunc(entry.rate + entry.presetApplied)
        : Math.trunc(entry.rate);
    setEditBidDraft({
      rate: String(displayRateForInput),
      qty: String(entry.quantity),
      preset: entry.presetApplied,
      presetType: entry.presetType,
      extraRate: String(entry.extraRate ?? 0),
      token: String(Math.trunc(entry.tokenAdvance ?? 0)),
      lastModifiedMs: entry.lastModifiedMs ?? null,
    });

    // Prefill Sales Pad controls from the bid being edited.
    setRate(String(displayRateForInput));
    setQty(String(entry.quantity));
    setPreset(entry.presetApplied);
    setPresetType(entry.presetType);
    setShowPresetMargin(entry.presetApplied !== 0);

    // Buyer display: match contact id when possible; otherwise use scribble mark.
    const matchedBuyer = entry.buyerContactId
      ? buyers.find(b => String(b.contact_id) === entry.buyerContactId) ?? null
      : null;
    if (matchedBuyer) {
      setSelectedBuyer(matchedBuyer);
      setScribbleMark(entry.buyerMark ?? '');
    } else {
      setSelectedBuyer(null);
      setScribbleMark(entry.buyerMark ?? '');
    }
  }, [
    can,
    selectedBuyer,
    scribbleMark,
    rate,
    qty,
    showPresetMargin,
    preset,
    presetType,
    activeNumpadField,
    mobileKeyboardEnabled,
    buyers,
  ]);

  const saveEditBid = useCallback(async (entry: SaleEntry) => {
    if (!selectedLot || !editBidDraft) return;
    if (!can('Auctions / Sales', 'Edit')) {
      toast.error('You do not have permission to edit auction bids.');
      return;
    }
    const rateDisplay = parseInt(editBidDraft.rate, 10);
    const qtyN = parseInt(editBidDraft.qty, 10);
    if (!Number.isFinite(rateDisplay) || rateDisplay < 1 || !Number.isFinite(qtyN) || qtyN < 1) {
      toast.error('Enter valid rate and quantity (at least 1).');
      return;
    }
    const baseBid = showPresetMargin
      ? Math.max(0, rateDisplay - editBidDraft.preset)
      : rateDisplay;
    if (baseBid < 1) {
      toast.error('Enter valid rate and quantity (at least 1).');
      return;
    }
    const extra = Number(editBidDraft.extraRate);
    const token = Number(editBidDraft.token);
    if (!Number.isFinite(extra) || !Number.isFinite(token)) {
      toast.error('Enter valid numeric values.');
      return;
    }
    const others = entries.filter(e => e.id !== entry.id).reduce((s, e) => s + e.quantity, 0);
    const newTotalSold = others + qtyN;
    const lotCap = selectedLot.bag_count;
    const body: AuctionBidUpdateRequest = {
      rate: baseBid,
      quantity: qtyN,
      extra_rate: extra,
      preset_applied: editBidDraft.preset,
      preset_type: editBidDraft.preset < 0 ? 'LOSS' : 'PROFIT',
      token_advance: token,
      expected_last_modified_ms: editBidDraft.lastModifiedMs ?? undefined,
      allow_lot_increase: editBidRetryAllowIncrease,
    };
    if (newTotalSold > lotCap && !editBidRetryAllowIncrease) {
      setEditBidQtyDialog({
        currentTotal: others,
        lotTotal: lotCap,
        attemptedQty: qtyN,
        pendingBody: body,
        bidNumericId: Number(entry.id),
      });
      return;
    }
    try {
      const session = await updateBidForCurrentSelection(Number(entry.id), body);
      applyAuctionSession(session);
      // After successful update, clear entry inputs so next action starts fresh.
      setSelectedBuyer(null);
      lastScribbleSegmentRef.current = '';
      setScribbleMark('');
      setRate('');
      setQty('');
      setEditingBidId(null);
      setEditBidDraft(null);
      setEditBidRetryAllowIncrease(false);
      editBidFormSnapshotRef.current = null;
      userClearedRateRef.current = false;
      void loadTemporaryBuyerMarks();
      hapticNotification(NotificationType.Success);
    } catch (err: unknown) {
      const e = err as { isStaleBid?: boolean; isConflict?: boolean };
      if (e.isStaleBid) {
        toast.error(err instanceof Error ? err.message : 'Bid was updated elsewhere');
        await refetchAuctionSession();
        cancelEditBid();
        return;
      }
      if (e.isConflict) {
        setEditBidRetryAllowIncrease(true);
        toast.error('Quantity exceeds lot. Tap Save again to allow lot increase.');
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update bid');
    }
  }, [
    selectedLot,
    editBidDraft,
    entries,
    editBidRetryAllowIncrease,
    can,
    loadTemporaryBuyerMarks,
    applyAuctionSession,
    refetchAuctionSession,
    cancelEditBid,
    showPresetMargin,
  ]);

  const confirmEditBidQtyIncrease = useCallback(async () => {
    if (!editBidQtyDialog || !selectedLot) return;
    const { pendingBody, bidNumericId } = editBidQtyDialog;
    setEditBidQtyDialog(null);
    try {
      const session = await updateBidForCurrentSelection(bidNumericId, { ...pendingBody, allow_lot_increase: true });
      applyAuctionSession(session);
      // Keep behavior same as normal update: clear entry inputs afterwards.
      setSelectedBuyer(null);
      lastScribbleSegmentRef.current = '';
      setScribbleMark('');
      setRate('');
      setQty('');
      setEditingBidId(null);
      setEditBidDraft(null);
      setEditBidRetryAllowIncrease(false);
      editBidFormSnapshotRef.current = null;
      userClearedRateRef.current = false;
      void loadTemporaryBuyerMarks();
      toast.success('Bid updated with lot increase allowed.');
      hapticNotification(NotificationType.Success);
    } catch (err: unknown) {
      const e = err as { isStaleBid?: boolean; isConflict?: boolean };
      if (e.isStaleBid) {
        toast.error(err instanceof Error ? err.message : 'Bid was updated elsewhere');
        await refetchAuctionSession();
        cancelEditBid();
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update bid');
    }
  }, [editBidQtyDialog, selectedLot, applyAuctionSession, loadTemporaryBuyerMarks, refetchAuctionSession, cancelEditBid]);

  const applyPreset = (value: number) => {
    const next = preset === value ? 0 : value;
    const currentInput = parseInt(rate, 10);
    let newRateStr: string | null = null;
    if (showPresetMargin && Number.isFinite(currentInput) && currentInput > 0) {
      const baseRate = currentInput - preset;
      const nextDisplay = baseRate + next;
      newRateStr = String(Math.max(0, nextDisplay));
      setRate(newRateStr);
    }
    setPreset(next);
    if (next !== 0) setPresetType(value >= 0 ? 'PROFIT' : 'LOSS');

    if (editingBidId) {
      setEditBidDraft((d) => {
        if (!d) return d;
        return {
          ...d,
          preset: next,
          presetType: next < 0 ? 'LOSS' : 'PROFIT',
          ...(newRateStr !== null ? { rate: newRateStr } : {}),
        };
      });
    }

    if (showPresetMargin) {
      const nextType: PresetType = next !== 0 ? (value >= 0 ? 'PROFIT' : 'LOSS') : 'PROFIT';
      syncPresetToAllSessionBids(next, nextType);
    }
  };

  useEffect(() => {
    if (editingBidId) return;
    if (userClearedRateRef.current) return;
    if (rate.trim() !== '') return;
    if (previousBidRate <= 0) return;
    const displayRate = showPresetMargin ? previousBidRate + preset : previousBidRate;
    setRate(String(displayRate));
  }, [editingBidId, previousBidRate, rate, showPresetMargin, preset]);

  const handleShowPresetMarginChange = useCallback((checked: boolean) => {
    const currentInput = parseInt(rate, 10);
    if (Number.isFinite(currentInput) && currentInput > 0) {
      // Field shows seller bid when preset off, buyer total (bid + preset) when preset on.
      const nextDisplay = checked ? currentInput + preset : currentInput - preset;
      const s = String(Math.max(0, nextDisplay));
      setRate(s);
      if (editingBidId) {
        setEditBidDraft((d) => (d ? { ...d, rate: s } : d));
      }
      userClearedRateRef.current = false;
    } else if (!editingBidId) {
      if (checked) {
        if (previousBidRate > 0) {
          setRate(String(previousBidRate + preset));
          userClearedRateRef.current = false;
        } else {
          setRate('');
        }
      } else if (previousBidRate > 0) {
        setRate(String(previousBidRate));
        userClearedRateRef.current = false;
      } else {
        setRate('');
      }
    }
    setShowPresetMargin(checked);
    if (editingBidId) {
      setEditBidDraft((d) => {
        if (!d) return d;
        const nextPreset = checked ? preset : 0;
        return { ...d, preset: nextPreset, presetType: nextPreset < 0 ? 'LOSS' : 'PROFIT' };
      });
    }

    if (!checked) {
      syncPresetToAllSessionBids(0, 'PROFIT');
    } else if (preset !== 0) {
      syncPresetToAllSessionBids(preset, presetType);
    }
  }, [editingBidId, preset, presetType, previousBidRate, rate, syncPresetToAllSessionBids]);

  const selectLot = useCallback((lot: LotInfo, source: LotSource = statusFilter === 'self_sale' ? 'self_sale' : 'regular') => {
    setSelectedLotSource(source);
    setSelectedLot(lot);
    setSelfSaleContext(null);
    setShowLotSelector(false);
    setShowLotList(false);
    setEntries([]);
    setEditingBidId(null);
    setEditBidDraft(null);
    editBidFormSnapshotRef.current = null;
    setEditBidRetryAllowIncrease(false);
    setEditBidQtyDialog(null);
    setRate('');
    setQty('');
    setLotNumberSearch('');
    userClearedRateRef.current = false;
    // Available lots have no bids yet — user must enter a rate, so focus Rate first.
    // Sold/partial/pending lots already have bids and the rate auto-fills from the
    // last bid, so focus Mark instead (existing behaviour).
    setPreferRateForFirstBidFormFocus(lot.status === 'available' || !lot.status);
    setSessionLoading(true);
    const loadSession = source === 'self_sale'
      ? auctionApi.getOrStartSelfSaleSession(lot.selfSaleUnitId ?? lot.lot_id)
      : auctionApi.getOrStartSession(lot.lot_id);
    loadSession
      .then((session: AuctionSessionDTO) => {
        const info = lotSummaryToLotInfo(session.lot);
        // Keep seller/vehicle/commodity from list lot if session.lot has empty (backend may omit in some paths)
        setSelectedLot({
          ...info,
          selfSaleUnitId: source === 'self_sale' ? lot.selfSaleUnitId ?? null : null,
          status: source === 'self_sale' ? 'self_sale' : info.status,
          seller_name: info.seller_name || lot.seller_name || '',
          seller_mark: info.seller_mark || lot.seller_mark || '',
          vehicle_mark: info.vehicle_mark || lot.vehicle_mark,
          vehicle_number: info.vehicle_number || lot.vehicle_number || '',
          vehicle_total_qty: info.vehicle_total_qty ?? lot.vehicle_total_qty,
          seller_total_qty: info.seller_total_qty ?? lot.seller_total_qty,
          commodity_name: info.commodity_name || lot.commodity_name || '',
        });
        setEntries(mapOrderedSessionEntries(session.entries));
        setSelfSaleContext(session.self_sale_context ?? null);
        void loadTemporaryBuyerMarks();
      })
      .catch(() => toast.error('Failed to load session'))
      .finally(() => setSessionLoading(false));
  }, [loadTemporaryBuyerMarks, statusFilter]);

  const goBackToSelector = () => {
    // Don't clear entries — they're auto-saved
    setShowLotSelector(true);
    // Refetch lots so status (Available / Pending / Partial / Sold) is up to date
    loadLots();
    loadSelfSaleLots();
  };

  // ═══ AUCTION PRINT PREVIEW ═══
  if (showPrint && completedAuction) {
    const totalQty = completedAuction.entries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
    const totalAmount = completedAuction.entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const completedAt = completedAuction.completedAt ? new Date(completedAuction.completedAt) : new Date();
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        {!isDesktop ? (
          <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-[2rem]">
            <div className="relative z-10 flex items-center gap-3">
              <button onClick={() => setShowPrint(false)}
                aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <Printer className="w-5 h-5" /> Auction Print
                </h1>
                <p className="text-white/70 text-xs">Auction #{completedAuction.auction_id}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-8 py-5 flex items-center gap-4">
            <Button onClick={() => setShowPrint(false)} variant="outline" size="sm" className="rounded-xl h-9">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-500" /> Auction Print
              </h2>
              <p className="text-sm text-muted-foreground">Auction #{completedAuction.auction_id}</p>
            </div>
          </div>
        )}

        <div className="px-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-4 font-mono text-xs space-y-2 shadow-lg">
            <div className="text-center border-b border-dashed border-border pb-2">
              <p className="font-bold text-sm text-foreground">MERCOTRACE</p>
              <p className="text-muted-foreground">Auction Completion</p>
              <p className="text-muted-foreground">{completedAt.toLocaleDateString()} {completedAt.toLocaleTimeString()}</p>
            </div>

            <div className="border-b border-dashed border-border pb-2 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Auction ID</span><span className="font-bold text-foreground">{completedAuction.auction_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lot</span><span className="font-bold text-foreground">{completedAuction.lotName || completedAuction.lotId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span className="font-bold text-foreground">{completedAuction.sellerName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span className="font-bold text-foreground">{completedAuction.vehicleNumber || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span className="font-bold text-foreground">{completedAuction.commodityName || '—'}</span></div>
            </div>

            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">BIDS ({completedAuction.entries.length})</p>
              {completedAuction.entries.map((entry, idx) => (
                <div key={`${entry.bidNumber}-${idx}`} className="flex justify-between text-[10px]">
                  <span className="text-foreground">#{entry.bidNumber} {entry.buyerMark} · {entry.quantity} @ ₹{entry.rate}</span>
                  <span className="font-bold text-foreground">₹{entry.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between"><span className="text-muted-foreground">Total Qty</span><span className="font-bold text-foreground">{totalQty} bags</span></div>
            <div className="flex justify-between text-sm border-t border-dashed border-border pt-2">
              <span className="font-bold text-foreground">TOTAL SALE</span>
              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">₹{totalAmount.toLocaleString()}</span>
            </div>
            <div className="text-center border-t border-dashed border-border pt-2">
              <p className="text-muted-foreground">--- END OF AUCTION ---</p>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              onClick={async () => {
                const ok = await directPrint(generateAuctionCompletionPrintHTML({
                  auctionId: completedAuction.auction_id,
                  lotId: completedAuction.lotId,
                  lotName: completedAuction.lotName,
                  sellerName: completedAuction.sellerName,
                  vehicleNumber: completedAuction.vehicleNumber,
                  commodityName: completedAuction.commodityName,
                  completedAt: completedAuction.completedAt,
                  entries: completedAuction.entries,
                }), { mode: "system" });
                ok ? toast.success('Auction details sent to printer!') : toast.error('Printer not connected.');
              }}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white font-bold shadow-lg"
            >
              <Printer className="w-5 h-5 mr-2" /> Print Auction
            </Button>
            <Button
              onClick={() => {
                setShowPrint(false);
                setCompletedAuction(null);
                setShowLotSelector(true);
                setSelectedLot(null);
                setEntries([]);
                loadLots();
              }}
              variant="outline"
              className="h-12 rounded-xl px-6"
            >
              Done
            </Button>
          </div>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ LOT SELECTOR SCREEN ═══
  if (showLotSelector) {
    return (
      <div className="bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 lg:pb-6">
        {/* Mobile Header */}
        {!isDesktop && (
          <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
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
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => navigate('/home')} aria-label="Go back" className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-white flex items-center gap-2 md:text-3xl">
                    <Gavel className="w-6 h-6 shrink-0 md:w-7 md:h-7" /> Sales Pad
                  </h1>
                  <p className="text-sm text-white/80 md:text-base">Select a lot to begin auction</p>
                </div>
              </div>
              {/* General search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <input
                  placeholder="Search lot, seller, vehicle, or AB-200/SA-122/SA1/22…"
                  value={lotSearchQuery}
                  onChange={e => setLotSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30"
                />
              </div>
              {/* Lot Number search */}
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <input
                  placeholder="Lot # or AB-200/SA-122/SA1/22…"
                  value={lotNumberSearch}
                  onChange={e => setLotNumberSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/15 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          </div>
        )}

        {/* Desktop Toolbar */}
        {isDesktop && (
          <div className="px-8 py-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-blue-500" /> Sales Pad — Lot Selection
                </h2>
                <p className="text-sm text-muted-foreground">{selectorLots.length} lots available · Select a lot to begin auction</p>
              </div>
              <div className="flex gap-3">
                <div className="relative w-56">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    placeholder="Lot # or AB-200/SA-122/SA1/22…"
                    value={lotNumberSearch}
                    onChange={e => setLotNumberSearch(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    placeholder="Search lot, seller, vehicle, or AB-200/SA-122/SA1/22…"
                    value={lotSearchQuery}
                    onChange={e => setLotSearchQuery(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-blue-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Lots</p>
                <p className="text-2xl font-black text-foreground">{selectorLots.length}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-emerald-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Bags</p>
                <p className="text-2xl font-black text-foreground">{selectorLots.reduce((s, l) => s + l.bag_count, 0)}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-violet-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Vehicles</p>
                <p className="text-2xl font-black text-foreground">{new Set(selectorLots.map(l => l.vehicle_number)).size}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-amber-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Sellers</p>
                <p className="text-2xl font-black text-foreground">{new Set(selectorLots.map(l => l.seller_name)).size}</p>
              </div>
            </div>
          </div>
        )}

        {/* Status Filter Bar */}
        <div className="px-4 mt-4 mb-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button onClick={() => setStatusFilter('all')}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                statusFilter === 'all'
                  ? 'bg-foreground text-background shadow-md'
                  : 'bg-muted/40 text-muted-foreground')}>
              All ({availableLots.length})
            </button>
            {(Object.entries(STATUS_CONFIG) as [LotStatus, typeof STATUS_CONFIG['available']][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                  statusFilter === key
                    ? `${cfg.bg} ${cfg.text} shadow-md ring-1 ring-current/20`
                    : 'bg-muted/40 text-muted-foreground')}>
                <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                {cfg.label} ({statusCounts[key]})
              </button>
            ))}
          </div>
        </div>

        {/* Navigation Mode */}
        <div className="px-4 mt-2 mb-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[
              { key: 'all', label: 'All Lots', icon: Package },
              { key: 'vehicle', label: 'By Vehicle', icon: Truck },
              { key: 'seller', label: 'By Seller', icon: User },
              { key: 'buyer', label: 'By Buyer', icon: Users },
              { key: 'lot_number', label: 'By Lot #', icon: Hash },
            ].map(m => (
              <button key={m.key} onClick={() => setLotNavMode(m.key as 'all' | 'vehicle' | 'seller' | 'buyer' | 'lot_number')}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                  lotNavMode === m.key
                    ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                    : 'bg-muted/40 text-muted-foreground')}>
                <m.icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lot List */}
        <div className="px-4 space-y-2">
          {lotsLoading ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <p className="text-sm text-muted-foreground font-medium">Loading lots…</p>
            </div>
          ) : selectorLots.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Gavel className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">{statusFilter === 'self_sale' ? 'No self-sale lots found' : 'No lots available'}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{statusFilter === 'self_sale' ? 'Self-sale lots will appear here after they are closed to the trader account.' : 'Register arrivals first to create lots'}</p>
              {statusFilter !== 'self_sale' && (
                <Button onClick={() => navigate('/arrivals')} className="mt-4 bg-gradient-to-r from-blue-500 to-violet-500 text-white rounded-xl">
                  Go to Arrivals
                </Button>
              )}
            </div>
          ) : filteredLots.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No results found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term or filter</p>
              <Button onClick={() => { setLotSearchQuery(''); setLotNumberSearch(''); setStatusFilter('all'); }} variant="outline" className="mt-4 rounded-xl">
                Clear Filters
              </Button>
            </div>
          ) : lotNavMode === 'vehicle' ? (
            Array.from(lotsByVehicle.entries())
              .sort(([a], [b]) => (a || '').localeCompare(b || ''))
              .map(([vehicle, lots]) => {
                const { sold, pending } = sumLotsPendingSold(lots);
                return (
                <div key={vehicle} className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-3 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/20 dark:to-violet-950/20 border-b border-border/30 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-foreground">{vehicle}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{sold} sold / {pending} pending</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {lots.map(lot => (
                      <LotRow key={getLotRenderKey(lot)} lot={lot} onSelect={selectLot} statusFilter={statusFilter} />
                    ))}
                  </div>
                </div>
              );
              })
          ) : lotNavMode === 'seller' ? (
            (() => {
              const entries = Array.from(lotsBySeller.entries());
              const toLabel = ([key, lots]: [string, LotInfo[]]) => {
                const first = lots[0];
                if (!first) return { key, lots, label: key, sortKey: key };
                const name = (first.seller_name || '').trim();
                const mark = (first.seller_mark || '').trim();
                const vehicle = (first.vehicle_number || '').trim();
                const label = [name, mark ? `(${mark})` : null, vehicle].filter(Boolean).join(' · ') || `Seller ${key}`;
                const sortKey = `${name.toLowerCase()}|${vehicle}`;
                return { key, lots, label, sortKey };
              };
              const sorted = entries.map(toLabel).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
              return sorted.map(({ key, lots, label }) => {
                const { sold, pending } = sumLotsPendingSold(lots);
                return (
                <div key={key} className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-3 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 border-b border-border/30 flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-bold text-foreground truncate min-w-0">{label}</span>
                    <span className="ml-auto text-xs text-muted-foreground flex-shrink-0 tabular-nums">{sold} sold / {pending} pending</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {lots.map(lot => (
                      <LotRow key={getLotRenderKey(lot)} lot={lot} onSelect={selectLot} statusFilter={statusFilter} />
                    ))}
                  </div>
                </div>
              );
              });
            })()
          ) : lotNavMode === 'buyer' && statusFilter !== 'self_sale' ? (
            (() => {
              const entries = Array.from(lotsByBuyer.entries());
              if (entries.length === 0) {
                return (
                  <div className="glass-card rounded-2xl p-8 text-center">
                    <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">No buyer-linked lots yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Lots appear here once buyers (registered or temporary) have bids on them.</p>
                  </div>
                );
              }
              const toLabel = ([groupKey, lots]: [string, LotInfo[]]) => {
                const first = lots[0];
                const pb = first?.participatingBuyers?.find(p => p.groupKey === groupKey);
                if (!pb) {
                  return { key: groupKey, lots, label: groupKey, sortKey: groupKey, registered: true };
                }
                const name = (pb.buyerName || '').trim();
                const mark = (pb.buyerMark || '').trim();
                const label = [name, mark ? `(${mark})` : null].filter(Boolean).join(' ') || groupKey;
                const sortKey = `${pb.registered ? '0' : '1'}|${name.toLowerCase()}|${mark.toLowerCase()}`;
                return { key: groupKey, lots, label, sortKey, registered: pb.registered };
              };
              const sorted = entries.map(toLabel).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
              return sorted.map(({ key, lots, label, registered }) => {
                const { sold, pending } = sumLotsPendingSold(lots);
                return (
                <div key={key} className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-3 bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/20 dark:to-fuchsia-950/20 border-b border-border/30 flex items-center gap-2">
                    <Users className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                    <span className="text-sm font-bold text-foreground truncate min-w-0">{label}</span>
                    {!registered && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-700 dark:text-violet-300 flex-shrink-0">
                        Temp
                      </span>
                    )}
                    {registered && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                        Registered
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground flex-shrink-0 tabular-nums">{sold} sold / {pending} pending</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {lots.map(lot => (
                      <LotRow key={getLotRenderKey(lot)} lot={lot} onSelect={selectLot} statusFilter={statusFilter} />
                    ))}
                  </div>
                </div>
              );
              });
            })()
          ) : (
            filteredLots.map(lot => (
              <LotRow key={getLotRenderKey(lot)} lot={lot} onSelect={selectLot} statusFilter={statusFilter} />
            ))
          )}
        </div>
        {isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ SALES PAD (AUCTION) SCREEN ═══
  return (
    <div className={cn(
      "min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 lg:pb-6",
      isDesktop ? "pb-28" : "pb-[42rem] md:pb-[48rem]"
    )}>
      {/* Mobile Header — tap empty area to collapse hero and free space for auction grid */}
      {!isDesktop && (
        mobileAuctionHeroCollapsed ? (
          <>
            <div className="fixed inset-x-0 top-0 z-[45] flex w-full items-center gap-1.5 border-b border-white/20 bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 shadow-[0_6px_16px_-8px_rgba(59,130,246,0.55)]">
              <button
                type="button"
                data-auction-hero-interactive
                onClick={(e) => {
                  e.stopPropagation();
                  hapticSelection();
                  goBackToSelector();
                }}
                aria-label="Back to lot list"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur active:bg-white/30"
              >
                <ArrowLeft className="h-4 w-4 text-white" strokeWidth={2.5} />
              </button>

              <div
                className="flex min-h-[2.25rem] min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="region"
                aria-label="Lot summary"
              >
                {selectedLot ? (
                  <p
                    className="whitespace-nowrap pr-1 text-left font-semibold leading-snug tracking-tight text-white"
                    style={{ fontSize: `${Math.round(12 * touchLayout.textScale)}px` }}
                  >
                    {(isSelfSaleReauction ? (trader?.business_name || 'Trader') : selectedLot.seller_name) || '—'}
                    <span className="mx-1 text-white/45 md:mx-1.5">|</span>
                    {selectedLot.vehicle_number?.trim() || '—'}
                    <span className="mx-1 text-white/45 md:mx-1.5">|</span>
                    {formatLotDisplayName(selectedLot)}
                    <span className="mx-1 text-white/45 md:mx-1.5">|</span>
                    <span className="tabular-nums">{totalSold}/{remaining}</span>
                  </p>
                ) : (
                  <span className="truncate text-sm font-bold text-white">Sales Pad</span>
                )}
              </div>

              <button
                type="button"
                data-auction-hero-interactive
                onClick={(e) => {
                  e.stopPropagation();
                  hapticSelection();
                  setTouchLayoutSheetOpen(true);
                }}
                aria-label="Sales Pad layout settings"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur active:bg-white/30"
              >
                <Settings2 className="h-4 w-4 text-white" strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setMobileAuctionHeroCollapsed(false);
                }}
                className="flex h-9 shrink-0 items-center gap-0.5 self-center rounded-full bg-white/20 px-2 text-[9px] font-semibold uppercase tracking-wide text-white active:bg-white/30 sm:px-2.5 sm:text-[10px]"
                aria-expanded={false}
                aria-label="Expand Sales Pad header"
              >
                <ChevronDown className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" strokeWidth={2.5} />
                <span>Expand</span>
              </button>
            </div>
            {/* Reserve layout height so scrollable content does not sit under fixed collapsed hero */}
            <div
              aria-hidden
              className="shrink-0 pointer-events-none"
              style={{ height: auctionCollapsedBarHeight }}
            />
          </>
        ) : (
          <div
            ref={expandedHeroMeasureRef}
            className={cn(
              'sticky top-0 z-[38] cursor-pointer shrink-0 bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 relative overflow-hidden shadow-[0_8px_24px_-12px_rgba(59,130,246,0.35)]',
              mobileTouchHero.expandedClass
            )}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('[data-auction-hero-interactive]')) return;
              hapticSelection();
              setMobileAuctionHeroCollapsed(true);
            }}
          >
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
              <div className={cn('flex items-center', mobileTouchHero.titleRow)}>
                <button
                  type="button"
                  data-auction-hero-interactive
                  onClick={(e) => { e.stopPropagation(); goBackToSelector(); }}
                  aria-label="Go back"
                  className={cn(
                    mobileTouchHero.backBtn,
                    'rounded-full bg-white/20 backdrop-blur flex items-center justify-center shrink-0'
                  )}
                >
                  <ArrowLeft className={cn(mobileTouchHero.backIcon, 'text-white')} />
                </button>
                <div className="flex-1 min-w-0 pointer-events-none">
                  <h1
                    className="font-bold text-white flex items-center gap-2"
                    style={{ fontSize: `${heroTitleFontRem}rem` }}
                  >
                    <span
                      className={cn(
                        mobileTouchHero.gavelBox,
                        'rounded-xl bg-white/10 flex items-center justify-center shrink-0'
                      )}
                    >
                      <Gavel className={cn(mobileTouchHero.gavelIcon, 'shrink-0 text-white')} />
                    </span>
                    Sales Pad
                  </h1>
                  <p
                    className={cn(mobileTouchHero.subtitleClass)}
                    style={{ fontSize: `${heroSubtitleFontRem}rem` }}
                  >
                    Live auction operations
                  </p>
                </div>
                {/* Lot navigation, layout settings & list toggle */}
                <div className="flex items-center gap-1 shrink-0" data-auction-hero-interactive onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection();
                      setTouchLayoutSheetOpen(true);
                    }}
                    aria-label="Sales Pad layout settings"
                    className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"
                  >
                    <Settings2 className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </button>
                  <button type="button" onClick={() => navigateToLot('prev')} disabled={!canGoPrev}
                    aria-label="Previous lot" className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-all",
                      canGoPrev ? 'bg-white/20 backdrop-blur' : 'bg-white/10 opacity-40')}>
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button type="button" onClick={() => setShowLotList(!showLotList)}
                    aria-label="Lot list" className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <List className="w-4 h-4 text-white" />
                  </button>
                  <button type="button" onClick={() => navigateToLot('next')} disabled={!canGoNext}
                    aria-label="Next lot" className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-all",
                      canGoNext ? 'bg-white/20 backdrop-blur' : 'bg-white/10 opacity-40')}>
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Lot Info Strip */}
              {selectedLot && (
                <div className={mobileTouchHero.stripGrid}>
                  {(
                    isSelfSaleReauction
                      ? [
                        { icon: User, label: 'Trader', value: trader?.business_name || 'Trader' },
                        { icon: Package, label: 'Lot', value: formatLotDisplayName(selectedLot) },
                        { icon: ShoppingCart, label: 'Remaining', value: `${remaining}/${selectedLot.bag_count}${selectedLot.was_modified ? '*' : ''}` },
                        { icon: Gavel, label: 'Prev Bids', value: String(previousSelfSaleEntries.length) },
                      ]
                      : [
                        { icon: User, label: 'Seller', value: selectedLot.seller_name },
                        { icon: Truck, label: 'Vehicle', value: selectedLot.vehicle_number },
                        { icon: Package, label: 'Lot', value: formatLotDisplayName(selectedLot) },
                        { icon: ShoppingCart, label: 'Bags', value: `${remaining}/${selectedLot.bag_count}${selectedLot.was_modified ? '*' : ''}` },
                      ]
                  ).map((item) => (
                    <div key={item.label} className={mobileTouchHero.stripCard}>
                      <item.icon className={mobileTouchHero.stripIcon} />
                      <p className={mobileTouchHero.stripLabel}>{item.label}</p>
                      <p className={mobileTouchHero.stripValue}>{item.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Lot position indicator */}
              {selectedLot && (
                <div className={mobileTouchHero.lotMeta}>
                  <span className={mobileTouchHero.lotIndex}>
                    Lot {currentLotIndex + 1} of {navigationLots.length}
                  </span>
                  <span className={cn('flex items-center gap-1', mobileTouchHero.hint)}>
                    <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Tap to enlarge grid
                  </span>
                </div>
              )}
              {!selectedLot && (
                <div className={cn(mobileTouchHero.lotMeta, 'flex justify-center')}>
                  <span className={cn('flex items-center gap-1', mobileTouchHero.hint)}>
                    <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Tap to enlarge grid
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Desktop Toolbar */}
      {isDesktop && (
        <div className="px-8 py-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Gavel className="w-5 h-5 text-blue-500" /> Sales Pad — Live Auction
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedLot ? formatLotDisplayName(selectedLot) : 'No lot selected'}
                {selectedLot && <span className="ml-2 text-primary font-medium">({currentLotIndex + 1}/{navigationLots.length})</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => navigateToLot('prev')} disabled={!canGoPrev}
                variant="outline" size="icon" className="rounded-xl h-10 w-10">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button onClick={() => setShowLotList(!showLotList)}
                variant={showLotList ? 'default' : 'outline'} size="icon" className="rounded-xl h-10 w-10">
                <List className="w-4 h-4" />
              </Button>
              <Button onClick={() => navigateToLot('next')} disabled={!canGoNext}
                variant="outline" size="icon" className="rounded-xl h-10 w-10">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button onClick={goBackToSelector}
                variant="outline" className="rounded-xl ml-2">
                ← Change Lot
              </Button>
            </div>
          </div>
          {selectedLot && (
            <div className="grid grid-cols-5 gap-4">
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-blue-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{isSelfSaleReauction ? 'Trader' : 'Seller'}</p>
                <p className="text-sm font-bold text-foreground truncate">{isSelfSaleReauction ? (trader?.business_name || 'Trader') : selectedLot.seller_name}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-violet-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{isSelfSaleReauction ? 'Prev Bids' : 'Vehicle'}</p>
                <p className="text-sm font-bold text-foreground">{isSelfSaleReauction ? previousSelfSaleEntries.length : selectedLot.vehicle_number}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-emerald-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Remaining</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{remaining}<span className="text-xs font-normal ml-1">bags</span></p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-amber-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{isSelfSaleReauction ? 'Self-Sale Rate' : 'Highest Bid'}</p>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400">₹{isSelfSaleReauction ? Number(selfSaleContext?.rate ?? 0) : highestBid}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-rose-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{isSelfSaleReauction ? 'Self-Sale Qty' : 'Entries'}</p>
                <p className="text-2xl font-black text-foreground">{isSelfSaleReauction ? (selfSaleContext?.quantity ?? 0) : entries.length}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedLot && isSelfSaleReauction && selfSaleContext && (
        <div className={cn(isDesktop ? "px-8 pb-2" : "px-4 mt-3")}>
          <div className="glass-card rounded-2xl p-4 border border-fuchsia-500/20 bg-fuchsia-500/5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">Self-Sale History</p>
                <p className="text-sm text-muted-foreground">
                  Closed at ₹{Number(selfSaleContext.rate ?? 0).toLocaleString()} for {selfSaleContext.quantity ?? 0} bags
                  {selfSaleContext.created_at ? ` · ${new Date(selfSaleContext.created_at).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                Remaining: <span className="text-foreground">{selfSaleContext.remaining_qty ?? 0}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 px-3 py-2 bg-muted/40 text-[10px] uppercase font-semibold text-muted-foreground">
                <span>Buyer</span>
                <span>Mark</span>
                <span>Rate</span>
                <span>Qty</span>
              </div>
              {previousSelfSaleEntries.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">No previous auction entries were found for this self-sale lot.</div>
              ) : (
                previousSelfSaleEntries.map((entry) => (
                  <div key={`${entry.bidNumber}-${entry.buyerMark}`} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 px-3 py-2 border-t border-border/30 text-sm">
                    <span className="truncate text-foreground">{entry.buyerName || 'Buyer'}</span>
                    <span className="truncate text-muted-foreground">{entry.buyerMark}</span>
                    <span className="font-medium text-foreground">₹{entry.rate}</span>
                    <span className="font-medium text-foreground">{entry.quantity}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ LOT LIST OVERLAY ═══ */}
      <AnimatePresence>
        {showLotList && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="px-4 mb-3 overflow-hidden">
            <div className="glass-card rounded-2xl p-3 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Quick Lot Navigation</p>
                <div className="relative w-40">
                  <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input placeholder="Lot # or AB-200/SA-122/SA1/22" value={lotNumberSearch} onChange={e => setLotNumberSearch(e.target.value)}
                    className="w-full h-7 pl-7 pr-2 rounded-lg bg-muted/50 text-foreground text-xs border border-border focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="space-y-1">
                {(lotNumberSearch
                  ? navigationLots.filter(l =>
                    l.lot_name.toLowerCase().includes(lotNumberSearch.toLowerCase()) ||
                    l.lot_id.toLowerCase().includes(lotNumberSearch.toLowerCase()) ||
                    formatLotDisplayName(l).toLowerCase().includes(lotNumberSearch.toLowerCase())
                  )
                  : navigationLots
                ).map(lot => {
                  const status = getRowLotStatus(lot, statusFilter);
                  const cfg = STATUS_CONFIG[status];
                  const isActive = selectedLotSource === 'self_sale'
                    ? selectedLot?.selfSaleUnitId === lot.selfSaleUnitId
                    : selectedLot?.lot_id === lot.lot_id;
                  return (
                    <button key={getLotRenderKey(lot)} onClick={() => selectLot(lot)}
                      className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-all",
                        isActive ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/50')}>
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", cfg.dot)} />
                      <span className={cn("font-semibold truncate flex-1", isActive ? 'text-primary' : 'text-foreground')}>{formatLotDisplayName(lot)}</span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", cfg.bg, cfg.text)}>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn('flex flex-col h-auto min-h-0', isDesktop ? 'mt-4 gap-3 px-4' : 'mt-3 gap-2 px-0')}>
        {/* REQ-AUC-003: Preset margin (preset labels A/B/C; green = profit, red = negative). Toggle to show/hide. */}
        {isDesktop && canUsePreset && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preset Margin</p>
              <PresetMarginSwitch
                checked={showPresetMargin}
                onCheckedChange={handleShowPresetMarginChange}
                aria-label="Show preset margin on bids"
              />
            </div>

            {showPresetMargin && (
              <div className="flex flex-col gap-2">
                {presetOptions.length > 0 ? (
                  <div className="flex items-center gap-2">
                    {presetOptions.map((opt) => (
                      <button
                        key={opt.label + String(opt.value)}
                        type="button"
                        onClick={() => applyPreset(opt.value)}
                        className={cn(
                          'flex-1 py-2 rounded-xl text-sm font-bold transition-all',
                          preset === opt.value
                            ? opt.value >= 0
                              ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-md shadow-emerald-500/20'
                              : 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-md shadow-red-500/20'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted/60',
                          preset !== opt.value && opt.value >= 0 && 'text-success',
                          preset !== opt.value && opt.value < 0 && 'text-destructive'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-2">
                    Preset is not configured yet. Please set preset values in Preset Settings.
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Entry Form — buyer select/search + bid entry (desktop only) */}
        {isDesktop && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-2xl p-3 space-y-3">
            <div className={cn('grid gap-3', isDesktop ? 'grid-cols-[minmax(0,1fr)_280px]' : 'grid-cols-1')}>
              <div className="space-y-2 min-w-0">
                {isDesktop ? (
                  <div className="space-y-2 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Scribble pad
                    </p>
                    <InlineScribblePad
                      appendMode
                      onMarkDetected={handleScribbleSegmentDetected}
                      canvasHeight={280}
                      resetTrigger={scribblePadResetTrigger}
                    />
                    <Input
                      ref={markInputRef}
                      data-skip-route-autofocus={preferRateForFirstBidFormFocus ? 'true' : undefined}
                      type="text"
                      value={scribbleMark}
                      readOnly={!!editingBidId}
                      onMouseDown={() => { manualMarkSelectionRef.current = true; }}
                      onTouchStart={() => { manualMarkSelectionRef.current = true; }}
                      onChange={(e) => {
                        if (editingBidId) return;
                        lastScribbleSegmentRef.current = '';
                        const v = e.target.value.toUpperCase().slice(0, MAX_MARK_LEN);
                        setScribbleMark(v);
                        const rawPos = e.target.selectionStart ?? v.length;
                        const clampedPos = clampInsideClosingParen(v, rawPos);
                        markInsertPosRef.current = clampedPos;
                        pendingMarkCaretPosRef.current = clampedPos;
                        setSelectedBuyer(null);
                      }}
                      onSelect={(e) => {
                        const rawPos = e.currentTarget.selectionStart ?? scribbleMark.length;
                        const allowManualExit = manualMarkSelectionRef.current;
                        manualMarkSelectionRef.current = false;
                        const clampedPos = clampInsideClosingParen(scribbleMark, rawPos, allowManualExit);
                        markInsertPosRef.current = clampedPos;
                        pendingMarkCaretPosRef.current = clampedPos !== rawPos ? clampedPos : null;
                      }}
                      onFocus={() => setActiveNumpadField('mark')}
                      placeholder="Or type mark / name to search…"
                      className="h-11 rounded-xl text-sm sm:text-base font-medium bg-muted/20 border-violet-400/20"
                    />
                  </div>
                ) : null}
                {/* Two rows always visible. Scroll: touch (smooth left/right), mouse-drag, arrow keys. */}
                {isDesktop && (
                  <div className="space-y-3 min-w-0">
                    {/* Row 1: Registered buyers — contacts — green. */}
                    <div className="min-w-0 w-full max-w-full space-y-1.5">
                      <div
                        ref={contactScrollRef}
                        role="region"
                        aria-label="Registered buyers"
                        tabIndex={0}
                        {...makeScrollHandlers(contactScrollRef, didDragContactRef)}
                        className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden flex flex-nowrap gap-2.5 py-1.5 -mx-1 px-0.5 scroll-smooth touch-[pan-x_pan-y] lg:touch-auto select-none cursor-grab active:cursor-grabbing overscroll-x-contain"
                        style={{
                          scrollbarWidth: 'thin',
                          WebkitOverflowScrolling: 'touch',
                          overscrollBehaviorX: 'contain',
                        }}
                      >
                        {filteredContacts.length > 0 ? (
                          filteredContacts.slice(0, 50).map((b) => (
                            <button
                              key={b.contact_id}
                              type="button"
                              disabled={!!editingBidId}
                              onClick={(e) => {
                                if (didDragContactRef.current) {
                                  e.preventDefault();
                                  return;
                                }
                                hapticSelection();
                                hideNativeKeyboard();
                                setSelectedBuyer(b);
                                setContactLastUsedMs((p) => ({ ...p, [String(b.contact_id)]: Date.now() }));
                                lastScribbleSegmentRef.current = '';
                                setScribbleMark((b.mark || b.name.charAt(0) || '').toString());
                                setScribblePadResetTrigger((t) => t + 1);
                              }}
                              className={cn(
                                'flex-shrink-0 px-3 py-2.5 rounded-xl text-left transition-all border border-l-4 border-l-emerald-500 flex items-center gap-1.5 min-h-[44px]',
                                selectedBuyer?.contact_id === b.contact_id
                                  ? 'bg-primary text-primary-foreground border-primary shadow-md border-l-primary'
                                  : 'bg-muted/40 border-border/50 hover:bg-muted/60'
                              )}
                            >
                              <span className="text-sm sm:text-base font-semibold truncate max-w-[100px] sm:max-w-[120px]">{b.name}</span>
                              {b.mark && <span className="text-xs opacity-90 flex-shrink-0">({b.mark})</span>}
                            </button>
                          ))
                        ) : (
                          <div className="flex-shrink-0 px-4 py-2.5 rounded-xl border border-l-4 border-l-emerald-500 border-dashed bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                            No matching contact
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Temporary buyers (scribble / quick-add), today — violet accent. */}
                    <div className="min-w-0 w-full max-w-full space-y-1.5">
                      <div
                        ref={markScrollRef}
                        role="region"
                        aria-label="Temporary buyers"
                        tabIndex={0}
                        {...makeScrollHandlers(markScrollRef, didDragMarkRef)}
                        className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden flex flex-nowrap gap-2.5 py-1.5 -mx-1 px-0.5 scroll-smooth touch-[pan-x_pan-y] lg:touch-auto select-none cursor-grab active:cursor-grabbing overscroll-x-contain"
                        style={{
                          scrollbarWidth: 'thin',
                          WebkitOverflowScrolling: 'touch',
                          overscrollBehaviorX: 'contain',
                        }}
                      >
                        {filteredTemporaryMarks.length > 0 ? (
                          filteredTemporaryMarks.slice(0, 50).map((mark) => {
                            const isSelected = !selectedBuyer && scribbleMark === mark;
                            return (
                              <button
                                key={mark}
                                type="button"
                                disabled={!!editingBidId}
                                onClick={(e) => {
                                  if (didDragMarkRef.current) {
                                    e.preventDefault();
                                    return;
                                  }
                                  hapticSelection();
                                  hideNativeKeyboard();
                                  setSelectedBuyer(null);
                                  setTempMarkLastUsedMs((p) => ({ ...p, [mark]: Date.now() }));
                                  lastScribbleSegmentRef.current = '';
                                  setScribbleMark(mark);
                                  setScribblePadResetTrigger((t) => t + 1);
                                }}
                                className={cn(
                                  'flex-shrink-0 px-3 py-2.5 rounded-xl text-left transition-all border border-l-4 border-l-violet-500 flex items-center min-h-[44px]',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground border-primary shadow-md border-l-primary'
                                    : 'bg-muted/40 border-border/50 hover:bg-muted/60'
                                )}
                              >
                                <span className="text-sm sm:text-base font-semibold truncate max-w-[100px]">{mark}</span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="flex-shrink-0 px-4 py-2.5 rounded-xl border border-l-4 border-l-violet-400 border-dashed bg-violet-500/5 text-violet-700 dark:text-violet-300 text-sm font-medium">
                            No temporary marks yet today
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {(scribbleMark || selectedBuyer) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedBuyer ? (
                      <>
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase">Buyer:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-sm font-bold border border-primary/30">
                          {selectedBuyer.name} {selectedBuyer.mark ? `(${selectedBuyer.mark})` : ''}
                        </span>
                        <button
                          type="button"
                          disabled={!!editingBidId}
                          onClick={() => { setSelectedBuyer(null); lastScribbleSegmentRef.current = ''; setScribbleMark(''); }}
                          className="text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase">Mark:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-bold shadow-sm">{scribbleMark}</span>
                        <button
                          type="button"
                          onClick={handleMarkBackspace}
                          disabled={!!editingBidId || !scribbleMark}
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-muted/70 text-foreground hover:bg-muted disabled:opacity-40 border border-border/60"
                          aria-label="Delete last character of mark"
                        >
                          Del
                        </button>
                        <button
                          type="button"
                          disabled={!!editingBidId}
                          onClick={() => { lastScribbleSegmentRef.current = ''; setScribbleMark(''); setScribblePadResetTrigger((t) => t + 1); }}
                          className="p-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Clear mark"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className={cn("space-y-2", !isDesktop && "hidden")}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5 block">Rate (₹)</label>
                    <Input
                      ref={rateInputRef}
                      type="number"
                      value={rate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRate(v);
                        if (v.trim() !== '') {
                          userClearedRateRef.current = false;
                        }
                        if (editingBidId) setEditBidDraft((d) => (d ? { ...d, rate: v } : d));
                      }}
                      onFocus={(e) => {
                        if (preferRateForFirstBidFormFocus) setPreferRateForFirstBidFormFocus(false);
                        setActiveNumpadField('rate');
                        if (isTouchLayout && !mobileKeyboardEnabled) {
                          e.currentTarget.blur();
                          hideNativeKeyboard();
                        }
                      }}
                      onBlur={() => { if (isTouchLayout) setMobileKeyboardEnabled(false); }}
                      readOnly={isTouchLayout && !mobileKeyboardEnabled}
                      inputMode={isTouchLayout && !mobileKeyboardEnabled ? 'none' : 'numeric'}
                      placeholder="0"
                      className={cn(
                        "h-11 rounded-xl text-center font-bold text-lg bg-muted/20 border-primary/20",
                        activeNumpadField === 'rate' && "ring-2 ring-primary border-primary/50"
                      )} />
                  </div>
                  <div>
                    <label className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5 block">Qty (Bags)</label>
                    <Input
                      ref={qtyInputRef}
                      type="number"
                      value={qty}
                      onChange={(e) => {
                        const v = e.target.value;
                        setQty(v);
                        if (editingBidId) setEditBidDraft((d) => (d ? { ...d, qty: v } : d));
                      }}
                      onFocus={(e) => {
                        setActiveNumpadField('qty');
                        if (isTouchLayout && !mobileKeyboardEnabled) {
                          e.currentTarget.blur();
                          hideNativeKeyboard();
                        }
                      }}
                      onBlur={() => { if (isTouchLayout) setMobileKeyboardEnabled(false); }}
                      readOnly={isTouchLayout && !mobileKeyboardEnabled}
                      inputMode={isTouchLayout && !mobileKeyboardEnabled ? 'none' : 'numeric'}
                      placeholder="0"
                      className={cn(
                        "h-11 rounded-xl text-center font-bold text-lg bg-muted/20 border-primary/20",
                        activeNumpadField === 'qty' && "ring-2 ring-primary border-primary/50"
                      )} />
                  </div>
                </div>
                {isDesktop && (
                  <div className="flex gap-2">
                    {editingBidId && editBidDraft ? (
                      <>
                        <Button
                          onClick={() => { if (editingEntry) void saveEditBid(editingEntry); }}
                          disabled={!editingEntry || !rate || !qty || parseInt(qty) <= 0 || parseInt(rate) <= 0}
                          className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold shadow-md shadow-violet-500/20"
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Update Bid
                        </Button>
                        <Button
                          onClick={cancelEditBid}
                          variant="outline"
                          className="h-11 rounded-xl px-4 border-border/50 text-foreground hover:bg-muted/40"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={handleUnifiedAdd}
                          disabled={(!scribbleMark.trim() && !selectedBuyer) || !rate || !qty || parseInt(qty) <= 0 || parseInt(rate) <= 0}
                          className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold shadow-md shadow-violet-500/20"
                        >
                          <Plus className="w-4 h-4 mr-1" /> Add Bid
                        </Button>
                        {!isSelfSaleReauction && (
                          <Button onClick={handleSelfSale} disabled={remaining <= 0}
                            variant="outline" className="h-11 rounded-xl px-4 border-amber-400/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
                            Self Sale
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Auction Grid — entries list */}
        <div
          ref={auctionGridSectionRef}
          className={cn(!isDesktop && 'w-full min-w-0')}
          style={
            !isDesktop
              ? {
                  position: 'sticky',
                  top: mobileAuctionHeroCollapsed
                    ? auctionCollapsedBarHeight
                    : `${expandedHeroHeightPx}px`,
                  zIndex: mobileAuctionHeroCollapsed ? 40 : 36,
                }
              : undefined
          }
        >
          {/* Mobile: no y-transform — transform ancestors break sticky thead inside scroll panel */}
          <motion.div
            initial={isDesktop ? { opacity: 0, y: 10 } : { opacity: 0 }}
            animate={isDesktop ? { opacity: 1, y: 0 } : { opacity: 1 }}
            transition={{ delay: isDesktop ? 0.2 : 0.1 }}
            className="w-full min-w-0"
          >
          {isDesktop && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Auction Grid · {entries.length} entries
            </p>
          )}

          {entries.length === 0 ? (
            <div className={cn('glass-card rounded-2xl text-center', isDesktop ? 'p-8' : 'p-4')}>
              <Gavel className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className={cn('text-muted-foreground', isDesktop ? 'text-sm' : 'text-base')}>No bids yet. Start the auction!</p>
            </div>
          ) : (
            <div
              className={cn(
                'glass-card rounded-2xl h-auto min-h-0',
                /* Mobile: overflow-visible so sticky thead inside inner scrollport is not trapped by glass-card overflow:hidden */
                isDesktop ? 'overflow-hidden' : '!py-0 !px-1 rounded-xl sm:rounded-2xl !overflow-visible'
              )}
            >
              <AuctionsGridScrollPanel
                scrollPageIntoViewOnAutoScroll={isDesktop}
                className={cn(
                  isDesktop
                    ? entries.length > 5
                      ? 'max-h-[min(60vh,28rem)] lg:max-h-[min(55vh,26rem)]'
                      : 'max-h-[min(65vh,32rem)] lg:max-h-[min(60vh,30rem)]'
                    : cn('scroll-pt-[3.25rem]', '!pb-[max(14rem,36svh)]')
                )}
                style={!isDesktop && auctionGridMobileMaxHeight ? { maxHeight: auctionGridMobileMaxHeight } : undefined}
                contentLayoutKey={entries.length}
                autoScrollToBottomKey={autoScrollKey}
                gridSectionRef={auctionGridSectionRef}
              >
                <table
                  className={cn(
                    'w-[42rem] md:w-full table-fixed border-collapse',
                    isDesktop ? 'text-sm sm:text-base' : 'text-base sm:text-lg',
                    showPresetMargin ? (isDesktop ? 'min-w-[480px]' : '') : isDesktop ? 'min-w-[420px]' : ''
                  )}
                  style={
                    !isDesktop
                      ? {
                          minWidth: Math.max(
                            touchLayout.gridMinWidthPx,
                            showPresetMargin ? 440 : 400
                          ),
                          fontSize: `${0.875 * touchLayout.textScale}rem`,
                        }
                      : showPresetMargin
                        ? { minWidth: 480 }
                        : { minWidth: 420 }
                  }
                >
                  <thead
                    className={cn(
                      'sticky top-0',
                      isDesktop ? 'z-[3]' : 'z-[42]'
                    )}
                  >
                    <tr className="bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] border-b border-white/25 shadow-[0_8px_20px_-12px_rgba(91,140,255,0.85)] transition-shadow hover:shadow-[0_14px_30px_-12px_rgba(123,97,255,0.9)]">
                      <th
                        className={cn(
                          'border-r border-white/25 text-white uppercase tracking-wider last:border-r-0',
                          isDesktop
                            ? 'px-3 py-[14px] text-left text-xs font-semibold'
                            : 'px-1 py-1.5 text-left text-[1.07em] font-bold'
                        )}
                      >
                        Mark / Buyer
                      </th>
                      <th
                        className={cn(
                          'border-r border-white/25 text-white uppercase tracking-wider last:border-r-0',
                          isDesktop
                            ? 'px-3 py-[14px] text-center text-xs font-semibold'
                            : 'px-1 py-1.5 text-center text-[1.07em] font-bold'
                        )}
                      >
                        Rate
                      </th>
                      {showPresetMargin && (
                        <th
                          className={cn(
                            'border-r border-white/25 text-white uppercase tracking-wider last:border-r-0',
                            isDesktop
                              ? 'px-3 py-[14px] text-center text-xs font-semibold'
                              : 'px-1 py-1.5 text-center text-[1.07em] font-bold'
                          )}
                        >
                          Preset
                        </th>
                      )}
                      <th
                        className={cn(
                          'border-r border-white/25 text-white uppercase tracking-wider last:border-r-0',
                          isDesktop
                            ? 'px-3 py-[14px] text-center text-xs font-semibold'
                            : 'px-1 py-1.5 text-center text-[1.07em] font-bold'
                        )}
                      >
                        Qty
                      </th>
                      <th
                        className={cn(
                          'text-white uppercase tracking-wider last:border-r-0',
                          isDesktop
                            ? 'px-3 py-[14px] text-right text-xs font-semibold'
                            : 'px-1 py-1.5 text-center text-[1.07em] font-bold'
                        )}
                      >
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => (
                      <Fragment key={entry.id}>
                        <motion.tr
                          data-auction-entry-row="true"
                          data-bid-number={entry.bidNumber}
                          initial={{ opacity: 0, x: -15 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          onClick={() => {
                            if (!isDesktop && can('Auctions / Sales', 'Edit') && !editingBidId) {
                              startEditBid(entry);
                            }
                          }}
                          className={cn(
                            "border-b border-border/30 hover:bg-muted/20 transition-colors",
                            !isDesktop && "scroll-mt-[3.25rem]",
                            !isDesktop && can('Auctions / Sales', 'Edit') && !editingBidId && "cursor-pointer",
                            entry.isSelfSale && "border-l-4 border-l-amber-500",
                            entry.isScribble && "border-l-4 border-l-violet-500",
                            editingBidId === entry.id && "bg-primary/5 ring-1 ring-inset ring-primary/35"
                          )}
                        >
                          <td className={cn('px-3 py-[12px]', isDesktop ? '' : 'px-1 py-1.5')}>
                            <div className={cn('flex items-center flex-wrap', isDesktop ? 'gap-1.5' : 'gap-1')}>
                              <span
                                className={cn(
                                  'font-medium text-foreground truncate max-w-[120px]',
                                  isDesktop ? 'text-base' : 'text-[1.15em]'
                                )}
                                title={entry.buyerName}
                              >
                                {normalizeScribbleBuyerName(entry.buyerName, entry.isScribble)}
                              </span>
                              {entry.isSelfSale && (
                                <span
                                  className={cn(
                                    'px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold',
                                    isDesktop ? 'text-[8px]' : 'text-[12px]'
                                  )}
                                >
                                  SELF
                                </span>
                              )}
                              {editingBidId === entry.id && (
                                <span
                                  className={cn('px-1 py-0.5 rounded bg-primary/20 text-primary font-bold', isDesktop ? 'text-[8px]' : 'text-[12px]')}
                                >
                                  EDITING
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            className={cn(
                              'align-middle text-center font-semibold text-foreground',
                              isDesktop ? 'px-3 py-[12px] text-base' : 'px-1 py-1.5 text-[1.15em] font-bold'
                            )}
                          >
                            <div>₹{entry.rate}</div>
                          </td>
                          {showPresetMargin && (
                            <td
                              className={cn(
                                'align-middle text-center font-medium tabular-nums',
                                isDesktop ? 'px-3 py-[12px] text-base' : 'px-1 py-1.5 text-[1.15em] font-bold',
                                entry.presetApplied > 0 && 'text-success',
                                entry.presetApplied < 0 && 'text-destructive'
                              )}
                            >
                              {formatPresetMarginCell(entry.presetApplied)}
                            </td>
                          )}
                          <td
                            className={cn(
                              'align-middle text-center text-muted-foreground',
                              isDesktop ? 'px-3 py-[12px] text-base' : 'px-1 py-1.5 text-[1.15em] font-bold'
                            )}
                          >
                            {entry.quantity}
                          </td>
                          <td className={cn(isDesktop ? 'px-3 py-[12px] text-right' : 'px-1 py-1.5 text-center')}>
                            <div
                              className={cn(
                                'flex items-center',
                                isDesktop ? 'justify-end gap-1.5' : 'justify-center gap-1'
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                disabled={!!editingBidId}
                                onClick={() => setShowTokenInput(showTokenInput === entry.id ? null : entry.id)}
                                className={cn(
                                  'rounded-md transition-colors disabled:opacity-40',
                                  isDesktop ? 'p-1.5' : 'p-2.5',
                                  entry.tokenAdvance > 0 ? 'bg-success/15 text-success' : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                                )}
                                title="Token advance"
                              >
                                <Banknote className={cn(isDesktop ? 'h-4 w-4' : 'h-[22px] w-[22px]')} />
                              </button>
                              {isDesktop && (
                                <button
                                  onClick={() => setPendingDeleteBid({ id: entry.id, label: `${entry.buyerName} (${entry.buyerMark})` })}
                                  type="button"
                                  disabled={!!editingBidId}
                                  className={cn(
                                    'rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40',
                                    'p-1.5'
                                  )}
                                  title="Delete bid"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                              {isDesktop && can('Auctions / Sales', 'Edit') && (
                                <button
                                  type="button"
                                  disabled={!!editingBidId}
                                  onClick={() => startEditBid(entry)}
                                  className="p-1.5 rounded-md bg-muted/60 text-foreground hover:bg-muted disabled:opacity-40"
                                  title="Edit bid"
                                >
                                  <Pencil className={cn(isDesktop ? "w-4 h-4" : "w-3.5 h-3.5")} />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                        <AnimatePresence>
                          {showTokenInput === entry.id && !editingBidId && (
                            <motion.tr
                              data-auction-token-panel={entry.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="border-b border-border/30 bg-muted/10"
                            >
                              <td colSpan={showPresetMargin ? 5 : 4} className={cn('px-3 py-[12px]', isDesktop ? '' : 'px-1 py-1.5')}>
                                <div className={cn('flex min-w-0 items-center', isDesktop ? 'gap-2' : 'w-full gap-1.5')}>
                                  <span
                                    className={cn(
                                      'shrink-0 text-muted-foreground whitespace-nowrap',
                                      isDesktop ? 'text-[10px]' : 'text-sm'
                                    )}
                                  >
                                    Token ₹
                                  </span>
                                  <Input
                                    type="number"
                                    defaultValue={entry.tokenAdvance || ""}
                                    placeholder="0"
                                    className={cn(
                                      'text-center',
                                      isDesktop
                                        ? 'h-8 flex-1 rounded-lg text-xs'
                                        : 'h-11 min-h-11 w-full min-w-0 flex-1 rounded-md border-2 border-input px-2 py-0 text-sm leading-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0'
                                    )}
                                    onBlur={e => setTokenAdvanceAmount(entry.id, parseInt(e.target.value) || 0)}
                                    onKeyDown={e => { if (e.key === "Enter") setTokenAdvanceAmount(entry.id, parseInt((e.target as HTMLInputElement).value) || 0); }}
                                  />
                                  {entry.tokenAdvance > 0 && (
                                    <span className={cn('shrink-0 text-success font-semibold', isDesktop ? 'text-[10px]' : 'text-sm')}>
                                      ✓ ₹{entry.tokenAdvance}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {/* Extra vertical slack so last tbody rows can scroll fully below sticky thead (not visually under gradient header). */}
                {!isDesktop && <div className="pointer-events-none h-16 shrink-0 md:h-0" aria-hidden />}
              </AuctionsGridScrollPanel>
            </div>
          )}
          </motion.div>
        </div>

        {/* Remaining indicator (desktop only; mobile/tablet use lot header strip for bags) */}
        {entries.length > 0 && selectedLot && isDesktop && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-2xl p-3">
            <div className={cn("flex items-center justify-between mb-2", isDesktop ? "text-sm" : "text-base")}>
              <span className="text-muted-foreground">Sold</span>
              <span className="font-bold text-foreground">
                {totalSold} / {selectedLot.bag_count}{selectedLot.was_modified ? '*' : ''} bags
              </span>
            </div>
            <div className="w-full h-2.5 bg-muted/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (totalSold / selectedLot.bag_count) * 100)}%` }}
                className={cn('h-full rounded-full', totalSold >= selectedLot.bag_count ? 'bg-success' : 'bg-gradient-to-r from-primary to-accent')}
              />
            </div>
            {remaining > 0 && (
              <>
                <p className={cn("text-muted-foreground mt-1", isDesktop ? "text-[10px]" : "text-xs")}>
                  {remaining} bags remaining
                </p>
                {isDesktop && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <Button
                      disabled={completeLoading}
                      onClick={handleSaveAndCompleteAuction}
                      className="h-10 flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-sm shadow-md">
                      {completeLoading ? 'Completing…' : `✓ Save & Complete (${remaining} unsold)`}
                    </Button>
                    <Button
                      type="button"
                      disabled={completeLoading}
                      onClick={handleCompleteAndPrint}
                      variant="outline"
                      className="h-10 flex-1 rounded-xl border-primary/35 font-bold text-sm shadow-sm hover:bg-primary/5">
                      <Printer className="w-4 h-4 shrink-0 sm:mr-1.5" />
                      Print
                    </Button>
                  </div>
                )}
              </>
            )}
            {remaining <= 0 && (
              <>
                <p className={cn("text-success font-semibold mt-1", isDesktop ? "text-[10px]" : "text-xs")}>
                  ✓ All bags sold!
                </p>
                {isDesktop && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <Button
                      disabled={completeLoading}
                      onClick={handleSaveAndCompleteAuction}
                      className="h-10 flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-sm shadow-md">
                      {completeLoading ? 'Completing…' : '✓ Save & Complete Auction'}
                    </Button>
                    <Button
                      type="button"
                      disabled={completeLoading}
                      onClick={handleCompleteAndPrint}
                      variant="outline"
                      className="h-10 flex-1 rounded-xl border-primary/35 font-bold text-sm shadow-sm hover:bg-primary/5">
                      <Printer className="w-4 h-4 shrink-0 sm:mr-1.5" />
                      Print
                    </Button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* Preset margin for mobile: now in fixed dock below rate/qty. */}
      </div>

      {/* Mobile/Tablet Dock: compact layout, preset below rate/qty. */}
      {!isDesktop && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur-xl px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-2"
          style={{ fontSize: `${14 * touchLayout.textScale}px` }}
        >
          <div className="space-y-1 mb-1">
            <div>
              <div
                ref={contactScrollRef}
                role="region"
                aria-label="Registered buyers"
                tabIndex={0}
                {...makeScrollHandlers(contactScrollRef, didDragContactRef)}
                className="flex w-full gap-1.5 overflow-x-auto overflow-y-hidden px-0 py-0 scroll-smooth touch-[pan-x_pan-y] lg:touch-auto select-none cursor-grab active:cursor-grabbing overscroll-x-contain"
                style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
              >
                {filteredContacts.length > 0 ? (
                  filteredContacts.slice(0, 50).map((b) => (
                    <button
                      key={b.contact_id}
                      type="button"
                      disabled={!!editingBidId}
                      onClick={(e) => {
                        if (didDragContactRef.current) { e.preventDefault(); return; }
                        hapticSelection();
                        hideNativeKeyboard();
                        setSelectedBuyer(b);
                        setContactLastUsedMs((p) => ({ ...p, [String(b.contact_id)]: Date.now() }));
                        lastScribbleSegmentRef.current = '';
                        setScribbleMark((b.mark || b.name.charAt(0) || '').toString());
                        setScribblePadResetTrigger((t) => t + 1);
                      }}
                        className={cn(
                        'flex-shrink-0 px-3 py-1.5 rounded-md text-left transition-all border border-l-4 border-l-emerald-500 flex items-center gap-1 min-h-[40px]',
                        selectedBuyer?.contact_id === b.contact_id
                          ? 'bg-primary text-primary-foreground border-primary shadow-md border-l-primary'
                          : 'bg-muted/40 border-border/50 hover:bg-muted/60'
                      )}
                    >
                      <span className="text-[1.07em] font-semibold truncate max-w-[78px] sm:max-w-[90px]">{b.name}</span>
                      {b.mark && <span className="text-[0.93em] opacity-90 flex-shrink-0">({b.mark})</span>}
                    </button>
                  ))
                ) : (
                  <div className="flex-shrink-0 px-3 py-2 rounded-md border border-l-4 border-l-emerald-500 border-dashed bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-[1.07em] font-medium">
                    No matching contact
                  </div>
                )}
              </div>
            </div>
            <div>
              <div
                ref={markScrollRef}
                role="region"
                aria-label="Temporary buyers"
                tabIndex={0}
                {...makeScrollHandlers(markScrollRef, didDragMarkRef)}
                className="flex w-full gap-1.5 overflow-x-auto overflow-y-hidden px-0 py-0 scroll-smooth touch-[pan-x_pan-y] lg:touch-auto select-none cursor-grab active:cursor-grabbing overscroll-x-contain"
                style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
              >
                {filteredTemporaryMarks.length > 0 ? (
                  filteredTemporaryMarks.slice(0, 50).map((mark) => {
                    const isSelected = !selectedBuyer && scribbleMark === mark;
                    return (
                      <button
                        key={mark}
                        type="button"
                        disabled={!!editingBidId}
                        onClick={(e) => {
                          if (didDragMarkRef.current) { e.preventDefault(); return; }
                          hapticSelection();
                          hideNativeKeyboard();
                          setSelectedBuyer(null);
                          setTempMarkLastUsedMs((p) => ({ ...p, [mark]: Date.now() }));
                          lastScribbleSegmentRef.current = '';
                          setScribbleMark(mark);
                          setScribblePadResetTrigger((t) => t + 1);
                        }}
                        className={cn(
                          'flex-shrink-0 px-3 py-1.5 rounded-md text-left transition-all border border-l-4 border-l-violet-500 flex items-center min-h-[40px]',
                          isSelected ? 'bg-primary text-primary-foreground border-primary shadow-md border-l-primary' : 'bg-muted/40 border-border/50 hover:bg-muted/60'
                        )}
                      >
                        <span className="text-[1.07em] font-semibold truncate max-w-[72px]">{mark}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex-shrink-0 px-3 py-2 rounded-md border border-l-4 border-l-violet-400 border-dashed bg-violet-500/5 text-violet-700 dark:text-violet-300 text-[1.07em] font-medium">
                    No temporary marks yet today
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 mb-0.5 min-w-0">
            <div className="min-w-0 flex-1">
              <label htmlFor="sales-pad-rate-mobile" className="text-[0.93em] font-semibold text-muted-foreground uppercase tracking-wide mb-0 block truncate text-center leading-tight">
                Rate ₹
              </label>
              <Input
                id="sales-pad-rate-mobile"
                ref={rateInputRef}
                type="number"
                value={rate}
                onChange={(e) => {
                  const v = e.target.value;
                  setRate(v);
                  if (v.trim() !== '') {
                    userClearedRateRef.current = false;
                  }
                  if (editingBidId) setEditBidDraft((d) => (d ? { ...d, rate: v } : d));
                }}
                onFocus={(e) => {
                  if (preferRateForFirstBidFormFocus) setPreferRateForFirstBidFormFocus(false);
                  setActiveNumpadField('rate');
                  if (!mobileKeyboardEnabled) {
                    e.currentTarget.blur();
                    hideNativeKeyboard();
                  }
                }}
                onBlur={() => setMobileKeyboardEnabled(false)}
                readOnly={!mobileKeyboardEnabled}
                inputMode={!mobileKeyboardEnabled ? 'none' : 'numeric'}
                placeholder="0"
                aria-label="Bid rate in rupees"
                className={cn(
                  'h-11 min-h-[44px] rounded-md border-2 border-primary/45 bg-muted/25 text-center text-[1.07em] font-bold min-w-0 py-1 leading-none',
                  activeNumpadField === 'rate' && 'border-primary ring-2 ring-primary shadow-[0_0_0_2px_hsl(var(--primary))]'
                )}
              />
            </div>
            <div className="min-w-0 flex-[1.15]">
              <label htmlFor="sales-pad-mark-mobile" className="text-[0.93em] font-semibold text-muted-foreground uppercase tracking-wide mb-0 block truncate text-center leading-tight">
                Mark
              </label>
              <Input
                id="sales-pad-mark-mobile"
                ref={markInputRef}
                data-skip-route-autofocus={preferRateForFirstBidFormFocus ? 'true' : undefined}
                type="text"
                autoComplete="off"
                value={scribbleMark}
                readOnly={!!editingBidId}
                onMouseDown={() => { manualMarkSelectionRef.current = true; }}
                onTouchStart={() => { manualMarkSelectionRef.current = true; }}
                onChange={(e) => {
                  if (editingBidId) return;
                  lastScribbleSegmentRef.current = '';
                  const v = e.target.value.toUpperCase().slice(0, MAX_MARK_LEN);
                  setScribbleMark(v);
                  const rawPos = e.target.selectionStart ?? v.length;
                  const clampedPos = clampInsideClosingParen(v, rawPos);
                  markInsertPosRef.current = clampedPos;
                  pendingMarkCaretPosRef.current = clampedPos;
                  setSelectedBuyer(null);
                }}
                onSelect={(e) => {
                  const rawPos = e.currentTarget.selectionStart ?? scribbleMark.length;
                  const allowManualExit = manualMarkSelectionRef.current;
                  manualMarkSelectionRef.current = false;
                  const clampedPos = clampInsideClosingParen(scribbleMark, rawPos, allowManualExit);
                  markInsertPosRef.current = clampedPos;
                  pendingMarkCaretPosRef.current = clampedPos !== rawPos ? clampedPos : null;
                }}
                inputMode="none"
                onFocus={() => { setActiveNumpadField('mark'); hideNativeKeyboard(); }}
                placeholder="Search…"
                aria-label="Search mark or name"
                className={cn(
                  'h-11 min-h-[44px] rounded-md border-2 border-violet-500/45 bg-muted/25 px-2 py-1 text-center text-[1.07em] font-medium min-w-0 leading-none',
                  activeNumpadField === 'mark' && 'border-violet-600 ring-2 ring-violet-500/60'
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <label
                htmlFor="sales-pad-qty-mobile"
                className="mb-0 block truncate text-center text-[0.93em] font-semibold uppercase tracking-wide text-muted-foreground leading-tight"
                title={`Quantity · ${remaining} bags remaining in lot`}
              >
                QTY / <span className="font-black tabular-nums text-foreground">{remaining}</span>
              </label>
              <div className="flex min-w-0 gap-1">
                <Input
                  id="sales-pad-qty-mobile"
                  ref={qtyInputRef}
                  type="number"
                  value={qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQty(v);
                    if (editingBidId) setEditBidDraft((d) => (d ? { ...d, qty: v } : d));
                  }}
                  onFocus={(e) => {
                    setActiveNumpadField('qty');
                    if (!mobileKeyboardEnabled) {
                      e.currentTarget.blur();
                      hideNativeKeyboard();
                    }
                  }}
                  onBlur={() => setMobileKeyboardEnabled(false)}
                  readOnly={!mobileKeyboardEnabled}
                  inputMode={!mobileKeyboardEnabled ? 'none' : 'numeric'}
                  placeholder="0"
                  aria-label={`Quantity in bags, ${remaining} bags remaining in lot`}
                  className={cn(
                    'h-11 min-h-[44px] min-w-0 flex-1 rounded-md border-2 border-primary/45 bg-muted/25 text-center text-[1.07em] font-bold py-1 leading-none',
                    activeNumpadField === 'qty' && 'border-primary ring-2 ring-primary shadow-[0_0_0_2px_hsl(var(--primary))]'
                  )}
                />
                {editingBidId && editBidDraft && editingEntry && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setPendingDeleteBid({
                        id: editingEntry.id,
                        label: `${editingEntry.buyerName} (${editingEntry.buyerMark})`,
                      })
                    }
                    disabled={completeLoading || !can('Auctions / Sales', 'Delete')}
                    className="flex h-11 min-h-[44px] w-11 shrink-0 items-center justify-center rounded-md border-2 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Delete bid"
                    title="Delete bid"
                  >
                    <Trash2 className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                )}
              </div>
            </div>
          </div>
          {canUsePreset && (
            <div className="mb-0.5 flex min-h-[38px] items-center gap-2">
              <div
                className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden no-scrollbar overscroll-x-contain scroll-smooth touch-[pan-x_pan-y]"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <div className="inline-flex max-w-none flex-nowrap items-stretch gap-1.5">
                  {showPresetMargin && presetOptions.length > 0 && (
                    <>
                      {presetOptions.map((opt) => (
                        <button
                          key={opt.label + String(opt.value)}
                          type="button"
                          onClick={() => applyPreset(opt.value)}
                          className={cn(
                            'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-all min-h-[38px] sm:min-h-[40px] sm:py-2.5 sm:text-sm',
                            preset === opt.value
                              ? opt.value >= 0
                                ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white'
                                : 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
                              : 'bg-muted/40 text-muted-foreground hover:bg-muted/60',
                            preset !== opt.value && opt.value >= 0 && 'text-success',
                            preset !== opt.value && opt.value < 0 && 'text-destructive'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {preset !== 0 && presetOptions.some((o) => o.value === preset) && (
                        <button
                          type="button"
                          onClick={() => {
                            const hit = presetOptions.find((o) => o.value === preset);
                            if (hit) applyPreset(hit.value);
                          }}
                          className="flex size-9 min-h-[38px] shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted sm:size-10 sm:min-h-[40px]"
                          aria-label="Clear preset margin"
                          title="Reset margin"
                        >
                          <RotateCcw className="h-4 w-4" strokeWidth={2.5} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center self-center">
                <PresetMarginSwitch
                  checked={showPresetMargin}
                  onCheckedChange={handleShowPresetMarginChange}
                  aria-label="Show preset margin on bids"
                />
              </div>
            </div>
          )}
          <div
            className="grid gap-1.5 items-stretch"
            style={{
              gridTemplateColumns: `${touchLayout.scribbleColRatio}fr ${1 - touchLayout.scribbleColRatio}fr`,
            }}
          >
            <div
              className="rounded-xl border border-violet-400/20 bg-card/80 p-1.5 h-full flex flex-col gap-1"
              style={{ minHeight: `${scribbleDockMinRem}rem` }}
            >
              <span className="sr-only">Scribble pad</span>
              <div className="flex-1 min-h-0">
                <InlineScribblePad
                  appendMode
                  onMarkDetected={handleScribbleSegmentDetected}
                  canvasHeight={touchLayout.scribbleCanvasHeight}
                  resetTrigger={scribblePadResetTrigger}
                  showStatus={false}
                  fillAvailableHeight
                  className="h-full min-h-0"
                />
              </div>
            </div>
            <div className="rounded-xl border border-primary/20 bg-card/80 p-1.5 space-y-1.5">
              <div className="grid grid-cols-3 gap-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '*'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleNumpadKey(k)}
                    className="rounded-none bg-muted/60 hover:bg-muted font-bold text-foreground transition-colors"
                    style={numpadMainRowStyle}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {/* Back + CLEAR row */}
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={handleNumpadBackspace}
                  className="rounded-none bg-muted/60 hover:bg-muted text-foreground font-semibold inline-flex items-center justify-center disabled:opacity-50"
                  style={numpadSecondaryRowStyle}
                  aria-label="Backspace (remove last character)"
                  title="Back"
                >
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={handleNumpadClear}
                  className="col-span-2 rounded-none bg-muted/60 hover:bg-muted text-foreground font-bold disabled:opacity-50 uppercase tracking-wide"
                  style={numpadSecondaryRowStyle}
                  aria-label="Clear current bid draft fields"
                  title="Clear"
                >
                  CLEAR
                </button>
              </div>

              {/* ( ... ) / Self — delete while editing: trash next to QTY above */}
              <div
                className={cn(
                  'grid gap-1',
                  isSelfSaleReauction || (editingBidId && editBidDraft && editingEntry)
                    ? 'grid-cols-1'
                    : 'grid-cols-2'
                )}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={appendMarkParenFromNumpad}
                  disabled={!!editingBidId}
                  className="rounded-none bg-violet-500/15 text-violet-800 dark:text-violet-200 border border-violet-500/35 font-bold"
                  style={numpadSecondaryRowStyle}
                  title="Add ( or ) to mark"
                  aria-label="Add opening or closing parenthesis to mark"
                >
                  (...)
                </button>

                {!isSelfSaleReauction && !(editingBidId && editBidDraft && editingEntry) && (
                  <button
                    type="button"
                    onClick={handleSelfSale}
                    disabled={remaining <= 0}
                    className="rounded-none bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold disabled:opacity-50"
                    style={numpadSecondaryRowStyle}
                    aria-label="Self Sale"
                    title="Self Sale"
                  >
                    Self
                  </button>
                )}
              </div>

              {editingBidId && editBidDraft ? (
                <>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => { if (editingEntry) void saveEditBid(editingEntry); }}
                      disabled={!editingEntry || !rate || !qty || parseInt(qty) <= 0 || parseInt(rate) <= 0}
                      className="rounded-none bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold disabled:opacity-50"
                      style={numpadSecondaryRowStyle}
                    >
                      Update Bid
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditBid}
                      className="rounded-none bg-muted/60 text-foreground border border-border/50 font-bold"
                      style={numpadSecondaryRowStyle}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 w-full">
                    <button
                      type="button"
                      disabled={completeLoading || entries.length === 0}
                      onClick={handleSaveAndCompleteAuction}
                      className="rounded-none bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold disabled:opacity-50 px-1 leading-tight"
                      style={numpadActionRowStyle}
                    >
                      {completeLoading ? 'Completing…' : 'Save & Close'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={handleUnifiedAdd}
                    disabled={(!scribbleMark.trim() && !selectedBuyer) || !rate || !qty || parseInt(qty) <= 0 || parseInt(rate) <= 0}
                    className="rounded-none bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold disabled:opacity-50 px-1 leading-tight"
                    style={numpadActionRowStyle}
                  >
                    + Add Bid
                  </button>
                <button
                  type="button"
                  disabled={completeLoading || entries.length === 0}
                  onClick={handleSaveAndCompleteAuction}
                  className="rounded-none bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold disabled:opacity-50 px-1 leading-tight"
                  style={numpadActionRowStyle}
                >
                  {completeLoading ? 'Completing…' : 'Save & Close'}
                </button>
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!isDesktop && (
        <AuctionTouchLayoutSheet
          open={touchLayoutSheetOpen}
          onOpenChange={setTouchLayoutSheetOpen}
          layout={touchLayout}
          onLayoutChange={commitTouchLayout}
        />
      )}

      {/* Scribble Pad */}
      <ScribblePad open={showScribble} onClose={() => setShowScribble(false)} onConfirm={handleScribbleConfirm} />

      {/* ═══ DUPLICATE MARK DIALOG ═══ */}
      <AnimatePresence>
        {duplicateMarkDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
            onClick={() => setDuplicateMarkDialog(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-2xl border border-border/50" onClick={e => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">Reusing Mark "{duplicateMarkDialog.mark}"?</h3>
              <p className="text-sm text-center text-muted-foreground mb-4">
                This mark already exists in this lot (Bid #{duplicateMarkDialog.existingEntry.bidNumber}).
                {duplicateMarkDialog.existingEntry.rate === duplicateMarkDialog.rate
                  ? ' Same rate — bids will be merged.'
                  : ' Different rate — bids will be kept separate.'}
              </p>
              <div className="flex gap-3">
                <Button onClick={handleDuplicateNewMark} variant="outline" className="flex-1 h-12 rounded-xl">
                  Different Mark
                </Button>
                <Button onClick={handleDuplicateMerge}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  {duplicateMarkDialog.existingEntry.rate === duplicateMarkDialog.rate ? 'Merge' : 'Keep Separate'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ QUANTITY INCREASE CONFIRMATION ═══ */}
      <AnimatePresence>
        {qtyIncreaseDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
            onClick={() => setQtyIncreaseDialog(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-2xl border border-border/50" onClick={e => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Plus className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">Increase Lot Quantity?</h3>
              <p className="text-sm text-center text-muted-foreground mb-4">
                Lot has <strong>{qtyIncreaseDialog.lotTotal}</strong> bags, <strong>{qtyIncreaseDialog.currentTotal}</strong> already sold.
                Adding <strong>{qtyIncreaseDialog.attemptedQty}</strong> bags exceeds the limit.
                <br />New total will be: <strong>{qtyIncreaseDialog.currentTotal + qtyIncreaseDialog.attemptedQty}</strong> bags*
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setQtyIncreaseDialog(null)} variant="outline" className="flex-1 h-12 rounded-xl">Cancel</Button>
                <Button onClick={confirmQtyIncrease}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white">
                  Increase & Add
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editBidQtyDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
            onClick={() => setEditBidQtyDialog(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-2xl border border-border/50" onClick={e => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Pencil className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">Increase Lot Quantity?</h3>
              <p className="text-sm text-center text-muted-foreground mb-4">
                Lot has <strong>{editBidQtyDialog.lotTotal}</strong> bags.
                Other bids use <strong>{editBidQtyDialog.currentTotal}</strong> bags.
                This bid at <strong>{editBidQtyDialog.attemptedQty}</strong> bags would bring the total sold to{' '}
                <strong>{editBidQtyDialog.currentTotal + editBidQtyDialog.attemptedQty}</strong> bags.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setEditBidQtyDialog(null)} variant="outline" className="flex-1 h-12 rounded-xl">Cancel</Button>
                <Button onClick={() => { void confirmEditBidQtyIncrease(); }}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white">
                  Allow & Update
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isDesktop && <BottomNav />}

      <ConfirmDeleteDialog
        open={!!pendingDeleteBid}
        onOpenChange={(v) => { if (!v) setPendingDeleteBid(null); }}
        title="Delete bid?"
        description={pendingDeleteBid ? `Remove bid for "${pendingDeleteBid.label}"? This cannot be undone.` : ''}
        onConfirm={() => pendingDeleteBid && removeEntry(pendingDeleteBid.id)}
      />
    </div>
  );
};

/** Lot list column: pending (unsold) / sold — not sold/total. */
function getLotListPendingSold(lot: LotInfo): { pending: number; sold: number } {
  if (lot.selfSaleUnitId != null) {
    const pending = Math.max(0, lot.remainingQty ?? lot.bag_count ?? 0);
    const unitTotal = lot.selfSaleQty ?? lot.original_bag_count ?? 0;
    const sold = lot.sold_bags ?? Math.max(0, unitTotal - pending);
    return { pending, sold: Math.max(0, sold) };
  }
  const total = Math.max(0, lot.bag_count ?? 0);
  const sold = Math.max(0, lot.sold_bags ?? 0);
  return { pending: Math.max(0, total - sold), sold };
}

function sumLotsPendingSold(lots: LotInfo[]): { pending: number; sold: number } {
  return lots.reduce(
    (acc, lot) => {
      const { pending, sold } = getLotListPendingSold(lot);
      return { pending: acc.pending + pending, sold: acc.sold + sold };
    },
    { pending: 0, sold: 0 }
  );
}

// ── Lot Row Component with Status Badge ──────────────────
const LotRow = ({ lot, onSelect, statusFilter }: { lot: LotInfo; onSelect: (lot: LotInfo) => void; statusFilter: LotStatus | 'all' }) => {
  const status = getRowLotStatus(lot, statusFilter);
  const cfg = STATUS_CONFIG[status];
  const { pending, sold } = getLotListPendingSold(lot);

  return (
    <button onClick={() => onSelect(lot)}
      className="w-full glass-card rounded-2xl p-3 flex items-center gap-3 hover:shadow-lg transition-all text-left group">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-md flex-shrink-0 relative overflow-hidden">
        <Package className="w-4 h-4 text-white relative z-10" />
        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-foreground truncate">
            {formatLotDisplayName(lot)}{lot.was_modified ? '*' : ''}
          </p>
          <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 flex-shrink-0", cfg.bg, cfg.text)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {lot.commodity_name}
        </p>
      </div>
      <div className="text-right flex-shrink-0 tabular-nums">
        <p className="text-sm font-bold text-foreground">{pending}/{sold}</p>
        <p className="text-[10px] text-muted-foreground">pending / sold</p>
      </div>
    </button>
  );
};

export default AuctionsPage;
