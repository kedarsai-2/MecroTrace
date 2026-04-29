import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ClipboardList, Cog, Truck, Users, Package, Scale, Search, MapPin, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { arrivalsApi } from '@/services/api';
import type { ArrivalSummary, ArrivalDetail } from '@/services/api/arrivals';
import ArrivalStatusBadge, { getArrivalStatus } from '@/components/arrivals/ArrivalStatusBadge';
import ArrivalSummaryVehicleSellerQty from '@/components/arrivals/ArrivalSummaryVehicleSellerQty';
import { ARRIVALS_TABLE_HEADER_GRADIENT } from '@/components/arrivals/arrivalsTableTokens';
import { arrivalsTabCountPill, arrivalsToggleTabBtn, mobileArrivalsStyleTab } from '@/components/arrivals/arrivalsTabStyles';
import SummaryVehicleOperationsView from '@/components/summary/SummaryVehicleOperationsView';
import { toast } from 'sonner';

const SUMMARY_MODULE = 'SummaryPage' as const;

const SummaryPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule } = usePermissions();
  const canView = canAccessModule(SUMMARY_MODULE);
  const vehicleRouteMatch = useMatch({ path: '/summary-page/vehicle/:vehicleId', end: true });
  const vehicleIdFromUrl = vehicleRouteMatch?.params.vehicleId ?? null;
  const lastVehicleIdRef = useRef<string | null>(null);
  const [vehicleTabEmpty, setVehicleTabEmpty] = useState(false);

  const [apiArrivals, setApiArrivals] = useState<ArrivalSummary[]>([]);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, details] = await Promise.all([
        arrivalsApi.list(0, 100, undefined, false),
        arrivalsApi.listDetail(0, 500),
      ]);
      setApiArrivals(list);
      setArrivalDetails(details);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      toast.error(message);
      setApiArrivals([]);
      setArrivalDetails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    void loadData();
  }, [canView, loadData]);

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
    if (!vehicleIdFromUrl) return;
    setVehicleTabEmpty(false);
  }, [vehicleIdFromUrl]);

  useEffect(() => {
    if (!canView || loading) return;
    if (vehicleIdFromUrl && !selectedFromUrl) {
      toast.error('This vehicle is not in the current post-auction summary');
      navigate('/summary-page', { replace: true });
    }
  }, [canView, loading, vehicleIdFromUrl, selectedFromUrl, navigate]);

  const showList = !vehicleIdFromUrl && !vehicleTabEmpty;
  const showFullVehicleOps = Boolean(vehicleIdFromUrl && selectedFromUrl);
  const showVehicleOpsEmpty = !vehicleIdFromUrl && vehicleTabEmpty;

  const onSelectArrival = useCallback(
    (a: ArrivalSummary) => {
      lastVehicleIdRef.current = String(a.vehicleId);
      setVehicleTabEmpty(false);
      navigate(`/summary-page/vehicle/${a.vehicleId}`);
    },
    [navigate],
  );

  const onTabSummary = useCallback(() => {
    setVehicleTabEmpty(false);
    navigate('/summary-page');
  }, [navigate]);

  const onTabVehicle = useCallback(() => {
    if (lastVehicleIdRef.current) {
      navigate(`/summary-page/vehicle/${lastVehicleIdRef.current}`);
    } else {
      setVehicleTabEmpty(true);
    }
  }, [navigate]);

  const onBackFromOps = useCallback(() => {
    setVehicleTabEmpty(false);
    navigate('/summary-page');
  }, [navigate]);

  if (!canView) {
    return <ForbiddenPage moduleName={SUMMARY_MODULE} />;
  }

  const summaryTabListDesktop = (
    <div
      className="mb-6 flex min-w-0 flex-wrap items-center gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch]"
      role="tablist"
      aria-label="Summary main tabs"
    >
      <button type="button" onClick={onTabSummary} className={arrivalsToggleTabBtn(showList)}>
        <Truck className="h-4 w-4" />
        Summary
        <span className={arrivalsTabCountPill(showList)}>{loading ? '…' : auctionedArrivals.length}</span>
      </button>
      <button type="button" onClick={onTabVehicle} className={arrivalsToggleTabBtn(!showList)}>
        <Cog className="h-4 w-4" />
        Vehicle operations
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
            <div
              className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white/15 p-1 backdrop-blur"
              role="tablist"
              aria-label="Summary main tabs"
            >
              <button type="button" onClick={onTabSummary} className={mobileArrivalsStyleTab(showList)}>
                Summary
              </button>
              <button type="button" onClick={onTabVehicle} className={mobileArrivalsStyleTab(!showList)}>
                Vehicle operations
              </button>
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

          {summaryTabListDesktop}

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

              <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
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
              ) : (
                <div className="glass-card max-w-full touch-[pan-x_pan-y] lg:touch-auto overflow-x-auto rounded-2xl [-webkit-overflow-scrolling:touch]">
                  <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
                    <thead className={cn(ARRIVALS_TABLE_HEADER_GRADIENT, 'shadow-md')}>
                      <tr className="border-b border-white/20">
                        <th className="rounded-tl-xl px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
                          Vehicle | Seller | Qty
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
                          Mark / Alias
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
                          From
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
                          Bids
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
                          Weighed
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
                          Sellers
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
                          Lots
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
                          Net Wt
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
                          Freight
                        </th>
                        <th className="rounded-tr-xl px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredArrivals.map((a, i) => {
                        const status = getArrivalStatus(a);
                        return (
                          <motion.tr
                            key={`${a.vehicleId}-${i}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.03 }}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectArrival(a)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelectArrival(a);
                              }
                            }}
                            className="cursor-pointer border-b border-border/20 transition-colors hover:bg-muted/20"
                          >
                            <td className="px-4 py-3 text-foreground">
                              <ArrivalSummaryVehicleSellerQty
                                vehicleNumber={a.vehicleNumber}
                                primarySellerName={a.primarySellerName}
                                totalBags={a.totalBags}
                              />
                            </td>
                            <td
                              className="max-w-[10rem] truncate px-4 py-3 text-xs text-muted-foreground"
                              title={a.vehicleMarkAlias?.trim() || undefined}
                            >
                              {a.vehicleMarkAlias?.trim() ? a.vehicleMarkAlias.trim() : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <ArrivalStatusBadge status={status} />
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{a.godown ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{a.bidsCount ?? 0}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{a.weighedCount ?? 0}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{a.sellerCount}</td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">{a.lotCount}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{a.netWeight}kg</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {a.freightTotal > 0 ? `₹${a.freightTotal.toLocaleString()}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {new Date(a.arrivalDatetime).toLocaleDateString()}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
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

          <div className="mb-4 space-y-4 px-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search seller, vehicle, origin..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-border/40 bg-white pl-10 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF] dark:bg-card"
              />
        </div>
      </div>

          <div className="space-y-2.5 px-4 md:space-y-1.5 md:px-6">
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
            ) : (
              filteredArrivals.map((a, i) => {
                const status = getArrivalStatus(a);
                const godownLabel = a.godown?.trim();
                return (
                  <motion.div
                    key={`${a.vehicleId}-${i}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectArrival(a)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectArrival(a);
                      }
                    }}
                    className="glass-card max-w-full cursor-pointer overflow-x-hidden rounded-2xl md:mx-auto md:max-w-4xl md:rounded-xl md:shadow-sm"
                  >
                    <div className="flex w-full min-w-0 touch-manipulation items-start gap-3 p-3.5 md:items-center md:gap-2 md:p-2.5">
                      <div className="min-w-0 flex-1 space-y-2 md:hidden">
                        <ArrivalSummaryVehicleSellerQty
                          layout="stack"
                          vehicleNumber={a.vehicleNumber}
                          vehicleMarkAlias={a.vehicleMarkAlias}
                          primarySellerName={a.primarySellerName}
                          totalBags={a.totalBags}
                        />
                        <ArrivalStatusBadge status={status} size="md" />
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/25 pt-2">
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sellers</p>
                            <p className="text-sm font-semibold tabular-nums text-foreground">{a.sellerCount}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Lots</p>
                            <p className="text-sm font-semibold tabular-nums text-foreground">{a.lotCount}</p>
                          </div>
                          <div className={godownLabel ? undefined : 'col-span-2'}>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Net weight</p>
                            <p className="text-sm font-semibold tabular-nums text-foreground">{a.netWeight} kg</p>
                          </div>
                          {godownLabel ? (
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">From</p>
                              <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#6075FF]" aria-hidden />
                                <span className="truncate" title={godownLabel}>
                                  {godownLabel}
                                </span>
                              </p>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/20 pt-2 text-xs text-muted-foreground min-[380px]:flex">
                          <span>
                            Bids: <span className="font-medium text-foreground">{a.bidsCount ?? 0}</span>
                          </span>
                          <span>
                            Weighed: <span className="font-medium text-foreground">{a.weighedCount ?? 0}</span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            Freight:{' '}
                            <span className="font-medium text-foreground">
                              {a.freightTotal > 0 ? `₹${a.freightTotal.toLocaleString()}` : '—'}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="hidden w-full min-w-0 items-center gap-2 md:flex">
                        <div className="min-w-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
                          <ArrivalSummaryVehicleSellerQty
                            layout="inline"
                            vehicleNumber={a.vehicleNumber}
                            vehicleMarkAlias={a.vehicleMarkAlias}
                            primarySellerName={a.primarySellerName}
                            totalBags={a.totalBags}
                          />
                        </div>
                        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
                          <span className="inline-flex max-w-[6.5rem] shrink-0 origin-left scale-[0.92] sm:max-w-[7.5rem] sm:scale-100">
                            <ArrivalStatusBadge status={status} size="sm" />
                          </span>
                          <span className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                            S{a.sellerCount}·L{a.lotCount}·{a.netWeight}
                            <span className="text-muted-foreground/80">kg</span>
                          </span>
                          {godownLabel ? (
                            <span
                              className="hidden max-w-[6rem] min-w-0 truncate text-[10px] text-muted-foreground min-[800px]:inline md:max-w-[7rem]"
                              title={godownLabel}
                            >
                              <MapPin className="mr-0.5 inline h-3 w-3 shrink-0 text-[#6075FF]" aria-hidden />
                              {godownLabel}
                            </span>
                          ) : null}
                          <span
                            className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground"
                            title="Bids / Weighed lots"
                          >
                            B{a.bidsCount ?? 0}/{a.weighedCount ?? 0}
                          </span>
                          <span className="max-w-[4.5rem] truncate text-[10px] text-muted-foreground" title="Mark / Alias">
                            {a.vehicleMarkAlias?.trim() || '—'}
                          </span>
                          <span className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                            {new Date(a.arrivalDatetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 self-start pt-0.5 md:hidden">
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(a.arrivalDatetime).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
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

      {isDesktop && showVehicleOpsEmpty && (
        <div className="max-w-[100vw] overflow-x-hidden px-4 pb-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <ClipboardList className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              Summary
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Post-auction pipeline</p>
          </div>
          {summaryTabListDesktop}
          <div className="glass-card rounded-2xl p-10 text-center">
            <Cog className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="mb-1 text-lg font-bold text-foreground">Vehicle operations</h3>
        <p className="text-sm text-muted-foreground">
              Select a vehicle on the <span className="font-medium text-foreground">Summary</span> tab (click a row), or open a
              vehicle you used before from this tab.
        </p>
      </div>
        </div>
      )}

      {!isDesktop && showFullVehicleOps && selectedFromUrl && (
        <div className="px-0">
          <SummaryVehicleOperationsView arrival={selectedFromUrl} isDesktop={false} onBack={onBackFromOps} />
        </div>
      )}

      {!isDesktop && showVehicleOpsEmpty && (
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
                <p className="text-xs text-white/80">Choose a vehicle to see operations</p>
              </div>
            </div>
            <div
              className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white/15 p-1 backdrop-blur"
              role="tablist"
              aria-label="Summary main tabs"
            >
              <button type="button" onClick={onTabSummary} className={mobileArrivalsStyleTab(showList)}>
                Summary
              </button>
              <button type="button" onClick={onTabVehicle} className={mobileArrivalsStyleTab(!showList)}>
                Vehicle operations
              </button>
            </div>
          </div>
          <div className="relative z-10 mt-4 rounded-2xl border border-white/20 bg-white/10 p-6 text-center text-white/95 backdrop-blur">
            <p className="text-sm">Tap a row on the Summary tab, or use Vehicle operations after you have selected a vehicle once.</p>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default SummaryPage;
