/**
 * Tab 2 — Vehicle Operations: stats from auction `LotSummaryDTO` / `AuctionResultDTO` and
 * billing `BillLineItemDTO` (weight + presetApplied). RD card gated by `trader.preset_enabled` (see AuctionsPage).
 * TODO(merco): if auction results for older days exceed `fetchAllAuctionResults` cap, add server filter by vehicleId;
 * same for billing pagination when many bills.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Cog, Info, MapPin, Package, Settings2, Truck, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import type { ArrivalFullDetail, ArrivalSummary } from '@/services/api/arrivals';
import { arrivalsApi, commodityApi } from '@/services/api';
import type { FullCommodityConfigDto } from '@/services/api/commodities';
import type { Commodity } from '@/types/models';
import { VehicleOpsSellerWorkspace } from '@/components/summary/vehicle-ops/VehicleOpsSellerWorkspace';
import { vehicleOpsBackCircleClass, vehicleOpsPrimaryBtnClass } from '@/components/summary/vehicle-ops/vehicleOpsUi';
import { auctionApi, type LotSummaryDTO, fetchAllAuctionResults } from '@/services/api/auction';
import { billingApi } from '@/services/api/billing';
import type { AuctionResultDTO } from '@/services/api/auction';
import type { SalesBillDTO } from '@/services/api/billing';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const DEFAULT_COMMODITY_RATE_UNIT = 50;
const MAX_BILLING_PAGES = 6;
const BILLS_PAGE_SIZE = 100;

const LOTS_LOAD_USER_MSG = 'Bag totals could not be loaded.';
const AUCTION_RD_USER_MSG = 'Estimated rate difference could not be loaded.';

const RD_EST_FORMULA_TOOLTIP = 'Estimated Rate Difference: ∑(Preset x Qty)';

const RD_ACTUAL_FORMULA_TOOLTIP = 'Actual Rate Difference: ∑(Preset x Weight)/ Rate Unit';

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function rdSignedClass(n: number | null): string {
  if (n == null || Number.isNaN(n)) return 'text-foreground';
  if (n > 0) return 'text-[#92D050] dark:text-[#B5E87A]';
  if (n < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-foreground';
}

function collectLotIdKeys(detail: ArrivalFullDetail | null): Set<string> {
  const s = new Set<string>();
  if (!detail) return s;
  for (const se of detail.sellers ?? []) {
    for (const l of se.lots ?? []) {
      if (l.id != null) s.add(String(l.id));
    }
  }
  return s;
}

/** `AuctionResultDTO.sellerVehicleId` is SellerInVehicle id — match those for this vehicle’s lots, not the vehicle id. */
function sumEstimatedRdForSellerVehicles(
  results: AuctionResultDTO[],
  sellerVehicleIds: Set<number>,
): number {
  if (sellerVehicleIds.size === 0) return 0;
  const rows = results.filter((r) => sellerVehicleIds.has(r.sellerVehicleId));
  let sum = 0;
  for (const r of rows) {
    for (const e of r.entries ?? []) {
      const p = e.presetApplied;
      if (p == null || p === 0) continue;
      const q = e.quantity ?? 0;
      sum += p * q;
    }
  }
  return sum;
}

/** Σ line weights (kg) on sales bills per auction lot id. */
function sumBilledWeightByLotId(bills: SalesBillDTO[], lotIdSet: Set<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bills) {
    for (const g of b.commodityGroups ?? []) {
      for (const line of g.items ?? []) {
        const lid = line.lotId != null ? String(line.lotId) : '';
        if (!lid || !lotIdSet.has(lid)) continue;
        const w = Number(line.weight) || 0;
        m.set(lid, (m.get(lid) ?? 0) + w);
      }
    }
  }
  return m;
}

function lotBagCountById(detail: ArrivalFullDetail | null): Map<string, number> {
  const m = new Map<string, number>();
  if (!detail) return m;
  for (const s of detail.sellers ?? []) {
    for (const l of s.lots ?? []) {
      if (l.id != null) m.set(String(l.id), l.bagCount ?? 0);
    }
  }
  return m;
}

function buildCommodityNameToRateUnit(
  fullConfigs: FullCommodityConfigDto[],
  list: Commodity[]
): (commodityName: string) => number {
  const byName = new Map<string, number>();
  for (const c of list) {
    const id = Number(c.commodity_id);
    if (!Number.isFinite(id)) continue;
    const name = (c.commodity_name || '').trim().toLowerCase();
    if (!name) continue;
    const f = fullConfigs.find((x) => x.commodityId === id);
    const r = f?.config?.ratePerUnit;
    byName.set(name, r != null && r > 0 ? r : DEFAULT_COMMODITY_RATE_UNIT);
  }
  return (commodityName: string) => {
    const k = (commodityName || '').trim().toLowerCase();
    return byName.get(k) ?? DEFAULT_COMMODITY_RATE_UNIT;
  };
}

/**
 * Per lot: (Σ preset×qty) × W / (Q × R) = Est_lot × W / (Q×R), with W from billing when present,
 * else pro-rata share of arrival final billable weight. R = commodity rate unit (kg per bag, e.g. 50).
 */
function sumActualRateDifferenceForVehicle(
  results: AuctionResultDTO[],
  svIds: Set<number>,
  lotIdSet: Set<string>,
  bills: SalesBillDTO[],
  getRateUnit: (commodityName: string) => number,
  arrival: ArrivalSummary,
  detail: ArrivalFullDetail | null
): number {
  if (svIds.size === 0 || lotIdSet.size === 0) return 0;

  const byLot = new Map<string, { est: number; q: number; commodityName: string }>();
  for (const r of results) {
    if (!svIds.has(r.sellerVehicleId) || !lotIdSet.has(String(r.lotId))) continue;
    const k = String(r.lotId);
    const cur = byLot.get(k) ?? { est: 0, q: 0, commodityName: r.commodityName ?? '' };
    for (const e of r.entries ?? []) {
      const p = e.presetApplied;
      if (p == null) continue;
      const q = e.quantity ?? 0;
      cur.est += p * q;
      cur.q += q;
    }
    byLot.set(k, cur);
  }

  const billedW = sumBilledWeightByLotId(bills, lotIdSet);
  const bagByLot = lotBagCountById(detail);
  let totalBags = 0;
  for (const n of bagByLot.values()) totalBags += n;
  if (totalBags <= 0 && typeof arrival.totalBags === 'number' && arrival.totalBags > 0) {
    totalBags = arrival.totalBags;
  }
  const fbw = Number(arrival.finalBillableWeight) || 0;

  let sum = 0;
  for (const [lotId, row] of byLot) {
    const { est, q, commodityName } = row;
    if (q <= 0) continue;
    const R = getRateUnit(commodityName);
    if (R <= 0) continue;
    let W = billedW.get(lotId) ?? 0;
    if (W <= 0 && fbw > 0 && totalBags > 0) {
      const bgs = bagByLot.get(lotId) ?? 0;
      if (bgs > 0) W = (bgs / totalBags) * fbw;
    }
    if (W <= 0) continue;
    sum += (est * W) / (q * R);
  }
  return sum;
}

type Props = {
  arrival: ArrivalSummary;
  isDesktop: boolean;
  onBack: () => void;
};

const cardTitleRowClass =
  'mb-2 flex justify-center items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

const SummaryVehicleOperationsView = ({ arrival, isDesktop, onBack }: Props) => {
  const { trader } = useAuth();
  const canShowRd = trader?.preset_enabled !== false;

  const [allLots, setAllLots] = useState<LotSummaryDTO[]>([]);
  const [auctionErr, setAuctionErr] = useState(false);
  const [lotErr, setLotErr] = useState(false);
  const [rdEst, setRdEst] = useState<number | null>(null);
  const [rdActual, setRdActual] = useState<number | null>(null);
  const [billingUnbounded, setBillingUnbounded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [arrivalFullDetail, setArrivalFullDetail] = useState<ArrivalFullDetail | null>(null);

  const vid = arrival.vehicleId;

  /** `seller_vehicle_id` on lots is the SellerInVehicle row id, not the vehicle id — match by vehicle number. */
  const lotRows = useMemo(() => {
    const n = (arrival.vehicleNumber ?? '').trim().toLowerCase();
    if (!n) return [];
    return allLots.filter((l) => (l.vehicle_number ?? '').trim().toLowerCase() === n);
  }, [allLots, arrival.vehicleNumber]);

  const bagBlock = useMemo(() => {
    const soldBags = lotRows.reduce((s, l) => s + (l.sold_bags ?? 0), 0);
    const pendingBags = Math.max(
      0,
      lotRows.reduce((s, l) => s + Math.max(0, l.bag_count - (l.sold_bags ?? 0)), 0),
    );
    return { soldBags, pendingBags };
  }, [lotRows]);

  const fromLabel = arrival.godown?.trim() || arrival.origin?.trim() || '—';

  const runLoad = useCallback(async () => {
    setLoading(true);
    setAuctionErr(false);
    setLotErr(false);
    setBillingUnbounded(false);
    setRdEst(null);
    setRdActual(null);

    const detail = (await arrivalsApi.getById(vid).catch(() => null)) as ArrivalFullDetail | null;
    setArrivalFullDetail(detail);
    const lotKeys = collectLotIdKeys(detail);

    let lotsList: LotSummaryDTO[] = [];
    try {
      const res = await auctionApi.listLots({ size: 2000, sort: 'id,asc' });
      lotsList = Array.isArray(res) ? res : [];
      setAllLots(lotsList);
    } catch {
      setAllLots([]);
      setLotErr(true);
    }

    if (!canShowRd) {
      setLoading(false);
      return;
    }

    const vn = (arrival.vehicleNumber ?? '').trim().toLowerCase();
    const forVehicle = vn
      ? lotsList.filter((l) => (l.vehicle_number ?? '').trim().toLowerCase() === vn)
      : [];
    const svIdsForVehicle = new Set(
      forVehicle
        .map((l) => Number(l.seller_vehicle_id))
        .filter((x) => !Number.isNaN(x) && x > 0),
    );
    let auctionResults: AuctionResultDTO[] = [];

    try {
      auctionResults = await fetchAllAuctionResults(12, 100);
      setRdEst(
        svIdsForVehicle.size > 0
          ? sumEstimatedRdForSellerVehicles(auctionResults, svIdsForVehicle)
          : 0,
      );
    } catch {
      setAuctionErr(true);
    }

    try {
      if (lotKeys.size === 0) {
        setLoading(false);
        return;
      }

      const allBills: SalesBillDTO[] = [];
      for (let p = 0; p < MAX_BILLING_PAGES; p += 1) {
        const page = await billingApi.getPage({ page: p, size: BILLS_PAGE_SIZE, sort: 'billDate,desc' });
        allBills.push(...(page.content ?? []));
        if (page.content.length < BILLS_PAGE_SIZE) break;
        if (p === MAX_BILLING_PAGES - 1) {
          setBillingUnbounded(true);
        }
      }
      const [commodityList, fullConfigs] = await Promise.all([
        commodityApi.list().catch(() => [] as Commodity[]),
        commodityApi.getAllFullConfigs().catch(() => [] as FullCommodityConfigDto[]),
      ]);
      const getRate = buildCommodityNameToRateUnit(
        fullConfigs,
        Array.isArray(commodityList) ? commodityList : []
      );
      const actual = sumActualRateDifferenceForVehicle(
        auctionResults,
        svIdsForVehicle,
        lotKeys,
        allBills,
        getRate,
        arrival,
        detail
      );
      setRdActual(actual);
    } catch {
      setRdActual(null);
    } finally {
      setLoading(false);
    }
  }, [canShowRd, vid, arrival.vehicleNumber, arrival.finalBillableWeight, arrival.totalBags]);

  useEffect(() => {
    setArrivalFullDetail(null);
  }, [vid]);

  useEffect(() => {
    void runLoad();
  }, [runLoad]);

  const statusLine = `Lot ${arrival.lotCount} · ${arrival.sellerCount} sellers · Vehicle operations`;
  const hero = (
    <div
      className={cn(
        'relative mb-4 overflow-hidden rounded-b-3xl bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 px-4 pb-6',
        isDesktop ? 'pt-4' : 'pt-[max(2rem,env(safe-area-inset-top))]',
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(123,97,255,0.2)_0%,transparent_40%)]" />
      <div className="relative z-10 flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className={vehicleOpsBackCircleClass}
          aria-label="Back to summary"
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-white">Vehicle {arrival.vehicleNumber}</h1>
          <p className="line-clamp-2 text-xs text-white/80">{statusLine}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur text-white">
          <Cog className="h-5 w-5" />
        </div>
      </div>
    </div>
  );

  const threeCards = (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="glass-card rounded-2xl border border-border/40 p-4 shadow-sm">
        <div className={cardTitleRowClass}>
          <Truck className="h-3.5 w-3.5 shrink-0" />
          Vehicle
        </div>
        <p className="text-sm font-bold text-foreground">#{arrival.vehicleNumber}</p>
        <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-foreground/90">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6075FF]" aria-hidden />
          <span className="min-w-0" title={fromLabel}>
            From: {fromLabel}
          </span>
        </p>
      </div>

      <div className="glass-card rounded-2xl border border-border/40 p-4 shadow-sm">
        <div className={cardTitleRowClass}>
          <Package className="h-3.5 w-3.5 shrink-0" />
          Bag summary
        </div>
        {lotErr ? (
          <p className="mt-2 text-center text-sm text-muted-foreground">{LOTS_LOAD_USER_MSG}</p>
        ) : (
          <p className="mt-2 text-center text-sm font-semibold tabular-nums text-foreground">
            {bagBlock.pendingBags} / {bagBlock.soldBags}
          </p>
        )}
      </div>

      {canShowRd ? (
        <div className="glass-card rounded-2xl border border-border/40 p-4 shadow-sm">
          <div className={cardTitleRowClass}>
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span>Rate difference (preset)</span>
          </div>
          {loading ? <p className="text-sm text-muted-foreground">…</p> : null}
          {auctionErr ? (
            <p className="mb-2 text-center text-sm text-muted-foreground">{AUCTION_RD_USER_MSG}</p>
          ) : null}
          {billingUnbounded ? (
            <p className="mb-2 text-center text-[11px] text-muted-foreground">
              Actual RD may be incomplete; try again after more billing is recorded.
            </p>
          ) : null}
          <div className="mt-1 space-y-2.5">
            <div className="flex w-full min-w-0 items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-muted-foreground">Estimated RD</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="How estimated RD is calculated"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-left text-xs leading-snug">
                    {RD_EST_FORMULA_TOOLTIP}
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="shrink-0 text-right font-medium tabular-nums text-foreground">
                {rdEst != null && !Number.isNaN(rdEst) ? formatInr(rdEst) : '—'}
              </span>
            </div>
            <div className="flex w-full min-w-0 items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-muted-foreground">Actual RD</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="How actual RD is calculated"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-left text-xs leading-snug">
                    {RD_ACTUAL_FORMULA_TOOLTIP}
                  </TooltipContent>
                </Tooltip>
              </div>
              <span
                className={cn(
                  'shrink-0 text-right font-medium tabular-nums',
                  rdSignedClass(rdActual)
                )}
              >
                {rdActual != null && !Number.isNaN(rdActual) ? formatInr(rdActual) : '—'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="min-w-0">
      {!isDesktop ? hero : null}
      {isDesktop ? (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <Button
            type="button"
            variant="default"
            onClick={onBack}
            className={cn(vehicleOpsPrimaryBtnClass, 'h-10 w-fit shrink-0 gap-1.5 rounded-xl')}
            aria-label="Back to summary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Settings2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              Vehicle operations
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Vehicle {arrival.vehicleNumber}</p>
          </div>
        </div>
      ) : null}
      <div className={cn(!isDesktop && 'px-4 md:px-6')}>
        {threeCards}
        <VehicleOpsSellerWorkspace
          arrivalDetail={arrivalFullDetail}
          lotSummariesForVehicle={lotRows}
          detailLoading={loading && arrivalFullDetail == null}
          onAuctionDataInvalidate={runLoad}
        />
      </div>
    </motion.div>
  );
};

export default SummaryVehicleOperationsView;
