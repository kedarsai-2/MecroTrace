import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ClipboardList,
  LayoutGrid,
  List,
  Truck,
  Users,
  Package,
  Scale,
  Search,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { arrivalsApi, auctionApi, billingApi } from '@/services/api';
import type { LotSummaryDTO } from '@/services/api/auction';
import type { SalesBillDTO } from '@/services/api/billing';
import type { ArrivalSummary, ArrivalDetail } from '@/services/api/arrivals';
import { getArrivalStatus } from '@/components/arrivals/ArrivalStatusBadge';
import SummaryVehicleOperationsView from '@/components/summary/SummaryVehicleOperationsView';
import SummaryArrivalPipelineCard from '@/components/summary/SummaryArrivalPipelineCard';
import SummaryArrivalsTable from '@/components/summary/SummaryArrivalsTable';
import {
  aggregateAuctionBagsByVehicleId,
  aggregateBillingBagsByVehicle,
  buildLotIdToVehicleId,
} from '@/components/summary/summaryArrivalPipelineMetrics';
import { toast } from 'sonner';

const SUMMARY_MODULE = 'SummaryPage' as const;
const SUMMARY_LAYOUT_STORAGE_KEY = 'merco.summary.layout';
const BILLS_PAGE_SIZE = 100;
const SUMMARY_ARRIVALS_PAGE_SIZE = 90;
const SUMMARY_LOTS_PAGE_SIZE = 100;
const ARRIVAL_LIST_SORT = 'arrivalDatetime,desc';
const MAX_BILL_PAGES_SAFETY = 500;

function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  );
}

function sortArrivalSummaries(a: ArrivalSummary, b: ArrivalSummary): number {
  const ta = new Date(a.arrivalDatetime).getTime();
  const tb = new Date(b.arrivalDatetime).getTime();
  if (tb !== ta) return tb - ta;
  return Number(b.vehicleId) - Number(a.vehicleId);
}

function sortArrivalDetails(a: ArrivalDetail, b: ArrivalDetail): number {
  const ta = new Date(a.arrivalDatetime).getTime();
  const tb = new Date(b.arrivalDatetime).getTime();
  if (tb !== ta) return tb - ta;
  return b.vehicleId - a.vehicleId;
}

const SummaryPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule } = usePermissions();
  const canView = canAccessModule(SUMMARY_MODULE);
  const vehicleRouteMatch = useMatch({ path: '/summary-page/vehicle/:vehicleId', end: true });
  const vehicleIdFromUrl = vehicleRouteMatch?.params.vehicleId ?? null;
  const [apiArrivals, setApiArrivals] = useState<ArrivalSummary[]>([]);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [salesBills, setSalesBills] = useState<SalesBillDTO[]>([]);
  const [lotSummaries, setLotSummaries] = useState<LotSummaryDTO[]>([]);
  const [summaryLayout, setSummaryLayout] = useState<'grid' | 'list'>(() => {
    try {
      const v = localStorage.getItem(SUMMARY_LAYOUT_STORAGE_KEY);
      return v === 'grid' || v === 'list' ? v : 'grid';
    } catch {
      return 'grid';
    }
  });
  const loadDataAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SUMMARY_LAYOUT_STORAGE_KEY, summaryLayout);
    } catch {
      /* ignore */
    }
  }, [summaryLayout]);

  const loadData = useCallback(async () => {
    loadDataAbortRef.current?.abort();
    const ac = new AbortController();
    loadDataAbortRef.current = ac;
    const { signal } = ac;

    setLoading(true);
    setApiArrivals([]);
    setArrivalDetails([]);
    setLotSummaries([]);
    setSalesBills([]);

    const mergeArrivals = async () => {
      const merged = new Map<string, ArrivalSummary>();
      let page = 0;
      let reportedTotal = 0;
      for (;;) {
        const { items, totalElements } = await arrivalsApi.listPage(
          {
            page,
            size: SUMMARY_ARRIVALS_PAGE_SIZE,
            sort: ARRIVAL_LIST_SORT,
            partiallyCompleted: false,
          },
          { signal },
        );
        if (signal.aborted) return;
        if (page === 0) reportedTotal = totalElements;
        for (const it of items) merged.set(String(it.vehicleId), it);
        setApiArrivals([...merged.values()].sort(sortArrivalSummaries));
        const noMore =
          items.length === 0 ||
          items.length < SUMMARY_ARRIVALS_PAGE_SIZE ||
          merged.size >= reportedTotal;
        if (noMore) break;
        page += 1;
      }
    };

    const mergeDetails = async () => {
      const merged = new Map<string, ArrivalDetail>();
      let page = 0;
      let reportedTotal = 0;
      for (;;) {
        const { items, totalElements } = await arrivalsApi.listDetailPage(
          { page, size: SUMMARY_ARRIVALS_PAGE_SIZE, sort: ARRIVAL_LIST_SORT },
          { signal },
        );
        if (signal.aborted) return;
        if (page === 0) reportedTotal = totalElements;
        for (const it of items) merged.set(String(it.vehicleId), it);
        setArrivalDetails([...merged.values()].sort(sortArrivalDetails));
        const noMore =
          items.length === 0 ||
          items.length < SUMMARY_ARRIVALS_PAGE_SIZE ||
          merged.size >= reportedTotal;
        if (noMore) break;
        page += 1;
      }
    };

    const mergeLots = async () => {
      const merged = new Map<number, LotSummaryDTO>();
      let page = 0;
      let reportedTotal = 0;
      for (;;) {
        const { items, totalElements } = await auctionApi.listLotsPage(
          { page, size: SUMMARY_LOTS_PAGE_SIZE, sort: 'id,asc' },
          { signal },
        );
        if (signal.aborted) return;
        if (page === 0) reportedTotal = totalElements;
        for (const it of items) merged.set(it.lot_id, it);
        setLotSummaries([...merged.values()]);
        const noMore =
          items.length === 0 ||
          items.length < SUMMARY_LOTS_PAGE_SIZE ||
          merged.size >= reportedTotal;
        if (noMore) break;
        page += 1;
      }
    };

    try {
      await Promise.all([mergeArrivals(), mergeDetails(), mergeLots()]);
      if (signal.aborted) return;
      setLoading(false);

      let bills: SalesBillDTO[] = [];
      try {
        let totalElements = Infinity;
        for (let p = 0; p < MAX_BILL_PAGES_SAFETY; p += 1) {
          const page = await billingApi.getPage({
            page: p,
            size: BILLS_PAGE_SIZE,
            sort: 'billDate,desc',
            signal,
          });
          if (signal.aborted) return;
          const content = page.content ?? [];
          totalElements = page.totalElements ?? totalElements;
          bills.push(...content);
          if (content.length < BILLS_PAGE_SIZE || bills.length >= totalElements) break;
        }
      } catch (err) {
        if (isAbortError(err)) return;
        bills = [];
      }
      if (!signal.aborted) setSalesBills(bills);
    } catch (err) {
      if (isAbortError(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to load data';
      toast.error(message);
      setApiArrivals([]);
      setArrivalDetails([]);
      setSalesBills([]);
      setLotSummaries([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    void loadData();
  }, [canView, loadData]);

  useEffect(() => {
    return () => loadDataAbortRef.current?.abort();
  }, []);

  /** Same rule as Arrivals + backend `arrivalStatusFromDto`: AUCTIONED when there is a bid and not all lots are weighed yet. */
  const auctionedArrivals = useMemo(
    () => apiArrivals.filter((a) => getArrivalStatus(a) === 'AUCTIONED'),
    [apiArrivals],
  );

  const filteredArrivals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return auctionedArrivals;
    return auctionedArrivals.filter((a) => {
      if (String(a.vehicleNumber).toLowerCase().includes(q)) return true;
      if (String(a.vehicleMarkAlias ?? '').toLowerCase().includes(q)) return true;
      const detail = arrivalDetails.find((d) => String(d.vehicleId) === String(a.vehicleId));
      if (detail?.sellers?.some((s) => (s.sellerName ?? '').toLowerCase().includes(q))) return true;
      if (String(a.godown ?? '').toLowerCase().includes(q)) return true;
      if (String(a.origin ?? '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [auctionedArrivals, arrivalDetails, searchQuery]);

  const lotIdToVehicleId = useMemo(() => buildLotIdToVehicleId(arrivalDetails), [arrivalDetails]);
  const billingByVehicle = useMemo(
    () => aggregateBillingBagsByVehicle(salesBills, lotIdToVehicleId),
    [salesBills, lotIdToVehicleId],
  );

  const auctionBagsByVehicle = useMemo(
    () => aggregateAuctionBagsByVehicleId(lotSummaries, auctionedArrivals),
    [lotSummaries, auctionedArrivals],
  );

  const totalVehicles = auctionedArrivals.length;
  const totalSellers = useMemo(
    () => auctionedArrivals.reduce((acc, a) => acc + (a.sellerCount ?? 0), 0),
    [auctionedArrivals],
  );
  const totalLots = useMemo(
    () => auctionedArrivals.reduce((acc, a) => acc + (a.lotCount ?? 0), 0),
    [auctionedArrivals],
  );
  const totalNetWeightKg = useMemo(
    () => auctionedArrivals.reduce((acc, a) => acc + (a.netWeight ?? 0), 0),
    [auctionedArrivals],
  );
  const totalNetWeightTons = totalNetWeightKg > 0 ? totalNetWeightKg / 1000 : 0;

  const totalLotsSubtitle = useMemo(
    () => auctionedArrivals.reduce((s, a) => s + (a.lotCount ?? 0), 0),
    [auctionedArrivals],
  );

  const selectedFromUrl = useMemo(
    () =>
      vehicleIdFromUrl == null
        ? null
        : auctionedArrivals.find((a) => String(a.vehicleId) === String(vehicleIdFromUrl)) ?? null,
    [vehicleIdFromUrl, auctionedArrivals],
  );

  useEffect(() => {
    if (!canView || loading) return;
    if (vehicleIdFromUrl && !selectedFromUrl) {
      toast.error('This vehicle is not in the current post-auction summary');
      navigate('/summary-page', { replace: true });
    }
  }, [canView, loading, vehicleIdFromUrl, selectedFromUrl, navigate]);

  const showList = !vehicleIdFromUrl;
  const showFullVehicleOps = Boolean(vehicleIdFromUrl && selectedFromUrl);

  const onSelectArrival = useCallback(
    (a: ArrivalSummary) => {
      navigate(`/summary-page/vehicle/${a.vehicleId}`);
    },
    [navigate],
  );

  const onBackFromOps = useCallback(() => {
    navigate('/summary-page');
  }, [navigate]);

  if (!canView) {
    return <ForbiddenPage moduleName={SUMMARY_MODULE} />;
  }

  const summaryViewToggle = (
    <div
      className="inline-flex shrink-0 rounded-xl border border-border/40 bg-muted/40 p-0.5 dark:bg-muted/20"
      role="group"
      aria-label="Summary view"
    >
      <button
        type="button"
        title="Table view"
        aria-pressed={summaryLayout === 'list'}
        onClick={() => setSummaryLayout('list')}
        className={cn(
          'rounded-lg p-2 transition-colors touch-manipulation',
          summaryLayout === 'list'
            ? 'bg-white text-[#6075FF] shadow-sm dark:bg-card'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        title="Card view"
        aria-pressed={summaryLayout === 'grid'}
        onClick={() => setSummaryLayout('grid')}
        className={cn(
          'rounded-lg p-2 transition-colors touch-manipulation',
          summaryLayout === 'grid'
            ? 'bg-white text-[#6075FF] shadow-sm dark:bg-card'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      {/* Mobile hero — same structure as Arrivals (gradient header, two tabs, stats line). */}
      {!isDesktop && showList && (
        <div className="relative mb-4 overflow-hidden rounded-b-3xl bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 px-4 pb-6 pt-[max(2rem,env(safe-area-inset-top))]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(123,97,255,0.2)_0%,transparent_40%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur touch-manipulation"
                aria-label="Back to home"
              >
                <ArrowLeft className="h-5 w-5 text-white" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-white">Summary</h1>
                <p className="text-xs text-white/80">
                  {loading ? '…' : `${totalLotsSubtitle} lots`} · Post-auction arrivals (auctioned, not fully weighed)
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur text-white">
              <ClipboardList className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {isDesktop && showList && (
        <div className="max-w-[100vw] overflow-x-hidden px-4 pb-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <ClipboardList className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              Summary
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading ? '…' : `${auctionedArrivals.reduce((s, a) => s + (a.sellerCount ?? 0), 0)} sellers`} · Post-auction
              pipeline (same status as &quot;Auctioned&quot; on Arrivals)
            </p>
          </div>

          {loading ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <p className="text-muted-foreground">Loading…</p>
            </div>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-4 shadow-sm dark:bg-card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6075FF] shadow-sm shadow-[#6075FF]/20">
                    <Truck className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-tight text-foreground">{totalVehicles}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Auctioned vehicles</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-4 shadow-sm dark:bg-card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6075FF] shadow-sm shadow-[#6075FF]/20">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-tight text-foreground">{totalSellers}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total sellers</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-4 shadow-sm dark:bg-card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6075FF] shadow-sm shadow-[#6075FF]/20">
                    <Package className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-tight text-foreground">{totalLots}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total lots</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-4 shadow-sm dark:bg-card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6075FF] shadow-sm shadow-[#6075FF]/20">
                    <Scale className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-tight text-foreground">{totalNetWeightTons.toFixed(1)}t</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total weight</p>
                  </div>
                </div>
              </div>

              <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                <div className="relative w-full min-w-0 sm:max-w-sm md:max-w-md">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="Search seller, vehicle, origin..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 w-full min-w-0 rounded-xl border border-border/40 bg-white pl-9 pr-4 text-xs shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF] dark:bg-card"
                  />
                </div>
                {summaryViewToggle}
              </div>

              {filteredArrivals.length === 0 ? (
                auctionedArrivals.length === 0 ? (
                  <div className="glass-card rounded-2xl p-12 text-center">
                    <div className="relative mx-auto mb-4 h-16 w-16">
                      <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl" />
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-blue-500 shadow-lg">
                        <ClipboardList className="h-7 w-7 text-white" />
                      </div>
                    </div>
                    <h3 className="mb-1 text-lg font-bold text-foreground">No auctioned arrivals</h3>
                    <p className="text-sm text-muted-foreground">
                      Nothing is in the &quot;Auctioned&quot; stage right now (needs bids on lots, and not all lots weighed
                      yet).
                    </p>
                  </div>
                ) : (
                  <div className="glass-card rounded-2xl p-12 text-center">
                    <Filter className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mb-1 text-lg font-bold text-foreground">No matches</h3>
                    <p className="mb-4 text-sm text-muted-foreground">Try a different search.</p>
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => setSearchQuery('')}>
                      Clear search
                    </Button>
                  </div>
                )
              ) : summaryLayout === 'list' ? (
                <SummaryArrivalsTable arrivals={filteredArrivals} onSelectArrival={onSelectArrival} />
              ) : (
                <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {filteredArrivals.map((a, i) => (
                    <SummaryArrivalPipelineCard
                      key={`${a.vehicleId}-${i}`}
                      arrival={a}
                      billing={billingByVehicle.get(String(a.vehicleId))}
                      auction={auctionBagsByVehicle.get(String(a.vehicleId))}
                      index={i}
                      onOpenVehicle={onSelectArrival}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!isDesktop && showList && (
        <>
          {!loading && auctionedArrivals.length > 0 && (
            <div className="mb-4 px-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-3 shadow-sm dark:bg-card">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6075FF] shadow-sm shadow-[#6075FF]/20">
                    <Truck className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-tight text-foreground">{totalVehicles}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Vehicles</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-3 shadow-sm dark:bg-card">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6075FF] shadow-sm shadow-[#6075FF]/20">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-tight text-foreground">{totalSellers}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Sellers</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-3 shadow-sm dark:bg-card">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6075FF] shadow-sm shadow-[#6075FF]/20">
                    <Package className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-tight text-foreground">{totalLots}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Lots</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-3 shadow-sm dark:bg-card">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6075FF] shadow-sm shadow-[#6075FF]/20">
                    <Scale className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-tight text-foreground">{totalNetWeightTons.toFixed(1)}t</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Weight</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-4 px-4">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search seller, vehicle, origin..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border/40 bg-white pl-10 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF] dark:bg-card"
                />
              </div>
              {summaryViewToggle}
            </div>
          </div>

          <div className={cn('px-4', summaryLayout === 'list' ? 'space-y-2.5 md:space-y-1.5 md:px-6' : 'space-y-4')}>
            {loading ? (
              <div className="glass-card rounded-2xl p-8 text-center">
                <p className="text-muted-foreground">Loading…</p>
              </div>
            ) : filteredArrivals.length === 0 ? (
              auctionedArrivals.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card rounded-2xl p-8 text-center"
                >
                  <div className="relative mx-auto mb-4 h-16 w-16">
                    <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-blue-500 shadow-lg shadow-[#6075FF]/20">
                      <ClipboardList className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <h3 className="mb-1 text-lg font-bold text-foreground">No auctioned arrivals</h3>
                  <p className="text-sm text-muted-foreground">
                    Arrivals appear here when they have bids and not every lot is weighed yet (same as
                    &quot;Auctioned&quot; on Arrivals).
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card rounded-2xl p-8 text-center"
                >
                  <Filter className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mb-1 text-lg font-bold text-foreground">No matches</h3>
                  <p className="mb-4 text-sm text-muted-foreground">Adjust your search.</p>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setSearchQuery('')}>
                    Clear search
                  </Button>
                </motion.div>
              )
            ) : summaryLayout === 'list' ? (
              <SummaryArrivalsTable arrivals={filteredArrivals} onSelectArrival={onSelectArrival} />
            ) : (
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {filteredArrivals.map((a, i) => (
                  <SummaryArrivalPipelineCard
                    key={`${a.vehicleId}-${i}`}
                    arrival={a}
                    billing={billingByVehicle.get(String(a.vehicleId))}
                    auction={auctionBagsByVehicle.get(String(a.vehicleId))}
                    index={i}
                    onOpenVehicle={onSelectArrival}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isDesktop && showFullVehicleOps && selectedFromUrl && (
        <div className="max-w-[100vw] overflow-x-hidden px-4 pt-5 pb-6 sm:px-6 sm:pt-5 lg:px-8 lg:pt-5">
          <SummaryVehicleOperationsView
            arrival={selectedFromUrl}
            isDesktop
            onBack={onBackFromOps}
          />
        </div>
      )}

      {!isDesktop && showFullVehicleOps && selectedFromUrl && (
        <div className="px-0">
          <SummaryVehicleOperationsView arrival={selectedFromUrl} isDesktop={false} onBack={onBackFromOps} />
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default SummaryPage;
