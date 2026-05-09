import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Printer, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ArrivalSellerFullDetail } from '@/services/api/arrivals';
import type { AuctionSessionDTO, LotSummaryDTO } from '@/services/api/auction';
import { auctionApi } from '@/services/api/auction';
import { cn } from '@/lib/utils';
import { roundMoney2 } from '@/utils/billingMoney';
import { formatLotLabelFromSummary, isLotFullyAuctioned, sellerBagSoldPending, sellerKeyFromArrivalSeller } from './vehicleOpsUtils';
import { LotBidsTable } from './LotBidsTable';
import {
  vehicleOpsLotHeaderBgClass,
  vehicleOpsPrimaryBtnClass,
  vehicleOpsSecondaryOutlineBtnClass,
} from './vehicleOpsUi';

/** Tailwind `md` (768px) — matches VehicleOpsSellerWorkspace split + Summary vehicle route desktop chrome. */
const MD_MIN_WIDTH = '(min-width: 768px)';

function useIsMdUp(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MD_MIN_WIDTH).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(MD_MIN_WIDTH);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return matches;
}

const bulkHeaderInputClass =
  'h-7 w-20 shrink-0 rounded-lg border border-border/50 bg-background/40 px-1.5 text-right text-xs tabular-nums shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

/** One row: lot identifier (project format) + pending count + expand only on `md+` (split layout). */
function parseBulkHeaderRateDraft(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1) return null;
  return roundMoney2(n);
}

function LotBlockHeader({
  lot,
  pendingBags,
  lotId,
  showExpandToggle,
  expanded = false,
  onToggleExpand,
  lotFullyAuctioned,
  bulkSellerRate,
  onBulkSellerRateCommit,
  hasBids = false,
  sellerFrozen = false,
}: {
  lot: LotSummaryDTO;
  pendingBags: number;
  lotId: number;
  showExpandToggle: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** True when sold_bags ≥ bag_count — header uses brand green tint; else rose (50% opacity). */
  lotFullyAuctioned: boolean;
  /** Controlled committed/display value; draft syncs when this changes. */
  bulkSellerRate?: number | '';
  onBulkSellerRateCommit?: (rate: number) => void;
  /** Bulk rate input only when session has at least one bid row. */
  hasBids?: boolean;
  sellerFrozen?: boolean;
}) {
  const bulkFocusedRef = useRef(false);
  const [bulkDraft, setBulkDraft] = useState(() =>
    bulkSellerRate === '' || bulkSellerRate === undefined ? '' : String(bulkSellerRate),
  );
  useEffect(() => {
    if (bulkFocusedRef.current) return;
    setBulkDraft(bulkSellerRate === '' || bulkSellerRate === undefined ? '' : String(bulkSellerRate));
  }, [bulkSellerRate]);

  const commitBulkDraft = useCallback(() => {
    if (!onBulkSellerRateCommit || sellerFrozen) return;
    const raw = bulkDraft.trim().replace(/,/g, '');
    if (raw === '') {
      setBulkDraft(bulkSellerRate === '' || bulkSellerRate === undefined ? '' : String(bulkSellerRate));
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) {
      setBulkDraft(bulkSellerRate === '' || bulkSellerRate === undefined ? '' : String(bulkSellerRate));
      return;
    }
    onBulkSellerRateCommit(n);
  }, [bulkDraft, bulkSellerRate, onBulkSellerRateCommit, sellerFrozen]);

  const label = formatLotLabelFromSummary(lot);
  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-stretch gap-2 rounded-xl px-2 py-2 sm:items-center sm:gap-3 md:gap-1.5 md:px-1.5 md:py-1.5 lg:gap-3 lg:px-2 lg:py-2',
        vehicleOpsLotHeaderBgClass(lotFullyAuctioned),
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3 md:gap-1.5 lg:gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="break-words text-sm font-semibold leading-tight text-foreground sm:truncate md:text-xs lg:text-sm"
            title={label}
          >
            {label}
          </p>
        </div>
        {sellerFrozen ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Frozen
          </span>
        ) : onBulkSellerRateCommit && hasBids ? (
          <Input
            type="text"
            inputMode="decimal"
            value={bulkDraft}
            onChange={(ev) => {
              const next = ev.target.value;
              setBulkDraft(next);
              const parsed = parseBulkHeaderRateDraft(next);
              if (parsed != null) onBulkSellerRateCommit(parsed);
            }}
            onFocus={() => {
              bulkFocusedRef.current = true;
              setBulkDraft('');
            }}
            onBlur={() => {
              bulkFocusedRef.current = false;
              commitBulkDraft();
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                commitBulkDraft();
              }
            }}
            placeholder="Rate"
            title="Live-updates all buyer new seller rates while typing (≥1). Blur or Enter finalizes."
            aria-label="Bulk apply new seller rate for all buyers in this lot"
            className={cn(bulkHeaderInputClass, 'placeholder:text-muted-foreground/70')}
          />
        ) : null}
        <div
          className="shrink-0 text-right"
          title={`${pendingBags} pending for auction`}
          aria-label={`${pendingBags} pending bags for auction`}
        >
          <p className="text-base font-bold tabular-nums text-foreground sm:text-sm md:text-xs lg:text-base">
            {pendingBags}
          </p>
        </div>
        {showExpandToggle && onToggleExpand ? (
          <button
            type="button"
            className={cn(
              'ml-auto inline-flex shrink-0 rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6075FF] md:p-1 lg:p-1.5',
              vehicleOpsSecondaryOutlineBtnClass,
            )}
            aria-expanded={expanded}
            aria-controls={`lot-panel-${lotId}`}
            id={`lot-trigger-${lotId}`}
            aria-label={expanded ? `Collapse lot` : `Expand lot`}
            onClick={onToggleExpand}
          >
            {expanded ? (
              <ChevronUp className="h-5 w-5 md:h-4 md:w-4 lg:h-5 lg:w-5" aria-hidden />
            ) : (
              <ChevronDown className="h-5 w-5 md:h-4 md:w-4 lg:h-5 lg:w-5" aria-hidden />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type SellerDetailPanelProps = {
  seller: ArrivalSellerFullDetail | null;
  /** Lots for this seller on the current vehicle (pre-filtered). */
  sellerLots: LotSummaryDTO[];
  onPrint: () => void;
  /** Refetch vehicle-ops summary after auction writes (lots, RD, billing slice). */
  onAuctionDataInvalidate?: () => void | Promise<void>;
};

type LotSessionState = {
  session: AuctionSessionDTO | null;
  loading: boolean;
  error: string | null;
};

export function SellerDetailPanel({
  seller,
  sellerLots,
  onPrint,
  onAuctionDataInvalidate,
}: SellerDetailPanelProps) {
  const isMdUp = useIsMdUp();
  const isMdUpRef = useRef(isMdUp);
  const [expandedLotId, setExpandedLotId] = useState<number | null>(null);
  const [sessionByLotId, setSessionByLotId] = useState<Record<number, LotSessionState>>({});
  /** Lot header bulk seller rate (display); draft in header syncs from this after commit. */
  const [bulkSellerRateInputByLotId, setBulkSellerRateInputByLotId] = useState<Record<number, number | ''>>({});
  /** Incrementing seq per lot so LotBidsTable reapplies when same rate committed again. */
  const [bulkApplyByLotId, setBulkApplyByLotId] = useState<Record<number, { rate: number; seq: number }>>({});
  /** Lot snap carousel + dots below `md` only (768px; see VehicleOpsSellerWorkspace). */
  const mobileLotsCarouselRef = useRef<HTMLDivElement | null>(null);
  const [activeLotSlide, setActiveLotSlide] = useState(0);

  const sortedLots = useMemo(
    () => [...sellerLots].sort((a, b) => (a.lot_id ?? 0) - (b.lot_id ?? 0)),
    [sellerLots],
  );

  const handleLotsCarouselScroll = useCallback(() => {
    const el = mobileLotsCarouselRef.current;
    const n = sortedLots.length;
    if (!el || n <= 0) return;
    const step = el.scrollWidth / n;
    if (step <= 0) return;
    const idx = Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / step)));
    setActiveLotSlide(idx);
  }, [sortedLots]);

  const sellerKey = seller ? sellerKeyFromArrivalSeller(seller) : '';
  const firstLotId = sortedLots[0]?.lot_id ?? null;

  useEffect(() => {
    // Default UX: first lot expanded so bids are visible without an extra tap.
    setExpandedLotId(firstLotId);
    setSessionByLotId({});
    setBulkSellerRateInputByLotId({});
    setBulkApplyByLotId({});
  }, [sellerKey, firstLotId]);

  useEffect(() => {
    setActiveLotSlide(0);
    mobileLotsCarouselRef.current?.scrollTo({ left: 0 });
  }, [sellerKey]);

  /** Leaving split layout: align snap position with whichever lot was expanded. */
  useEffect(() => {
    const prev = isMdUpRef.current;
    isMdUpRef.current = isMdUp;
    if (prev !== true || isMdUp !== false) return;
    const n = sortedLots.length;
    if (n <= 0) return;
    const idx = sortedLots.findIndex((l) => l.lot_id === expandedLotId);
    if (idx < 0) return;
    setActiveLotSlide(idx);
    requestAnimationFrame(() => {
      const el = mobileLotsCarouselRef.current;
      if (!el || n <= 0) return;
      el.scrollTo({ left: (el.scrollWidth / n) * idx });
    });
  }, [isMdUp, expandedLotId, sortedLots]);

  /** `md+`: follow expanded (accordion). `< md`: follow carousel — one source of truth avoids session/scroll desync. */
  const visibleLotId = !isMdUp ? (sortedLots[activeLotSlide]?.lot_id ?? null) : null;
  const lotIdForSession: number | null = isMdUp ? expandedLotId : visibleLotId;
  const mobilePanelSt =
    !isMdUp && visibleLotId != null ? sessionByLotId[visibleLotId] : undefined;

  useEffect(() => {
    if (lotIdForSession == null) return;
    const lotId = lotIdForSession;
    let cancelled = false;

    setSessionByLotId((m) => {
      const cur = m[lotId];
      if (cur?.session && !cur.error) return m;
      if (cur?.loading) return m;
      return { ...m, [lotId]: { session: cur?.session ?? null, loading: true, error: null } };
    });

    void (async () => {
      try {
        const session = await auctionApi.getOrStartSession(lotId);
        if (cancelled) return;
        setSessionByLotId((m) => ({ ...m, [lotId]: { session, loading: false, error: null } }));
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load session';
        setSessionByLotId((m) => ({ ...m, [lotId]: { session: null, loading: false, error: msg } }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lotIdForSession]);

  const toggleLot = useCallback((lotId: number) => {
    setExpandedLotId((cur) => (cur === lotId ? null : lotId));
  }, []);

  const onSessionUpdated = useCallback((lotId: number, s: AuctionSessionDTO) => {
    setSessionByLotId((m) => ({ ...m, [lotId]: { session: s, loading: false, error: null } }));
  }, []);

  const soldPending = useMemo(() => sellerBagSoldPending(sellerLots), [sellerLots]);

  if (!seller) {
    return (
      <div className="glass-card flex min-h-[12rem] items-center justify-center rounded-2xl border border-border/40 p-8 text-sm text-muted-foreground">
        Select a seller to view lots and bids.
      </div>
    );
  }

  const name = (seller.sellerName ?? '').trim() || '—';
  const mark = (seller.sellerMark ?? '').trim() || '—';
  const serial = seller.sellerSerialNumber != null ? String(seller.sellerSerialNumber) : '—';

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3 md:gap-2 lg:gap-3">
      <div className="glass-card flex flex-wrap items-center gap-3 rounded-2xl border border-border/40 p-4 shadow-sm md:gap-2 md:p-3 lg:gap-3 lg:p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 text-violet-600 dark:text-violet-300 md:h-9 md:w-9 lg:h-11 lg:w-11">
          <UserRound className="h-5 w-5 md:h-4 md:w-4 lg:h-5 lg:w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground md:text-[10px] lg:text-xs">
            Seller serial <span className="font-semibold tabular-nums text-foreground">{serial}</span>
          </p>
          <p className="truncate text-base font-bold text-foreground md:text-sm lg:text-base">
            {name} / {mark}
          </p>
          <p className="text-xs font-semibold tabular-nums text-foreground md:text-[11px] lg:text-xs">
            {soldPending.sold} / {soldPending.pending}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="default"
          className={cn(vehicleOpsPrimaryBtnClass, 'shrink-0 rounded-xl')}
          onClick={onPrint}
        >
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <div className="flex min-h-0 flex-col gap-2 md:gap-1.5 lg:gap-2">
        {sortedLots.length === 0 ? (
          <div className="glass-card rounded-2xl border border-border/40 p-6 text-center text-sm text-muted-foreground">
            No auction lots matched this seller for this vehicle.
          </div>
        ) : (
          <>
            {sortedLots.length > 1 && (
              <div
                className="flex items-center justify-center gap-1.5 md:hidden"
                role="tablist"
                aria-label="Lots for this seller"
              >
                {sortedLots.map((lot, li) => (
                  <button
                    key={`vehicle-ops-lot-dot-${lot.lot_id}`}
                    type="button"
                    role="tab"
                    aria-selected={activeLotSlide === li}
                    aria-label={`Go to lot ${li + 1}`}
                    onClick={() => {
                      const el = mobileLotsCarouselRef.current;
                      if (!el) return;
                      const left = (el.scrollWidth / sortedLots.length) * li;
                      el.scrollTo({ left, behavior: 'smooth' });
                    }}
                    className={cn(
                      'rounded-full transition-all bg-muted-foreground/40',
                      activeLotSlide === li ? 'h-2 w-4 bg-primary' : 'h-2 w-2',
                    )}
                  />
                ))}
              </div>
            )}
            {isMdUp ? (
              <div className="min-h-0 space-y-2 md:space-y-1.5 lg:space-y-2">
                {sortedLots.map((lot) => {
                  const lid = lot.lot_id;
                  const panelOpen = expandedLotId === lid;
                  const st = sessionByLotId[lid];
                  const hasBids = (st?.session?.entries?.length ?? 0) > 0;
                  const sessionLoading = panelOpen && (st?.loading ?? st == null);
                  const pendingBags =
                    st?.session != null
                      ? st.session.remaining_bags
                      : Math.max(0, (lot.bag_count ?? 0) - (lot.sold_bags ?? 0));
                  return (
                    <div
                      key={lid}
                      className="glass-card overflow-hidden rounded-2xl border border-border/40 shadow-sm"
                    >
                      <div className="px-3 py-3 md:px-2 md:py-2 lg:px-3 lg:py-3">
                        <LotBlockHeader
                          lot={lot}
                          lotId={lid}
                          pendingBags={pendingBags}
                          showExpandToggle
                          expanded={panelOpen}
                          onToggleExpand={() => toggleLot(lid)}
                          lotFullyAuctioned={isLotFullyAuctioned(lot)}
                          bulkSellerRate={bulkSellerRateInputByLotId[lid] ?? ''}
                          onBulkSellerRateCommit={(rate) => {
                            const r = roundMoney2(rate);
                            if (!Number.isFinite(r) || r < 1) return;
                            setBulkSellerRateInputByLotId((p) => ({ ...p, [lid]: r }));
                            setBulkApplyByLotId((p) => ({
                              ...p,
                              [lid]: { rate: r, seq: (p[lid]?.seq ?? 0) + 1 },
                            }));
                          }}
                          hasBids={hasBids}
                          sellerFrozen={lot.seller_frozen === true}
                        />
                      </div>
                      <div
                        id={`lot-panel-${lid}`}
                        role="region"
                        aria-labelledby={`lot-trigger-${lid}`}
                        className={cn(
                          'border-t border-border/30 px-3 py-3 md:px-2 md:py-2 lg:px-3 lg:py-3',
                          !panelOpen && 'hidden',
                        )}
                      >
                        <LotBidsTable
                          lotId={lid}
                          lotSummary={lot}
                          session={st?.session ?? null}
                          loading={sessionLoading}
                          error={st?.error ?? null}
                          onSessionUpdated={(s) => onSessionUpdated(lid, s)}
                          onAuctionDataInvalidate={onAuctionDataInvalidate}
                          applyBulkSellerRate={bulkApplyByLotId[lid]?.rate ?? null}
                          applyBulkSellerRateSeq={bulkApplyByLotId[lid]?.seq ?? 0}
                          readOnly={lot.seller_frozen === true}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-0 flex-col gap-2">
                <div
                  ref={mobileLotsCarouselRef}
                  onScroll={handleLotsCarouselScroll}
                  className="flex min-h-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] touch-[pan-x_pan-y] md:touch-auto no-scrollbar snap-x snap-mandatory"
                >
                  {sortedLots.map((lot) => {
                    const lid = lot.lot_id;
                    const st = sessionByLotId[lid];
                    const hasBids = (st?.session?.entries?.length ?? 0) > 0;
                    const pendingBags =
                      st?.session != null
                        ? st.session.remaining_bags
                        : Math.max(0, (lot.bag_count ?? 0) - (lot.sold_bags ?? 0));
                    return (
                      <div
                        key={lid}
                        className="glass-card w-[calc(100%-0.1rem)] shrink-0 snap-start overflow-hidden rounded-2xl border border-border/40 shadow-sm"
                      >
                        <div className="px-3 py-3">
                        <LotBlockHeader
                          lot={lot}
                          lotId={lid}
                          pendingBags={pendingBags}
                          showExpandToggle={false}
                          lotFullyAuctioned={isLotFullyAuctioned(lot)}
                          bulkSellerRate={bulkSellerRateInputByLotId[lid] ?? ''}
                          onBulkSellerRateCommit={(rate) => {
                            const r = roundMoney2(rate);
                            if (!Number.isFinite(r) || r < 1) return;
                            setBulkSellerRateInputByLotId((p) => ({ ...p, [lid]: r }));
                            setBulkApplyByLotId((p) => ({
                              ...p,
                              [lid]: { rate: r, seq: (p[lid]?.seq ?? 0) + 1 },
                            }));
                          }}
                          hasBids={hasBids}
                          sellerFrozen={lot.seller_frozen === true}
                        />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {visibleLotId != null && (
                  <div
                    className="glass-card rounded-2xl border border-border/40 px-3 py-3 shadow-sm"
                    role="region"
                    aria-label={`Lot ${visibleLotId} bids and auction session`}
                  >
                    <LotBidsTable
                      lotId={visibleLotId}
                      lotSummary={sortedLots.find((l) => l.lot_id === visibleLotId) ?? null}
                      session={mobilePanelSt?.session ?? null}
                      loading={mobilePanelSt?.loading ?? mobilePanelSt == null}
                      error={mobilePanelSt?.error ?? null}
                      onSessionUpdated={(s) => onSessionUpdated(visibleLotId, s)}
                      onAuctionDataInvalidate={onAuctionDataInvalidate}
                      applyBulkSellerRate={bulkApplyByLotId[visibleLotId]?.rate ?? null}
                      applyBulkSellerRateSeq={bulkApplyByLotId[visibleLotId]?.seq ?? 0}
                      readOnly={(sortedLots.find((l) => l.lot_id === visibleLotId)?.seller_frozen ?? false) === true}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
