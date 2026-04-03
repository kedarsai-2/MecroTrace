import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, FileText, Search, User, Users, Package, Truck,
  Edit3, Save, Printer, PlusCircle, Receipt, Scale, Gavel, IndianRupee, Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { printLogApi, settlementApi, type PattiDTO } from '@/services/api';
import { directPrint } from '@/utils/printTemplates';
import { generateSalesPattiPrintHTML, type PattiPrintData } from '@/utils/printDocumentTemplates';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
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
// ── Types ─────────────────────────────────────────────────
interface SellerSettlement {
  sellerId: string;
  sellerName: string;
  sellerMark: string;
  vehicleNumber: string;
  fromLocation?: string;
  sellerSerialNo?: string | number;
  createdAt?: string;
  date?: string;
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

function normalizeVehicleKey(v: string | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function totalBagsForSeller(s: SellerSettlement): number {
  return s.lots.reduce((acc, l) => acc + l.entries.reduce((a2, e) => a2 + (Number(e.quantity) || 0), 0), 0);
}

/** Sum of net weights on settlement entries (weighing / defaulted). */
function totalWeighedWeightForSeller(s: SellerSettlement): number {
  return s.lots.reduce(
    (acc, l) => acc + l.entries.reduce((a2, e) => a2 + (Number(e.weight) || 0), 0),
    0
  );
}

/** Sales Pad style estimate: Σ (bags × 50 kg) when actual weight not yet applied. */
function totalPadEstimateWeightForSeller(s: SellerSettlement): number {
  return s.lots.reduce(
    (acc, l) => acc + l.entries.reduce((a2, e) => a2 + (Number(e.quantity) || 0) * 50, 0),
    0
  );
}

function formatOptionalKg(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

function formatOptionalInt(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return String(Math.round(value));
}

function formatRupeeInr(value: number): string {
  return `₹ ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Per-seller registration form (Sales report). Wire save/update to contacts API later. */
interface SellerRegFormState {
  sellerRegistration: 'registered' | 'unregistered';
  mark: string;
  name: string;
  mobile: string;
}

interface SellerExpenseFormState {
  freight: number;
  unloading: number;
  weighman: number;
  cashAdvance: number;
  others: number;
}

interface SellerExpenseVoucher {
  id: string;
  voucher: string;
  narration: string;
  receivable: number;
  remaining: number;
  received: number;
}

function lotSalesRow(lot: SettlementLot) {
  const qty = lot.entries.reduce((s, e) => s + (Number(e.quantity) || 0), 0);
  const weight = lot.entries.reduce((s, e) => s + (Number(e.weight) || 0), 0);
  const amount = lot.entries.reduce((s, e) => s + (Number(e.weight) || 0) * sellerSettlementRatePerBag(e), 0);
  const avg = qty > 0 ? weight / qty : 0;
  const ratePerWeight = weight > 0 ? amount / weight : 0;
  return {
    itemLabel: lot.lotName || lot.commodityName || '—',
    qty,
    weight,
    avg,
    ratePerWeight,
    amount,
  };
}

/** User edits in Sales report table (per lot row). */
interface LotSalesOverride {
  qty?: number;
  weight?: number;
  ratePerWeight?: number;
}

function hasLotSalesOverride(o: LotSalesOverride | undefined): boolean {
  if (!o) return false;
  return o.qty !== undefined || o.weight !== undefined || o.ratePerWeight !== undefined;
}

/** Merge API lot totals with optional user overrides. Amount = rate/weight × weight (₹/kg × kg). */
function mergeLotDisplayRow(lot: SettlementLot, o: LotSalesOverride | undefined) {
  const base = lotSalesRow(lot);
  if (!hasLotSalesOverride(o)) return base;
  const qty = o!.qty !== undefined ? o!.qty : base.qty;
  const weight = o!.weight !== undefined ? o!.weight : base.weight;
  const ratePerWeight = o!.ratePerWeight !== undefined ? o!.ratePerWeight : base.ratePerWeight;
  const amount = ratePerWeight * weight;
  const avg = qty > 0 ? weight / qty : 0;
  return {
    ...base,
    qty,
    weight,
    avg,
    ratePerWeight,
    amount,
  };
}

/** Stable row id for delete/hide when `lotId` is missing from API. */
function lotStableId(lot: SettlementLot, index: number): string {
  if (lot.lotId && String(lot.lotId).trim()) return String(lot.lotId).trim();
  return `__idx_${index}_${encodeURIComponent(lot.lotName || '')}_${encodeURIComponent(lot.commodityName || '')}`;
}

function buildRateClustersFromSellerLots(
  seller: SellerSettlement,
  removedIds: Set<string>,
  lotOverrides?: Record<string, LotSalesOverride>
): RateCluster[] {
  const rateMap = new Map<number, RateCluster>();
  seller.lots.forEach((lot, i) => {
    const sid = lotStableId(lot, i);
    if (removedIds.has(sid)) return;
    const ov = lotOverrides?.[sid];
    if (hasLotSalesOverride(ov)) {
      const row = mergeLotDisplayRow(lot, ov);
      const qty = row.qty;
      const weight = row.weight;
      const amount = row.amount;
      const ratePerBag = qty > 0 ? amount / qty : 0;
      const existing = rateMap.get(ratePerBag);
      if (existing) {
        existing.totalQuantity += qty;
        existing.totalWeight += weight;
        existing.amount += amount;
      } else {
        rateMap.set(ratePerBag, {
          rate: ratePerBag,
          totalQuantity: qty,
          totalWeight: weight,
          amount,
        });
      }
      return;
    }
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
    });
  });
  return Array.from(rateMap.values()).sort((a, b) => b.rate - a.rate);
}

function defaultSellerExpenses(): SellerExpenseFormState {
  return { freight: 0, unloading: 0, weighman: 0, cashAdvance: 0, others: 0 };
}

function buildSellerSubPattiPrintData(
  seller: SellerSettlement,
  displayName: string,
  expenses: SellerExpenseFormState,
  removedIds: Set<string>,
  pattiId: string,
  createdAt: string,
  lotOverrides?: Record<string, LotSalesOverride>
): PattiPrintData {
  const rateClusters = buildRateClustersFromSellerLots(seller, removedIds, lotOverrides);
  const grossAmount = rateClusters.reduce((s, c) => s + c.amount, 0);
  const deductions = [
    { key: 'freight', label: 'Freight Amount', amount: expenses.freight, autoPulled: false },
    { key: 'unloading', label: 'Unloading Charges', amount: expenses.unloading, autoPulled: false },
    { key: 'weighman', label: 'Weighman Charges', amount: expenses.weighman, autoPulled: false },
    { key: 'advance', label: 'Cash Advance', amount: expenses.cashAdvance, autoPulled: false },
    { key: 'others', label: 'Others', amount: expenses.others, autoPulled: false },
  ];
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const subLabel = pattiId ? `${pattiId} · Sub` : 'Sub-patti';
  return {
    pattiId: subLabel,
    sellerName: displayName,
    rateClusters,
    grossAmount,
    deductions,
    totalDeductions,
    netPayable: grossAmount - totalDeductions,
    createdAt,
    useAverageWeight: false,
  };
}

function isSellerRegDirty(current: SellerRegFormState | undefined, baseline: SellerRegFormState | undefined): boolean {
  if (!current || !baseline) return false;
  return (
    current.mark !== baseline.mark ||
    current.name !== baseline.name ||
    current.mobile !== baseline.mobile
  );
}

function defaultSellerForm(seller: SellerSettlement): SellerRegFormState {
  return {
    sellerRegistration: 'registered',
    mark: seller.sellerMark || '',
    name: seller.sellerName || '',
    mobile: '',
  };
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
  const [settlementMainTab, setSettlementMainTab] = useState<'arrival-summary' | 'create-settlements'>('arrival-summary');
  const [arrivalSummaryTab, setArrivalSummaryTab] = useState<'new-patti' | 'saved-patti'>('new-patti');
  const [hasArrivalSelection, setHasArrivalSelection] = useState(false);
  
  // Patti state
  const [pattiData, setPattiData] = useState<PattiData | null>(null);
  const [existingPattiId, setExistingPattiId] = useState<number | null>(null);
  const [savedPattis, setSavedPattis] = useState<PattiDTO[]>([]);
  const [loadingPattis, setLoadingPattis] = useState(false);
  const [coolieMode, setCoolieMode] = useState<'FLAT' | 'RECALCULATED'>('FLAT');
  const [hamaliEnabled, setHamaliEnabled] = useState(false);
  const [gunniesAmount, setGunniesAmount] = useState(0);
  const [showPrint, setShowPrint] = useState(false);

  /** Placeholder for freight / payable summary — wire to API later. */
  const [freightPayableSummary] = useState({
    arrivalFreightAmount: 0,
    freightInvoiced: 0,
    payableFromSales: 0,
    payableInvoiced: 0,
  });
  const [invoiceNameSearch, setInvoiceNameSearch] = useState('');

  /** Lot IDs removed from UI per seller (pending API sync). */
  const [removedLotsBySellerId, setRemovedLotsBySellerId] = useState<Record<string, string[]>>({});
  const [deleteLotConfirm, setDeleteLotConfirm] = useState<{ sellerId: string; lotId: string; itemLabel: string } | null>(
    null
  );
  const saveMainPattiShortcutRef = useRef<() => void>(() => {});

  const [sellerFormById, setSellerFormById] = useState<Record<string, SellerRegFormState>>({});
  const [registeredBaselineById, setRegisteredBaselineById] = useState<Record<string, SellerRegFormState>>({});
  const [sellerExpensesById, setSellerExpensesById] = useState<Record<string, SellerExpenseFormState>>({});
  const [expenseVouchersBySellerId, setExpenseVouchersBySellerId] = useState<Record<string, SellerExpenseVoucher[]>>({});
  const [expenseModalState, setExpenseModalState] = useState<{
    open: boolean;
    sellerId: string;
    sellerName: string;
    voucherNumber: string;
    narration: string;
  }>({ open: false, sellerId: '', sellerName: '', voucherNumber: '', narration: '' });

  /** Per-seller per-lot edits for Sales report qty / weight / rate-per-kg. */
  const [lotSalesOverridesBySellerId, setLotSalesOverridesBySellerId] = useState<
    Record<string, Record<string, LotSalesOverride>>
  >({});

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
    setRemovedLotsBySellerId({});
    setLotSalesOverridesBySellerId({});
    setSelectedSeller(seller);
    setHasArrivalSelection(true);

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
      useAverageWeight: false,
    });
  }, [coolieMode, hamaliEnabled, gunniesAmount]);

  // Open a saved patti for edit: fetch by id and pre-fill form.
  const openPattiForEdit = useCallback(async (id: number) => {
    try {
      const dto = await settlementApi.getPattiById(id);
      if (!dto) {
        toast.error('Patti not found');
        return;
      }
      setRemovedLotsBySellerId({});
      setLotSalesOverridesBySellerId({});
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

  saveMainPattiShortcutRef.current = () => {
    void savePatti();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 's' && e.key !== 'S')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      saveMainPattiShortcutRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  /** Vehicle-level summary for the patti form (first row unchanged; this drives the second card). */
  const vehicleFormDetails = useMemo(() => {
    if (!selectedSeller || !pattiData) return null;

    const pattiNetWeight = pattiData.rateClusters.reduce((s, c) => s + (Number(c.totalWeight) || 0), 0);
    const vKey = normalizeVehicleKey(selectedSeller.vehicleNumber);
    const sameVehicleSellers = vKey ? sellers.filter(s => normalizeVehicleKey(s.vehicleNumber) === vKey) : [];
    const scope = sameVehicleSellers.length > 0 ? sameVehicleSellers : [selectedSeller];

    const scopeHasLotData = scope.some(s => s.lots.some(l => (l.entries?.length ?? 0) > 0));

    const arrivalQty = scope.reduce((acc, s) => acc + totalBagsForSeller(s), 0);
    const arrivalWeight = scope.reduce((acc, s) => acc + totalWeighedWeightForSeller(s), 0);
    const salesPadNetWeight = scope.reduce((acc, s) => acc + totalPadEstimateWeightForSeller(s), 0);

    return {
      vKey,
      sellersCount: vKey ? scope.length : null,
      arrivalQty: scopeHasLotData ? arrivalQty : null,
      arrivalWeightKg: scopeHasLotData ? arrivalWeight : null,
      salesPadNetWeightKg: scopeHasLotData ? salesPadNetWeight : null,
      pattiNetWeightKg: pattiNetWeight,
    };
  }, [sellers, selectedSeller, pattiData]);

  /** All sellers on the same vehicle as the current settlement (arrival scope). */
  const arrivalSellersForPatti = useMemo(() => {
    if (!selectedSeller || !pattiData) return [];
    const vKey = normalizeVehicleKey(selectedSeller.vehicleNumber);
    if (!vKey) return [selectedSeller];
    const scope = sellers.filter(s => normalizeVehicleKey(s.vehicleNumber) === vKey);
    return scope.length > 0 ? scope : [selectedSeller];
  }, [sellers, selectedSeller, pattiData]);

  useEffect(() => {
    if (!selectedSeller || !pattiData) return;
    setSellerFormById(prev => {
      let changed = false;
      const next = { ...prev };
      for (const s of arrivalSellersForPatti) {
        if (!next[s.sellerId]) {
          changed = true;
          next[s.sellerId] = {
            sellerRegistration: 'registered',
            mark: s.sellerMark || '',
            name: s.sellerName || '',
            mobile: '',
          };
        }
      }
      return changed ? next : prev;
    });
    setRegisteredBaselineById(prev => {
      let changed = false;
      const next = { ...prev };
      for (const s of arrivalSellersForPatti) {
        if (!next[s.sellerId]) {
          changed = true;
          next[s.sellerId] = {
            sellerRegistration: 'registered',
            mark: s.sellerMark || '',
            name: s.sellerName || '',
            mobile: '',
          };
        }
      }
      return changed ? next : prev;
    });
    setSellerExpensesById(prev => {
      let changed = false;
      const next = { ...prev };
      for (const s of arrivalSellersForPatti) {
        if (!next[s.sellerId]) {
          changed = true;
          next[s.sellerId] = { freight: 0, unloading: 0, weighman: 0, cashAdvance: 0, others: 0 };
        }
      }
      return changed ? next : prev;
    });
  }, [arrivalSellersForPatti, selectedSeller, pattiData]);

  /** Keep main patti rate clusters / gross in sync with lot row edits (primary seller only). */
  useEffect(() => {
    if (!selectedSeller?.lots?.length) return;
    setPattiData(prev => {
      if (!prev) return null;
      const removed = new Set(removedLotsBySellerId[selectedSeller.sellerId] ?? []);
      const ov = lotSalesOverridesBySellerId[selectedSeller.sellerId];
      const clusters = buildRateClustersFromSellerLots(selectedSeller, removed, ov);
      const gross = clusters.reduce((s, c) => s + c.amount, 0);
      const sameGross = Math.abs(prev.grossAmount - gross) < 0.01;
      const sameClusters = JSON.stringify(prev.rateClusters) === JSON.stringify(clusters);
      if (sameGross && sameClusters) return prev;
      return { ...prev, rateClusters: clusters, grossAmount: gross, netPayable: gross - prev.totalDeductions };
    });
  }, [selectedSeller, removedLotsBySellerId, lotSalesOverridesBySellerId]);

  const setLotSalesField = useCallback((sellerId: string, sid: string, field: keyof LotSalesOverride, raw: string) => {
    setLotSalesOverridesBySellerId(prev => {
      const curSeller = { ...(prev[sellerId] ?? {}) };
      const curLot = { ...(curSeller[sid] ?? {}) };
      if (raw.trim() === '') {
        delete curLot[field];
      } else {
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return prev;
        curLot[field] = field === 'qty' ? Math.round(n) : n;
      }
      if (Object.keys(curLot).length === 0) {
        delete curSeller[sid];
      } else {
        curSeller[sid] = curLot;
      }
      if (Object.keys(curSeller).length === 0) {
        const next = { ...prev };
        delete next[sellerId];
        return next;
      }
      return { ...prev, [sellerId]: curSeller };
    });
  }, []);

  const runPrintMainPatti = useCallback(async () => {
    if (!pattiData) return;
    const printedAt = new Date().toISOString();
    try {
      await printLogApi.create({
        reference_type: 'SALES_PATTI',
        reference_id: pattiData.pattiId,
        print_type: 'SALES_PATTI',
        printed_at: printedAt,
      });
    } catch {
      /* optional */
    }
    const ok = await directPrint(generateSalesPattiPrintHTML(pattiData), { mode: 'system' });
    if (ok) toast.success('Main patti sent to printer');
    else toast.error('Printer not connected.');
  }, [pattiData]);

  const runPrintSellerSubPatti = useCallback(
    async (seller: SellerSettlement) => {
      if (!pattiData) return;
      const form = sellerFormById[seller.sellerId] ?? defaultSellerForm(seller);
      const displayName = form.name || seller.sellerName;
      const exp = sellerExpensesById[seller.sellerId] ?? defaultSellerExpenses();
      const removedSet = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
      const payload = buildSellerSubPattiPrintData(
        seller,
        displayName,
        exp,
        removedSet,
        pattiData.pattiId,
        pattiData.createdAt,
        lotSalesOverridesBySellerId[seller.sellerId]
      );
      const ok = await directPrint(generateSalesPattiPrintHTML(payload), { mode: 'system' });
      if (ok) toast.success('Seller sub-patti sent to printer');
      else toast.error('Printer not connected.');
    },
    [pattiData, sellerFormById, sellerExpensesById, removedLotsBySellerId, lotSalesOverridesBySellerId]
  );

  const runPrintAllSubPatti = useCallback(async () => {
    if (!pattiData) return;
    for (const s of arrivalSellersForPatti) {
      const form = sellerFormById[s.sellerId] ?? defaultSellerForm(s);
      const displayName = form.name || s.sellerName;
      const exp = sellerExpensesById[s.sellerId] ?? defaultSellerExpenses();
      const removedSet = new Set(removedLotsBySellerId[s.sellerId] ?? []);
      const payload = buildSellerSubPattiPrintData(
        s,
        displayName,
        exp,
        removedSet,
        pattiData.pattiId,
        pattiData.createdAt,
        lotSalesOverridesBySellerId[s.sellerId]
      );
      const ok = await directPrint(generateSalesPattiPrintHTML(payload), { mode: 'system' });
      if (!ok) {
        toast.error(`Print failed or cancelled for ${displayName}`);
        return;
      }
    }
    toast.success('All sub-pattis sent to printer');
  }, [pattiData, arrivalSellersForPatti, sellerFormById, sellerExpensesById, removedLotsBySellerId, lotSalesOverridesBySellerId]);

  const openExpenseModal = useCallback((seller: SellerSettlement, displayName: string) => {
    setExpenseModalState({
      open: true,
      sellerId: seller.sellerId,
      sellerName: displayName || seller.sellerName || 'Seller',
      voucherNumber: '',
      narration: '',
    });
  }, []);

  const addExpenseVoucherRow = useCallback(() => {
    const voucher = expenseModalState.voucherNumber.trim();
    const narration = expenseModalState.narration.trim();
    if (!expenseModalState.sellerId) return;
    if (!voucher || !narration) {
      toast.message('Enter voucher number and name.');
      return;
    }
    setExpenseVouchersBySellerId(prev => {
      const nextRow: SellerExpenseVoucher = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        voucher,
        narration,
        receivable: 0,
        remaining: 0,
        received: 0,
      };
      return {
        ...prev,
        [expenseModalState.sellerId]: [...(prev[expenseModalState.sellerId] ?? []), nextRow],
      };
    });
    setExpenseModalState(prev => ({ ...prev, voucherNumber: '', narration: '' }));
  }, [expenseModalState]);

  const getSellerLots = (seller: SellerSettlement): number =>
    seller.lots.reduce((s, l) => s + l.entries.reduce((s2, e) => s2 + e.quantity, 0), 0);

  const getSellerBids = (seller: SellerSettlement): number =>
    seller.lots.reduce((s, l) => s + l.entries.length, 0);

  const getSellerWeighed = (seller: SellerSettlement): number =>
    seller.lots.reduce((s, l) => s + l.entries.reduce((s2, e) => s2 + (e.weight > 0 ? e.quantity : 0), 0), 0);

  const sellerDateLabel = (seller: SellerSettlement): string => {
    const rawDate = seller.createdAt ?? seller.date;
    if (!rawDate) return '-';
    const d = new Date(rawDate);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
  };

  const renderArrivalSummaryTable = (tab: 'new-patti' | 'saved-patti') => {
    const rows = tab === 'new-patti' ? filteredSellers : filteredSavedPattis;

    if (tab === 'new-patti' && filteredSellers.length === 0) {
      return (
        <div className="glass-card rounded-2xl p-8 text-center">
          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            {sellers.length === 0 ? 'No arrivals found' : 'No matching arrivals'}
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
      );
    }

    if (tab === 'saved-patti' && loadingPattis) {
      return <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</div>;
    }

    if (tab === 'saved-patti' && filteredSavedPattis.length === 0) {
      return (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            {savedPattis.length === 0 ? 'No saved pattis found' : 'No matching pattis'}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {savedPattis.length === 0 ? 'Create a patti from New Patti tab' : 'Try a different search'}
          </p>
        </div>
      );
    }

    return (
      <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Vehicle Number</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Seller Name</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">From</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">SL No</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Lots</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Bids</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Weighed</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {tab === 'new-patti'
                ? filteredSellers.map((seller) => (
                    <tr
                      key={seller.sellerId}
                      onClick={() => generatePatti(seller)}
                      className="border-t border-border/30 hover:bg-muted/20 cursor-pointer"
                    >
                      <td className="px-3 py-2 text-foreground">{seller.vehicleNumber || '-'}</td>
                      <td className="px-3 py-2 text-foreground">{seller.sellerName || '-'}</td>
                      <td className="px-3 py-2 text-foreground">{seller.fromLocation || '-'}</td>
                      <td className="px-3 py-2 text-foreground">{seller.sellerSerialNo || '-'}</td>
                      <td className="px-3 py-2 text-foreground">{getSellerLots(seller)}</td>
                      <td className="px-3 py-2 text-foreground">{getSellerBids(seller)}</td>
                      <td className="px-3 py-2 text-foreground">{getSellerWeighed(seller)}</td>
                      <td className="px-3 py-2 text-amber-600 dark:text-amber-400 font-medium">New Patti</td>
                      <td className="px-3 py-2 text-foreground">{sellerDateLabel(seller)}</td>
                    </tr>
                  ))
                : filteredSavedPattis.map((p) => (
                    <tr
                      key={p.id ?? p.pattiId}
                      onClick={() => p.id != null && openPattiForEdit(p.id)}
                      className="border-t border-border/30 hover:bg-muted/20 cursor-pointer"
                    >
                      <td className="px-3 py-2 text-foreground">-</td>
                      <td className="px-3 py-2 text-foreground">{p.sellerName || '-'}</td>
                      <td className="px-3 py-2 text-foreground">-</td>
                      <td className="px-3 py-2 text-foreground">-</td>
                      <td className="px-3 py-2 text-foreground">-</td>
                      <td className="px-3 py-2 text-foreground">-</td>
                      <td className="px-3 py-2 text-foreground">-</td>
                      <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-medium">Completed Patti</td>
                      <td className="px-3 py-2 text-foreground">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ═══ PRINT PREVIEW ═══
  if (showPrint && pattiData) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18)_0%,transparent_50%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.2)_0%,transparent_42%)]" />
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
              <Printer className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Sales Patti Print
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
              if (ok) toast.success('Sales Patti sent to printer!');
              else toast.error('Printer not connected.');
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
        <div className="bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.2)_0%,transparent_42%)]" />
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
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Sales Patti — {selectedSeller.sellerName}
              </h2>
              <p className="text-sm text-muted-foreground">{pattiData.pattiId || '(New Patti)'} · {selectedSeller.vehicleNumber} · {totalBags} bags</p>
            </div>
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

        <div className="mt-4 space-y-3 px-4 sm:px-6 lg:px-8">
          {vehicleFormDetails && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-2xl border border-border/50 p-4 sm:p-5"
            >
              <h3 className="mb-4 text-center text-base font-bold tracking-tight text-foreground sm:text-lg">
                Vehicle details
              </h3>
              <div className="grid grid-cols-2 gap-2.5 text-center sm:gap-3 xl:grid-cols-5 xl:gap-4">
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-cyan-500/20 bg-muted/30 px-2.5 py-3 sm:rounded-2xl sm:px-3 sm:py-4">
                  <Users className="h-4 w-4 text-cyan-600 dark:text-cyan-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sellers</p>
                  <p className="text-xl font-black tabular-nums text-foreground sm:text-2xl md:text-3xl">{formatOptionalInt(vehicleFormDetails.sellersCount)}</p>
                </div>
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-500/20 bg-muted/30 px-2.5 py-3 sm:rounded-2xl sm:px-3 sm:py-4">
                  <Package className="h-4 w-4 text-amber-600 dark:text-amber-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Arrival Qty</p>
                  <p className="text-xl font-black tabular-nums text-foreground sm:text-2xl md:text-3xl">{formatOptionalInt(vehicleFormDetails.arrivalQty)}</p>
                </div>
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-muted/30 px-2.5 py-3 sm:rounded-2xl sm:px-3 sm:py-4">
                  <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Arrival Weight</p>
                  <p className="text-base font-black tabular-nums text-foreground sm:text-xl md:text-2xl">{formatOptionalKg(vehicleFormDetails.arrivalWeightKg)}</p>
                </div>
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-violet-500/20 bg-muted/30 px-2.5 py-3 sm:rounded-2xl sm:px-3 sm:py-4">
                  <Gavel className="h-4 w-4 text-violet-600 dark:text-violet-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase leading-tight text-muted-foreground">Sales Pad Net Wt</p>
                  <p className="text-base font-black tabular-nums text-foreground sm:text-xl md:text-2xl">{formatOptionalKg(vehicleFormDetails.salesPadNetWeightKg)}</p>
                </div>
                <div className="col-span-2 flex flex-col items-center gap-1.5 rounded-xl border border-fuchsia-500/20 bg-muted/30 px-2.5 py-3 sm:rounded-2xl sm:px-3 sm:py-4 xl:col-span-1">
                  <Receipt className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400 sm:h-5 sm:w-5" aria-hidden />
                  <p className="text-[10px] font-bold uppercase leading-tight text-muted-foreground">Patti Net Wt</p>
                  <p className="text-base font-black tabular-nums text-foreground sm:text-xl md:text-2xl">{formatOptionalKg(vehicleFormDetails.pattiNetWeightKg)}</p>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02 }}
            className="glass-card rounded-2xl border border-border/50 p-4 sm:p-5"
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
              <div className="min-w-0 sm:pr-4 sm:border-r sm:border-border/50">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 ring-1 ring-teal-500/20 dark:text-teal-400"
                    aria-hidden
                  >
                    <Truck className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground sm:text-base">Freight Amount</p>
                    <div className="mt-3 space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Arrival Freight Amount</span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatRupeeInr(freightPayableSummary.arrivalFreightAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Invoiced</span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatRupeeInr(freightPayableSummary.freightInvoiced)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400"
                    aria-hidden
                  >
                    <IndianRupee className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground sm:text-base">Payable</p>
                    <div className="mt-3 space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">From Sales</span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatRupeeInr(freightPayableSummary.payableFromSales)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Invoiced</span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatRupeeInr(freightPayableSummary.payableInvoiced)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="glass-card overflow-hidden rounded-2xl border border-border/50"
          >
            <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 px-4 py-3 dark:from-indigo-950/35 dark:via-blue-950/25 dark:to-cyan-950/20 sm:px-5 sm:py-3.5">
              <p className="text-center text-sm font-bold tracking-tight text-foreground sm:text-base">
                Expenses &amp; invoice
              </p>
              <p className="mt-1 text-center text-xs leading-relaxed text-muted-foreground">
                Add freight, unloading, weighman, cash advance, and other charges per seller in the Sales report.
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full shrink-0 rounded-xl border-dashed border-primary/40 bg-background/60 font-semibold sm:h-10 sm:w-auto sm:min-w-[9rem]"
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
                <div className="w-full min-w-0 flex-1 sm:max-w-md">
                  <label htmlFor="settlement-invoice-name-search" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    Invoice Name
                  </label>
                  <Input
                    id="settlement-invoice-name-search"
                    type="search"
                    placeholder="Search invoice name…"
                    value={invoiceNameSearch}
                    onChange={e => setInvoiceNameSearch(e.target.value)}
                    className="h-10 rounded-xl border-border/60 bg-background/80"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="glass-card rounded-2xl border border-border/50 p-4 sm:p-5"
          >
            <h3 className="mb-4 text-center text-base font-bold tracking-tight text-foreground sm:text-lg">Sales report</h3>
            <div className="space-y-4">
              {arrivalSellersForPatti.map(seller => {
                const form = sellerFormById[seller.sellerId] ?? defaultSellerForm(seller);
                const baseline = registeredBaselineById[seller.sellerId] ?? form;
                const exp = sellerExpensesById[seller.sellerId] ?? defaultSellerExpenses();
                const dirty = isSellerRegDirty(form, baseline);
                const removedSet = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
                const lotOv = lotSalesOverridesBySellerId[seller.sellerId] ?? {};
                const visibleLots = (seller.lots ?? [])
                  .map((lot, i) => ({ lot, i, sid: lotStableId(lot, i) }))
                  .filter(x => !removedSet.has(x.sid));
                const lotRows = visibleLots.map(({ lot, sid }) => mergeLotDisplayRow(lot, lotOv[sid]));
                const qtyTot = lotRows.reduce((s, r) => s + r.qty, 0);
                const weightTot = lotRows.reduce((s, r) => s + r.weight, 0);
                const amountTot = lotRows.reduce((s, r) => s + r.amount, 0);
                const expenseTotal =
                  exp.freight + exp.unloading + exp.weighman + exp.cashAdvance + exp.others;
                const netSeller = amountTot - expenseTotal;

                return (
                  <div
                    key={seller.sellerId}
                    id={`settlement-seller-card-${seller.sellerId}`}
                    className="rounded-2xl border border-border/60 bg-muted/10 p-3 sm:p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seller source</span>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`reg-${seller.sellerId}`}
                          className="h-4 w-4 accent-primary"
                          checked={form.sellerRegistration === 'registered'}
                          onChange={() =>
                            setSellerFormById(prev => {
                              const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                              return { ...prev, [seller.sellerId]: { ...cur, sellerRegistration: 'registered' } };
                            })
                          }
                        />
                        Registered
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`reg-${seller.sellerId}`}
                          className="h-4 w-4 accent-primary"
                          checked={form.sellerRegistration === 'unregistered'}
                          onChange={() =>
                            setSellerFormById(prev => {
                              const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                              return { ...prev, [seller.sellerId]: { ...cur, sellerRegistration: 'unregistered' } };
                            })
                          }
                        />
                        Unregistered
                      </label>
                    </div>

                    <div className="mb-4 rounded-xl border border-border/50 bg-card/80 p-3 sm:p-4">
                      <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
                        <div className="min-w-[6rem] max-w-[7rem] shrink-0 sm:min-w-0 sm:max-w-none sm:flex-1">
                          <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Mark
                          </label>
                          <Input
                            value={form.mark}
                            onChange={e =>
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                return { ...prev, [seller.sellerId]: { ...cur, mark: e.target.value } };
                              })
                            }
                            className="h-9 rounded-lg text-sm"
                          />
                        </div>
                        <div className="min-w-[7.5rem] flex-1 sm:min-w-[8rem]">
                          <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Seller name
                          </label>
                          <Input
                            value={form.name}
                            onChange={e =>
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                return { ...prev, [seller.sellerId]: { ...cur, name: e.target.value } };
                              })
                            }
                            className="h-9 min-w-0 rounded-lg text-sm"
                          />
                        </div>
                        <div className="min-w-[6.5rem] max-w-[8rem] shrink-0 sm:max-w-[9rem] sm:flex-initial">
                          <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Mobile
                          </label>
                          <Input
                            value={form.mobile}
                            onChange={e =>
                              setSellerFormById(prev => {
                                const cur = prev[seller.sellerId] ?? defaultSellerForm(seller);
                                return { ...prev, [seller.sellerId]: { ...cur, mobile: e.target.value } };
                              })
                            }
                            className="h-9 rounded-lg text-sm"
                            inputMode="tel"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 shrink-0 self-end rounded-xl px-3 text-xs sm:px-4 sm:text-sm"
                          disabled={form.sellerRegistration === 'registered' && !dirty}
                          onClick={() => {
                            if (form.sellerRegistration === 'unregistered') {
                              toast.message('Register seller — connect to contacts API next');
                              return;
                            }
                            toast.message('Update seller — connect to contacts API next');
                          }}
                        >
                          {form.sellerRegistration === 'unregistered' ? 'Register seller' : 'Update'}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border/40 bg-background/30">
                        <table className="w-full min-w-[720px] border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-border/60 bg-muted/50 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              <th className="px-2 py-2.5 text-center">#</th>
                              <th className="px-2 py-2.5 text-center">Item</th>
                              <th className="px-2 py-2.5 text-center">Quantity</th>
                              <th className="px-2 py-2.5 text-center">Weight (kg)</th>
                              <th className="px-2 py-2.5 text-center">Average</th>
                              <th className="px-2 py-2.5 text-center">Rate/Weight</th>
                              <th className="px-2 py-2.5 text-center">Amount</th>
                              <th className="px-2 py-2.5 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(seller.lots ?? []).length === 0 || visibleLots.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">
                                  No lots for this seller
                                </td>
                              </tr>
                            ) : (
                              visibleLots.map(({ lot, sid }, displayIdx) => {
                                const row = mergeLotDisplayRow(lot, lotOv[sid]);
                                return (
                                  <tr key={sid} className="border-b border-border/40 bg-background/40 text-center hover:bg-muted/20">
                                    <td className="px-2 py-2 tabular-nums text-foreground">{displayIdx + 1}</td>
                                    <td className="px-2 py-2 font-medium text-foreground">{row.itemLabel}</td>
                                    <td className="px-1 py-1 align-middle">
                                      <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className="mx-auto h-8 w-[4.25rem] rounded-md border-border/60 px-1 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        value={row.qty}
                                        onChange={e => setLotSalesField(seller.sellerId, sid, 'qty', e.target.value)}
                                        aria-label="Quantity"
                                      />
                                    </td>
                                    <td className="px-1 py-1 align-middle">
                                      <Input
                                        type="number"
                                        min={0}
                                        step={0.1}
                                        className="mx-auto h-8 w-[4.75rem] rounded-md border-border/60 px-1 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        value={Number.isFinite(row.weight) ? row.weight : 0}
                                        onChange={e => setLotSalesField(seller.sellerId, sid, 'weight', e.target.value)}
                                        aria-label="Weight kg"
                                      />
                                    </td>
                                    <td className="px-2 py-2 tabular-nums text-foreground">{row.avg.toFixed(2)}</td>
                                    <td className="px-1 py-1 align-middle">
                                      <Input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        className="mx-auto h-8 w-[4.75rem] rounded-md border-border/60 px-1 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        value={Number.isFinite(row.ratePerWeight) ? row.ratePerWeight : 0}
                                        onChange={e => setLotSalesField(seller.sellerId, sid, 'ratePerWeight', e.target.value)}
                                        aria-label="Rate per kg"
                                      />
                                    </td>
                                    <td className="px-2 py-2 tabular-nums font-medium text-foreground">{Math.round(row.amount)}</td>
                                    <td className="px-2 py-2 text-center">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        aria-label="Remove row"
                                        onClick={() =>
                                          setDeleteLotConfirm({
                                            sellerId: seller.sellerId,
                                            lotId: sid,
                                            itemLabel: row.itemLabel,
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          {visibleLots.length > 0 ? (
                            <tfoot>
                              <tr className="border-t-2 border-border/70 bg-muted/35 text-[11px] font-bold text-foreground">
                                <td colSpan={2} className="px-2 py-2.5 text-center">
                                  Total
                                </td>
                                <td className="px-2 py-2.5 text-center tabular-nums">{qtyTot}</td>
                                <td className="px-2 py-2.5 text-center tabular-nums">{weightTot.toFixed(1)}</td>
                                <td className="px-2 py-2.5 text-center" />
                                <td className="px-2 py-2.5 text-center" />
                                <td className="px-2 py-2.5 text-center tabular-nums">{Math.round(amountTot)}</td>
                                <td className="px-2 py-2.5 text-center" />
                              </tr>
                            </tfoot>
                          ) : null}
                        </table>
                      </div>

                      <div className="w-full shrink-0 overflow-hidden rounded-xl border border-border/50 bg-muted/20 lg:w-56">
                        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 px-3 py-2.5 dark:from-indigo-950/35 dark:via-blue-950/25 dark:to-cyan-950/20">
                          <p className="text-center text-sm font-bold text-foreground">Expenses</p>
                        </div>
                        <div className="space-y-2 p-3 text-xs">
                          {(
                            [
                              ['freight', 'Freight Amount'],
                              ['unloading', 'Unloading Charges'],
                              ['weighman', 'Weighman Charges'],
                              ['cashAdvance', 'Cash Advance'],
                              ['others', 'Others'],
                            ] as const
                          ).map(([key, label]) => (
                            <div key={key} className="flex items-center justify-between gap-2">
                              <span className="text-center text-muted-foreground">{label}</span>
                              <Input
                                id={key === 'freight' ? `settlement-seller-expense-${seller.sellerId}-freight` : undefined}
                                type="number"
                                min={0}
                                step="0.01"
                                className="h-8 w-24 rounded-md text-center text-xs tabular-nums"
                                value={exp[key] === 0 ? '' : exp[key]}
                                onChange={e => {
                                  const v = clampMoney(parseFloat(e.target.value) || 0);
                                  setSellerExpensesById(prev => {
                                    const e0 = prev[seller.sellerId] ?? defaultSellerExpenses();
                                    return {
                                      ...prev,
                                      [seller.sellerId]: { ...e0, [key]: v },
                                    };
                                  });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1 border-t border-border/50 p-3 pt-2 text-xs">
                          <div className="flex justify-between font-semibold">
                            <span className="text-center">Total</span>
                            <span className="tabular-nums text-center">{Math.round(expenseTotal)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-foreground">
                            <span className="text-center">Net payable</span>
                            <span className="tabular-nums text-center text-emerald-600 dark:text-emerald-400">
                              {Math.round(netSeller)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-xl text-xs sm:text-sm"
                        onClick={() => void runPrintSellerSubPatti(seller)}
                      >
                        <Printer className="mr-1.5 h-3.5 w-3.5" />
                        Print seller sub patti
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-xl text-xs sm:text-sm"
                        onClick={() => {
                          if (selectedSeller?.sellerId === seller.sellerId) void savePatti();
                          else {
                            toast.message(
                              'Open this seller as the primary settlement to save their main patti, or use Save Main Patti for the current primary seller.'
                            );
                          }
                        }}
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        Save patti
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-9 rounded-xl text-xs sm:text-sm"
                        onClick={() => openExpenseModal(seller, form.name || seller.sellerName)}
                      >
                        <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                        Add expense
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="glass-card rounded-2xl border border-border/50 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              <Button
                onClick={() => void savePatti()}
                disabled={!pattiData.rateClusters.length}
                className={cn(
                  'h-12 rounded-xl font-bold shadow-md sm:min-w-[11rem]',
                  pattiData.rateClusters.length
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white'
                    : 'cursor-not-allowed opacity-50'
                )}
              >
                <Save className="mr-2 h-5 w-5" />
                Save Main Patti
                <span className="ml-2 text-[10px] font-semibold opacity-90 sm:text-[11px]">(Alt S)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-blue-500/40 font-semibold sm:min-w-[10rem]"
                disabled={!pattiData.rateClusters.length}
                onClick={() => void runPrintMainPatti()}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print main patti
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-indigo-500/40 font-semibold sm:min-w-[10rem]"
                onClick={() => void runPrintAllSubPatti()}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print all sub patti
              </Button>
            </div>
          </motion.div>

          <Dialog
            open={expenseModalState.open}
            onOpenChange={open => {
              setExpenseModalState(prev => ({ ...prev, open }));
            }}
          >
            <DialogContent className="max-w-3xl rounded-2xl">
              <DialogHeader>
                <DialogTitle>Add Expense Vouchers to {expenseModalState.sellerName}</DialogTitle>
                <DialogDescription>
                  Enter voucher number and name, then add it to the list.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Enter Voucher Number</label>
                  <Input
                    value={expenseModalState.voucherNumber}
                    onChange={e => setExpenseModalState(prev => ({ ...prev, voucherNumber: e.target.value }))}
                    placeholder="Voucher number"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Enter Name</label>
                  <Input
                    value={expenseModalState.narration}
                    onChange={e => setExpenseModalState(prev => ({ ...prev, narration: e.target.value }))}
                    placeholder="Narration / name"
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-[11px] font-semibold text-muted-foreground">
                      <th className="px-3 py-2 text-center">Action</th>
                      <th className="px-3 py-2 text-center">Voucher</th>
                      <th className="px-3 py-2 text-center">Narration</th>
                      <th className="px-3 py-2 text-center">Receivable</th>
                      <th className="px-3 py-2 text-center">Remaining</th>
                      <th className="px-3 py-2 text-center">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(expenseVouchersBySellerId[expenseModalState.sellerId] ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-5 text-center text-muted-foreground">
                          No vouchers added yet.
                        </td>
                      </tr>
                    ) : (
                      (expenseVouchersBySellerId[expenseModalState.sellerId] ?? []).map(v => (
                        <tr key={v.id} className="border-t border-border/40">
                          <td className="px-3 py-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                setExpenseVouchersBySellerId(prev => ({
                                  ...prev,
                                  [expenseModalState.sellerId]: (prev[expenseModalState.sellerId] ?? []).filter(x => x.id !== v.id),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                          <td className="px-3 py-2 text-center">{v.voucher}</td>
                          <td className="px-3 py-2 text-center">{v.narration}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{v.receivable.toFixed(2)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{v.remaining.toFixed(2)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{v.received.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <DialogFooter className="gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setExpenseModalState(prev => ({ ...prev, open: false }))}
                >
                  Close
                </Button>
                <Button type="button" className="rounded-xl" onClick={addExpenseVoucherRow}>
                  <PlusCircle className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={deleteLotConfirm != null}
            onOpenChange={open => {
              if (!open) setDeleteLotConfirm(null);
            }}
          >
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this lot row?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteLotConfirm
                    ? `“${deleteLotConfirm.itemLabel}” will be removed from this sales report for now. Regenerate the patti from the arrival list to restore full lot lines.`
                    : null}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (!deleteLotConfirm) return;
                    const { sellerId, lotId } = deleteLotConfirm;
                    setRemovedLotsBySellerId(prev => ({
                      ...prev,
                      [sellerId]: [...(prev[sellerId] ?? []), lotId],
                    }));
                    setDeleteLotConfirm(null);
                  }}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ SELLER LIST SCREEN ═══
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      {!isDesktop ? (
      <div className="bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.2)_0%,transparent_42%)]" />
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
          <div className="mb-3 flex gap-2 rounded-2xl bg-white/10 p-1 backdrop-blur-sm">
            <button onClick={() => setSettlementMainTab('arrival-summary')}
              className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all touch-manipulation",
                settlementMainTab === 'arrival-summary'
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                  : 'bg-white/10 text-white/70 hover:text-white')}>
              <FileText className="w-4 h-4" /> Arrival Summary
            </button>
            <button
              type="button"
              disabled={!hasArrivalSelection}
              aria-disabled={!hasArrivalSelection}
              onClick={() => {
                if (!hasArrivalSelection) {
                  toast.message('Select an arrival bill first.');
                  return;
                }
                setSettlementMainTab('create-settlements');
              }}
              className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all touch-manipulation",
                !hasArrivalSelection && "cursor-not-allowed opacity-55",
                settlementMainTab === 'create-settlements'
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                  : 'bg-white/10 text-white/70 hover:text-white')}>
              <Edit3 className="w-4 h-4" /> Create Sattlements
            </button>
          </div>
          {!hasArrivalSelection && (
            <p className="mb-3 text-center text-[11px] text-white/70">
              Tap any arrival bill row first to enable Create Sattlements.
            </p>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input aria-label="Search" placeholder="Search by vehicle, seller name..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30" />
          </div>
        </div>
      </div>
      ) : (
      <div className="px-8 py-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">₹</span> Settlement (Sales Patti)
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{sellers.length} sellers · Settlement & payment reconciliation</p>
        </div>
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex gap-2 rounded-2xl bg-muted/30 p-1">
            <button onClick={() => setSettlementMainTab('arrival-summary')}
              className={cn("px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all",
                settlementMainTab === 'arrival-summary' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md' : 'glass-card text-muted-foreground hover:text-foreground')}>
              <FileText className="w-4 h-4" /> Arrival Summary
            </button>
            <button
              type="button"
              disabled={!hasArrivalSelection}
              aria-disabled={!hasArrivalSelection}
              onClick={() => {
                if (!hasArrivalSelection) {
                  toast.message('Select an arrival bill first.');
                  return;
                }
                setSettlementMainTab('create-settlements');
              }}
              className={cn("px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all",
                !hasArrivalSelection && "cursor-not-allowed opacity-55",
                settlementMainTab === 'create-settlements' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md' : 'glass-card text-muted-foreground hover:text-foreground')}>
              <Edit3 className="w-4 h-4" /> Create Sattlements
            </button>
          </div>
          {!hasArrivalSelection && (
            <p className="text-xs text-muted-foreground">
              Select any arrival bill to enable Create Sattlements.
            </p>
          )}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input aria-label="Search" placeholder="Search by vehicle, seller name..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50" />
          </div>
        </div>
      </div>
      )}

      <div className="px-4 mt-4 space-y-4">
        {settlementMainTab === 'arrival-summary' ? (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => setArrivalSummaryTab('new-patti')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                  arrivalSummaryTab === 'new-patti'
                    ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                    : 'glass-card text-muted-foreground hover:text-foreground'
                )}
              >
                New Patti
              </button>
              <button
                onClick={() => setArrivalSummaryTab('saved-patti')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                  arrivalSummaryTab === 'saved-patti'
                    ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                    : 'glass-card text-muted-foreground hover:text-foreground'
                )}
              >
                Saved Patti
              </button>
            </div>
            {renderArrivalSummaryTable(arrivalSummaryTab)}
          </>
        ) : (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Edit3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Create Sattlements form section is ready.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Structure added. Share the form layout and fields next, and I will implement it.
            </p>
          </div>
        )}
      </div>
      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default SettlementPage;