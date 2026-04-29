import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Printer, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ArrivalSellerFullDetail } from '@/services/api/arrivals';
import type { AuctionSessionDTO, LotSummaryDTO } from '@/services/api/auction';
import { auctionApi } from '@/services/api/auction';
import { cn } from '@/lib/utils';
import { formatLotLabelFromSummary, sellerBagSoldPending, sellerKeyFromArrivalSeller } from './vehicleOpsUtils';
import { LotBidsTable } from './LotBidsTable';
import {
  vehicleOpsPrimaryBtnClass,
  vehicleOpsSaveStripClass,
  vehicleOpsSecondaryOutlineBtnClass,
} from './vehicleOpsUi';

const LG_MIN_WIDTH = '(min-width: 1024px)';

function useIsLgUp(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(LG_MIN_WIDTH).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(LG_MIN_WIDTH);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return matches;
}

/** One row: lot identifier (project format) + pending count + expand only on `lg+` (desktop). */
function LotBlockHeader({
  lot,
  pendingBags,
  lotId,
  showExpandToggle,
  expanded = false,
  onToggleExpand,
  hasUnsavedRates,
}: {
  lot: LotSummaryDTO;
  pendingBags: number;
  lotId: number;
  showExpandToggle: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Matches seller list strip / bids table bar (rose until Save syncs rates). */
  hasUnsavedRates: boolean;
}) {
  const label = formatLotLabelFromSummary(lot);
  return (
    <div className="flex w-full min-w-0 items-stretch gap-2 sm:items-center sm:gap-3">
      <span
        className={cn('w-1.5 shrink-0 self-stretch rounded-full sm:self-center sm:min-h-[2.5rem]', vehicleOpsSaveStripClass(hasUnsavedRates))}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-tight text-foreground sm:truncate" title={label}>
            {label}
          </p>
        </div>
        <div
          className="shrink-0 text-right"
          title={`${pendingBags} pending for auction`}
          aria-label={`${pendingBags} pending bags for auction`}
        >
          <p className="text-base font-bold tabular-nums text-foreground sm:text-sm">{pendingBags}</p>
        </div>
        {showExpandToggle && onToggleExpand ? (
          <button
            type="button"
            className={cn(
              'ml-auto inline-flex shrink-0 rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6075FF]',
              vehicleOpsSecondaryOutlineBtnClass,
            )}
            aria-expanded={expanded}
            aria-controls={`lot-panel-${lotId}`}
            id={`lot-trigger-${lotId}`}
            aria-label={expanded ? `Collapse lot` : `Expand lot`}
            onClick={onToggleExpand}
          >
            {expanded ? <ChevronUp className="h-5 w-5" aria-hidden /> : <ChevronDown className="h-5 w-5" aria-hidden />}
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
  /** Lot id → unsaved “new seller rate” edits (lifted for seller list strips). */
  unsavedRatesByLotId?: Record<number, boolean>;
  onLotUnsavedRatesChange?: (lotId: number, unsaved: boolean) => void;
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
  unsavedRatesByLotId = {},
  onLotUnsavedRatesChange,
}: SellerDetailPanelProps) {
  const isLgUp = useIsLgUp();
  const isLgUpRef = useRef(isLgUp);
  const [expandedLotId, setExpandedLotId] = useState<number | null>(null);
  const [sessionByLotId, setSessionByLotId] = useState<Record<number, LotSessionState>>({});
  /** Lot snap carousel + dots below lg only (see VehicleOpsSellerWorkspace / useDesktopMode 1024px). */
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
  }, [sellerKey, firstLotId]);

  useEffect(() => {
    setActiveLotSlide(0);
    mobileLotsCarouselRef.current?.scrollTo({ left: 0 });
  }, [sellerKey]);

  /** Leaving desktop: align snap position with whichever lot was expanded. */
  useEffect(() => {
    const prev = isLgUpRef.current;
    isLgUpRef.current = isLgUp;
    if (prev !== true || isLgUp !== false) return;
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
  }, [isLgUp, expandedLotId, sortedLots]);

  /** `lg+`: follow expanded (accordion). `< lg`: follow carousel — one source of truth avoids session/scroll desync. */
  const visibleLotId = !isLgUp ? (sortedLots[activeLotSlide]?.lot_id ?? null) : null;
  const lotIdForSession: number | null = isLgUp ? expandedLotId : visibleLotId;
  const mobilePanelSt =
    !isLgUp && visibleLotId != null ? sessionByLotId[visibleLotId] : undefined;

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
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <div className="glass-card flex flex-wrap items-center gap-3 rounded-2xl border border-border/40 p-4 shadow-sm">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 text-violet-600 dark:text-violet-300">
          <UserRound className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Seller serial <span className="font-semibold tabular-nums text-foreground">{serial}</span>
          </p>
          <p className="truncate text-base font-bold text-foreground">
            {name} / {mark}
          </p>
          <p className="text-xs font-semibold tabular-nums text-foreground">
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

      <div className="flex min-h-0 flex-col gap-2">
        {sortedLots.length === 0 ? (
          <div className="glass-card rounded-2xl border border-border/40 p-6 text-center text-sm text-muted-foreground">
            No auction lots matched this seller for this vehicle.
          </div>
        ) : (
          <>
            {sortedLots.length > 1 && (
              <div
                className="lg:hidden flex items-center justify-center gap-1.5"
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
            {isLgUp ? (
              <div className="min-h-0 space-y-2">
                {sortedLots.map((lot) => {
                  const lid = lot.lot_id;
                  const panelOpen = expandedLotId === lid;
                  const st = sessionByLotId[lid];
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
                      <div className="px-3 py-3">
                        <LotBlockHeader
                          lot={lot}
                          lotId={lid}
                          pendingBags={pendingBags}
                          showExpandToggle
                          expanded={panelOpen}
                          onToggleExpand={() => toggleLot(lid)}
                          hasUnsavedRates={Boolean(unsavedRatesByLotId[lid])}
                        />
                      </div>
                      <div
                        id={`lot-panel-${lid}`}
                        role="region"
                        aria-labelledby={`lot-trigger-${lid}`}
                        className={cn('border-t border-border/30 px-3 py-3', !panelOpen && 'hidden')}
                      >
                        <LotBidsTable
                          lotId={lid}
                          lotSummary={lot}
                          session={st?.session ?? null}
                          loading={sessionLoading}
                          error={st?.error ?? null}
                          onSessionUpdated={(s) => onSessionUpdated(lid, s)}
                          onAuctionDataInvalidate={onAuctionDataInvalidate}
                          onUnsavedRatesChange={(u) => onLotUnsavedRatesChange?.(lid, u)}
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
                  className="flex min-h-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] touch-[pan-x_pan-y] lg:touch-auto no-scrollbar snap-x snap-mandatory"
                >
                  {sortedLots.map((lot) => {
                    const lid = lot.lot_id;
                    const st = sessionByLotId[lid];
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
                            hasUnsavedRates={Boolean(unsavedRatesByLotId[lid])}
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
                      onUnsavedRatesChange={(u) => onLotUnsavedRatesChange?.(visibleLotId, u)}
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
