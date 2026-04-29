import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Info, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BillingMoneyInput } from '@/components/billing/BillingMoneyInput';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ARRIVALS_TABLE_HEADER_GRADIENT } from '@/components/arrivals/arrivalsTableTokens';
import {
  auctionApi,
  type AuctionBidCreateRequest,
  type AuctionEntryDTO,
  type AuctionSessionDTO,
  type LotSummaryDTO,
} from '@/services/api/auction';
import { cn } from '@/lib/utils';
import { roundMoney2 } from '@/utils/billingMoney';
import { vehicleOpsPrimaryBtnClass } from './vehicleOpsUi';

/** Display-only — matches `readOnlyLotInputClass` in SellerDetailPanel (dashed, muted). */
const readOnlyBidTextClass =
  'h-9 w-full min-w-0 cursor-default border-dashed bg-muted/25 text-sm text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0';
const readOnlyBidNumericClass = cn(readOnlyBidTextClass, 'text-right tabular-nums');

const numberInputNoSpinnerClass =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const REF_FORMULA_HINT =
  'Computed from this row: buyer rate − brokerage (extra) − preset margin. Display only — not editable.';

const NEW_SELLER_HINT =
  'Stored separately from the auction bid and buyer rate. Save writes summary_seller_rate only; Sales Pad bid / buyer totals are unchanged.';

/** Persisted Summary column (defaults from auction bid until you edit here). */
function serverSummarySellerRate(e: AuctionEntryDTO): number {
  const s = e.summary_seller_rate;
  if (s != null && Number.isFinite(Number(s))) return roundMoney2(Number(s));
  return roundMoney2(Number(e.bid_rate ?? e.seller_rate ?? 0));
}

/** Display-only reference back-out for the row. */
function refSellerRateDisplay(e: AuctionEntryDTO): number {
  const buyer = Number(e.buyer_rate ?? e.bid_rate ?? 0);
  const brokerage = Number(e.extra_rate ?? 0);
  const preset = Number(e.preset_margin ?? 0);
  return roundMoney2(buyer - brokerage - preset);
}

function roundDisplay(n: number): string {
  if (!Number.isFinite(n)) return '';
  const t = Math.round(n * 100) / 100;
  return String(t);
}

const EMPTY_SESSION_ENTRIES: AuctionEntryDTO[] = [];

export type LotBidsTableProps = {
  lotId: number;
  session: AuctionSessionDTO | null;
  loading: boolean;
  error: string | null;
  onSessionUpdated: (s: AuctionSessionDTO) => void;
  /** From `listLots` — used for buyer suggestions when adding a bid */
  lotSummary?: LotSummaryDTO | null;
  /** Refetch vehicle-ops summary (lots, RD, billing slice) after auction writes */
  onAuctionDataInvalidate?: () => void | Promise<void>;
  /** True while “new seller rate” differs from saved summary_seller_rate (same rule as Save). */
  onUnsavedRatesChange?: (hasUnsaved: boolean) => void;
};

/** Form field label styling — matches Billing mobile line-item hints. */
function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

export function LotBidsTable({
  lotId,
  session,
  loading,
  error,
  onSessionUpdated,
  lotSummary,
  onAuctionDataInvalidate,
  onUnsavedRatesChange,
}: LotBidsTableProps) {
  /** Local overrides after BillingMoneyInput commit; cleared when they match server summary_seller_rate. */
  const [localSummaryByEntryId, setLocalSummaryByEntryId] = useState<Record<number, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<AuctionEntryDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveRetryAllowLotIncrease, setSaveRetryAllowLotIncrease] = useState(false);
  const [addBidOpen, setAddBidOpen] = useState(false);
  const [addBidSaving, setAddBidSaving] = useState(false);
  const [addBidRetryAllowIncrease, setAddBidRetryAllowIncrease] = useState(false);
  const [addBidQty, setAddBidQty] = useState('');
  const [addBidBaseRate, setAddBidBaseRate] = useState('');
  /** Signed preset margin — maps to auction `preset_applied`, not `extra_rate` (auction pad keeps extra at 0). */
  const [addBidPresetMargin, setAddBidPresetMargin] = useState('0');
  const [addBidToken, setAddBidToken] = useState('0');
  const [addBuyerMark, setAddBuyerMark] = useState('');
  const [addBuyerName, setAddBuyerName] = useState('');
  const [addBidScribble, setAddBidScribble] = useState(true);
  const [addBidQtyDialog, setAddBidQtyDialog] = useState<{
    currentTotal: number;
    lotTotal: number;
    attemptedQty: number;
  } | null>(null);
  const [addBidDuplicateDialog, setAddBidDuplicateDialog] = useState<{
    existingEntry: AuctionEntryDTO;
    rate: number;
    qty: number;
  } | null>(null);
  /** Buyer carousel below lg — scroll-snap + dots (BillingPage lot-item pattern). */
  const mobileBuyersCarouselRef = useRef<HTMLDivElement | null>(null);
  const [activeEntrySlide, setActiveEntrySlide] = useState(0);

  const entries = session?.entries ?? EMPTY_SESSION_ENTRIES;

  const entryIdsKey = useMemo(() => entries.map((e) => e.auction_entry_id).join(','), [entries]);

  useEffect(() => {
    setLocalSummaryByEntryId((prev) => {
      const next = { ...prev };
      for (const idStr of Object.keys(next)) {
        const id = Number(idStr);
        const row = entries.find((x) => x.auction_entry_id === id);
        if (!row) delete next[id];
        else if (Math.abs(roundMoney2(next[id]) - serverSummarySellerRate(row)) < 0.005) delete next[id];
      }
      return next;
    });
  }, [entries]);

  useEffect(() => {
    setActiveEntrySlide(0);
    mobileBuyersCarouselRef.current?.scrollTo({ left: 0 });
  }, [lotId, entryIdsKey]);

  const handleBuyersCarouselScroll = useCallback(() => {
    const el = mobileBuyersCarouselRef.current;
    const n = entries.length;
    if (!el || n <= 0) return;
    const step = el.scrollWidth / n;
    if (step <= 0) return;
    const idx = Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / step)));
    setActiveEntrySlide(idx);
  }, [entries.length]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const updated = await auctionApi.deleteBid(lotId, deleteTarget.auction_entry_id);
      onSessionUpdated(updated);
      toast.success('Bid removed');
      /** Full summary reload is heavy; refresh in background so delete feels instant. */
      void Promise.resolve(onAuctionDataInvalidate?.()).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, lotId, onAuctionDataInvalidate, onSessionUpdated]);

  const resetAddBidForm = useCallback(() => {
    setAddBidQty('');
    setAddBidBaseRate('');
    setAddBidPresetMargin('0');
    setAddBidToken('0');
    setAddBuyerMark('');
    setAddBuyerName('');
    setAddBidScribble(true);
    setAddBidRetryAllowIncrease(false);
    setAddBidQtyDialog(null);
    setAddBidDuplicateDialog(null);
  }, []);

  useEffect(() => {
    if (!addBidOpen) return;
    const rem = session != null ? Number(session.remaining_bags) || 0 : 0;
    setAddBidQty(rem > 0 ? String(rem) : '');
    setAddBidBaseRate('');
    setAddBidPresetMargin('0');
    setAddBidToken('0');
    setAddBuyerMark('');
    setAddBuyerName('');
    setAddBidScribble(true);
    setAddBidRetryAllowIncrease(false);
    setAddBidQtyDialog(null);
    setAddBidDuplicateDialog(null);
  }, [addBidOpen, session?.remaining_bags, session?.auction_id, lotId]);

  const executeVehicleOpsAddBid = useCallback(
    async (allowLotIncreaseFromStep: boolean) => {
      if (!session) {
        toast.error('Session not loaded');
        return;
      }
      const qtyDigits = String(addBidQty).replace(/[^\d]/g, '');
      const qty = qtyDigits === '' ? NaN : Math.max(1, parseInt(qtyDigits, 10));
      const rate = roundMoney2(Number(addBidBaseRate));
      const presetRaw = String(addBidPresetMargin ?? '0').replace(/,/g, '').trim();
      const presetMargin =
        presetRaw === '' || presetRaw === '-' ? 0 : roundMoney2(Number(presetRaw));
      const tokenAdvance = roundMoney2(Number(addBidToken || 0));
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error('Enter valid bid quantity');
        return;
      }
      if (!Number.isFinite(rate) || rate < 1) {
        toast.error('Enter valid base rate (at least 1)');
        return;
      }
      if (!Number.isFinite(presetMargin) || !Number.isFinite(tokenAdvance)) {
        toast.error('Enter valid preset margin and token values');
        return;
      }
      const mark = addBuyerMark.trim();
      const name = addBuyerName.trim();
      if (!mark || !name) {
        toast.error('Enter buyer mark and name');
        return;
      }
      const allow = allowLotIncreaseFromStep || addBidRetryAllowIncrease;
      const body: AuctionBidCreateRequest = {
        buyer_name: name,
        buyer_mark: mark,
        is_scribble: addBidScribble,
        is_self_sale: false,
        rate,
        quantity: qty,
        extra_rate: 0,
        token_advance: tokenAdvance,
        preset_applied: presetMargin,
        preset_type: presetMargin < 0 ? 'LOSS' : 'PROFIT',
        allow_lot_increase: allow,
      };
      try {
        setAddBidSaving(true);
        const next = await auctionApi.addBid(lotId, body);
        onSessionUpdated(next);
        setAddBidRetryAllowIncrease(false);
        setAddBidOpen(false);
        resetAddBidForm();
        await onAuctionDataInvalidate?.();
        toast.success('Bid added');
      } catch (err: unknown) {
        const e = err as { isConflict?: boolean; message?: string };
        if (e.isConflict) {
          setAddBidRetryAllowIncrease(true);
          toast.error('Quantity exceeds lot. Tap Save bid again to allow lot increase and retry.');
        } else {
          toast.error(e instanceof Error ? e.message : 'Failed to add bid');
        }
      } finally {
        setAddBidSaving(false);
      }
    },
    [
      addBidPresetMargin,
      addBidQty,
      addBidBaseRate,
      addBidRetryAllowIncrease,
      addBidScribble,
      addBidToken,
      addBuyerMark,
      addBuyerName,
      lotId,
      onAuctionDataInvalidate,
      onSessionUpdated,
      resetAddBidForm,
      session,
    ],
  );

  const beginVehicleOpsAddBid = useCallback(
    (allowLotIncreaseFromStep: boolean) => {
      if (!session) {
        toast.error('Session not loaded');
        return;
      }
      const qty = Math.max(0, parseInt(String(addBidQty).replace(/[^\d]/g, '') || '0', 10));
      const rate = Number(addBidBaseRate);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error('Enter a whole-number bid quantity (bags)');
        return;
      }
      if (!Number.isFinite(rate) || rate < 1) {
        toast.error('Enter valid base rate');
        return;
      }
      const markNorm = addBuyerMark.trim().toLowerCase();
      if (!markNorm || !addBuyerName.trim()) {
        toast.error('Enter buyer mark and name');
        return;
      }
      const lotTotal = session.lot?.bag_count ?? 0;
      const currentSold = Number(session.total_sold_bags) || 0;
      const newTotal = currentSold + qty;
      if (newTotal > lotTotal && !addBidRetryAllowIncrease && !allowLotIncreaseFromStep) {
        setAddBidQtyDialog({ currentTotal: currentSold, lotTotal, attemptedQty: qty });
        return;
      }
      const dup = (session.entries ?? []).find(
        (en) => !en.is_self_sale && (en.buyer_mark || '').trim().toLowerCase() === markNorm,
      );
      if (dup) {
        setAddBidDuplicateDialog({ existingEntry: dup, rate, qty });
        return;
      }
      void executeVehicleOpsAddBid(allowLotIncreaseFromStep);
    },
    [
      addBidBaseRate,
      addBidQty,
      addBidRetryAllowIncrease,
      addBuyerMark,
      addBuyerName,
      executeVehicleOpsAddBid,
      session,
    ],
  );

  const handleSaveRates = useCallback(async () => {
    if (!session || entries.length === 0) {
      toast.message('Nothing to save', { description: 'Add a bid first or open a lot with entries.' });
      return;
    }
    setSaving(true);
    try {
      const dirty: { entry: AuctionEntryDTO; newSummary: number }[] = [];
      for (const e of entries) {
        const srv = serverSummarySellerRate(e);
        const cur = localSummaryByEntryId[e.auction_entry_id] ?? srv;
        const neuN = roundMoney2(cur);
        if (!Number.isFinite(neuN) || neuN < 1) {
          toast.error(`Invalid new seller rate for ${e.buyer_mark || 'this bid'} (must be at least 1).`);
          return;
        }
        if (Math.abs(neuN - srv) < 0.005) continue;
        dirty.push({ entry: e, newSummary: neuN });
      }
      if (dirty.length === 0) {
        toast.message('No changes to save');
        return;
      }
      for (const { entry, newSummary } of dirty) {
        try {
          const updated = await auctionApi.updateBid(lotId, entry.auction_entry_id, {
            summary_seller_rate: newSummary,
            expected_last_modified_ms: entry.last_modified_ms ?? undefined,
          });
          onSessionUpdated(updated);
        } catch (err: unknown) {
          const ex = err as { isStaleBid?: boolean; isConflict?: boolean; message?: string };
          if (ex.isStaleBid) {
            toast.error(ex.message || 'This bid was changed elsewhere. Refreshing…');
            try {
              const fresh = await auctionApi.getOrStartSession(lotId);
              onSessionUpdated(fresh);
            } catch {
              /* ignore */
            }
            return;
          }
          if (ex.isConflict) {
            setSaveRetryAllowLotIncrease(true);
            toast.error('Tap Save again to allow lot increase and retry.');
            return;
          }
          toast.error(err instanceof Error ? err.message : 'Failed to save');
          return;
        }
      }
      setSaveRetryAllowLotIncrease(false);
      await onAuctionDataInvalidate?.();
      toast.success('Summary seller rates saved');
    } finally {
      setSaving(false);
    }
  }, [
    entries,
    localSummaryByEntryId,
    lotId,
    onAuctionDataInvalidate,
    onSessionUpdated,
    session,
  ]);

  const busy = loading || deleting || saving;

  const hasUnsavedRates = useMemo(() => {
    if (!session || entries.length === 0) return false;
    for (const e of entries) {
      const srv = serverSummarySellerRate(e);
      const cur = localSummaryByEntryId[e.auction_entry_id] ?? srv;
      const neuN = roundMoney2(cur);
      if (!Number.isFinite(neuN) || neuN < 1) return true;
      if (Math.abs(neuN - srv) >= 0.005) return true;
    }
    return false;
  }, [entries, localSummaryByEntryId, session]);

  useEffect(() => {
    onUnsavedRatesChange?.(hasUnsavedRates);
  }, [hasUnsavedRates, onUnsavedRatesChange]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (loading && !session) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading bids…
      </div>
    );
  }

  const showTable = session != null && entries.length > 0;
  const emptyHint =
    session == null && !loading
      ? 'No auction session for this lot yet.'
      : 'No bids for this lot in the current session.';

  return (
    <div className="min-w-0">
      {!showTable ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{emptyHint}</p>
      ) : null}

      {showTable ? (
        <>
          {/* Desktop: unchanged wide table from lg (1024px) — aligns with VehicleOps seller strip / lot carousel. */}
          <div className="hidden max-w-full overflow-x-auto rounded-xl border border-border/30 bg-background/40 lg:block">
        <Table className="min-w-[720px] text-xs sm:text-sm">
          <TableHeader>
            <TableRow
              className={cn(
                ARRIVALS_TABLE_HEADER_GRADIENT,
                'border-0 border-b border-white/25 shadow-[0_4px_12px_rgba(91,140,255,0.35)]',
                'hover:bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] hover:brightness-[1.03]',
              )}
            >
              <TableHead className="whitespace-nowrap text-white/95 first:rounded-tl-xl">Mark</TableHead>
              <TableHead className="text-right text-white/95">Qty</TableHead>
              <TableHead className="text-right text-white/95">Buyer rate</TableHead>
              <TableHead className="text-right text-white/95">
                <span className="inline-flex items-center gap-1">
                  Ref seller rate
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-white/85 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                        aria-label="Reference seller rate hint"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-left text-xs">
                      {REF_FORMULA_HINT}
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableHead>
              <TableHead className="text-right text-white/95">Brokerage</TableHead>
              <TableHead className="text-right text-white/95">Preset</TableHead>
              <TableHead className="text-right text-white/95">
                <span className="inline-flex items-center gap-1">
                  New seller rate
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-white/85 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                        aria-label="New seller rate hint"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-left text-xs">
                      {NEW_SELLER_HINT}
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableHead>
              <TableHead className="w-12 text-center text-white/95 last:rounded-tr-xl"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const id = e.auction_entry_id;
              const buyerRate = Number(e.buyer_rate ?? e.bid_rate ?? 0);
              const brokerage = Number(e.extra_rate ?? 0);
              const preset = Number(e.preset_margin ?? 0);
              const summaryVal =
                localSummaryByEntryId[id] !== undefined ? localSummaryByEntryId[id] : serverSummarySellerRate(e);
              return (
                <TableRow key={id} className="border-border/30">
                  <TableCell className="font-medium">{e.buyer_mark || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.quantity ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{roundDisplay(buyerRate)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      readOnly
                      tabIndex={-1}
                      aria-readonly
                      value={`₹${roundDisplay(refSellerRateDisplay(e))}`}
                      title="Reference seller rate (display only)"
                      aria-label={`Reference seller rate for ${e.buyer_mark}`}
                      className={cn(readOnlyBidNumericClass, 'h-8 w-[5.5rem]')}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">₹{roundDisplay(brokerage)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">₹{roundDisplay(preset)}</TableCell>
                  <TableCell className="text-right">
                    <BillingMoneyInput
                      commitMode="blur"
                      min={1}
                      disabled={busy}
                      value={summaryVal}
                      onCommit={(n) =>
                        setLocalSummaryByEntryId((p) => ({
                          ...p,
                          [id]: roundMoney2(n),
                        }))
                      }
                      title={`New seller rate for ${e.buyer_mark}`}
                      className="h-8 w-[5.5rem] rounded-lg border-border/50 text-right tabular-nums text-sm"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      className={cn(
                        'inline-flex rounded-lg p-2 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        busy && 'pointer-events-none opacity-50',
                      )}
                      aria-label={`Delete bid ${e.bid_number}`}
                      onClick={() => setDeleteTarget(e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
          </div>

          <div className="lg:hidden">
        {entries.length > 1 && (
          <div className="mb-2 flex items-center justify-center gap-1.5" role="tablist" aria-label="Buyers in this lot">
            {entries.map((e, ei) => (
              <button
                key={`vehicle-ops-bid-dot-${e.auction_entry_id}`}
                type="button"
                role="tab"
                aria-selected={activeEntrySlide === ei}
                aria-label={`Go to buyer ${ei + 1}`}
                onClick={() => {
                  const el = mobileBuyersCarouselRef.current;
                  if (!el) return;
                  const left = (el.scrollWidth / entries.length) * ei;
                  el.scrollTo({ left, behavior: 'smooth' });
                }}
                className={cn(
                  'rounded-full transition-all bg-muted-foreground/40',
                  activeEntrySlide === ei ? 'h-2 w-4 bg-primary' : 'h-2 w-2',
                )}
              />
            ))}
          </div>
        )}
        <div
          ref={mobileBuyersCarouselRef}
          onScroll={handleBuyersCarouselScroll}
          className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] touch-[pan-x_pan-y] lg:touch-auto no-scrollbar snap-x snap-mandatory"
        >
          {entries.map((e) => {
            const id = e.auction_entry_id;
            const buyerRate = Number(e.buyer_rate ?? e.bid_rate ?? 0);
            const brokerage = Number(e.extra_rate ?? 0);
            const preset = Number(e.preset_margin ?? 0);
            const summaryVal =
              localSummaryByEntryId[id] !== undefined ? localSummaryByEntryId[id] : serverSummarySellerRate(e);
            return (
              <div
                key={id}
                className="glass-card w-[calc(100%-0.1rem)] shrink-0 snap-start space-y-3 rounded-xl border border-border/50 bg-card/80 p-3 shadow-sm"
              >
                <div className="flex items-end justify-between gap-2 border-b border-border/30 pb-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <FieldLabel>Mark</FieldLabel>
                    <Input
                      readOnly
                      tabIndex={-1}
                      aria-readonly
                      value={e.buyer_mark || '—'}
                      className={readOnlyBidTextClass}
                    />
                  </div>
                  <button
                    type="button"
                    className={cn(
                      'mb-0.5 inline-flex shrink-0 rounded-lg p-2 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      busy && 'pointer-events-none opacity-50',
                    )}
                    aria-label={`Delete bid ${e.bid_number}`}
                    onClick={() => setDeleteTarget(e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0 space-y-1">
                    <FieldLabel>Qty</FieldLabel>
                    <Input
                      readOnly
                      tabIndex={-1}
                      aria-readonly
                      value={String(e.quantity ?? 0)}
                      className={readOnlyBidNumericClass}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <FieldLabel>Buyer rate (₹)</FieldLabel>
                    <Input
                      readOnly
                      tabIndex={-1}
                      aria-readonly
                      value={`₹${roundDisplay(buyerRate)}`}
                      className={readOnlyBidNumericClass}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <FieldLabel>Brokerage (₹)</FieldLabel>
                    <Input
                      readOnly
                      tabIndex={-1}
                      aria-readonly
                      value={`₹${roundDisplay(brokerage)}`}
                      className={readOnlyBidNumericClass}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <FieldLabel>Preset (₹)</FieldLabel>
                    <Input
                      readOnly
                      tabIndex={-1}
                      aria-readonly
                      value={`₹${roundDisplay(preset)}`}
                      className={readOnlyBidNumericClass}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 items-center gap-1">
                      <FieldLabel>Ref seller rate (₹)</FieldLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Reference seller rate hint"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-left text-xs">
                          {REF_FORMULA_HINT}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      readOnly
                      tabIndex={-1}
                      aria-readonly
                      value={`₹${roundDisplay(refSellerRateDisplay(e))}`}
                      title="Reference seller rate (display only)"
                      aria-label={`Reference seller rate for ${e.buyer_mark}`}
                      className={cn(readOnlyBidNumericClass, 'h-10 text-sm')}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 items-center gap-1">
                      <FieldLabel>New seller rate (₹)</FieldLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="New seller rate hint"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-left text-xs">
                          {NEW_SELLER_HINT}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <BillingMoneyInput
                      commitMode="blur"
                      min={1}
                      disabled={busy}
                      value={summaryVal}
                      onCommit={(n) =>
                        setLocalSummaryByEntryId((p) => ({
                          ...p,
                          [id]: roundMoney2(n),
                        }))
                      }
                      title={`New seller rate for ${e.buyer_mark}`}
                      className="h-10 w-full min-w-0 rounded-lg border-border/50 text-right tabular-nums text-sm"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
          </div>
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          className={cn(vehicleOpsPrimaryBtnClass, 'rounded-xl')}
          disabled={busy || session == null}
          onClick={() => setAddBidOpen(true)}
        >
          Add New Bid
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          className={cn(vehicleOpsPrimaryBtnClass, 'rounded-xl')}
          disabled={busy || session == null || entries.length === 0}
          onClick={() => void handleSaveRates()}
        >
          {saveRetryAllowLotIncrease ? 'Save (allow lot increase)' : 'Save'}
        </Button>
      </div>

      <Dialog
        open={addBidOpen}
        onOpenChange={(open) => {
          setAddBidOpen(open);
          if (!open) resetAddBidForm();
        }}
      >
        <DialogContent className="max-h-[min(92dvh,880px)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add New Bid</DialogTitle>
            <p className="text-left text-sm font-normal text-muted-foreground">
              Lot session — remaining bags:{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {session != null ? Number(session.remaining_bags) || 0 : '—'}
              </span>
            </p>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {lotSummary?.participating_buyers != null && lotSummary.participating_buyers.length > 0 ? (
              <div className="space-y-1">
                <Label className="text-xs">Buyers on this lot</Label>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {lotSummary.participating_buyers.map((b) => (
                    <button
                      key={b.group_key}
                      type="button"
                      className={cn(
                        'rounded-lg border border-border/50 bg-muted/30 px-2 py-1 text-left text-xs transition-colors hover:bg-muted/60',
                        addBuyerMark === b.buyer_mark && addBuyerName === b.buyer_name && 'border-primary bg-primary/10',
                      )}
                      onClick={() => {
                        setAddBuyerMark(b.buyer_mark);
                        setAddBuyerName(b.buyer_name);
                        setAddBidScribble(!b.registered);
                      }}
                    >
                      <span className="font-semibold">{b.buyer_mark}</span>
                      <span className="text-muted-foreground"> · {b.buyer_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Buyer mark *</Label>
                <Input
                  value={addBuyerMark}
                  onChange={(ev) => setAddBuyerMark(ev.target.value)}
                  className="h-9 rounded-lg text-sm"
                  placeholder="Mark"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Buyer name *</Label>
                <Input
                  value={addBuyerName}
                  onChange={(ev) => setAddBuyerName(ev.target.value)}
                  className="h-9 rounded-lg text-sm"
                  placeholder="Name"
                  autoComplete="off"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={addBidScribble}
                onChange={(ev) => setAddBidScribble(ev.target.checked)}
              />
              Temporary / scribble buyer
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Qty (bags) *</Label>
                <BillingMoneyInput
                  value={Number(addBidQty) || 0}
                  min={0}
                  integerOnly
                  liveDebounceMs={0}
                  onCommit={(n) => setAddBidQty(n > 0 ? String(Math.max(1, Math.round(n))) : '')}
                  placeholder={session != null ? String(Number(session.remaining_bags) || 0) : ''}
                  className={cn('h-9 rounded-lg text-sm', numberInputNoSpinnerClass)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Base *</Label>
                <BillingMoneyInput
                  value={Number(addBidBaseRate) || 0}
                  min={0}
                  liveDebounceMs={0}
                  onCommit={(n) => setAddBidBaseRate(n >= 1 ? String(roundMoney2(n)) : '')}
                  className={cn('h-9 rounded-lg text-sm', numberInputNoSpinnerClass)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preset (margin)</Label>
                <BillingMoneyInput
                  value={(() => {
                    const t = String(addBidPresetMargin ?? '').replace(/,/g, '').trim();
                    const n = parseFloat(t);
                    return Number.isFinite(n) ? n : 0;
                  })()}
                  liveDebounceMs={0}
                  onCommit={(n) => setAddBidPresetMargin(String(roundMoney2(n)))}
                  className={cn('h-9 rounded-lg text-sm', numberInputNoSpinnerClass)}
                  title="Signed margin per bag (same as auction grid preset). Negative = loss preset. Not brokerage."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Token</Label>
                <BillingMoneyInput
                  value={Number(addBidToken) || 0}
                  min={0}
                  liveDebounceMs={0}
                  onCommit={(n) => setAddBidToken(String(roundMoney2(n)))}
                  className={cn('h-9 rounded-lg text-sm', numberInputNoSpinnerClass)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 border-t pt-4 sm:justify-end">
            <Button type="button" variant="outline" disabled={addBidSaving} onClick={() => setAddBidOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={addBidSaving}
              className={vehicleOpsPrimaryBtnClass}
              onClick={() => beginVehicleOpsAddBid(false)}
            >
              {addBidSaving ? 'Saving…' : addBidRetryAllowIncrease ? 'Save (allow lot increase)' : 'Save bid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addBidQtyDialog != null}
        onOpenChange={(o) => {
          if (!o) setAddBidQtyDialog(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quantity exceeds lot</DialogTitle>
          </DialogHeader>
          {addBidQtyDialog ? (
            <p className="text-sm text-muted-foreground">
              Sold {addBidQtyDialog.currentTotal} of {addBidQtyDialog.lotTotal} bags. Adding {addBidQtyDialog.attemptedQty}{' '}
              would exceed the lot. Allow the lot size to increase and try again?
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setAddBidQtyDialog(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAddBidQtyDialog(null);
                beginVehicleOpsAddBid(true);
              }}
            >
              Allow increase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addBidDuplicateDialog != null}
        onOpenChange={(o) => {
          if (!o) setAddBidDuplicateDialog(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Buyer mark already on this lot</DialogTitle>
          </DialogHeader>
          {addBidDuplicateDialog ? (
            <p className="text-sm text-muted-foreground">
              Mark <span className="font-semibold">{addBidDuplicateDialog.existingEntry.buyer_mark}</span> already has a
              bid. Add anyway (server may merge) or use a different mark.
            </p>
          ) : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setAddBidDuplicateDialog(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddBidDuplicateDialog(null);
                toast.info('Change buyer mark, then add the bid again.');
              }}
            >
              Different mark
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAddBidDuplicateDialog(null);
                void executeVehicleOpsAddBid(false);
              }}
            >
              Add anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Delete this bid?"
        description="Removes the bid from the auction session for this lot."
        onConfirm={handleDelete}
      />
    </div>
  );
}
