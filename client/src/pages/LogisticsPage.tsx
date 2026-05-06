import { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import { useWindowVirtualizer, measureElement } from '@tanstack/react-virtual';
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  Eye,
  Layers,
  Package,
  Printer,
  Save,
  Search,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useAuctionResults } from '@/hooks/useAuctionResults';
import { printLogApi, arrivalsApi, logisticsApi } from '@/services/api';
import type { ArrivalDetail, ArrivalFullDetail } from '@/services/api/arrivals';
import {
  directPrint,
  generateSalesSticker,
  generateSalesStickerThermal,
  generateBuyerChiti,
  generateBuyerChitiThermal,
  generateSellerChiti,
  generateSellerChitiThermal,
  generateSalePadPrint,
  generateTenderSlip,
  generateDispatchControl,
  formatLotIdentifierForBid,
} from '@/utils/printTemplates';
import type { BidInfo } from '@/utils/printTemplates';

export type { BidInfo };

const bidKey = (b: BidInfo) => `${b.lotId}:${b.bidNumber}`;

/** List / table row key — `lotId:bidNumber` is not unique in some API payloads; prefer auction entry id. */
const bidListKey = (b: BidInfo, indexInList: number): string => {
  if (b.auctionEntryId != null && Number.isFinite(Number(b.auctionEntryId))) {
    return `ae:${b.auctionEntryId}`;
  }
  return `${bidKey(b)}#${indexInList}`;
};

/** Buyer chitti row selection — `bidKey` can repeat across rows; never use `bidKey` alone in `buyerChittiSelected`. */
const buyerChittiRowKey = (b: BidInfo, indexInBuyerBids: number): string => bidListKey(b, indexInBuyerBids);

/**
 * True if the selection set contains any row key that refers to this bid (`ae:*` or `lotId:bidNumber#*`).
 * Used so selection survives row-key rotation when auction refetch updates the list.
 */
const selectionSetHasBid = (set: Set<string>, b: BidInfo): boolean => {
  if (b.auctionEntryId != null && Number.isFinite(Number(b.auctionEntryId))) {
    if (set.has(`ae:${b.auctionEntryId}`)) return true;
  }
  const pref = `${bidKey(b)}#`;
  for (const k of set) {
    if (k === bidKey(b) || k.startsWith(pref)) return true;
  }
  return false;
};

/** Lines for buyer Chitti card: name+mark when distinct; mark-only for temp/duplicate. */
const buyerChittiHeaderLines = (g: { buyerName: string; buyerMark: string }): { primary: string; secondary?: string } => {
  const name = (g.buyerName || '').trim();
  const mark = (g.buyerMark || '').trim();
  if (!mark && !name) return { primary: '—' };
  const nameIsOnlyMark = !name || name.toLowerCase() === mark.toLowerCase();
  if (nameIsOnlyMark) return { primary: mark || name };
  return { primary: name, secondary: mark || undefined };
};

const BUYER_CHITTI_BULK_BTN_CLASS =
  'h-8 min-h-8 text-[10px] px-2.5 font-bold text-[#FFFFFF] border border-[rgba(255,255,255,0.25)] rounded-md transition-shadow shadow-[0_0_10px_rgba(91,140,255,0.85)] hover:shadow-[0_0_14px_rgba(123,97,255,0.9)] active:opacity-90 touch-manipulation';

const buyerChittiBulkBtnStyle: CSSProperties = {
  background: 'linear-gradient(90deg, #4B7CF3 0%, #5B8CFF 45%, #7B61FF 100%)',
};

/** Same gradient as buyer chitti actions; table header row. */
const buyerChittiTableHeadStyle: CSSProperties = {
  background: 'linear-gradient(90deg, #4B7CF3 0%, #5B8CFF 45%, #7B61FF 100%)',
};

const CHITTI_TABLE_HEAD_CELL =
  'py-2 px-2 text-left text-[10px] font-bold uppercase tracking-wide text-[#FFFFFF] border-b border-[rgba(255,255,255,0.2)]';

type FilterMode = 'LOT' | 'BUYER' | 'SELLER';

const FILTER_TABS: { key: FilterMode; label: string; icon: typeof Layers; desc: string }[] = [
  { key: 'BUYER', label: 'Buyer', icon: User, desc: 'Consolidated chiti for buyer' },
  { key: 'SELLER', label: 'Seller', icon: Package, desc: 'Chiti for seller lots' },
  { key: 'LOT', label: 'Lot', icon: Layers, desc: 'Sales sticker per lot' },
];

const ARRIVAL_DETAIL_PAGE_SIZE = 100;
const LOGISTICS_ROW_REVEAL_DELAY_SECONDS = 0.02;
const LOGISTICS_ROW_REVEAL_MAX_DELAY_SECONDS = 0.12;

const logisticsRowRevealTransition = (index: number) => ({
  delay: Math.min(index * LOGISTICS_ROW_REVEAL_DELAY_SECONDS, LOGISTICS_ROW_REVEAL_MAX_DELAY_SECONDS),
});

const virtualPaddingTop = (items: Array<{ start: number }>): number => (items.length > 0 ? items[0].start : 0);

const virtualPaddingBottom = (items: Array<{ end: number }>, totalSize: number): number => {
  if (items.length === 0) return 0;
  return Math.max(0, totalSize - items[items.length - 1].end);
};

const estimateBuyerGroupSize = (
  group: { buyerMark: string; bids: BidInfo[] } | undefined,
  collapsed: boolean,
  isDesktop: boolean,
): number => {
  if (!group) return 180;
  if (collapsed) return 84;

  const rowCount = group.bids.length;

  return isDesktop
    ? 258 + Math.ceil(rowCount / 2) * 38
    : 280 + rowCount * 76;
};

function mergeArrivalDetailsByVehicleId(prev: ArrivalDetail[], chunk: ArrivalDetail[]): ArrivalDetail[] {
  if (chunk.length === 0) return prev;
  const m = new Map<number, ArrivalDetail>();
  prev.forEach((a) => m.set(a.vehicleId, a));
  chunk.forEach((a) => m.set(a.vehicleId, a));
  return Array.from(m.values());
}

function positiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function auctionHasCompletePrintHubMeta(auction: any): boolean {
  return Boolean(
    positiveNumber(auction?.sellerSerial ?? auction?.seller_serial ?? auction?.sellerSerialNo ?? auction?.seller_serial_no) &&
      positiveNumber(auction?.lotNumber ?? auction?.lot_number ?? auction?.lotSerialNo ?? auction?.lot_serial_no) &&
      String(auction?.commodityName ?? auction?.commodity_name ?? '').trim() &&
      String(auction?.origin ?? '').trim() &&
      String(auction?.godown ?? '').trim()
  );
}

const EMPTY_AUCTION_RESULTS_SIGNATURE = '__empty__';

function logisticsAuctionDataSignature(auctionData: unknown[]): string {
  if (!auctionData.length) return EMPTY_AUCTION_RESULTS_SIGNATURE;
  return auctionData.map((auction: any) => {
    const entries = Array.isArray(auction?.entries) ? auction.entries : [];
    const entrySig = entries
      .map((entry: any) => [
        entry.auctionEntryId ?? entry.auction_entry_id ?? '',
        entry.bidNumber ?? '',
        entry.buyerMark ?? '',
        entry.buyerName ?? '',
        entry.quantity ?? '',
        entry.rate ?? '',
      ].join(':'))
      .join(',');
    return [
      auction?.auction_id ?? auction?.auctionId ?? '',
      auction?.lotId ?? '',
      auction?.completedAt ?? '',
      entries.length,
      entrySig,
    ].join('|');
  }).join('||');
}

const LogisticsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const reduceMotion = useReducedMotion();
  const { trader, user } = useAuth();
  const [bids, setBids] = useState<BidInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('BUYER');

  const chitiPrintTraderName = useMemo(
    () => trader?.business_name?.trim() || user?.name?.trim() || 'Trader',
    [trader?.business_name, user?.name]
  );

  const {
    auctionResults: auctionData,
    loading: auctionResultsLoading,
    loadingMore: auctionResultsLoadingMore,
    resultsComplete: auctionResultsComplete,
    totalElements: auctionResultsTotal,
  } = useAuctionResults();
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const [arrivalDetailsComplete, setArrivalDetailsComplete] = useState(false);
  const auctionDataSignature = useMemo(() => logisticsAuctionDataSignature(auctionData), [auctionData]);
  const needsArrivalDetails = useMemo(
    () => auctionData.some((auction: any) => !auctionHasCompletePrintHubMeta(auction)),
    [auctionData],
  );
  const [hydratedAuctionSignature, setHydratedAuctionSignature] = useState('');
  const bidsHydrating = auctionResultsLoading || hydratedAuctionSignature !== auctionDataSignature;
  const arrivalFullDetailsByVehicleIdRef = useRef<Map<number, ArrivalFullDetail>>(new Map());
  const dailySerialAllocationKeyRef = useRef('');

  useEffect(() => {
    if (!needsArrivalDetails) {
      setArrivalDetailsComplete(true);
      return;
    }

    let cancelled = false;
    setArrivalDetails([]);
    setArrivalDetailsComplete(false);
    let merged: ArrivalDetail[] = [];

    (async () => {
      try {
        let page = 0;
        while (!cancelled) {
          const chunk = await arrivalsApi.listDetail(page, ARRIVAL_DETAIL_PAGE_SIZE);
          if (cancelled) return;
          merged = mergeArrivalDetailsByVehicleId(merged, chunk);
          setArrivalDetails(merged);
          if (chunk.length < ARRIVAL_DETAIL_PAGE_SIZE) break;
          page += 1;
        }
      } catch {
        if (!cancelled) {
          setArrivalDetails(merged.length > 0 ? merged : []);
        }
      } finally {
        if (!cancelled) setArrivalDetailsComplete(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [needsArrivalDetails]);

  // REQ-LOG-004: Load bids from completed auctions; enrich with origin/godown/commodity from arrival full detail; daily serials from API
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Root-cause fix:
      // Mapping by vehicle number was missing for some records, so seller/lot serial and godown stayed empty.
      // Build linkage from lotId -> arrival vehicleId first, then fetch full arrivals by vehicleId.
      const auctionLotIds = new Set<string>();
      const auctionHasPrintHubMetaByLotId = new Map<string, boolean>();
      auctionData.forEach((auction: any) => {
        if (auction?.lotId == null) return;
        const lotId = String(auction.lotId);
        auctionLotIds.add(lotId);
        auctionHasPrintHubMetaByLotId.set(
          lotId,
          auctionHasCompletePrintHubMeta(auction)
        );
      });

      const lotIdMetaFromList = new Map<
        string,
        {
          sellerName?: string;
          lotName?: string;
          vehicleNumber?: string;
          vehicleMark?: string;
          sellerMark?: string;
          origin?: string;
          godown?: string;
        }
      >();
      const vehicleIdsToFetch = new Set<number>();
      arrivalDetails.forEach((arr) => {
        (arr.sellers || []).forEach((seller) => {
          (seller.lots || []).forEach((lot) => {
            const lotId = String(lot.id);
            if (!auctionLotIds.has(lotId)) return;
            if (!auctionHasPrintHubMetaByLotId.get(lotId)) {
              vehicleIdsToFetch.add(arr.vehicleId);
            }
            lotIdMetaFromList.set(lotId, {
              sellerName: seller.sellerName,
              lotName: lot.lotName,
              vehicleNumber: arr.vehicleNumber,
              vehicleMark: arr.vehicleMarkAlias?.trim() || undefined,
              sellerMark: seller.sellerMark?.trim() || undefined,
              origin: arr.origin,
              godown: arr.godown,
            });
          });
        });
      });

      const lotIdToCommodity = new Map<string, string>();
      const lotIdToSellerSerial = new Map<string, number>();
      const lotIdToLotSerial = new Map<string, number>();

      const buildBidsForCurrentData = (): BidInfo[] => {
        const allBids: BidInfo[] = [];
        auctionData.forEach((auction: any) => {
          const selfSaleUnitId =
            auction.selfSaleUnitId != null && Number(auction.selfSaleUnitId) > 0
              ? Number(auction.selfSaleUnitId)
              : null;
          (auction.entries || []).forEach((entry: any) => {
            const entryBuyerMark = String(entry.buyerMark ?? entry.buyer_mark ?? '').trim();
            if (entryBuyerMark === '__M0_UNB__') return;
            const listMeta = lotIdMetaFromList.get(String(auction.lotId));
            let sellerName = auction.sellerName || 'Unknown';
            let vehicleNumber = auction.vehicleNumber || 'Unknown';
            const fromAuction = auction.commodityName ?? (auction as any).commodity_name ?? '';
            const commodityName = lotIdToCommodity.get(String(auction.lotId)) || fromAuction;
            let lotName = auction.lotName || '';
            let sellerSerial =
              positiveNumber(auction.sellerSerial ?? auction.seller_serial ?? auction.sellerSerialNo ?? auction.seller_serial_no) ??
              lotIdToSellerSerial.get(String(auction.lotId)) ??
              0;
            let lotNumber =
              positiveNumber(auction.lotNumber ?? auction.lot_number ?? auction.lotSerialNo ?? auction.lot_serial_no) ??
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

            const rawEntryId =
              entry.auctionEntryId ??
              (entry as { auction_entry_id?: number | null }).auction_entry_id;
            const auctionEntryId =
              rawEntryId != null && Number.isFinite(Number(rawEntryId))
                ? Number(rawEntryId)
                : undefined;

            allBids.push({
              bidNumber: entry.bidNumber,
              buyerMark: entry.buyerMark,
              buyerName: entry.buyerName,
              quantity: entry.quantity,
              rate: entry.rate,
              lotId: String(auction.lotId),
              lotName,
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
            });
          });
        });

        const vehicleTotals = new Map<string, number>();
        const vehicleSellerTotals = new Map<string, number>();
        allBids.forEach(b => {
          const vKey = b.vehicleNumber || '';
          const vsKey = `${vKey}||${b.sellerName}`;
          vehicleTotals.set(vKey, (vehicleTotals.get(vKey) ?? 0) + b.quantity);
          vehicleSellerTotals.set(vsKey, (vehicleSellerTotals.get(vsKey) ?? 0) + b.quantity);
        });

        return allBids.map(b => {
          const vKey = b.vehicleNumber || '';
          const vsKey = `${vKey}||${b.sellerName}`;
          return {
            ...b,
            // Seller serial and lot serial must come from arrival/auction persisted serials only.
            sellerSerial: b.sellerSerial,
            lotNumber: b.lotNumber,
            vehicleTotalQty: b.auctionVehicleTotalQty ?? vehicleTotals.get(vKey) ?? b.quantity,
            sellerVehicleQty: b.auctionSellerTotalQty ?? vehicleSellerTotals.get(vsKey) ?? b.quantity,
          };
        });
      };

      const setCurrentBids = () => {
        const nextBids = buildBidsForCurrentData();
        if (cancelled) return;
        setBids(nextBids);
        setHydratedAuctionSignature(auctionDataSignature);

        const sellerNames = [...new Set(nextBids.map(b => b.sellerName).filter(Boolean))];
        const lotIds = [...new Set(nextBids.map(b => b.lotId).filter(Boolean))];
        const serialAllocationKey = `${sellerNames.join('\u0001')}::${lotIds.join('\u0001')}`;
        if ((sellerNames.length > 0 || lotIds.length > 0) && dailySerialAllocationKeyRef.current !== serialAllocationKey) {
          dailySerialAllocationKeyRef.current = serialAllocationKey;
          void logisticsApi.allocateDailySerials({ sellerNames, lotIds }).catch(() => {
            // Serial allocation is persisted server-side for compatibility; persisted arrival serials drive this UI.
          });
        }
      };

      setCurrentBids();

      if (vehicleIdsToFetch.size === 0) return;

      await Promise.all(
        [...vehicleIdsToFetch].map(async (vehicleId) => {
          let full = arrivalFullDetailsByVehicleIdRef.current.get(vehicleId);
          if (!full) {
            try {
              full = await arrivalsApi.getById(vehicleId);
              arrivalFullDetailsByVehicleIdRef.current.set(vehicleId, full);
            } catch {
              return;
            }
          }
          (full.sellers || []).forEach((seller) => {
            (seller.lots || []).forEach((lot) => {
              const name = (lot as any).commodityName ?? (lot as any).commodity_name ?? '';
              if (name) lotIdToCommodity.set(String(lot.id), name);
              const sellerSerial = (seller as any).sellerSerialNumber ?? (seller as any).seller_serial_number;
              if (sellerSerial != null && sellerSerial > 0) {
                lotIdToSellerSerial.set(String(lot.id), sellerSerial);
              }
              const lotSerial = (lot as any).lotSerialNumber ?? (lot as any).lot_serial_number;
              if (lotSerial != null && lotSerial > 0) {
                lotIdToLotSerial.set(String(lot.id), lotSerial);
              }
            });
          });
        })
      );

      if (cancelled) return;
      setCurrentBids();
    })().catch(() => {
      if (!cancelled) {
        setHydratedAuctionSignature(auctionDataSignature);
      }
    });

    return () => { cancelled = true; };
  }, [auctionData, auctionDataSignature, arrivalDetails]);

  const filteredBids = useMemo(() => {
    if (!searchQuery) return bids;
    const q = searchQuery.toLowerCase();
    return bids.filter(b =>
      b.buyerMark.toLowerCase().includes(q) ||
      b.buyerName.toLowerCase().includes(q) ||
      b.sellerName.toLowerCase().includes(q) ||
      b.lotName.toLowerCase().includes(q) ||
      b.vehicleNumber.toLowerCase().includes(q) ||
      String(b.bidNumber).includes(q) ||
      formatLotIdentifierForBid(b).toLowerCase().includes(q)
    );
  }, [bids, searchQuery]);

  const lotRowVirtualizer = useWindowVirtualizer({
    count: filterMode === 'LOT' ? filteredBids.length : 0,
    estimateSize: () => 96,
    overscan: 10,
    measureElement,
    getItemKey: (index) => {
      const bid = filteredBids[index];
      return bid ? bidListKey(bid, index) : String(index);
    },
  });

  const buyerGroups = useMemo(() => {
    const byBuyer = new Map<string, BidInfo[]>();
    filteredBids.forEach(b => {
      const key = b.buyerMark || b.buyerName || '';
      const list = byBuyer.get(key) ?? [];
      list.push(b);
      byBuyer.set(key, list);
    });
    const rows = Array.from(byBuyer.entries()).map(([mark, list]) => ({
      buyerMark: mark,
      buyerName: list[0]?.buyerName ?? mark,
      bids: list,
      totalQty: list.reduce((s, b) => s + b.quantity, 0),
      totalAmount: list.reduce((s, b) => s + b.quantity * b.rate, 0),
    }));
    rows.sort((a, b) =>
      (a.buyerMark || '').localeCompare(b.buyerMark || '', undefined, { sensitivity: 'base' }),
    );
    return rows;
  }, [filteredBids]);

  const buyerGroupVirtualizer = useWindowVirtualizer({
    count: filterMode === 'BUYER' ? buyerGroups.length : 0,
    estimateSize: (index) =>
      estimateBuyerGroupSize(
        buyerGroups[index],
        buyerChittiCollapsed.has(buyerGroups[index]?.buyerMark ?? ''),
        isDesktop,
      ),
    overscan: 4,
    measureElement,
    getItemKey: (index) => buyerGroups[index]?.buyerMark || String(index),
  });

  const prevBidKeysByBuyerRef = useRef<Record<string, string[]>>({});
  const [buyerChittiSelected, setBuyerChittiSelected] = useState<Record<string, Set<string>>>({});
  const [buyerChittiCollapsed, setBuyerChittiCollapsed] = useState<Set<string>>(() => new Set());
  const [buyerChittiPrintRateByMark, setBuyerChittiPrintRateByMark] = useState<Record<string, boolean>>({});
  const chittiPrintRateLabelBase = useId();
  const [chittiPreviewMark, setChittiPreviewMark] = useState<string | null>(null);

  useEffect(() => {
    setBuyerChittiSelected((prev) => {
      const out: Record<string, Set<string>> = { ...prev };
      for (const g of buyerGroups) {
        const { buyerMark: mark, bids: list } = g;
        const rowKeys = list.map((b, i) => buyerChittiRowKey(b, i));
        const prevKeys = prevBidKeysByBuyerRef.current[mark];
        prevBidKeysByBuyerRef.current[mark] = rowKeys;
        const prevSel = out[mark];
        if (!prevSel) {
          out[mark] = new Set(list.map((b, i) => buyerChittiRowKey(b, i)));
          continue;
        }
        const next = new Set<string>();
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          const rk = buyerChittiRowKey(b, i);
          const isNew = !prevKeys || !prevKeys.includes(rk);
          const wasSelected = prevSel.has(rk) || selectionSetHasBid(prevSel, b);

          if (isNew || wasSelected) {
            next.add(rk);
          }
        }
        out[mark] = next;
      }
      return out;
    });
  }, [buyerGroups]);

  useEffect(() => {
    setBuyerChittiPrintRateByMark((prev) => {
      const next = { ...prev };
      for (const g of buyerGroups) {
        if (!(g.buyerMark in next)) next[g.buyerMark] = true;
      }
      return next;
    });
  }, [buyerGroups]);

  const chittiPreviewGroup = useMemo(
    () =>
      chittiPreviewMark != null
        ? buyerGroups.find((x) => x.buyerMark === chittiPreviewMark) ?? null
        : null,
    [buyerGroups, chittiPreviewMark],
  );

  const chittiPreviewDraftBids = useMemo(() => {
    if (!chittiPreviewGroup) return [] as BidInfo[];
    const mark = chittiPreviewGroup.buyerMark;
    const selectedSet = buyerChittiSelected[mark] ?? new Set<string>();
    return chittiPreviewGroup.bids.filter((b, i) => {
      const rk = buyerChittiRowKey(b, i);
      return selectedSet.has(rk) || selectionSetHasBid(selectedSet, b);
    });
  }, [chittiPreviewGroup, buyerChittiSelected]);

  const chittiPreviewRateOn =
    chittiPreviewGroup != null && buyerChittiPrintRateByMark[chittiPreviewGroup.buyerMark] !== false;

  const chittiPreviewHeader = useMemo(
    () => (chittiPreviewGroup ? buyerChittiHeaderLines(chittiPreviewGroup) : null),
    [chittiPreviewGroup],
  );

  const toggleBuyerChittiExpand = useCallback((buyerMark: string) => {
    setBuyerChittiCollapsed((p) => {
      const n = new Set(p);
      if (n.has(buyerMark)) n.delete(buyerMark);
      else n.add(buyerMark);
      return n;
    });
  }, []);

  const selectAllBuyerBids = useCallback((g: (typeof buyerGroups)[number]) => {
    setBuyerChittiSelected((p) => ({
      ...p,
      [g.buyerMark]: new Set(g.bids.map((b, i) => buyerChittiRowKey(b, i))),
    }));
  }, []);

  const deselectAllBuyerBids = useCallback((g: (typeof buyerGroups)[number]) => {
    setBuyerChittiSelected((p) => ({
      ...p,
      [g.buyerMark]: new Set(),
    }));
  }, []);

  const setBidSelected = useCallback((buyerMark: string, b: BidInfo, rowIdx: number, on: boolean) => {
    const rk = buyerChittiRowKey(b, rowIdx);
    setBuyerChittiSelected((p) => {
      const cur = new Set(p[buyerMark] ?? []);
      if (on) cur.add(rk);
      else cur.delete(rk);
      return { ...p, [buyerMark]: cur };
    });
  }, []);

  const sellerGroups = useMemo(() => {
    const bySeller = new Map<string, { name: string; serial: number; bids: BidInfo[]; totalQty: number; totalAmount: number }>();
    filteredBids.forEach(b => {
      if (!bySeller.has(b.sellerName)) {
        bySeller.set(b.sellerName, { name: b.sellerName, serial: b.sellerSerial, bids: [], totalQty: 0, totalAmount: 0 });
      }
      const row = bySeller.get(b.sellerName)!;
      row.bids.push(b);
      row.totalQty += b.quantity;
      row.totalAmount += b.quantity * b.rate;
    });
    return Array.from(bySeller.values());
  }, [filteredBids]);

  const sellerGroupVirtualizer = useWindowVirtualizer({
    count: filterMode === 'SELLER' ? sellerGroups.length : 0,
    estimateSize: () => 84,
    overscan: 8,
    measureElement,
    getItemKey: (index) => sellerGroups[index]?.name || String(index),
  });

  useEffect(() => {
    buyerGroupVirtualizer.measure();
  }, [
    buyerChittiCollapsed,
    buyerChittiPrintRateByMark,
    filterMode,
    buyerGroups.length,
    buyerGroupVirtualizer,
  ]);

  useEffect(() => {
    sellerGroupVirtualizer.measure();
  }, [filterMode, sellerGroups.length, sellerGroupVirtualizer]);

  const buyerGroupVirtualItems = buyerGroupVirtualizer.getVirtualItems();
  const buyerGroupPaddingTop = virtualPaddingTop(buyerGroupVirtualItems);
  const buyerGroupPaddingBottom = virtualPaddingBottom(
    buyerGroupVirtualItems,
    buyerGroupVirtualizer.getTotalSize(),
  );
  const sellerGroupVirtualItems = sellerGroupVirtualizer.getVirtualItems();
  const sellerGroupPaddingTop = virtualPaddingTop(sellerGroupVirtualItems);
  const sellerGroupPaddingBottom = virtualPaddingBottom(
    sellerGroupVirtualItems,
    sellerGroupVirtualizer.getTotalSize(),
  );

  const uniqueLots = useMemo(() => new Set(bids.map(b => b.lotId)).size, [bids]);
  const uniqueBuyers = useMemo(() => new Set(bids.map(b => b.buyerMark || b.buyerName)).size, [bids]);
  const uniqueSellers = useMemo(() => new Set(bids.map(b => b.sellerName)).size, [bids]);

  const handlePrintSticker = async (bid: BidInfo) => {
    toast.info('🖨 Printing Sticker…');
    try {
      await printLogApi.create({
        reference_type: 'STICKER',
        reference_id: String(bid.lotNumber),
        print_type: 'STICKER',
        printed_at: new Date().toISOString(),
      });
    } catch {
      // backend optional
    }
    const ok = await directPrint(
      { html: generateSalesSticker(bid), thermalText: generateSalesStickerThermal(bid) },
      { mode: "auto" }
    );
    ok ? toast.success('Sticker sent to printer!') : toast.error('Printer not connected. Please check printer connection.');
  };

  const handleSavePrintBuyerChitti = async (g: { buyerMark: string; buyerName: string; bids: BidInfo[] }) => {
    const mark = g.buyerMark;
    const selectedSet = buyerChittiSelected[mark] ?? new Set<string>();
    const toPrint = g.bids.filter((b, i) => {
      const rk = buyerChittiRowKey(b, i);
      return selectedSet.has(rk);
    });
    if (toPrint.length === 0) {
      toast.error('Nothing to save: select lots to print.');
      return;
    }
    const printRate = buyerChittiPrintRateByMark[mark] !== false;
    toast.info('🖨 Printing Buyer Chiti…');
    const ok = await directPrint(
      {
        html: generateBuyerChiti(
          g.buyerName,
          g.buyerMark,
          toPrint,
          'post-auction',
          chitiPrintTraderName,
          printRate
        ),
        thermalText: generateBuyerChitiThermal(
          g.buyerName,
          g.buyerMark,
          toPrint,
          'post-auction',
          chitiPrintTraderName,
          printRate
        ),
      },
      { mode: 'auto' }
    );
    if (!ok) {
      toast.error('Printer not connected.');
      return;
    }
    const printedAt = new Date().toISOString();
    try {
      await printLogApi.create({
        reference_type: 'BUYER_CHITI',
        reference_id: g.buyerMark,
        print_type: 'BUYER_CHITI',
        printed_at: printedAt,
      });
    } catch {
      // optional
    }
    toast.success('Buyer Chitti saved and sent to printer.');
  };

  const handlePrintSellerChiti = async (g: { name: string; serial: number; bids: BidInfo[] }) => {
    toast.info('🖨 Printing Seller Chiti…');
    try {
      await printLogApi.create({
        reference_type: 'SELLER_CHITI',
        reference_id: g.name,
        print_type: 'SELLER_CHITI',
      });
    } catch {
      // optional
    }
    const ok = await directPrint(
      {
        html: generateSellerChiti(g.name, g.serial, g.bids, 'post-auction', chitiPrintTraderName),
        thermalText: generateSellerChitiThermal(g.name, g.serial, g.bids, 'post-auction', chitiPrintTraderName),
      },
      { mode: "auto" }
    );
    ok ? toast.success('Seller Chiti sent to printer!') : toast.error('Printer not connected.');
  };

  const handleBulkPrint = async (type: 'SALE_PAD' | 'TENDER_SLIP' | 'DISPATCH') => {
    toast.info(`Printing ${type.replace('_', ' ')}…`);
    try {
      await printLogApi.create({
        reference_type: type,
        reference_id: undefined,
        print_type: type,
      });
    } catch {
      // optional
    }
    const html =
      type === 'SALE_PAD'
        ? generateSalePadPrint(undefined, chitiPrintTraderName)
        : type === 'TENDER_SLIP'
          ? generateTenderSlip(chitiPrintTraderName)
          : generateDispatchControl(filteredBids);
    const ok = await directPrint(html, { mode: "system" });
    ok ? toast.success('Sent to printer!') : toast.error('Printer not connected.');
  };

  // ═══ BID LIST SCREEN ═══
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      {/* Mobile Header — client_origin layout */}
      {!isDesktop && (
        <div className="bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => navigate('/home')} aria-label="Go back"
                className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-6 h-6 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Printer className="w-5 h-5" /> Print Hub
                </h1>
                <p className="text-white/70 text-xs">Direct print · No preview</p>
              </div>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input aria-label="Search" placeholder="Search lot, buyer, seller, or 320/320/110-110…"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {FILTER_TABS.map(tab => (
                <button key={tab.key} onClick={() => setFilterMode(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all',
                    filterMode === tab.key ? 'bg-white text-emerald-700 shadow-sm' : 'bg-white/20 text-white/80'
                  )}>
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Desktop Toolbar — client_origin layout */}
      {isDesktop && (
        <div className="px-8 py-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-500" /> Print Hub
              </h2>
              <p className="text-sm text-muted-foreground">
                {bids.length} bids
                {auctionResultsLoadingMore || !auctionResultsComplete
                  ? auctionResultsTotal != null && auctionResultsTotal > 0
                    ? ` · Auction results ${auctionData.length} / ${auctionResultsTotal}`
                    : ' · Loading auction results…'
                  : ''}
                {!arrivalDetailsComplete ? ' · Arrival details loading…' : ''}
                {' · '}Direct print · No preview
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input aria-label="Search" placeholder="Search lot, buyer, seller, or 320/320/110-110…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50" />
              </div>
              <Button variant="outline" size="sm" onClick={() => handleBulkPrint('SALE_PAD')} className="text-xs">Sale Pad</Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkPrint('TENDER_SLIP')} className="text-xs">Tender Slip</Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkPrint('DISPATCH')} className="text-xs">Dispatch</Button>
            </div>
          </div>
          <div className="flex gap-2 mb-4">
            {FILTER_TABS.map(tab => (
              <button key={tab.key} onClick={() => setFilterMode(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border',
                  filterMode === tab.key ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                )}>
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className="text-[10px] font-normal opacity-70">— {tab.desc}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-emerald-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Lots</p>
              <p className="text-2xl font-black text-foreground">{uniqueLots}</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-blue-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Buyers</p>
              <p className="text-2xl font-black text-foreground">{uniqueBuyers}</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-violet-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Sellers</p>
              <p className="text-2xl font-black text-foreground">{uniqueSellers}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick action buttons on mobile — client_origin */}
      {!isDesktop && (
        <div className="px-4 mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          <button onClick={() => handleBulkPrint('SALE_PAD')}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-muted text-foreground text-[10px] font-bold border border-border">📋 Sale Pad</button>
          <button onClick={() => handleBulkPrint('TENDER_SLIP')}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-muted text-foreground text-[10px] font-bold border border-border">📄 Tender Slip</button>
          <button onClick={() => handleBulkPrint('DISPATCH')}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-muted text-foreground text-[10px] font-bold border border-border">🚛 Dispatch</button>
        </div>
      )}

      {!isDesktop && (!auctionResultsComplete || !arrivalDetailsComplete || bidsHydrating) && (bids.length > 0 || auctionResultsLoading || bidsHydrating) ? (
        <p className="px-4 mt-1 text-center text-[10px] text-muted-foreground">
          {!auctionResultsComplete
            ? auctionResultsTotal != null && auctionResultsTotal > 0
              ? `Auction results ${auctionData.length} / ${auctionResultsTotal}`
              : 'Loading auction results…'
            : null}
          {!auctionResultsComplete && (!arrivalDetailsComplete || bidsHydrating) ? ' · ' : ''}
          {!arrivalDetailsComplete || bidsHydrating ? 'Arrival details…' : null}
        </p>
      ) : null}

      <div className="px-4 mt-4 space-y-2">
        {bids.length === 0 ? (
          auctionResultsLoading || bidsHydrating ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Printer className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3 animate-pulse" />
              <p className="text-sm text-muted-foreground font-medium">Loading auction results…</p>
              {auctionResultsTotal != null && auctionResultsTotal > 0 ? (
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {auctionData.length} / {auctionResultsTotal} loaded
                </p>
              ) : null}
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Printer className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No completed bids yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Complete an auction first</p>
              <Button onClick={() => navigate('/auctions')} className="mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl">
                Go to Auctions
              </Button>
            </div>
          )
        ) : filterMode === 'LOT' ? (
          filteredBids.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No matching lots</p>
          ) : (
            <div
              className="w-full"
              style={{
                height: `${lotRowVirtualizer.getTotalSize()}px`,
                position: 'relative',
              }}
            >
              {lotRowVirtualizer.getVirtualItems().map((virtualRow) => {
                const bid = filteredBids[virtualRow.index];
                if (!bid) return null;
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={lotRowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="glass-card rounded-2xl p-3 overflow-hidden">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md flex-shrink-0">
                          <span className="text-white font-black text-[10px]">
                            {bid.vehicleTotalQty != null && bid.sellerVehicleQty != null
                              ? `${bid.vehicleTotalQty}/${bid.sellerVehicleQty}`
                              : `L${bid.lotNumber}`}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold text-foreground truncate">
                              {formatLotIdentifierForBid(bid)}
                            </p>
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold">
                              [{bid.buyerMark}]
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span>
                              S#{bid.sellerSerial} {bid.sellerName}
                            </span>
                            <span>•</span>
                            <span>{bid.quantity} bags</span>
                            <span>•</span>
                            <span>{bid.origin || bid.vehicleNumber}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePrintSticker(bid)}
                          className="px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-bold shadow-sm flex-shrink-0"
                        >
                          🖨 Sticker
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : filterMode === 'BUYER' ? (
          buyerGroups.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No matching buyers</p>
          ) : (
            <div className="w-full">
              {buyerGroupPaddingTop > 0 && (
                <div aria-hidden="true" style={{ height: `${buyerGroupPaddingTop}px` }} />
              )}
              {buyerGroupVirtualItems.map((virtualRow) => {
            const g = buyerGroups[virtualRow.index];
            if (!g) return null;
            const i = virtualRow.index;
            const selectedSet = buyerChittiSelected[g.buyerMark] ?? new Set<string>();
            const selectedCount = g.bids.filter((b, idx) => {
              const rk = buyerChittiRowKey(b, idx);
              return selectedSet.has(rk);
            }).length;
            const draftPreviewBids = g.bids.filter((b, idx) => {
              const rk = buyerChittiRowKey(b, idx);
              return selectedSet.has(rk);
            });
            const allRowKeys = g.bids.map((b, idx) => buyerChittiRowKey(b, idx));
            const allRowsSelected =
              allRowKeys.length > 0 && allRowKeys.every((rk) => selectedSet.has(rk));
            const noRowsSelected = allRowKeys.every((rk) => !selectedSet.has(rk));
            const headerSelectChecked: boolean | 'indeterminate' = allRowsSelected
              ? true
              : noRowsSelected
                ? false
                : 'indeterminate';
            const printRateOn = buyerChittiPrintRateByMark[g.buyerMark] !== false;
            const isExpanded = !buyerChittiCollapsed.has(g.buyerMark);
            const { primary: titlePrimary, secondary: titleMark } = buyerChittiHeaderLines(g);
            const printRateIdMd = `${chittiPrintRateLabelBase}-pr-${i}-md`;
            const printRateIdSm = `${chittiPrintRateLabelBase}-pr-${i}-sm`;
            const chittiListId = `buyer-chitti-list-${g.buyerMark || 'x'}`;
            return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={buyerGroupVirtualizer.measureElement}
              className="w-full pb-2"
            >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={reduceMotion ? undefined : logisticsRowRevealTransition(i)}
              className="glass-card rounded-2xl p-3 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => toggleBuyerChittiExpand(g.buyerMark)}
                  aria-expanded={isExpanded}
                  aria-controls={chittiListId}
                  className="p-2 -m-0.5 rounded-lg hover:bg-foreground/5 flex-shrink-0 touch-manipulation"
                >
                  <ChevronDown
                    className={cn('w-5 h-5 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate leading-snug">{titlePrimary}</p>
                  {titleMark != null && titleMark !== '' && (
                    <p className="text-xs text-muted-foreground font-semibold truncate leading-snug mt-0.5">[{titleMark}]</p>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                    <span>{g.bids.length} lots</span>
                    <span>•</span>
                    <span>{g.totalQty} bags</span>
                    <span>•</span>
                    <span>₹{g.totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div
                  id={chittiListId}
                  className="mt-3 pt-3 border-t border-border/40 space-y-3"
                >
                  <>
                      <div className="w-full space-y-2">
                        {/* Tablet/desktop: Print rate (left); Preview, Save & Print (right) */}
                        <div className="hidden md:flex md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2 md:w-full md:justify-between">
                          <div className="flex items-center gap-2 min-w-0 shrink-0">
                            <Label htmlFor={printRateIdMd} className="text-sm font-semibold text-foreground shrink-0">
                              Print rate
                            </Label>
                            <Switch
                              id={printRateIdMd}
                              checked={buyerChittiPrintRateByMark[g.buyerMark] !== false}
                              onCheckedChange={(on) => setBuyerChittiPrintRateByMark((p) => ({ ...p, [g.buyerMark]: on }))}
                              className="shrink-0"
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 min-w-0 shrink">
                            <button
                            type="button"
                            onClick={() => setChittiPreviewMark(g.buyerMark)}
                            className={cn(
                              BUYER_CHITTI_BULK_BTN_CLASS,
                              'h-8 shrink-0 justify-center inline-flex items-center gap-2 px-3',
                            )}
                            style={buyerChittiBulkBtnStyle}
                            title="Print preview"
                          >
                            <Eye className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                            Preview
                          </button>
                          <button
                            type="button"
                            className={cn(BUYER_CHITTI_BULK_BTN_CLASS, 'h-8 shrink-0 justify-center inline-flex items-center gap-2 px-3')}
                            style={buyerChittiBulkBtnStyle}
                            disabled={draftPreviewBids.length === 0}
                            onClick={() => void handleSavePrintBuyerChitti(g)}
                          >
                            <Save className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                            Save &amp; Print
                          </button>
                          </div>
                        </div>
                        {/* Mobile: Print rate */}
                        <div className="flex md:hidden items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <Label htmlFor={printRateIdSm} className="text-sm font-semibold text-foreground shrink-0">
                              Print rate
                            </Label>
                            <Switch
                              id={printRateIdSm}
                              checked={buyerChittiPrintRateByMark[g.buyerMark] !== false}
                              onCheckedChange={(on) => setBuyerChittiPrintRateByMark((p) => ({ ...p, [g.buyerMark]: on }))}
                              className="shrink-0"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] font-semibold text-muted-foreground">
                        {selectedCount}/{g.bids.length} lots selected
                      </p>

                      <section className="min-w-0 w-full rounded-xl border border-border/60 bg-background/40 p-2">
                        <div className="flex items-center justify-between gap-2 px-1 pb-2">
                          <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            Current lots
                          </h3>
                          <button
                            type="button"
                            onClick={() => setChittiPreviewMark(g.buyerMark)}
                            className={cn(
                              BUYER_CHITTI_BULK_BTN_CLASS,
                              'md:hidden h-8 shrink-0 inline-flex items-center justify-center gap-2 px-3',
                            )}
                            style={buyerChittiBulkBtnStyle}
                            title="Print preview"
                          >
                            <Eye className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                            Preview
                          </button>
                        </div>
                        <div className="hidden md:block min-w-0 pt-0.5">
                          {(() => {
                            const split = Math.ceil(g.bids.length / 2);
                            const leftBids = g.bids.slice(0, split);
                            const rightBids = g.bids.slice(split);
                            const dualColumn = rightBids.length > 0;

                            const sliceRowKeys = (slice: BidInfo[], indexOffset: number) =>
                              slice.map((b, localIdx) => buyerChittiRowKey(b, indexOffset + localIdx));

                            const sliceHeaderSelect = (slice: BidInfo[], indexOffset: number) => {
                              const keys = sliceRowKeys(slice, indexOffset);
                              const allSel = keys.length > 0 && keys.every((k) => selectedSet.has(k));
                              const noneSel = keys.every((k) => !selectedSet.has(k));
                              const checked: boolean | 'indeterminate' = allSel ? true : noneSel ? false : 'indeterminate';
                              return { keys, checked };
                            };

                            const setSliceSelection = (slice: BidInfo[], indexOffset: number, select: boolean) => {
                              const keys = sliceRowKeys(slice, indexOffset);
                              setBuyerChittiSelected((p) => {
                                const cur = new Set(p[g.buyerMark] ?? []);
                                if (select) keys.forEach((k) => cur.add(k));
                                else keys.forEach((k) => cur.delete(k));
                                return { ...p, [g.buyerMark]: cur };
                              });
                            };

                            const tableShell =
                              'min-w-0 overflow-hidden rounded-xl border border-[rgba(91,140,255,0.35)] shadow-[0_0_12px_rgba(91,140,255,0.2)] bg-background/30';

                            const renderChittiTable = (slice: BidInfo[], indexOffset: number) => {
                              const { keys: sliceKeys, checked: sliceHeaderChecked } = sliceHeaderSelect(
                                slice,
                                indexOffset,
                              );
                              return (
                                <div className={tableShell}>
                                  <div className="overflow-x-auto">
                                    <table className="w-full min-w-0 text-left text-[11px] border-collapse table-fixed">
                                      <colgroup>
                                        <col className="w-10" />
                                        <col />
                                        <col className="w-[4.5rem]" />
                                        {printRateOn ? <col className="w-[4.75rem]" /> : null}
                                        <col className="w-[3.5rem]" />
                                      </colgroup>
                                      <thead>
                                        <tr style={buyerChittiTableHeadStyle}>
                                          <th
                                            className={cn(
                                              CHITTI_TABLE_HEAD_CELL,
                                              'p-0 w-10 align-middle rounded-tl-xl',
                                            )}
                                          >
                                            <div className="flex h-9 w-full items-center justify-center">
                                              {sliceKeys.length > 0 ? (
                                                <Checkbox
                                                  checked={sliceHeaderChecked}
                                                  onCheckedChange={(c) => {
                                                    if (c === true) setSliceSelection(slice, indexOffset, true);
                                                    else setSliceSelection(slice, indexOffset, false);
                                                  }}
                                                  className="h-[18px] w-[18px] rounded-none border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-primary"
                                                  aria-label="Select or deselect all lots in this column"
                                                />
                                              ) : null}
                                            </div>
                                          </th>
                                          <th className={cn(CHITTI_TABLE_HEAD_CELL, 'whitespace-nowrap')}>Lot name</th>
                                          <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>
                                            Lot SL
                                          </th>
                                          {printRateOn && (
                                            <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>
                                              Rate
                                            </th>
                                          )}
                                          <th
                                            className={cn(
                                              CHITTI_TABLE_HEAD_CELL,
                                              '!text-center whitespace-nowrap rounded-tr-xl pr-4',
                                            )}
                                          >
                                            Qty
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {slice.map((b, i) => {
                                          const rowIdx = indexOffset + i;
                                          const rk = buyerChittiRowKey(b, rowIdx);
                                          const on = selectedSet.has(rk);
                                          return (
                                            <tr
                                              key={bidListKey(b, rowIdx)}
                                              className="border-b border-border/30 align-middle last:border-b-0"
                                            >
                                              <td className="p-0 align-middle w-10">
                                                <div className="flex h-9 w-full items-center justify-center">
                                                  <Checkbox
                                                    checked={on}
                                                    onCheckedChange={(c) =>
                                                      setBidSelected(g.buyerMark, b, rowIdx, c === true)
                                                    }
                                                    className="h-[18px] w-[18px] rounded-none border-foreground/30"
                                                    aria-label={`Select lot ${formatLotIdentifierForBid(b)}`}
                                                  />
                                                </div>
                                              </td>
                                              <td className="py-1.5 pr-2 min-w-0 max-w-[8rem] lg:max-w-none">
                                                <span className="font-semibold text-foreground break-words line-clamp-2">
                                                  {formatLotIdentifierForBid(b)}
                                                </span>
                                              </td>
                                              <td className="py-1.5 text-center whitespace-nowrap tabular-nums align-middle">
                                                {b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}
                                              </td>
                                              {printRateOn && (
                                                <td className="py-1.5 px-1 align-middle">
                                                  <div className="flex w-full justify-center">
                                                    <span className="inline-block min-w-[3.25rem] max-w-full text-right tabular-nums whitespace-nowrap">
                                                      ₹{b.rate}
                                                    </span>
                                                  </div>
                                                </td>
                                              )}
                                              <td className="py-1.5 pr-4 text-center tabular-nums align-middle whitespace-nowrap">
                                                {b.quantity}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            };
                            return (
                              <div className="w-full min-w-0">
                                <div
                                  className={cn(
                                    'grid min-w-0 gap-3 lg:gap-5 w-full',
                                    dualColumn ? 'grid-cols-2' : 'grid-cols-1',
                                  )}
                                >
                                  {renderChittiTable(leftBids, 0)}
                                  {dualColumn ? renderChittiTable(rightBids, split) : null}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <ul className="md:hidden space-y-2" role="list">
                            {allRowKeys.length > 0 && (
                              <li className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5 min-h-10">
                                <div className="flex h-9 w-10 shrink-0 items-center justify-center">
                                  <Checkbox
                                    checked={headerSelectChecked}
                                    onCheckedChange={(c) => {
                                      if (c === true) selectAllBuyerBids(g);
                                      else deselectAllBuyerBids(g);
                                    }}
                                    className="h-[18px] w-[18px] rounded-none"
                                    aria-label="Select or deselect all lots"
                                  />
                                </div>
                                <span className="text-[11px] font-semibold text-muted-foreground">All lots</span>
                              </li>
                            )}
                            {g.bids.map((b, rowIdx) => {
                              const rk = buyerChittiRowKey(b, rowIdx);
                              const on = selectedSet.has(rk);
                              return (
                                <li
                                  key={bidListKey(b, rowIdx)}
                                  className="rounded-xl border border-border/60 p-2.5"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-9 w-10 shrink-0 items-center justify-center">
                                      <Checkbox
                                        checked={on}
                                        onCheckedChange={(c) =>
                                          setBidSelected(g.buyerMark, b, rowIdx, c === true)
                                        }
                                        className="h-[18px] w-[18px] rounded-none"
                                        aria-label={`Select ${formatLotIdentifierForBid(b)}`}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-bold text-foreground break-words leading-snug">
                                        {formatLotIdentifierForBid(b)}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        SL {b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'} · {b.godown || '—'}
                                        {printRateOn ? ` · ₹${b.rate}` : ''} · Qty {b.quantity}
                                      </p>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                      </section>

                      <div className="flex md:hidden flex-row items-stretch justify-end gap-2 sm:gap-3 pt-1 w-full">
                        <button
                          type="button"
                          className={cn(
                            BUYER_CHITTI_BULK_BTN_CLASS,
                            'min-h-10 min-w-0 shrink-0 inline-flex items-center justify-center gap-2',
                          )}
                          style={buyerChittiBulkBtnStyle}
                          disabled={draftPreviewBids.length === 0}
                          onClick={() => void handleSavePrintBuyerChitti(g)}
                        >
                          <Save className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                          Save &amp; Print
                        </button>
                      </div>
                    </>
                </div>
              )}
            </motion.div>
            </div>
            );
              })}
              {buyerGroupPaddingBottom > 0 && (
                <div aria-hidden="true" style={{ height: `${buyerGroupPaddingBottom}px` }} />
              )}
            </div>
          )
        ) : (
          sellerGroups.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No matching sellers</p>
          ) : (
            <div className="w-full">
              {sellerGroupPaddingTop > 0 && (
                <div aria-hidden="true" style={{ height: `${sellerGroupPaddingTop}px` }} />
              )}
              {sellerGroupVirtualItems.map((virtualRow) => {
                const g = sellerGroups[virtualRow.index];
                if (!g) return null;
                const i = virtualRow.index;
                return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={sellerGroupVirtualizer.measureElement}
              className="w-full pb-2"
            >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={reduceMotion ? undefined : logisticsRowRevealTransition(i)}
              className="glass-card rounded-2xl p-3 overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md flex-shrink-0">
                  <span className="text-white font-black text-xs">S{g.serial}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{g.bids.length} lots</span>
                    <span>•</span>
                    <span>{g.totalQty} bags</span>
                    <span>•</span>
                    <span>₹{g.totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <button onClick={() => handlePrintSellerChiti(g)}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold shadow-sm flex-shrink-0">🖨 Chiti</button>
              </div>
            </motion.div>
            </div>
                );
              })}
              {sellerGroupPaddingBottom > 0 && (
                <div aria-hidden="true" style={{ height: `${sellerGroupPaddingBottom}px` }} />
              )}
            </div>
          )
        )}
      </div>


      <Dialog
        open={chittiPreviewMark != null}
        onOpenChange={(open) => {
          if (!open) setChittiPreviewMark(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[min(92dvh,720px)] flex flex-col gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
              Print preview
            </DialogTitle>
            <DialogDescription className="sr-only">
              Rows that will appear on the printed buyer chitti
            </DialogDescription>
            {chittiPreviewHeader ? (
              <p className="text-sm font-semibold text-foreground">
                {chittiPreviewHeader.primary}
                {chittiPreviewHeader.secondary != null && chittiPreviewHeader.secondary !== '' ? (
                  <span className="text-muted-foreground font-normal"> [{chittiPreviewHeader.secondary}]</span>
                ) : null}
              </p>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {chittiPreviewGroup ? (
              <div className="min-w-0">
                {(() => {
                  const bids = chittiPreviewDraftBids;
                  const mid = Math.ceil(bids.length / 2);
                  const leftPreview = bids.slice(0, mid);
                  const rightPreview = bids.slice(mid);
                  const previewDual = rightPreview.length > 0;
                  const colSpan = chittiPreviewRateOn ? 4 : 3;
                  const previewShell =
                    'min-w-0 overflow-hidden rounded-xl border border-[rgba(91,140,255,0.35)] shadow-[0_0_12px_rgba(91,140,255,0.2)] bg-background/30';

                  const renderPreviewSliceTable = (slice: BidInfo[], indexOffset: number) => (
                    <div className={previewShell}>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-0 border-collapse text-left text-[11px] table-fixed">
                          <thead>
                            <tr style={buyerChittiTableHeadStyle}>
                              <th className={cn(CHITTI_TABLE_HEAD_CELL, 'rounded-tl-xl whitespace-nowrap')}>
                                Lot name
                              </th>
                              <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>Lot SL</th>
                              {chittiPreviewRateOn && (
                                <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>Rate</th>
                              )}
                              <th
                                className={cn(
                                  CHITTI_TABLE_HEAD_CELL,
                                  '!text-center rounded-tr-xl whitespace-nowrap pr-4',
                                )}
                              >
                                Qty
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {slice.map((b, i) => {
                              const rowIdx = indexOffset + i;
                              return (
                                <tr
                                  key={bidListKey(b, rowIdx)}
                                  className="border-b border-border/30 last:border-b-0"
                                >
                                  <td className="py-2 pl-2 pr-2 min-w-0">
                                    <span className="font-semibold break-words line-clamp-2">
                                      {formatLotIdentifierForBid(b)}
                                    </span>
                                  </td>
                                  <td className="py-2 text-center tabular-nums whitespace-nowrap align-middle">
                                    {b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}
                                  </td>
                                  {chittiPreviewRateOn && (
                                    <td className="py-2 px-1 align-middle">
                                      <div className="flex w-full justify-center">
                                        <span className="inline-block min-w-[3.25rem] max-w-full text-right tabular-nums whitespace-nowrap">
                                          ₹{b.rate}
                                        </span>
                                      </div>
                                    </td>
                                  )}
                                  <td className="py-2 pr-4 text-center tabular-nums align-middle whitespace-nowrap">
                                    {b.quantity}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );

                  if (bids.length === 0) {
                    return (
                      <div className={previewShell}>
                        <table className="w-full border-collapse text-left text-[11px]">
                          <tbody>
                            <tr>
                              <td
                                colSpan={colSpan}
                                className="py-8 text-center text-muted-foreground text-sm"
                              >
                                Nothing selected.
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="hidden w-full min-w-0 md:block">
                        <div
                          className={cn(
                            'grid min-w-0 w-full gap-3 lg:gap-5',
                            previewDual ? 'grid-cols-2' : 'grid-cols-1',
                          )}
                        >
                          {renderPreviewSliceTable(leftPreview, 0)}
                          {previewDual ? renderPreviewSliceTable(rightPreview, mid) : null}
                        </div>
                      </div>
                      <div className="md:hidden">
                        <div className={previewShell}>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-0 border-collapse text-left text-[11px]">
                              <thead>
                                <tr style={buyerChittiTableHeadStyle}>
                                  <th className={cn(CHITTI_TABLE_HEAD_CELL, 'rounded-tl-xl whitespace-nowrap')}>
                                    Lot name
                                  </th>
                                  <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>
                                    Lot SL
                                  </th>
                                  {chittiPreviewRateOn && (
                                    <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>
                                      Rate
                                    </th>
                                  )}
                                  <th
                                    className={cn(
                                      CHITTI_TABLE_HEAD_CELL,
                                      '!text-center rounded-tr-xl whitespace-nowrap pr-4',
                                    )}
                                  >
                                    Qty
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {bids.map((b, rowIdx) => (
                                  <tr
                                    key={bidListKey(b, rowIdx)}
                                    className="border-b border-border/30 last:border-b-0"
                                  >
                                    <td className="py-2 pl-2 pr-2 min-w-0">
                                      <span className="font-semibold break-words">
                                        {formatLotIdentifierForBid(b)}
                                      </span>
                                    </td>
                                    <td className="py-2 text-center tabular-nums whitespace-nowrap align-middle">
                                      {b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}
                                    </td>
                                    {chittiPreviewRateOn && (
                                      <td className="py-2 px-1 align-middle">
                                        <div className="flex w-full justify-center">
                                          <span className="inline-block min-w-[3.25rem] max-w-full text-right tabular-nums whitespace-nowrap">
                                            ₹{b.rate}
                                          </span>
                                        </div>
                                      </td>
                                    )}
                                    <td className="py-2 pr-4 text-center tabular-nums align-middle whitespace-nowrap">
                                      {b.quantity}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to show.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default LogisticsPage;
