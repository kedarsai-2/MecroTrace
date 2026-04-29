import { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRightLeft,
  ChevronDown,
  Eye,
  Layers,
  Package,
  Printer,
  Save,
  Search,
  Trash2,
  Undo2,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useAuctionResults } from '@/hooks/useAuctionResults';
import { printLogApi, arrivalsApi, logisticsApi, auctionApi } from '@/services/api';
import type { AuctionBidUpdateRequest } from '@/services/api/auction';
import { usePermissions } from '@/lib/permissions';
import type { ArrivalDetail } from '@/services/api/arrivals';
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

/**
 * Migrate dialog selection: must NOT include search-result row index — changing the query reorderes
 * results and breaks `bidListKey(_, i)`. Use stable id only.
 */
const migratePoolStableKey = (b: BidInfo): string => {
  if (b.auctionEntryId != null && Number.isFinite(Number(b.auctionEntryId))) {
    return `ae:${b.auctionEntryId}`;
  }
  return bidKey(b);
};

/**
 * Reserved Print Hub "pool" (server auction entry buyer fields).
 * Bids with this mark are unassigned; visible to all users with auction results.
 */
const LOGISTICS_UNASSIGNED_BUYER_MARK = '__M0_UNB__';
const LOGISTICS_UNASSIGNED_BUYER_NAME = 'Unassigned';

const isLogisticsUnassignedBid = (b: BidInfo): boolean =>
  (b.buyerMark || '').trim() === LOGISTICS_UNASSIGNED_BUYER_MARK;

/** Lines for buyer Chitti card: name+mark when distinct; mark-only for temp/duplicate. */
const buyerChittiHeaderLines = (g: { buyerName: string; buyerMark: string }): { primary: string; secondary?: string } => {
  const name = (g.buyerName || '').trim();
  const mark = (g.buyerMark || '').trim();
  if (mark === LOGISTICS_UNASSIGNED_BUYER_MARK) {
    return { primary: 'Unassigned (pool)' };
  }
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

const chittiRedoBtnClass =
  'inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground hover:bg-muted transition-colors touch-manipulation shrink-0 md:h-7 md:w-7 md:min-h-7 md:min-w-7';

const chittiDeleteIconBtnClass =
  'inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-destructive/10 border border-destructive/15 text-destructive hover:bg-destructive/20 active:opacity-90 transition-colors touch-manipulation shrink-0 md:h-7 md:w-7 md:min-h-7 md:min-w-7';

/**
 * Per-bid buyer Chitti completion (server `print_log.reference_id` = `lotId:bidNumber`).
 * Cleared server-side when bid buyer changes (migrate / pool), so reassigned lines can print again.
 */
const BUYER_CHITI_BID_REF_TYPE = 'BUYER_CHITI_BID';

type FilterMode = 'LOT' | 'BUYER' | 'SELLER';

const FILTER_TABS: { key: FilterMode; label: string; icon: typeof Layers; desc: string }[] = [
  { key: 'BUYER', label: 'Buyer', icon: User, desc: 'Consolidated chiti for buyer' },
  { key: 'SELLER', label: 'Seller', icon: Package, desc: 'Chiti for seller lots' },
  { key: 'LOT', label: 'Lot', icon: Layers, desc: 'Sales sticker per lot' },
];

const LogisticsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { trader, user } = useAuth();
  const [bids, setBids] = useState<BidInfo[]>([]);
  const [printedBidKeys, setPrintedBidKeys] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('BUYER');

  const chitiPrintTraderName = useMemo(
    () => trader?.business_name?.trim() || user?.name?.trim() || 'Trader',
    [trader?.business_name, user?.name]
  );

  const { auctionResults: auctionData, refetch: refetchAuctions } = useAuctionResults();
  const { can } = usePermissions();
  const canEditAuctionBids = can('Auctions / Sales', 'Edit');
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);

  useEffect(() => {
    arrivalsApi.listDetail(0, 500).then(setArrivalDetails).catch(() => setArrivalDetails([]));
  }, []);

  // REQ-LOG-004: Load bids from completed auctions; enrich with origin/godown/commodity from arrival full detail; daily serials from API
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Root-cause fix:
      // Mapping by vehicle number was missing for some records, so seller/lot serial and godown stayed empty.
      // Build linkage from lotId -> arrival vehicleId first, then fetch full arrivals by vehicleId.
      const auctionLotIds = new Set<string>();
      auctionData.forEach((auction: any) => {
        if (auction?.lotId != null) auctionLotIds.add(String(auction.lotId));
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
            vehicleIdsToFetch.add(arr.vehicleId);
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
      await Promise.all(
        [...vehicleIdsToFetch].map(async (vehicleId) => {
          try {
            const full = await arrivalsApi.getById(vehicleId);
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
          } catch {
            // ignore per-vehicle errors
          }
        })
      );

      if (cancelled) return;

      const allBids: BidInfo[] = [];
      auctionData.forEach((auction: any) => {
        const selfSaleUnitId =
          auction.selfSaleUnitId != null && Number(auction.selfSaleUnitId) > 0
            ? Number(auction.selfSaleUnitId)
            : null;
        (auction.entries || []).forEach((entry: any) => {
          const listMeta = lotIdMetaFromList.get(String(auction.lotId));
          let sellerName = auction.sellerName || 'Unknown';
          let vehicleNumber = auction.vehicleNumber || 'Unknown';
          const fromAuction = auction.commodityName ?? (auction as any).commodity_name ?? '';
          const commodityName = lotIdToCommodity.get(String(auction.lotId)) || fromAuction;
          let lotName = auction.lotName || '';
          let sellerSerial = lotIdToSellerSerial.get(String(auction.lotId)) ?? 0;
          let lotNumber = lotIdToLotSerial.get(String(auction.lotId)) ?? 0;
          let origin: string | undefined;
          let godown: string | undefined;
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
            origin = listMeta.origin;
            godown = listMeta.godown;
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

      if (cancelled) return;

      // REQ-LOG: Compute vehicle total qty / seller qty per vehicle (lot identifier)
    const vehicleTotals = new Map<string, number>();
    const vehicleSellerTotals = new Map<string, number>();
    allBids.forEach(b => {
      const vKey = b.vehicleNumber || '';
      const vsKey = `${vKey}||${b.sellerName}`;
      vehicleTotals.set(vKey, (vehicleTotals.get(vKey) ?? 0) + b.quantity);
      vehicleSellerTotals.set(vsKey, (vehicleSellerTotals.get(vsKey) ?? 0) + b.quantity);
    });

    const sellerNames = [...new Set(allBids.map(b => b.sellerName).filter(Boolean))];
    const lotIds = [...new Set(allBids.map(b => b.lotId).filter(Boolean))];
    if (sellerNames.length === 0 && lotIds.length === 0) {
      const withQty = allBids.map(b => {
        const vKey = b.vehicleNumber || '';
        const vsKey = `${vKey}||${b.sellerName}`;
        return {
          ...b,
          vehicleTotalQty: b.auctionVehicleTotalQty ?? vehicleTotals.get(vKey) ?? b.quantity,
          sellerVehicleQty: b.auctionSellerTotalQty ?? vehicleSellerTotals.get(vsKey) ?? b.quantity,
        };
      });
      if (!cancelled) setBids(withQty);
      return;
    }
    logisticsApi.allocateDailySerials({ sellerNames, lotIds })
      .then((res) => {
        if (cancelled) return;
        const withSerials = allBids.map(b => ({
          ...b,
          // Seller serial must come from arrival auto-generated serial only.
          sellerSerial: b.sellerSerial,
          // Lot serial must come from arrival auto-generated serial only.
          lotNumber: b.lotNumber,
          vehicleTotalQty: b.auctionVehicleTotalQty ?? vehicleTotals.get(b.vehicleNumber || '') ?? b.quantity,
          sellerVehicleQty: b.auctionSellerTotalQty ?? vehicleSellerTotals.get(`${b.vehicleNumber || ''}||${b.sellerName}`) ?? b.quantity,
        }));
        setBids(withSerials);
      })
      .catch(() => {
        if (cancelled) return;
        const withQtyFallback = allBids.map(b => {
          const vKey = b.vehicleNumber || '';
          const vsKey = `${vKey}||${b.sellerName}`;
          return {
            ...b,
            vehicleTotalQty: b.auctionVehicleTotalQty ?? vehicleTotals.get(vKey) ?? b.quantity,
            sellerVehicleQty: b.auctionSellerTotalQty ?? vehicleSellerTotals.get(vsKey) ?? b.quantity,
          };
        });
        setBids(withQtyFallback);
      });
    })();

    return () => { cancelled = true; };
  }, [auctionData, arrivalDetails]);

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

  const lotList = useMemo(() => filteredBids, [filteredBids]);

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
    }));
    rows.sort((a, b) => {
      const aU = a.buyerMark === LOGISTICS_UNASSIGNED_BUYER_MARK ? 0 : 1;
      const bU = b.buyerMark === LOGISTICS_UNASSIGNED_BUYER_MARK ? 0 : 1;
      if (aU !== bU) return aU - bU;
      return (a.buyerMark || '').localeCompare(b.buyerMark || '', undefined, { sensitivity: 'base' });
    });
    return rows;
  }, [filteredBids]);

  /** Full list (ignore hub search filter) so migrate stays usable while searching other buyers/lots. */
  const unassignedPoolBids = useMemo(
    () => bids.filter((b) => isLogisticsUnassignedBid(b)),
    [bids]
  );

  const loadPrintedBidKeysFromServer = useCallback(async () => {
    try {
      const ids = await printLogApi.listReferenceIds(BUYER_CHITI_BID_REF_TYPE);
      setPrintedBidKeys(
        new Set((ids as string[]).filter((x) => typeof x === 'string' && x.length > 0))
      );
    } catch {
      // keep current set; user may lack PRINT_LOGS_VIEW
    }
  }, []);

  useEffect(() => {
    void loadPrintedBidKeysFromServer();
  }, [loadPrintedBidKeysFromServer, bids.length]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadPrintedBidKeysFromServer();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadPrintedBidKeysFromServer]);

  const prevBidKeysByBuyerRef = useRef<Record<string, string[]>>({});
  const [buyerChittiSelected, setBuyerChittiSelected] = useState<Record<string, Set<string>>>({});
  const [buyerChittiCollapsed, setBuyerChittiCollapsed] = useState<Set<string>>(() => new Set());
  const [buyerChittiPrintRateByMark, setBuyerChittiPrintRateByMark] = useState<Record<string, boolean>>({});
  const chittiPrintRateLabelBase = useId();

  /** Staged removals: moved to Unassigned on “Save & print chitti”, not immediately. */
  const [pendingRemoveByMark, setPendingRemoveByMark] = useState<Record<string, Set<string>>>({});
  const [stagingRemove, setStagingRemove] = useState<{ buyerMark: string; bid: BidInfo } | null>(null);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [chittiPreviewMark, setChittiPreviewMark] = useState<string | null>(null);
  const [migrateTarget, setMigrateTarget] = useState<{ buyerName: string; buyerMark: string } | null>(null);
  const [migrateSearch, setMigrateSearch] = useState('');
  const [migrateSelectedKeys, setMigrateSelectedKeys] = useState<Set<string>>(() => new Set());
  const [migrateBusy, setMigrateBusy] = useState(false);

  const reassignBidBuyer = useCallback(
    async (b: BidInfo, buyerName: string, buyerMark: string) => {
      if (b.auctionEntryId == null) {
        throw new Error('This bid has no server id. Refresh the page.');
      }
      const body: AuctionBidUpdateRequest = {
        billing_reassign_buyer: true,
        buyer_name: buyerName,
        buyer_mark: buyerMark,
        buyer_id: null,
      };
      if (b.selfSaleUnitId) {
        await auctionApi.updateSelfSaleBid(b.selfSaleUnitId, b.auctionEntryId, body);
      } else {
        await auctionApi.updateBid(b.lotId, b.auctionEntryId, body);
      }
    },
    []
  );

  /** Search-only: no list until user types (lot id, seller, vehicle, etc.). */
  const migrateSearchResults = useMemo(() => {
    const q = migrateSearch.trim();
    if (!q) return [] as BidInfo[];
    const ql = q.toLowerCase();
    return unassignedPoolBids.filter(
      (b) =>
        formatLotIdentifierForBid(b).toLowerCase().includes(ql) ||
        b.sellerName.toLowerCase().includes(ql) ||
        (b.vehicleNumber || '').toLowerCase().includes(ql) ||
        (b.lotName || '').toLowerCase().includes(ql) ||
        b.lotId.toLowerCase().includes(ql) ||
        String(b.bidNumber).includes(q) ||
        (b.commodityName || '').toLowerCase().includes(ql),
    );
  }, [unassignedPoolBids, migrateSearch]);

  const confirmStageRemoveFromChitti = useCallback(() => {
    if (!stagingRemove || !canEditAuctionBids) {
      setStagingRemove(null);
      return;
    }
    const { buyerMark, bid } = stagingRemove;
    if (bid.auctionEntryId == null) {
      toast.error('This bid has no server id. Refresh the page.');
      setStagingRemove(null);
      return;
    }
    if (isLogisticsUnassignedBid(bid)) {
      setStagingRemove(null);
      return;
    }
    const k = bidKey(bid);
    setPendingRemoveByMark((p) => {
      const cur = new Set(p[buyerMark] ?? []);
      cur.add(k);
      return { ...p, [buyerMark]: cur };
    });
    setBuyerChittiSelected((p) => {
      const sel = new Set(p[buyerMark] ?? []);
      sel.delete(k);
      return { ...p, [buyerMark]: sel };
    });
    setStagingRemove(null);
    toast.message('Staged for removal', {
      description: 'Moves to Unassigned when you tap Save & Print.',
    });
  }, [stagingRemove, canEditAuctionBids]);

  const runMigrateFromPool = useCallback(async () => {
    if (!migrateTarget || migrateSelectedKeys.size === 0) return;
    if (!canEditAuctionBids) {
      toast.error('You do not have permission to reassign bids.');
      return;
    }
    setMigrateBusy(true);
    try {
      let reassigned = 0;
      for (const k of migrateSelectedKeys) {
        const b = unassignedPoolBids.find((x) => migratePoolStableKey(x) === k);
        if (b && b.auctionEntryId != null) {
          await reassignBidBuyer(b, migrateTarget.buyerName, migrateTarget.buyerMark);
          reassigned += 1;
        }
      }
      if (reassigned === 0) {
        toast.error('No bids matched your selection. Change search or refresh, then try again.');
        return;
      }
      await refetchAuctions();
      await loadPrintedBidKeysFromServer();
      setMigrateOpen(false);
      setMigrateTarget(null);
      setMigrateSearch('');
      setMigrateSelectedKeys(new Set());
      toast.success(
        reassigned === migrateSelectedKeys.size
          ? 'Bids assigned to this buyer.'
          : `Assigned ${reassigned} bid(s); some selections could not be matched (refresh if needed).`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not assign bids');
    } finally {
      setMigrateBusy(false);
    }
  }, [
    migrateTarget,
    migrateSelectedKeys,
    canEditAuctionBids,
    unassignedPoolBids,
    reassignBidBuyer,
    refetchAuctions,
    loadPrintedBidKeysFromServer,
  ]);

  useEffect(() => {
    setBuyerChittiSelected((prev) => {
      const out: Record<string, Set<string>> = { ...prev };
      for (const g of buyerGroups) {
        const { buyerMark: mark, bids: list } = g;
        const keys = list.map(bidKey);
        const prevKeys = prevBidKeysByBuyerRef.current[mark];
        prevBidKeysByBuyerRef.current[mark] = keys;
        const prevSel = out[mark];
        if (!prevSel) {
          out[mark] = new Set(keys.filter((k) => !printedBidKeys.has(k)));
          continue;
        }
        const next = new Set<string>();
        for (const k of keys) {
          if (printedBidKeys.has(k)) continue;
          const isNew = !prevKeys || !prevKeys.includes(k);
          if (isNew) next.add(k);
          else if (prevSel.has(k)) next.add(k);
        }
        out[mark] = next;
      }
      return out;
    });
  }, [buyerGroups, printedBidKeys]);

  useEffect(() => {
    setPendingRemoveByMark((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const g of buyerGroups) {
        const set = next[g.buyerMark];
        if (!set || set.size === 0) continue;
        const validKeys = new Set(g.bids.map(bidKey));
        const filtered = new Set([...set].filter((k) => validKeys.has(k)));
        if (filtered.size !== set.size) {
          next[g.buyerMark] = filtered;
          changed = true;
        }
      }
      return changed ? next : prev;
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
    const pendingSet = pendingRemoveByMark[mark] ?? new Set<string>();
    return chittiPreviewGroup.bids.filter((b) => {
      const k = bidKey(b);
      return selectedSet.has(k) && !pendingSet.has(k) && !printedBidKeys.has(k);
    });
  }, [chittiPreviewGroup, buyerChittiSelected, pendingRemoveByMark, printedBidKeys]);

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
      [g.buyerMark]: new Set(
        g.bids.filter((b) => !printedBidKeys.has(bidKey(b))).map(bidKey)
      ),
    }));
  }, [printedBidKeys]);

  const deselectAllBuyerBids = useCallback((g: (typeof buyerGroups)[number]) => {
    setBuyerChittiSelected((p) => ({
      ...p,
      [g.buyerMark]: new Set(),
    }));
  }, []);

  const setBidSelected = useCallback(
    (buyerMark: string, k: string, on: boolean) => {
      if (printedBidKeys.has(k)) return;
      setBuyerChittiSelected((p) => {
        const cur = new Set(p[buyerMark] ?? []);
        if (on) cur.add(k);
        else cur.delete(k);
        return { ...p, [buyerMark]: cur };
      });
    },
    [printedBidKeys]
  );

  const sellerGroups = useMemo(() => {
    const bySeller = new Map<string, { name: string; serial: number; bids: BidInfo[] }>();
    filteredBids.forEach(b => {
      if (!bySeller.has(b.sellerName)) bySeller.set(b.sellerName, { name: b.sellerName, serial: b.sellerSerial, bids: [] });
      bySeller.get(b.sellerName)!.bids.push(b);
    });
    return Array.from(bySeller.values());
  }, [filteredBids]);

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
    const pending = pendingRemoveByMark[mark] ?? new Set<string>();
    const toPrint = g.bids.filter((b) => {
      const k = bidKey(b);
      return selectedSet.has(k) && !pending.has(k) && !printedBidKeys.has(k);
    });
    if (toPrint.length === 0 && pending.size === 0) {
      toast.error('Nothing to save: select lots to print and/or stage removals.');
      return;
    }
    if (!canEditAuctionBids && pending.size > 0) {
      toast.error('You do not have permission to move bids to the Unassigned pool.');
      return;
    }
    if (pending.size > 0) {
      for (const k of pending) {
        const b = g.bids.find((x) => bidKey(x) === k);
        if (!b || b.auctionEntryId == null) {
          toast.error('Staged bid missing server id. Refresh and try again.');
          return;
        }
      }
    }
    const printRate = buyerChittiPrintRateByMark[mark] !== false;
    if (toPrint.length > 0) {
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
        toast.error('Printer not connected. Staged removals were not applied.');
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
      try {
        await Promise.all(
          toPrint.map((b) =>
            printLogApi.create({
              reference_type: BUYER_CHITI_BID_REF_TYPE,
              reference_id: bidKey(b),
              print_type: 'BUYER_CHITI',
              printed_at: printedAt,
            })
          )
        );
      } catch {
        toast.warning('Chitti printed; some server log entries may be missing. List will refresh.');
      }
    }
    if (pending.size > 0 && canEditAuctionBids) {
      try {
        for (const k of pending) {
          const b = g.bids.find((x) => bidKey(x) === k);
          if (b && b.auctionEntryId != null) {
            await reassignBidBuyer(b, LOGISTICS_UNASSIGNED_BUYER_NAME, LOGISTICS_UNASSIGNED_BUYER_MARK);
          }
        }
        await refetchAuctions();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Print succeeded but pool move failed. Check auctions.');
        await loadPrintedBidKeysFromServer();
        return;
      }
    } else if (toPrint.length > 0) {
      await refetchAuctions().catch(() => {});
    }
    setPendingRemoveByMark((p) => ({ ...p, [mark]: new Set() }));
    await loadPrintedBidKeysFromServer();
    if (toPrint.length > 0 && pending.size > 0) {
      toast.success('Chitti printed and staged bids moved to Unassigned.');
    } else if (toPrint.length > 0) {
      toast.success('Buyer Chitti saved and sent to printer.');
    } else {
      toast.success('Staged bids moved to Unassigned (nothing new to print).');
    }
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
              <p className="text-sm text-muted-foreground">{bids.length} bids · Direct print · No preview</p>
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

      <div className="px-4 mt-4 space-y-2">
        {bids.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Printer className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No completed bids yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Complete an auction first</p>
            <Button onClick={() => navigate('/auctions')} className="mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl">
              Go to Auctions
            </Button>
          </div>
        ) : filterMode === 'LOT' ? (
          lotList.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No matching lots</p>
          ) : lotList.map((bid, i) => (
            <motion.div key={`${bid.lotNumber}-${i}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass-card rounded-2xl p-3 overflow-hidden">
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
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold">[{bid.buyerMark}]</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>S#{bid.sellerSerial} {bid.sellerName}</span>
                    <span>•</span>
                    <span>{bid.quantity} bags</span>
                    <span>•</span>
                    <span>{bid.origin || bid.vehicleNumber}</span>
                  </div>
                </div>
                <button onClick={() => handlePrintSticker(bid)}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-bold shadow-sm flex-shrink-0">🖨 Sticker</button>
              </div>
            </motion.div>
          ))
        ) : filterMode === 'BUYER' ? (
          buyerGroups.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No matching buyers</p>
          ) : buyerGroups.map((g, i) => {
            const selectedSet = buyerChittiSelected[g.buyerMark] ?? new Set<string>();
            const unprintedBids = g.bids.filter((b) => !printedBidKeys.has(bidKey(b)));
            const selectedUnprinted = unprintedBids.filter((b) => selectedSet.has(bidKey(b)));
            const pendingSet = pendingRemoveByMark[g.buyerMark] ?? new Set<string>();
            const draftPreviewBids = g.bids.filter((b) => {
              const k = bidKey(b);
              return selectedSet.has(k) && !pendingSet.has(k) && !printedBidKeys.has(k);
            });
            const unprintedKeys = unprintedBids.map(bidKey);
            const allUnprintedSelected =
              unprintedKeys.length > 0 && unprintedKeys.every((k) => selectedSet.has(k));
            const noUnprintedSelected = unprintedKeys.every((k) => !selectedSet.has(k));
            const headerSelectChecked: boolean | 'indeterminate' = allUnprintedSelected
              ? true
              : noUnprintedSelected
                ? false
                : 'indeterminate';
            const printRateOn = buyerChittiPrintRateByMark[g.buyerMark] !== false;
            const isExpanded = !buyerChittiCollapsed.has(g.buyerMark);
            const { primary: titlePrimary, secondary: titleMark } = buyerChittiHeaderLines(g);
            const printRateId = `${chittiPrintRateLabelBase}-pr-${i}`;
            const isUnassignedGroup = g.buyerMark === LOGISTICS_UNASSIGNED_BUYER_MARK;
            const chittiListId = `buyer-chitti-list-${g.buyerMark || 'x'}`;
            return (
            <motion.div key={g.buyerMark}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
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
                    <span>{g.bids.reduce((s, b) => s + b.quantity, 0)} bags</span>
                    <span>•</span>
                    <span>₹{g.bids.reduce((s, b) => s + b.quantity * b.rate, 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div
                  id={chittiListId}
                  className="mt-3 pt-3 border-t border-border/40 space-y-3"
                >
                  {isUnassignedGroup ? null : (
                    <>
                      <div className="w-full">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <Label htmlFor={printRateId} className="text-sm font-semibold text-foreground shrink-0">
                              Print rate
                            </Label>
                            <Switch
                              id={printRateId}
                              checked={buyerChittiPrintRateByMark[g.buyerMark] !== false}
                              onCheckedChange={(on) => setBuyerChittiPrintRateByMark((p) => ({ ...p, [g.buyerMark]: on }))}
                              className="shrink-0"
                            />
                          </div>
                          {canEditAuctionBids && (
                            <button
                              type="button"
                              className={cn(BUYER_CHITTI_BULK_BTN_CLASS, 'h-8 shrink-0 max-w-full sm:max-w-[min(100%,16rem)] justify-center inline-flex items-center gap-1.5')}
                              style={buyerChittiBulkBtnStyle}
                              title="Add lots from unassigned pool"
                              onClick={() => {
                                setMigrateTarget({ buyerName: g.buyerName, buyerMark: g.buyerMark });
                                setMigrateSearch('');
                                setMigrateSelectedKeys(new Set());
                                setMigrateOpen(true);
                              }}
                            >
                              <Search className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} aria-hidden />
                              <ArrowRightLeft className="w-3.5 h-3.5 shrink-0 opacity-95" aria-hidden />
                              <span className="truncate">Search &amp; migrate</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] font-semibold text-muted-foreground">
                        {selectedUnprinted.length}/{unprintedBids.length} selected
                        {pendingSet.size > 0 ? ` · ${pendingSet.size} staged` : ''}
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
                              chittiRedoBtnClass,
                              'h-8 w-8 min-h-8 min-w-8 md:h-8 md:w-8 md:min-h-8 md:min-w-8 rounded-lg border-[rgba(91,140,255,0.4)] text-primary hover:bg-primary/10',
                            )}
                            aria-label="Print preview"
                            title="Print preview"
                          >
                            <Eye className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                          </button>
                        </div>
                        <div className="hidden md:block overflow-hidden rounded-xl border border-[rgba(91,140,255,0.35)] shadow-[0_0_12px_rgba(91,140,255,0.2)]">
                          <table className="w-full text-left text-[11px] border-collapse table-fixed">
                            <colgroup>
                              <col className="w-10" />
                              <col />
                              <col className="w-[4.5rem]" />
                              {printRateOn ? <col className="w-[4.75rem]" /> : null}
                              <col className="w-[3.5rem]" />
                              <col className="min-w-[3.25rem] w-16" />
                            </colgroup>
                            <thead>
                              <tr style={buyerChittiTableHeadStyle}>
                                <th className={cn(CHITTI_TABLE_HEAD_CELL, 'p-0 rounded-tl-xl w-10 align-middle')}>
                                  <div className="flex h-9 w-full items-center justify-center">
                                    {unprintedKeys.length > 0 ? (
                                      <Checkbox
                                        checked={headerSelectChecked}
                                        onCheckedChange={(c) => {
                                          if (c === true) selectAllBuyerBids(g);
                                          else deselectAllBuyerBids(g);
                                        }}
                                        className="h-[18px] w-[18px] rounded-none border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-primary"
                                        aria-label="Select or deselect all lots not yet printed"
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
                                <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>
                                  Qty
                                </th>
                                <th
                                  className={cn(
                                    CHITTI_TABLE_HEAD_CELL,
                                    '!text-center rounded-tr-xl whitespace-nowrap pr-4',
                                  )}
                                >
                                  Act.
                                </th>
                              </tr>
                              </thead>
                              <tbody>
                                {g.bids.map((b, rowIdx) => {
                                  const k = bidKey(b);
                                  const on = selectedSet.has(k);
                                  const isPrinted = printedBidKeys.has(k);
                                  const pendingRow = pendingSet.has(k);
                                  return (
                                    <tr
                                      key={bidListKey(b, rowIdx)}
                                      className={cn(
                                        'border-b border-border/30 align-middle',
                                        isPrinted && 'text-muted-foreground/80',
                                        pendingRow && 'bg-amber-500/10',
                                      )}
                                    >
                                      <td className="p-0 align-middle w-10">
                                        <div className="flex h-9 w-full items-center justify-center">
                                          <Checkbox
                                            checked={isPrinted || on}
                                            onCheckedChange={(c) => setBidSelected(g.buyerMark, k, c === true)}
                                            disabled={isPrinted}
                                            className="h-[18px] w-[18px] rounded-none border-foreground/30"
                                            aria-label={
                                              isPrinted
                                                ? `Lot ${formatLotIdentifierForBid(b)} — printed`
                                                : `Select lot ${formatLotIdentifierForBid(b)}`
                                            }
                                          />
                                        </div>
                                      </td>
                                      <td className="py-1.5 pr-2 max-w-[8rem] lg:max-w-[10rem]">
                                        <span className="font-semibold text-foreground break-words line-clamp-2">
                                          {formatLotIdentifierForBid(b)}
                                        </span>
                                        {isPrinted && (
                                          <span className="ml-1 text-[9px] font-bold uppercase text-emerald-600 dark:text-emerald-400">done</span>
                                        )}
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
                                      <td className="py-1.5 text-center tabular-nums align-middle whitespace-nowrap">
                                        {b.quantity}
                                      </td>
                                      <td className="py-1.5 pl-1 pr-4 text-center align-middle whitespace-nowrap">
                                        <div className="flex justify-center">
                                          {canEditAuctionBids && !isPrinted && b.auctionEntryId != null && (
                                            pendingRow ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPendingRemoveByMark((p) => {
                                                    const n = new Set(p[g.buyerMark] ?? []);
                                                    n.delete(k);
                                                    return { ...p, [g.buyerMark]: n };
                                                  });
                                                  setBidSelected(g.buyerMark, k, true);
                                                }}
                                                className={chittiRedoBtnClass}
                                                aria-label="Undo staged removal"
                                              >
                                                <Undo2 className="h-3.5 w-3.5 shrink-0" />
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setStagingRemove({ buyerMark: g.buyerMark, bid: b })}
                                                className={chittiDeleteIconBtnClass}
                                                aria-label={`Stage removal — ${formatLotIdentifierForBid(b)}`}
                                                title="Remove from chitti (Save & Print)"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                                              </button>
                                            )
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <ul className="md:hidden space-y-2" role="list">
                            {unprintedKeys.length > 0 && (
                              <li className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5 min-h-10">
                                <div className="flex h-9 w-10 shrink-0 items-center justify-center">
                                  <Checkbox
                                    checked={headerSelectChecked}
                                    onCheckedChange={(c) => {
                                      if (c === true) selectAllBuyerBids(g);
                                      else deselectAllBuyerBids(g);
                                    }}
                                    className="h-[18px] w-[18px] rounded-none"
                                    aria-label="Select or deselect all unprinted lots"
                                  />
                                </div>
                                <span className="text-[11px] font-semibold text-muted-foreground">All unprinted</span>
                              </li>
                            )}
                            {g.bids.map((b, rowIdx) => {
                              const k = bidKey(b);
                              const on = selectedSet.has(k);
                              const isPrinted = printedBidKeys.has(k);
                              const pendingRow = pendingSet.has(k);
                              return (
                                <li
                                  key={bidListKey(b, rowIdx)}
                                  className={cn(
                                    'rounded-xl border border-border/60 p-2.5',
                                    isPrinted && 'opacity-75',
                                    pendingRow && 'border-amber-500/50 bg-amber-500/10',
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-9 w-10 shrink-0 items-center justify-center">
                                      <Checkbox
                                        checked={isPrinted || on}
                                        onCheckedChange={(c) => setBidSelected(g.buyerMark, k, c === true)}
                                        disabled={isPrinted}
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
                                      {isPrinted && (
                                        <p className="text-[9px] font-bold uppercase text-emerald-600 mt-1">Print done</p>
                                      )}
                                    </div>
                                    {canEditAuctionBids && !isPrinted && b.auctionEntryId != null && (
                                      pendingRow ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPendingRemoveByMark((p) => {
                                              const n = new Set(p[g.buyerMark] ?? []);
                                              n.delete(k);
                                              return { ...p, [g.buyerMark]: n };
                                            });
                                            setBidSelected(g.buyerMark, k, true);
                                          }}
                                          className={cn(chittiRedoBtnClass, 'w-auto min-w-[44px] px-2')}
                                          aria-label="Redo"
                                        >
                                          <Undo2 className="h-4 w-4" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setStagingRemove({ buyerMark: g.buyerMark, bid: b })}
                                          className={chittiDeleteIconBtnClass}
                                          aria-label="Delete from chitti"
                                        >
                                          <Trash2 className="h-4 w-4" strokeWidth={2.2} />
                                        </button>
                                      )
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                      </section>

                      <div className="flex flex-row flex-wrap items-stretch justify-end gap-2 sm:gap-3 pt-1 w-full">
                        <button
                          type="button"
                          className={cn(BUYER_CHITTI_BULK_BTN_CLASS, 'min-h-10 min-w-[10.5rem] sm:min-w-[12rem] justify-center inline-flex items-center gap-2')}
                          style={buyerChittiBulkBtnStyle}
                          disabled={
                            (draftPreviewBids.length === 0 && pendingSet.size === 0) ||
                            (draftPreviewBids.length === 0 && pendingSet.size > 0 && !canEditAuctionBids)
                          }
                          onClick={() => void handleSavePrintBuyerChitti(g)}
                        >
                          <Save className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                          Save &amp; Print
                        </button>
                        <button
                          type="button"
                          className={cn(BUYER_CHITTI_BULK_BTN_CLASS, 'min-h-10 min-w-[10.5rem] sm:min-w-[11rem] justify-center inline-flex items-center gap-2')}
                          style={buyerChittiBulkBtnStyle}
                          disabled={pendingSet.size === 0}
                          onClick={() => {
                            const pend = pendingRemoveByMark[g.buyerMark] ?? new Set<string>();
                            setPendingRemoveByMark((p) => ({ ...p, [g.buyerMark]: new Set() }));
                            setBuyerChittiSelected((p) => {
                              const cur = new Set(p[g.buyerMark] ?? []);
                              pend.forEach((key) => cur.add(key));
                              return { ...p, [g.buyerMark]: cur };
                            });
                          }}
                        >
                          <Undo2 className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                          Undo
                        </button>
                      </div>
                    </>
                  )}
                  {isUnassignedGroup && (
                  <ul className="space-y-1.5" role="list">
                    {g.bids.map((b, rowIdx) => {
                      const k = bidKey(b);
                      return (
                        <li key={bidListKey(b, rowIdx)} className="min-w-0">
                          <div className="rounded-lg py-2 px-2 -mx-1 hover:bg-foreground/5 text-left">
                            <div className="text-xs font-bold break-words text-foreground">
                              {formatLotIdentifierForBid(b)}
                            </div>
                            <p className="text-[10px] mt-0.5 break-words text-muted-foreground">
                              #{b.bidNumber} · S{b.sellerSerial} {b.sellerName} · {b.quantity} @ ₹{b.rate}
                              {b.origin || b.vehicleNumber ? ` · ${b.origin || b.vehicleNumber}` : ''}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  )}
                </div>
              )}
            </motion.div>
            );
          })
        ) : (
          sellerGroups.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No matching sellers</p>
          ) : sellerGroups.map((g, i) => (
            <motion.div key={g.name}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
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
                    <span>{g.bids.reduce((s, b) => s + b.quantity, 0)} bags</span>
                    <span>•</span>
                    <span>₹{g.bids.reduce((s, b) => s + b.quantity * b.rate, 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <button onClick={() => handlePrintSellerChiti(g)}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold shadow-sm flex-shrink-0">🖨 Chiti</button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AlertDialog
        open={stagingRemove != null}
        onOpenChange={(open) => {
          if (!open) setStagingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this lot from the chitti draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {stagingRemove
                ? `It stays until you tap Save & Print, then moves to Unassigned. Lot: ${formatLotIdentifierForBid(stagingRemove.bid)}.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className={cn(BUYER_CHITTI_BULK_BTN_CLASS, 'border-0 sm:mt-0')}
              style={buyerChittiBulkBtnStyle}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(BUYER_CHITTI_BULK_BTN_CLASS, 'border-0 text-[#FFFFFF] hover:text-[#FFFFFF]')}
              style={buyerChittiBulkBtnStyle}
              onClick={() => confirmStageRemoveFromChitti()}
            >
              Stage removal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={migrateOpen}
        onOpenChange={(open) => {
          setMigrateOpen(open);
          if (!open) {
            setMigrateTarget(null);
            setMigrateSearch('');
            setMigrateSelectedKeys(new Set());
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[min(90dvh,640px)] flex flex-col gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="p-6 pb-2 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
              <ArrowRightLeft className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
              <span>Search &amp; migrate</span>
            </DialogTitle>
            {migrateTarget ? (
              <DialogDescription className="text-left">
                {migrateTarget.buyerName} ({migrateTarget.buyerMark})
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="px-6 flex flex-col gap-2 min-h-0 flex-1">
            {unassignedPoolBids.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                Pool is empty.
              </p>
            ) : null}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                strokeWidth={2.25}
                aria-hidden
              />
              <Input
                aria-label="Search pool"
                placeholder="Search…"
                value={migrateSearch}
                onChange={(e) => setMigrateSearch(e.target.value)}
                className="h-10 pl-10 pr-3 text-sm"
                autoFocus
              />
            </div>
            {!migrateSearch.trim() ? (
              <div className="min-h-[4rem]" aria-hidden />
            ) : migrateSearchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No matches.</p>
            ) : (
              <ul className="min-h-0 max-h-[min(42vh,320px)] overflow-y-auto space-y-1.5 pr-0.5 py-1" role="list">
                {migrateSearchResults.map((b, rowIdx) => {
                  const sk = migratePoolStableKey(b);
                  const selected = migrateSelectedKeys.has(sk);
                  const migDomId = `mig-${sk.replace(/[^a-zA-Z0-9_-]/g, '_')}-${rowIdx}`;
                  return (
                    <li key={`mig-${sk}-${rowIdx}`}>
                      <div className="flex items-center gap-2 rounded-lg border border-border/60 p-2 hover:bg-foreground/5">
                        <div className="flex h-9 w-10 shrink-0 items-center justify-center">
                          <Checkbox
                            id={migDomId}
                            checked={selected}
                            onCheckedChange={(c) => {
                              const on = c === true;
                              setMigrateSelectedKeys((prev) => {
                                const n = new Set(prev);
                                if (on) n.add(sk);
                                else n.delete(sk);
                                return n;
                              });
                            }}
                            className="h-[18px] w-[18px] rounded-none"
                            aria-label={`Select ${formatLotIdentifierForBid(b)}`}
                          />
                        </div>
                        <label htmlFor={migDomId} className="min-w-0 flex-1 text-left text-sm cursor-pointer">
                          <span className="font-semibold text-foreground break-words block">
                            {formatLotIdentifierForBid(b)}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5 break-words">
                            #{b.bidNumber} · {b.sellerName} · {b.quantity} @ ₹{b.rate} · {b.vehicleNumber}
                          </span>
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {migrateSearch.trim() && migrateSearchResults.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className={BUYER_CHITTI_BULK_BTN_CLASS}
                  style={buyerChittiBulkBtnStyle}
                  onClick={() =>
                    setMigrateSelectedKeys(new Set(migrateSearchResults.map((x) => migratePoolStableKey(x))))
                  }
                >
                  Select all shown
                </button>
                <button
                  type="button"
                  className={BUYER_CHITTI_BULK_BTN_CLASS}
                  style={buyerChittiBulkBtnStyle}
                  onClick={() => setMigrateSelectedKeys(new Set())}
                >
                  Deselect all
                </button>
              </div>
            )}
          </div>
          <DialogFooter className="p-6 pt-2 border-t sm:justify-end gap-2">
            <button
              type="button"
              className={BUYER_CHITTI_BULK_BTN_CLASS}
              style={buyerChittiBulkBtnStyle}
              onClick={() => {
                setMigrateOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cn(BUYER_CHITTI_BULK_BTN_CLASS, 'min-w-[10rem] disabled:opacity-40 inline-flex items-center justify-center gap-2')}
              style={buyerChittiBulkBtnStyle}
              disabled={
                migrateSelectedKeys.size === 0 ||
                migrateBusy ||
                !migrateTarget
              }
              onClick={() => void runMigrateFromPool()}
            >
              <ArrowRightLeft className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
              {migrateBusy ? 'Assigning…' : `Assign ${migrateSelectedKeys.size}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <div className="overflow-hidden rounded-xl border border-[rgba(91,140,255,0.35)] shadow-[0_0_12px_rgba(91,140,255,0.2)]">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr style={buyerChittiTableHeadStyle}>
                      <th className={cn(CHITTI_TABLE_HEAD_CELL, 'rounded-tl-xl whitespace-nowrap')}>Lot name</th>
                      <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>Lot SL</th>
                      {chittiPreviewRateOn && (
                        <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center whitespace-nowrap')}>Rate</th>
                      )}
                      <th className={cn(CHITTI_TABLE_HEAD_CELL, '!text-center rounded-tr-xl whitespace-nowrap pr-4')}>
                        Qty
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chittiPreviewDraftBids.length === 0 ? (
                      <tr>
                        <td
                          colSpan={chittiPreviewRateOn ? 4 : 3}
                          className="py-8 text-center text-muted-foreground text-sm"
                        >
                          Nothing selected.
                        </td>
                      </tr>
                    ) : (
                      chittiPreviewDraftBids.map((b, rowIdx) => (
                        <tr key={bidListKey(b, rowIdx)} className="border-b border-border/30">
                          <td className="py-2 pl-2 pr-2">
                            <span className="font-semibold break-words">{formatLotIdentifierForBid(b)}</span>
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
                      ))
                    )}
                  </tbody>
                </table>
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
