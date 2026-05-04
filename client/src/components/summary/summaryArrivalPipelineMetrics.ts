import type { ArrivalDetail, ArrivalSummary } from '@/services/api/arrivals';
import type { LotSummaryDTO } from '@/services/api/auction';
import type { SalesBillDTO } from '@/services/api/billing';

/** Bag counts from billing lines (quantity = bags), keyed by vehicle id. */
export type VehicleBillingBagStats = {
  /** Σ line.quantity where weight > 0 (billing-truth “weighed” bags). */
  weighedBags: number;
  /** Σ line.quantity on bill lines for this vehicle’s lots. */
  billedBags: number;
  /** Σ line.quantity on lines whose bill has a bill number (invoiced). */
  invoicedBags: number;
};

/** Total bags + auctioned bags from lot list (`sold_bags`), keyed by vehicle id. */
export type AuctionBagStats = {
  totalBags: number;
  auctionedBags: number;
};

/** Map auction lot id → vehicle id (string) for joined arrivals detail. */
export function buildLotIdToVehicleId(details: ArrivalDetail[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of details) {
    const vid = String(d.vehicleId);
    for (const s of d.sellers ?? []) {
      for (const l of s.lots ?? []) {
        if (l.id != null) m.set(String(l.id), vid);
      }
    }
  }
  return m;
}

/**
 * Σ billing line quantities per vehicle; weighed = qty on lines with weight;
 * billed = all qty; invoiced = qty on bills with bill number.
 */
export function aggregateBillingBagsByVehicle(
  bills: SalesBillDTO[],
  lotIdToVehicleId: Map<string, string>
): Map<string, VehicleBillingBagStats> {
  const byVid = new Map<string, { weighed: number; billed: number; invoiced: number }>();

  for (const bill of bills) {
    const hasBillNumber = Boolean(bill.billNumber?.trim());
    for (const g of bill.commodityGroups ?? []) {
      for (const line of g.items ?? []) {
        const lid = line.lotId != null ? String(line.lotId) : '';
        if (!lid) continue;
        const vid = lotIdToVehicleId.get(lid);
        if (!vid) continue;
        const qty = Number(line.quantity) || 0;
        const w = Number(line.weight) || 0;
        let row = byVid.get(vid);
        if (!row) {
          row = { weighed: 0, billed: 0, invoiced: 0 };
          byVid.set(vid, row);
        }
        row.billed += qty;
        if (w > 0) row.weighed += qty;
        if (hasBillNumber) row.invoiced += qty;
      }
    }
  }

  const out = new Map<string, VehicleBillingBagStats>();
  for (const [vid, row] of byVid) {
    out.set(vid, {
      weighedBags: row.weighed,
      billedBags: row.billed,
      invoicedBags: row.invoiced,
    });
  }
  return out;
}

/**
 * For each arrival row: total bags (prefer ArrivalSummary.totalBags, else Σ lot `bag_count`)
 * and auctioned bags = Σ `sold_bags` for lots matching `vehicle_number`.
 */
export function aggregateAuctionBagsByVehicleId(
  lots: LotSummaryDTO[],
  arrivals: ArrivalSummary[]
): Map<string, AuctionBagStats> {
  const byNorm = new Map<string, { bagSum: number; soldSum: number }>();
  for (const l of lots) {
    const vn = (l.vehicle_number ?? '').trim().toLowerCase();
    if (!vn) continue;
    const row = byNorm.get(vn) ?? { bagSum: 0, soldSum: 0 };
    row.bagSum += Number(l.bag_count) || 0;
    row.soldSum += Number(l.sold_bags) || 0;
    byNorm.set(vn, row);
  }

  const out = new Map<string, AuctionBagStats>();
  for (const a of arrivals) {
    const vn = (a.vehicleNumber ?? '').trim().toLowerCase();
    const fromLots = vn ? byNorm.get(vn) : undefined;
    const totalBags =
      typeof a.totalBags === 'number' && a.totalBags > 0
        ? a.totalBags
        : (fromLots?.bagSum ?? 0);
    const auctionedBags = fromLots?.soldSum ?? 0;
    out.set(String(a.vehicleId), { totalBags, auctionedBags });
  }
  return out;
}

/** Same denominator for all four steps: prefer bag total, else lot count. */
export function pipelineTotalBags(a: ArrivalSummary, auction: AuctionBagStats | undefined): number {
  const t = auction?.totalBags ?? a.totalBags ?? 0;
  if (t > 0) return Math.max(0, Math.round(t));
  return Math.max(0, a.lotCount ?? 0);
}

export type StepComplete = {
  bid: boolean;
  weighed: boolean;
  billed: boolean;
  invoiced: boolean;
};

export function pipelineStepCompletion(
  a: ArrivalSummary,
  billing: VehicleBillingBagStats | undefined,
  auction: AuctionBagStats | undefined
): StepComplete {
  const total = pipelineTotalBags(a, auction);
  const auctioned = auction?.auctionedBags ?? 0;
  const wb = billing?.weighedBags ?? 0;
  const bb = billing?.billedBags ?? 0;
  const ib = billing?.invoicedBags ?? 0;

  if (total <= 0) {
    return { bid: false, weighed: false, billed: false, invoiced: false };
  }

  const eps = 0.5;
  return {
    bid: auctioned >= total - eps,
    weighed: wb >= total - eps,
    billed: bb >= total - eps,
    invoiced: ib >= total - eps,
  };
}

/** 0–100 for progress bar; caps done at total. */
export function progressPercent(done: number, total: number): number {
  const t = Math.max(0, total);
  if (t <= 0) return 0;
  const d = Math.max(0, done);
  return Math.min(100, (Math.min(d, t) / t) * 100);
}
