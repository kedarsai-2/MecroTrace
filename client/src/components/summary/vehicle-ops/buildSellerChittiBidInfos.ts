/**
 * Build `BidInfo[]` for seller chitti print — mirrors LogisticsPage `buildBidsForCurrentData`
 * for a single arrival seller (filter by that seller's lot ids).
 * Only rows with bags actually auctioned (`sold_bags` FIFO by bid_number) are included; latest result per lot wins.
 */
import type { ArrivalFullDetail, ArrivalSellerFullDetail } from '@/services/api/arrivals';
import type { AuctionResultDTO, AuctionResultEntryDTO, LotSummaryDTO } from '@/services/api/auction';
import type { BidInfo } from '@/utils/printTemplates';

function positiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

type LotListMeta = {
  sellerName?: string;
  lotName?: string;
  vehicleNumber?: string;
  vehicleMark?: string;
  sellerMark?: string;
  origin?: string;
  godown?: string;
};

function buildLotIdMetaFromArrival(detail: ArrivalFullDetail): Map<string, LotListMeta> {
  const m = new Map<string, LotListMeta>();
  for (const seller of detail.sellers ?? []) {
    for (const lot of seller.lots ?? []) {
      if (lot.id == null) continue;
      m.set(String(lot.id), {
        sellerName: seller.sellerName,
        lotName: lot.lotName,
        vehicleNumber: detail.vehicleNumber,
        vehicleMark: detail.vehicleMarkAlias?.trim() || undefined,
        sellerMark: seller.sellerMark?.trim() || undefined,
        origin: detail.origin,
        godown: detail.godown,
      });
    }
  }
  return m;
}

function buildSerialAndCommodityMaps(detail: ArrivalFullDetail): {
  lotIdToCommodity: Map<string, string>;
  lotIdToSellerSerial: Map<string, number>;
  lotIdToLotSerial: Map<string, number>;
} {
  const lotIdToCommodity = new Map<string, string>();
  const lotIdToSellerSerial = new Map<string, number>();
  const lotIdToLotSerial = new Map<string, number>();
  for (const seller of detail.sellers ?? []) {
    const sellerSerial = positiveNumber(
      (seller as { seller_serial_number?: number }).seller_serial_number ?? seller.sellerSerialNumber,
    );
    for (const lot of seller.lots ?? []) {
      if (lot.id == null) continue;
      const id = String(lot.id);
      const commodity = (lot.commodityName ?? '').trim();
      if (commodity) lotIdToCommodity.set(id, commodity);
      if (sellerSerial) lotIdToSellerSerial.set(id, sellerSerial);
      const lotSerial = positiveNumber(
        (lot as { lot_serial_number?: number | null }).lot_serial_number ?? lot.lotSerialNumber,
      );
      if (lotSerial) lotIdToLotSerial.set(id, lotSerial);
    }
  }
  return { lotIdToCommodity, lotIdToSellerSerial, lotIdToLotSerial };
}

function resultEntryKey(e: AuctionResultEntryDTO): string {
  const id = e.auctionEntryId;
  if (id != null && Number.isFinite(Number(id)) && Number(id) > 0) return `id:${Number(id)}`;
  return `bn:${Number(e.bidNumber) || 0}`;
}

/** FIFO by bid_number: bags allocated to each entry from `sold_bags` (matches vehicle-ops sold strip). */
function auctionedBagQtyByEntryKey(
  entries: AuctionResultEntryDTO[] | undefined,
  soldBags: number,
): Map<string, number> {
  const list = [...(entries ?? [])].filter(
    (e) => String(e.buyerMark ?? '').trim() !== '__M0_UNB__',
  );
  list.sort((a, b) => (Number(a.bidNumber) || 0) - (Number(b.bidNumber) || 0));
  let rem = Math.max(0, Math.floor(Number(soldBags) || 0));
  const out = new Map<string, number>();
  for (const e of list) {
    const key = resultEntryKey(e);
    if (e.isSelfSale) {
      const q = Math.max(0, Math.floor(Number(e.quantity) || 0));
      if (q > 0) out.set(key, q);
      continue;
    }
    const q = Math.max(0, Math.floor(Number(e.quantity) || 0));
    if (q <= 0) continue;
    const take = Math.min(q, rem);
    rem -= take;
    if (take > 0) out.set(key, take);
  }
  return out;
}

/** Newest completion per lot (same lot may appear multiple times in paged results). */
function dedupeLatestAuctionResultPerLot(results: AuctionResultDTO[]): AuctionResultDTO[] {
  const sorted = [...results].sort((a, b) => {
    const ta = Date.parse(String(a.completedAt ?? '')) || 0;
    const tb = Date.parse(String(b.completedAt ?? '')) || 0;
    return tb - ta;
  });
  const seen = new Set<string>();
  const out: AuctionResultDTO[] = [];
  for (const r of sorted) {
    const id = String(r.lotId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

/**
 * Completed auction lines for `selectedSeller` only, same shape as Logistics Print Hub.
 * `lotSummariesForVehicle` supplies `sold_bags` so only auctioned quantities print (not pending bids).
 */
export function buildSellerChittiBidInfos(
  auctionResults: AuctionResultDTO[],
  arrivalDetail: ArrivalFullDetail,
  selectedSeller: ArrivalSellerFullDetail,
  lotSummariesForVehicle: LotSummaryDTO[],
): BidInfo[] {
  const sellerLotIds = new Set(
    (selectedSeller.lots ?? [])
      .map((l) => l.id)
      .filter((id): id is number => id != null)
      .map(String),
  );
  if (sellerLotIds.size === 0) return [];

  const lotSummaryByLotId = new Map<string, LotSummaryDTO>();
  for (const l of lotSummariesForVehicle) {
    lotSummaryByLotId.set(String(l.lot_id), l);
  }

  const lotIdMetaFromList = buildLotIdMetaFromArrival(arrivalDetail);
  const { lotIdToCommodity, lotIdToSellerSerial, lotIdToLotSerial } = buildSerialAndCommodityMaps(arrivalDetail);

  const filtered = auctionResults.filter((r) => sellerLotIds.has(String(r.lotId)));
  const deduped = dedupeLatestAuctionResultPerLot(filtered);

  const allBids: BidInfo[] = [];
  for (const auction of deduped) {
    const lotKey = String(auction.lotId);
    const summary = lotSummaryByLotId.get(lotKey);
    const soldBagsRaw = Math.max(0, Math.floor(Number(summary?.sold_bags) || 0));
    const entries = auction.entries ?? [];
    const maxQtyFromResult = entries
      .filter((e) => String(e.buyerMark ?? '').trim() !== '__M0_UNB__')
      .reduce((s, e) => s + Math.max(0, Math.floor(Number(e.quantity) || 0)), 0);
    const soldBags = Math.min(soldBagsRaw, maxQtyFromResult);
    const qtyByKey = auctionedBagQtyByEntryKey(entries, soldBags);

    const auctionAny = auction as Record<string, unknown>;
    const selfSaleUnitId =
      auction.selfSaleUnitId != null && Number(auction.selfSaleUnitId) > 0
        ? Number(auction.selfSaleUnitId)
        : null;
    const rawLotBag = auction.lotBagCount ?? (auctionAny.lot_bag_count as number | undefined);
    const lotTotalQty =
      rawLotBag != null && Number.isFinite(Number(rawLotBag)) && Number(rawLotBag) > 0
        ? Number(rawLotBag)
        : undefined;

    for (const entry of auction.entries ?? []) {
      const entryAny = entry as Record<string, unknown>;
      const entryBuyerMark = String(entry.buyerMark ?? entryAny.buyer_mark ?? '').trim();
      if (entryBuyerMark === '__M0_UNB__') continue;

      const lineQty = qtyByKey.get(resultEntryKey(entry)) ?? 0;
      if (lineQty <= 0) continue;

      const listMeta = lotIdMetaFromList.get(String(auction.lotId));
      let sellerName = auction.sellerName || 'Unknown';
      let vehicleNumber = auction.vehicleNumber || 'Unknown';
      const fromAuction =
        auction.commodityName ?? (auctionAny.commodity_name as string | undefined) ?? '';
      const commodityName = lotIdToCommodity.get(String(auction.lotId)) || fromAuction;
      let lotName = auction.lotName || '';
      let sellerSerial =
        positiveNumber(
          auction.sellerSerial ??
            (auctionAny.seller_serial as number | undefined) ??
            (auctionAny.sellerSerialNo as number | undefined) ??
            (auctionAny.seller_serial_no as number | undefined),
        ) ??
        lotIdToSellerSerial.get(String(auction.lotId)) ??
        0;
      let lotNumber =
        positiveNumber(
          auction.lotNumber ??
            (auctionAny.lot_number as number | undefined) ??
            (auctionAny.lotSerialNo as number | undefined) ??
            (auctionAny.lot_serial_no as number | undefined),
        ) ??
        lotIdToLotSerial.get(String(auction.lotId)) ??
        0;
      let origin: string | undefined = String(auction.origin ?? '').trim() || undefined;
      let godown: string | undefined = String(auction.godown ?? '').trim() || undefined;
      let vehicleMark = String(auction.vehicleMark ?? '').trim();
      let sellerMark = String(auction.sellerMark ?? '').trim();
      const apiVTot = Number(auction.vehicleTotalQty);
      const apiSTot = Number(auction.sellerTotalQty);
      const auctionVehicleTotalQty = Number.isFinite(apiVTot) && apiVTot > 0 ? apiVTot : undefined;
      const auctionSellerTotalQty = Number.isFinite(apiSTot) && apiSTot > 0 ? apiSTot : undefined;

      if (listMeta) {
        sellerName = listMeta.sellerName || sellerName;
        vehicleNumber = listMeta.vehicleNumber || vehicleNumber;
        lotName = listMeta.lotName || lotName;
        origin = origin || listMeta.origin;
        godown = godown || listMeta.godown;
        if (!vehicleMark) vehicleMark = String(listMeta.vehicleMark ?? '').trim();
        if (!sellerMark) sellerMark = String(listMeta.sellerMark ?? '').trim();
      }

      const rawEntryId = entry.auctionEntryId ?? (entryAny.auction_entry_id as number | null | undefined);
      const auctionEntryId =
        rawEntryId != null && Number.isFinite(Number(rawEntryId)) ? Number(rawEntryId) : undefined;

      const buyerIdRaw = entry.buyerId ?? entryAny.buyer_id;
      const buyerId =
        buyerIdRaw != null && Number.isFinite(Number(buyerIdRaw)) ? Number(buyerIdRaw) : null;

      allBids.push({
        bidNumber: entry.bidNumber,
        buyerMark: entry.buyerMark,
        buyerName: entry.buyerName,
        quantity: lineQty,
        rate: entry.rate,
        lotId: String(auction.lotId),
        lotName,
        lotTotalQty,
        sellerName,
        sellerSerial,
        lotNumber,
        vehicleNumber,
        commodityName,
        origin,
        godown,
        auctionEntryId,
        selfSaleUnitId,
        vehicleMark: vehicleMark || undefined,
        sellerMark: sellerMark || undefined,
        auctionVehicleTotalQty,
        auctionSellerTotalQty,
        tokenAdvance: Number(entry.tokenAdvance ?? entryAny.token_advance ?? 0) || undefined,
        presetApplied: entry.presetApplied ?? (entryAny.preset_applied as number | undefined) ?? undefined,
        presetType: entry.presetType ?? (entryAny.preset_type as BidInfo['presetType']) ?? undefined,
        buyerId,
        isScribble: Boolean(entry.isScribble ?? entryAny.is_scribble),
        isSelfSale: Boolean(entry.isSelfSale ?? entryAny.is_self_sale),
      });
    }
  }

  const vehicleTotals = new Map<string, number>();
  const vehicleSellerTotals = new Map<string, number>();
  allBids.forEach((b) => {
    const vKey = b.vehicleNumber || '';
    const vsKey = `${vKey}||${b.sellerName}`;
    vehicleTotals.set(vKey, (vehicleTotals.get(vKey) ?? 0) + b.quantity);
    vehicleSellerTotals.set(vsKey, (vehicleSellerTotals.get(vsKey) ?? 0) + b.quantity);
  });

  return allBids.map((b) => {
    const vKey = b.vehicleNumber || '';
    const vsKey = `${vKey}||${b.sellerName}`;
    return {
      ...b,
      sellerSerial: b.sellerSerial,
      lotNumber: b.lotNumber,
      vehicleTotalQty: b.auctionVehicleTotalQty ?? vehicleTotals.get(vKey) ?? b.quantity,
      sellerVehicleQty: b.auctionSellerTotalQty ?? vehicleSellerTotals.get(vsKey) ?? b.quantity,
    };
  });
}

/** S.No on seller chitti: arrival serial, else first bid row serial (Logistics seller group). */
export function resolveSellerChittiSerial(
  selectedSeller: ArrivalSellerFullDetail,
  bids: BidInfo[],
): number {
  const fromArrival = positiveNumber(selectedSeller.sellerSerialNumber);
  if (fromArrival) return fromArrival;
  for (const b of bids) {
    const s = positiveNumber(b.sellerSerial);
    if (s) return s;
  }
  return 0;
}
