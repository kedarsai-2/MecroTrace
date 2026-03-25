import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Printer, Package, User, Search, Layers
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { useAuctionResults } from '@/hooks/useAuctionResults';
import { printLogApi, arrivalsApi, logisticsApi } from '@/services/api';
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

type FilterMode = 'LOT' | 'BUYER' | 'SELLER';

const FILTER_TABS: { key: FilterMode; label: string; icon: typeof Layers; desc: string }[] = [
  { key: 'LOT', label: 'Lot', icon: Layers, desc: 'Sales sticker per lot' },
  { key: 'BUYER', label: 'Buyer', icon: User, desc: 'Consolidated chiti for buyer' },
  { key: 'SELLER', label: 'Seller', icon: Package, desc: 'Chiti for seller lots' },
];

const LogisticsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const [bids, setBids] = useState<BidInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('LOT');
  

  const { auctionResults: auctionData } = useAuctionResults();
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);

  useEffect(() => {
    arrivalsApi.listDetail(0, 500).then(setArrivalDetails).catch(() => setArrivalDetails([]));
  }, []);

  // REQ-LOG-004: Load bids from completed auctions; enrich with origin/godown/commodity from arrival full detail; daily serials from API
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Build lotId -> commodityName from arrival full details (so sticker shows commodity when auction API doesn't)
      const vehicleNumbersFromAuction = new Set<string>();
      auctionData.forEach((auction: any) => {
        if (auction.vehicleNumber) vehicleNumbersFromAuction.add(auction.vehicleNumber);
      });
      const vehicleIdsToFetch = arrivalDetails
        .filter((arr) => vehicleNumbersFromAuction.has(arr.vehicleNumber))
        .map((arr) => arr.vehicleId);
      const lotIdToCommodity = new Map<string, string>();
      await Promise.all(
        [...new Set(vehicleIdsToFetch)].map(async (vehicleId) => {
          try {
            const full = await arrivalsApi.getById(vehicleId);
            (full.sellers || []).forEach((seller) => {
              (seller.lots || []).forEach((lot) => {
                const name = (lot as any).commodityName ?? (lot as any).commodity_name ?? '';
                if (name) lotIdToCommodity.set(String(lot.id), name);
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
        (auction.entries || []).forEach((entry: any) => {
          let sellerName = auction.sellerName || 'Unknown';
          let vehicleNumber = auction.vehicleNumber || 'Unknown';
          const fromAuction = auction.commodityName ?? (auction as any).commodity_name ?? '';
          const commodityName = lotIdToCommodity.get(String(auction.lotId)) || fromAuction;
          let lotName = auction.lotName || '';
          let origin: string | undefined;
          let godown: string | undefined;

          arrivalDetails.forEach((arr) => {
            (arr.sellers || []).forEach((seller) => {
              (seller.lots || []).forEach((lot) => {
                if (String(lot.id) === String(auction.lotId)) {
                  sellerName = seller.sellerName;
                  vehicleNumber = arr.vehicleNumber || vehicleNumber;
                  lotName = lot.lotName || lotName;
                  origin = arr.origin;
                  godown = arr.godown;
                }
              });
            });
          });

          allBids.push({
            bidNumber: entry.bidNumber,
            buyerMark: entry.buyerMark,
            buyerName: entry.buyerName,
            quantity: entry.quantity,
            rate: entry.rate,
            lotId: String(auction.lotId),
            lotName,
            sellerName,
            sellerSerial: 0,
            lotNumber: 0,
            vehicleNumber,
            commodityName,
            origin,
            godown,
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
          vehicleTotalQty: vehicleTotals.get(vKey) ?? b.quantity,
          sellerVehicleQty: vehicleSellerTotals.get(vsKey) ?? b.quantity,
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
          sellerSerial: res.sellerSerials[b.sellerName] ?? b.sellerSerial,
          lotNumber: res.lotNumbers[b.lotId] ?? b.lotNumber,
          vehicleTotalQty: vehicleTotals.get(b.vehicleNumber || '') ?? b.quantity,
          sellerVehicleQty: vehicleSellerTotals.get(`${b.vehicleNumber || ''}||${b.sellerName}`) ?? b.quantity,
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
            vehicleTotalQty: vehicleTotals.get(vKey) ?? b.quantity,
            sellerVehicleQty: vehicleSellerTotals.get(vsKey) ?? b.quantity,
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
    return Array.from(byBuyer.entries()).map(([mark, list]) => ({
      buyerMark: mark,
      buyerName: list[0]?.buyerName ?? mark,
      bids: list,
    }));
  }, [filteredBids]);

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

  const handlePrintBuyerChiti = async (g: { buyerMark: string; buyerName: string; bids: BidInfo[] }) => {
    toast.info('🖨 Printing Buyer Chiti…');
    try {
      await printLogApi.create({
        reference_type: 'BUYER_CHITI',
        reference_id: g.buyerMark,
        print_type: 'BUYER_CHITI',
      });
    } catch {
      // optional
    }
    const ok = await directPrint(
      {
        html: generateBuyerChiti(g.buyerName, g.buyerMark, g.bids),
        thermalText: generateBuyerChitiThermal(g.buyerName, g.buyerMark, g.bids),
      },
      { mode: "auto" }
    );
    ok ? toast.success('Buyer Chiti sent to printer!') : toast.error('Printer not connected.');
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
        html: generateSellerChiti(g.name, g.serial, g.bids),
        thermalText: generateSellerChitiThermal(g.name, g.serial, g.bids),
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
        ? generateSalePadPrint(filteredBids)
        : type === 'TENDER_SLIP'
          ? generateTenderSlip(filteredBids)
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
          ) : buyerGroups.map((g, i) => (
            <motion.div key={g.buyerMark}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass-card rounded-2xl p-3 overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-md flex-shrink-0">
                  <span className="text-white font-black text-xs">[{g.buyerMark}]</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{g.buyerName}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{g.bids.length} lots</span>
                    <span>•</span>
                    <span>{g.bids.reduce((s, b) => s + b.quantity, 0)} bags</span>
                    <span>•</span>
                    <span>₹{g.bids.reduce((s, b) => s + b.quantity * b.rate, 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <button onClick={() => handlePrintBuyerChiti(g)}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 text-white text-[10px] font-bold shadow-sm flex-shrink-0">🖨 Chiti</button>
              </div>
            </motion.div>
          ))
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
      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default LogisticsPage;
