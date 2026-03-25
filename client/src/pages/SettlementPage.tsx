import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, FileText, Search, User, Package, Truck, Hash,
  Edit3, Lock, Unlock, Save, Printer, ChevronDown, ChevronUp,
  Minus, Plus, ToggleLeft, ToggleRight, PlusCircle, Receipt
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { printLogApi, settlementApi, type PattiDTO } from '@/services/api';
import { directPrint } from '@/utils/printTemplates';
import { generateSalesPattiPrintHTML } from '@/utils/printDocumentTemplates';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import useAutofocusWhen from '@/hooks/useAutofocusWhen';

// ── Types ─────────────────────────────────────────────────
interface SellerSettlement {
  sellerId: string;
  sellerName: string;
  sellerMark: string;
  vehicleNumber: string;
  lots: SettlementLot[];
}

interface SettlementLot {
  lotId: string;
  lotName: string;
  commodityName: string;
  entries: SettlementEntry[];
}

interface SettlementEntry {
  bidNumber: number;
  buyerMark: string;
  buyerName: string;
  /** Auction base bid per bag */
  rate: number;
  /** From auction; seller settlement rate = rate + presetMargin */
  presetMargin?: number;
  quantity: number;
  weight: number;
}

interface RateCluster {
  rate: number;
  totalQuantity: number;
  totalWeight: number;
  amount: number;
}

interface DeductionItem {
  key: string;
  label: string;
  amount: number;
  editable: boolean;
  autoPulled: boolean;
}

interface PattiData {
  pattiId: string;
  sellerName: string;
  rateClusters: RateCluster[];
  grossAmount: number;
  deductions: DeductionItem[];
  totalDeductions: number;
  netPayable: number;
  createdAt: string;
  useAverageWeight: boolean;
}

/** Map backend PattiDTO to form PattiData (numbers and ISO date). */
function mapPattiDTOToPattiData(dto: PattiDTO): PattiData {
  const toNum = (v: unknown): number => (typeof v === 'number' && !Number.isNaN(v) ? v : Number(v) || 0);
  const rateClusters = (dto.rateClusters ?? []).map((c: { rate?: unknown; totalQuantity?: unknown; totalWeight?: unknown; amount?: unknown }) => ({
    rate: toNum(c.rate),
    totalQuantity: toNum(c.totalQuantity),
    totalWeight: toNum(c.totalWeight),
    amount: toNum(c.amount),
  }));
  const deductions: DeductionItem[] = (dto.deductions ?? []).map((d: { key?: string; label?: string; amount?: unknown; editable?: boolean; autoPulled?: boolean }) => ({
    key: d.key ?? `ded_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    label: d.label ?? 'Deduction',
    amount: toNum(d.amount),
    editable: d.editable ?? true,
    autoPulled: d.autoPulled ?? false,
  }));
  const grossAmount = toNum(dto.grossAmount);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netPayable = toNum(dto.netPayable);
  let createdAt = '';
  if (dto.createdAt != null) {
    if (typeof dto.createdAt === 'string') createdAt = dto.createdAt;
    else createdAt = new Date(dto.createdAt as number | Date).toISOString();
  } else {
    createdAt = new Date().toISOString();
  }
  return {
    pattiId: dto.pattiId ?? '',
    sellerName: dto.sellerName ?? '',
    rateClusters,
    grossAmount,
    deductions,
    totalDeductions,
    netPayable,
    createdAt,
    useAverageWeight: dto.useAverageWeight ?? false,
  };
}

// ── Validation constants (from Buyer Selection Section.ini) ──
const DEDUCTION_MAX = 10_000_000;
const VOUCHER_AMOUNT_MAX = 100_000;
const VOUCHER_LABEL_MIN = 5;
const VOUCHER_LABEL_MAX = 30;
const VEHICLE_NUMBER_MIN = 10;
const VEHICLE_NUMBER_MAX = 13;

function clampMoney(value: number, min = 0, max = DEDUCTION_MAX): number {
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function isVehicleNumberValid(v: string): boolean {
  return v.length >= VEHICLE_NUMBER_MIN && v.length <= VEHICLE_NUMBER_MAX;
}

/** Seller settlement rate per bag for patti (REQ-PUT: base bid + preset margin). */
function sellerSettlementRatePerBag(entry: SettlementEntry): number {
  const base = Number(entry.rate) || 0;
  const p = entry.presetMargin ?? 0;
  return base + (Number.isFinite(p) ? p : 0);
}

const SettlementPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Settlement');
  if (!canView) {
    return <ForbiddenPage moduleName="Settlement" />;
  }
  const [sellers, setSellers] = useState<SellerSettlement[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<SellerSettlement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [settlementMode, setSettlementMode] = useState<'new' | 'saved'>('new');
  
  // Patti state
  const [pattiData, setPattiData] = useState<PattiData | null>(null);
  const [existingPattiId, setExistingPattiId] = useState<number | null>(null);
  const [savedPattis, setSavedPattis] = useState<PattiDTO[]>([]);
  const [loadingPattis, setLoadingPattis] = useState(false);
  const [masterEditMode, setMasterEditMode] = useState(false);
  const [coolieMode, setCoolieMode] = useState<'FLAT' | 'RECALCULATED'>('FLAT');
  const [hamaliEnabled, setHamaliEnabled] = useState(false);
  const [gunniesAmount, setGunniesAmount] = useState(0);
  const [showPrint, setShowPrint] = useState(false);
  const [useAvgWeight, setUseAvgWeight] = useState(false);
  const [showAddVoucher, setShowAddVoucher] = useState(false);
  const [manualVoucherLabel, setManualVoucherLabel] = useState('');
  const [manualVoucherAmount, setManualVoucherAmount] = useState('');

  const manualVoucherLabelInputRef = useRef<HTMLInputElement | null>(null);
  useAutofocusWhen(showAddVoucher, manualVoucherLabelInputRef);

  // Load sellers from backend only (no localStorage or mock data).
  useEffect(() => {
    settlementApi
      .listSellers({ page: 0, size: 500 })
      .then((apiSellers: SellerSettlement[]) => {
        setSellers(Array.isArray(apiSellers) ? apiSellers : []);
      })
      .catch(() => {
        setSellers([]);
        toast.error('Failed to load settlement sellers');
      });
  }, []);

  // Load saved pattis when on seller list (no patti open).
  const loadSavedPattis = useCallback(() => {
    setLoadingPattis(true);
    settlementApi
      .listPattis({ page: 0, size: 20 })
      .then((list: PattiDTO[]) => {
        setSavedPattis(Array.isArray(list) ? list : []);
      })
      .catch(() => setSavedPattis([]))
      .finally(() => setLoadingPattis(false));
  }, []);

  useEffect(() => {
    if (selectedSeller == null && pattiData == null) {
      loadSavedPattis();
    }
  }, [selectedSeller, pattiData, loadSavedPattis]);

  // Generate Patti when seller is selected (new patti; clear edit id).
  // Overrides: pass when toggling to avoid stale closure (React state updates are async).
  const generatePatti = useCallback((seller: SellerSettlement, overrides?: { coolieMode?: 'FLAT' | 'RECALCULATED'; hamaliEnabled?: boolean; gunniesAmount?: number }) => {
    setExistingPattiId(null);
    setSelectedSeller(seller);

    if (!isVehicleNumberValid(seller.vehicleNumber)) {
      toast.warning(`Vehicle number should be ${VEHICLE_NUMBER_MIN}–${VEHICLE_NUMBER_MAX} characters`);
    }
    
    // REQ-PUT-001: Cluster by rate
    const rateMap = new Map<number, RateCluster>();
    let totalWeight = 0;
    
    seller.lots.forEach(lot => {
      lot.entries.forEach(entry => {
        const sr = sellerSettlementRatePerBag(entry);
        const existing = rateMap.get(sr);
        if (existing) {
          existing.totalQuantity += entry.quantity;
          existing.totalWeight += entry.weight;
          existing.amount += entry.weight * sr;
        } else {
          rateMap.set(sr, {
            rate: sr,
            totalQuantity: entry.quantity,
            totalWeight: entry.weight,
            amount: entry.weight * sr,
          });
        }
        totalWeight += entry.weight;
      });
    });
    
    const rateClusters = Array.from(rateMap.values()).sort((a, b) => b.rate - a.rate);
    
    // REQ-PUT-002: GA = Σ (NW × SR)
    const grossAmount = rateClusters.reduce((sum, c) => sum + c.amount, 0);
    
    // REQ-PUT-003: Deductions (freight/advance from backend when available; default 0).
    const totalBags = seller.lots.reduce((s, l) => s + l.entries.reduce((s2, e) => s2 + e.quantity, 0), 0);
    const effectiveCoolieMode = overrides?.coolieMode ?? coolieMode;
    const effectiveHamali = overrides?.hamaliEnabled ?? hamaliEnabled;
    const coolieAmount = effectiveCoolieMode === 'FLAT'
      ? totalBags * 5
      : Math.round(totalWeight / 50) * 5;

    const baseDeductions: DeductionItem[] = [
      {
        key: 'freight',
        label: 'Freight',
        amount: 0,
        editable: true,
        autoPulled: false,
      },
      {
        key: 'coolie',
        label: `Coolie / Unloading (${effectiveCoolieMode === 'FLAT' ? 'Flat — per bag' : 'Auto-calculated — by weight'})`,
        amount: coolieAmount,
        editable: true,
        autoPulled: false,
      },
      {
        key: 'weighing',
        label: 'Weighing Charges',
        amount: effectiveHamali ? Math.round(totalWeight * 0.5) : 0,
        editable: true,
        autoPulled: false,
      },
      {
        key: 'advance',
        label: 'Cash Advance',
        amount: 0,
        editable: true,
        autoPulled: false,
      },
      {
        key: 'gunnies',
        label: 'Gunnies',
        amount: overrides?.gunniesAmount ?? gunniesAmount,
        editable: true,
        autoPulled: false,
      },
    ];
    
    const baseTotalDeductions = baseDeductions.reduce((s, d) => s + d.amount, 0);
    const baseNetPayable = grossAmount - baseTotalDeductions;
    
    const createdAt = new Date().toISOString();

    setPattiData({
      pattiId: '', // Server assigns pattiId on save (PT-YYYYMMDD-NNNN).
      sellerName: seller.sellerName,
      rateClusters,
      grossAmount,
      deductions: baseDeductions,
      totalDeductions: baseTotalDeductions,
      netPayable: baseNetPayable,
      createdAt,
      useAverageWeight: useAvgWeight,
    });

    // After base patti is prepared, pull seller-level charges from backend (FreightCalculation).
    void settlementApi
      .getSellerCharges(seller.sellerId)
      .then(charges => {
        const freight = clampMoney(Number(charges.freight ?? 0));
        const advance = clampMoney(Number(charges.advance ?? 0));
        const freightAuto = Boolean(charges.freightAutoPulled) && freight > 0;
        const advanceAuto = Boolean(charges.advanceAutoPulled) && advance > 0;

        setPattiData(current => {
          if (!current) return current;
          const updatedDeductions = current.deductions.map(d => {
            if (d.key === 'freight') {
              return { ...d, amount: freight, autoPulled: freightAuto };
            }
            if (d.key === 'advance') {
              return { ...d, amount: advance, autoPulled: advanceAuto };
            }
            return d;
          });
          const totalDeductions = updatedDeductions.reduce((s, d) => s + d.amount, 0);
          return {
            ...current,
            deductions: updatedDeductions,
            totalDeductions,
            netPayable: current.grossAmount - totalDeductions,
          };
        });

        if (freightAuto || advanceAuto) {
          toast.success('Freight & advance loaded from arrival data');
        }
      })
      .catch(() => {
        // Keep base deductions; user can enter manually.
        toast.warning('Could not load freight/advance — enter manually if needed');
      });
  }, [coolieMode, hamaliEnabled, gunniesAmount, useAvgWeight]);

  // Update deduction amount (clamped to 0..10,000,000, 2 decimal precision)
  const updateDeduction = (key: string, newAmount: number) => {
    if (!pattiData || (!masterEditMode && !pattiData.deductions.find(d => d.key === key)?.editable)) return;
    
    const clamped = clampMoney(newAmount);
    const updated = pattiData.deductions.map(d =>
      d.key === key ? { ...d, amount: clamped } : d
    );
    const totalDeductions = updated.reduce((s, d) => s + d.amount, 0);
    setPattiData({
      ...pattiData,
      deductions: updated,
      totalDeductions,
      netPayable: pattiData.grossAmount - totalDeductions,
    });
  };

  // Add manual voucher deduction (validated: label 5–30 chars, amount ₹0–₹100,000)
  const addManualVoucher = () => {
    if (!pattiData) return;
    const trimmedLabel = manualVoucherLabel.trim();
    if (trimmedLabel.length < VOUCHER_LABEL_MIN || trimmedLabel.length > VOUCHER_LABEL_MAX) {
      toast.error(`Voucher label must be ${VOUCHER_LABEL_MIN}–${VOUCHER_LABEL_MAX} characters`);
      return;
    }
    const rawAmount = parseFloat(manualVoucherAmount);
    if (isNaN(rawAmount) || rawAmount < 0 || rawAmount > VOUCHER_AMOUNT_MAX) {
      toast.error(`Voucher amount must be ₹0–₹${VOUCHER_AMOUNT_MAX.toLocaleString()}`);
      return;
    }
    const key = `manual_${Date.now()}`;
    const amount = clampMoney(rawAmount, 0, VOUCHER_AMOUNT_MAX);
    const newDed: DeductionItem = {
      key,
      label: trimmedLabel,
      amount,
      editable: true,
      autoPulled: false,
    };
    const updated = [...pattiData.deductions, newDed];
    const totalDeductions = updated.reduce((s, d) => s + d.amount, 0);
    setPattiData({
      ...pattiData,
      deductions: updated,
      totalDeductions,
      netPayable: pattiData.grossAmount - totalDeductions,
    });
    setManualVoucherLabel('');
    setManualVoucherAmount('');
    setShowAddVoucher(false);
    toast.success('Manual deduction added');
  };

  // Remove a deduction
  const removeDeduction = (key: string) => {
    if (!pattiData) return;
    const updated = pattiData.deductions.filter(d => d.key !== key);
    const totalDeductions = updated.reduce((s, d) => s + d.amount, 0);
    setPattiData({
      ...pattiData,
      deductions: updated,
      totalDeductions,
      netPayable: pattiData.grossAmount - totalDeductions,
    });
  };

  // Open a saved patti for edit: fetch by id and pre-fill form.
  const openPattiForEdit = useCallback(async (id: number) => {
    try {
      const dto = await settlementApi.getPattiById(id);
      if (!dto) {
        toast.error('Patti not found');
        return;
      }
      const data = mapPattiDTOToPattiData(dto);
      if (data.createdAt && new Date(data.createdAt) > new Date()) {
        toast.warning('Patti date is in the future — please verify');
      }
      setPattiData(data);
      setExistingPattiId(dto.id ?? id);
      setSelectedSeller({
        sellerId: dto.sellerId ?? '',
        sellerName: dto.sellerName ?? '',
        sellerMark: '',
        vehicleNumber: '',
        lots: [],
      });
    } catch {
      toast.error('Failed to load patti');
    }
  }, []);

  // Save patti via backend: update if editing existing, else create.
  const savePatti = async () => {
    if (!pattiData) return;
    const payload = {
      sellerId: selectedSeller?.sellerId,
      sellerName: pattiData.sellerName,
      rateClusters: pattiData.rateClusters,
      grossAmount: pattiData.grossAmount,
      deductions: pattiData.deductions,
      totalDeductions: pattiData.totalDeductions,
      netPayable: pattiData.netPayable,
      useAverageWeight: pattiData.useAverageWeight,
    };
    if (!can('Settlement', existingPattiId != null ? 'Edit' : 'Create')) {
      toast.error('You do not have permission to save settlements.');
      return;
    }
    try {
      if (existingPattiId != null) {
        const updated = await settlementApi.updatePatti(existingPattiId, payload);
        if (updated) {
          setPattiData(prev =>
            prev ? { ...prev, pattiId: updated.pattiId ?? prev.pattiId, createdAt: updated.createdAt ?? prev.createdAt } : null
          );
          toast.success(`Sales Patti ${updated.pattiId} updated!`);
          setShowPrint(true);
          loadSavedPattis();
        } else {
          toast.error('Failed to update patti');
        }
      } else {
        const created = await settlementApi.createPatti(payload);
        if (created?.pattiId) {
          setPattiData(prev =>
            prev ? { ...prev, pattiId: created.pattiId, createdAt: created.createdAt ?? prev.createdAt } : null
          );
          if (created?.id != null) setExistingPattiId(created.id);
          toast.success(`Sales Patti ${created.pattiId} saved!`);
          setShowPrint(true);
          loadSavedPattis();
        } else {
          toast.error('Failed to save patti');
        }
      }
    } catch {
      toast.error(existingPattiId != null ? 'Failed to update patti' : 'Failed to save patti');
    }
  };

  const filteredSellers = useMemo(() => {
    if (!searchQuery) return sellers;
    const q = searchQuery.toLowerCase();
    return sellers.filter(s =>
      s.sellerName.toLowerCase().includes(q) ||
      s.sellerMark.toLowerCase().includes(q) ||
      s.vehicleNumber.toLowerCase().includes(q)
    );
  }, [sellers, searchQuery]);

  const filteredSavedPattis = useMemo(() => {
    if (!searchQuery) return savedPattis;
    const q = searchQuery.toLowerCase();
    return savedPattis.filter(p =>
      (p.pattiId ?? '').toLowerCase().includes(q) ||
      (p.sellerName ?? '').toLowerCase().includes(q)
    );
  }, [savedPattis, searchQuery]);

  // ═══ PRINT PREVIEW ═══
  if (showPrint && pattiData) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-[2rem]">
          <div className="relative z-10 flex items-center gap-3">
            <button onClick={() => setShowPrint(false)}
              aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Printer className="w-5 h-5" /> Sales Patti Print
              </h1>
              <p className="text-white/70 text-xs">{pattiData.pattiId || '(New Patti)'}</p>
            </div>
          </div>
        </div>
        ) : (
        <div className="px-8 py-5 flex items-center gap-4">
          <Button onClick={() => setShowPrint(false)} variant="outline" size="sm" className="rounded-xl h-9">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Printer className="w-5 h-5 text-rose-500" /> Sales Patti Print
            </h2>
            <p className="text-sm text-muted-foreground">{pattiData.pattiId}</p>
          </div>
        </div>
        )}

        <div className="px-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-4 font-mono text-xs space-y-2 shadow-lg">
            <div className="text-center border-b border-dashed border-border pb-2">
              <p className="font-bold text-sm text-foreground">MERCOTRACE</p>
              <p className="text-muted-foreground">Sales Patti (Settlement)</p>
              <p className="text-muted-foreground">{new Date(pattiData.createdAt).toLocaleDateString()} {new Date(pattiData.createdAt).toLocaleTimeString()}</p>
            </div>

            <div className="border-b border-dashed border-border pb-2 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Patti ID</span><span className="font-bold text-foreground">{pattiData.pattiId || '(New Patti)'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span className="font-bold text-foreground">{pattiData.sellerName}</span></div>
              {pattiData.useAverageWeight && <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><span className="font-bold text-amber-500">AVG WEIGHT (Quick Close)</span></div>}
            </div>

            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">RATE CLUSTERS</p>
              {pattiData.rateClusters.map((c, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-foreground">{c.totalQuantity} bags @ ₹{c.rate} ({c.totalWeight.toFixed(0)}kg)</span>
                  <span className="font-bold text-foreground">₹{c.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold">
              <span className="text-foreground">Gross Amount</span>
              <span className="text-foreground">₹{pattiData.grossAmount.toLocaleString()}</span>
            </div>

            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">DEDUCTIONS</p>
              {pattiData.deductions.filter(d => d.amount > 0).map(d => (
                <div key={d.key} className="flex justify-between">
                  <span className="text-muted-foreground">{d.label}{d.autoPulled ? ' (Auto)' : ''}</span>
                  <span className="text-destructive">−₹{d.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t border-dashed border-border pt-1 mt-1">
                <span className="text-foreground">Total Deductions</span>
                <span className="text-destructive">−₹{pattiData.totalDeductions.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-between text-sm border-t border-dashed border-border pt-2">
              <span className="font-bold text-foreground">NET PAYABLE</span>
              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">₹{pattiData.netPayable.toLocaleString()}</span>
            </div>

            <div className="text-center text-muted-foreground/70 text-[9px] border-t border-dashed border-border pt-2 space-y-0.5">
              <p>GA = Σ (NW × SR)</p>
              <p>NP = GA − TD</p>
              <p>TD = Freight + Coolie + Weighing + Advance + Gunnies + Other</p>
            </div>

            <div className="text-center border-t border-dashed border-border pt-2">
              <p className="text-muted-foreground">--- END OF PATTI ---</p>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={async () => {
              const printedAt = new Date().toISOString();
              try {
                await printLogApi.create({
                  reference_type: 'SALES_PATTI',
                  reference_id: pattiData.pattiId,
                  print_type: 'SALES_PATTI',
                  printed_at: printedAt,
                });
              } catch {
                // backend optional
              }
              const ok = await directPrint(generateSalesPattiPrintHTML(pattiData), { mode: "system" });
              ok ? toast.success('Sales Patti sent to printer!') : toast.error('Printer not connected.');
            }}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold shadow-lg">
              <Printer className="w-5 h-5 mr-2" /> Print Patti
            </Button>
            <Button onClick={() => { setShowPrint(false); setPattiData(null); setSelectedSeller(null); setExistingPattiId(null); }}
              variant="outline" className="h-12 rounded-xl px-6">
              Done
            </Button>
          </div>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ PATTI DETAIL SCREEN ═══
  if (selectedSeller && pattiData) {
    const totalBags = selectedSeller.lots.reduce((s, l) => s + l.entries.reduce((s2, e) => s2 + e.quantity, 0), 0);

    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        {/* Header */}
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
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
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => { setSelectedSeller(null); setPattiData(null); setExistingPattiId(null); }}
                aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5" /> Sales Patti
                </h1>
                <p className="text-white/70 text-xs">{pattiData.pattiId || '(New Patti)'}</p>
              </div>
              {/* REQ-PUT-009: Master Edit Mode */}
              <button onClick={() => setMasterEditMode(!masterEditMode)}
                className={cn("px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1",
                  masterEditMode
                    ? "bg-amber-500/30 text-amber-100 border border-amber-400/50"
                    : "bg-white/15 text-white/70")}>
                {masterEditMode ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {masterEditMode ? 'Editing' : 'Locked'}
              </button>
            </div>

            {/* Seller info strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/15 backdrop-blur-md rounded-xl p-2 text-center">
                <User className="w-3.5 h-3.5 text-white/70 mx-auto mb-0.5" />
                <p className="text-[9px] text-white/60 uppercase">Seller</p>
                <p className="text-[11px] font-semibold text-white truncate">{selectedSeller.sellerName}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-md rounded-xl p-2 text-center">
                <Truck className="w-3.5 h-3.5 text-white/70 mx-auto mb-0.5" />
                <p className="text-[9px] text-white/60 uppercase">Vehicle</p>
                <p className="text-[11px] font-semibold text-white truncate">{selectedSeller.vehicleNumber}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-md rounded-xl p-2 text-center">
                <Package className="w-3.5 h-3.5 text-white/70 mx-auto mb-0.5" />
                <p className="text-[9px] text-white/60 uppercase">Bags</p>
                <p className="text-[11px] font-semibold text-white">{totalBags}</p>
              </div>
            </div>
          </div>
        </div>
        ) : (
        <div className="px-8 py-5">
          <div className="flex items-center gap-4 mb-4">
            <Button onClick={() => { setSelectedSeller(null); setPattiData(null); setExistingPattiId(null); }} variant="outline" size="sm" className="rounded-xl h-9">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5 text-rose-500" /> Sales Patti — {selectedSeller.sellerName}
              </h2>
              <p className="text-sm text-muted-foreground">{pattiData.pattiId || '(New Patti)'} · {selectedSeller.vehicleNumber} · {totalBags} bags</p>
            </div>
            <button onClick={() => setMasterEditMode(!masterEditMode)}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all",
                masterEditMode
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-400/30"
                  : "bg-muted/50 text-muted-foreground")}>
              {masterEditMode ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {masterEditMode ? 'Editing' : 'Locked'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-rose-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Seller</p>
              <p className="text-lg font-black text-foreground truncate">{selectedSeller.sellerName}</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-blue-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Vehicle</p>
              <p className="text-lg font-black text-foreground truncate">{selectedSeller.vehicleNumber}</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-amber-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Bags</p>
              <p className="text-lg font-black text-foreground">{totalBags}</p>
            </div>
          </div>
        </div>
        )}

        <div className="px-4 mt-4 space-y-3">
          {/* REQ-PUT-006: Quick Exit / Average Close toggle */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">⚡ Quick Exit Mode</p>
                <p className="text-[10px] text-muted-foreground">Use estimated average weight for early closure</p>
              </div>
              <button onClick={() => {
                setUseAvgWeight(!useAvgWeight);
                if (selectedSeller?.lots?.length) {
                  setTimeout(() => generatePatti(selectedSeller), 50);
                }
              }}
                className={cn("w-12 h-7 rounded-full transition-all relative",
                  useAvgWeight ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-muted/40")}>
                <div className={cn("w-5 h-5 rounded-full bg-white shadow-md absolute top-1 transition-all",
                  useAvgWeight ? "left-6" : "left-1")} />
              </button>
            </div>
          </motion.div>

          {/* REQ-PUT-001: Rate Clusters */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="glass-card rounded-2xl p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              📊 Rate Clusters (Buyer names hidden)
            </p>
            <div className="space-y-2">
              {pattiData.rateClusters.map((cluster, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/20">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-md">
                      <span className="text-white text-[10px] font-bold">₹{cluster.rate}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{cluster.totalQuantity} bags @ ₹{cluster.rate}</p>
                      <p className="text-[10px] text-muted-foreground">{cluster.totalWeight.toFixed(1)} kg net weight</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-foreground">₹{cluster.amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
              <p className="text-xs font-semibold text-muted-foreground">Gross Amount (GA = Σ NW × SR)</p>
              <p className="text-base font-black text-foreground">₹{pattiData.grossAmount.toLocaleString()}</p>
            </div>
          </motion.div>

          {/* Deductions Panel — REQ-PUT-003, REQ-PUT-005, REQ-PUT-007 */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass-card rounded-2xl p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              📋 Deductions Panel (All Editable)
            </p>
            <p className="text-[10px] text-muted-foreground/80 mb-2">
              Freight & Advance: auto-pulled from arrival data when available; otherwise enter manually.
            </p>

            {/* Coolie mode toggle — Flat vs Recalculated per REQ-CNF-005 */}
            <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2.5 rounded-xl bg-muted/20 border border-border/30">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-foreground">Coolie Calculation Mode</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {coolieMode === 'FLAT' ? 'Flat — per bag' : 'Auto — by weight (REQ-CNF-005)'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-[10px] font-medium", coolieMode === 'FLAT' ? "text-foreground" : "text-muted-foreground")}>Flat</span>
                <Switch
                  checked={coolieMode === 'RECALCULATED'}
                  onCheckedChange={(checked) => {
                    const mode = checked ? 'RECALCULATED' : 'FLAT';
                    setCoolieMode(mode);
                    selectedSeller?.lots?.length && generatePatti(selectedSeller, { coolieMode: mode });
                  }}
                  className="scale-90"
                  aria-label="Coolie mode: Flat or Auto-calculated"
                />
                <span className={cn("text-[10px] font-medium", coolieMode === 'RECALCULATED' ? "text-foreground" : "text-muted-foreground")}>Auto</span>
              </div>
            </div>

            {/* Weighing Charges toggle */}
            <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2.5 rounded-xl bg-muted/20 border border-border/30">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-foreground">⚖️ Weighing Charges</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {hamaliEnabled ? 'Enabled — ₹0.50 per kg' : '₹0.50 per kg when on'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-[10px] font-medium", !hamaliEnabled ? "text-foreground" : "text-muted-foreground")}>OFF</span>
                <Switch
                  checked={hamaliEnabled}
                  onCheckedChange={(checked) => {
                    setHamaliEnabled(checked);
                    selectedSeller?.lots?.length && generatePatti(selectedSeller, { hamaliEnabled: checked });
                  }}
                  className="scale-90"
                  aria-label="Weighing charges on or off"
                />
                <span className={cn("text-[10px] font-medium", hamaliEnabled ? "text-foreground" : "text-muted-foreground")}>ON</span>
              </div>
            </div>

            <div className="space-y-2">
              {pattiData.deductions.map(deduction => (
                <div key={deduction.key} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1 truncate">
                      {deduction.label}
                      {deduction.autoPulled && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 text-[8px] font-bold flex-shrink-0">AUTO</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      value={deduction.amount || ''}
                      onChange={e => updateDeduction(deduction.key, parseFloat(e.target.value) || 0)}
                      disabled={!deduction.editable && !masterEditMode}
                      min={0}
                      max={DEDUCTION_MAX}
                      step="0.01"
                      className="h-8 w-24 rounded-lg text-right text-xs font-bold bg-transparent border-border/30"
                    />
                    {deduction.key.startsWith('manual_') && (
                      <button onClick={() => removeDeduction(deduction.key)}
                        className="w-6 h-6 rounded-md bg-destructive/10 flex items-center justify-center">
                        <Minus className="w-3 h-3 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Gunnies input */}
            <div className="flex items-center gap-2 px-3 py-2 mt-2 rounded-xl bg-amber-500/10 border border-amber-400/20">
              <div className="flex-1">
                <p className="text-xs font-semibold text-foreground">🧳 Gunnies Amount</p>
                <p className="text-[9px] text-muted-foreground">Per-seller gunny deduction</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">₹</span>
                <Input type="number" value={gunniesAmount || ''}
                  onChange={e => {
                    const val = clampMoney(parseFloat(e.target.value) || 0, 0, DEDUCTION_MAX);
                    setGunniesAmount(val);
                    selectedSeller?.lots?.length && generatePatti(selectedSeller, { gunniesAmount: val });
                  }}
                  min={0}
                  max={DEDUCTION_MAX}
                  className="h-8 w-24 rounded-lg text-right text-xs font-bold bg-transparent border-amber-400/30"
                />
              </div>
            </div>

            {/* Add Manual Voucher — REQ-PUT-007 */}
            <AnimatePresence>
              {showAddVoucher && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="mt-2 p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2 overflow-hidden">
                  <Input
                    ref={manualVoucherLabelInputRef}
                    placeholder="Voucher / Charge label (5–30 chars)"
                    value={manualVoucherLabel}
                    onChange={e => setManualVoucherLabel(e.target.value.slice(0, VOUCHER_LABEL_MAX))}
                    maxLength={VOUCHER_LABEL_MAX}
                    className={cn("h-8 rounded-lg text-xs",
                      manualVoucherLabel.trim().length > 0 && manualVoucherLabel.trim().length < VOUCHER_LABEL_MIN && "border-amber-400")} />
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Amount ₹ (0–100,000)" value={manualVoucherAmount}
                      onChange={e => setManualVoucherAmount(e.target.value)}
                      min={0}
                      max={VOUCHER_AMOUNT_MAX}
                      step="0.01"
                      className={cn("h-8 rounded-lg text-xs flex-1",
                        manualVoucherAmount && (parseFloat(manualVoucherAmount) < 0 || parseFloat(manualVoucherAmount) > VOUCHER_AMOUNT_MAX) && "border-destructive")} />
                    <Button size="sm" onClick={addManualVoucher} className="h-8 rounded-lg text-xs px-4">Add</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button onClick={() => setShowAddVoucher(!showAddVoucher)}
              className="w-full mt-2 py-2 rounded-xl border border-dashed border-border/50 text-xs text-muted-foreground font-medium flex items-center justify-center gap-1 hover:bg-muted/20 transition-all">
              <PlusCircle className="w-3.5 h-3.5" />
              {showAddVoucher ? 'Cancel' : 'Add Manual Voucher / Charge'}
            </button>

            {/* Totals */}
            <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
              <div className="flex justify-between">
                <p className="text-xs text-muted-foreground">Total Deductions (TD)</p>
                <p className="text-sm font-bold text-destructive">−₹{pattiData.totalDeductions.toLocaleString()}</p>
              </div>
            </div>
          </motion.div>

          {/* Footer — REQ-PUT-004 */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="glass-card rounded-2xl p-4 border-2 border-emerald-500/30">
            {pattiData.netPayable < 0 && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/40">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  ⚠️ Net Payable is negative — deductions exceed gross amount
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Check if Freight/Advance are correct for this sale. Seller may owe balance.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gross Amount</span>
                <span className="font-bold text-foreground">₹{pattiData.grossAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Deductions</span>
                <span className="font-bold text-destructive">−₹{pattiData.totalDeductions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-lg border-t border-border/50 pt-2">
                <span className="font-bold text-foreground">Net Payable</span>
                <span className={cn("font-black text-lg",
                  pattiData.netPayable >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                  ₹{pattiData.netPayable.toLocaleString()}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground text-center">NP = GA − TD</p>
            </div>

            <Button onClick={savePatti}
              disabled={!pattiData.rateClusters.length}
              className={cn("w-full mt-4 h-12 rounded-xl text-white font-bold text-base shadow-lg",
                pattiData.rateClusters.length
                  ? "bg-gradient-to-r from-emerald-500 to-green-500"
                  : "bg-muted cursor-not-allowed opacity-50")}>
              <Save className="w-5 h-5 mr-2" /> {existingPattiId != null ? 'Update' : 'Save'} & Close Patti
            </Button>
            {selectedSeller?.lots?.length ? (
              <Button onClick={() => { setExistingPattiId(null); generatePatti(selectedSeller); }} variant="outline"
                className="w-full mt-2 h-10 rounded-xl text-sm">
                Start new patti (same seller)
              </Button>
            ) : null}
          </motion.div>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ SELLER LIST SCREEN ═══
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      {!isDesktop ? (
      <div className="bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
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
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate('/home')} aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-xl font-black">₹</span> Settlement (Sales Patti)
              </h1>
              <p className="text-white/70 text-xs mt-0.5">{sellers.length} sellers · Settlement & payment reconciliation</p>
            </div>
          </div>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setSettlementMode('new')}
              className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                settlementMode === 'new'
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                  : 'bg-white/10 text-white/70 hover:text-white')}>
              <User className="w-4 h-4" /> New Patti
            </button>
            <button onClick={() => setSettlementMode('saved')}
              className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                settlementMode === 'saved'
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                  : 'bg-white/10 text-white/70 hover:text-white')}>
              <FileText className="w-4 h-4" /> Saved Pattis
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input aria-label="Search" placeholder={settlementMode === 'new' ? 'Search seller, mark, vehicle…' : 'Search patti ID, seller…'}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30" />
          </div>
        </div>
      </div>
      ) : (
      <div className="px-8 py-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <span className="text-xl font-black text-rose-500">₹</span> Settlement (Sales Patti)
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{sellers.length} sellers · Settlement & payment reconciliation</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex gap-2">
            <button onClick={() => setSettlementMode('new')}
              className={cn("px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all",
                settlementMode === 'new' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md' : 'glass-card text-muted-foreground hover:text-foreground')}>
              <User className="w-4 h-4" /> New Patti
            </button>
            <button onClick={() => setSettlementMode('saved')}
              className={cn("px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all",
                settlementMode === 'saved' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md' : 'glass-card text-muted-foreground hover:text-foreground')}>
              <FileText className="w-4 h-4" /> Saved Pattis
            </button>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input aria-label="Search" placeholder={settlementMode === 'new' ? 'Search seller, mark, vehicle…' : 'Search patti ID, seller…'}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50" />
          </div>
        </div>
      </div>
      )}

      <div className="px-4 mt-4 space-y-4">
        {settlementMode === 'saved' ? (
          /* Saved pattis tab */
          loadingPattis ? (
            <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filteredSavedPattis.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">
                {savedPattis.length === 0 ? 'No saved pattis found' : 'No matching pattis'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {savedPattis.length === 0 ? 'Create a patti from the New Patti tab' : 'Try a different search'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSavedPattis.map((p) => (
                <motion.button
                  key={p.id ?? p.pattiId}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => p.id != null && openPattiForEdit(p.id)}
                  className="w-full glass-card rounded-2xl p-4 text-left hover:shadow-lg transition-all group flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow flex-shrink-0">
                    <Edit3 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{p.pattiId || '(No ID)'}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.sellerName}</p>
                    {p.createdAt && (
                      <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                        {new Date(p.createdAt).toLocaleDateString()} {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-foreground">₹{p.netPayable?.toLocaleString()}</p>
                    <span className="text-xs font-medium text-primary">Open</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )
        ) : (
          /* New patti tab — sellers list */
          filteredSellers.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">
              {sellers.length === 0 ? 'No completed auctions yet' : 'No matching sellers'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {sellers.length === 0 ? 'Complete an auction to generate settlements' : 'Try a different search'}
            </p>
            {sellers.length === 0 && (
              <Button onClick={() => navigate('/auctions')} className="mt-4 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-xl">
                Go to Auctions
              </Button>
            )}
          </div>
        ) : (
          filteredSellers.map((seller, i) => {
            const totalBags = seller.lots.reduce((s, l) => s + l.entries.reduce((s2, e) => s2 + e.quantity, 0), 0);
            const totalAmount = seller.lots.reduce(
              (s, l) => s + l.entries.reduce((s2, e) => s2 + e.weight * sellerSettlementRatePerBag(e), 0),
              0
            );
            return (
              <motion.button key={seller.sellerId}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => generatePatti(seller)}
                className="w-full glass-card rounded-2xl p-4 text-left hover:shadow-lg transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-md flex-shrink-0">
                    <span className="text-white font-black text-sm">{seller.sellerMark || seller.sellerName.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{seller.sellerName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>🚛 {seller.vehicleNumber}</span>
                      <span>•</span>
                      <span>{totalBags} bags</span>
                      <span>•</span>
                      <span>{seller.lots.length} lot(s)</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-foreground">₹{totalAmount.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">est. gross</p>
                  </div>
                </div>
              </motion.button>
            );
          })
        )
        )}
      </div>
      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default SettlementPage;