import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import {
  ArrowLeft, Plus, Truck, Scale, ChevronDown, ChevronUp, Trash2,
  AlertTriangle, Search, Package, Users, Banknote, FileText, Pencil, Filter, Share2, MapPin
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { contactApi, arrivalsApi, commodityApi } from '@/services/api';
import type { ArrivalSummary, ArrivalCreatePayload, ArrivalFullDetail, ArrivalDetail } from '@/services/api/arrivals';
import ArrivalStatusBadge, { getArrivalStatus, ALL_STATUSES, type ArrivalStatus } from '@/components/arrivals/ArrivalStatusBadge';
import FreightDetailsCard from '@/components/arrivals/FreightDetailsCard';
import SellerInfoCard from '@/components/arrivals/SellerInfoCard';
import BuyerMarkSection from '@/components/arrivals/BuyerMarkSection';
import LocationSearchInput from '@/components/LocationSearchInput';
import type { Vehicle, Contact, FreightMethod } from '@/types/models';
import { toast } from 'sonner';
import { useDesktopMode } from '@/hooks/use-desktop';
import useAutofocusWhen from '@/hooks/useAutofocusWhen';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';

/**
 * ArrivalsPage — SRS Part 2: Inward Logistics (REQ-ARR-001 to REQ-ARR-013)
 *
 * Hierarchical structure (REQ-ARR-010):
 *   Vehicle → Multiple Sellers → Multiple Lots
 *
 * Screens:
 *   3.3.1 Vehicle & Tonnage Entry
 *   3.3.2 Seller & Lot Entry
 *   3.3.3 Financial Trigger Logic
 *   3.3.5 Rental & Advance Logic
 *   3.3.6 Validation & Constraints
 */

// ── Types for local arrival data ──────────────────────────
interface LotEntry {
  lot_id: string;
  lot_name: string;
  quantity: number; // bag count
  commodity_name: string;
  broker_tag: string;
  variant: string;
}

interface SellerEntry {
  seller_vehicle_id: string;
  contact_id: string;
  seller_name: string;
  seller_phone: string;
  seller_mark: string;
  lots: LotEntry[];
}

interface ArrivalRecord {
  vehicle: Vehicle;
  loaded_weight: number;
  empty_weight: number;
  deducted_weight: number;
  net_weight: number;       // REQ-ARR-001: LW - EW
  final_billable_weight: number; // REQ-ARR-001: NW - DW
  freight_method: FreightMethod;
  freight_rate: number;
  freight_total: number;
  no_rental: boolean;
  advance_paid: number;
  broker_name: string;
  sellers: SellerEntry[];
  is_multi_seller: boolean;
  godown: string;
  gatepass_number: string;
}

const FREIGHT_METHODS: { value: FreightMethod; label: string }[] = [
  { value: 'BY_WEIGHT', label: 'By Weight' },
  { value: 'BY_COUNT', label: 'By Count' },
  { value: 'LUMPSUM', label: 'Lumpsum' },
  { value: 'DIVIDE_BY_WEIGHT', label: 'Lumpsum + Divide by Weight' },
];

const NARRATION_PRESETS = [
  'Freight for vehicle arrival',
  'Coolie charges for unloading',
  'Advance paid to driver',
  'Rental charges — partial payment',
];

/** Variant options (hardcoded for now; will be dynamic later). */
const VARIANT_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'Small', label: 'Small' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Large', label: 'Large' },
];

/**
 * Bag totals for lot headers are constant per render:
 * - vehicleTotal: total bags for the whole vehicle (all sellers, all lots)
 * - sellerTotal: total bags for this seller (all lots of that seller)
 */

const ArrivalsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Arrivals');
  const [apiArrivals, setApiArrivals] = useState<ArrivalSummary[]>([]);
  const [apiArrivalsLoading, setApiArrivalsLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [commodities, setCommodities] = useState<any[]>([]);
  const [commodityConfigs, setCommodityConfigs] = useState<any[]>([]);
  const [expandedArrival, setExpandedArrival] = useState<number | null>(null);
  const [desktopTab, setDesktopTab] = useState<'summary' | 'new-arrival'>('summary');

  // Form state for new arrival — in-memory only (no localStorage). Drafts are session-only; backend draft API not implemented.
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState<number>(1);
  const [isMultiSeller, setIsMultiSeller] = useState<boolean>(true);

  // Step 1: Vehicle & Tonnage
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [loadedWeight, setLoadedWeight] = useState('');
  const [emptyWeight, setEmptyWeight] = useState('');
  const [deductedWeight, setDeductedWeight] = useState('');
  const [freightMethod, setFreightMethod] = useState<FreightMethod>('BY_WEIGHT');
  const [freightRate, setFreightRate] = useState('');
  const [noRental, setNoRental] = useState(false);
  const [advancePaid, setAdvancePaid] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [brokerContactId, setBrokerContactId] = useState<number | null>(null);
  const [narration, setNarration] = useState('');
  const [godown, setGodown] = useState('');
  const [gatepassNumber, setGatepassNumber] = useState('');
  const [origin, setOrigin] = useState('');
  const [variant, setVariant] = useState('');

  // Expand panel: full detail from API (desktop row expand / mobile card expand)
  const [expandedDetail, setExpandedDetail] = useState<ArrivalFullDetail | null>(null);
  const [expandedDetailLoading, setExpandedDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [summaryMode, setSummaryMode] = useState<'arrivals' | 'sellers' | 'lots'>('arrivals');
  const [statusFilter, setStatusFilter] = useState<ArrivalStatus | 'ALL'>('ALL');
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const [editingVehicleId, setEditingVehicleId] = useState<number | string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const editBaselineSnapshotRef = useRef<string | null>(null);

  // Broker: contact search or type any name
  const [brokerDropdown, setBrokerDropdown] = useState(false);
  const brokerSearchWrapRef = useRef<HTMLDivElement>(null);
  const [brokerDropdownPos, setBrokerDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // Step 2: Sellers & Lots
  const [sellers, setSellers] = useState<SellerEntry[]>([]);
  const [sellerExpanded, setSellerExpanded] = useState<Record<string, boolean>>({});
  const lotsScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingLotsScrollToEndSellerIdRef = useRef<string | null>(null);
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerDropdown, setSellerDropdown] = useState(false);
  const sellerSearchWrapRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // Inline autofocus targets for the "New Arrival" panel/sheet.
  // We keep one ref per target because only one layout branch renders at a time.
  const vehicleNumberInputRef = useRef<HTMLInputElement | null>(null);
  const loadedWeightInputRef = useRef<HTMLInputElement | null>(null);

  const setLotsScrollRef = useCallback((sellerId: string) => (el: HTMLDivElement | null) => {
    lotsScrollRefs.current[sellerId] = el;
  }, []);

  const isStep1PanelOpen =
    step === 1 &&
    !editLoading &&
    (isDesktop ? desktopTab === 'new-arrival' : showAdd);

  useAutofocusWhen(isStep1PanelOpen && isMultiSeller, vehicleNumberInputRef);
  useAutofocusWhen(isStep1PanelOpen && !isMultiSeller, loadedWeightInputRef);

  const isArrivalPanelOpen = isDesktop ? desktopTab === 'new-arrival' : showAdd;

  const serializeSellersForDirty = useCallback((list: SellerEntry[]) => {
    return list.map((s) => ({
      seller_vehicle_id: s.seller_vehicle_id,
      contact_id: s.contact_id,
      seller_name: s.seller_name,
      seller_phone: s.seller_phone,
      seller_mark: s.seller_mark,
      lots: s.lots.map((l) => ({
        lot_id: l.lot_id,
        lot_name: l.lot_name,
        quantity: l.quantity,
        commodity_name: l.commodity_name,
        broker_tag: l.broker_tag,
        variant: l.variant,
      })),
    }));
  }, []);

  const isArrivalDirty = useMemo(() => {
    if (!isArrivalPanelOpen) return false;
    if (editLoading) return false;

    if (editingVehicleId != null) {
      if (!editBaselineSnapshotRef.current) return false;

      const currentSnapshot = JSON.stringify({
        step,
        isMultiSeller,
        vehicleNumber,
        loadedWeight,
        emptyWeight,
        deductedWeight,
        freightMethod,
        freightRate,
        noRental,
        advancePaid,
        brokerName,
        brokerContactId,
        narration,
        godown,
        gatepassNumber,
        origin,
        sellers: serializeSellersForDirty(sellers),
      });

      return currentSnapshot !== editBaselineSnapshotRef.current;
    }

    // New arrival: treat any user-entered progress as dirty,
    // even if validation fails and "Save" ends up disabled.
    const hasStep2Data = step > 1 || sellers.length > 0;
    if (hasStep2Data) return true;

    const hasMeaningfulStep1Data = [
      vehicleNumber.trim(),
      loadedWeight.trim(),
      emptyWeight.trim(),
      deductedWeight.trim(),
      freightMethod !== 'BY_WEIGHT' ? 'changedFreightMethod' : '',
      freightRate.trim(),
      noRental ? 'noRental' : '',
      advancePaid.trim(),
      brokerName.trim(),
      brokerContactId != null ? 'brokerSelected' : '',
      narration.trim(),
      godown.trim(),
      gatepassNumber.trim(),
      origin.trim(),
    ].some(Boolean);

    return hasMeaningfulStep1Data;
  }, [
    isArrivalPanelOpen,
    editLoading,
    editingVehicleId,
    step,
    isMultiSeller,
    vehicleNumber,
    loadedWeight,
    emptyWeight,
    deductedWeight,
    freightMethod,
    freightRate,
    noRental,
    advancePaid,
    brokerName,
    brokerContactId,
    narration,
    godown,
    gatepassNumber,
    origin,
    sellers,
    serializeSellersForDirty,
  ]);

  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isArrivalDirty,
  });

  const tryCloseArrivalPanel = useCallback(
    async (closeFn: () => void) => {
      const ok = await confirmIfDirty();
      if (!ok) return;
      closeFn();
    },
    [confirmIfDirty],
  );

  const openNewArrivalPanel = useCallback(() => {
    void (async () => {
      const ok = await confirmIfDirty();
      if (!ok) return;
      resetForm();
      setDesktopTab('new-arrival');
    })();
  }, [confirmIfDirty]);

  const refreshBrokerDropdownPos = useCallback(() => {
    if (brokerSearchWrapRef.current) {
      const rect = brokerSearchWrapRef.current.getBoundingClientRect();
      setBrokerDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  const refreshDropdownPos = useCallback(() => {
    if (sellerSearchWrapRef.current) {
      const rect = sellerSearchWrapRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  // ── Validation (raghav branch: field-level checks; no UI wiring — validation only) ──────────────────
  const isLoadedWeightInvalid = useMemo(() => {
    if (!loadedWeight || !loadedWeight.trim()) return true;
    const lw = parseFloat(loadedWeight);
    if (Number.isNaN(lw)) return true;
    return lw < 0 || lw > 100000;
  }, [loadedWeight]);

  const isEmptyWeightInvalid = useMemo(() => {
    const lw = parseFloat(loadedWeight) || 0;
    const ew = parseFloat(emptyWeight) || 0;
    if (!emptyWeight || !emptyWeight.trim()) return true;
    if (Number.isNaN(parseFloat(emptyWeight))) return true;
    if (ew < 0 || ew > 100000) return true;
    return ew > lw;
  }, [loadedWeight, emptyWeight]);

  const isDeductedWeightInvalid = useMemo(() => {
    if (!deductedWeight || !deductedWeight.trim()) return false;
    const dw = parseFloat(deductedWeight) || 0;
    return dw < 0 || dw > 10000;
  }, [deductedWeight]);

  const isVehicleNumberInvalid = useMemo(() => {
    if (!isMultiSeller) return false;
    const v = vehicleNumber.trim();
    return v.length === 0 || v.length < 2 || v.length > 12;
  }, [isMultiSeller, vehicleNumber]);

  const isGodownInvalid = useMemo(() => {
    const g = godown.trim();
    if (!g) return false;
    if (g.length < 2 || g.length > 50) return true;
    return !/^[a-zA-Z\s]+$/.test(g);
  }, [godown]);

  const isGatepassNumberInvalid = useMemo(() => {
    const g = gatepassNumber.trim();
    if (!g) return false;
    if (g.length < 1 || g.length > 30) return true;
    return !/^[a-zA-Z0-9]+$/.test(g);
  }, [gatepassNumber]);

  const isBrokerNameInvalid = useMemo(() => {
    const b = brokerName.trim();
    if (!b) return false;
    if (b.length < 2 || b.length > 100) return true;
    return !/^[a-zA-Z\s]+$/.test(b);
  }, [brokerName]);

  const isFreightRateInvalid = useMemo(() => {
    if (noRental) return false;
    if (!freightRate || !freightRate.trim()) return true;
    const fr = parseFloat(freightRate);
    if (Number.isNaN(fr)) return true;
    return fr < 0 || fr > 100000;
  }, [noRental, freightRate]);

  const isAdvancePaidInvalid = useMemo(() => {
    if (!advancePaid || !advancePaid.trim()) return false;
    const ap = parseFloat(advancePaid) || 0;
    return ap < 0 || ap > 1000000;
  }, [advancePaid]);

  // Per-seller / per-lot real-time validation (same rules as submit; used for inline UI only)
  const isSellerNameInvalid = (s: SellerEntry) => {
    if (s.contact_id !== '' && !Number.isNaN(Number(s.contact_id))) return false;
    const n = (s.seller_name ?? '').trim();
    if (!n) return false; // required is enforced on submit
    return n.length < 2 || n.length > 100;
  };
  const isSellerMarkInvalid = (s: SellerEntry, sellerIdx?: number) => !!getSellerMarkError(s, sellerIdx);
  const getSellerMarkError = (s: SellerEntry, sellerIdx?: number): string | null => {
    const m = (s.seller_mark ?? '').trim();
    if (!m) return null;
    if (m.length < 2 || m.length > 50) return '2–50 characters if set';
    const markLower = m.toLowerCase();
    const dupIdx = sellers.findIndex((o, i) => i !== sellerIdx && (o.seller_mark ?? '').trim().toLowerCase() === markLower);
    if (dupIdx >= 0) return 'This mark is already in use by another seller';
    const isDynamic = s.contact_id === '' || Number.isNaN(Number(s.contact_id));
    if (isDynamic && contacts.some(c => c.mark && c.mark.toLowerCase() === markLower)) return 'This mark is already in use by a contact';
    return null;
  };
  const isLotNameInvalid = (l: LotEntry) => {
    const ln = (l.lot_name ?? '').trim();
    if (!ln) return false;
    if (ln.length < 2 || ln.length > 50) return true;
    // Lot names are stored and submitted as strings; allow alphanumeric plus common separators.
    return !/^[a-zA-Z0-9][a-zA-Z0-9\s_\-]*$/.test(ln);
  };
  const isLotQuantityInvalid = (l: LotEntry) => {
    const q = l.quantity ?? 0;
    return q <= 0 || q > 100000 || !Number.isInteger(q);
  };

  const lotNameCountsBySellerId = useMemo(() => {
    return sellers.reduce<Record<string, Record<string, number>>>((acc, seller) => {
      const inner: Record<string, number> = {};
      for (const lot of seller.lots) {
        const key = (lot.lot_name ?? '').trim().toLowerCase();
        if (!key) continue;
        inner[key] = (inner[key] ?? 0) + 1;
      }
      acc[seller.seller_vehicle_id] = inner;
      return acc;
    }, {});
  }, [sellers]);

  const getLotNameDuplicateError = (sellerIdx: number, lotIdx: number): string | null => {
    const seller = sellers[sellerIdx];
    const lot = seller?.lots[lotIdx];
    const ln = (lot?.lot_name ?? '').trim();
    if (!ln) return null;
    const counts = lotNameCountsBySellerId[seller?.seller_vehicle_id ?? ''] ?? {};
    return (counts[ln.toLowerCase()] ?? 0) > 1 ? 'Lot Name already exists for this seller' : null;
  };

  const isLotNameDuplicateInvalid = (sellerIdx: number, lotIdx: number) =>
    getLotNameDuplicateError(sellerIdx, lotIdx) != null;

  const canAddAnotherLot = (seller: SellerEntry) => {
    if (seller.lots.length === 0) return true;
    const counts = lotNameCountsBySellerId[seller.seller_vehicle_id] ?? {};
    return seller.lots.every((lot) => {
      const lotName = (lot.lot_name ?? '').trim();
      if (!lotName) return false;
      const key = lotName.toLowerCase();
      if ((counts[key] ?? 0) > 1) return false;
      return !isLotNameInvalid(lot) && !isLotQuantityInvalid(lot);
    });
  };

  const isFormInvalid = useMemo(() => {
    if (isVehicleNumberInvalid || isLoadedWeightInvalid || isEmptyWeightInvalid || isDeductedWeightInvalid ||
        isGodownInvalid || isGatepassNumberInvalid || isBrokerNameInvalid || isFreightRateInvalid || isAdvancePaidInvalid) return true;
    for (let i = 0; i < sellers.length; i++) {
      const s = sellers[i];
      if (isSellerNameInvalid(s) || isSellerMarkInvalid(s, i)) return true;
      for (let li = 0; li < s.lots.length; li++) {
        const l = s.lots[li];
        if (isLotNameInvalid(l) || isLotQuantityInvalid(l) || isLotNameDuplicateInvalid(i, li)) return true;
      }
    }
    return false;
  }, [isVehicleNumberInvalid, isLoadedWeightInvalid, isEmptyWeightInvalid, isDeductedWeightInvalid, isGodownInvalid, isGatepassNumberInvalid, isBrokerNameInvalid, isFreightRateInvalid, isAdvancePaidInvalid, sellers, contacts, lotNameCountsBySellerId, isLotNameDuplicateInvalid, isSellerMarkInvalid]);

  // Summary stats for four cards (mobile-first, same as raghav-style UI)
  const totalVehicles = useMemo(() => apiArrivals.length, [apiArrivals]);
  const totalSellers = useMemo(() => apiArrivals.reduce((acc, a) => acc + (a.sellerCount ?? 0), 0), [apiArrivals]);
  const totalLots = useMemo(() => apiArrivals.reduce((acc, a) => acc + (a.lotCount ?? 0), 0), [apiArrivals]);
  const totalNetWeightKg = useMemo(() => apiArrivals.reduce((acc, a) => acc + (a.netWeight ?? 0), 0), [apiArrivals]);
  const totalNetWeightTons = useMemo(() => (totalNetWeightKg > 0 ? totalNetWeightKg / 1000 : 0), [totalNetWeightKg]);

  const filteredArrivals = useMemo(() => {
    let result = apiArrivals;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(a => {
        if (String(a.vehicleNumber).toLowerCase().includes(q)) return true;
        const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
        if (detail?.sellers?.some(s => (s.sellerName ?? '').toLowerCase().includes(q))) return true;
        return false;
      });
    }
    if (statusFilter !== 'ALL') {
      result = result.filter(a => getArrivalStatus(a) === statusFilter);
    }
    return result;
  }, [apiArrivals, searchQuery, statusFilter, arrivalDetails]);

  const statusCounts = useMemo(() => {
    const counts: Record<ArrivalStatus | 'ALL', number> = { ALL: apiArrivals.length, PENDING: 0, WEIGHED: 0, AUCTIONED: 0, SETTLED: 0 };
    apiArrivals.forEach(a => {
      const s = getArrivalStatus(a);
      counts[s]++;
    });
    return counts;
  }, [apiArrivals]);

  const statusLabel = (s: ArrivalStatus) => s.charAt(0) + s.slice(1).toLowerCase();

  const loadArrivalsFromApi = async () => {
    setApiArrivalsLoading(true);
    try {
      const statusParam = statusFilter !== 'ALL' ? statusFilter : undefined;
      const list = await arrivalsApi.list(0, 100, statusParam);
      setApiArrivals(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load arrivals';
      toast.error(message);
      setApiArrivals([]);
    } finally {
      setApiArrivalsLoading(false);
    }
    arrivalsApi.listDetail(0, 500).then(setArrivalDetails).catch(() => setArrivalDetails([]));
  };

  useEffect(() => {
    contactApi.list({ scope: 'participants' }).then(setContacts);
    commodityApi.list().then(setCommodities);
    commodityApi.getAllFullConfigs().then(setCommodityConfigs);
  }, []);

  useEffect(() => {
    loadArrivalsFromApi();
  }, [statusFilter]);

  // Close seller dropdown on scroll or resize (portal is fixed-position; use document so any scrollable container closes it)
  useEffect(() => {
    if (!sellerDropdown) return;
    const close = () => setSellerDropdown(false);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [sellerDropdown]);

  // Close broker dropdown on scroll or resize (same: close when any scroll happens so it doesn't stay stuck)
  useEffect(() => {
    if (!brokerDropdown) return;
    const close = () => setBrokerDropdown(false);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [brokerDropdown]);

  // REQ-ARR-001: Tonnage Calculation
  const netWeight = useMemo(() => {
    const lw = parseFloat(loadedWeight) || 0;
    const ew = parseFloat(emptyWeight) || 0;
    return Math.max(0, lw - ew);
  }, [loadedWeight, emptyWeight]);

  // REQ-ARR-010: Efficient bag totals (avoid O(n^2) recalcs per lot row).
  const vehicleTotalBags = useMemo(() => {
    return sellers.reduce(
      (sum, s) => sum + s.lots.reduce((inner, lot) => inner + (lot.quantity || 0), 0),
      0
    );
  }, [sellers]);

  const sellerTotalBagsById = useMemo(() => {
    return sellers.reduce<Record<string, number>>((acc, s) => {
      acc[s.seller_vehicle_id] = s.lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
      return acc;
    }, {});
  }, [sellers]);

  const finalBillableWeight = useMemo(() => {
    const dw = parseFloat(deductedWeight) || 0;
    return Math.max(0, netWeight - dw);
  }, [netWeight, deductedWeight]);

  // Freight calculation (REQ-ARR-012)
  const freightTotal = useMemo(() => {
    if (noRental) return 0;
    const rate = parseFloat(freightRate) || 0;
    switch (freightMethod) {
      case 'BY_WEIGHT': return finalBillableWeight * rate;
      case 'BY_COUNT': {
        const totalBags = sellers.reduce((s, sel) => s + sel.lots.reduce((ls, l) => ls + l.quantity, 0), 0);
        return totalBags * rate;
      }
      case 'LUMPSUM': return rate;
      case 'DIVIDE_BY_WEIGHT': return rate; // Distributed proportionally later (REQ-ARR-002)
      default: return 0;
    }
  }, [freightMethod, freightRate, noRental, finalBillableWeight, sellers]);

  // Broker: filter contacts by name, phone, or mark (same as seller search)
  const filteredBrokers = useMemo(() => {
    if (!brokerName.trim()) return [];
    const q = brokerName.toLowerCase().trim();
    return contacts.filter(c =>
      (c.name?.toLowerCase()?.includes(q)) ||
      (c.phone?.includes(q)) ||
      (c.mark?.toLowerCase()?.includes(q))
    ).slice(0, 8);
  }, [brokerName, contacts]);

  // REQ-CON-004 / REQ-ARR-007: Unified contact search via mark or phone
  const filteredContacts = useMemo(() => {
    if (!sellerSearch) return [];
    const q = sellerSearch.toLowerCase();
    return contacts.filter(c =>
      (c.name?.toLowerCase()?.includes(q)) ||
      (c.phone?.includes(q)) ||
      (c.mark?.toLowerCase()?.includes(q))
    ).slice(0, 5);
  }, [sellerSearch, contacts]);

  const addSeller = (contact: Contact) => {
    if (!isMultiSeller && sellers.length >= 1) {
      toast.error('Single-seller arrival allows only one seller');
      return;
    }
    if (sellers.some(s => s.contact_id === contact.contact_id)) {
      toast.error('Seller already added to this vehicle');
      return;
    }
    const newSeller: SellerEntry = {
      seller_vehicle_id: crypto.randomUUID(),
      contact_id: contact.contact_id,
      seller_name: contact.name,
      seller_phone: contact.phone,
      seller_mark: contact.mark || '',
      lots: [],
    };
    setSellers(prev => [...prev, newSeller]);
    setSellerExpanded(prev => ({ ...prev, [newSeller.seller_vehicle_id]: true }));
    setSellerSearch('');
    setSellerDropdown(false);
  };

  /** Add a seller by name/phone only (no contact). Prefills name from the search box. */
  const addSellerByName = () => {
    if (!isMultiSeller && sellers.length >= 1) {
      toast.error('Single-seller arrival allows only one seller');
      return;
    }
    const nameFromSearch = sellerSearch.trim();
    const newSeller: SellerEntry = {
      seller_vehicle_id: crypto.randomUUID(),
      contact_id: '',
      seller_name: nameFromSearch,
      seller_phone: '',
      seller_mark: '',
      lots: [],
    };
    setSellers(prev => [...prev, newSeller]);
    setSellerExpanded(prev => ({ ...prev, [newSeller.seller_vehicle_id]: true }));
    setSellerSearch('');
    setSellerDropdown(false);
  };

  const updateSeller = (sellerIdx: number, updates: Partial<Pick<SellerEntry, 'seller_name' | 'seller_phone' | 'seller_mark'>>) => {
    setSellers(prev => prev.map((s, i) => (i !== sellerIdx ? s : { ...s, ...updates })));
  };

  const removeSeller = (idx: number) => {
    const sellerToRemove = sellers[idx];
    setSellers(prev => prev.filter((_, i) => i !== idx));
    if (sellerToRemove?.seller_vehicle_id) {
      setSellerExpanded(prev => {
        const next = { ...prev };
        delete next[sellerToRemove.seller_vehicle_id];
        return next;
      });
    }
  };

  // REQ-ARR-005: Lot Identification
  const addLot = (sellerIdx: number) => {
    const seller = sellers[sellerIdx];
    if (!seller) return;
    if (!canAddAnotherLot(seller)) return;

    pendingLotsScrollToEndSellerIdRef.current = seller.seller_vehicle_id;
    setSellerExpanded(prev => ({ ...prev, [seller.seller_vehicle_id]: true }));

    setSellers(prev => prev.map((s, i) => {
      if (i !== sellerIdx) return s;
      if (!canAddAnotherLot(s)) return s;
      return {
        ...s,
        lots: [...s.lots, {
          lot_id: crypto.randomUUID(),
          lot_name: '',
          quantity: 0,
          commodity_name: commodities[0]?.commodity_name || '',
          broker_tag: '',
          variant: '',
        }],
      };
    }));
  };

  // Scroll the seller's lots panel to the newly added lot (internal scroll only).
  useEffect(() => {
    const sellerId = pendingLotsScrollToEndSellerIdRef.current;
    if (!sellerId) return;
    const el = lotsScrollRefs.current[sellerId];
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pendingLotsScrollToEndSellerIdRef.current = null;
  }, [sellers, sellerExpanded]);

  const updateLot = (sellerIdx: number, lotIdx: number, updates: Partial<LotEntry>) => {
    setSellers(prev => prev.map((s, i) => {
      if (i !== sellerIdx) return s;
      return {
        ...s,
        lots: s.lots.map((l, li) => li === lotIdx ? { ...l, ...updates } : l),
      };
    }));
  };

  const removeLot = (sellerIdx: number, lotIdx: number) => {
    setSellers(prev => prev.map((s, i) => {
      if (i !== sellerIdx) return s;
      return { ...s, lots: s.lots.filter((_, li) => li !== lotIdx) };
    }));
  };

  // REQ-ARR-013: Outlier validation (uses commodity config from API)
  const validateWeightOutliers = (): string[] => {
    const warnings: string[] = [];
    sellers.forEach(seller => {
      seller.lots.forEach(lot => {
        const comm = commodities.find((cm: any) => cm.commodity_name === lot.commodity_name);
        const fullCfg = comm ? commodityConfigs.find((c: any) => String(c.commodityId) === String(comm.commodity_id)) : null;
        const cfg = fullCfg?.config;
        if (cfg && cfg.minWeight > 0 && cfg.maxWeight > 0) {
          if (lot.quantity < cfg.minWeight / 50 || lot.quantity > cfg.maxWeight / 10) {
            warnings.push(`⚠️ ${lot.lot_name || 'Unnamed lot'} (${lot.commodity_name}): Quantity ${lot.quantity} bags may be outside normal range`);
          }
        }
      });
    });
    return warnings;
  };

  const handleSubmitArrival = async () => {
    // ── Validation (raghav branch: same checks at submit; no UI change) ──────────────────
    const vNum = vehicleNumber.trim();
    if (isMultiSeller && (vNum.length === 0 || vNum.length < 2 || vNum.length > 12)) {
      toast.error(vNum.length === 0 ? 'Vehicle number is required for multi-seller arrivals' : 'Vehicle number must be between 2 and 12 characters');
      return;
    }
    const gdwn = godown.trim();
    if (gdwn && (gdwn.length < 2 || gdwn.length > 50)) {
      toast.error('Godown name must be between 2 and 50 characters');
      return;
    }
    const gpNum = gatepassNumber.trim();
    if (gpNum && (gpNum.length < 1 || gpNum.length > 30 || !/^[a-zA-Z0-9]+$/.test(gpNum))) {
      toast.error('Gatepass number must be between 1 and 30 characters (alphanumeric)');
      return;
    }
    const brkName = brokerName.trim();
    if (brkName && (brkName.length < 2 || brkName.length > 100 || !/^[a-zA-Z\s]+$/.test(brkName))) {
      toast.error('Broker name must be between 2 and 100 characters (alphabets and spaces)');
      return;
    }
    const lw = parseFloat(loadedWeight);
    if (Number.isNaN(lw) || lw < 0 || lw > 100000) {
      toast.error('Loaded weight is required and must be between 0 and 100,000 kg');
      return;
    }
    const ew = parseFloat(emptyWeight);
    if (Number.isNaN(ew) || ew < 0 || ew > 100000) {
      toast.error('Empty weight is required and must be between 0 and 100,000 kg');
      return;
    }
    if (ew > lw) {
      toast.error('Empty weight must be less than or equal to loaded weight');
      return;
    }
    const dw = parseFloat(deductedWeight) || 0;
    if (deductedWeight?.trim() && (dw < 0 || dw > 10000)) {
      toast.error('Deducted weight must be between 0 and 10,000 kg');
      return;
    }
    if (!noRental) {
      const fr = parseFloat(freightRate);
      if (Number.isNaN(fr) || fr < 0 || fr > 100000) {
        toast.error('Freight rate is required (when not "No rental") and must be between 0 and 100,000');
        return;
      }
    }
    const ap = parseFloat(advancePaid) || 0;
    if (advancePaid?.trim() && (ap < 0 || ap > 1000000)) {
      toast.error('Advance paid must be between 0 and 1,000,000');
      return;
    }

    if (sellers.length === 0) {
      toast.error('At least one seller is required');
      return;
    }
    if (!isMultiSeller && sellers.length > 1) {
      toast.error('Single-seller arrival allows only one seller');
      return;
    }
    for (const seller of sellers) {
      const hasContactId = seller.contact_id !== '' && !Number.isNaN(Number(seller.contact_id));
      const sName = (seller.seller_name ?? '').trim();
      if (!hasContactId && !sName) {
        toast.error('Each seller must either be selected from Contacts or have a name entered');
        return;
      }
      if (!hasContactId && (sName.length < 2 || sName.length > 100)) {
        toast.error(`Seller name must be between 2 and 100 characters${sName ? `: "${sName.slice(0, 20)}…"` : ''}`);
        return;
      }
      const sMark = (seller.seller_mark ?? '').trim();
      if (sMark && (sMark.length < 2 || sMark.length > 50)) {
        toast.error(`${sName || 'Seller'}: Alias / mark must be between 2 and 50 characters`);
        return;
      }
    }
    // Mark uniqueness: no duplicates within vehicle, dynamic seller mark must not exist in contacts
    const seenMarks = new Set<string>();
    for (let i = 0; i < sellers.length; i++) {
      const seller = sellers[i];
      const sMark = (seller.seller_mark ?? '').trim();
      if (!sMark) continue;
      const markLower = sMark.toLowerCase();
      if (seenMarks.has(markLower)) {
        toast.error(`Mark "${sMark}" is already in use by another seller in this vehicle. Marks must be unique.`);
        return;
      }
      seenMarks.add(markLower);
      const isDynamic = seller.contact_id === '' || Number.isNaN(Number(seller.contact_id));
      if (isDynamic && contacts.some(c => c.mark && c.mark.toLowerCase() === markLower)) {
        toast.error(`Mark "${sMark}" is already in use by a contact. Please choose a unique mark or select the seller from Contacts.`);
        return;
      }
    }
    for (const seller of sellers) {
      if (seller.lots.length === 0) {
        toast.error(`${seller.seller_name || 'Seller'}: At least one lot is required`);
        return;
      }
      const seenLotNames = new Set<string>();
      for (const lot of seller.lots) {
        const ln = lot.lot_name?.trim() ?? '';
        if (!ln) {
          toast.error(`${seller.seller_name}: Lot name is required`);
          return;
        }
        if (ln.length < 2 || ln.length > 50) {
          toast.error(`${seller.seller_name} → ${ln}: Lot name must be between 2 and 50 characters`);
          return;
        }
        if (!/^[a-zA-Z0-9][a-zA-Z0-9\s_\-]*$/.test(ln)) {
          toast.error(`Lot name may contain letters/numbers plus spaces, '-' and '_': ${lot.lot_name}`);
          return;
        }
        const lnLower = ln.toLowerCase();
        if (seenLotNames.has(lnLower)) {
          toast.error(`${seller.seller_name} → ${ln}: Lot Name already exists for this seller`);
          return;
        }
        seenLotNames.add(lnLower);
        if (lot.quantity <= 0 || lot.quantity > 100000 || !Number.isInteger(lot.quantity)) {
          toast.error(`${seller.seller_name} → ${ln}: Quantity must be a positive integer between 1 and 100,000`);
          return;
        }
      }
    }

    // REQ-ARR-013: Outlier warnings
    const warnings = validateWeightOutliers();
    if (warnings.length > 0) {
      warnings.forEach(w => toast.warning(w));
    }

    if (editingVehicleId != null) {
      await handleUpdateArrival();
      return;
    }

    if (!can('Arrivals', 'Create')) {
      toast.error('You do not have permission to create arrivals.');
      return;
    }

    try {
      const payload: ArrivalCreatePayload = {
        vehicle_number: isMultiSeller ? vehicleNumber.trim().toUpperCase() || undefined : undefined,
        is_multi_seller: isMultiSeller,
        loaded_weight: parseFloat(loadedWeight) || 0,
        empty_weight: parseFloat(emptyWeight) || 0,
        deducted_weight: parseFloat(deductedWeight) || 0,
        freight_method: freightMethod,
        freight_rate: parseFloat(freightRate) || 0,
        no_rental: noRental,
        advance_paid: parseFloat(advancePaid) || 0,
        broker_name: brokerName || undefined,
        broker_contact_id: brokerContactId ?? undefined,
        narration: narration || undefined,
        godown: godown || undefined,
        gatepass_number: gatepassNumber || undefined,
        origin: origin || undefined,
        sellers: sellers.map(s => {
          const hasContactId = s.contact_id !== '' && !Number.isNaN(Number(s.contact_id));
          return {
            contact_id: hasContactId ? Number(s.contact_id) : null,
            seller_name: s.seller_name,
            seller_phone: s.seller_phone,
            seller_mark: s.seller_mark || undefined,
            lots: s.lots.map(l => ({
              lot_name: l.lot_name,
              quantity: l.quantity,
              commodity_name: l.commodity_name,
              broker_tag: l.broker_tag || undefined,
              variant: l.variant || undefined,
            })),
          };
        }),
      };
      const created = await arrivalsApi.create(payload);
      await loadArrivalsFromApi();
      resetForm();
      setShowAdd(false);
      setDesktopTab('summary');
      toast.success(`✅ Vehicle ${created.vehicleNumber} registered with ${created.sellerCount} seller(s) and ${created.lotCount} lot(s)`);
    } catch (err) {
      console.error('Submit arrival error:', err);
      const message = err instanceof Error ? err.message : 'Failed to submit arrival. Please try again.';
      toast.error(message);
    }
  };

  const resetForm = () => {
    setStep(1);
    setVehicleNumber('');
    setLoadedWeight('');
    setEmptyWeight('');
    setDeductedWeight('');
    setFreightMethod('BY_WEIGHT');
    setFreightRate('');
    setNoRental(false);
    setAdvancePaid('');
    setBrokerName('');
    setBrokerContactId(null);
    setNarration('');
    setGodown('');
    setGatepassNumber('');
    setOrigin('');
    setSellers([]);
    setSellerExpanded({});
    setSellerSearch('');
    setIsMultiSeller(true);
    setEditingVehicleId(null);
    editBaselineSnapshotRef.current = null;
  };

  const loadExpandedDetail = async (vehicleId: number | string) => {
    if (expandedDetail?.vehicleId === vehicleId) {
      setExpandedDetail(null);
      return;
    }
    setExpandedDetailLoading(true);
    try {
      const detail = await arrivalsApi.getById(vehicleId);
      setExpandedDetail(detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load detail');
      setExpandedDetail(null);
    } finally {
      setExpandedDetailLoading(false);
    }
  };

  const handleDeleteArrival = async (vehicleId: number | string) => {
    if (!can('Arrivals', 'Delete')) {
      toast.error('You do not have permission to delete arrivals.');
      return;
    }
    try {
      await arrivalsApi.delete(vehicleId);
      setExpandedDetail(null);
      await loadArrivalsFromApi();
      toast.success('Arrival deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete arrival');
    }
  };

  const handleEditArrival = async (a: ArrivalSummary) => {
    setEditingVehicleId(a.vehicleId);
    editBaselineSnapshotRef.current = null;
    setShowAdd(true);
    setExpandedDetail(null);
    setEditLoading(true);
    if (isDesktop) setDesktopTab('new-arrival');
    try {
      const detail = await arrivalsApi.getById(a.vehicleId);
      setVehicleNumber(detail?.vehicleNumber ?? '');
      setLoadedWeight(detail?.loadedWeight != null ? String(detail.loadedWeight) : '');
      setEmptyWeight(detail?.emptyWeight != null ? String(detail.emptyWeight) : '');
      setDeductedWeight(detail?.deductedWeight != null ? String(detail.deductedWeight) : '');
      setFreightMethod((detail?.freightMethod as FreightMethod) ?? 'BY_WEIGHT');
      setFreightRate(detail?.freightRate != null ? String(detail.freightRate) : '');
      setNoRental(Boolean(detail?.noRental));
      setAdvancePaid(detail?.advancePaid != null ? String(detail.advancePaid) : '');
      setGodown(detail?.godown ?? '');
      setGatepassNumber(detail?.gatepassNumber ?? '');
      setOrigin(detail?.origin ?? '');
      setBrokerName(detail?.brokerName ?? '');
      setBrokerContactId(detail?.brokerContactId ?? null);
      setNarration(detail?.narration ?? '');
      setStep(2);
      const mappedSellers: SellerEntry[] = (detail?.sellers ?? []).map((s, idx) => ({
        seller_vehicle_id: `edit-${s?.contactId ?? idx}-${idx}`,
        contact_id: String(s?.contactId ?? ''),
        seller_name: s?.sellerName ?? '',
        seller_phone: s?.sellerPhone ?? '',
        seller_mark: s?.sellerMark ?? '',
        lots: (s?.lots ?? []).map((l, lotIdx) => ({
          lot_id: l?.id != null ? String(l.id) : `lot-${idx}-${lotIdx}`,
          lot_name: l?.lotName ?? '',
          quantity: l?.bagCount ?? 0,
          commodity_name: l?.commodityName ?? '',
          broker_tag: l?.brokerTag ?? '',
          variant: l?.variant ?? '',
        })),
      }));
      setSellers(mappedSellers);
      setSellerExpanded(
        mappedSellers.reduce<Record<string, boolean>>((acc, s) => {
          acc[s.seller_vehicle_id] = true; // default expanded in edit flow too
          return acc;
        }, {})
      );
      setIsMultiSeller(mappedSellers.length > 1);

      // Capture baseline immediately after we populate all edit fields,
      // so dirty detection works reliably even with invalid data.
      editBaselineSnapshotRef.current = JSON.stringify({
        step: 2,
        isMultiSeller: mappedSellers.length > 1,
        vehicleNumber: detail?.vehicleNumber ?? '',
        loadedWeight: detail?.loadedWeight != null ? String(detail.loadedWeight) : '',
        emptyWeight: detail?.emptyWeight != null ? String(detail.emptyWeight) : '',
        deductedWeight: detail?.deductedWeight != null ? String(detail.deductedWeight) : '',
        freightMethod: (detail?.freightMethod as FreightMethod) ?? 'BY_WEIGHT',
        freightRate: detail?.freightRate != null ? String(detail.freightRate) : '',
        noRental: Boolean(detail?.noRental),
        advancePaid: detail?.advancePaid != null ? String(detail.advancePaid) : '',
        brokerName: detail?.brokerName ?? '',
        brokerContactId: detail?.brokerContactId ?? null,
        narration: detail?.narration ?? '',
        godown: detail?.godown ?? '',
        gatepassNumber: detail?.gatepassNumber ?? '',
        origin: detail?.origin ?? '',
        sellers: serializeSellersForDirty(mappedSellers),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load arrival for edit');
      setEditingVehicleId(null);
    } finally {
      setEditLoading(false);
    }
  };

  const handleUpdateArrival = async () => {
    if (editingVehicleId == null) return;
    if (!can('Arrivals', 'Edit')) {
      toast.error('You do not have permission to edit arrivals.');
      return;
    }
    try {
      await arrivalsApi.update(editingVehicleId, {
        vehicle_number: vehicleNumber.trim() || undefined,
        godown: godown || undefined,
        gatepass_number: gatepassNumber || undefined,
        origin: origin || undefined,
        broker_name: brokerName.trim() || undefined,
        broker_contact_id: brokerContactId ?? undefined,
        multi_seller: isMultiSeller,
        narration: narration.trim() || undefined,
        loaded_weight: loadedWeight ? parseFloat(loadedWeight) : undefined,
        empty_weight: emptyWeight ? parseFloat(emptyWeight) : undefined,
        deducted_weight: deductedWeight ? parseFloat(deductedWeight) : undefined,
        freight_method: freightMethod,
        freight_rate: freightRate ? parseFloat(freightRate) : undefined,
        no_rental: noRental,
        advance_paid: advancePaid ? parseFloat(advancePaid) : undefined,
        sellers: sellers.length > 0 ? sellers.map(s => {
          const hasContactId = s.contact_id !== '' && !Number.isNaN(Number(s.contact_id));
          return {
            contact_id: hasContactId ? Number(s.contact_id) : null,
            seller_name: s.seller_name,
            seller_phone: s.seller_phone,
            seller_mark: s.seller_mark || undefined,
            lots: s.lots.map(l => ({
              lot_name: l.lot_name,
              quantity: l.quantity,
              commodity_name: l.commodity_name,
              broker_tag: l.broker_tag || undefined,
              variant: l.variant || undefined,
            })),
          };
        }) : undefined,
      });
      await loadArrivalsFromApi();
      setEditingVehicleId(null);
      resetForm();
      setShowAdd(false);
      setDesktopTab('summary');
      toast.success('Arrival updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update arrival');
    }
  };

  if (!canView) {
    return <ForbiddenPage moduleName="Arrivals" />;
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      <UnsavedChangesDialog />
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(2rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(123,97,255,0.2)_0%,transparent_40%)]" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div key={i} className="absolute w-1.5 h-1.5 bg-white/40 rounded-full"
                style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%` }}
                animate={{ y: [-10, 10], opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }} />
            ))}
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">Arrivals</h1>
                  <p className="text-white/70 text-xs">{apiArrivalsLoading ? '…' : apiArrivals.reduce((s, a) => s + a.lotCount, 0)} lots · Inward Logistics</p>
                </div>
              </div>
              <button onClick={() => { resetForm(); setShowAdd(true); }} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DESKTOP: TAB LAYOUT ═══ */}
      {isDesktop && (
        <div className="px-8 pb-6">
          {/* Tab Bar */}
          <div className="flex items-center gap-1 mb-6 border-b border-border/40">
            <button
              onClick={() => {
                void tryCloseArrivalPanel(() => setDesktopTab('summary'));
              }}
              className={cn(
                "px-5 py-3 text-sm font-semibold transition-all relative",
                desktopTab === 'summary'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Summary
                <span className="ml-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold">{apiArrivalsLoading ? '…' : apiArrivals.length}</span>
              </div>
              {desktopTab === 'summary' && (
                <motion.div layoutId="desktop-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6075FF] rounded-full" />
              )}
            </button>
            <button
              onClick={openNewArrivalPanel}
              className={cn(
                "px-5 py-3 text-sm font-semibold transition-all relative",
                desktopTab === 'new-arrival'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Arrival
              </div>
              {desktopTab === 'new-arrival' && (
                <motion.div layoutId="desktop-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6075FF] rounded-full" />
              )}
            </button>
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {desktopTab === 'summary' && (
              <motion.div key="summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {apiArrivalsLoading ? (
                  <div className="glass-card p-12 rounded-2xl text-center">
                    <p className="text-muted-foreground">Loading arrivals…</p>
                  </div>
                ) : apiArrivals.length === 0 ? (
                  statusFilter !== 'ALL' ? (
                    <div className="glass-card p-12 rounded-2xl text-center">
                      <Filter className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-foreground mb-1">No {statusLabel(statusFilter)} arrivals</h3>
                      <p className="text-sm text-muted-foreground mb-4">No arrivals match the &quot;{statusLabel(statusFilter)}&quot; filter. Show all to see the full list.</p>
                      <Button onClick={() => setStatusFilter('ALL')} variant="outline" className="rounded-xl">
                        Show all arrivals
                      </Button>
                    </div>
                  ) : (
                  <div className="glass-card p-12 rounded-2xl text-center">
                    <div className="relative mb-4 mx-auto w-16 h-16">
                      <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl" />
                      <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shadow-lg">
                        <Truck className="w-7 h-7 text-white" />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">No Arrivals Yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">Record your first vehicle arrival to start operations</p>
                    <Button onClick={openNewArrivalPanel} className="bg-gradient-to-r from-blue-500 to-violet-500 text-white rounded-xl shadow-lg">
                      <Plus className="w-4 h-4 mr-2" /> New Arrival
                    </Button>
                  </div>
                  )
                ) : (
                  <>
                    {/* Four summary cards — raghav: all blue icon #6075FF */}
                    <div className="grid grid-cols-4 gap-4 mb-6">
                      <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20">
                          <Truck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground leading-tight">{totalVehicles}</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Total Vehicles</p>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20">
                          <Users className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground leading-tight">{totalSellers}</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Total Sellers</p>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20">
                          <Package className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground leading-tight">{totalLots}</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Total Lots</p>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20">
                          <Scale className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground leading-tight">{totalNetWeightTons.toFixed(1)}t</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Total Weight</p>
                        </div>
                      </div>
                    </div>
                    {/* Search + sub-categories (Arrivals / Sellers / Lots) — blue active raghav */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative w-[300px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="search"
                          placeholder="Search seller, vehicle, origin..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="w-full h-9 pl-9 pr-4 rounded-xl text-xs bg-white dark:bg-card border border-border/40 shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF]"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <button type="button" onClick={() => setSummaryMode('arrivals')} className={cn('px-4 py-1.5 rounded-full font-medium transition-colors', summaryMode === 'arrivals' ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-muted/50')}>Arrivals ({totalVehicles})</button>
                        <button type="button" onClick={() => setSummaryMode('sellers')} className={cn('px-4 py-1.5 rounded-full font-medium transition-colors', summaryMode === 'sellers' ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-muted/50')}>Sellers ({totalSellers})</button>
                        <button type="button" onClick={() => setSummaryMode('lots')} className={cn('px-4 py-1.5 rounded-full font-medium transition-colors', summaryMode === 'lots' ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-muted/50')}>Lots ({totalLots})</button>
                      </div>
                    </div>
                    {/* Status filter — only when Arrivals, blue active (raghav) */}
                    {summaryMode === 'arrivals' && (
                      <div className="flex items-center gap-2 mb-4 text-[11px]">
                        <button type="button" onClick={() => setStatusFilter('ALL')} className={cn('px-4 py-1 rounded-full font-medium transition-colors', statusFilter === 'ALL' ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700')}>All ({statusCounts.ALL})</button>
                        {ALL_STATUSES.map(s => (
                          <button key={s} type="button" onClick={() => setStatusFilter(s)} className={cn('px-4 py-1 rounded-full font-medium transition-colors', statusFilter === s ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700')}>{statusLabel(s)} ({statusCounts[s]})</button>
                        ))}
                      </div>
                    )}
                    {summaryMode === 'arrivals' && (
                    <div className="glass-card rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/40 bg-muted/30">
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Vehicle | Seller (qty)</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Status</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">From</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Bids</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Weighed</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Sellers</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Lots</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Net Wt</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Freight</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase">Date</th>
                            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredArrivals.map((a, i) => {
                              const status = getArrivalStatus(a);
                              const isExpanded = expandedDetail?.vehicleId === a.vehicleId;
                              return (
                                <Fragment key={a.vehicleId + '-' + i}>
                                  <motion.tr
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer"
                                    onClick={() => loadExpandedDetail(a.vehicleId)}
                                  >
                                    <td className="px-4 py-3 font-semibold text-foreground">
                                      <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold">{a.vehicleNumber}</span>
                                      <span className="text-muted-foreground mx-1">|</span>
                                      <span className="text-foreground text-xs">{a.primarySellerName ?? '-'}</span>
                                      <span className="text-muted-foreground text-xs"> ({(a.totalBags ?? 0)})</span>
                                    </td>
                                    <td className="px-4 py-3"><ArrivalStatusBadge status={status} /></td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs">{a.godown ?? '—'}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.bidsCount ?? 0}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.weighedCount ?? 0}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.sellerCount}</td>
                                    <td className="px-4 py-3 text-right font-medium text-foreground">{a.lotCount}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.netWeight}kg</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{a.freightTotal > 0 ? `₹${a.freightTotal.toLocaleString()}` : '—'}</td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(a.arrivalDatetime).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                      <div className="flex items-center justify-center gap-1">
                                        {can('Arrivals', 'Edit') && (
                                          <button type="button" onClick={() => handleEditArrival(a)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="w-4 h-4" /></button>
                                        )}
                                        {can('Arrivals', 'Delete') && (
                                          <button type="button" onClick={() => handleDeleteArrival(a.vehicleId)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                        )}
                                      </div>
                                    </td>
                                  </motion.tr>
                                  {isExpanded && (
                                    <tr key={a.vehicleId + '-exp'} className="border-b border-border/20 bg-muted/10">
                                      <td colSpan={11} className="px-4 py-4">
                                        {expandedDetailLoading ? (
                                          <p className="text-sm text-muted-foreground">Loading…</p>
                                        ) : expandedDetail ? (
                                          <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div className="space-y-3">
                                              {expandedDetail.netWeight != null && (!isArrivalPanelOpen || step === 1) && (
                                                <div className="grid grid-cols-2 gap-2">
                                                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-2 text-center">
                                                    <p className="text-[10px] text-muted-foreground">Net Weight</p>
                                                    <p className="font-bold text-foreground">{expandedDetail.netWeight}kg</p>
                                                  </div>
                                                  <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 p-2 text-center">
                                                    <p className="text-[10px] text-muted-foreground">Billable</p>
                                                    <p className="font-bold text-foreground">{(expandedDetail.netWeight - (expandedDetail.deductedWeight ?? 0))}kg</p>
                                                  </div>
                                                </div>
                                              )}
                                              <FreightDetailsCard
                                                freightRate={expandedDetail.freightRate ?? 0}
                                                netWeight={expandedDetail.netWeight ?? 0}
                                                freightMethod={expandedDetail.freightMethod ?? 'BY_WEIGHT'}
                                                freightTotal={expandedDetail.freightTotal ?? 0}
                                                advancePaid={expandedDetail.advancePaid ?? 0}
                                                noRental={expandedDetail.noRental ?? false}
                                              />
                                            </div>
                                            <div className="space-y-3">
                                              <SellerInfoCard
                                                sellers={expandedDetail.sellers.map(s => ({
                                                  sellerName: s.sellerName,
                                                  sellerMark: s.sellerMark,
                                                  lots: s.lots.map(l => ({
                                                    id: l.id,
                                                    lotName: l.lotName,
                                                    commodityName: l.commodityName,
                                                    bagCount: l.bagCount,
                                                    brokerTag: l.brokerTag,
                                                    variant: l.variant,
                                                  })),
                                                }))}
                                                hidePrint={isArrivalPanelOpen && step > 1}
                                                onRefresh={() => loadExpandedDetail(expandedDetail.vehicleId)}
                                              />
                                              <div className="flex gap-2">
                                                {can('Arrivals', 'Edit') && (
                                                  <Button type="button" variant="outline" size="sm" onClick={e => { e.stopPropagation(); handleEditArrival(apiArrivals.find(x => x.vehicleId === expandedDetail.vehicleId)!); }}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                                                )}
                                                {can('Arrivals', 'Delete') && (
                                                  <Button type="button" variant="destructive" size="sm" onClick={e => { e.stopPropagation(); handleDeleteArrival(expandedDetail.vehicleId); }}><Trash2 className="w-3.5 h-3.5 mr-1" /> Delete</Button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ) : null}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    )}
                    {summaryMode === 'sellers' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredArrivals.flatMap(a => {
                          const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
                          if (!detail?.sellers?.length) {
                            return [{ sellerName: '-', origin: '-', lotCount: a.lotCount ?? 0, lots: [] as { id: number; lotName: string }[], vehicleNumber: a.vehicleNumber, key: `seller-${a.vehicleId}-0` }];
                          }
                          return detail.sellers.map((s, si) => ({
                            sellerName: s.sellerName || '-',
                            origin: '-',
                            lotCount: s.lots?.length ?? 0,
                            lots: s.lots ?? [],
                            vehicleNumber: a.vehicleNumber,
                            key: `seller-${a.vehicleId}-${si}`,
                          }));
                        }).map((item, mapIndex) => {
                          const bgColors = ['bg-[#6075FF]', 'bg-[#00c98b]', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500'];
                          const bgClass = bgColors[mapIndex % bgColors.length];
                          return (
                            <motion.div key={item.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: mapIndex * 0.03 }} className="bg-white dark:bg-card rounded-[24px] shadow-sm border border-border/40 p-4">
                              <div className="flex items-start gap-3.5">
                                <div className={cn('w-[42px] h-[42px] rounded-xl flex items-center justify-center text-white font-bold text-[17px] shrink-0', bgClass)}>{item.sellerName.charAt(0).toUpperCase()}</div>
                                <div className="flex-1 min-w-0 pt-0.5">
                                  <h4 className="text-[14px] font-semibold text-foreground mb-1 leading-none">{item.sellerName}</h4>
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground mb-3 font-medium">
                                    <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {item.origin}</span>
                                    <span className="text-muted-foreground/40">{item.lotCount} lot(s)</span>
                                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                                    <span className="text-muted-foreground/60">{item.vehicleNumber}</span>
                                  </div>
                                  {item.lots.length > 0 && (
                                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-[10px] px-2.5 py-1.5 flex items-center gap-2 text-[10px]">
                                      <Package className="w-3 h-3 text-muted-foreground/70" />
                                      <span className="font-semibold text-foreground">{item.lots[0].lotName || 'Unnamed'}</span>
                                      {item.lots.length > 1 && <span className="text-muted-foreground/40 font-medium">+{item.lots.length - 1} more</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                    {summaryMode === 'lots' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredArrivals.flatMap(a => {
                          const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
                          if (!detail?.sellers) return [];
                          return detail.sellers.flatMap(seller =>
                            (seller.lots ?? []).map(lot => ({
                              lotId: lot.id,
                              lotName: lot.lotName || 'Unnamed',
                              sellerName: seller.sellerName || '-',
                              vehicleNumber: a.vehicleNumber,
                              key: `lot-${a.vehicleId}-${lot.id}`,
                            }))
                          );
                        }).map(item => (
                          <motion.div key={item.key} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.03 }} className="bg-white dark:bg-card rounded-[24px] shadow-sm border border-border/40 p-4 hover:shadow-md transition-all">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-[42px] h-[42px] rounded-xl bg-[#6075FF] flex items-center justify-center shrink-0">
                                  <Package className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-[14px] font-semibold text-foreground leading-none">{item.lotName}</h4>
                                    <span className="text-[10px] text-muted-foreground/60 font-medium">#{item.lotId}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                                    <span>{item.sellerName}</span>
                                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                                    <span>{item.vehicleNumber}</span>
                                  </div>
                                </div>
                              </div>
                              <button type="button" onClick={() => { const text = `Lot: ${item.lotName}\nSeller: ${item.sellerName}\nVehicle: ${item.vehicleNumber}`; navigator.clipboard?.writeText(text).then(() => toast.success('Copied to clipboard')); }} className="p-1 hover:text-foreground text-muted-foreground transition-colors"><Share2 className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="mt-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#eef0ff] dark:bg-[#6075FF]/20 text-[#6075FF] text-[10px] font-bold">{item.vehicleNumber}</span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {desktopTab === 'new-arrival' && (
              <motion.div key="new-arrival" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {/* Sub-tabs: Multi-Seller / Single Seller */}
                <div className="flex items-center gap-2 mb-5">
                  <button
                    onClick={() => { setIsMultiSeller(true); resetForm(); setIsMultiSeller(true); }}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                      isMultiSeller
                        ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <Truck className="w-4 h-4 inline mr-1.5" />
                    Multi Seller (Vehicle)
                  </button>
                  <button
                    onClick={() => { setIsMultiSeller(false); resetForm(); setIsMultiSeller(false); }}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                      !isMultiSeller
                        ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <Users className="w-4 h-4 inline mr-1.5" />
                    Single Seller
                  </button>
                  <p className="ml-3 text-xs text-muted-foreground">
                    {isMultiSeller ? 'Vehicle info required (e.g., Bangalore APMC)' : 'Vehicle info not required (e.g., Gadag, Byadagi APMC)'}
                  </p>
                </div>

                {/* Desktop form: two-column layout */}
                {editingVehicleId != null && editLoading ? (
                  <div className="glass-card rounded-2xl p-12 text-center">
                    <p className="text-muted-foreground font-medium">Loading arrival details…</p>
                    <p className="text-xs text-muted-foreground mt-1">Fetching vehicle, sellers and lots</p>
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-6">
                  {/* LEFT: Vehicle & Tonnage */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                        <Truck className="w-3 h-3 text-white" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Vehicle & Tonnage</h3>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>

                    {isMultiSeller && (
                      <div className="glass-card rounded-2xl p-4">
                        <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block flex items-center gap-1.5", isVehicleNumberInvalid ? "text-red-500" : "text-blue-600 dark:text-blue-400")}>
                          <Truck className="w-3.5 h-3.5" /> Vehicle Number * {isVehicleNumberInvalid && (vehicleNumber.trim() ? <span className="font-normal text-red-500">2–12 characters</span> : <span className="font-normal text-red-500">Required</span>)}
                        </label>
                        <Input placeholder="e.g., MH12AB1234" value={vehicleNumber}
                          onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                          ref={vehicleNumberInputRef}
                          className={cn("h-11 rounded-xl text-sm font-medium", isVehicleNumberInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={12} />
                      </div>
                    )}

                    <div className="glass-card rounded-2xl p-4 relative z-20 overflow-visible">
                      <label className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5" /> Weigh Bridge
                      </label>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className={cn("text-[10px] mb-1 block", isLoadedWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                            Loaded Weight (kg) * {isLoadedWeightInvalid && (loadedWeight?.trim() ? '⚠ 0–100,000' : '⚠ Required')}
                          </label>
                          <Input type="number" placeholder="0" value={loadedWeight} onChange={e => setLoadedWeight(e.target.value)}
                            ref={loadedWeightInputRef}
                            className={cn("h-11 rounded-xl text-sm font-medium", isLoadedWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                        </div>
                        <div>
                          <label className={cn("text-[10px] mb-1 block", isEmptyWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                            Empty Weight (kg) * {isEmptyWeightInvalid && (emptyWeight?.trim() ? (parseFloat(emptyWeight) > (parseFloat(loadedWeight) || 0) ? '⚠ ≤ Loaded' : '⚠ 0–100,000') : '⚠ Required')}
                          </label>
                          <Input type="number" placeholder="0" value={emptyWeight} onChange={e => setEmptyWeight(e.target.value)}
                            className={cn("h-11 rounded-xl text-sm font-medium", isEmptyWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className={cn("text-[10px] mb-1 block", isDeductedWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                          Deducted Weight (Fuel/Dust) (kg) — optional {isDeductedWeightInvalid && '⚠ 0–10,000'}
                        </label>
                        <Input type="number" placeholder="0" value={deductedWeight} onChange={e => setDeductedWeight(e.target.value)}
                          className={cn("h-11 rounded-xl text-sm font-medium", isDeductedWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={10000} step="0.01" />
                      </div>
                      {step === 1 && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-3 text-center border border-blue-200/50 dark:border-blue-800/30">
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Net Weight (LW − EW)</p>
                            <p className="text-xl font-bold text-foreground">{netWeight}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                          </div>
                          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3 text-center border border-violet-200/50 dark:border-violet-800/30">
                            <p className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">Billable (NW − DW)</p>
                            <p className="text-xl font-bold text-foreground">{finalBillableWeight}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block", isGodownInvalid ? "text-red-500" : "text-muted-foreground")}>
                            Godown (optional) {isGodownInvalid && '⚠ 2–50, letters only'}
                          </label>
                          <Input placeholder="Godown name (optional)" value={godown} onChange={e => setGodown(e.target.value)} className={cn("h-11 rounded-xl text-sm", isGodownInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={50} />
                        </div>
                        <div>
                          <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block", isGatepassNumberInvalid ? "text-red-500" : "text-muted-foreground")}>
                            Gatepass (optional) {isGatepassNumberInvalid && '⚠ 1–30, alphanumeric'}
                          </label>
                          <Input placeholder="Gatepass no. (optional)" value={gatepassNumber} onChange={e => setGatepassNumber(e.target.value.length <= 30 ? e.target.value : gatepassNumber)} className={cn("h-11 rounded-xl text-sm", isGatepassNumberInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={30} />
                        </div>
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Origin (location)</label>
                      <LocationSearchInput value={origin} onChange={setOrigin} placeholder="Search city, market yard, address…" className="h-11" />
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block", isBrokerNameInvalid ? "text-red-500" : "text-muted-foreground")}>
                        Broker (optional) {isBrokerNameInvalid && '⚠ 2–100, letters + spaces'}
                      </label>
                      <div ref={brokerSearchWrapRef} className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Search contact by name, phone, mark — or type any name"
                          value={brokerName}
                          onChange={e => { setBrokerName(e.target.value); setBrokerContactId(null); refreshBrokerDropdownPos(); setBrokerDropdown(true); }}
                          onFocus={() => { if (brokerName.trim()) { refreshBrokerDropdownPos(); setBrokerDropdown(true); } }}
                          onBlur={() => setTimeout(() => setBrokerDropdown(false), 180)}
                          className={cn("h-11 rounded-xl pl-10 text-sm", isBrokerNameInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")}
                        />
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5" /> Freight Calculator
                      </label>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {FREIGHT_METHODS.map(m => (
                          <button key={m.value} onClick={() => setFreightMethod(m.value)}
                            className={cn("py-2 rounded-xl text-xs font-semibold transition-all",
                              freightMethod === m.value ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md' : 'bg-muted/40 text-muted-foreground')}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <button onClick={() => setNoRental(!noRental)}
                          className={cn("w-14 h-8 rounded-full transition-all relative shadow-inner",
                            noRental ? 'bg-gradient-to-r from-red-500 to-rose-500 shadow-red-500/30' : 'bg-slate-300 dark:bg-slate-600')}>
                          <motion.div className="w-6 h-6 rounded-full bg-white shadow-md absolute top-1" animate={{ x: noRental ? 28 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                        </button>
                        <span className="text-sm text-foreground font-medium">No Rental</span>
                      </div>
                      {!noRental && (
                        <>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className={cn("text-[10px] mb-1 block", isFreightRateInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                                Rate * {isFreightRateInvalid && (freightRate?.trim() ? '⚠ 0–100,000' : '⚠ Required')}
                              </label>
                              <Input type="number" placeholder="0" value={freightRate} onChange={e => setFreightRate(e.target.value)}
                                className={cn("h-11 rounded-xl text-sm font-medium", isFreightRateInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                            </div>
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 text-center border border-amber-200/50 dark:border-amber-800/30 flex flex-col justify-center">
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Total Rental</p>
                              <p className="text-lg font-bold text-foreground">₹{freightTotal.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="mb-3">
                            <label className={cn("text-[10px] mb-1 block", isAdvancePaidInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                              Advance Paid (to driver) — optional {isAdvancePaidInvalid && '⚠ 0–1,000,000'}
                            </label>
                            <Input type="number" placeholder="0" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)}
                              className={cn("h-11 rounded-xl text-sm font-medium", isAdvancePaidInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={1000000} step="0.01" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Narration</label>
                            <Input placeholder="e.g., Freight for vehicle arrival" value={narration} onChange={e => setNarration(e.target.value)}
                              className="h-11 rounded-xl text-sm" />
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {NARRATION_PRESETS.map(n => (
                                <button key={n} onClick={() => setNarration(n)}
                                  className={cn("px-2 py-1 rounded-lg text-[10px] font-medium transition-all",
                                    narration === n ? 'bg-amber-500 text-white' : 'bg-muted/50 text-muted-foreground')}>
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Sellers & Lots */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <Users className="w-3 h-3 text-white" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Sellers & Lots</h3>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>

                    <div className={cn("glass-card rounded-2xl p-5", !isMultiSeller && sellers.length >= 1 && "opacity-60 pointer-events-none")}>
                      <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5" /> Add Seller
                        {!isMultiSeller && sellers.length >= 1 && <span className="text-muted-foreground font-normal normal-case">(single-seller: one only)</span>}
                      </label>
                        <div className="flex gap-3">
                        <div ref={sellerSearchWrapRef} className="relative flex-1 min-w-0">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                          <Input
                            placeholder="Search by name, phone, or mark…"
                            value={sellerSearch}
                            onChange={e => { setSellerSearch(e.target.value); refreshDropdownPos(); setSellerDropdown(true); }}
                            onFocus={() => { if (sellerSearch) { refreshDropdownPos(); setSellerDropdown(true); } }}
                            onBlur={() => setTimeout(() => setSellerDropdown(false), 150)}
                            className="h-12 rounded-xl pl-10 text-sm"
                          />
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addSellerByName} className="h-12 rounded-xl shrink-0" disabled={!isMultiSeller && sellers.length >= 1}>
                          Add by name
                        </Button>
                      </div>
                    </div>

                    {sellers.length === 0 && (
                      <div className="glass-card rounded-2xl p-8 text-center">
                        <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">Search and add sellers to this arrival</p>
                      </div>
                    )}

                    {sellers.map((seller, si) => {
                      const expanded = sellerExpanded[seller.seller_vehicle_id] ?? true;
                      const sellerTotal = sellerTotalBagsById[seller.seller_vehicle_id] ?? 0;
                      return (
                      <motion.div key={seller.seller_vehicle_id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                        className="glass-card rounded-2xl overflow-hidden">
                        <div className="p-4 flex items-stretch justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-b border-border/30">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
                              <span className="text-white text-xs font-bold">{seller.seller_mark || seller.seller_name?.charAt(0) || '?'}</span>
                            </div>
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {seller.contact_id !== '' ? (
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-[12px] text-foreground truncate">
                                    {seller.seller_name}
                                  </p>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {seller.seller_mark ? (
                                      <span className="text-[10px] text-muted-foreground truncate whitespace-nowrap">
                                        ({seller.seller_mark})
                                      </span>
                                    ) : null}
                                    {/* Reserved space for seller serial/identifier (next bug) */}
                                    <span className="text-[10px] text-transparent whitespace-nowrap">#ID</span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground truncate">{seller.seller_phone}</p>
                                  <div className="flex items-center justify-between gap-2 mt-0.5">
                                    <p className="text-[10px] text-muted-foreground/80 truncate">{seller.lots.length} lot(s)</p>
                                    {/* Reserved right-side slot for future serial/id value */}
                                    <span className="text-[10px] text-transparent whitespace-nowrap">—</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 gap-2 min-w-0 flex-1">
                                  <div>
                                    <Input
                                      placeholder="Seller name * (2–100)"
                                      value={seller.seller_name}
                                      onChange={e => updateSeller(si, { seller_name: e.target.value })}
                                      className={cn(
                                        "h-9 rounded-lg text-xs",
                                        isSellerNameInvalid(seller) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={100}
                                    />
                                    {isSellerNameInvalid(seller) && <p className="text-[9px] text-red-500 mt-0.5">2–100 characters</p>}
                                  </div>
                                  <div>
                                    <Input
                                      placeholder="Mark / alias (optional, 2–50)"
                                      value={seller.seller_mark}
                                      onChange={e => updateSeller(si, { seller_mark: e.target.value })}
                                      className={cn(
                                        "h-9 rounded-lg text-xs",
                                        isSellerMarkInvalid(seller, si) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={50}
                                    />
                                    {isSellerMarkInvalid(seller, si) && <p className="text-[9px] text-red-500 mt-0.5">{getSellerMarkError(seller, si) ?? '2–50 if set'}</p>}
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] text-muted-foreground/80 truncate">{seller.lots.length} lot(s)</p>
                                    {/* Reserved space for future seller serial/identifier (next bug) */}
                                    <span className="text-[10px] text-transparent whitespace-nowrap">#ID</span>
                                  </div>
                                </div>
                              )}
                              {/* Prominent total bags beside seller details */}
                              <div className="shrink-0 self-center">
                                <div className="px-3 py-1.5 rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 font-extrabold shadow-sm ring-1 ring-emerald-600/20">
                                  <span className="text-xl leading-none">{sellerTotal}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-between py-1">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSellerExpanded(prev => ({ ...prev, [seller.seller_vehicle_id]: !expanded }))}
                                aria-label={expanded ? 'Collapse seller lots' : 'Expand seller lots'}
                                className={cn(
                                  "w-7 h-7 rounded-lg flex items-center justify-center",
                                  expanded ? "bg-muted/40 hover:bg-muted/50" : "bg-muted/20 hover:bg-muted/40"
                                )}
                              >
                                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!canAddAnotherLot(seller)) return;
                                  addLot(si);
                                }}
                                disabled={!canAddAnotherLot(seller)}
                                className={cn(
                                  "w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-sm",
                                  !canAddAnotherLot(seller) && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                <Plus className="w-3.5 h-3.5 text-white" />
                              </button>
                            </div>
                            <button onClick={() => removeSeller(si)} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              key={`${seller.seller_vehicle_id}-lots`}
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="border-t border-border/30"
                            >
                              {/* Fixed-height lots panel so only lots scroll internally */}
                              <div ref={setLotsScrollRef(seller.seller_vehicle_id)} className="h-[280px] overflow-y-auto p-3 space-y-2 overscroll-contain">
                                {seller.lots.length === 0 && (
                                  <p className="text-xs text-muted-foreground text-center py-2 italic">No lots. Click + to add a lot.</p>
                                )}
                                {seller.lots.length > 0 && !canAddAnotherLot(seller) && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 text-center py-1">
                                    Complete current lot name and bags before adding another lot.
                                  </p>
                                )}
                                {seller.lots.map((lot, li) => {
                                  const vehicleTotal = vehicleTotalBags;
                                  const lotDuplicateError = !isLotNameInvalid(lot) ? getLotNameDuplicateError(si, li) : null;
                                  return (
                                    <div key={lot.lot_id} className="rounded-xl border border-border/30 p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase">
                                          Lot {li + 1} <span className="font-normal text-foreground">— {vehicleTotal} / {sellerTotal} bags</span>
                                        </p>
                                        <button onClick={() => removeLot(si, li)} className="text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                                      </div>
                                      <div className="grid grid-cols-4 gap-2 items-end">
                                        <div>
                                          <Input
                                            aria-label="Lot Name"
                                            placeholder="Lot Name"
                                            value={lot.lot_name}
                                            onChange={e => updateLot(si, li, { lot_name: e.target.value })}
                                            className={cn(
                                              "h-9 w-full rounded-lg text-sm",
                                              (isLotNameInvalid(lot) || lotDuplicateError) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                            )}
                                            inputMode="text"
                                            maxLength={50}
                                          />
                                          {lotDuplicateError && <p className="text-[9px] text-red-500 mt-0.5">{lotDuplicateError}</p>}
                                        </div>
                                        <div>
                                          <Input
                                            aria-label="Bags Quantity"
                                            type="number"
                                            placeholder="Bags"
                                            value={lot.quantity || ''}
                                            onChange={e => updateLot(si, li, { quantity: parseInt(e.target.value) || 0 })}
                                            className={cn(
                                              "h-9 w-full rounded-lg text-sm",
                                              isLotQuantityInvalid(lot) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                            )}
                                            min={1}
                                            max={100000}
                                          />
                                        </div>
                                        <div>
                                          <select
                                            aria-label="Commodity"
                                            value={lot.commodity_name}
                                            onChange={e => updateLot(si, li, { commodity_name: e.target.value })}
                                            className="h-9 w-full rounded-lg bg-background border border-input text-sm px-2"
                                          >
                                            {commodities.map((c: any) => (
                                              <option key={c.commodity_id} value={c.commodity_name}>{c.commodity_name}</option>
                                            ))}
                                            {commodities.length === 0 && <option value="">No commodities</option>}
                                          </select>
                                        </div>
                                        <div>
                                          <select
                                            aria-label="Variant"
                                            value={lot.variant ?? ''}
                                            onChange={e => updateLot(si, li, { variant: e.target.value })}
                                            className="h-9 w-full rounded-lg bg-background border border-input text-sm px-2"
                                          >
                                            {VARIANT_OPTIONS.map(opt => (
                                              <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ); })}

                    {/* Submit */}
                    <Button onClick={handleSubmitArrival}
                      disabled={(!editingVehicleId && sellers.length === 0) || isFormInvalid}
                      className="w-full h-12 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60">
                      <FileText className="w-4 h-4 mr-2" /> {editingVehicleId != null ? 'Update Arrival' : 'Submit Arrival'}
                    </Button>
                  </div>
                </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ═══ MOBILE: Four cards + Search + Status filter + List (mobile-first) ═══ */}
      {!isDesktop && (
        <>
          {/* Four summary cards — raghav style: blue icon on all, white card */}
          {!apiArrivalsLoading && apiArrivals.length > 0 && (
            <div className="px-4 mb-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{totalVehicles}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Vehicles</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{totalSellers}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Sellers</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{totalLots}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Lots</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-card border border-border/40 shadow-sm rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                    <Scale className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{totalNetWeightTons.toFixed(1)}t</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Weight</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="px-4 mb-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search seller, vehicle, origin..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl text-sm bg-white dark:bg-card border border-border/40 shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6075FF] text-foreground placeholder:text-muted-foreground"
              />
            </div>
            {/* Sub-categories: Arrivals / Sellers / Lots — blue active (raghav) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 text-xs">
              <button type="button" onClick={() => setSummaryMode('arrivals')} className={cn('flex-shrink-0 px-4 py-1.5 rounded-full font-medium transition-colors', summaryMode === 'arrivals' ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-muted/50')}>Arrivals ({totalVehicles})</button>
              <button type="button" onClick={() => setSummaryMode('sellers')} className={cn('flex-shrink-0 px-4 py-1.5 rounded-full font-medium transition-colors', summaryMode === 'sellers' ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-muted/50')}>Sellers ({totalSellers})</button>
              <button type="button" onClick={() => setSummaryMode('lots')} className={cn('flex-shrink-0 px-4 py-1.5 rounded-full font-medium transition-colors', summaryMode === 'lots' ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-muted/50')}>Lots ({totalLots})</button>
            </div>
            {/* Status filter — only when Arrivals, blue active (raghav) */}
            {summaryMode === 'arrivals' && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 text-[11px]">
                <button type="button" onClick={() => setStatusFilter('ALL')} className={cn('flex-shrink-0 px-4 py-1 rounded-full font-medium transition-colors', statusFilter === 'ALL' ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700')}>All ({statusCounts.ALL})</button>
                {ALL_STATUSES.map(s => (
                  <button key={s} type="button" onClick={() => setStatusFilter(s)} className={cn('flex-shrink-0 px-4 py-1 rounded-full font-medium transition-colors', statusFilter === s ? 'bg-[#6075FF] text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700')}>{statusLabel(s)} ({statusCounts[s]})</button>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 space-y-2.5">
            {apiArrivalsLoading ? (
              <div className="glass-card p-8 rounded-2xl text-center">
                <p className="text-muted-foreground">Loading arrivals…</p>
              </div>
            ) : apiArrivals.length === 0 ? (
              statusFilter !== 'ALL' ? (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 rounded-2xl text-center">
                  <Filter className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-1">No {statusLabel(statusFilter)} arrivals</h3>
                  <p className="text-sm text-muted-foreground mb-4">No arrivals match this filter. Tap below to show all.</p>
                  <Button onClick={() => setStatusFilter('ALL')} variant="outline" className="rounded-xl">
                    Show all arrivals
                  </Button>
                </motion.div>
              ) : (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 rounded-2xl text-center">
                <div className="relative mb-4 mx-auto w-16 h-16">
                  <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl" />
                  <div className="relative w-16 h-16 rounded-full bg-[#6075FF] flex items-center justify-center shadow-lg shadow-[#6075FF]/20">
                    <Truck className="w-7 h-7 text-white" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">No Arrivals Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Record your first vehicle arrival to start operations</p>
                <Button onClick={() => { resetForm(); setShowAdd(true); }} className="bg-[#6075FF] text-white rounded-xl shadow-lg hover:bg-[#5060e8]">
                  <Plus className="w-4 h-4 mr-2" /> New Arrival
                </Button>
              </motion.div>
              )
            ) : summaryMode === 'sellers' ? (
              <div className="grid grid-cols-1 gap-3">
                {filteredArrivals.flatMap(a => {
                  const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
                  if (!detail?.sellers?.length) return [{ sellerName: '-', lotCount: a.lotCount ?? 0, lots: [] as { id: number; lotName: string }[], vehicleNumber: a.vehicleNumber, key: `ms-${a.vehicleId}-0` }];
                  return detail.sellers.map((s, si) => ({ sellerName: s.sellerName || '-', lotCount: s.lots?.length ?? 0, lots: s.lots ?? [], vehicleNumber: a.vehicleNumber, key: `ms-${a.vehicleId}-${si}` }));
                }).map((item, i) => (
                  <motion.div key={item.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center text-white font-bold shrink-0">{item.sellerName.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{item.sellerName}</p>
                        <p className="text-xs text-muted-foreground">{item.lotCount} lot(s) · {item.vehicleNumber}</p>
                        {item.lots[0] && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{item.lots[0].lotName}{item.lots.length > 1 ? ` +${item.lots.length - 1} more` : ''}</p>}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : summaryMode === 'lots' ? (
              <div className="grid grid-cols-1 gap-3">
                {filteredArrivals.flatMap(a => {
                  const detail = arrivalDetails.find(d => String(d.vehicleId) === String(a.vehicleId));
                  if (!detail?.sellers) return [];
                  return detail.sellers.flatMap(s => (s.lots ?? []).map(lot => ({ lotId: lot.id, lotName: lot.lotName || 'Unnamed', sellerName: s.sellerName || '-', vehicleNumber: a.vehicleNumber, key: `ml-${a.vehicleId}-${lot.id}` })));
                }).map((item, i) => (
                  <motion.div key={item.key} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shrink-0"><Package className="w-5 h-5 text-white" /></div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{item.lotName}</p>
                          <p className="text-xs text-muted-foreground">{item.sellerName} · {item.vehicleNumber}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(`Lot: ${item.lotName}\nSeller: ${item.sellerName}\nVehicle: ${item.vehicleNumber}`).then(() => toast.success('Copied')); }} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"><Share2 className="w-4 h-4" /></button>
                    </div>
                    <span className="inline-flex mt-2 px-2 py-0.5 rounded-full bg-[#eef0ff] dark:bg-[#6075FF]/20 text-[#6075FF] text-[10px] font-bold">{item.vehicleNumber}</span>
                  </motion.div>
                ))}
              </div>
            ) : (() => {
              if (filteredArrivals.length === 0) {
                return (
                  <div className="glass-card p-6 rounded-2xl text-center">
                    <Filter className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No arrivals match your filter</p>
                  </div>
                );
              }
              return filteredArrivals.map((a, i) => {
                const status = getArrivalStatus(a);
                const isExpanded = expandedDetail?.vehicleId === a.vehicleId;
                return (
                  <motion.div key={a.vehicleId + '-' + i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className="glass-card rounded-2xl overflow-hidden">
                      <div className="w-full p-3.5 flex items-center justify-between gap-2">
                        <button type="button" onClick={() => loadExpandedDetail(a.vehicleId)} className="flex-1 flex items-center justify-between text-left min-w-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-[#6075FF] flex items-center justify-center shadow-sm shadow-[#6075FF]/20 flex-shrink-0">
                            <Truck className="w-4 h-4 text-white" />
                          </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold">{a.vehicleNumber}</span>
                                <span className="text-muted-foreground text-xs">|</span>
                                <span className="text-foreground text-xs">{a.primarySellerName ?? '-'}</span>
                                <span className="text-muted-foreground text-xs"> ({(a.totalBags ?? 0)})</span>
                                <ArrivalStatusBadge status={status} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{a.sellerCount} seller(s) · {a.lotCount} lot(s) · {a.netWeight}kg · Bids: {a.bidsCount ?? 0} · Weighed: {a.weighedCount ?? 0}</p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">{new Date(a.arrivalDatetime).toLocaleDateString()}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                        </button>
                      </div>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30">
                            <div className="p-4 space-y-3 text-sm">
                              {expandedDetailLoading ? (
                                <p className="text-muted-foreground">Loading…</p>
                              ) : expandedDetail ? (
                                <>
                                  {(!isArrivalPanelOpen || step === 1) && (
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-2 text-center">
                                        <p className="text-[10px] text-muted-foreground">Net Weight</p>
                                        <p className="font-bold text-foreground">{expandedDetail.netWeight ?? 0}kg</p>
                                      </div>
                                      <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 p-2 text-center">
                                        <p className="text-[10px] text-muted-foreground">Billable</p>
                                        <p className="font-bold text-foreground">{(expandedDetail.netWeight ?? 0) - (expandedDetail.deductedWeight ?? 0)}kg</p>
                                      </div>
                                    </div>
                                  )}
                                  <FreightDetailsCard freightRate={expandedDetail.freightRate ?? 0} netWeight={expandedDetail.netWeight ?? 0} freightMethod={expandedDetail.freightMethod ?? 'BY_WEIGHT'} freightTotal={expandedDetail.freightTotal ?? 0} advancePaid={expandedDetail.advancePaid ?? 0} noRental={expandedDetail.noRental ?? false} />
                                  <SellerInfoCard
                                    sellers={expandedDetail.sellers.map(s => ({
                                      sellerName: s.sellerName,
                                      sellerMark: s.sellerMark,
                                      lots: s.lots.map(l => ({
                                        id: l.id,
                                        lotName: l.lotName,
                                        commodityName: l.commodityName,
                                        bagCount: l.bagCount,
                                        brokerTag: l.brokerTag,
                                        variant: l.variant,
                                      })),
                                    }))}
                                    hidePrint={isArrivalPanelOpen && step > 1}
                                  />
                                  <div className="flex gap-2 pt-1">
                                    {can('Arrivals', 'Edit') && <button type="button" onClick={() => handleEditArrival(a)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted/50 text-xs font-semibold"><Pencil className="w-3.5 h-3.5" /> Edit</button>}
                                    {can('Arrivals', 'Delete') && <button type="button" onClick={() => handleDeleteArrival(a.vehicleId)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/20 text-xs font-semibold text-red-600"><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              });
            })()}
          </div>

          {/* Mobile / Tablet Modal */}
          <AnimatePresence>
            {showAdd && (
              <>
                {/* Glassmorphism backdrop overlay — tablet only */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md hidden md:block lg:hidden"
                    onClick={() => {
                      void tryCloseArrivalPanel(() => setShowAdd(false));
                    }}
                />
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 30, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={cn(
                    "fixed z-50 flex justify-center",
                    "inset-0 bg-background",
                    "md:inset-3 md:rounded-3xl md:border md:border-white/20 md:shadow-2xl md:bg-background/80 md:backdrop-blur-2xl",
                    "lg:inset-0 lg:rounded-none lg:border-0 lg:shadow-none lg:bg-background lg:backdrop-blur-none"
                  )}
                  style={{ WebkitBackdropFilter: 'blur(24px)' }}
                >
                <div className="w-full max-w-[480px] md:max-w-full overflow-y-auto">
                  <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 px-4 sticky top-0 z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            void tryCloseArrivalPanel(() => setShowAdd(false));
                          }}
                          aria-label="Go back"
                          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"
                        >
                          <ArrowLeft className="w-5 h-5 text-white" />
                        </button>
                        <div>
                          <h2 className="text-lg font-bold text-white">New Arrival</h2>
                          <p className="text-white/70 text-xs">Vehicle & Tonnage · Sellers & Lots</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pt-4 space-y-4 pb-36">
                    {editingVehicleId != null && editLoading && (
                      <div className="glass-card rounded-2xl p-8 text-center">
                        <p className="text-muted-foreground font-medium">Loading arrival details…</p>
                        <p className="text-xs text-muted-foreground mt-1">Fetching vehicle, sellers and lots</p>
                      </div>
                    )}
                    {!(editingVehicleId != null && editLoading) && (
                    <>
                    {/* ── Section 1: Arrival Details ── */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                        <Truck className="w-3 h-3 text-white" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Arrival Details</h3>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>

                    <div className="glass-card rounded-2xl p-4 relative z-20 overflow-visible">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Arrival Type</label>
                      <div className="flex gap-2">
                        <button onClick={() => setIsMultiSeller(true)}
                          className={cn("flex-1 py-3 rounded-xl text-sm font-semibold transition-all",
                            isMultiSeller ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md' : 'bg-muted/40 text-muted-foreground')}>
                          Multi Seller (Vehicle)
                        </button>
                        <button onClick={() => setIsMultiSeller(false)}
                          className={cn("flex-1 py-3 rounded-xl text-sm font-semibold transition-all",
                            !isMultiSeller ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md' : 'bg-muted/40 text-muted-foreground')}>
                          Single Seller
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        {isMultiSeller ? 'Vehicle info required (e.g., Bangalore APMC)' : 'Vehicle info not required (e.g., Gadag, Byadagi APMC)'}
                      </p>
                    </div>

                    {isMultiSeller && (
                      <div className="glass-card rounded-2xl p-4">
                        <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block flex items-center gap-1.5", isVehicleNumberInvalid ? "text-red-500" : "text-blue-600 dark:text-blue-400")}>
                          <Truck className="w-3.5 h-3.5" /> Vehicle Number * {isVehicleNumberInvalid && (vehicleNumber.trim() ? <span className="font-normal text-red-500">2–12</span> : <span className="font-normal text-red-500">Required</span>)}
                        </label>
                        <Input placeholder="e.g., MH12AB1234" value={vehicleNumber}
                          onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                          ref={vehicleNumberInputRef}
                          className={cn("h-12 rounded-xl text-base font-medium", isVehicleNumberInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={12} />
                      </div>
                    )}

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5" /> Weigh Bridge
                      </label>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className={cn("text-[10px] mb-1 block", isLoadedWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                            Loaded (kg) * {isLoadedWeightInvalid && (loadedWeight?.trim() ? '⚠ 0–100k' : '⚠ Required')}
                          </label>
                          <Input type="number" placeholder="0" value={loadedWeight} onChange={e => setLoadedWeight(e.target.value)}
                            ref={loadedWeightInputRef}
                            className={cn("h-12 rounded-xl text-base font-medium", isLoadedWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                        </div>
                        <div>
                          <label className={cn("text-[10px] mb-1 block", isEmptyWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                            Empty (kg) * {isEmptyWeightInvalid && (emptyWeight?.trim() ? (parseFloat(emptyWeight) > (parseFloat(loadedWeight) || 0) ? '⚠ ≤ Loaded' : '⚠ 0–100k') : '⚠ Required')}
                          </label>
                          <Input type="number" placeholder="0" value={emptyWeight} onChange={e => setEmptyWeight(e.target.value)}
                            className={cn("h-12 rounded-xl text-base font-medium", isEmptyWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className={cn("text-[10px] mb-1 block", isDeductedWeightInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                          Deducted (kg) optional {isDeductedWeightInvalid && '⚠ 0–10,000'}
                        </label>
                        <Input type="number" placeholder="0" value={deductedWeight} onChange={e => setDeductedWeight(e.target.value)}
                          className={cn("h-12 rounded-xl text-base font-medium", isDeductedWeightInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={10000} step="0.01" />
                      </div>
                      {step === 1 && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-3 text-center border border-blue-200/50 dark:border-blue-800/30">
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Net Weight (LW − EW)</p>
                            <p className="text-xl font-bold text-foreground">{netWeight}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                          </div>
                          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3 text-center border border-violet-200/50 dark:border-violet-800/30">
                            <p className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">Billable (NW − DW)</p>
                            <p className="text-xl font-bold text-foreground">{finalBillableWeight}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block", isGodownInvalid ? "text-red-500" : "text-muted-foreground")}>
                            Godown (optional) {isGodownInvalid && '⚠ 2–50'}
                          </label>
                          <Input placeholder="Godown (optional)" value={godown} onChange={e => setGodown(e.target.value)} className={cn("h-12 rounded-xl", isGodownInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={50} />
                        </div>
                        <div>
                          <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block", isGatepassNumberInvalid ? "text-red-500" : "text-muted-foreground")}>
                            Gatepass (optional) {isGatepassNumberInvalid && '⚠ 1–30'}
                          </label>
                          <Input placeholder="Gatepass (optional)" value={gatepassNumber} onChange={e => setGatepassNumber(e.target.value.length <= 30 ? e.target.value : gatepassNumber)} className={cn("h-12 rounded-xl", isGatepassNumberInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} maxLength={30} />
                        </div>
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Origin (location)</label>
                      <LocationSearchInput value={origin} onChange={setOrigin} placeholder="Search city, market yard, address…" />
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className={cn("text-xs font-bold uppercase tracking-wider mb-2 block", isBrokerNameInvalid ? "text-red-500" : "text-muted-foreground")}>
                        Broker (optional) {isBrokerNameInvalid && '⚠ 2–100'}
                      </label>
                      <div ref={brokerSearchWrapRef} className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Search contact or type any name"
                          value={brokerName}
                          onChange={e => { setBrokerName(e.target.value); setBrokerContactId(null); refreshBrokerDropdownPos(); setBrokerDropdown(true); }}
                          onFocus={() => { if (brokerName.trim()) { refreshBrokerDropdownPos(); setBrokerDropdown(true); } }}
                          onBlur={() => setTimeout(() => setBrokerDropdown(false), 180)}
                          className={cn("h-12 rounded-xl pl-10", isBrokerNameInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")}
                        />
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-4">
                      <label className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5" /> Freight Calculator
                      </label>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {FREIGHT_METHODS.map(m => (
                          <button key={m.value} onClick={() => setFreightMethod(m.value)}
                            className={cn("py-2 rounded-xl text-xs font-semibold transition-all",
                              freightMethod === m.value ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md' : 'bg-muted/40 text-muted-foreground')}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <button onClick={() => setNoRental(!noRental)}
                          className={cn("w-14 h-8 rounded-full transition-all relative shadow-inner",
                            noRental ? 'bg-gradient-to-r from-red-500 to-rose-500 shadow-red-500/30' : 'bg-slate-300 dark:bg-slate-600')}>
                          <motion.div className="w-6 h-6 rounded-full bg-white shadow-md absolute top-1" animate={{ x: noRental ? 28 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                        </button>
                        <span className="text-sm text-foreground font-medium">No Rental</span>
                      </div>
                      {!noRental && (
                        <>
                          <div className="mb-3">
                            <label className={cn("text-[10px] mb-1 block", isFreightRateInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                              Rate * {isFreightRateInvalid && (freightRate?.trim() ? '⚠ 0–100k' : '⚠ Required')}
                            </label>
                            <Input type="number" placeholder="0" value={freightRate} onChange={e => setFreightRate(e.target.value)}
                              className={cn("h-12 rounded-xl text-base font-medium", isFreightRateInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={100000} step="0.01" />
                          </div>
                          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 text-center border border-amber-200/50 dark:border-amber-800/30 mb-3">
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Total Rental</p>
                            <p className="text-xl font-bold text-foreground">₹{freightTotal.toLocaleString()}</p>
                          </div>
                          <div className="mb-3">
                            <label className={cn("text-[10px] mb-1 block", isAdvancePaidInvalid ? "text-red-500 font-bold" : "text-muted-foreground")}>
                              Advance (optional) {isAdvancePaidInvalid && '⚠ 0–1M'}
                            </label>
                            <Input type="number" placeholder="0" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)}
                              className={cn("h-12 rounded-xl text-base font-medium", isAdvancePaidInvalid && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20")} min={0} max={1000000} step="0.01" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Narration</label>
                            <Input placeholder="e.g., Freight for vehicle arrival" value={narration} onChange={e => setNarration(e.target.value)}
                              className="h-12 rounded-xl" />
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {NARRATION_PRESETS.map(n => (
                                <button key={n} onClick={() => setNarration(n)}
                                  className={cn("px-2 py-1 rounded-lg text-[10px] font-medium transition-all",
                                    narration === n ? 'bg-amber-500 text-white' : 'bg-muted/50 text-muted-foreground')}>
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* ── Section 2: Sellers & Lots ── */}
                    <div className="flex items-center gap-2 pt-2">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <Users className="w-3 h-3 text-white" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Sellers & Lots</h3>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>

                    <div className={cn("glass-card rounded-2xl p-5", !isMultiSeller && sellers.length >= 1 && "opacity-60 pointer-events-none")}>
                      <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Add Seller
                        {!isMultiSeller && sellers.length >= 1 && <span className="text-muted-foreground font-normal normal-case">(single-seller: one only)</span>}
                      </label>
                      <div className="flex gap-3">
                        <div ref={sellerSearchWrapRef} className="relative flex-1 min-w-0">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                          <Input placeholder="Search by name, phone, or mark…" value={sellerSearch}
                            onChange={e => { setSellerSearch(e.target.value); refreshDropdownPos(); setSellerDropdown(true); }}
                            onFocus={() => { if (sellerSearch) { refreshDropdownPos(); setSellerDropdown(true); } }}
                            onBlur={() => setTimeout(() => setSellerDropdown(false), 150)}
                            className="h-12 rounded-xl pl-10" />
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addSellerByName} className="h-12 rounded-xl shrink-0" disabled={!isMultiSeller && sellers.length >= 1}>
                          Add by name
                        </Button>
                      </div>
                    </div>

                    {sellers.length === 0 && (
                      <div className="glass-card rounded-2xl p-6 text-center">
                        <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">Search and add sellers to this arrival</p>
                      </div>
                    )}

                    {sellers.map((seller, si) => {
                      const expanded = sellerExpanded[seller.seller_vehicle_id] ?? true;
                      const sellerTotal = sellerTotalBagsById[seller.seller_vehicle_id] ?? 0;
                      return (
                      <motion.div key={seller.seller_vehicle_id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                        className="glass-card rounded-2xl overflow-hidden">
                        <div className="p-4 flex items-stretch justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-b border-border/30">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
                              <span className="text-white text-xs font-bold">{seller.seller_mark || seller.seller_name?.charAt(0) || '?'}</span>
                            </div>
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {seller.contact_id !== '' ? (
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-[12px] text-foreground truncate">
                                    {seller.seller_name}
                                  </p>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {seller.seller_mark ? (
                                      <span className="text-[10px] text-muted-foreground truncate whitespace-nowrap">
                                        ({seller.seller_mark})
                                      </span>
                                    ) : null}
                                    {/* Reserved space for seller serial/identifier (next bug) */}
                                    <span className="text-[10px] text-transparent whitespace-nowrap">#ID</span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground truncate">{seller.seller_phone}</p>
                                  <div className="flex items-center justify-between gap-2 mt-0.5">
                                    <p className="text-[10px] text-muted-foreground/80 truncate">{seller.lots.length} lot(s)</p>
                                    {/* Reserved right-side slot for future serial/id value */}
                                    <span className="text-[10px] text-transparent whitespace-nowrap">—</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 gap-2 min-w-0 flex-1">
                                  <div>
                                    <Input
                                      placeholder="Seller name * (2–100)"
                                      value={seller.seller_name}
                                      onChange={e => updateSeller(si, { seller_name: e.target.value })}
                                      className={cn(
                                        "h-9 rounded-lg text-xs",
                                        isSellerNameInvalid(seller) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={100}
                                    />
                                    {isSellerNameInvalid(seller) && <p className="text-[9px] text-red-500 mt-0.5">2–100 characters</p>}
                                  </div>
                                  <div>
                                    <Input
                                      placeholder="Mark / alias (optional, 2–50)"
                                      value={seller.seller_mark}
                                      onChange={e => updateSeller(si, { seller_mark: e.target.value })}
                                      className={cn(
                                        "h-9 rounded-lg text-xs",
                                        isSellerMarkInvalid(seller, si) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                      )}
                                      maxLength={50}
                                    />
                                    {isSellerMarkInvalid(seller, si) && <p className="text-[9px] text-red-500 mt-0.5">{getSellerMarkError(seller, si) ?? '2–50 if set'}</p>}
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] text-muted-foreground/80 truncate">{seller.lots.length} lot(s)</p>
                                    {/* Reserved space for future seller serial/identifier (next bug) */}
                                    <span className="text-[10px] text-transparent whitespace-nowrap">#ID</span>
                                  </div>
                                </div>
                              )}
                              {/* Prominent total bags beside seller details */}
                              <div className="shrink-0 self-center">
                                <div className="px-3 py-1.5 rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 font-extrabold shadow-sm ring-1 ring-emerald-600/20">
                                  <span className="text-xl leading-none">{sellerTotal}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-between py-1">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSellerExpanded(prev => ({ ...prev, [seller.seller_vehicle_id]: !expanded }))}
                                aria-label={expanded ? 'Collapse seller lots' : 'Expand seller lots'}
                                className={cn(
                                  "w-7 h-7 rounded-lg flex items-center justify-center",
                                  expanded ? "bg-muted/40 hover:bg-muted/50" : "bg-muted/20 hover:bg-muted/40"
                                )}
                              >
                                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                              </button>
                              <button onClick={() => addLot(si)} className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-sm">
                                <Plus className="w-3.5 h-3.5 text-white" />
                              </button>
                            </div>
                            <button onClick={() => removeSeller(si)} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              key={`${seller.seller_vehicle_id}-lots-mobile`}
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="border-t border-border/30"
                            >
                              <div ref={setLotsScrollRef(seller.seller_vehicle_id)} className="h-[240px] overflow-y-auto p-3 space-y-2 overscroll-contain">
                                {seller.lots.length === 0 && (
                                  <p className="text-xs text-muted-foreground text-center py-2 italic">No lots. Tap + to add a lot.</p>
                                )}
                                {seller.lots.map((lot, li) => {
                                  const vehicleTotal = vehicleTotalBags;
                                  const lotDuplicateError = !isLotNameInvalid(lot) ? getLotNameDuplicateError(si, li) : null;
                                  return (
                                    <div key={lot.lot_id} className="rounded-xl border border-border/30 p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Lot {li + 1} <span className="font-normal text-foreground">— {vehicleTotal} / {sellerTotal} bags</span></p>
                                        <button onClick={() => removeLot(si, li)} className="text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                                      </div>
                                      <div className="grid grid-cols-4 gap-2 items-end">
                                        <div>
                                          <Input
                                            aria-label="Lot Name"
                                            placeholder="Lot Name"
                                            value={lot.lot_name}
                                            onChange={e => updateLot(si, li, { lot_name: e.target.value })}
                                            className={cn(
                                              "h-10 w-full rounded-lg text-sm",
                                              (isLotNameInvalid(lot) || lotDuplicateError) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                            )}
                                            inputMode="text"
                                            maxLength={50}
                                          />
                                          {lotDuplicateError && <p className="text-[9px] text-red-500 mt-0.5">{lotDuplicateError}</p>}
                                        </div>
                                        <div>
                                          <Input
                                            aria-label="Bags Quantity"
                                            type="number"
                                            placeholder="Bags"
                                            value={lot.quantity || ''}
                                            onChange={e => updateLot(si, li, { quantity: parseInt(e.target.value) || 0 })}
                                            className={cn(
                                              "h-10 w-full rounded-lg text-sm",
                                              isLotQuantityInvalid(lot) && "border-red-500 ring-2 ring-red-500/30 bg-red-50 dark:bg-red-950/20"
                                            )}
                                            min={1}
                                            max={100000}
                                          />
                                        </div>
                                        <div>
                                          <select
                                            aria-label="Commodity"
                                            value={lot.commodity_name}
                                            onChange={e => updateLot(si, li, { commodity_name: e.target.value })}
                                            className="h-10 w-full rounded-lg bg-background border border-input text-sm px-2"
                                          >
                                            {commodities.map((c: any) => (
                                              <option key={c.commodity_id} value={c.commodity_name}>{c.commodity_name}</option>
                                            ))}
                                            {commodities.length === 0 && <option value="">No commodities</option>}
                                          </select>
                                        </div>
                                        <div>
                                          <select
                                            aria-label="Variant"
                                            value={lot.variant ?? ''}
                                            onChange={e => updateLot(si, li, { variant: e.target.value })}
                                            className="h-10 w-full rounded-lg bg-background border border-input text-sm px-2"
                                          >
                                            {VARIANT_OPTIONS.map(opt => (
                                              <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );})}

                    </> )}
                    {/* ── Sticky Submit Button ── */}
                    <div className="h-4" />
                  </div>

                  {/* Fixed bottom submit bar - sits above bottom nav */}
                  <div className="fixed bottom-14 left-0 right-0 z-[60] bg-background/90 backdrop-blur-xl border-t border-border/40 px-4 py-3 md:px-6">
                    <div className="max-w-[480px] md:max-w-full mx-auto">
                      <Button onClick={handleSubmitArrival}
                        disabled={(!editingVehicleId && sellers.length === 0) || isFormInvalid}
                        className="w-full h-14 rounded-xl font-bold text-base bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60">
                        <FileText className="w-5 h-5 mr-2" /> {editingVehicleId != null ? 'Update Arrival' : `Submit Arrival (${sellers.length} seller${sellers.length !== 1 ? 's' : ''})`}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}

      {!isDesktop && <BottomNav />}

      {/* ── Seller search dropdown rendered via portal so it escapes all overflow:hidden parents ── */}
      {sellerDropdown && filteredContacts.length > 0 && createPortal(
        <AnimatePresence>
          <motion.div
            key="seller-dropdown-portal"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 9999,
            }}
            className="bg-card border border-border/50 rounded-xl shadow-2xl max-h-52 overflow-y-auto"
          >
            {filteredContacts.map(c => (
              <button
                key={c.contact_id}
                onMouseDown={e => { e.preventDefault(); addSeller(c); }}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2 border-b border-border/20 last:border-0"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">{c.mark || c.name.charAt(0)}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-foreground font-medium">{c.name}</span>
                  {c.mark && <span className="text-muted-foreground text-xs ml-1">({c.mark})</span>}
                </div>
                <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">{c.phone}</span>
              </button>
            ))}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* ── Broker search dropdown (contact or type any name) ── */}
      {brokerDropdown && filteredBrokers.length > 0 && createPortal(
        <AnimatePresence>
          <motion.div
            key="broker-dropdown-portal"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              top: brokerDropdownPos.top,
              left: brokerDropdownPos.left,
              width: brokerDropdownPos.width,
              zIndex: 9999,
            }}
            className="bg-card border border-border/50 rounded-xl shadow-2xl max-h-52 overflow-y-auto"
          >
            {filteredBrokers.map(c => (
              <button
                key={c.contact_id}
                type="button"
                onMouseDown={e => { e.preventDefault(); setBrokerName(c.name ?? ''); setBrokerContactId(Number(c.contact_id) || null); setBrokerDropdown(false); }}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2 border-b border-border/20 last:border-0"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">{c.mark || c.name?.charAt(0) || '?'}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-foreground font-medium">{c.name}</span>
                  {c.mark && <span className="text-muted-foreground text-xs ml-1">({c.mark})</span>}
                </div>
                <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">{c.phone}</span>
              </button>
            ))}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default ArrivalsPage;