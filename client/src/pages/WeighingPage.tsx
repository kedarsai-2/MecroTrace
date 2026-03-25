import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Scale, Bluetooth, PenLine, Plus, Trash2,
  AlertTriangle, Search, Package, Hash, ChevronDown, Download,
  FileText, Printer
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { useAuctionResults } from '@/hooks/useAuctionResults';
import { commodityApi, weighingApi, printLogApi, arrivalsApi } from '@/services/api';
import { directPrint } from '@/utils/printTemplates';
import { generateWeighingSlipPrintHTML } from '@/utils/printDocumentTemplates';
import type { FullCommodityConfigDto } from '@/services/api/commodities';
import type { ArrivalDetail } from '@/services/api/arrivals';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

/** REQ-WGH-004: Government deduction from API full-config */
function getGovtDeductionFromConfigs(weight: number, fullConfigs: FullCommodityConfigDto[]): number {
  const withGovt = fullConfigs.find(f => f.config?.govtDeductionEnabled);
  if (withGovt && (withGovt.deductionRules?.length ?? 0) > 0) {
    const rule = withGovt.deductionRules!.find(r => weight >= r.minWeight && weight <= r.maxWeight);
    if (rule) return rule.deductionValue;
  }
  if (weight >= 1 && weight <= 35) return 1.5;
  return 0;
}

// ── Types ─────────────────────────────────────────────────
interface BidForWeighing {
  bidNumber: number;
  buyerMark: string;
  buyerName: string;
  quantity: number;
  rate: number;
  lotId: string;
  lotName: string;
  sellerName: string;
}

interface BagWeightEntry {
  bagNumber: number;
  weight: number;
  timestamp: string;
}

interface WeighingSessionData {
  sessionId: string;
  bidNumber: number;
  bagWeights: BagWeightEntry[];
  originalWeight: number;   // REQ-WGH-001: raw machine data
  deductions: number;
  netWeight: number;         // REQ-WGH-001: business billable
  manualEntry: boolean;      // REQ-WGH-002
  isComplete: boolean;
  govtDeductionApplied: boolean;
  roundOffApplied: boolean;
}

const WeighingPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Weighing');
  const [searchParams] = useSearchParams();
  const [bids, setBids] = useState<BidForWeighing[]>([]);
  const [selectedBid, setSelectedBid] = useState<BidForWeighing | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scaleConnected, setScaleConnected] = useState(false);

  // Weighing session
  const [session, setSession] = useState<WeighingSessionData | null>(null);
  const [currentWeight, setCurrentWeight] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [govtDeductionEnabled, setGovtDeductionEnabled] = useState(true);
  const [roundOffEnabled, setRoundOffEnabled] = useState(false);

  // REQ-WGH-008: Post-weighing slip
  const [showSlip, setShowSlip] = useState(false);
  const [completedSession, setCompletedSession] = useState<WeighingSessionData | null>(null);

  const [pendingRemoveBag, setPendingRemoveBag] = useState<number | null>(null);

  // REQ-WGH-005: Mutual exclusivity
  useEffect(() => {
    if (roundOffEnabled) setGovtDeductionEnabled(false);
  }, [roundOffEnabled]);
  useEffect(() => {
    if (govtDeductionEnabled) setRoundOffEnabled(false);
  }, [govtDeductionEnabled]);

  const { auctionResults: auctionData } = useAuctionResults();
  const [fullConfigs, setFullConfigs] = useState<FullCommodityConfigDto[]>([]);
  const [weighingSessionsList, setWeighingSessionsList] = useState<any[]>([]);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);

  useEffect(() => {
    commodityApi.getAllFullConfigs().then(setFullConfigs);
  }, []);

  useEffect(() => {
    weighingApi.list({ page: 0, size: 2000 }).then(setWeighingSessionsList).catch(() => setWeighingSessionsList([]));
  }, []);

  // Arrivals from API (no localStorage). Load detail list for bid enrichment (lotId → lotName, sellerName).
  useEffect(() => {
    arrivalsApi
      .listDetail(0, 500)
      .then(setArrivalDetails)
      .catch(() => setArrivalDetails([]));
  }, []);

  // Load bids from auction results; enrich seller/lot names from arrival details (API).
  useEffect(() => {
    const allBids: BidForWeighing[] = [];

    auctionData.forEach((auction: any) => {
      (auction.entries || []).forEach((entry: any) => {
        let sellerName = auction.sellerName || 'Unknown';
        let lotName = auction.lotName || '';
        arrivalDetails.forEach((arr: ArrivalDetail) => {
          (arr.sellers || []).forEach((seller) => {
            (seller.lots || []).forEach((lot) => {
              if (String(lot.id) === String(auction.lotId)) {
                sellerName = seller.sellerName;
                lotName = lot.lotName || lotName;
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
        });
      });
    });
    setBids(allBids);

    // PATH 1: Auto-select bid if coming from Sales Pad with ?bid=X
    const bidParam = searchParams.get('bid');
    if (bidParam && allBids.length > 0) {
      const bidNum = parseInt(bidParam);
      const found = allBids.find(b => b.bidNumber === bidNum);
      if (found) startSession(found);
    }
  }, [auctionData, arrivalDetails, searchParams]);

  const filteredBids = useMemo(() => {
    if (!searchQuery) return bids;
    const q = searchQuery.toLowerCase();
    return bids.filter(b =>
      b.buyerMark.toLowerCase().includes(q) ||
      b.buyerName.toLowerCase().includes(q) ||
      b.sellerName.toLowerCase().includes(q) ||
      String(b.bidNumber).includes(q)
    );
  }, [bids, searchQuery]);

  const startSession = (bid: BidForWeighing) => {
    setSelectedBid(bid);
    setSession({
      sessionId: crypto.randomUUID(),
      bidNumber: bid.bidNumber,
      bagWeights: [],
      originalWeight: 0,
      deductions: 0,
      netWeight: 0,
      manualEntry: false,
      isComplete: false,
      govtDeductionApplied: false,
      roundOffApplied: false,
    });
  };

  // REQ-WGH-007: Record individual bag weight
  const recordBagWeight = () => {
    const w = parseFloat(currentWeight);
    if (!w || w <= 0 || !session) return;

    // REQ-WGH-009: Min/Max alarm
    if (w < 5) toast.warning(`⚠️ Low weight: ${w}kg — verify reading`);
    if (w > 100) toast.warning(`⚠️ High weight: ${w}kg — verify reading`);

    const newBag: BagWeightEntry = {
      bagNumber: session.bagWeights.length + 1,
      weight: w,
      timestamp: new Date().toISOString(),
    };

    const updatedBags = [...session.bagWeights, newBag];
    recalcWeights(updatedBags);
    setCurrentWeight('');
  };

  // Centralized weight recalculation
  const recalcWeights = useCallback((bags: BagWeightEntry[]) => {
    const totalOriginal = bags.reduce((s, b) => s + b.weight, 0);
    // REQ-WGH-002: If manual, OW = 0
    const origWeight = manualMode ? 0 : totalOriginal;
    // REQ-WGH-004: Govt deductions per bag
    let deductions = 0;
    if (govtDeductionEnabled) {
      deductions = bags.reduce((s, b) => s + getGovtDeductionFromConfigs(b.weight, fullConfigs), 0);
    }
    // REQ-WGH-003: NW = OW - D (use totalOriginal for calc even if manual)
    let netWeight = totalOriginal - deductions;
    // REQ-WGH-005: Round-off on FINAL value only
    if (roundOffEnabled) {
      netWeight = Math.round(netWeight);
    }
    setSession(prev => prev ? {
      ...prev,
      bagWeights: bags,
      originalWeight: origWeight,
      deductions,
      netWeight,
      manualEntry: manualMode,
      govtDeductionApplied: govtDeductionEnabled,
      roundOffApplied: roundOffEnabled,
    } : prev);
  }, [manualMode, govtDeductionEnabled, roundOffEnabled]);

  // REQ-WGH-006: Average weight logic
  const applyAverageWeight = () => {
    if (!session || session.bagWeights.length === 0 || !selectedBid) return;
    const totalSampleWeight = session.bagWeights.reduce((s, b) => s + b.weight, 0);
    const n = session.bagWeights.length;
    const avgWeight = totalSampleWeight / n; // AW = ΣWi ÷ n
    const totalEstWeight = avgWeight * selectedBid.quantity; // TEW = AW × Q

    let deductions = 0;
    if (govtDeductionEnabled) {
      deductions = getGovtDeductionFromConfigs(avgWeight, fullConfigs) * selectedBid.quantity;
    }

    let netWeight = totalEstWeight - deductions;
    if (roundOffEnabled) netWeight = Math.round(netWeight);

    setSession(prev => prev ? {
      ...prev,
      originalWeight: manualMode ? 0 : totalEstWeight,
      deductions,
      netWeight,
    } : prev);

    toast.success(
      `AW = ${avgWeight.toFixed(2)}kg (${n} samples) × ${selectedBid.quantity} bags = TEW ${totalEstWeight.toFixed(2)}kg`
    );
  };

  // Complete session and save (backend only; no localStorage for business data)
  const completeSession = async () => {
    if (!session || !selectedBid) return;

    if (!can('Weighing', 'Create')) {
      toast.error('You do not have permission to create weighing sessions.');
      return;
    }

    const payload = {
      session_id: session.sessionId,
      lot_id: Number(selectedBid.lotId) || 0,
      bid_number: session.bidNumber,
      buyer_mark: selectedBid.buyerMark,
      buyer_name: selectedBid.buyerName,
      seller_name: selectedBid.sellerName,
      lot_name: selectedBid.lotName,
      total_bags: selectedBid.quantity,
      original_weight: session.originalWeight,
      net_weight: session.netWeight,
      manual_entry: session.manualEntry,
      bag_weights: session.bagWeights.map(b => ({ bagNumber: b.bagNumber, weight: b.weight, timestamp: b.timestamp })),
      deductions: session.deductions,
      govt_deduction_applied: session.govtDeductionApplied,
      round_off_applied: session.roundOffApplied,
    };

    try {
      await weighingApi.create(payload);
      setWeighingSessionsList(prev => [...prev, {
        session_id: session.sessionId,
        lot_id: selectedBid.lotId,
        bid_number: session.bidNumber,
        buyer_mark: selectedBid.buyerMark,
        buyer_name: selectedBid.buyerName,
        seller_name: selectedBid.sellerName,
        lot_name: selectedBid.lotName,
        total_bags: selectedBid.quantity,
        original_weight: session.originalWeight,
        net_weight: session.netWeight,
        manual_entry: session.manualEntry,
        bag_weights: session.bagWeights,
        deductions: session.deductions,
        govt_deduction_applied: session.govtDeductionApplied,
        round_off_applied: session.roundOffApplied,
        created_at: new Date().toISOString(),
      }]);
    } catch {
      toast.error('Failed to save weighing session');
      return;
    }

    setCompletedSession({ ...session });
    setShowSlip(true);

    toast.success(`Weighing complete! Net: ${session.netWeight.toFixed(2)}kg`);
    setSession(null);
    setSelectedBid(null);
  };

  const removeBag = (bagNumber: number) => {
    if (!session) return;
    const updatedBags = session.bagWeights.filter(b => b.bagNumber !== bagNumber)
      .map((b, i) => ({ ...b, bagNumber: i + 1 }));
    recalcWeights(updatedBags);
  };

  const isWeighingDirty = !!session && !showSlip && (
    session.bagWeights.length > 0 ||
    currentWeight.trim() !== "" ||
    manualMode ||
    roundOffEnabled ||
    !govtDeductionEnabled
  );

  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isWeighingDirty,
  });

  if (!canView) {
    return <ForbiddenPage moduleName="Weighing" />;
  }

  // ═══ REQ-WGH-008: POST-WEIGHING SLIP (Thermal printout) ═══
  if (showSlip && completedSession) {
    const totalWeight = completedSession.bagWeights.reduce((s, b) => s + b.weight, 0);
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-[2rem]">
          <div className="relative z-10 flex items-center gap-3">
            <button onClick={() => setShowSlip(false)}
              aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5" /> Post-Weighing Slip
              </h1>
              <p className="text-white/70 text-xs">REQ-WGH-008 · Thermal Format</p>
            </div>
          </div>
        </div>
        ) : (
        <div className="px-8 py-5 flex items-center gap-4">
          <Button onClick={() => setShowSlip(false)} variant="outline" size="sm" className="rounded-xl h-9">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" /> Post-Weighing Slip
            </h2>
            <p className="text-sm text-muted-foreground">REQ-WGH-008 · Thermal Format</p>
          </div>
        </div>
        )}

        <div className="px-4 mt-4">
          {/* Thermal receipt style */}
          <div className="bg-card border border-border rounded-xl p-4 font-mono text-xs space-y-2 shadow-lg">
            <div className="text-center border-b border-dashed border-border pb-2">
              <p className="font-bold text-sm text-foreground">MERCOTRACE</p>
              <p className="text-muted-foreground">Weighing Slip</p>
              <p className="text-muted-foreground">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
            </div>

            <div className="border-b border-dashed border-border pb-2 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Bid #</span><span className="font-bold text-foreground">{completedSession.bidNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><span className="font-bold text-foreground">{completedSession.manualEntry ? 'MANUAL' : 'DIGITAL SCALE'}</span></div>
              {completedSession.govtDeductionApplied && <div className="flex justify-between"><span className="text-muted-foreground">Govt Ded.</span><span className="font-bold text-foreground">APPLIED</span></div>}
              {completedSession.roundOffApplied && <div className="flex justify-between"><span className="text-muted-foreground">Round Off</span><span className="font-bold text-foreground">APPLIED</span></div>}
            </div>

            {/* Individual bag weights */}
            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">BAG WEIGHTS ({completedSession.bagWeights.length})</p>
              <div className="grid grid-cols-4 gap-x-1 gap-y-0.5">
                {completedSession.bagWeights.map(bag => (
                  <div key={bag.bagNumber} className="text-right text-foreground">
                    <span className="text-muted-foreground mr-1">{bag.bagNumber}.</span>{bag.weight.toFixed(1)}
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Weight</span><span className="font-bold text-foreground">{totalWeight.toFixed(2)} kg</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Original Wt (Legal)</span><span className="font-bold text-foreground">{completedSession.originalWeight.toFixed(2)} kg</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Deductions</span><span className="font-bold text-destructive">−{completedSession.deductions.toFixed(2)} kg</span></div>
              <div className="flex justify-between border-t border-dashed border-border pt-1 text-sm">
                <span className="font-bold text-foreground">NET WEIGHT</span>
                <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">{completedSession.netWeight.toFixed(2)} kg</span>
              </div>
            </div>

            {/* Formulas */}
            <div className="text-center text-muted-foreground/70 text-[9px] border-t border-dashed border-border pt-2 space-y-0.5">
              <p>NW = OW − D</p>
              {completedSession.bagWeights.length > 0 && (
                <p>AW = Σ Wi ÷ n = {(totalWeight / completedSession.bagWeights.length).toFixed(2)} kg</p>
              )}
              {completedSession.manualEntry && <p>⚠ Manual Entry: OW = 0 (no scale used)</p>}
            </div>

            <div className="text-center border-t border-dashed border-border pt-2">
              <p className="text-muted-foreground">--- END OF SLIP ---</p>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={async () => {
              const printedAt = new Date().toISOString();
              try {
                await printLogApi.create({
                  reference_type: 'WEIGHING_SLIP',
                  reference_id: completedSession.sessionId,
                  print_type: 'WEIGHING_SLIP',
                  printed_at: printedAt,
                });
              } catch {
                // backend optional
              }
              const totalW = completedSession.bagWeights.reduce((s, b) => s + b.weight, 0);
              directPrint(generateWeighingSlipPrintHTML(completedSession, totalW));
              toast.success('Weighing slip sent to printer!');
            }}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-slate-600 to-slate-800 text-white font-bold shadow-lg">
              <Printer className="w-5 h-5 mr-2" /> Print Slip
            </Button>
            <Button onClick={() => setShowSlip(false)} variant="outline" className="h-12 rounded-xl px-6">
              Done
            </Button>
          </div>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ WEIGHING SESSION SCREEN ═══
  if (session && selectedBid) {
    const avgWeight = session.bagWeights.length > 0
      ? (session.bagWeights.reduce((s, b) => s + b.weight, 0) / session.bagWeights.length).toFixed(2)
      : '0.00';

    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        <UnsavedChangesDialog />
        {/* Header */}
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-orange-400 via-amber-500 to-yellow-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => {
                  void (async () => {
                    const ok = await confirmIfDirty();
                    if (!ok) return;
                    setSession(null);
                    setSelectedBid(null);
                  })();
                }}
                aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <Scale className="w-5 h-5" /> Weighing
                </h1>
                <p className="text-white/70 text-xs">Bid #{selectedBid.bidNumber} · {selectedBid.buyerMark}</p>
              </div>
              <div className="flex gap-1.5">
                <span className={cn("px-2 py-1 rounded-lg text-[9px] font-bold",
                  scaleConnected ? 'bg-emerald-500/30 text-emerald-100' : manualMode ? 'bg-amber-500/30 text-amber-100' : 'bg-white/20 text-white/70')}>
                  {scaleConnected ? '● BT Scale' : manualMode ? '● Manual' : '● No Scale'}
                </span>
              </div>
            </div>

            {/* Bid Info Strip */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'Buyer', value: selectedBid.buyerName },
                { label: 'Mark', value: selectedBid.buyerMark },
                { label: 'Bags', value: `${session.bagWeights.length}/${selectedBid.quantity}` },
                { label: 'Lot', value: selectedBid.lotName },
              ].map(item => (
                <div key={item.label} className="bg-white/15 backdrop-blur-md rounded-xl p-1.5 text-center">
                  <p className="text-[8px] text-white/60 uppercase">{item.label}</p>
                  <p className="text-[11px] font-semibold text-white truncate">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        ) : (
        <div className="px-8 py-5">
          <div className="flex items-center gap-4 mb-4">
            <Button
              onClick={() => {
                void (async () => {
                  const ok = await confirmIfDirty();
                  if (!ok) return;
                  setSession(null);
                  setSelectedBid(null);
                })();
              }}
              variant="outline"
              size="sm"
              className="rounded-xl h-9"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-500" /> Weighing — Bid #{selectedBid.bidNumber}
              </h2>
              <p className="text-sm text-muted-foreground">{selectedBid.buyerName} ({selectedBid.buyerMark}) · {selectedBid.lotName}</p>
            </div>
            <span className={cn("px-3 py-1.5 rounded-xl text-xs font-bold",
              scaleConnected ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : manualMode ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted/50 text-muted-foreground')}>
              {scaleConnected ? '● BT Scale' : manualMode ? '● Manual' : '● No Scale'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Buyer', value: selectedBid.buyerName, border: 'border-l-amber-500' },
              { label: 'Mark', value: selectedBid.buyerMark, border: 'border-l-blue-500' },
              { label: 'Bags Weighed', value: `${session.bagWeights.length} / ${selectedBid.quantity}`, border: 'border-l-emerald-500' },
              { label: 'Lot', value: selectedBid.lotName, border: 'border-l-violet-500' },
            ].map(item => (
              <div key={item.label} className={cn("glass-card rounded-2xl p-4 border-l-4", item.border)}>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{item.label}</p>
                <p className="text-lg font-black text-foreground truncate">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
        )}

        <div className="px-4 mt-4 space-y-3">
          {/* Mode Toggle — BT Scale / Manual (REQ-WGH-002) */}
          <div className="flex gap-2">
            <button onClick={() => { setManualMode(false); setScaleConnected(true); }}
              className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all",
                scaleConnected && !manualMode
                  ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-md'
                  : 'bg-muted/40 text-muted-foreground')}>
              <Bluetooth className="w-3.5 h-3.5" /> BT Scale
            </button>
            <button onClick={() => { setManualMode(true); setScaleConnected(false); }}
              className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all",
                manualMode
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                  : 'bg-muted/40 text-muted-foreground')}>
              <PenLine className="w-3.5 h-3.5" /> Manual Entry
            </button>
          </div>

          {/* REQ-WGH-002 notice */}
          {manualMode && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                Manual Mode: Original Weight will be set to 0 for legal compliance (REQ-WGH-002)
              </p>
            </motion.div>
          )}

          {/* Deduction Config — REQ-WGH-004 / REQ-WGH-005 */}
          <div className="glass-card rounded-2xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Deduction Settings</p>
            <div className="flex gap-2">
              <button onClick={() => setGovtDeductionEnabled(!govtDeductionEnabled)}
                className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
                  govtDeductionEnabled
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md'
                    : 'bg-muted/40 text-muted-foreground')}>
                Govt Deduction
              </button>
              <button onClick={() => setRoundOffEnabled(!roundOffEnabled)}
                className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
                  roundOffEnabled
                    ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-md'
                    : 'bg-muted/40 text-muted-foreground')}>
                Round Off
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground/70 mt-1.5 text-center italic">
              ⚠ Mutually exclusive (REQ-WGH-005) · Round-off on final value only
            </p>
          </div>

          {/* Weight Input */}
          <div className="glass-card rounded-2xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Record Bag Weight {manualMode && '(Manual)'}
            </p>
            <div className="flex gap-2">
              <Input type="number" value={currentWeight} onChange={e => setCurrentWeight(e.target.value)}
                placeholder="Weight in kg" step="0.1"
                className="flex-1 h-14 rounded-xl text-center font-black text-2xl bg-muted/20 border-primary/20"
                onKeyDown={e => e.key === 'Enter' && recordBagWeight()} />
              <Button onClick={recordBagWeight} disabled={!currentWeight || parseFloat(currentWeight) <= 0}
                className="h-14 px-6 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-bold shadow-md text-lg">
                <Plus className="w-6 h-6" />
              </Button>
            </div>
          </div>

          {/* Summary Section with Formulas */}
          <div className="glass-card rounded-2xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Weight Summary</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-center">
                <p className="text-[9px] text-muted-foreground uppercase font-semibold">Original Weight (OW)</p>
                <p className="text-xl font-black text-blue-600 dark:text-blue-400">
                  {session.originalWeight.toFixed(2)}<span className="text-xs ml-1">kg</span>
                </p>
                {session.manualEntry && (
                  <p className="text-[8px] text-amber-500 font-bold mt-0.5">⚠ OW = 0 (Manual)</p>
                )}
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 text-center">
                <p className="text-[9px] text-muted-foreground uppercase font-semibold">Deductions (D)</p>
                <p className="text-xl font-black text-amber-600 dark:text-amber-400">
                  {session.deductions.toFixed(2)}<span className="text-xs ml-1">kg</span>
                </p>
              </div>
              <div className="col-span-2 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 rounded-xl p-4 text-center">
                <p className="text-[9px] text-muted-foreground uppercase font-semibold">Net Weight (NW)</p>
                <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400">
                  {session.netWeight.toFixed(2)}<span className="text-sm ml-1">kg</span>
                </p>
                <p className="text-[9px] text-muted-foreground mt-1 font-mono">
                  NW = OW − D = {session.originalWeight.toFixed(1)} − {session.deductions.toFixed(1)}
                </p>
                {session.bagWeights.length > 0 && (
                  <p className="text-[9px] text-muted-foreground font-mono">
                    Avg: {avgWeight}kg/bag · {session.bagWeights.length} bags recorded
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* REQ-WGH-006: Average Weight Button (Orange per SRS) */}
          <Button onClick={applyAverageWeight}
            disabled={session.bagWeights.length === 0}
            className="w-full h-14 rounded-xl bg-gradient-to-r from-orange-400 to-amber-500 text-white font-bold text-base shadow-lg">
            <Scale className="w-5 h-5 mr-2" />
            Average Weight · {session.bagWeights.length} bags sampled
          </Button>
          {session.bagWeights.length > 0 && selectedBid && (
            <p className="text-[9px] text-center text-muted-foreground font-mono -mt-1">
              AW = (Σ Wi) ÷ n = {(session.bagWeights.reduce((s, b) => s + b.weight, 0) / session.bagWeights.length).toFixed(2)}kg
              · TEW = AW × Q = {((session.bagWeights.reduce((s, b) => s + b.weight, 0) / session.bagWeights.length) * selectedBid.quantity).toFixed(2)}kg
            </p>
          )}

          {/* REQ-WGH-007: Individual Bag Weights */}
          {session.bagWeights.length > 0 && (
            <div className="glass-card rounded-2xl p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Individual Bag Weights · {session.bagWeights.length} recorded
              </p>
              {/* Grid display like thermal receipt */}
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {session.bagWeights.map(bag => (
                  <div key={bag.bagNumber}
                    className="bg-muted/20 rounded-lg px-1 py-1.5 text-center relative group">
                    <p className="text-[8px] text-muted-foreground">{bag.bagNumber}</p>
                    <p className="text-xs font-bold text-foreground">{bag.weight.toFixed(1)}</p>
                    <button onClick={() => setPendingRemoveBag(bag.bagNumber)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[8px] hidden group-hover:flex items-center justify-center">
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {/* Scrollable detailed list */}
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {session.bagWeights.map(bag => (
                  <div key={bag.bagNumber} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/10 text-xs">
                    <span className="text-muted-foreground">Bag {bag.bagNumber}</span>
                    <span className="font-bold text-foreground">{bag.weight.toFixed(1)} kg</span>
                    <span className="text-[9px] text-muted-foreground">{new Date(bag.timestamp).toLocaleTimeString()}</span>
                    <button onClick={() => setPendingRemoveBag(bag.bagNumber)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complete Button */}
          <Button onClick={completeSession}
            disabled={session.bagWeights.length === 0}
            className="w-full h-14 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-lg shadow-lg">
            ✓ Complete & Generate Slip
          </Button>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ BID LIST FOR WEIGHING ═══
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="bg-gradient-to-br from-orange-400 via-amber-500 to-yellow-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div key={i} className="absolute w-1.5 h-1.5 bg-white/40 rounded-full"
                style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%` }}
                animate={{ y: [-10, 10], opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
              />
            ))}
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => navigate('/home')} aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Scale className="w-5 h-5" /> Weighing
                </h1>
                <p className="text-white/70 text-xs">Liability Management · Dual Records</p>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-2.5 space-y-1">
              <p className="text-[9px] text-white/60 uppercase font-semibold">Two Weighing Paths:</p>
              <p className="text-[10px] text-white/80">① Home → Sales Pad → Bid → Weigh (immediate)</p>
              <p className="text-[10px] text-white/80">② Home → Writer's Pad → Get Bids → Weigh (post-auction)</p>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input aria-label="Search" placeholder="Search bid, buyer, mark…"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30" />
            </div>
          </div>
        </div>
      )}

      {/* Desktop Toolbar */}
      {isDesktop && (
        <div className="px-8 py-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-500" /> Weighing
              </h2>
              <p className="text-sm text-muted-foreground">{bids.length} bids · Liability Management & Dual Records</p>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input aria-label="Search" placeholder="Search bid, buyer, mark…"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-amber-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Bids</p>
              <p className="text-2xl font-black text-foreground">{bids.length}</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-emerald-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Weighed</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {bids.filter(b => weighingSessionsList.some((s: any) => s.bid_number === b.bidNumber)).length}
              </p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-blue-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Pending</p>
              <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {bids.filter(b => !weighingSessionsList.some((s: any) => s.bid_number === b.bidNumber)).length}
              </p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-violet-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Bags</p>
              <p className="text-2xl font-black text-foreground">{bids.reduce((s, b) => s + b.quantity, 0)}</p>
            </div>
          </div>
          <div className="mt-3 glass-card rounded-xl p-3 flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              <strong>Two Paths:</strong> ① Sales Pad → Bid → Weigh (immediate) &nbsp;|&nbsp; ② Writer's Pad → Get Bids → Weigh (post-auction)
            </p>
          </div>
        </div>
      )}

      <div className="px-4 mt-4 space-y-2">
        {filteredBids.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Scale className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">
              {bids.length === 0 ? 'No bids to weigh' : 'No matching bids'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {bids.length === 0 ? 'Complete auctions first, then weigh here or via Writer\'s Pad' : 'Try a different search'}
            </p>
            {bids.length === 0 && (
              <Button onClick={() => navigate('/auctions')} className="mt-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl">
                Go to Auctions
              </Button>
            )}
          </div>
        ) : (
          filteredBids.map((bid, i) => {
            const existingSession = weighingSessionsList
              .find((s: any) => s.bid_number === bid.bidNumber);
            return (
              <motion.div key={`${bid.bidNumber}-${i}`}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn("glass-card rounded-2xl p-3", existingSession && "border-l-4 border-l-emerald-500")}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shadow-md flex-shrink-0",
                    existingSession
                      ? "bg-gradient-to-br from-emerald-500 to-green-500"
                      : "bg-gradient-to-br from-amber-500 to-orange-500")}>
                    <span className="text-white font-black text-xs">{bid.buyerMark}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-foreground truncate">{bid.buyerName}</p>
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold">#{bid.bidNumber}</span>
                      {existingSession && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold">WEIGHED</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {bid.quantity} bags · {bid.lotName} · {bid.sellerName}
                      {existingSession && ` · Net: ${existingSession.net_weight?.toFixed(1)}kg`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button onClick={() => startSession(bid)} size="sm"
                      className={cn("rounded-xl text-[10px] font-bold shadow-sm px-3 h-8",
                        existingSession
                          ? "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                          : "bg-gradient-to-r from-amber-500 to-orange-500 text-white")}>
                      {existingSession ? 'Re-weigh' : 'Weigh'}
                    </Button>
                    {existingSession && (
                      <Button onClick={() => {
                        setCompletedSession({
                          sessionId: existingSession.session_id,
                          bidNumber: existingSession.bid_number,
                          bagWeights: existingSession.bag_weights || [],
                          originalWeight: Number(existingSession.original_weight ?? 0),
                          deductions: Number(existingSession.deductions ?? 0),
                          netWeight: Number(existingSession.net_weight ?? 0),
                          manualEntry: existingSession.manual_entry ?? false,
                          isComplete: true,
                          govtDeductionApplied: existingSession.govt_deduction_applied ?? false,
                          roundOffApplied: existingSession.round_off_applied ?? false,
                        });
                        setShowSlip(true);
                      }}
                        size="sm" variant="outline"
                        className="rounded-xl text-[10px] font-bold px-3 h-7 border-muted-foreground/20">
                        <FileText className="w-3 h-3 mr-1" /> Slip
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
      {!isDesktop && <BottomNav />}

      <ConfirmDeleteDialog
        open={pendingRemoveBag !== null}
        onOpenChange={(v) => { if (!v) setPendingRemoveBag(null); }}
        title="Remove bag?"
        description={pendingRemoveBag !== null ? `Remove Bag ${pendingRemoveBag} from this weighing session?` : ''}
        confirmLabel="Remove"
        onConfirm={() => { if (pendingRemoveBag !== null) removeBag(pendingRemoveBag); }}
      />
    </div>
  );
};

export default WeighingPage;
