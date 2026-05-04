import type { ArrivalSellerFullDetail } from '@/services/api/arrivals';
import type { AuctionEntryDTO, LotSummaryDTO } from '@/services/api/auction';
import { formatAuctionLotIdentifier } from '@/utils/auctionLotIdentifier';

export function sellerKeyFromArrivalSeller(s: ArrivalSellerFullDetail): string {
  const name = (s.sellerName ?? '').trim().toLowerCase();
  const mark = (s.sellerMark ?? '').trim().toLowerCase();
  const cid = s.contactId != null ? String(s.contactId) : '';
  return `${cid}|${name}|${mark}`;
}

/** Match arrival seller to auction lot: prefer lot id (stable), else name+mark. */
export function lotSummaryBelongsToSeller(lot: LotSummaryDTO, seller: ArrivalSellerFullDetail): boolean {
  const ids = new Set((seller.lots ?? []).map((x) => x.id).filter((x): x is number => x != null));
  if (ids.size > 0) {
    return ids.has(lot.lot_id);
  }
  const normalize = (s: string | undefined) => (s ?? '').trim().toLowerCase();
  const ln = normalize(lot.seller_name);
  const lm = normalize(lot.seller_mark);
  const sn = normalize(seller.sellerName);
  const sm = normalize(seller.sellerMark);
  return ln === sn && lm === sm;
}

function pickVehicleMark(dto: LotSummaryDTO): string | undefined {
  const v = dto.vehicle_mark?.trim();
  if (v) return v;
  return undefined;
}

export function formatLotLabelFromSummary(lot: LotSummaryDTO): string {
  const vTotal = lot.vehicle_total_qty ?? lot.bag_count;
  const sTotal = lot.seller_total_qty ?? lot.bag_count;
  const lotName = lot.lot_name ?? String(lot.bag_count);
  return formatAuctionLotIdentifier({
    vehicleMark: pickVehicleMark(lot),
    vehicleTotalQty: vTotal,
    sellerMark: lot.seller_mark,
    sellerTotalQty: sTotal,
    lotName,
    lotQty: lot.bag_count,
  });
}

/**
 * Sidebar seller row shows `sold / pending` counts from bag totals across this seller's lots (sold_bags vs remainder).
 * Lot-level completion is a separate concept; bags match Sales Pad / summary cards.
 */
export function sellerBagSoldPending(lots: LotSummaryDTO[]): { sold: number; pending: number } {
  let sold = 0;
  let pending = 0;
  for (const l of lots) {
    const sb = l.sold_bags ?? 0;
    const bc = l.bag_count ?? 0;
    sold += sb;
    pending += Math.max(0, bc - sb);
  }
  return { sold, pending };
}

/** Σ sold_bags covers bag_count — lot auction complete. */
export function isLotFullyAuctioned(lot: LotSummaryDTO): boolean {
  const bc = lot.bag_count ?? 0;
  if (bc <= 0) return true;
  return (lot.sold_bags ?? 0) >= bc;
}

/**
 * FIFO by bid_number: row is auction-complete when cumulative sold_bags fully covers this bid’s qty.
 * Self-sale rows use auctioned (brand green) strip (not competing for normal FIFO bags).
 */
export function entryFullyAuctionedBySoldBags(entries: AuctionEntryDTO[], soldBags: number): Map<number, boolean> {
  const sorted = [...entries].sort((a, b) => (a.bid_number ?? 0) - (b.bid_number ?? 0));
  let rem = Math.max(0, Number(soldBags) || 0);
  const m = new Map<number, boolean>();
  for (const e of sorted) {
    const id = e.auction_entry_id;
    if (e.is_self_sale) {
      m.set(id, true);
      continue;
    }
    const q = Number(e.quantity) || 0;
    if (q <= 0) {
      m.set(id, true);
      continue;
    }
    const take = Math.min(q, rem);
    rem -= take;
    m.set(id, take >= q - 1e-9);
  }
  return m;
}
