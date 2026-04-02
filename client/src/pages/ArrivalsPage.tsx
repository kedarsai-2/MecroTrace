import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, Fragment, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import BottomNav from '@/components/BottomNav';
import {
  ArrowLeft, Plus, Truck, Scale, ChevronDown, ChevronUp, ChevronRight, ChevronsUpDown, Trash2,
  AlertTriangle, Search, Package, Users, Banknote, FileText, Pencil, Filter, Share2, MapPin
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { contactApi, arrivalsApi, commodityApi } from '@/services/api';
import type { ArrivalSummary, ArrivalCreatePayload, ArrivalFullDetail, ArrivalDetail } from '@/services/api/arrivals';
import ArrivalStatusBadge, { getArrivalStatus, type ArrivalStatus } from '@/components/arrivals/ArrivalStatusBadge';
import FreightDetailsCard from '@/components/arrivals/FreightDetailsCard';
import SellerInfoCard from '@/components/arrivals/SellerInfoCard';
import BuyerMarkSection from '@/components/arrivals/BuyerMarkSection';
import LocationSearchInput from '@/components/LocationSearchInput';
import type { Vehicle, Contact, FreightMethod } from '@/types/models';
import { toast } from 'sonner';
import { useDesktopMode } from '@/hooks/use-desktop';
import useAutofocusWhen from '@/hooks/useAutofocusWhen';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

/**
 * ArrivalsPage — SRS Part 2: Inward Logistics (REQ-ARR-001 to REQ-ARR-013)
 *
 * Hierarchical structure (REQ-ARR-010):
 *   Vehicle → Multiple Sellers → Multiple Lots
 *
 * Screens:
 *   3.3.1 Vehicle & Tonnage Entry
 *   3.3.2 Seller & Lot Entry
 *   3.3.3 Financial Trigger Logic
 *   3.3.5 Rental & Advance Logic
 *   3.3.6 Validation & Constraints
 */

// ── Types for local arrival data ──────────────────────────
interface LotEntry {
  lot_id: string;
  lot_name: string;
  lot_serial_number?: number | null;
  quantity: number; // bag count
  commodity_name: string;
  broker_tag: string;
  variant: string;
}

interface SellerEntry {
  seller_vehicle_id: string;
  contact_id: string;
  seller_serial_number?: number | null;
  seller_name: string;
  seller_phone: string;
  seller_mark: string;
  lots: LotEntry[];
}

interface ArrivalRecord {
  vehicle: Vehicle;
  loaded_weight: number;
  empty_weight: number;
  deducted_weight: number;
  net_weight: number;       // REQ-ARR-001: LW - EW
  final_billable_weight: number; // REQ-ARR-001: NW - DW
  freight_method: FreightMethod;
  freight_rate: number;
  freight_total: number;
  no_rental: boolean;
  advance_paid: number;
  broker_name: string;
  sellers: SellerEntry[];
  is_multi_seller: boolean;
  godown: string;
  gatepass_number: string;
}

const FREIGHT_METHODS: { value: FreightMethod; label: string }[] = [
  { value: 'BY_WEIGHT', label: 'By Weight' },
  { value: 'BY_COUNT', label: 'By Count' },
  { value: 'LUMPSUM', label: 'Lumpsum' },
  { value: 'DIVIDE_BY_WEIGHT', label: 'Lumpsum + Divide by Weight' },
];

const NARRATION_PRESETS = [
  'Freight for vehicle arrival',
  'Coolie charges for unloading',
  'Advance paid to driver',
  'Rental charges — partial payment',
];

/** Variant options (hardcoded for now; will be dynamic later). */
const VARIANT_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'Small', label: 'Small' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Large', label: 'Large' },
];

function sameArrivalVehicleId(
  a: string | number | undefined | null,
  b: string | number | undefined | null,
): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/**
 * Restore multi-seller vs single on edit. When API says single but the row is an early multi draft
 * (real vehicle #, no sellers yet, mis-persisted flag), prefer multi.
 */
function resolveMultiSellerForEdit(detail: ArrivalFullDetail, mappedSellersCount: number): boolean {
  const multiFromApi = detail.multiSeller;
  if (typeof multiFromApi === 'boolean') {
    if (multiFromApi) return true;
    const vn = (detail.vehicleNumber ?? '').trim().toUpperCase();
    if (mappedSellersCount === 0 && vn.length > 0 && vn !== 'SINGLE-SELLER') return true;
    return false;
  }
  return mappedSellersCount > 1;
}

function isCompleteArrivalForSubmit(
  payload: Pick<ArrivalCreatePayload, 'vehicle_number' | 'is_multi_seller' | 'sellers'>,
): boolean {
  if (payload.is_multi_seller) {
    const vn = (payload.vehicle_number ?? '').trim();
    if (vn.length === 0) return false;
  }

  const sellers = payload.sellers ?? [];
  if (sellers.length === 0) return false;
  if (!payload.is_multi_seller && sellers.length > 1) return false;

  for (const s of sellers) {
    const hasContactId = s.contact_id !== undefined && s.contact_id !== null;
    if (!hasContactId) {
      if (!s.seller_name?.trim()) return false;
      // Free-text sellers are collected by name (and optional mark) in this UI.
      // Phone is not captured for this path, so it must not gate completion.
    }
    const lots = s.lots ?? [];
    if (lots.length === 0) return false;
    let hasAtLeastOneValidLot = false;
    for (const l of lots) {
      const ln = l.lot_name?.trim();
      const cn = l.commodity_name?.trim();
      const qty = typeof l.quantity === 'number' ? l.quantity : 0;
      if (ln && cn && qty > 0) {
        hasAtLeastOneValidLot = true;
        break;
      }
    }
    if (!hasAtLeastOneValidLot) return false;
  }

  return true;
}

function isSellerSubstantiveForSubmit(seller: ArrivalCreatePayload['sellers'][number]): boolean {
  const hasContactId = seller.contact_id !== undefined && seller.contact_id !== null;
  if (hasContactId) return true;
  if ((seller.seller_name ?? '').trim()) return true;
  if ((seller.seller_phone ?? '').trim()) return true;
  if ((seller.seller_mark ?? '').trim()) return true;

  const lots = seller.lots ?? [];
  return lots.some((lot) => {
    if ((lot.lot_name ?? '').trim()) return true;
    if ((lot.commodity_name ?? '').trim()) return true;
    if ((lot.broker_tag ?? '').trim()) return true;
    if ((lot.variant ?? '').trim()) return true;
    return (lot.quantity ?? 0) > 0;
  });
}

function sanitizeSubmitPayload(payload: ArrivalCreatePayload): ArrivalCreatePayload {
  const sellers = (payload.sellers ?? [])
    .map((seller) => {
      const lots = (seller.lots ?? []).filter((lot) => {
        const hasLotName = (lot.lot_name ?? '').trim().length > 0;
        const hasCommodity = (lot.commodity_name ?? '').trim().length > 0;
        const hasMeta = (lot.broker_tag ?? '').trim().length > 0 || (lot.variant ?? '').trim().length > 0;
        return hasLotName || hasCommodity || hasMeta || (lot.quantity ?? 0) > 0;
      });
      return { ...seller, lots };
    })
    .filter(isSellerSubstantiveForSubmit);

  return { ...payload, sellers };
}

const ARRIVAL_SUMMARY_PRIMARY_PILL_CLASS =
  'px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0';

/** Arrivals summary first column: Vehicle | Seller | Qty (shared desktop table + mobile cards). */
function ArrivalSummaryVehicleSellerQty({
  vehicleNumber,
  primarySellerName,
  totalBags,
}: Pick<ArrivalSummary, 'vehicleNumber' | 'primarySellerName' | 'totalBags'>) {
  const seller = primarySellerName ?? '-';
  const qty = totalBags ?? 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 max-w-full">
      <span
        className={cn(ARRIVAL_SUMMARY_PRIMARY_PILL_CLASS, 'max-w-[min(100%,10rem)] truncate')}
        title={vehicleNumber?.trim() ? vehicleNumber : undefined}
      >
        {vehicleNumber?.trim() ? vehicleNumber : '—'}
      </span>
      <span className="text-muted-foreground text-xs shrink-0" aria-hidden>
        |
      </span>
      <span
        className="min-w-0 max-w-[min(100%,14rem)] sm:max-w-[min(100%,18rem)] truncate text-foreground text-xs font-medium"
        title={seller}
      >
        {seller}
      </span>
      <span className="text-muted-foreground text-xs shrink-0" aria-hidden>
        |
      </span>
      <span className={ARRIVAL_SUMMARY_PRIMARY_PILL_CLASS}>{qty}</span>
    </span>
  );
}

/**
 * Bag totals for lot headers are constant per render:
 * - vehicleTotal: total bags for the whole vehicle (all sellers, all lots)
 * - sellerTotal: total bags for this seller (all lots of that seller)
 */

const LOTS_SCROLL_EPS = 2;
/** Min pixels outer.scrollHeight must exceed clientHeight so overlay scrollbars + edge hints reliably engage. */
const LOTS_SCROLL_MIN_OVERFLOW = 20;

type RegisterLotsScrollEl = (sellerId: string) => (el: HTMLDivElement | null) => void;

/**
 * Internal lots scroller: overlay scrollbars (especially on touch) stay hidden until gesture,
 * and wide lot grids overflow horizontally — edge gradients + chevrons when content extends past the view.
 */
function LotsScrollPanel({
  sellerId,
  registerScrollEl,
  showEdgeHints,
  className,
  children,
  /** Mobile: when lots exist but content is shorter than the panel, grow inner height so outer.scrollHeight exceeds the viewport (native bars + hints use a small EPS). */
  ensureVerticalScrollThumbWhenShort = false,
  contentLayoutKey = 0,
  /** Always-visible hint under the viewport; native scrollbars often stay hidden until drag. */
  showScrollAffordanceFooter = false,
  scrollAffordanceHint = 'Scroll to see all lots',
}: {
  sellerId: string;
  registerScrollEl: RegisterLotsScrollEl;
  showEdgeHints: boolean;
  className?: string;
  children: ReactNode;
  ensureVerticalScrollThumbWhenShort?: boolean;
  contentLayoutKey?: number | string;
  showScrollAffordanceFooter?: boolean;
  scrollAffordanceHint?: string;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [hintBottom, setHintBottom] = useState(false);
  const [hintRight, setHintRight] = useState(false);
  const [thumbMetrics, setThumbMetrics] = useState<{ visible: boolean; top: number; height: number }>({
    visible: false,
    top: 0,
    height: 0,
  });
  const [thumbPressed, setThumbPressed] = useState(false);
  const [horizontalThumbMetrics, setHorizontalThumbMetrics] = useState<{ visible: boolean; left: number; width: number }>({
    visible: false,
    left: 0,
    width: 0,
  });
  const [horizontalThumbPressed, setHorizontalThumbPressed] = useState(false);

  const mergedRef = useCallback(
    (el: HTMLDivElement | null) => {
      outerRef.current = el;
      registerScrollEl(sellerId)(el);
    },
    [registerScrollEl, sellerId],
  );

  const applyVerticalThumbPadding = useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;
    if (!ensureVerticalScrollThumbWhenShort) return;
    
    const och = outer.clientHeight;
    const osh = outer.scrollHeight;
    if (och <= 0) return;
    if (osh <= och + LOTS_SCROLL_EPS) {
      const bump = och + LOTS_SCROLL_MIN_OVERFLOW - osh;
      if (bump > 0) {
        outer.style.minHeight = `${outer.scrollHeight + bump}px`;
      }
    }
  }, [ensureVerticalScrollThumbWhenShort]);

  const updateThumbMetrics = useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const clientH = outer.clientHeight;
    if (clientH <= 0) return;

    const totalScrollable = Math.max(0, outer.scrollHeight - outer.clientHeight);
    const visible = Boolean(ensureVerticalScrollThumbWhenShort) || totalScrollable > LOTS_SCROLL_EPS;

    if (!visible) {
      setThumbMetrics({ visible: false, top: 0, height: 0 });
      return;
    }

    // Keep thumb inside capsule ends and clear top/bottom arrow buttons.
    const insetPx = 12;
    const available = Math.max(0, clientH - insetPx * 2);
    if (available <= 0) return;

    // Single small round "volume knob" (fixed size).
    const knobSizePx = 26;
    const thumbHeight = Math.min(available, knobSizePx);

    const maxTop = Math.max(0, available - thumbHeight);
    const ratio = totalScrollable > LOTS_SCROLL_EPS ? outer.scrollTop / totalScrollable : 0;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const top = insetPx + maxTop * clampedRatio;

    setThumbMetrics({ visible: true, top, height: thumbHeight });
  }, [ensureVerticalScrollThumbWhenShort]);

  const updateHorizontalThumbMetrics = useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const clientW = outer.clientWidth;
    if (clientW <= 0) return;

    const totalScrollableX = Math.max(0, outer.scrollWidth - outer.clientWidth);
    if (totalScrollableX <= LOTS_SCROLL_EPS) {
      setHorizontalThumbMetrics({ visible: false, left: 0, width: 0 });
      return;
    }

    const insetPx = 10;
    const available = Math.max(0, clientW - insetPx * 2);
    if (available <= 0) return;

    const thumbWidth = Math.max(32, Math.min(available, Math.round(clientW * 0.18)));
    const maxLeft = Math.max(0, available - thumbWidth);
    const ratio = outer.scrollLeft / totalScrollableX;
    const left = insetPx + maxLeft * Math.max(0, Math.min(1, ratio));

    setHorizontalThumbMetrics({ visible: true, left, width: thumbWidth });
  }, []);

  const updateHints = useCallback(() => {
    const el = outerRef.current;
    if (!el || !showEdgeHints) {
      setHintBottom(false);
      setHintRight(false);
      return;
    }
    const vOverflow = el.scrollHeight > el.clientHeight + LOTS_SCROLL_EPS;
    const hOverflow = el.scrollWidth > el.clientWidth + LOTS_SCROLL_EPS;
    const notAtBottom = el.scrollTop < el.scrollHeight - el.clientHeight - LOTS_SCROLL_EPS;
    const notAtRight = el.scrollLeft < el.scrollWidth - el.clientWidth - LOTS_SCROLL_EPS;
    setHintBottom(vOverflow && notAtBottom);
    setHintRight(hOverflow && notAtRight);
  }, [showEdgeHints]);

  const runScrollMetrics = useCallback(() => {
    applyVerticalThumbPadding();
    updateHints();
    updateThumbMetrics();
    updateHorizontalThumbMetrics();
  }, [applyVerticalThumbPadding, updateHints, updateThumbMetrics, updateHorizontalThumbMetrics]);

  const scrollByStep = useCallback((dir: 'up' | 'down') => {
    const el = outerRef.current;
    if (!el) return;
    const step = Math.max(56, Math.round(el.clientHeight * 0.28));
    el.scrollBy({ top: dir === 'up' ? -step : step, behavior: 'smooth' });
  }, []);

  useLayoutEffect(() => {
    runScrollMetrics();
  }, [runScrollMetrics, contentLayoutKey]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    runScrollMetrics();
    const ro = new ResizeObserver(() => runScrollMetrics());
    ro.observe(outer);
    outer.addEventListener('scroll', updateThumbMetrics, { passive: true });
    outer.addEventListener('scroll', updateHorizontalThumbMetrics, { passive: true });
    if (showEdgeHints) {
      outer.addEventListener('scroll', updateHints, { passive: true });
    }
    return () => {
      ro.disconnect();
      outer.removeEventListener('scroll', updateThumbMetrics);
      outer.removeEventListener('scroll', updateHorizontalThumbMetrics);
      outer.removeEventListener('scroll', updateHints);
    };
  }, [runScrollMetrics, updateHints, updateThumbMetrics, updateHorizontalThumbMetrics, showEdgeHints, sellerId]);

  const setScrollTopFromPointerY = useCallback((clientY: number) => {
    const outer = outerRef.current;
    if (!outer) return;

    const totalScrollable = Math.max(0, outer.scrollHeight - outer.clientHeight);
    if (totalScrollable <= LOTS_SCROLL_EPS) return;

    const insetPx = 12;
    const rect = outer.getBoundingClientRect();
    const yInPanel = clientY - rect.top;
    const available = Math.max(0, outer.clientHeight - insetPx * 2);
    if (available <= 0) return;

    const ratio = Math.max(0, Math.min(1, (yInPanel - insetPx) / available));
    outer.scrollTop = ratio * totalScrollable;
  }, []);

  const onThumbPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const outer = outerRef.current;
    if (!outer) return;

    e.preventDefault();
    e.stopPropagation();

    setThumbPressed(true);

    // Immediately seek based on press location.
    setScrollTopFromPointerY(e.clientY);

    const onMove = (ev: PointerEvent) => setScrollTopFromPointerY(ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setThumbPressed(false);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
  }, [setScrollTopFromPointerY]);

  const setScrollLeftFromPointerX = useCallback((clientX: number) => {
    const outer = outerRef.current;
    if (!outer) return;

    const totalScrollableX = Math.max(0, outer.scrollWidth - outer.clientWidth);
    if (totalScrollableX <= LOTS_SCROLL_EPS) return;

    const insetPx = 10;
    const rect = outer.getBoundingClientRect();
    const xInPanel = clientX - rect.left;
    const available = Math.max(0, outer.clientWidth - insetPx * 2);
    if (available <= 0) return;

    const ratio = Math.max(0, Math.min(1, (xInPanel - insetPx) / available));
    outer.scrollLeft = ratio * totalScrollableX;
  }, []);

  const onHorizontalThumbPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const outer = outerRef.current;
    if (!outer) return;

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
    <>
      <div className="relative">
        <div
          ref={mergedRef}
          className={cn('lots-scroll-panel', 'lg:no-scrollbar', className)}
          style={
            showEdgeHints
              ? { WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }
              : { scrollbarWidth: 'none', msOverflowStyle: 'none' }
          }
        >
          {children}
        </div>
        {thumbMetrics.visible && (
          <div
            className="absolute right-0 top-0 bottom-0 w-[22px] z-[4]"
          >
            {/* Track capsule */}
            <div
              className="absolute right-0 w-[22px] rounded-full"
              style={{
                top: 2,
                bottom: 2,
                backgroundColor: 'hsl(var(--card))',
                boxShadow: 'inset 0 0 0 1px hsl(var(--foreground) / 0.28)',
              }}
            />

            {/* Thumb capsule */}
            <div
              className="absolute left-1/2 w-[32px] -translate-x-1/2 rounded-full border-2 cursor-ns-resize select-none touch-none z-[6] transition-[box-shadow,transform] duration-150 active:scale-[0.99]"
              style={{
                top: thumbMetrics.top,
                height: thumbMetrics.height,
                borderColor: thumbPressed ? 'hsl(229 76% 61%)' : 'hsl(229 100% 69%)',
                backgroundColor: thumbPressed ? 'hsl(229 76% 61%)' : 'hsl(229 100% 69%)',
                // "Gooey/glow" look: crisp inner border + soft outer glow
                boxShadow:
                  thumbPressed
                    ? 'inset 0 0 0 1px hsl(0 0% 100% / 0.4), 0 0 26px hsl(229 100% 69% / 0.35)'
                    : 'inset 0 0 0 1px hsl(0 0% 100% / 0.3), 0 0 18px hsl(229 100% 69% / 0.25)',
              }}
              onPointerDown={onThumbPointerDown}
              role="slider"
              aria-label="Drag to scroll lots"
              aria-valuemin={0}
              aria-valuemax={1}
            >
              {/* Visual-only motif to mirror the requested icon style. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                <span
                  className="block h-[8px] w-[8px] rotate-45 border-t-2 border-l-2"
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
                  className="block h-[8px] w-[8px] rotate-[225deg] border-t-2 border-l-2"
                  style={{ borderColor: 'hsl(0 0% 100% / 0.92)' }}
                  aria-hidden
                />
              </div>
            </div>
          </div>
        )}
        {showEdgeHints && hintBottom && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex h-11 items-end justify-center bg-gradient-to-t from-background from-40% via-background/75 to-transparent pb-1.5"
            aria-hidden
          >
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/80" strokeWidth={2.5} />
          </div>
        )}
        {showEdgeHints && hintRight && (
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
              aria-label="Drag to scroll lots horizontally"
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
      {showScrollAffordanceFooter && (hintBottom || hintRight || thumbMetrics.visible) && (
        <div
          className="flex items-center justify-center gap-1.5 border-t border-border/40 bg-muted/25 py-2 px-2 dark:bg-muted/15"
          role="note"
        >
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-center text-[10px] font-medium leading-snug text-muted-foreground">
            {scrollAffordanceHint}
          </span>
        </div>
      )}
    </>
  );
}

/**
 * Keep this wrapper so markup call-sites stay unchanged.
 * Horizontal + vertical scrolling is handled by the outer LotsScrollPanel
 * to ensure sticky lot headers remain truly fixed while entries scroll.
 */
function LotFieldsHorizontalScroll({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function AddLotHorizontalScrollPanel({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [hintRight, setHintRight] = useState(false);
  const [thumbMetrics, setThumbMetrics] = useState<{ visible: boolean; left: number; width: number }>({
    visible: false,
    left: 0,
    width: 0,
  });
  const [thumbPressed, setThumbPressed] = useState(false);

  const runMetrics = useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const totalScrollableX = Math.max(0, outer.scrollWidth - outer.clientWidth);
    const hasOverflow = totalScrollableX > LOTS_SCROLL_EPS;

    setHintRight(hasOverflow && outer.scrollLeft < totalScrollableX - LOTS_SCROLL_EPS);
    if (!hasOverflow) {
      setThumbMetrics({ visible: false, left: 0, width: 0 });
      return;
    }

    const insetPx = 10;
    const available = Math.max(0, outer.clientWidth - insetPx * 2);
    if (available <= 0) return;

    const thumbWidth = Math.max(32, Math.min(available, Math.round(outer.clientWidth * 0.18)));
    const maxLeft = Math.max(0, available - thumbWidth);
    const ratio = outer.scrollLeft / totalScrollableX;
    const left = insetPx + maxLeft * Math.max(0, Math.min(1, ratio));

    setThumbMetrics({ visible: true, left, width: thumbWidth });
  }, []);

  useLayoutEffect(() => {
    runMetrics();
  }, [children, runMetrics]);

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

  const setScrollLeftFromPointerX = useCallback((clientX: number) => {
    const outer = outerRef.current;
    if (!outer) return;
    const totalScrollableX = Math.max(0, outer.scrollWidth - outer.clientWidth);
    if (totalScrollableX <= LOTS_SCROLL_EPS) return;

    const insetPx = 10;
    const rect = outer.getBoundingClientRect();
    const xInPanel = clientX - rect.left;
    const available = Math.max(0, outer.clientWidth - insetPx * 2);
    if (available <= 0) return;

    const ratio = Math.max(0, Math.min(1, (xInPanel - insetPx) / available));
    outer.scrollLeft = ratio * totalScrollableX;
  }, []);

  const onThumbPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setThumbPressed(true);
    setScrollLeftFromPointerX(e.clientX);

    const onMove = (ev: PointerEvent) => setScrollLeftFromPointerX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setThumbPressed(false);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
  }, [setScrollLeftFromPointerX]);

  return (
    <div className="relative">
      <div
        ref={outerRef}
        className="overflow-x-auto lot-fields-x-scroll [-webkit-overflow-scrolling:touch] touch-auto pb-5"
      >
        {children}
      </div>
      {hintRight && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] flex w-10 items-center justify-end bg-gradient-to-l from-background from-35% via-background/75 to-transparent pr-1"
          aria-hidden
        >
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/80" strokeWidth={2.5} />
        </div>
      )}
      {thumbMetrics.visible && (
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
              left: thumbMetrics.left,
              width: thumbMetrics.width,
              borderColor: thumbPressed ? 'hsl(229 76% 61%)' : 'hsl(229 100% 69%)',
              backgroundColor: thumbPressed ? 'hsl(229 76% 61%)' : 'hsl(229 100% 69%)',
              boxShadow:
                thumbPressed
                  ? 'inset 0 0 0 1px hsl(0 0% 100% / 0.4), 0 0 26px hsl(229 100% 69% / 0.35)'
                  : 'inset 0 0 0 1px hsl(0 0% 100% / 0.3), 0 0 18px hsl(229 100% 69% / 0.25)',
            }}
            onPointerDown={onThumbPointerDown}
            role="slider"
            aria-label="Drag to scroll new lot fields horizontally"
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

const ArrivalsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Arrivals');
  const [apiArrivals, setApiArrivals] = useState<ArrivalSummary[]>([]);
  const [apiArrivalsLoading, setApiArrivalsLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [commodities, setCommodities] = useState<any[]>([]);
  const [commodityConfigs, setCommodityConfigs] = useState<any[]>([]);
  const [expandedArrival, setExpandedArrival] = useState<number | null>(null);
  const [desktopTab, setDesktopTab] = useState<'summary' | 'new-arrival'>('summary');

  // Form state for new arrival — in-memory only (no localStorage). Drafts are session-only; backend draft API not implemented.
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState<number>(1);
  const [isMultiSeller, setIsMultiSeller] = useState<boolean>(true);

  // Step 1: Vehicle & Tonnage
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [loadedWeight, setLoadedWeight] = useState('');
  const [emptyWeight, setEmptyWeight] = useState('');
  const [deductedWeight, setDeductedWeight] = useState('');
  const [freightMethod, setFreightMethod] = useState<FreightMethod>('BY_WEIGHT');
  const handleFreightMethodChange = useCallback((value: string) => {
    const selected = FREIGHT_METHODS.find(method => method.value === value)?.value;
    setFreightMethod(selected ?? 'BY_WEIGHT');
  }, []);

  const [freightRate, setFreightRate] = useState('');
  const [freightKgs, setFreightKgs] = useState('1');
  const [noRental, setNoRental] = useState(false);
  const [advancePaid, setAdvancePaid] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [brokerContactId, setBrokerContactId] = useState<number | null>(null);
  const [narration, setNarration] = useState('');
  const [godown, setGodown] = useState('');
  const [gatepassNumber, setGatepassNumber] = useState('');
  const [origin, setOrigin] = useState('');
  const [variant, setVariant] = useState('');

  // Expand panel: full detail from API (desktop row expand / mobile card expand)
  const [expandedDetail, setExpandedDetail] = useState<ArrivalFullDetail | null>(null);
  const [expandedDetailLoading, setExpandedDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  let summaryMode: 'arrivals' | 'sellers' | 'lots' = 'arrivals';
  type StatusFilter = 'ALL' | ArrivalStatus;
  const SUMMARY_STATUS_FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'WEIGHED', 'AUCTIONED', 'SETTLED', 'PARTIALLY_COMPLETED'];
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [partialArrivals, setPartialArrivals] = useState<ArrivalSummary[]>([]);
  const [partialArrivalsLoading, setPartialArrivalsLoading] = useState(false);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const [editingVehicleId, setEditingVehicleId] = useState<number | string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const editBaselineSnapshotRef = useRef<string | null>(null);
  type PendingDelete =
    | { kind: 'arrival'; vehicleId: number | string; label: string }
    | { kind: 'seller'; idx: number; label: string }
    | { kind: 'lot'; sellerIdx: number; lotIdx: number; label: string };
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  // Broker: contact search or type any name
  const [brokerDropdown, setBrokerDropdown] = useState(false);
  const brokerSearchWrapRef = useRef<HTMLDivElement>(null);
  const [brokerDropdownPos, setBrokerDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // Step 2: Sellers & Lots
  const [sellers, setSellers] = useState<SellerEntry[]>([]);
  const [sellerExpanded, setSellerExpanded] = useState<Record<string, boolean>>({});
  const lotsScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingLotsScrollToEndSellerIdRef = useRef<string | null>(null);
  const newArrivalPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const sellerNameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingSellerFocusIdRef = useRef<string | null>(null);
  const [sellerFocusNonce, setSellerFocusNonce] = useState(0);
  const sellerKeyboardTriggeredRef = useRef<Set<string>>(new Set());
  // Rapid-click safety helpers (avoid stale closures around `sellers.length` / `isMultiSeller`).
  const isMultiSellerRef = useRef(isMultiSeller);
  const sellerCountRef = useRef(0);

  // Seller row dropdown suggestions (bound to active inline seller row).
  const [sellerDropdown, setSellerDropdown] = useState(false);
  const sellerNameInputWrapRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeSellerSearch, setActiveSellerSearch] = useState<{ sellerId: string; query: string } | null>(null);
  const [sellerDropdownPos, setSellerDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // Add Lot inline form state
  type AddLotFormState = {
    sellerId: string;
    lotName: string;
    bags: string;
    commodityName: string;
    variant: string;
    errors: { lotName?: string; bags?: string; commodity?: string };
    editingLotId?: string;
    editingLotIdx?: number;
  };
  const [addLotForm, setAddLotForm] = useState<AddLotFormState | null>(null);
  const prevSellerExpandedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const prevExpanded = prevSellerExpandedRef.current;
    const newlyExpandedSeller = sellers.find((s) => {
      const isNowExpanded = !!sellerExpanded[s.seller_vehicle_id];
      const wasExpanded = !!prevExpanded[s.seller_vehicle_id];
      return isNowExpanded && !wasExpanded;
    });

    prevSellerExpandedRef.current = sellerExpanded;
    if (!newlyExpandedSeller || addLotForm) return;

    setAddLotForm({
      sellerId: newlyExpandedSeller.seller_vehicle_id,
      lotName: "",
      bags: "",
      commodityName: commodities[0]?.commodity_name || "",
      variant: "",
      errors: {},
    });
  }, [addLotForm, sellers, sellerExpanded, commodities]);

  // Inline autofocus targets for the "New Arrival" panel/sheet.
  // We keep one ref per target because only one layout branch renders at a time.
  const vehicleNumberInputRef = useRef<HTMLInputElement | null>(null);
  const loadedWeightInputRef = useRef<HTMLInputElement | null>(null);

  const setLotsScrollRef = useCallback((sellerId: string) => (el: HTMLDivElement | null) => {
    lotsScrollRefs.current[sellerId] = el;
  }, []);

  const scrollSellerLotsToLatest = useCallback((sellerId: string) => {
    const tryScroll = (attempt: number) => {
      const el = lotsScrollRefs.current[sellerId];
      if (!el) {
        if (attempt < 5) {
          requestAnimationFrame(() => tryScroll(attempt + 1));
        }
        return;
      }

      el.scrollTop = el.scrollHeight;
      const lastRow = el.querySelector('tbody tr:last-child') as HTMLElement | null;
      lastRow?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      // Keep the lots panel itself in viewport so users can immediately see
      // the newly added row instead of only scrolling internally.
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });

      const panel = newArrivalPanelScrollRef.current;
      if (panel && panel.contains(el)) {
        const panelRect = panel.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const nextTop = panel.scrollTop + (elRect.top - panelRect.top) - 12;
        panel.scrollTo({ top: Math.max(0, nextTop), behavior: 'auto' });
      }
    };

    tryScroll(0);
  }, []);

  const ensureLastThreeLotsVisible = useCallback((sellerId: string) => {
    const tryEnsure = (attempt: number) => {
      const el = lotsScrollRefs.current[sellerId];
      if (!el) {
        if (attempt < 6) requestAnimationFrame(() => tryEnsure(attempt + 1));
        return;
      }

      const vp = window.visualViewport;
      const isKeyboardLikelyOpen = !!vp && (window.innerHeight - vp.height) > 50;
      if (!isKeyboardLikelyOpen) {
        if (attempt < 6) window.setTimeout(() => tryEnsure(attempt + 1), 100);
        return;
      }

      const rows = Array.from(el.querySelectorAll('tbody tr')) as HTMLElement[];
      if (rows.length === 0) return;

      const formPanel = el.closest('.overflow-hidden')?.previousElementSibling;
      const addLotFormDiv = formPanel?.querySelector('[key="add-lot-form"]') || 
                            document.querySelector(`[class*="overflow-hidden"] .bg-muted\\/10`);

      const panel = newArrivalPanelScrollRef.current;
      if (!panel || !vp) return;

      const availableHeight = vp.height;
      const formHeight = addLotFormDiv?.getBoundingClientRect().height || 120;
      const rowHeight = rows[0]?.getBoundingClientRect().height || 40;
      const headerHeight = el.querySelector('thead')?.getBoundingClientRect().height || 40;
      const threeRowsHeight = rowHeight * 3 + headerHeight;

      const targetScrollTop = Math.max(0, el.scrollHeight - threeRowsHeight);
      el.scrollTop = targetScrollTop;

      requestAnimationFrame(() => {
        if (addLotFormDiv instanceof HTMLElement) {
          addLotFormDiv.scrollIntoView({ block: 'start', behavior: 'smooth' });
          
          window.setTimeout(() => {
            const formRect = addLotFormDiv.getBoundingClientRect();
            const adjustment = Math.min(0, availableHeight - (formRect.bottom + threeRowsHeight + 20));
            if (adjustment < 0) {
              panel.scrollBy({ top: -adjustment, behavior: 'smooth' });
            }
          }, 150);
        }
      });
    };

    tryEnsure(0);
  }, []);

  const handleLotEntryFieldFocus = useCallback((sellerId: string) => {
    ensureLastThreeLotsVisible(sellerId);
    requestAnimationFrame(() => ensureLastThreeLotsVisible(sellerId));
    window.setTimeout(() => ensureLastThreeLotsVisible(sellerId), 120);
    window.setTimeout(() => ensureLastThreeLotsVisible(sellerId), 280);
    window.setTimeout(() => ensureLastThreeLotsVisible(sellerId), 520);
    window.setTimeout(() => ensureLastThreeLotsVisible(sellerId), 900);
    window.setTimeout(() => ensureLastThreeLotsVisible(sellerId), 1300);
  }, [ensureLastThreeLotsVisible]);

  const expandOnlySeller = useCallback((sellerId: string) => {
    setSellerExpanded(
      sellers.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.seller_vehicle_id] = entry.seller_vehicle_id === sellerId;
        return acc;
      }, {})
    );
  }, [sellers]);

  const isStep1PanelOpen =
    step === 1 &&
    !editLoading &&
    (isDesktop ? desktopTab === 'new-arrival' : showAdd);

  useAutofocusWhen(isStep1PanelOpen && isMultiSeller, vehicleNumberInputRef);
  useAutofocusWhen(isStep1PanelOpen && !isMultiSeller, loadedWeightInputRef);

  const isArrivalPanelOpen = isDesktop ? desktopTab === 'new-arrival' : showAdd;
  // Detect the "lots flow" context.
  // We hide printer + Net/Billable cards whenever the arrival editor/sheet is open,
  // since the lots-related UI is accessible from there and we can't reliably infer
  // the exact internal tab/step via `step` alone.
  const isLotsFlow = isArrivalPanelOpen;

  const serializeSellersForDirty = useCallback((list: SellerEntry[]) => {
    return list.map((s) => ({
      seller_vehicle_id: s.seller_vehicle_id,
      contact_id: s.contact_id,
      seller_serial_number: s.seller_serial_number ?? null,
      seller_name: s.seller_name,
      seller_phone: s.seller_phone,
      seller_mark: s.seller_mark,
      lots: s.lots.map((l) => ({
        lot_id: l.lot_id,
        lot_name: l.lot_name,
        lot_serial_number: l.lot_serial_number ?? null,
        quantity: l.quantity,
        commodity_name: l.commodity_name,
        broker_tag: l.broker_tag,
        variant: l.variant,
      })),
    }));
  }, []);

  const formatSellerSerialNumber = useCallback((sellerSerialNumber?: number | null) => {
    if (sellerSerialNumber == null || sellerSerialNumber < 1) return null;
    return String(sellerSerialNumber);
  }, []);

  const mapSellerInfoRows = useCallback((detailSellers: ArrivalFullDetail['sellers']) => {
    return detailSellers
      .map((seller, index) => ({ seller, index }))
      .sort((a, b) => {
        const aSerial =
          a.seller.sellerSerialNumber != null && a.seller.sellerSerialNumber > 0
            ? a.seller.sellerSerialNumber
            : Number.MAX_SAFE_INTEGER;
        const bSerial =
          b.seller.sellerSerialNumber != null && b.seller.sellerSerialNumber > 0
            ? b.seller.sellerSerialNumber
            : Number.MAX_SAFE_INTEGER;
        if (aSerial !== bSerial) return aSerial - bSerial;
        return a.index - b.index;
      })
      .map(({ seller }) => ({
        sellerSerialNumber: seller.sellerSerialNumber,
        sellerName: seller.sellerName,
        sellerMark: seller.sellerMark,
        lots: seller.lots.map((lot) => ({
          id: lot.id,
          lotName: lot.lotName,
          commodityName: lot.commodityName,
          bagCount: lot.bagCount,
          brokerTag: lot.brokerTag,
          variant: lot.variant,
        })),
      }));
  }, []);

  const isArrivalDirty = useMemo(() => {
    if (!isArrivalPanelOpen) return false;
    if (editLoading) return false;

    if (editingVehicleId != null) {
      if (!editBaselineSnapshotRef.current) return false;

      const currentSnapshot = JSON.stringify({
        step,
        isMultiSeller,
        vehicleNumber,
        loadedWeight,
        emptyWeight,
        deductedWeight,
        freightMethod,
        freightRate,
        freightKgs,
        noRental,
        advancePaid,
        brokerName,
        brokerContactId,
        narration,
        godown,
        gatepassNumber,
        origin,
        sellers: serializeSellersForDirty(sellers),
      });

      return currentSnapshot !== editBaselineSnapshotRef.current;
    }

    // New arrival: treat any user-entered progress as dirty,
    // even if validation fails and "Save" ends up disabled.
    const hasStep2Data = step > 1 || sellers.length > 0;
    if (hasStep2Data) return true;

    const hasMeaningfulStep1Data = [
      vehicleNumber.trim(),
      loadedWeight.trim(),
      emptyWeight.trim(),
      deductedWeight.trim(),
      freightMethod !== 'BY_WEIGHT' ? 'changedFreightMethod' : '',
      freightRate.trim(),
      freightKgs.trim() !== '1' ? freightKgs.trim() : '',
      noRental ? 'noRental' : '',
      advancePaid.trim(),
      brokerName.trim(),
      brokerContactId != null ? 'brokerSelected' : '',
      narration.trim(),
      godown.trim(),
      gatepassNumber.trim(),
      origin.trim(),
    ].some(Boolean);

    return hasMeaningfulStep1Data;
  }, [
    isArrivalPanelOpen,
    editLoading,
    editingVehicleId,
    step,
    isMultiSeller,
    vehicleNumber,
    loadedWeight,
    emptyWeight,
    deductedWeight,
    freightMethod,
    freightRate,
    freightKgs,
    noRental,
    advancePaid,
    brokerName,
    brokerContactId,
    narration,
    godown,
    gatepassNumber,
    origin,
    sellers,
    serializeSellersForDirty,
  ]);

  const buildPartialPayload = useCallback((): ArrivalCreatePayload => ({
    vehicle_number: isMultiSeller ? vehicleNumber.trim().toUpperCase() || undefined : undefined,
    is_multi_seller: isMultiSeller,
    loaded_weight: parseFloat(loadedWeight) || 0,
    empty_weight: parseFloat(emptyWeight) || 0,
    deducted_weight: parseFloat(deductedWeight) || 0,
    freight_method: freightMethod,
    freight_mode: freightMethod,
    freight_rate: parseFloat(freightRate) || 0,
    freight_kgs: freightMethod === 'BY_WEIGHT' ? (parseFloat(freightKgs) || 1) : undefined,
    no_rental: noRental,
    advance_paid: parseFloat(advancePaid) || 0,
    broker_name: brokerName || undefined,
    broker_contact_id: brokerContactId ?? undefined,
    narration: narration || undefined,
    godown: godown || undefined,
    gatepass_number: gatepassNumber || undefined,
    origin: origin || undefined,
    partially_completed: true,
    sellers: sellers.map(s => {
      const hasContactId = s.contact_id !== '' && !Number.isNaN(Number(s.contact_id));
      return {
        contact_id: hasContactId ? Number(s.contact_id) : null,
        seller_name: s.seller_name,
        seller_phone: s.seller_phone,
        seller_mark: s.seller_mark || undefined,
        lots: s.lots.map(l => ({
          lot_name: l.lot_name,
          quantity: l.quantity,
          commodity_name: l.commodity_name,
          broker_tag: l.broker_tag || undefined,
          variant: l.variant || undefined,
        })),
      };
    }),
  }), [isMultiSeller, vehicleNumber, loadedWeight, emptyWeight, deductedWeight, freightMethod, freightRate, freightKgs, noRental, advancePaid, brokerName, brokerContactId, narration, godown, gatepassNumber, origin, sellers]);

  const handlePartialSave = useCallback(async (): Promise<boolean> => {
    try {
      if (editingVehicleId != null) {
        const payload = buildPartialPayload();
        await arrivalsApi.update(editingVehicleId, {
          vehicle_number: payload.vehicle_number,
          godown: payload.godown,
          gatepass_number: payload.gatepass_number,
          origin: payload.origin,
          broker_name: payload.broker_name,
          broker_contact_id: payload.broker_contact_id,
          narration: payload.narration,
          loaded_weight: payload.loaded_weight,
          empty_weight: payload.empty_weight,
          deducted_weight: payload.deducted_weight,
          freight_method: payload.freight_method,
          freight_rate: payload.freight_rate,
          freight_kgs: payload.freight_kgs,
          no_rental: payload.no_rental,
          advance_paid: payload.advance_paid,
          multi_seller: payload.is_multi_seller,
          partially_completed: true,
          sellers: payload.sellers,
        });
      } else {
        await arrivalsApi.create(buildPartialPayload());
      }
      await loadArrivalsFromApi();
      await loadContactsFromApi();
      resetForm();
      toast.success('Partial arrival saved');
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save partial data');
      return false;
    }
  }, [editingVehicleId, buildPartialPayload]);

  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isArrivalDirty,
    title: 'Save your progress?',
    description: 'You have unsaved changes. Would you like to save your progress before leaving?',
    continueLabel: 'Save',
    stayLabel: 'Cancel',
    onBeforeContinue: handlePartialSave,
  });

  const tryCloseArrivalPanel = useCallback(
    async (closeFn: () => void) => {
      const ok = await confirmIfDirty();
      if (!ok) return;
      closeFn();
    },
    [confirmIfDirty],
  );

  const openNewArrivalPanel = useCallback(() => {
    void (async () => {
      const ok = await confirmIfDirty();
      if (!ok) return;
      resetForm();
      setDesktopTab('new-arrival');
    })();
  }, [confirmIfDirty]);

  const refreshBrokerDropdownPos = useCallback(() => {
    const el = brokerSearchWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : rect.width;
    const pad = 12;
    const maxW = Math.max(0, vw - pad * 2);
    const minReadableW = Math.min(320, maxW);
    let width = Math.max(rect.width, minReadableW);
    width = Math.min(width, maxW);
    let left = rect.left;
    if (left + width > vw - pad) left = Math.max(pad, vw - pad - width);
    if (left < pad) left = pad;
    setBrokerDropdownPos({ top: rect.bottom + 4, left, width });
  }, []);

  // ── Validation (raghav branch: field-level checks; no UI wiring — validation only) ──────────────────
  const isLoadedWeightInvalid = useMemo(() => {
    if (!loadedWeight || !loadedWeight.trim()) return false;
    const lw = parseFloat(loadedWeight);
    if (Number.isNaN(lw)) return true;
    return lw < 0 || lw > 100000;
  }, [loadedWeight]);

  const isEmptyWeightInvalid = useMemo(() => {
    if (!emptyWeight || !emptyWeight.trim()) return false;
    const lw = parseFloat(loadedWeight) || 0;
    const ew = parseFloat(emptyWeight) || 0;
    if (Number.isNaN(parseFloat(emptyWeight))) return true;
    if (ew < 0 || ew > 100000) return true;
    return ew > lw;
  }, [loadedWeight, emptyWeight]);

  const isDeductedWeightInvalid = useMemo(() => {
    if (!deductedWeight || !deductedWeight.trim()) return false;
    const dw = parseFloat(deductedWeight) || 0;
    return dw < 0 || dw > 10000;
  }, [deductedWeight]);

  const isVehicleNumberInvalid = useMemo(() => {
    if (!isMultiSeller) return false;
    const v = vehicleNumber.trim();
    if (!v) return false;
    return v.length < 2 || v.length > 12;
  }, [isMultiSeller, vehicleNumber]);

  const isGodownInvalid = useMemo(() => {
    const g = godown.trim();
    if (!g) return false;
    if (g.length < 2 || g.length > 50) return true;
    return !/^[a-zA-Z\s]+$/.test(g);
  }, [godown]);

  const isGatepassNumberInvalid = useMemo(() => {
    const g = gatepassNumber.trim();
    if (!g) return false;
    if (g.length < 1 || g.length > 30) return true;
    return !/^[a-zA-Z0-9]+$/.test(g);
  }, [gatepassNumber]);

  const isBrokerNameInvalid = useMemo(() => {
    const b = brokerName.trim();
    if (!b) return false;
    if (b.length < 2 || b.length > 100) return true;
    return !/^[a-zA-Z\s]+$/.test(b);
  }, [brokerName]);

  const isFreightRateInvalid = useMemo(() => {
    if (noRental) return false;
    if (!freightRate || !freightRate.trim()) return false;
    const fr = parseFloat(freightRate);
    if (Number.isNaN(fr)) return true;
    return fr < 0 || fr > 100000;
  }, [noRental, freightRate]);

  const isFreightKgsInvalid = useMemo(() => {
    if (noRental || freightMethod !== 'BY_WEIGHT') return false;
    if (!freightKgs || !freightKgs.trim()) return false;
    const kgs = parseFloat(freightKgs);
    if (Number.isNaN(kgs)) return true;
    return kgs <= 0 || kgs > 100000;
  }, [noRental, freightMethod, freightKgs]);

  const isAdvancePaidInvalid = useMemo(() => {
    if (!advancePaid || !advancePaid.trim()) return false;
    const ap = parseFloat(advancePaid) || 0;
    return ap < 0 || ap > 1000000;
  }, [advancePaid]);

  // Per-seller / per-lot real-time validation (same rules as submit; used for inline UI only)
  const isSellerNameInvalid = (s: SellerEntry) => {
    if (s.contact_id !== '' && !Number.isNaN(Number(s.contact_id))) return false;
    const n = (s.seller_name ?? '').trim();
    if (!n) return false; // required is enforced on submit
    return n.length < 2 || n.length > 100;
  };
  const isSellerMarkInvalid = (s: SellerEntry, sellerIdx?: number) => !!getSellerMarkError(s, sellerIdx);
  const getSellerMarkError = (s: SellerEntry, sellerIdx?: number): string | null => {
    const m = (s.seller_mark ?? '').trim();
    if (!m) return null;
    if (m.length < 2 || m.length > 50) return '2–50 characters if set';
    const markLower = m.toLowerCase();
    const dupIdx = sellers.findIndex((o, i) => i !== sellerIdx && (o.seller_mark ?? '').trim().toLowerCase() === markLower);
    if (dupIdx >= 0) return 'This mark is already in use by another seller';
    const isDynamic = s.contact_id === '' || Number.isNaN(Number(s.contact_id));
    if (isDynamic && contacts.some(c => c.mark && c.mark.toLowerCase() === markLower)) return 'This mark is already in use by a contact';
    return null;
  };
  const hasIncompleteSellerDetails = useMemo(() => {
    return sellers.some((s, sellerIdx) => {
      const sellerName = (s.seller_name ?? '').trim();
      if (!sellerName) return true;
      if (isSellerNameInvalid(s)) return true;
      if (isSellerMarkInvalid(s, sellerIdx)) return true;
      return false;
    });
  }, [sellers, contacts]);
  const isLotNameInvalid = (l: LotEntry) => {
    const ln = (l.lot_name ?? '').trim();
    if (!ln) return false;
    if (ln.length < 2 || ln.length > 50) return true;
    // Lot names are stored and submitted as strings; allow alphanumeric plus common separators.
    return !/^[a-zA-Z0-9][a-zA-Z0-9\s_\-]*$/.test(ln);
  };
  const isLotQuantityInvalid = (l: LotEntry) => {
    const q = l.quantity ?? 0;
    if (q === 0) return false;
    return q < 0 || q > 100000 || !Number.isInteger(q);
  };

  const lotNameCountsBySellerId = useMemo(() => {
    return sellers.reduce<Record<string, Record<string, number>>>((acc, seller) => {
      const inner: Record<string, number> = {};
      for (const lot of seller.lots) {
        const key = (lot.lot_name ?? '').trim().toLowerCase();
        if (!key) continue;
        inner[key] = (inner[key] ?? 0) + 1;
      }
      acc[seller.seller_vehicle_id] = inner;
      return acc;
    }, {});
  }, [sellers]);

  const getLotNameDuplicateError = (sellerIdx: number, lotIdx: number): string | null => {
    const seller = sellers[sellerIdx];
    const lot = seller?.lots[lotIdx];
    const ln = (lot?.lot_name ?? '').trim();
    if (!ln) return null;
    const counts = lotNameCountsBySellerId[seller?.seller_vehicle_id ?? ''] ?? {};
    return (counts[ln.toLowerCase()] ?? 0) > 1 ? 'Lot Name already exists for this seller' : null;
  };

  const isLotNameDuplicateInvalid = (sellerIdx: number, lotIdx: number) =>
    getLotNameDuplicateError(sellerIdx, lotIdx) != null;

  const canAddAnotherLot = (seller: SellerEntry) => {
    if (seller.lots.length === 0) return true;
    const counts = lotNameCountsBySellerId[seller.seller_vehicle_id] ?? {};
    return seller.lots.every((lot) => {
      const lotName = (lot.lot_name ?? '').trim();
      if (!lotName) return false;
      const key = lotName.toLowerCase();
      if ((counts[key] ?? 0) > 1) return false;
      return !isLotNameInvalid(lot) && !isLotQuantityInvalid(lot);
    });
  };

  const isFormInvalid = useMemo(() => {
    if (isVehicleNumberInvalid || isLoadedWeightInvalid || isEmptyWeightInvalid || isDeductedWeightInvalid ||
        isGodownInvalid || isGatepassNumberInvalid || isBrokerNameInvalid || isFreightRateInvalid || isFreightKgsInvalid || isAdvancePaidInvalid) return true;
    for (let i = 0; i < sellers.length; i++) {
      const s = sellers[i];
      if (isSellerNameInvalid(s) || isSellerMarkInvalid(s, i)) return true;
      for (let li = 0; li < s.lots.length; li++) {
        const l = s.lots[li];
        if (isLotNameInvalid(l) || isLotQuantityInvalid(l) || isLotNameDuplicateInvalid(i, li)) return true;
      }
    }
    return false;
  }, [isVehicleNumberInvalid, isLoadedWeightInvalid, isEmptyWeightInvalid, isDeductedWeightInvalid, isGodownInvalid, isGatepassNumberInvalid, isBrokerNameInvalid, isFreightRateInvalid, isFreightKgsInvalid, isAdvancePaidInvalid, sellers, contacts, lotNameCountsBySellerId, isLotNameDuplicateInvalid, isSellerMarkInvalid]);

  // Summary stats for four cards (mobile-first, same as raghav-style UI)
  const totalVehicles = useMemo(() => apiArrivals.length, [apiArrivals]);
  const totalSellers = useMemo(() => apiArrivals.reduce((acc, a) => acc + (a.sellerCount ?? 0), 0), [apiArrivals]);
  const totalLots = useMemo(() => apiArrivals.reduce((acc, a) => acc + (a.lotCount ?? 0), 0), [apiArrivals]);
  const totalNetWeightKg = useMemo(() => apiArrivals.reduce((acc, a) => acc + (a.netWeight ?? 0), 0), [apiArrivals]);
  const totalNetWeightTons = useMemo(() => (totalNetWeightKg > 0 ? totalNetWeightKg / 1000 : 0), [totalNetWeightKg]);

  const filteredArrivals = useMemo(() => {
    const source =
      statusFilter === 'PARTIALLY_COMPLETED'
        ? partialArrivals
        : statusFilter === 'ALL'
          ? [...apiArrivals, ...partialArrivals]
          : apiArrivals;
    let result = source;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(a => {
        if (String(a.vehicleNumber).toLowerCase().includes(q)) return true;
        const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
        if (detail?.sellers?.some(s => (s.sellerName ?? '').toLowerCase().includes(q))) return true;
        return false;
      });
    }
    if (statusFilter === 'PENDING' || statusFilter === 'WEIGHED' || statusFilter === 'AUCTIONED' || statusFilter === 'SETTLED') {
      result = result.filter(a => getArrivalStatus(a) === statusFilter);
    }
    return result;
  }, [apiArrivals, partialArrivals, searchQuery, statusFilter, arrivalDetails]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      ALL: apiArrivals.length + partialArrivals.length,
      PENDING: 0, WEIGHED: 0, AUCTIONED: 0, SETTLED: 0, PARTIALLY_COMPLETED: partialArrivals.length,
    };
    apiArrivals.forEach(a => {
      const s = getArrivalStatus(a);
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  }, [apiArrivals, partialArrivals]);

  const statusLabel = (s: ArrivalStatus | string): string => {
    if (s === 'PARTIALLY_COMPLETED') return 'Partially Completed';
    return s.charAt(0) + s.slice(1).toLowerCase();
  };
  const activeArrivalsLoading =
    statusFilter === 'ALL'
      ? apiArrivalsLoading || partialArrivalsLoading
      : statusFilter === 'PARTIALLY_COMPLETED'
        ? partialArrivalsLoading
        : apiArrivalsLoading;

  const loadArrivalsFromApi = useCallback(async () => {
    setApiArrivalsLoading(true);
    setPartialArrivalsLoading(true);
    try {
      // Always load full arrivals list so summary counts stay stable across filter changes.
      const list = await arrivalsApi.list(0, 100, undefined, false);
      setApiArrivals(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load arrivals';
      toast.error(message);
      setApiArrivals([]);
    } finally {
      setApiArrivalsLoading(false);
    }
    arrivalsApi.list(0, 100, undefined, true).then(setPartialArrivals).catch(() => setPartialArrivals([])).finally(() => setPartialArrivalsLoading(false));
    arrivalsApi.listDetail(0, 500).then(setArrivalDetails).catch(() => setArrivalDetails([]));
  }, []);

  const loadContactsFromApi = useCallback(async () => {
    try {
      const loaded = await contactApi.list({ scope: 'participants' });
      setContacts(loaded);
    } catch (err) {
      console.error('Failed to reload contacts:', err);
    }
  }, []);

  useEffect(() => {
    contactApi.list({ scope: 'participants' }).then(setContacts);
    commodityApi.list().then(setCommodities);
    commodityApi.getAllFullConfigs().then(setCommodityConfigs);
  }, []);

  useEffect(() => {
    loadArrivalsFromApi();
  }, [loadArrivalsFromApi]);

  // Close broker dropdown on scroll or resize (same: close when any scroll happens so it doesn't stay stuck)
  useEffect(() => {
    if (!brokerDropdown) return;
    const close = () => setBrokerDropdown(false);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [brokerDropdown]);

  // Close seller dropdown on scroll/resize (portal is fixed-position)
  useEffect(() => {
    if (!sellerDropdown) return;
    const close = () => setSellerDropdown(false);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [sellerDropdown]);

  // Keep refs in sync for rapid-click append-only safety.
  useEffect(() => {
    isMultiSellerRef.current = isMultiSeller;
  }, [isMultiSeller]);
  useEffect(() => {
    sellerCountRef.current = sellers.length;
  }, [sellers.length]);

  // REQ-ARR-001: Tonnage Calculation
  const netWeight = useMemo(() => {
    const lw = parseFloat(loadedWeight) || 0;
    const ew = parseFloat(emptyWeight) || 0;
    return Math.max(0, lw - ew);
  }, [loadedWeight, emptyWeight]);

  // REQ-ARR-010: Efficient bag totals (avoid O(n^2) recalcs per lot row).
  const vehicleTotalBags = useMemo(() => {
    return sellers.reduce(
      (sum, s) => sum + s.lots.reduce((inner, lot) => inner + (lot.quantity || 0), 0),
      0
    );
  }, [sellers]);

  const sellerTotalBagsById = useMemo(() => {
    return sellers.reduce<Record<string, number>>((acc, s) => {
      acc[s.seller_vehicle_id] = s.lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
      return acc;
    }, {});
  }, [sellers]);

  const finalBillableWeight = useMemo(() => {
    const dw = parseFloat(deductedWeight) || 0;
    return Math.max(0, netWeight - dw);
  }, [netWeight, deductedWeight]);

  // Freight calculation (REQ-ARR-012)
  const freightTotal = useMemo(() => {
    if (noRental) return 0;
    const rate = parseFloat(freightRate) || 0;
    switch (freightMethod) {
      case 'BY_WEIGHT': {
        const kgs = parseFloat(freightKgs) || 0;
        if (kgs <= 0) return 0;
        return (finalBillableWeight * rate) / kgs;
      }
      case 'BY_COUNT': {
        const totalBags = sellers.reduce((s, sel) => s + sel.lots.reduce((ls, l) => ls + l.quantity, 0), 0);
        return totalBags * rate;
      }
      case 'LUMPSUM': return rate;
      case 'DIVIDE_BY_WEIGHT': return rate; // Distributed proportionally later (REQ-ARR-002)
      default: return 0;
    }
  }, [freightMethod, freightRate, freightKgs, noRental, finalBillableWeight, sellers]);

  // Broker: filter contacts by name, phone, or mark (same as seller search)
  const filteredBrokers = useMemo(() => {
    if (!brokerName.trim()) return [];
    const q = brokerName.toLowerCase().trim();
    return contacts.filter(c =>
      (c.name?.toLowerCase()?.includes(q)) ||
      (c.phone?.includes(q)) ||
      (c.mark?.toLowerCase()?.includes(q))
    ).slice(0, 8);
  }, [brokerName, contacts]);

  // Seller suggestions for "Name" input in the add panel.
  const filteredContacts = useMemo(() => {
    const query = activeSellerSearch?.query?.trim();
    if (!query) return [];
    const q = query.toLowerCase();
    return contacts.filter(c =>
      (c.name?.toLowerCase()?.includes(q)) ||
      (c.phone?.includes(q)) ||
      (c.mark?.toLowerCase()?.includes(q))
    ).slice(0, 5);
  }, [activeSellerSearch, contacts]);

  const refreshSellerDropdownPos = useCallback((sellerId: string) => {
    const el = sellerNameInputWrapRefs.current[sellerId];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : rect.width;
    const pad = 12;
    const maxW = Math.max(0, vw - pad * 2);
    // Prefer at least ~min(320px, viewport) so suggestion rows aren’t crushed beside the Add Seller button.
    const minReadableW = Math.min(320, maxW);
    let width = Math.max(rect.width, minReadableW);
    width = Math.min(width, maxW);
    let left = rect.left;
    if (left + width > vw - pad) left = Math.max(pad, vw - pad - width);
    if (left < pad) left = pad;
    setSellerDropdownPos({ top: rect.bottom + 4, left, width });
  }, []);

  /** Append an empty seller card immediately (free-text seller). */
  const addSellerInstant = (sellerName?: string, sellerMark?: string) => {
    if (!isMultiSellerRef.current && sellerCountRef.current >= 1) {
      toast.error('Single-seller arrival allows only one seller');
      return;
    }
    if (hasIncompleteSellerDetails) {
      toast.error('Complete existing seller details before adding a new seller');
      return;
    }

    const newSellerId = crypto.randomUUID();
    const newSeller: SellerEntry = {
      seller_vehicle_id: newSellerId,
      contact_id: '',
      seller_serial_number: null,
      seller_name: sellerName ?? '',
      seller_phone: '',
      seller_mark: sellerMark ?? '',
      lots: [],
    };

    sellerCountRef.current += 1;
    setSellers(prev => [...prev, newSeller]);
    setSellerExpanded(prev => ({ ...prev, [newSellerId]: false }));

    pendingSellerFocusIdRef.current = newSellerId;
    setSellerFocusNonce(n => n + 1);
  };

  const fillSellerRowFromContact = (sellerId: string, contact: Contact) => {
    const contactId = contact.contact_id != null ? String(contact.contact_id) : '';
    if (sellers.some(s => s.seller_vehicle_id !== sellerId && s.contact_id === contactId)) {
      toast.error('Seller already added to this vehicle');
      return;
    }
    setSellers(prev => prev.map((s) => (
      s.seller_vehicle_id !== sellerId
        ? s
        : {
            ...s,
            contact_id: contactId,
            seller_name: contact.name ?? '',
            seller_phone: contact.phone ?? '',
            seller_mark: contact.mark ?? '',
          }
    )));
    setActiveSellerSearch(null);
    setSellerDropdown(false);
  };

  const collapseOpenSellerSectionsBeforeAdd = () => {
    setSellerExpanded(
      sellers.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.seller_vehicle_id] = false;
        return acc;
      }, {})
    );
    setAddLotForm(null);
    setActiveSellerSearch(null);
    setSellerDropdown(false);
  };

  const openSellerSearchPanel = () => {
    if (hasIncompleteSellerDetails) {
      toast.error('Complete existing seller details before adding a new seller');
      return;
    }
    collapseOpenSellerSectionsBeforeAdd();
    addSellerInstant('', '');
  };

  const updateSellerNameWithSuggestions = (
    sellerIdx: number,
    sellerId: string,
    sellerName: string
  ) => {
    updateSeller(sellerIdx, { seller_name: sellerName, contact_id: '', seller_phone: '' });
    const trimmed = sellerName.trim();
    if (!trimmed) {
      setActiveSellerSearch(null);
      setSellerDropdown(false);
      return;
    }
    setActiveSellerSearch({ sellerId, query: sellerName });
    refreshSellerDropdownPos(sellerId);
    setSellerDropdown(true);
  };

  const updateSeller = (sellerIdx: number, updates: Partial<Pick<SellerEntry, 'contact_id' | 'seller_name' | 'seller_phone' | 'seller_mark'>>) => {
    setSellers(prev => prev.map((s, i) => (i !== sellerIdx ? s : { ...s, ...updates })));
  };

  const removeSeller = (idx: number) => {
    const sellerToRemove = sellers[idx];
    setSellers(prev => prev.filter((_, i) => i !== idx));
    if (sellerToRemove?.seller_vehicle_id) {
      if (activeSellerSearch?.sellerId === sellerToRemove.seller_vehicle_id) {
        setActiveSellerSearch(null);
        setSellerDropdown(false);
      }
      setSellerExpanded(prev => {
        const next = { ...prev };
        delete next[sellerToRemove.seller_vehicle_id];
        return next;
      });
      // Clean up keyboard trigger tracking for this seller
      sellerKeyboardTriggeredRef.current.delete(sellerToRemove.seller_vehicle_id);
    }
  };

  // REQ-ARR-005: Lot Identification
  const addLot = (sellerIdx: number) => {
    const seller = sellers[sellerIdx];
    if (!seller) return;
    if (!canAddAnotherLot(seller)) return;

    pendingLotsScrollToEndSellerIdRef.current = seller.seller_vehicle_id;
    expandOnlySeller(seller.seller_vehicle_id);

    setSellers(prev => {
      const existingLotSerials = new Set(
        prev
          .flatMap((entry) => entry.lots)
          .map((lot) => lot.lot_serial_number)
          .filter((lotSerialNumber): lotSerialNumber is number => lotSerialNumber != null && lotSerialNumber >= 1)
      );
      let candidate = existingLotSerials.size > 0 ? Math.max(...existingLotSerials) : 0;
      let nextLotSerialNumber: number | null = null;
      for (let attempt = 0; attempt < 9999; attempt += 1) {
        candidate = candidate >= 9999 ? 1 : candidate + 1;
        if (!existingLotSerials.has(candidate)) {
          nextLotSerialNumber = candidate;
          break;
        }
      }
      if (nextLotSerialNumber == null) return prev;

      return prev.map((s, i) => {
        if (i !== sellerIdx) return s;
        if (!canAddAnotherLot(s)) return s;
        return {
          ...s,
          lots: [...s.lots, {
            lot_id: crypto.randomUUID(),
            lot_name: '',
            lot_serial_number: nextLotSerialNumber,
            quantity: 0,
            commodity_name: commodities[0]?.commodity_name || '',
            broker_tag: '',
            variant: '',
          }],
        };
      });
    });
  };

  const saveFormLot = (sellerIdx: number) => {
    if (!addLotForm) return;
    const sellerId = addLotForm.sellerId;

    // Validate
    const errors: AddLotFormState['errors'] = {};
    const trimmedName = addLotForm.lotName.trim();
    const bagsNum = parseInt(addLotForm.bags, 10);

    if (!trimmedName) errors.lotName = 'Lot name is required';
    if (!addLotForm.bags || isNaN(bagsNum) || bagsNum <= 0)
      errors.bags = 'Enter a valid bag count (> 0)';
    if (!addLotForm.commodityName.trim()) errors.commodity = 'Select a commodity';

    // Duplicate name check (excluding current lot in edit mode)
    const isDuplicate = sellers[sellerIdx]?.lots.some(
      (l) => l.lot_id !== addLotForm.editingLotId &&
             l.lot_name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) errors.lotName = 'Lot name already exists for this seller';

    if (Object.keys(errors).length > 0) {
      setAddLotForm(prev => prev ? { ...prev, errors } : null);
      return;
    }

    // Edit mode: update existing lot
    if (addLotForm.editingLotId !== undefined && addLotForm.editingLotIdx !== undefined) {
      updateLot(sellerIdx, addLotForm.editingLotIdx, {
        lot_name: trimmedName,
        quantity: bagsNum,
        commodity_name: addLotForm.commodityName,
        variant: addLotForm.variant,
      });
      toast.success(`Lot "${trimmedName}" updated successfully`);
      setAddLotForm({
        sellerId,
        lotName: "",
        bags: "",
        commodityName: commodities[0]?.commodity_name || "",
        variant: "",
        errors: {},
      });
      return;
    }

    // Create mode: reuse serial-number logic from addLot
    setSellers(prev => {
      const existingLotSerials = new Set(
        prev.flatMap(e => e.lots)
          .map(l => l.lot_serial_number)
          .filter((n): n is number => n != null && n >= 1)
      );
      let candidate = existingLotSerials.size > 0 ? Math.max(...existingLotSerials) : 0;
      let nextSerial: number | null = null;
      for (let attempt = 0; attempt < 9999; attempt++) {
        candidate = candidate >= 9999 ? 1 : candidate + 1;
        if (!existingLotSerials.has(candidate)) { nextSerial = candidate; break; }
      }
      if (nextSerial == null) return prev;

      return prev.map((s, i) => {
        if (i !== sellerIdx) return s;
        return {
          ...s,
          lots: [...s.lots, {
            lot_id: crypto.randomUUID(),
            lot_name: trimmedName,
            lot_serial_number: nextSerial,
            quantity: bagsNum,
            commodity_name: addLotForm.commodityName,
            broker_tag: '',
            variant: addLotForm.variant,
          }],
        };
      });
    });

    // Expand seller panel and close form
    expandOnlySeller(sellerId);
    pendingLotsScrollToEndSellerIdRef.current = sellerId;
    toast.success(`Lot "${trimmedName}" added successfully`);
    setAddLotForm({
      sellerId,
      lotName: "",
      bags: "",
      commodityName: commodities[0]?.commodity_name || "",
      variant: "",
      errors: {},
    });
  };

  const editFormLot = (si: number, li: number) => {
    const seller = sellers[si];
    const lot = seller?.lots[li];
    if (!seller || !lot) return;
    setAddLotForm({
      sellerId: seller.seller_vehicle_id,
      lotName: lot.lot_name,
      bags: String(lot.quantity),
      commodityName: lot.commodity_name,
      variant: lot.variant ?? "",
      errors: {},
      editingLotId: lot.lot_id,
      editingLotIdx: li,
    });
  };

  // Scroll the seller's lots panel to the newly added lot (internal scroll only).
  // useLayoutEffect runs synchronously after React commits the DOM (before the browser
  // paints and before MutationObserver microtasks fire), so KeyboardAvoidance's
  // ensureVisible calls always see the panel already scrolled to the correct position.
  useLayoutEffect(() => {
    const sellerId = pendingLotsScrollToEndSellerIdRef.current;
    if (!sellerId) return;
    scrollSellerLotsToLatest(sellerId);
    pendingLotsScrollToEndSellerIdRef.current = null;

    // Mobile fix: when "+ Add Lot" auto-focuses the new input, focus is applied
    // with preventScroll and the full-screen sheet's scroller may not move,
    // leaving the new field under the keyboard. After we scroll the inner lots
    // panel to the end, also nudge the outer "New Arrival" panel scroller to
    // reveal the currently focused input.
    const panel = newArrivalPanelScrollRef.current;
    if (!panel) return;

    const tryBringActiveIntoView = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      if (!panel.contains(active)) return;
      active.scrollIntoView({ block: 'center' });
    };

    // Retry at multiple intervals. The keyboard may not be open immediately,
    // but will open shortly after focus. Longer delays ensure we catch both
    // the initial scroll and the keyboard appearance timing.
    requestAnimationFrame(tryBringActiveIntoView);
    window.setTimeout(tryBringActiveIntoView, 120);
    window.setTimeout(tryBringActiveIntoView, 280);
    window.setTimeout(tryBringActiveIntoView, 520);
    window.setTimeout(tryBringActiveIntoView, 900);
    window.setTimeout(tryBringActiveIntoView, 1300);
    window.setTimeout(tryBringActiveIntoView, 2000);
    window.setTimeout(tryBringActiveIntoView, 2500);
    window.setTimeout(tryBringActiveIntoView, 3500);
  }, [sellers, sellerExpanded, scrollSellerLotsToLatest]);

  // Scroll + focus the seller card input created by the “Add Seller” button.
  useLayoutEffect(() => {
    const sellerId = pendingSellerFocusIdRef.current;
    if (!sellerId) return;

    const ensureSellerInputVisible = () => {
      const input = sellerNameInputRefs.current[sellerId];
      if (!input) return;

      pendingSellerFocusIdRef.current = null;

      input.scrollIntoView({ block: 'center', behavior: 'auto' });
      
      // Focus the input to ensure it's active
      input.focus({ preventScroll: false });
      
      // Aggressively ensure keyboard opens on mobile/tablet.
      // Many mobile browsers don't open the keyboard for programmatic focus().
      // We use multiple strategies to maximize reliability.
      if (Capacitor.isNativePlatform() && !sellerKeyboardTriggeredRef.current.has(sellerId)) {
        sellerKeyboardTriggeredRef.current.add(sellerId);
        
        // Strategy 1: Simulate a click event (works on most browsers)
        requestAnimationFrame(() => {
          if (document.activeElement === input) {
            input.click();
          }
        });
        
        // Strategy 2: Try to explicitly show the keyboard via Capacitor API
        // This is more reliable than click() on some Android devices
        window.setTimeout(() => {
          if (document.activeElement === input) {
            Keyboard.show().catch(() => {
              // Keyboard.show() may fail if not supported or if keyboard
              // is already showing - this is fine, we have other fallbacks
            });
          }
        }, 100);
        
        // Strategy 3: Dispatch a native touch event as a last resort
        // This simulates an actual user tap more accurately
        window.setTimeout(() => {
          if (document.activeElement === input) {
            const touchEvent = new TouchEvent('touchstart', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            input.dispatchEvent(touchEvent);
          }
        }, 150);
      }

      // Mobile keyboard: keep nudging the active element into view after focus.
      // The keyboard may not be open immediately when focus is applied, but will
      // open shortly after. Continue retrying to handle both the initial scroll
      // and the keyboard appearance timing. KeyboardAvoidance will also help, but
      // these retries ensure the scroll happens even if timing is off.
      const panel = newArrivalPanelScrollRef.current;
      if (!panel) return;

      const tryBringActiveIntoView = () => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return;
        if (!panel.contains(active)) return;
        active.scrollIntoView({ block: 'center' });
      };

      // Retry at multiple intervals to cover both pre-keyboard and post-keyboard
      // scroll needs. Longer delays (up to 3500ms) ensure we catch the keyboard
      // opening and any layout shifts that follow.
      requestAnimationFrame(tryBringActiveIntoView);
      window.setTimeout(tryBringActiveIntoView, 120);
      window.setTimeout(tryBringActiveIntoView, 280);
      window.setTimeout(tryBringActiveIntoView, 520);
      window.setTimeout(tryBringActiveIntoView, 900);
      window.setTimeout(tryBringActiveIntoView, 1300);
      window.setTimeout(tryBringActiveIntoView, 2000);
      window.setTimeout(tryBringActiveIntoView, 2500);
      window.setTimeout(tryBringActiveIntoView, 3500);
    };

    // The newly added seller card can mount a little later on mobile due to
    // render + animation timing. Retry to avoid missing the first focus cycle.
    requestAnimationFrame(ensureSellerInputVisible);
    window.setTimeout(ensureSellerInputVisible, 80);
    window.setTimeout(ensureSellerInputVisible, 180);
    window.setTimeout(ensureSellerInputVisible, 320);
    window.setTimeout(ensureSellerInputVisible, 520);
    window.setTimeout(ensureSellerInputVisible, 900);
    window.setTimeout(ensureSellerInputVisible, 1300);
    window.setTimeout(ensureSellerInputVisible, 2000);
    window.setTimeout(ensureSellerInputVisible, 2500);
  }, [sellerFocusNonce, sellers]);

  const updateLot = (sellerIdx: number, lotIdx: number, updates: Partial<LotEntry>) => {
    setSellers(prev => prev.map((s, i) => {
      if (i !== sellerIdx) return s;
      return {
        ...s,
        lots: s.lots.map((l, li) => li === lotIdx ? { ...l, ...updates } : l),
      };
    }));
  };

  const removeLot = (sellerIdx: number, lotIdx: number) => {
    setSellers(prev => prev.map((s, i) => {
      if (i !== sellerIdx) return s;
      return { ...s, lots: s.lots.filter((_, li) => li !== lotIdx) };
    }));
  };

  // REQ-ARR-013: Outlier validation (uses commodity config from API)
  const validateWeightOutliers = (): string[] => {
    const warnings: string[] = [];
    sellers.forEach(seller => {
      seller.lots.forEach(lot => {
        const comm = commodities.find((cm: any) => cm.commodity_name === lot.commodity_name);
        const fullCfg = comm ? commodityConfigs.find((c: any) => String(c.commodityId) === String(comm.commodity_id)) : null;
        const cfg = fullCfg?.config;
        if (cfg && cfg.minWeight > 0 && cfg.maxWeight > 0) {
          if (lot.quantity < cfg.minWeight / 50 || lot.quantity > cfg.maxWeight / 10) {
            warnings.push(`⚠️ ${lot.lot_name || 'Unnamed lot'} (${lot.commodity_name}): Quantity ${lot.quantity} bags may be outside normal range`);
          }
        }
      });
    });
    return warnings;
  };

  const handleSubmitArrival = async () => {
    // Submit should never block users with validations.
    // If required fields for completion aren't present, save as draft (partial) instead.
    const base = buildPartialPayload();
    const normalizedForSubmit = sanitizeSubmitPayload(base);
    const shouldComplete = isCompleteArrivalForSubmit({
      vehicle_number: normalizedForSubmit.vehicle_number,
      is_multi_seller: normalizedForSubmit.is_multi_seller,
      sellers: normalizedForSubmit.sellers,
    });

    if (editingVehicleId != null) {
      if (!shouldComplete) {
        await handlePartialSave();
        return;
      }
      await handleUpdateArrival(); // completed update path
      return;
    }

    if (!can('Arrivals', 'Create')) {
      toast.error('You do not have permission to create arrivals.');
      return;
    }

    try {
      const created = await arrivalsApi.create({
        ...(shouldComplete ? normalizedForSubmit : base),
        partially_completed: !shouldComplete,
      });
      await loadArrivalsFromApi();
      await loadContactsFromApi();
      resetForm();
      setShowAdd(false);
      setDesktopTab('summary');
      if (shouldComplete) {
        toast.success(`✅ Vehicle ${created.vehicleNumber} registered with ${created.sellerCount} seller(s) and ${created.lotCount} lot(s)`);
      } else {
        toast.success('Draft saved');
      }
    } catch (err) {
      console.error('Submit arrival error:', err);
      const message = err instanceof Error ? err.message : 'Failed to submit arrival. Please try again.';
      toast.error(message);
    }
  };

  const resetForm = () => {
    setStep(1);
    setVehicleNumber('');
    setLoadedWeight('');
    setEmptyWeight('');
    setDeductedWeight('');
    setFreightMethod('BY_WEIGHT');
    setFreightRate('');
    setFreightKgs('1');
    setNoRental(false);
    setAdvancePaid('');
    setBrokerName('');
    setBrokerContactId(null);
    setNarration('');
    setGodown('');
    setGatepassNumber('');
    setOrigin('');
    setSellers([]);
    setSellerExpanded({});
    setActiveSellerSearch(null);
    setSellerDropdown(false);
    setIsMultiSeller(true);
    setEditingVehicleId(null);
    editBaselineSnapshotRef.current = null;
    // Clear keyboard trigger tracking when form is reset
    sellerKeyboardTriggeredRef.current.clear();
  };

  const loadExpandedDetail = async (vehicleId: number | string) => {
    if (sameArrivalVehicleId(expandedDetail?.vehicleId, vehicleId)) {
      setExpandedDetail(null);
      return;
    }
    setExpandedDetailLoading(true);
    try {
      const detail = await arrivalsApi.getById(vehicleId);
      setExpandedDetail(detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load detail');
      setExpandedDetail(null);
    } finally {
      setExpandedDetailLoading(false);
    }
  };

  const handleDeleteArrival = async (vehicleId: number | string) => {
    if (!can('Arrivals', 'Delete')) {
      toast.error('You do not have permission to delete arrivals.');
      return;
    }
    try {
      await arrivalsApi.delete(vehicleId);
      setExpandedDetail(null);
      await loadArrivalsFromApi();
      toast.success('Arrival deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete arrival');
    }
  };

  const handleEditArrival = async (a: Pick<ArrivalSummary, 'vehicleId'>) => {
    setActiveSellerSearch(null);
    setSellerDropdown(false);
    setAddLotForm(null);
    setEditingVehicleId(a.vehicleId);
    editBaselineSnapshotRef.current = null;
    setShowAdd(true);
    setExpandedDetail(null);
    setEditLoading(true);
    if (isDesktop) setDesktopTab('new-arrival');
    try {
      const detail = await arrivalsApi.getById(a.vehicleId);
      setVehicleNumber(detail?.vehicleNumber ?? '');
      setLoadedWeight(detail?.loadedWeight != null ? String(detail.loadedWeight) : '');
      setEmptyWeight(detail?.emptyWeight != null ? String(detail.emptyWeight) : '');
      setDeductedWeight(detail?.deductedWeight != null ? String(detail.deductedWeight) : '');
      setFreightMethod((detail?.freightMethod as FreightMethod) ?? 'BY_WEIGHT');
      setFreightRate(detail?.freightRate != null ? String(detail.freightRate) : '');
      setFreightKgs(detail?.freightKgs != null ? String(detail.freightKgs) : '1');
      setNoRental(Boolean(detail?.noRental));
      setAdvancePaid(detail?.advancePaid != null ? String(detail.advancePaid) : '');
      setGodown(detail?.godown ?? '');
      setGatepassNumber(detail?.gatepassNumber ?? '');
      setOrigin(detail?.origin ?? '');
      setBrokerName(detail?.brokerName ?? '');
      setBrokerContactId(detail?.brokerContactId ?? null);
      setNarration(detail?.narration ?? '');
      setStep(2);
      const mappedSellers: SellerEntry[] = (detail?.sellers ?? []).map((s, idx) => ({
        seller_vehicle_id: `edit-${s?.contactId ?? idx}-${idx}`,
        contact_id: String(s?.contactId ?? ''),
        seller_serial_number: s?.sellerSerialNumber ?? null,
        seller_name: s?.sellerName ?? '',
        seller_phone: s?.sellerPhone ?? '',
        seller_mark: s?.sellerMark ?? '',
        lots: (s?.lots ?? []).map((l, lotIdx) => ({
          lot_id: l?.id != null ? String(l.id) : `lot-${idx}-${lotIdx}`,
          lot_name: l?.lotName ?? '',
          lot_serial_number: l?.lotSerialNumber ?? null,
          quantity: l?.bagCount ?? 0,
          commodity_name: l?.commodityName ?? '',
          broker_tag: l?.brokerTag ?? '',
          variant: l?.variant ?? '',
        })),
      }));
      setSellers(mappedSellers);
      setSellerExpanded(
        mappedSellers.reduce<Record<string, boolean>>((acc, s) => {
          acc[s.seller_vehicle_id] = false; // keep seller cards collapsed on edit open
          return acc;
        }, {})
      );
      const resolvedMulti = resolveMultiSellerForEdit(detail, mappedSellers.length);
      setIsMultiSeller(resolvedMulti);

      // Capture baseline immediately after we populate all edit fields,
      // so dirty detection works reliably even with invalid data.
      editBaselineSnapshotRef.current = JSON.stringify({
        step: 2,
        isMultiSeller: resolvedMulti,
        vehicleNumber: detail?.vehicleNumber ?? '',
        loadedWeight: detail?.loadedWeight != null ? String(detail.loadedWeight) : '',
        emptyWeight: detail?.emptyWeight != null ? String(detail.emptyWeight) : '',
        deductedWeight: detail?.deductedWeight != null ? String(detail.deductedWeight) : '',
        freightMethod: (detail?.freightMethod as FreightMethod) ?? 'BY_WEIGHT',
        freightRate: detail?.freightRate != null ? String(detail.freightRate) : '',
        freightKgs: detail?.freightKgs != null ? String(detail.freightKgs) : '1',
        noRental: Boolean(detail?.noRental),
        advancePaid: detail?.advancePaid != null ? String(detail.advancePaid) : '',
        brokerName: detail?.brokerName ?? '',
        brokerContactId: detail?.brokerContactId ?? null,
        narration: detail?.narration ?? '',
        godown: detail?.godown ?? '',
        gatepassNumber: detail?.gatepassNumber ?? '',
        origin: detail?.origin ?? '',
        sellers: serializeSellersForDirty(mappedSellers),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load arrival for edit');
      setEditingVehicleId(null);
    } finally {
      setEditLoading(false);
    }
  };

  const handleUpdateArrival = async () => {
    if (editingVehicleId == null) return;
    if (!can('Arrivals', 'Edit')) {
      toast.error('You do not have permission to edit arrivals.');
      return;
    }
    const base = buildPartialPayload();
    const shouldComplete = isCompleteArrivalForSubmit({
      vehicle_number: base.vehicle_number,
      is_multi_seller: base.is_multi_seller,
      sellers: base.sellers,
    });

    if (!shouldComplete) {
      await handlePartialSave();
      return;
    }
    try {
      await arrivalsApi.update(editingVehicleId, {
        vehicle_number: vehicleNumber.trim() || undefined,
        godown: godown || undefined,
        gatepass_number: gatepassNumber || undefined,
        origin: origin || undefined,
        broker_name: brokerName.trim() || undefined,
        broker_contact_id: brokerContactId ?? undefined,
        multi_seller: isMultiSeller,
        narration: narration.trim() || undefined,
        loaded_weight: loadedWeight ? parseFloat(loadedWeight) : undefined,
        empty_weight: emptyWeight ? parseFloat(emptyWeight) : undefined,
        deducted_weight: deductedWeight ? parseFloat(deductedWeight) : undefined,
        freight_method: freightMethod,
        freight_mode: freightMethod,
        freight_rate: freightRate ? parseFloat(freightRate) : undefined,
        freight_kgs: freightMethod === 'BY_WEIGHT' && freightKgs ? parseFloat(freightKgs) : undefined,
        no_rental: noRental,
        advance_paid: advancePaid ? parseFloat(advancePaid) : undefined,
        partially_completed: false,
        sellers: sellers.length > 0 ? sellers.map(s => {
          const hasContactId = s.contact_id !== '' && !Number.isNaN(Number(s.contact_id));
          return {
            contact_id: hasContactId ? Number(s.contact_id) : null,
            seller_serial_number: s.seller_serial_number ?? undefined,
            seller_name: s.seller_name,
            seller_phone: s.seller_phone,
            seller_mark: s.seller_mark || undefined,
            lots: s.lots.map(l => ({
              lot_name: l.lot_name,
              lot_serial_number: l.lot_serial_number ?? undefined,
              quantity: l.quantity,
              commodity_name: l.commodity_name,
              broker_tag: l.broker_tag || undefined,
              variant: l.variant || undefined,
            })),
          };
        }) : undefined,
      });
      await loadArrivalsFromApi();
      await loadContactsFromApi();
      setEditingVehicleId(null);
      resetForm();
      setShowAdd(false);
      setDesktopTab('summary');
      toast.success('Arrival updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update arrival');
    }
  };

  if (!canView) {
    return <ForbiddenPage moduleName="Arrivals" />;
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      <UnsavedChangesDialog />
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(2rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(123,97,255,0.2)_0%,transparent_40%)]" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div key={i} className="absolute w-1.5 h-1.5 bg-white/40 rounded-full"
                style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%` }}
                animate={{ y: [-10, 10], opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }} />
            ))}
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">Arrivals</h1>
                  <p className="text-white/70 text-xs">{apiArrivalsLoading ? '…' : apiArrivals.reduce((s, a) => s + a.lotCount, 0)} lots · Inward Logistics</p>
                </div>
              </div>
              <button onClick={() => { resetForm(); setShowAdd(true); }} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white/15 p-1 backdrop-blur">
              <button
                type="button"
                onClick={() => {
                  void tryCloseArrivalPanel(() => setShowAdd(false));
                }}
                className={cn(
                  "h-9 rounded-lg text-xs font-semibold transition-colors",
                  !showAdd ? "bg-white text-[#6075FF]" : "text-white/85 hover:text-white",
                )}
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowAdd(true);
                }}
                className={cn(
                  "h-9 rounded-lg text-xs font-semibold transition-colors",
                  showAdd ? "bg-white text-[#6075FF]" : "text-white/85 hover:text-white",
                )}
              >
                New Arrival
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DESKTOP: TAB LAYOUT ═══ */}
      {isDesktop && (
        <div className="px-4 sm:px-6 lg:px-8 pb-6 max-w-[100vw] overflow-x-hidden">
          {/* Tab Bar */}
          <div className="flex min-w-0 flex-wrap items-center gap-1 border-b border-border/40 pb-px mb-6 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <button
              onClick={() => {
                void tryCloseArrivalPanel(() => setDesktopTab('summary'));
              }}
              className={cn(
                "px-5 py-3 text-sm font-semibold transition-all relative",
                desktopTab === 'summary'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Summary
                <span className="ml-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold">{apiArrivalsLoading ? '…' : apiArrivals.length}</span>
              </div>
              {desktopTab === 'summary' && (
                <motion.div layoutId="desktop-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6075FF] rounded-full" />
              )}
            </button>
            <button
              onClick={openNewArrivalPanel}
              className={cn(
                "px-5 py-3 text-sm font-semibold transition-all relative",
                desktopTab === 'new-arrival'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Arrival
              </div>
              {desktopTab === 'new-arrival' && (
                <motion.div layoutId="desktop-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6075FF] rounded-full" />
              )}
            </button>
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {desktopTab === 'summary' && (
              <motion.div key="summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {activeArrivalsLoading ? (
                  <div className="glass-card p-12 rounded-2xl text-center">
                    <p className="text-muted-foreground">Loading arrivals…</p>
                  </div>
                ) : (
                  <>
                    {/* Four summary cards — raghav: all blue icon #6075FF */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 mb-4">
                      <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20">
                          <Truck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground leading-tight">{totalVehicles}</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Total Vehicles</p>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20">
                          <Users className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground leading-tight">{totalSellers}</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Total Sellers</p>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20">
                          <Package className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground leading-tight">{totalLots}</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Total Lots</p>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20">
                          <Scale className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground leading-tight">{totalNetWeightTons.toFixed(1)}t</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Total Weight</p>
                        </div>
                      </div>
                    </div>
                    {/* Search + sub-categories (Arrivals) */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 mb-4 min-w-0">
                      <div className="relative w-full min-w-0 sm:max-w-sm md:max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="search"
                          placeholder="Search seller, vehicle, origin..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="w-full min-w-0 h-9 pl-9 pr-4 rounded-xl text-xs bg-white dark:bg-card border border-border/40 shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF]"
                        />
                      </div>
                    </div>
                    {summaryMode === 'arrivals' && (
                      <div className="flex flex-wrap items-center gap-2 mb-4 text-[11px] sm:overflow-x-auto sm:flex-nowrap sm:pb-1 sm:-mx-0.5 sm:px-0.5 [-webkit-overflow-scrolling:touch]">
                        {SUMMARY_STATUS_FILTERS.map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatusFilter(s)}
                            className={cn(
                              'shrink-0 px-4 py-1.5 sm:py-1 rounded-full font-medium transition-colors min-h-[44px] sm:min-h-0',
                              statusFilter === s
                                ? s === 'PARTIALLY_COMPLETED'
                                  ? 'bg-orange-500 text-white shadow-sm'
                                  : 'bg-[#6075FF] text-white shadow-sm'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
                            )}
                          >
                            {s === 'ALL' ? 'All' : statusLabel(s)} ({statusCounts[s]})
                          </button>
                        ))}
                      </div>
                    )}
                    {summaryMode === 'arrivals' && (
                      filteredArrivals.length === 0 ? (
                        statusFilter !== 'ALL' ? (
                          <div className="glass-card p-12 rounded-2xl text-center">
                            <Filter className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-foreground mb-1">No {statusLabel(statusFilter)} arrivals</h3>
                            <p className="text-sm text-muted-foreground mb-4">No arrivals match the &quot;{statusLabel(statusFilter)}&quot; filter. Show all to see the full list.</p>
                            <Button onClick={() => setStatusFilter('ALL')} variant="outline" className="rounded-xl">
                              Show all arrivals
                            </Button>
                          </div>
                        ) : (
                          <div className="glass-card p-12 rounded-2xl text-center">
                            <div className="relative mb-4 mx-auto w-16 h-16">
                              <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl" />
                              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shadow-lg">
                                <Truck className="w-7 h-7 text-white" />
                              </div>
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-1">No Arrivals Yet</h3>
                            <p className="text-sm text-muted-foreground mb-4">Record your first vehicle arrival to start operations</p>
                            <Button onClick={openNewArrivalPanel} className="bg-gradient-to-r from-blue-500 to-violet-500 text-white rounded-xl shadow-lg">
                              <Plus className="w-4 h-4 mr-2" /> New Arrival
                            </Button>
                          </div>
                        )
                      ) : (
                    <div className="glass-card rounded-2xl overflow-x-auto max-w-full [-webkit-overflow-scrolling:touch] touch-pan-x">
                      <table className="w-full min-w-[56rem] text-sm">
                        <thead>
                          <tr className="border-b border-border/40 bg-muted/30">
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Vehicle | Seller | Qty</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Status</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">From</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Bids</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Weighed</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Sellers</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Lots</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Net Wt</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Freight</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Date</th>
                            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredArrivals.map((a, i) => {
                              const status = getArrivalStatus(a);
                              const isExpanded = sameArrivalVehicleId(expandedDetail?.vehicleId, a.vehicleId);
                              return (
                                <Fragment key={a.vehicleId + '-' + i}>
                                  <motion.tr
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer"
                                    onClick={() => loadExpandedDetail(a.vehicleId)}
                                  >
                                    <td className="px-4 py-3 text-foreground">
                                      <ArrivalSummaryVehicleSellerQty
                                        vehicleNumber={a.vehicleNumber}
                                        primarySellerName={a.primarySellerName}
                                        totalBags={a.totalBags}
                                      />
                                    </td>
                                    <td className="px-4 py-3"><ArrivalStatusBadge status={status} /></td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs">{a.godown ?? '—'}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.bidsCount ?? 0}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.weighedCount ?? 0}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.sellerCount}</td>
                                    <td className="px-4 py-3 text-right font-medium text-foreground">{a.lotCount}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.netWeight}kg</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.freightTotal > 0 ? `₹${a.freightTotal.toLocaleString()}` : '—'}</td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(a.arrivalDatetime).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                      <div className="flex items-center justify-center gap-1">
                                        {can('Arrivals', 'Edit') && (
                                          <button type="button" onClick={() => handleEditArrival(a)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="w-4 h-4" /></button>
                                        )}
                                        {can('Arrivals', 'Delete') && (
                                          <button type="button" onClick={() => setPendingDelete({ kind: 'arrival', vehicleId: a.vehicleId, label: a.vehicleNumber })} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                        )}
                                      </div>
                                    </td>
                                  </motion.tr>
                                  {isExpanded && (
                                    <tr key={a.vehicleId + '-exp'} className="border-b border-border/20 bg-muted/10">
                                      <td colSpan={11} className="px-4 py-4">
                                        {expandedDetailLoading ? (
                                          <p className="text-sm text-muted-foreground">Loading…</p>
                                        ) : expandedDetail ? (
                                          <div className="overflow-x-auto -mx-1 px-1 max-w-full [-webkit-overflow-scrolling:touch] touch-pan-x">
                                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 text-sm min-w-0 w-full">
                                            <div className="space-y-3">
                                              <FreightDetailsCard
                                                freightRate={expandedDetail.freightRate ?? 0}
                                                netWeight={expandedDetail.netWeight ?? 0}
                                                freightMethod={expandedDetail.freightMethod ?? 'BY_WEIGHT'}
                                                freightTotal={expandedDetail.freightTotal ?? 0}
                                                advancePaid={expandedDetail.advancePaid ?? 0}
                                                noRental={expandedDetail.noRental ?? false}
                                              />
                                            </div>
                                            <div className="space-y-3">
                                              <SellerInfoCard
                                                sellers={mapSellerInfoRows(expandedDetail.sellers)}
                                                hidePrint
                                                onRefresh={() => loadExpandedDetail(expandedDetail.vehicleId)}
                                              />
                                              <div className="flex gap-2">
                                                {can('Arrivals', 'Edit') && (
                                                  <Button type="button" variant="outline" size="sm" onClick={e => { e.stopPropagation(); handleEditArrival({ vehicleId: expandedDetail.vehicleId }); }}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                                                )}
                                                {can('Arrivals', 'Delete') && (
                                                  <Button type="button" variant="destructive" size="sm" onClick={e => { e.stopPropagation(); setPendingDelete({ kind: 'arrival', vehicleId: expandedDetail.vehicleId, label: expandedDetail.vehicleNumber }); }}><Trash2 className="w-3.5 h-3.5 mr-1" /> Delete</Button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          </div>
                                        ) : null}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                      )
                    )}
                    {false && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredArrivals.flatMap(a => {
                          const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
                          if (!detail?.sellers?.length) {
                            return [{ sellerName: '-', origin: '-', lotCount: a.lotCount ?? 0, lots: [] as { id: number; lotName: string }[], vehicleNumber: a.vehicleNumber, key: `seller-${a.vehicleId}-0` }];
                          }
                          return detail.sellers.map((s, si) => ({
                            sellerName: s.sellerName || '-',
                            origin: '-',
                            lotCount: s.lots?.length ?? 0,
                            lots: s.lots ?? [],
                            vehicleNumber: a.vehicleNumber,
                            key: `seller-${a.vehicleId}-${si}`,
                          }));
                        }).map((item, mapIndex) => {
                          const bgColors = ['bg-[#6075FF]', 'bg-[#00c98b]', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500'];
                          const bgClass = bgColors[mapIndex % bgColors.length];
                          return (
                            <motion.div key={item.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: mapIndex * 0.03 }} className="bg-white dark:bg-card rounded-[24px] shadow-sm border border-border/40 p-4">
                              <div className="flex items-start gap-3.5">
                                <div className={cn('w-[42px] h-[42px] rounded-xl flex items-center justify-center text-white font-bold text-[17px] shrink-0', bgClass)}>{item.sellerName.charAt(0).toUpperCase()}</div>
                                <div className="flex-1 min-w-0 pt-0.5">
                                  <h4 className="text-[14px] font-semibold text-foreground mb-1 leading-none">{item.sellerName}</h4>
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground mb-3 font-medium">
                                    <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {item.origin}</span>
                                    <span className="text-muted-foreground/40">{item.lotCount} lot(s)</span>
                                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                                    <span className="text-muted-foreground/60">{item.vehicleNumber}</span>
                                  </div>
                                  {item.lots.length > 0 && (
                                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-[10px] px-2.5 py-1.5 flex items-center gap-2 text-[10px]">
                                      <Package className="w-3 h-3 text-muted-foreground/70" />
                                      <span className="font-semibold text-foreground">{item.lots[0].lotName || 'Unnamed'}</span>
                                      {item.lots.length > 1 && <span className="text-muted-foreground/40 font-medium">+{item.lots.length - 1} more</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                    {false && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredArrivals.flatMap(a => {
                          const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
                          if (!detail?.sellers) return [];
                          return detail.sellers.flatMap(seller =>
                            (seller.lots ?? []).map(lot => ({
                              lotId: lot.id,
                              lotName: lot.lotName || 'Unnamed',
                              sellerName: seller.sellerName || '-',
                              vehicleNumber: a.vehicleNumber,
                              key: `lot-${a.vehicleId}-${lot.id}`,
                            }))
                          );
                        }).map(item => (
                          <motion.div key={item.key} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.03 }} className="bg-white dark:bg-card rounded-[24px] shadow-sm border border-border/40 p-4 hover:shadow-md transition-all">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-[42px] h-[42px] rounded-xl bg-[#6075FF] flex items-center justify-center shrink-0">
                                  <Package className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-[14px] font-semibold text-foreground leading-none">{item.lotName}</h4>
                                    <span className="text-[10px] text-muted-foreground/60 font-medium">#{item.lotId}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                                    <span>{item.sellerName}</span>
                                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                                    <span>{item.vehicleNumber}</span>
                                  </div>
                                </div>
                              </div>
                              <button type="button" onClick={() => { const text = `Lot: ${item.lotName}\nSeller: ${item.sellerName}\nVehicle: ${item.vehicleNumber}`; navigator.clipboard?.writeText(text).then(() => toast.success('Copied to clipboard')); }} className="p-1 hover:text-foreground text-muted-foreground transition-colors"><Share2 className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="mt-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#eef0ff] dark:bg-[#6075FF]/20 text-[#6075FF] text-[10px] font-bold">{item.vehicleNumber}</span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {desktopTab === 'new-arrival' && (
              <motion.div key="new-arrival" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {/* Sub-tabs: Multi-Seller / Single Seller */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-5 min-w-0">
                  <button
                    onClick={() => { setIsMultiSeller(true); resetForm(); setIsMultiSeller(true); }}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0",
                      isMultiSeller
                        ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <Truck className="w-4 h-4 inline mr-1.5" />
                    Multi Seller (Vehicle)
                  </button>
                  <button
                    onClick={() => { setIsMultiSeller(false); resetForm(); setIsMultiSeller(false); }}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0",
                      !isMultiSeller
                        ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <Users className="w-4 h-4 inline mr-1.5" />
                    Single Seller
                  </button>
                  <p className="w-full min-w-0 text-xs text-muted-foreground xl:ml-3 xl:w-auto xl:flex-1">
                    {isMultiSeller ? 'Multi-seller vehicle arrival (e.g., Bangalore APMC)' : 'Single seller arrival (e.g., Gadag, Byadagi APMC)'}
                  </p>
                </div>

                {/* Desktop form: two-column layout */}
                {editingVehicleId != null && editLoading ? (
                <div className="glass-card rounded-2xl p-12 text-center">
                    <p className="text-muted-foreground font-medium">Loading arrival details…</p>
                    <p className="text-xs text-muted-foreground mt-1">Fetching vehicle, sellers and lots</p>
                  </div>
                ) : (
                <div className="grid grid-cols-1 gap-6">
                  {/* LEFT: Vehicle & Tonnage */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                        <Truck className="w-3 h-3 text-white" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Vehicle & Tonnage</h3>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>

                    {isMultiSeller && (
                      <div className="glass-card rounded-2xl p-4">
                        <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block flex items-center gap-1.5", isVehicleNumberInvalid ? "text-red-500" : "text-blue-600 dark:text-blue-400")}>
                          <Truck className="w-3.5 h-3.5" /> Vehicle Number {isVehicleNumberInvalid && <span className="font-normal text-red-500">2–12 characters</span>}
                        </label>
                        <Input placeholder="e.g., MH12AB1234" value={vehicleNumber}
                          onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                          ref={vehicleNumberInputRef}
                          className={cn("h-11 rounded-xl text-sm font-medium", isVehicleNumberInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={12} />
                      </div>
                    )}

                    <div className="glass-card rounded-2xl p-4 relative z-20 overflow-visible">
                      <label className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5" /> Weigh Bridge
                      </label>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className={cn("text-[10px] mb-1 block", isLoadedWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                            Loaded Weight (kg) {isLoadedWeightInvalid && '⚠ 0–100,000'}
                          </label>
                          <Input type="number" placeholder="0" value={loadedWeight} onChange={e => setLoadedWeight(e.target.value)}
                            ref={loadedWeightInputRef}
                            className={cn("h-11 rounded-xl text-sm font-medium", isLoadedWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                        </div>
                        <div>
                          <label className={cn("text-[10px] mb-1 block", isEmptyWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                            Empty Weight (kg) {isEmptyWeightInvalid && (emptyWeight?.trim() ? (parseFloat(emptyWeight) > (parseFloat(loadedWeight) || 0) ? '⚠ ≤ Loaded' : '⚠ 0–100,000') : '')}
                          </label>
                          <Input type="number" placeholder="0" value={emptyWeight} onChange={e => setEmptyWeight(e.target.value)}
                            className={cn("h-11 rounded-xl text-sm font-medium", isEmptyWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className={cn("text-[10px] mb-1 block", isDeductedWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                          Deducted Weight (Fuel/Dust) (kg) — optional {isDeductedWeightInvalid && '⚠ 0–10,000'}
                        </label>
                        <Input type="number" placeholder="0" value={deductedWeight} onChange={e => setDeductedWeight(e.target.value)}
                          className={cn("h-11 rounded-xl text-sm font-medium", isDeductedWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={10000} step="0.01" />
                      </div>
                      {step === 1 && !isLotsFlow && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-3 text-center border border-blue-200/50 dark:border-blue-800/30">
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Net Weight (LW − EW)</p>
                            <p className="text-xl font-bold text-foreground">{netWeight}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                          </div>
                          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3 text-center border border-violet-200/50 dark:border-violet-800/30">
                            <p className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">Billable (NW − DW)</p>
                            <p className="text-xl font-bold text-foreground">{finalBillableWeight}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <div className="grid grid-cols-1 gap-3 min-w-0 sm:grid-cols-2 sm:gap-3 sm:items-start">
                        <div className="min-w-0">
                          <label className={cn(
                            "text-xs font-bold uppercase tracking-wider mb-2 block leading-snug sm:mb-2 sm:flex sm:min-h-[2.85rem] sm:items-end sm:pb-0.5",
                            isGodownInvalid ? "text-red-500" : "text-muted-foreground",
                          )}>
                            Godown (optional) {isGodownInvalid && '⚠ 2–50, letters only'}
                          </label>
                          <Input placeholder="Godown name (optional)" value={godown} onChange={e => setGodown(e.target.value)} className={cn("h-11 w-full min-w-0 rounded-xl text-sm", isGodownInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={50} />
                        </div>
                        <div className="min-w-0">
                          <label className={cn(
                            "text-xs font-bold uppercase tracking-wider mb-2 block leading-snug sm:mb-2 sm:flex sm:min-h-[2.85rem] sm:items-end sm:pb-0.5",
                            isGatepassNumberInvalid ? "text-red-500" : "text-muted-foreground",
                          )}>
                            Gatepass (optional) {isGatepassNumberInvalid && '⚠ 1–30, alphanumeric'}
                          </label>
                          <Input placeholder="Gatepass no. (optional)" value={gatepassNumber} onChange={e => setGatepassNumber(e.target.value.length <= 30 ? e.target.value : gatepassNumber)} className={cn("h-11 w-full min-w-0 rounded-xl text-sm", isGatepassNumberInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={30} />
                        </div>
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Origin (location)</label>
                      <LocationSearchInput value={origin} onChange={setOrigin} placeholder="Search city, market yard, address…" className="h-11" />
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block", isBrokerNameInvalid ? "text-red-500" : "text-muted-foreground")}>
                        Broker (optional) {isBrokerNameInvalid && '⚠ 2–100, letters + spaces'}
                      </label>
                      <div ref={brokerSearchWrapRef} className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Search contact by name, phone, mark — or type any name"
                          value={brokerName}
                          onChange={e => { setBrokerName(e.target.value); setBrokerContactId(null); refreshBrokerDropdownPos(); setBrokerDropdown(true); }}
                          onFocus={() => { if (brokerName.trim()) { refreshBrokerDropdownPos(); setBrokerDropdown(true); } }}
                          onBlur={() => setTimeout(() => setBrokerDropdown(false), 180)}
                          className={cn("h-11 rounded-xl pl-10 text-sm", isBrokerNameInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")}
                        />
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5" /> Freight Calculator
                      </label>
                      <RadioGroup
                        value={freightMethod}
                        onValueChange={handleFreightMethodChange}
                        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-3"
                      >
                        {FREIGHT_METHODS.map(m => {
                          const isSelected = freightMethod === m.value;
                          const optionId = `freight-method-desktop-${m.value.toLowerCase()}`;
                          return (
                            <label
                              key={m.value}
                              htmlFor={optionId}
                              className={cn(
                                'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer min-h-11',
                                isSelected
                                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-orange-500 shadow-md'
                                  : 'bg-muted/40 text-muted-foreground border-border',
                              )}
                            >
                              <RadioGroupItem
                                id={optionId}
                                value={m.value}
                                className={cn(
                                  'h-4 w-4 shrink-0',
                                  isSelected
                                    ? 'border-white text-white'
                                    : 'border-muted-foreground/60 text-muted-foreground',
                                )}
                              />
                              <span>{m.label}</span>
                            </label>
                          );
                        })}
                      </RadioGroup>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                        <button onClick={() => setNoRental(!noRental)}
                          className={cn("w-14 h-8 rounded-full transition-all relative shadow-inner flex-shrink-0",
                            noRental ? 'bg-gradient-to-r from-red-500 to-rose-500 shadow-red-500/30' : 'bg-slate-300 dark:bg-slate-600')}>
                          <motion.div className="w-6 h-6 rounded-full bg-white shadow-md absolute top-1" animate={{ x: noRental ? 28 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                        </button>
                        <span className="text-xs sm:text-sm text-foreground font-medium">No Rental</span>
                        </div>
                        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-right border border-blue-200/50 dark:border-blue-800/30">
                          <p className="text-[9px] sm:text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Net Weight</p>
                          <p className="text-sm sm:text-base font-bold text-foreground">{finalBillableWeight}<span className="ml-1 text-[10px] sm:text-xs font-normal text-muted-foreground">kg</span></p>
                        </div>
                      </div>
                      {!noRental && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-3">
                            <div className={cn(freightMethod === 'BY_WEIGHT' ? '' : 'sm:col-span-2')}>
                              <label className={cn("text-[10px] mb-1 block", isFreightRateInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                                Rate {isFreightRateInvalid && '⚠ 0–100,000'}
                              </label>
                              <Input type="number" placeholder="0" value={freightRate} onChange={e => setFreightRate(e.target.value)}
                                className={cn("h-11 rounded-xl text-sm font-medium", isFreightRateInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                            </div>
                            {freightMethod === 'BY_WEIGHT' && (
                              <div>
                                <label className={cn("text-[10px] mb-1 block", isFreightKgsInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                                  Kgs {isFreightKgsInvalid && '⚠ > 0'}
                                </label>
                                <Input type="number" placeholder="1" value={freightKgs} onChange={e => setFreightKgs(e.target.value)}
                                  className={cn("h-11 rounded-xl text-sm font-medium", isFreightKgsInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0.01} max={100000} step="0.01" />
                              </div>
                            )}
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-2 sm:p-3 text-center border border-amber-200/50 dark:border-amber-800/30 flex flex-col justify-center">
                              <p className="text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Total Rental</p>
                              <p className="text-lg font-bold text-foreground">₹{freightTotal.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="mb-3">
                            <label className={cn("text-[10px] mb-1 block", isAdvancePaidInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                              Advance Paid (to driver) — optional {isAdvancePaidInvalid && '⚠ 0–1,000,000'}
                            </label>
                            <Input type="number" placeholder="0" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)}
                              className={cn("h-11 rounded-xl text-sm font-medium", isAdvancePaidInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={1000000} step="0.01" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Narration</label>
                            <Input placeholder="e.g., Freight for vehicle arrival" value={narration} onChange={e => setNarration(e.target.value)}
                              className="h-11 rounded-xl text-sm" />
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {NARRATION_PRESETS.map(n => (
                                <button key={n} onClick={() => setNarration(n)}
                                  className={cn("px-2 py-1 rounded-lg text-[10px] font-medium transition-all",
                                    narration === n ? 'bg-amber-500 text-white' : 'bg-muted/50 text-muted-foreground')}>
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Sellers & Lots */}
                  <div className="space-y-4">
                    {sellers.length > 0 && (
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                          <Users className="w-3 h-3 text-white" />
                        </div>
                        <h3 className="text-sm font-bold text-foreground">Sellers & Lots</h3>
                        <div className="flex-1 h-px bg-border/30" />
                      </div>
                    )}

                    {sellers.map((seller, si) => {
                      const expanded = sellerExpanded[seller.seller_vehicle_id] ?? true;
                      const sellerTotal = sellerTotalBagsById[seller.seller_vehicle_id] ?? 0;
                      const sellerSerialLabel = formatSellerSerialNumber(seller.seller_serial_number);
                      return (
                      <motion.div key={seller.seller_vehicle_id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                        className="glass-card rounded-2xl overflow-x-hidden overflow-y-visible max-w-full">
                        <div className="p-3 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-b border-border/30 min-w-0">
                          <div className="flex items-center gap-3 min-w-0 flex-1 sm:min-w-[12rem]">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
                              <span className="text-white text-xl sm:text-2xl font-extrabold tabular-nums leading-none">{sellerSerialLabel ?? '#'}</span>
                            </div>
                            <div className="min-w-0 flex-1 w-0">
                              {seller.contact_id !== '' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 min-w-0">
                                  <div className="min-w-0 flex items-center">
                                    <p className="font-semibold text-lg sm:text-xl text-foreground truncate leading-tight">
                                      {seller.seller_name}
                                    </p>
                                  </div>
                                  <div className="min-w-0">
                                    <Input
                                      placeholder="Mark / alias (optional, 2–20)"
                                      value={seller.seller_mark}
                                      onChange={e => updateSeller(si, { seller_mark: e.target.value })}
                                      className={cn(
                                        "h-11 sm:h-11 w-full min-w-0 rounded-lg text-sm sm:text-base",
                                        isSellerMarkInvalid(seller, si) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={20}
                                    />
                                    {isSellerMarkInvalid(seller, si) && <p className="text-[9px] text-red-500 mt-0.5">{getSellerMarkError(seller, si) ?? '2–20 if set'}</p>}
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 min-w-0">
                                  <div
                                    className="min-w-0"
                                    ref={el => {
                                      sellerNameInputWrapRefs.current[seller.seller_vehicle_id] = el;
                                    }}
                                  >
                                    <Input
                                      placeholder="Seller name (2–100)"
                                      value={seller.seller_name}
                                      onChange={e => updateSellerNameWithSuggestions(si, seller.seller_vehicle_id, e.target.value)}
                                      onFocus={() => {
                                        const query = seller.seller_name.trim();
                                        if (!query) return;
                                        setActiveSellerSearch({ sellerId: seller.seller_vehicle_id, query: seller.seller_name });
                                        refreshSellerDropdownPos(seller.seller_vehicle_id);
                                        setSellerDropdown(true);
                                      }}
                                      onBlur={() => setTimeout(() => setSellerDropdown(false), 150)}
                                      ref={el => {
                                        sellerNameInputRefs.current[seller.seller_vehicle_id] = el;
                                      }}
                                      inputMode="text"
                                      className={cn(
                                        "h-11 sm:h-11 w-full min-w-0 rounded-lg text-sm sm:text-base",
                                        isSellerNameInvalid(seller) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={100}
                                    />
                                    {isSellerNameInvalid(seller) && <p className="text-[9px] text-red-500 mt-0.5">2–100 characters</p>}
                                  </div>
                                  <div className="min-w-0">
                                    <Input
                                      placeholder="Mark / alias (optional, 2–20)"
                                      value={seller.seller_mark}
                                      onChange={e => updateSeller(si, { seller_mark: e.target.value })}
                                      className={cn(
                                        "h-11 sm:h-11 w-full min-w-0 rounded-lg text-sm sm:text-base",
                                        isSellerMarkInvalid(seller, si) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={20}
                                    />
                                    {isSellerMarkInvalid(seller, si) && <p className="text-[9px] text-red-500 mt-0.5">{getSellerMarkError(seller, si) ?? '2–20 if set'}</p>}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 sm:pl-2 self-center">
                            <div className="px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 font-extrabold shadow-sm ring-1 ring-emerald-600/20 self-center">
                              <span className="text-xl sm:text-2xl leading-none whitespace-nowrap tabular-nums">{sellerTotal}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const nextExpanded = !expanded;
                                if (nextExpanded) {
                                  expandOnlySeller(seller.seller_vehicle_id);
                                } else {
                                  setSellerExpanded(prev => ({ ...prev, [seller.seller_vehicle_id]: false }));
                                }
                                if (!nextExpanded) return;
                                setAddLotForm({
                                  sellerId: seller.seller_vehicle_id,
                                  lotName: "",
                                  bags: "",
                                  commodityName: commodities[0]?.commodity_name || "",
                                  variant: "",
                                  errors: {},
                                });
                              }}
                              aria-label={expanded ? 'Collapse seller lots' : 'Expand seller lots'}
                              className={cn(
                                "min-h-[44px] min-w-[44px] h-11 w-11 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center transition-colors touch-manipulation",
                                expanded ? "bg-muted/40 hover:bg-muted/50" : "bg-muted/20 hover:bg-muted/40"
                              )}
                            >
                              {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                            </button>
                            <button type="button" onClick={() => setPendingDelete({ kind: 'seller', idx: si, label: seller.seller_name || `Seller ${si + 1}` })} className="min-h-[44px] min-w-[44px] h-11 w-11 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors touch-manipulation">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded && addLotForm?.sellerId === seller.seller_vehicle_id && (
                            <motion.div
                              key="add-lot-form"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <div className="p-3 border-t border-border/30 space-y-2 bg-muted/10">
                                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">{addLotForm.editingLotId ? "Edit Lot" : "New Lot"}</p>
                                <AddLotHorizontalScrollPanel>
                                  <div className="min-w-max flex flex-nowrap items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                    <LotFieldsHorizontalScroll>
                                      <div className="flex flex-nowrap items-start gap-2 overflow-x-auto overflow-y-visible lot-fields-x-scroll [-webkit-overflow-scrolling:touch] touch-auto">
                                  {/* Lot Name */}
                                  <div className="w-[8.5rem] sm:w-[9rem] md:w-[8.5rem] lg:w-[12rem] xl:w-[14rem] flex-none">
                                    <Input
                                      placeholder="Lot Name"
                                      value={addLotForm.lotName}
                                      onChange={e => setAddLotForm(prev => prev ? { ...prev, lotName: e.target.value, errors: { ...prev.errors, lotName: undefined } } : null)}
                                      onFocus={() => handleLotEntryFieldFocus(seller.seller_vehicle_id)}
                                      className={cn("h-10 sm:h-9 text-sm rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:shadow-[0_0_0_2px_hsl(var(--ring)/0.25)]", addLotForm.errors.lotName && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")}
                                      maxLength={50}
                                      autoFocus
                                    />
                                    {addLotForm.errors.lotName && <p className="text-[10px] text-red-500 mt-0.5">{addLotForm.errors.lotName}</p>}
                                  </div>
                                  {/* Bags */}
                                  <div className="w-[5.5rem] sm:w-[6rem] md:w-[5.5rem] lg:w-[7rem] xl:w-[8rem] flex-none">
                                    <Input
                                      type="number"
                                      placeholder="Bags"
                                      value={addLotForm.bags}
                                      onChange={e => setAddLotForm(prev => prev ? { ...prev, bags: e.target.value, errors: { ...prev.errors, bags: undefined } } : null)}
                                      onFocus={() => handleLotEntryFieldFocus(seller.seller_vehicle_id)}
                                      className={cn("h-10 sm:h-9 text-sm rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:shadow-[0_0_0_2px_hsl(var(--ring)/0.25)]", addLotForm.errors.bags && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")}
                                      min={1}
                                      max={100000}
                                    />
                                    {addLotForm.errors.bags && <p className="text-[10px] text-red-500 mt-0.5">{addLotForm.errors.bags}</p>}
                                  </div>
                                  {/* Commodity */}
                                  <div className="w-[8.5rem] sm:w-[9rem] md:w-[8.5rem] lg:w-[12rem] xl:w-[14rem] flex-none">
                                    <select
                                      value={addLotForm.commodityName}
                                      onChange={e => setAddLotForm(prev => prev ? { ...prev, commodityName: e.target.value, variant: '', errors: { ...prev.errors, commodity: undefined } } : null)}
                                      onFocus={() => handleLotEntryFieldFocus(seller.seller_vehicle_id)}
                                      className={cn("h-10 sm:h-9 w-full rounded-lg bg-background border border-input text-sm px-2 focus:outline-none focus:ring-0 focus:border-primary focus:shadow-[0_0_0_2px_hsl(var(--ring)/0.25)]", addLotForm.errors.commodity && "border-red-500 ring-2 ring-red-500/30")}
                                    >
                                      <option value="" disabled>Select Commodity</option>
                                      {commodities.map((c: any) => (
                                        <option key={c.commodity_id} value={c.commodity_name}>{c.commodity_name}</option>
                                      ))}
                                    </select>
                                    {addLotForm.errors.commodity && <p className="text-[10px] text-red-500 mt-0.5">{addLotForm.errors.commodity}</p>}
                                  </div>
                                  {/* Variant */}
                                  <div className="w-[7rem] sm:w-[7.5rem] md:w-[7rem] lg:w-[10rem] xl:w-[12rem] flex-none">
                                    <select
                                      value={addLotForm.variant}
                                      onChange={e => setAddLotForm(prev => prev ? { ...prev, variant: e.target.value } : null)}
                                      onFocus={() => handleLotEntryFieldFocus(seller.seller_vehicle_id)}
                                      className="h-10 sm:h-9 w-full rounded-lg bg-background border border-input text-sm px-2 focus:outline-none focus:ring-0 focus:border-primary focus:shadow-[0_0_0_2px_hsl(var(--ring)/0.25)]"
                                    >
                                      {VARIANT_OPTIONS.map(opt => (
                                        <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                      </div>
                                    </LotFieldsHorizontalScroll>
                                    </div>
                                    {/* Action buttons */}
                                    <div className="relative z-[8] flex flex-nowrap items-center gap-2 justify-end sm:self-start pl-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setAddLotForm({
                                        sellerId: seller.seller_vehicle_id,
                                        lotName: "",
                                        bags: "",
                                        commodityName: commodities[0]?.commodity_name || "",
                                        variant: "",
                                        errors: {},
                                      })}
                                      className="h-8 sm:h-9 shrink-0 whitespace-nowrap text-xs"
                                    >
                                      Cancel
                                    </Button>
                                    <Button type="button" size="sm" onClick={() => saveFormLot(si)} className="h-10 sm:h-10 px-4 shrink-0 whitespace-nowrap text-sm font-semibold bg-[#6075FF] hover:bg-[#5060e8] text-white border border-[#6075FF]">
                                      {addLotForm.editingLotId ? "Update" : "Save Lot"}
                                    </Button>
                                    </div>
                                  </div>
                                </AddLotHorizontalScrollPanel>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              key={`${seller.seller_vehicle_id}-lots`}
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="border-t border-border/30"
                            >
                              {/* Scrollable lots panel: min/max height scales with viewport so zoom doesn’t crush content */}
                              <LotsScrollPanel
                                sellerId={seller.seller_vehicle_id}
                                registerScrollEl={setLotsScrollRef}
                                showEdgeHints
                                contentLayoutKey={seller.lots.length}
                                showScrollAffordanceFooter={seller.lots.length > 0}
                                scrollAffordanceHint="Scroll to see all lots"
                                className="min-h-[12rem] max-h-[min(32rem,58dvh)] overflow-y-auto overflow-x-auto lg:overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch] touch-auto border-t border-border/30 pb-6"
                              >
                                  {seller.lots.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-3 italic px-3">No lots added yet.</p>
                                  ) : (
                                    <LotFieldsHorizontalScroll>
                                      <table className="w-[42rem] md:w-full text-sm sm:text-base table-fixed">
                                        <thead className="sticky top-0 z-[3] bg-background">
                                          <tr className="border-b border-border/20">
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">SL. NO</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">Lot Name</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">Bags</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">Commodity</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold hidden md:table-cell md:w-1/6">Variant</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {seller.lots.map((lot, li) => {
                                            const lotSerialLabel = lot.lot_serial_number != null && lot.lot_serial_number > 0 ? String(lot.lot_serial_number) : "-";
                                            const isBeingEdited = addLotForm?.editingLotId === lot.lot_id;
                                            return (
                                              <tr
                                                key={lot.lot_id}
                                                onClick={() => editFormLot(si, li)}
                                                className={cn(
                                                  "border-b border-border/10 transition-colors cursor-pointer",
                                                  isBeingEdited ? "bg-blue-50 dark:bg-blue-950/20" : "hover:bg-muted/20"
                                                )}
                                              >
                                                <td className="py-1 px-2.5 align-middle text-center">
                                                  {lotSerialLabel !== "-" ? (
                                                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold leading-none text-blue-700 dark:text-blue-300 whitespace-nowrap ring-1 ring-blue-500/20">
                                                      {lotSerialLabel} — {vehicleTotalBags} / {sellerTotal}
                                                    </span>
                                                  ) : (
                                                    <span className="text-muted-foreground font-mono text-[9px] sm:text-[10px]">—</span>
                                                  )}
                                                </td>
                                                <td className="py-1 px-2.5 align-middle text-center">
                                                  <span className="inline-flex max-w-none whitespace-nowrap px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] sm:text-xs font-bold leading-none">
                                                    {lot.lot_name || "-"}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-3 align-middle text-center font-medium text-foreground">{lot.quantity}</td>
                                                <td className="py-2 px-3 align-middle text-center text-foreground truncate">{lot.commodity_name || "-"}</td>
                                                <td className="py-2 px-3 align-middle text-center text-muted-foreground hidden md:table-cell">{lot.variant || "None"}</td>
                                                <td className="py-2 px-3 align-middle text-center">
                                                  <div className="flex justify-center gap-1">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingDelete({ kind: "lot", sellerIdx: si, lotIdx: li, label: lot.lot_name || "Lot " + (li + 1) });
                                                      }}
                                                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex-shrink-0"
                                                      aria-label="Delete lot"
                                                    >
                                                      <Trash2 className="w-4 h-4 sm:w-4 sm:h-4" />
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </LotFieldsHorizontalScroll>
                                  )}
                              </LotsScrollPanel>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ); })}

                    {/* Add Seller + Submit (reduced submit width to make room) */}
                    <div className="flex items-stretch gap-0 rounded-2xl bg-white dark:bg-card p-1.5 shadow-sm border border-border/30">
                      <Button
                        type="button"
                        size="sm"
                        onClick={openSellerSearchPanel}
                        disabled={(!isMultiSeller && sellers.length >= 1) || hasIncompleteSellerDetails}
                        className="h-11 sm:h-12 rounded-xl flex-1 text-xs sm:text-sm font-semibold flex items-center justify-center bg-[#6075FF] hover:bg-[#5060e8] text-white border border-[#6075FF] shadow-md shadow-[#6075FF]/25 active:shadow-lg active:shadow-[#6075FF]/35 active:scale-[0.99] transition-all disabled:opacity-60 disabled:bg-[#6075FF] disabled:text-white"
                      >
                        <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="ml-1.5 sm:ml-2">Add Seller</span>
                      </Button>
                      <div className="w-2 shrink-0 bg-white dark:bg-card" aria-hidden />
                      <Button
                        onClick={handleSubmitArrival}
                        className="flex-1 h-11 sm:h-12 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 active:shadow-xl active:shadow-emerald-500/35 active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center"
                      >
                        <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="ml-1.5 sm:ml-2">{editingVehicleId != null ? 'Update Arrival' : 'Submit Arrival'}</span>
                      </Button>
                    </div>
                  </div>
                </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ═══ MOBILE: Four cards + Search + Status filter + List (mobile-first) ═══ */}
      {!isDesktop && (
        <>
          {/* Four summary cards — raghav style: blue icon on all, white card */}
          {!apiArrivalsLoading && apiArrivals.length > 0 && (
            <div className="px-4 mb-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{totalVehicles}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Vehicles</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{totalSellers}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Sellers</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{totalLots}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Lots</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                    <Scale className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{totalNetWeightTons.toFixed(1)}t</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Weight</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="px-4 mb-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search seller, vehicle, origin..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl text-sm bg-white dark:bg-card border border-border/40 shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF] text-foreground placeholder:text-muted-foreground"
              />
            </div>
            {summaryMode === 'arrivals' && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 text-[11px]">
                {SUMMARY_STATUS_FILTERS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      'flex-shrink-0 px-4 py-1 rounded-full font-medium transition-colors',
                      statusFilter === s
                        ? s === 'PARTIALLY_COMPLETED'
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'bg-[#6075FF] text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
                    )}
                  >
                    {s === 'ALL' ? 'All' : statusLabel(s)} ({statusCounts[s]})
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 space-y-2.5">
            {activeArrivalsLoading ? (
              <div className="glass-card p-8 rounded-2xl text-center">
                <p className="text-muted-foreground">Loading arrivals…</p>
              </div>
            ) : filteredArrivals.length === 0 ? (
              statusFilter !== 'ALL' ? (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 rounded-2xl text-center">
                  <Filter className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-1">No {statusLabel(statusFilter)} arrivals</h3>
                  <p className="text-sm text-muted-foreground mb-4">No arrivals match this filter. Tap below to show all arrivals.</p>
                  <Button onClick={() => setStatusFilter('ALL')} variant="outline" className="rounded-xl">
                    Show all arrivals
                  </Button>
                </motion.div>
              ) : (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 rounded-2xl text-center">
                <div className="relative mb-4 mx-auto w-16 h-16">
                  <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl" />
                  <div className="relative w-16 h-16 rounded-full bg-[#6075FF] flex items-center justify-center shadow-lg shadow-[#6075FF]/20">
                    <Truck className="w-7 h-7 text-white" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">No Arrivals Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Record your first vehicle arrival to start operations</p>
                <Button onClick={() => { resetForm(); setShowAdd(true); }} className="bg-[#6075FF] text-white rounded-xl shadow-lg hover:bg-[#5060e8]">
                  <Plus className="w-4 h-4 mr-2" /> New Arrival
                </Button>
              </motion.div>
              )
            ) : false ? (
              <div className="grid grid-cols-1 gap-3">
                {filteredArrivals.flatMap(a => {
                  const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
                  if (!detail?.sellers?.length) return [{ sellerName: '-', lotCount: a.lotCount ?? 0, lots: [] as { id: number; lotName: string }[], vehicleNumber: a.vehicleNumber, key: `ms-${a.vehicleId}-0` }];
                  return detail.sellers.map((s, si) => ({ sellerName: s.sellerName || '-', lotCount: s.lots?.length ?? 0, lots: s.lots ?? [], vehicleNumber: a.vehicleNumber, key: `ms-${a.vehicleId}-${si}` }));
                }).map((item, i) => (
                  <motion.div key={item.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center text-white font-bold shrink-0">{item.sellerName.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{item.sellerName}</p>
                        <p className="text-xs text-muted-foreground">{item.lotCount} lot(s) · {item.vehicleNumber}</p>
                        {item.lots[0] && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{item.lots[0].lotName}{item.lots.length > 1 ? ` +${item.lots.length - 1} more` : ''}</p>}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : false ? (
              <div className="grid grid-cols-1 gap-3">
                {filteredArrivals.flatMap(a => {
                  const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
                  if (!detail?.sellers) return [];
                  return detail.sellers.flatMap(s => (s.lots ?? []).map(lot => ({ lotId: lot.id, lotName: lot.lotName || 'Unnamed', sellerName: s.sellerName || '-', vehicleNumber: a.vehicleNumber, key: `ml-${a.vehicleId}-${lot.id}` })));
                }).map((item, i) => (
                  <motion.div key={item.key} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shrink-0"><Package className="w-5 h-5 text-white" /></div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{item.lotName}</p>
                          <p className="text-xs text-muted-foreground">{item.sellerName} · {item.vehicleNumber}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(`Lot: ${item.lotName}\nSeller: ${item.sellerName}\nVehicle: ${item.vehicleNumber}`).then(() => toast.success('Copied')); }} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"><Share2 className="w-4 h-4" /></button>
                    </div>
                    <span className="inline-flex mt-2 px-2 py-0.5 rounded-full bg-[#eef0ff] dark:bg-[#6075FF]/20 text-[#6075FF] text-[10px] font-bold">{item.vehicleNumber}</span>
                  </motion.div>
                ))}
              </div>
            ) : (() => {
              if (filteredArrivals.length === 0) {
                return (
                  <div className="glass-card p-6 rounded-2xl text-center">
                    <Filter className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No arrivals match your filter</p>
                  </div>
                );
              }
              return filteredArrivals.map((a, i) => {
                const status = getArrivalStatus(a);
                const isExpanded = sameArrivalVehicleId(expandedDetail?.vehicleId, a.vehicleId);
                return (
                  <motion.div key={a.vehicleId + '-' + i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className="glass-card rounded-2xl overflow-x-hidden overflow-y-visible max-w-full">
                      <div className="w-full p-3.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => loadExpandedDetail(a.vehicleId)}
                          className="flex w-full min-w-0 flex-1 items-start gap-3 text-left touch-manipulation"
                        >
                          <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                            <Truck className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 gap-y-1 min-w-0">
                              <ArrivalSummaryVehicleSellerQty
                                vehicleNumber={a.vehicleNumber}
                                primarySellerName={a.primarySellerName}
                                totalBags={a.totalBags}
                              />
                              <ArrivalStatusBadge status={status} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 break-words">{a.sellerCount} seller(s) · {a.lotCount} lot(s) · {a.netWeight}kg · Bids: {a.bidsCount ?? 0} · Weighed: {a.weighedCount ?? 0}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(a.arrivalDatetime).toLocaleDateString()}</span>
                            <span className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-muted/30" aria-hidden>
                              {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                            </span>
                          </div>
                        </button>
                      </div>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30">
                            <div className="p-4 space-y-3 text-sm">
                              {expandedDetailLoading ? (
                                <p className="text-muted-foreground">Loading…</p>
                              ) : expandedDetail ? (
                                <>
                                  <FreightDetailsCard freightRate={expandedDetail.freightRate ?? 0} freightKgs={expandedDetail.freightKgs} netWeight={expandedDetail.netWeight ?? 0} freightMethod={expandedDetail.freightMethod ?? 'BY_WEIGHT'} freightTotal={expandedDetail.freightTotal ?? 0} advancePaid={expandedDetail.advancePaid ?? 0} noRental={expandedDetail.noRental ?? false} />
                                  <SellerInfoCard
                                    sellers={mapSellerInfoRows(expandedDetail.sellers)}
                                    hidePrint
                                  />
                                  <div className="flex gap-2 pt-1">
                                    {can('Arrivals', 'Edit') && (
                                      <button
                                        type="button"
                                        onClick={() => handleEditArrival({ vehicleId: expandedDetail.vehicleId })}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted/50 text-xs font-semibold"
                                      >
                                        <Pencil className="w-3.5 h-3.5" /> Edit
                                      </button>
                                    )}
                                    {can('Arrivals', 'Delete') && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPendingDelete({
                                            kind: 'arrival',
                                            vehicleId: expandedDetail.vehicleId,
                                            label: expandedDetail.vehicleNumber ?? a.vehicleNumber,
                                          })
                                        }
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/20 text-xs font-semibold text-red-600"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                      </button>
                                    )}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              });
            })()}
          </div>

          {/* Mobile / Tablet Modal */}
          <AnimatePresence>
            {showAdd && (
              <>
                {/* Glassmorphism backdrop overlay — tablet only */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md hidden md:block lg:hidden"
                    onClick={() => {
                      void tryCloseArrivalPanel(() => setShowAdd(false));
                    }}
                />
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 30, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={cn(
                    "fixed z-50 flex justify-center",
                    "inset-0 bg-background",
                    "md:inset-3 md:rounded-3xl md:border md:border-white/20 md:shadow-2xl md:bg-background/80 md:backdrop-blur-2xl",
                    "lg:inset-0 lg:rounded-none lg:border-0 lg:shadow-none lg:bg-background lg:backdrop-blur-none"
                  )}
                  style={{ WebkitBackdropFilter: 'blur(24px)' }}
                >
                <div ref={newArrivalPanelScrollRef} className="w-full max-w-[480px] md:max-w-full overflow-y-auto">
                  <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 px-4 sticky top-0 z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            void tryCloseArrivalPanel(() => setShowAdd(false));
                          }}
                          aria-label="Go back"
                          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"
                        >
                          <ArrowLeft className="w-5 h-5 text-white" />
                        </button>
                        <div>
                          <h2 className="text-lg font-bold text-white">New Arrival</h2>
                          <p className="text-white/70 text-xs">
                            {sellers.length > 0 ? 'Vehicle & Tonnage · Sellers & Lots' : 'Vehicle & Tonnage'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pt-4 space-y-4 pb-[calc(11rem+env(safe-area-inset-bottom,0px))] md:pb-40">
                    {editingVehicleId != null && editLoading && (
                      <div className="glass-card rounded-2xl p-8 text-center">
                        <p className="text-muted-foreground font-medium">Loading arrival details…</p>
                        <p className="text-xs text-muted-foreground mt-1">Fetching vehicle, sellers and lots</p>
                      </div>
                    )}
                    {!(editingVehicleId != null && editLoading) && (
                    <>
                    {/* ── Section 1: Arrival Details ── */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                        <Truck className="w-3 h-3 text-white" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Arrival Details</h3>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>

                    <div className="glass-card rounded-2xl p-4 relative z-20 overflow-visible">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Arrival Type</label>
                      <div className="flex gap-2">
                        <button onClick={() => setIsMultiSeller(true)}
                          className={cn("flex-1 py-3 rounded-xl text-sm font-semibold transition-all",
                            isMultiSeller ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md' : 'bg-muted/40 text-muted-foreground')}>
                          Multi Seller (Vehicle)
                        </button>
                        <button onClick={() => setIsMultiSeller(false)}
                          className={cn("flex-1 py-3 rounded-xl text-sm font-semibold transition-all",
                            !isMultiSeller ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md' : 'bg-muted/40 text-muted-foreground')}>
                          Single Seller
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        {isMultiSeller ? 'Multi-seller vehicle arrival (e.g., Bangalore APMC)' : 'Single seller arrival (e.g., Gadag, Byadagi APMC)'}
                      </p>
                    </div>

                    {isMultiSeller && (
                      <div className="glass-card rounded-2xl p-4">
                        <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block flex items-center gap-1.5", isVehicleNumberInvalid ? "text-red-500" : "text-blue-600 dark:text-blue-400")}>
                          <Truck className="w-3.5 h-3.5" /> Vehicle Number {isVehicleNumberInvalid && <span className="font-normal text-red-500">2–12</span>}
                        </label>
                        <Input placeholder="e.g., MH12AB1234" value={vehicleNumber}
                          onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                          ref={vehicleNumberInputRef}
                          className={cn("h-12 rounded-xl text-base font-medium", isVehicleNumberInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={12} />
                      </div>
                    )}

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5" /> Weigh Bridge
                      </label>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className={cn("text-[10px] mb-1 block", isLoadedWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                            Loaded (kg) {isLoadedWeightInvalid && '⚠ 0–100k'}
                          </label>
                          <Input type="number" placeholder="0" value={loadedWeight} onChange={e => setLoadedWeight(e.target.value)}
                            ref={loadedWeightInputRef}
                            className={cn("h-12 rounded-xl text-base font-medium", isLoadedWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                        </div>
                        <div>
                          <label className={cn("text-[10px] mb-1 block", isEmptyWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                            Empty (kg) {isEmptyWeightInvalid && (emptyWeight?.trim() ? (parseFloat(emptyWeight) > (parseFloat(loadedWeight) || 0) ? '⚠ ≤ Loaded' : '⚠ 0–100k') : '')}
                          </label>
                          <Input type="number" placeholder="0" value={emptyWeight} onChange={e => setEmptyWeight(e.target.value)}
                            className={cn("h-12 rounded-xl text-base font-medium", isEmptyWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className={cn("text-[10px] mb-1 block", isDeductedWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                          Deducted (kg) optional {isDeductedWeightInvalid && '⚠ 0–10,000'}
                        </label>
                        <Input type="number" placeholder="0" value={deductedWeight} onChange={e => setDeductedWeight(e.target.value)}
                          className={cn("h-12 rounded-xl text-base font-medium", isDeductedWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={10000} step="0.01" />
                      </div>
                      {step === 1 && !isLotsFlow && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-3 text-center border border-blue-200/50 dark:border-blue-800/30">
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Net Weight (LW − EW)</p>
                            <p className="text-xl font-bold text-foreground">{netWeight}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                          </div>
                          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3 text-center border border-violet-200/50 dark:border-violet-800/30">
                            <p className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">Billable (NW − DW)</p>
                            <p className="text-xl font-bold text-foreground">{finalBillableWeight}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <div className="grid grid-cols-1 gap-3 min-w-0 sm:grid-cols-2 sm:gap-3 sm:items-start">
                        <div className="min-w-0">
                          <label className={cn(
                            "text-xs font-bold uppercase tracking-wider mb-2 block leading-snug sm:mb-2 sm:flex sm:min-h-[2.85rem] sm:items-end sm:pb-0.5",
                            isGodownInvalid ? "text-red-500" : "text-muted-foreground",
                          )}>
                            Godown (optional) {isGodownInvalid && '⚠ 2–50'}
                          </label>
                          <Input placeholder="Godown (optional)" value={godown} onChange={e => setGodown(e.target.value)} className={cn("h-12 w-full min-w-0 rounded-xl", isGodownInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={50} />
                        </div>
                        <div className="min-w-0">
                          <label className={cn(
                            "text-xs font-bold uppercase tracking-wider mb-2 block leading-snug sm:mb-2 sm:flex sm:min-h-[2.85rem] sm:items-end sm:pb-0.5",
                            isGatepassNumberInvalid ? "text-red-500" : "text-muted-foreground",
                          )}>
                            Gatepass (optional) {isGatepassNumberInvalid && '⚠ 1–30'}
                          </label>
                          <Input placeholder="Gatepass (optional)" value={gatepassNumber} onChange={e => setGatepassNumber(e.target.value.length <= 30 ? e.target.value : gatepassNumber)} className={cn("h-12 w-full min-w-0 rounded-xl", isGatepassNumberInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={30} />
                        </div>
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Origin (location)</label>
                      <LocationSearchInput value={origin} onChange={setOrigin} placeholder="Search city, market yard, address…" />
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block", isBrokerNameInvalid ? "text-red-500" : "text-muted-foreground")}>
                        Broker (optional) {isBrokerNameInvalid && '⚠ 2–100'}
                      </label>
                      <div ref={brokerSearchWrapRef} className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Search contact or type any name"
                          value={brokerName}
                          onChange={e => { setBrokerName(e.target.value); setBrokerContactId(null); refreshBrokerDropdownPos(); setBrokerDropdown(true); }}
                          onFocus={() => { if (brokerName.trim()) { refreshBrokerDropdownPos(); setBrokerDropdown(true); } }}
                          onBlur={() => setTimeout(() => setBrokerDropdown(false), 180)}
                          className={cn("h-12 rounded-xl pl-10", isBrokerNameInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")}
                        />
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5" /> Freight Calculator
                      </label>
                      <RadioGroup
                        value={freightMethod}
                        onValueChange={handleFreightMethodChange}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3"
                      >
                        {FREIGHT_METHODS.map(m => {
                          const isSelected = freightMethod === m.value;
                          const optionId = `freight-method-mobile-${m.value.toLowerCase()}`;
                          return (
                            <label
                              key={m.value}
                              htmlFor={optionId}
                              className={cn(
                                'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer min-h-11',
                                isSelected
                                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-orange-500 shadow-md'
                                  : 'bg-muted/40 text-muted-foreground border-border',
                              )}
                            >
                              <RadioGroupItem
                                id={optionId}
                                value={m.value}
                                className={cn(
                                  'h-4 w-4 shrink-0',
                                  isSelected
                                    ? 'border-white text-white'
                                    : 'border-muted-foreground/60 text-muted-foreground',
                                )}
                              />
                              <span>{m.label}</span>
                            </label>
                          );
                        })}
                      </RadioGroup>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                        <button onClick={() => setNoRental(!noRental)}
                          className={cn("w-14 h-8 rounded-full transition-all relative shadow-inner flex-shrink-0",
                            noRental ? 'bg-gradient-to-r from-red-500 to-rose-500 shadow-red-500/30' : 'bg-slate-300 dark:bg-slate-600')}>
                          <motion.div className="w-6 h-6 rounded-full bg-white shadow-md absolute top-1" animate={{ x: noRental ? 28 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                        </button>
                        <span className="text-xs sm:text-sm text-foreground font-medium">No Rental</span>
                        </div>
                        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-right border border-blue-200/50 dark:border-blue-800/30">
                          <p className="text-[9px] sm:text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Net Weight</p>
                          <p className="text-sm sm:text-base font-bold text-foreground">{finalBillableWeight}<span className="ml-1 text-[10px] sm:text-xs font-normal text-muted-foreground">kg</span></p>
                        </div>
                      </div>
                      {!noRental && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-3">
                            <div className={cn(freightMethod === 'BY_WEIGHT' ? '' : 'sm:col-span-2')}>
                              <label className={cn("text-[10px] mb-1 block", isFreightRateInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                                Rate {isFreightRateInvalid && '⚠ 0–100k'}
                              </label>
                              <Input type="number" placeholder="0" value={freightRate} onChange={e => setFreightRate(e.target.value)}
                                className={cn("h-12 rounded-xl text-base font-medium", isFreightRateInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                            </div>
                            {freightMethod === 'BY_WEIGHT' && (
                              <div>
                                <label className={cn("text-[10px] mb-1 block", isFreightKgsInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                                  Kgs {isFreightKgsInvalid && '⚠ > 0'}
                                </label>
                                <Input type="number" placeholder="1" value={freightKgs} onChange={e => setFreightKgs(e.target.value)}
                                  className={cn("h-12 rounded-xl text-base font-medium", isFreightKgsInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0.01} max={100000} step="0.01" />
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 text-center border border-amber-200/50 dark:border-amber-800/30 mb-3">
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Total Rental</p>
                            <p className="text-xl font-bold text-foreground">₹{freightTotal.toLocaleString()}</p>
                          </div>
                          <div className="mb-3">
                            <label className={cn("text-[10px] mb-1 block", isAdvancePaidInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                              Advance (optional) {isAdvancePaidInvalid && '⚠ 0–1M'}
                            </label>
                            <Input type="number" placeholder="0" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)}
                              className={cn("h-12 rounded-xl text-base font-medium", isAdvancePaidInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={1000000} step="0.01" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Narration</label>
                            <Input placeholder="e.g., Freight for vehicle arrival" value={narration} onChange={e => setNarration(e.target.value)}
                              className="h-12 rounded-xl" />
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {NARRATION_PRESETS.map(n => (
                                <button key={n} onClick={() => setNarration(n)}
                                  className={cn("px-2 py-1 rounded-lg text-[10px] font-medium transition-all",
                                    narration === n ? 'bg-amber-500 text-white' : 'bg-muted/50 text-muted-foreground')}>
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* ── Section 2: Sellers & Lots ── */}
                    {sellers.length > 0 && (
                      <div className="flex items-center gap-2 pt-2">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                          <Users className="w-3 h-3 text-white" />
                        </div>
                        <h3 className="text-sm font-bold text-foreground">Sellers & Lots</h3>
                        <div className="flex-1 h-px bg-border/30" />
                      </div>
                    )}

                    {sellers.map((seller, si) => {
                      const expanded = sellerExpanded[seller.seller_vehicle_id] ?? true;
                      const sellerTotal = sellerTotalBagsById[seller.seller_vehicle_id] ?? 0;
                      const sellerSerialLabel = formatSellerSerialNumber(seller.seller_serial_number);
                      return (
                      <motion.div key={seller.seller_vehicle_id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                        className="glass-card rounded-2xl overflow-x-hidden overflow-y-visible max-w-full">
                        <div className="p-3 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-b border-border/30 min-w-0">
                          <div className="flex items-center gap-2 min-w-0 flex-1 sm:min-w-[12rem]">
                            <div className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
                              <span className="text-white text-lg sm:text-xl font-extrabold tabular-nums leading-none">{sellerSerialLabel ?? '#'}</span>
                            </div>
                            <div className="min-w-0 flex-1 w-0">
                              {seller.contact_id !== '' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 min-w-0">
                                  <div className="min-w-0 flex items-center">
                                    <p className="font-semibold text-xs sm:text-sm text-foreground truncate">
                                      {seller.seller_name}
                                    </p>
                                  </div>
                                  <div className="min-w-0">
                                    <Input
                                      placeholder="Mark / alias (optional, 2–20)"
                                      value={seller.seller_mark}
                                      onChange={e => updateSeller(si, { seller_mark: e.target.value })}
                                      className={cn(
                                        "h-11 sm:h-10 w-full min-w-0 rounded-lg text-xs md:h-9",
                                        isSellerMarkInvalid(seller, si) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={20}
                                    />
                                    {isSellerMarkInvalid(seller, si) && <p className="text-[9px] text-red-500 mt-0.5">{getSellerMarkError(seller, si) ?? '2–20 if set'}</p>}
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 min-w-0">
                                  <div
                                    className="min-w-0"
                                    ref={el => {
                                      sellerNameInputWrapRefs.current[seller.seller_vehicle_id] = el;
                                    }}
                                  >
                                    <Input
                                      placeholder="Seller name (2–100)"
                                      value={seller.seller_name}
                                      onChange={e => updateSellerNameWithSuggestions(si, seller.seller_vehicle_id, e.target.value)}
                                      onFocus={() => {
                                        const query = seller.seller_name.trim();
                                        if (!query) return;
                                        setActiveSellerSearch({ sellerId: seller.seller_vehicle_id, query: seller.seller_name });
                                        refreshSellerDropdownPos(seller.seller_vehicle_id);
                                        setSellerDropdown(true);
                                      }}
                                      onBlur={() => setTimeout(() => setSellerDropdown(false), 150)}
                                      ref={el => {
                                        sellerNameInputRefs.current[seller.seller_vehicle_id] = el;
                                      }}
                                      inputMode="text"
                                      className={cn(
                                        "h-11 sm:h-10 w-full min-w-0 rounded-lg text-xs md:h-9",
                                        isSellerNameInvalid(seller) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={100}
                                    />
                                    {isSellerNameInvalid(seller) && <p className="text-[9px] text-red-500 mt-0.5">2–100 characters</p>}
                                  </div>
                                  <div className="min-w-0">
                                    <Input
                                      placeholder="Mark / alias (optional, 2–20)"
                                      value={seller.seller_mark}
                                      onChange={e => updateSeller(si, { seller_mark: e.target.value })}
                                      className={cn(
                                        "h-11 sm:h-10 w-full min-w-0 rounded-lg text-xs md:h-9",
                                        isSellerMarkInvalid(seller, si) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={20}
                                    />
                                    {isSellerMarkInvalid(seller, si) && <p className="text-[9px] text-red-500 mt-0.5">{getSellerMarkError(seller, si) ?? '2–20 if set'}</p>}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 sm:pl-2">
                            <div className="px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 font-extrabold shadow-sm ring-1 ring-emerald-600/20">
                              <span className="text-lg sm:text-xl leading-none whitespace-nowrap tabular-nums">{sellerTotal}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const nextExpanded = !expanded;
                                if (nextExpanded) {
                                  expandOnlySeller(seller.seller_vehicle_id);
                                } else {
                                  setSellerExpanded(prev => ({ ...prev, [seller.seller_vehicle_id]: false }));
                                }
                                if (!nextExpanded) return;
                                setAddLotForm({
                                  sellerId: seller.seller_vehicle_id,
                                  lotName: "",
                                  bags: "",
                                  commodityName: commodities[0]?.commodity_name || "",
                                  variant: "",
                                  errors: {},
                                });
                              }}
                              aria-label={expanded ? 'Collapse seller lots' : 'Expand seller lots'}
                              className={cn(
                                "min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center transition-colors touch-manipulation",
                                expanded ? "bg-muted/40 hover:bg-muted/50" : "bg-muted/20 hover:bg-muted/40"
                              )}
                            >
                              {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                            </button>
                            <button type="button" onClick={() => setPendingDelete({ kind: 'seller', idx: si, label: seller.seller_name || `Seller ${si + 1}` })} className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors touch-manipulation">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded && addLotForm?.sellerId === seller.seller_vehicle_id && (
                            <motion.div
                              key="add-lot-form"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <div className="p-3 border-t border-border/30 space-y-2 bg-muted/10">
                                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">{addLotForm.editingLotId ? "Edit Lot" : "New Lot"}</p>
                                <AddLotHorizontalScrollPanel>
                                  <div className="min-w-max flex flex-nowrap items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                    <LotFieldsHorizontalScroll>
                                      <div className="flex flex-nowrap items-start gap-2 overflow-x-auto overflow-y-visible lot-fields-x-scroll [-webkit-overflow-scrolling:touch] touch-auto">
                                  {/* Lot Name */}
                                  <div className="w-[8.5rem] sm:w-[9rem] md:w-[8.5rem] lg:w-[12rem] xl:w-[14rem] flex-none">
                                    <Input
                                      placeholder="Lot Name"
                                      value={addLotForm.lotName}
                                      onChange={e => setAddLotForm(prev => prev ? { ...prev, lotName: e.target.value, errors: { ...prev.errors, lotName: undefined } } : null)}
                                      onFocus={() => handleLotEntryFieldFocus(seller.seller_vehicle_id)}
                                      className={cn("h-10 sm:h-9 text-sm rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:shadow-[0_0_0_2px_hsl(var(--ring)/0.25)]", addLotForm.errors.lotName && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")}
                                      maxLength={50}
                                      autoFocus
                                    />
                                    {addLotForm.errors.lotName && <p className="text-[10px] text-red-500 mt-0.5">{addLotForm.errors.lotName}</p>}
                                  </div>
                                  {/* Bags */}
                                  <div className="w-[5.5rem] sm:w-[6rem] md:w-[5.5rem] lg:w-[7rem] xl:w-[8rem] flex-none">
                                    <Input
                                      type="number"
                                      placeholder="Bags"
                                      value={addLotForm.bags}
                                      onChange={e => setAddLotForm(prev => prev ? { ...prev, bags: e.target.value, errors: { ...prev.errors, bags: undefined } } : null)}
                                      onFocus={() => handleLotEntryFieldFocus(seller.seller_vehicle_id)}
                                      className={cn("h-10 sm:h-9 text-sm rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:shadow-[0_0_0_2px_hsl(var(--ring)/0.25)]", addLotForm.errors.bags && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")}
                                      min={1}
                                      max={100000}
                                    />
                                    {addLotForm.errors.bags && <p className="text-[10px] text-red-500 mt-0.5">{addLotForm.errors.bags}</p>}
                                  </div>
                                  {/* Commodity */}
                                  <div className="w-[8.5rem] sm:w-[9rem] md:w-[8.5rem] lg:w-[12rem] xl:w-[14rem] flex-none">
                                    <select
                                      value={addLotForm.commodityName}
                                      onChange={e => setAddLotForm(prev => prev ? { ...prev, commodityName: e.target.value, variant: '', errors: { ...prev.errors, commodity: undefined } } : null)}
                                      onFocus={() => handleLotEntryFieldFocus(seller.seller_vehicle_id)}
                                      className={cn("h-10 sm:h-9 w-full rounded-lg bg-background border border-input text-sm px-2 focus:outline-none focus:ring-0 focus:border-primary focus:shadow-[0_0_0_2px_hsl(var(--ring)/0.25)]", addLotForm.errors.commodity && "border-red-500 ring-2 ring-red-500/30")}
                                    >
                                      <option value="" disabled>Select Commodity</option>
                                      {commodities.map((c: any) => (
                                        <option key={c.commodity_id} value={c.commodity_name}>{c.commodity_name}</option>
                                      ))}
                                    </select>
                                    {addLotForm.errors.commodity && <p className="text-[10px] text-red-500 mt-0.5">{addLotForm.errors.commodity}</p>}
                                  </div>
                                  {/* Variant */}
                                  <div className="w-[7rem] sm:w-[7.5rem] md:w-[7rem] lg:w-[10rem] xl:w-[12rem] flex-none">
                                    <select
                                      value={addLotForm.variant}
                                      onChange={e => setAddLotForm(prev => prev ? { ...prev, variant: e.target.value } : null)}
                                      onFocus={() => handleLotEntryFieldFocus(seller.seller_vehicle_id)}
                                      className="h-10 sm:h-9 w-full rounded-lg bg-background border border-input text-sm px-2 focus:outline-none focus:ring-0 focus:border-primary focus:shadow-[0_0_0_2px_hsl(var(--ring)/0.25)]"
                                    >
                                      {VARIANT_OPTIONS.map(opt => (
                                        <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                      </div>
                                    </LotFieldsHorizontalScroll>
                                    </div>
                                    {/* Action buttons */}
                                    <div className="relative z-[8] flex flex-nowrap items-center gap-2 justify-end sm:self-start pl-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setAddLotForm({
                                        sellerId: seller.seller_vehicle_id,
                                        lotName: "",
                                        bags: "",
                                        commodityName: commodities[0]?.commodity_name || "",
                                        variant: "",
                                        errors: {},
                                      })}
                                      className="h-8 sm:h-9 shrink-0 whitespace-nowrap text-xs"
                                    >
                                      Cancel
                                    </Button>
                                    <Button type="button" size="sm" onClick={() => saveFormLot(si)} className="h-10 sm:h-10 px-4 shrink-0 whitespace-nowrap text-sm font-semibold bg-[#6075FF] hover:bg-[#5060e8] text-white border border-[#6075FF]">
                                      {addLotForm.editingLotId ? "Update" : "Save Lot"}
                                    </Button>
                                    </div>
                                  </div>
                                </AddLotHorizontalScrollPanel>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              key={`${seller.seller_vehicle_id}-lots-mobile`}
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="border-t border-border/30"
                            >
                              <LotsScrollPanel
                                sellerId={seller.seller_vehicle_id}
                                registerScrollEl={setLotsScrollRef}
                                showEdgeHints
                                contentLayoutKey={seller.lots.length}
                                showScrollAffordanceFooter={seller.lots.length > 0}
                                scrollAffordanceHint="Swipe here to scroll lots"
                                className="min-h-[11rem] max-h-[min(28rem,52dvh)] overflow-y-auto overflow-x-auto lg:overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch] touch-auto border-t border-border/30 pb-6"
                              >
                                  {seller.lots.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-3 italic px-3">No lots added yet.</p>
                                  ) : (
                                    <LotFieldsHorizontalScroll>
                                      <table className="w-[42rem] md:w-full text-sm sm:text-base table-fixed">
                                        <thead className="sticky top-0 z-[3] bg-background">
                                          <tr className="border-b border-border/20">
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">SL. NO</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">Lot Name</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">Bags</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">Commodity</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold hidden md:table-cell md:w-1/6">Variant</th>
                                            <th className="bg-muted/95 backdrop-blur text-center py-2 px-3 text-muted-foreground font-semibold w-1/6">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {seller.lots.map((lot, li) => {
                                            const lotSerialLabel = lot.lot_serial_number != null && lot.lot_serial_number > 0 ? String(lot.lot_serial_number) : "-";
                                            const isBeingEdited = addLotForm?.editingLotId === lot.lot_id;
                                            return (
                                              <tr
                                                key={lot.lot_id}
                                                onClick={() => editFormLot(si, li)}
                                                className={cn(
                                                  "border-b border-border/10 transition-colors cursor-pointer",
                                                  isBeingEdited ? "bg-blue-50 dark:bg-blue-950/20" : "hover:bg-muted/20"
                                                )}
                                              >
                                                <td className="py-1 px-2.5 align-middle text-center">
                                                  {lotSerialLabel !== "-" ? (
                                                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold leading-none text-blue-700 dark:text-blue-300 whitespace-nowrap ring-1 ring-blue-500/20">
                                                      {lotSerialLabel} — {vehicleTotalBags} / {sellerTotal}
                                                    </span>
                                                  ) : (
                                                    <span className="text-muted-foreground font-mono text-[9px] sm:text-[10px]">—</span>
                                                  )}
                                                </td>
                                                <td className="py-1 px-2.5 align-middle text-center">
                                                  <span className="inline-flex max-w-none whitespace-nowrap px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] sm:text-xs font-bold leading-none">
                                                    {lot.lot_name || "-"}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-3 align-middle text-center font-medium text-foreground">{lot.quantity}</td>
                                                <td className="py-2 px-3 align-middle text-center text-foreground truncate">{lot.commodity_name || "-"}</td>
                                                <td className="py-2 px-3 align-middle text-center text-muted-foreground hidden md:table-cell">{lot.variant || "None"}</td>
                                                <td className="py-2 px-3 align-middle text-center">
                                                  <div className="flex justify-center gap-1">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingDelete({ kind: "lot", sellerIdx: si, lotIdx: li, label: lot.lot_name || "Lot " + (li + 1) });
                                                      }}
                                                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex-shrink-0"
                                                      aria-label="Delete lot"
                                                    >
                                                      <Trash2 className="w-4 h-4 sm:w-4 sm:h-4" />
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </LotFieldsHorizontalScroll>
                                  )}
                              </LotsScrollPanel>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );})}

                    </> )}

                    {/* ── Sticky Submit Button ── */}
                    <div className="h-2" />
                  </div>

                  {/* Fixed bottom submit bar - sits above bottom nav */}
                  <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)-1px)] sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)-1px)] md:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)-0.75rem-1px)] lg:bottom-0 left-0 right-0 z-[60] bg-background/90 backdrop-blur-xl px-3 pt-2.5 pb-0 sm:px-4 sm:pt-3 sm:pb-0 md:px-6">
                    <div className="max-w-[480px] md:max-w-full mx-auto">
                      <div className="flex items-stretch gap-0 rounded-2xl bg-white dark:bg-card p-1.5 shadow-sm border border-border/30">
                        <Button
                          type="button"
                          size="sm"
                          onClick={openSellerSearchPanel}
                          disabled={(!isMultiSeller && sellers.length >= 1) || hasIncompleteSellerDetails}
                          className="h-12 md:h-14 rounded-xl flex-1 text-xs sm:text-sm font-semibold flex items-center justify-center bg-[#6075FF] hover:bg-[#5060e8] text-white border border-[#6075FF] shadow-md shadow-[#6075FF]/25 active:shadow-lg active:shadow-[#6075FF]/35 active:scale-[0.99] transition-all disabled:opacity-60 disabled:bg-[#6075FF] disabled:text-white"
                        >
                          <Users className="w-4 h-4 md:w-5 md:h-5" />
                          <span className="ml-1.5 sm:ml-2">Add Seller</span>
                        </Button>
                        <div className="w-2 shrink-0 bg-white dark:bg-card" aria-hidden />
                        <Button
                          onClick={handleSubmitArrival}
                          className="flex-1 h-12 md:h-14 rounded-xl font-bold text-xs sm:text-sm md:text-base bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 active:shadow-xl active:shadow-emerald-500/35 active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center"
                        >
                          <FileText className="w-4 h-4 md:w-5 md:h-5" />
                          <span className="ml-1.5 sm:ml-2 truncate">{editingVehicleId != null ? 'Update Arrival' : (sellers.length > 0 ? `Submit (${sellers.length})` : 'Submit Arrival')}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}

      {!isDesktop && <BottomNav />}

      {/* ── Seller search dropdown rendered via portal (escapes overflow-hidden) ── */}
      {sellerDropdown && activeSellerSearch && filteredContacts.length > 0 && createPortal(
        <AnimatePresence>
          <motion.div
            key="seller-dropdown-portal"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              top: sellerDropdownPos.top,
              left: sellerDropdownPos.left,
              width: sellerDropdownPos.width,
              zIndex: 9999,
            }}
            className="bg-card border border-border/50 rounded-xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden"
          >
            {filteredContacts.map(c => (
              <button
                key={c.contact_id}
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  fillSellerRowFromContact(activeSellerSearch.sellerId, c);
                }}
                className="w-full px-3 py-3 text-left text-sm hover:bg-muted/50 transition-colors flex items-start gap-3 border-b border-border/20 last:border-0 touch-manipulation"
              >
                <div className="mt-0.5 w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">{c.mark || c.name?.charAt(0) || '?'}</span>
                </div>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="min-w-0">
                    <span className="text-foreground font-medium break-words">{c.name}</span>
                    {c.mark ? (
                      <span className="text-muted-foreground text-xs"> ({c.mark})</span>
                    ) : null}
                  </div>
                  {c.phone ? (
                    <span className="text-xs text-muted-foreground tabular-nums break-all">{c.phone}</span>
                  ) : null}
                </div>
              </button>
            ))}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* ── Broker search dropdown (contact or type any name) ── */}
      {brokerDropdown && filteredBrokers.length > 0 && createPortal(
        <AnimatePresence>
          <motion.div
            key="broker-dropdown-portal"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              top: brokerDropdownPos.top,
              left: brokerDropdownPos.left,
              width: brokerDropdownPos.width,
              zIndex: 9999,
            }}
            className="bg-card border border-border/50 rounded-xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden"
          >
            {filteredBrokers.map(c => (
              <button
                key={c.contact_id}
                type="button"
                onMouseDown={e => { e.preventDefault(); setBrokerName(c.name ?? ''); setBrokerContactId(Number(c.contact_id) || null); setBrokerDropdown(false); }}
                className="w-full px-3 py-3 text-left text-sm hover:bg-muted/50 transition-colors flex items-start gap-3 border-b border-border/20 last:border-0 touch-manipulation"
              >
                <div className="mt-0.5 w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">{c.mark || c.name?.charAt(0) || '?'}</span>
                </div>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="min-w-0">
                    <span className="text-foreground font-medium break-words">{c.name}</span>
                    {c.mark ? (
                      <span className="text-muted-foreground text-xs"> ({c.mark})</span>
                    ) : null}
                  </div>
                  {c.phone ? (
                    <span className="text-xs text-muted-foreground tabular-nums break-all">{c.phone}</span>
                  ) : null}
                </div>
              </button>
            ))}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(v) => { if (!v) setPendingDelete(null); }}
        title={
          pendingDelete?.kind === 'arrival' ? 'Delete arrival?'
          : pendingDelete?.kind === 'seller' ? 'Remove seller?'
          : 'Remove lot?'
        }
        description={
          pendingDelete?.kind === 'arrival'
            ? `Delete arrival for vehicle "${pendingDelete.label}"? This cannot be undone.`
          : pendingDelete?.kind === 'seller'
            ? `Remove "${pendingDelete.label}" and all their lots from this draft?`
          : `Remove "${pendingDelete?.label}" from the draft form?`
        }
        confirmLabel={pendingDelete?.kind === 'arrival' ? 'Delete' : 'Remove'}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.kind === 'arrival') handleDeleteArrival(pendingDelete.vehicleId);
          else if (pendingDelete.kind === 'seller') removeSeller(pendingDelete.idx);
          else removeLot(pendingDelete.sellerIdx, pendingDelete.lotIdx);
        }}
      />
    </div>
  );
};

export default ArrivalsPage;