import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Gavel, Plus, Trash2,
  ShoppingCart, User, Package, Truck, IndianRupee, Banknote, ChevronDown,
  Search, AlertTriangle, Merge, Hash,
  ChevronLeft, ChevronRight, List, Filter, Printer,
  Pencil, Check, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { isNative, hapticSelection, hapticImpact, hapticNotification, hideNativeKeyboard, NotificationType } from '@/hooks/use-native';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import BottomNav from '@/components/BottomNav';
import ScribblePad from '@/components/ScribblePad';
import InlineScribblePad, { MAX_MARK_LEN, type MarkDetectionMeta } from '@/components/InlineScribblePad';
import { contactApi, auctionApi, presetMarksApi } from '@/services/api';
import type {
  LotSummaryDTO,
  AuctionSelfSaleUnitDTO,
  AuctionSessionDTO,
  AuctionEntryDTO,
  AuctionResultDTO,
  AuctionSelfSaleContextDTO,
  AuctionBidCreateRequest,
  AuctionBidUpdateRequest,
} from '@/services/api/auction';
import type { Contact } from '@/types/models';
import { toast } from 'sonner';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { directPrint } from '@/utils/printTemplates';
import { generateAuctionCompletionPrintHTML } from '@/utils/printDocumentTemplates';
import { useAuth } from '@/context/AuthContext';

// ── Types ─────────────────────────────────────────────────
interface LotInfo {
  lot_id: string;
  selfSaleUnitId?: string | null;
  lot_name: string;
  bag_count: number;
  original_bag_count: number;
  commodity_name: string;
  seller_name: string;
  seller_mark: string;
  seller_vehicle_id: string;
  vehicle_number: string;
  was_modified: boolean;
  status?: LotStatus;
  vehicle_total_qty?: number;
  seller_total_qty?: number;
  selfSaleQty?: number;
  remainingQty?: number;
  selfSaleRate?: number;
  selfSaleAmount?: number;
  createdAt?: string;
}

type LotStatus = 'available' | 'sold' | 'partial' | 'pending' | 'self_sale';
type LotSource = 'regular' | 'self_sale';

type PresetType = 'PROFIT' | 'LOSS';

interface SaleEntry {
  id: string;
  bidNumber: number;
  buyerName: string;
  buyerMark: string;
  buyerContactId: string | null;
  rate: number;
  quantity: number;
  amount: number;
  isSelfSale: boolean;
  isScribble: boolean;
  tokenAdvance: number;
  extraRate: number;
  presetApplied: number;
  presetType: PresetType;
  sellerRate: number;
  buyerRate: number;
  /** From API `last_modified_ms` — sent back on PATCH for concurrency */
  lastModifiedMs?: number | null;
}

const DEFAULT_PRESETS = [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
];

// ── In-memory draft only (no localStorage). Session-only; backend draft API not implemented. ──
interface AuctionDraft {
  selectedLotId: string | null;
  entries: SaleEntry[];
  rate: string;
  qty: string;
  preset: number;
  presetType: PresetType;
  showPresetMargin: boolean;
  scribbleMark: string;
}

let inMemoryAuctionDraft: AuctionDraft | null = null;

function saveDraft(draft: AuctionDraft) {
  inMemoryAuctionDraft = draft;
}

function loadDraft(): AuctionDraft | null {
  return inMemoryAuctionDraft;
}

function clearDraft() {
  inMemoryAuctionDraft = null;
}

// ── Get lot status (uses API status when available, else draft for pending) ──────────────────
function getLotStatus(lotId: string, bagCount: number, apiStatus?: string): LotStatus {
  const draft = loadDraft();
  if (draft?.selectedLotId === lotId && draft.entries.length > 0) return 'pending';
  if (apiStatus === 'sold' || apiStatus === 'partial' || apiStatus === 'available' || apiStatus === 'pending' || apiStatus === 'self_sale')
    return apiStatus as LotStatus;
  return 'available';
}

/** Badge row status: Self-Sale tab shows Self-Sale label; otherwise auction-derived status. */
function getRowLotStatus(lot: LotInfo, statusFilter: LotStatus | 'all'): LotStatus {
  if (statusFilter === 'self_sale') return 'self_sale';
  return getLotStatus(lot.lot_id, lot.bag_count, lot.status);
}

const STATUS_CONFIG: Record<LotStatus, { label: string; bg: string; text: string; dot: string }> = {
  available: { label: 'Available', bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  sold: { label: 'Sold', bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  partial: { label: 'Partial', bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  pending: { label: 'Pending', bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  self_sale: { label: 'Self-Sale', bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-700 dark:text-fuchsia-400', dot: 'bg-fuchsia-500' },
};

/**
 * Lot identifier format: Vehicle QTY / Seller QTY / Lot Name - Lot QTY
 * e.g. 200/150/50-50 (vehicle 200, seller 150, lot "50" with 50 bags)
 * Falls back to legacy format when vehicle/seller totals are not available.
 */
function formatLotDisplayName(lot: {
  vehicle_number: string;
  seller_name: string;
  bag_count: number;
  lot_name?: string;
  vehicle_total_qty?: number;
  seller_total_qty?: number;
}): string {
  const vTotal = lot.vehicle_total_qty ?? lot.bag_count;
  const sTotal = lot.seller_total_qty ?? lot.bag_count;
  const lotName = lot.lot_name ?? String(lot.bag_count);
  const lotQty = lot.bag_count;
  return `${vTotal}/${sTotal}/${lotName}-${lotQty}`;
}

// ── Map API DTOs to UI types ──────────────────────────────
function lotSummaryToLotInfo(dto: LotSummaryDTO): LotInfo {
  return {
    lot_id: String(dto.lot_id),
    lot_name: dto.lot_name ?? '',
    bag_count: dto.bag_count ?? 0,
    original_bag_count: dto.original_bag_count ?? dto.bag_count ?? 0,
    commodity_name: dto.commodity_name ?? '',
    seller_name: dto.seller_name ?? '',
    seller_mark: dto.seller_mark ?? '',
    seller_vehicle_id: String(dto.seller_vehicle_id ?? ''),
    vehicle_number: dto.vehicle_number ?? '',
    was_modified: dto.was_modified ?? false,
    status: (dto.status?.toLowerCase() as LotStatus) ?? 'available',
    vehicle_total_qty: dto.vehicle_total_qty,
    seller_total_qty: dto.seller_total_qty,
  };
}

function selfSaleUnitToLotInfo(dto: AuctionSelfSaleUnitDTO): LotInfo {
  return {
    lot_id: String(dto.lot_id),
    selfSaleUnitId: String(dto.self_sale_unit_id),
    lot_name: dto.lot_name ?? '',
    bag_count: dto.remaining_qty ?? dto.bag_count ?? 0,
    original_bag_count: dto.original_bag_count ?? dto.self_sale_qty ?? dto.bag_count ?? 0,
    commodity_name: dto.commodity_name ?? '',
    seller_name: dto.seller_name ?? '',
    seller_mark: dto.seller_mark ?? '',
    seller_vehicle_id: String(dto.seller_vehicle_id ?? ''),
    vehicle_number: dto.vehicle_number ?? '',
    was_modified: false,
    status: 'self_sale',
    selfSaleQty: dto.self_sale_qty ?? 0,
    remainingQty: dto.remaining_qty ?? 0,
    selfSaleRate: dto.rate ?? 0,
    selfSaleAmount: dto.amount ?? 0,
    createdAt: dto.created_at,
  };
}

function getLotRenderKey(lot: LotInfo): string {
  return lot.selfSaleUnitId ? `self-sale-${lot.selfSaleUnitId}` : `lot-${lot.lot_id}`;
}

/** Display signed preset margin in grid (+10, −20) or em dash when zero. */
function formatPresetMarginCell(margin: number): string {
  const m = Number(margin);
  if (!Number.isFinite(m) || m === 0) return '—';
  return m > 0 ? `+${m}` : String(m);
}

/** One character for strip avatars: prefer first letter of mark, else first letter of name. */
function contactAvatarLetter(mark: string | undefined | null, name: string | undefined | null): string {
  const m = (mark ?? '').trim();
  const src = m || (name ?? '').trim();
  return src ? src.charAt(0).toUpperCase() : '?';
}

/** First letter of a mark string (temporary-buyer chips). */
function markAvatarLetter(mark: string): string {
  const t = mark.trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

function sessionEntryToSaleEntry(e: AuctionEntryDTO): SaleEntry {
  return {
    id: String(e.auction_entry_id),
    bidNumber: e.bid_number,
    buyerName: e.buyer_name ?? '',
    buyerMark: e.buyer_mark ?? '',
    buyerContactId: e.buyer_id != null ? String(e.buyer_id) : null,
    rate: Number(e.bid_rate),
    quantity: e.quantity ?? 0,
    amount: Number(e.amount ?? 0),
    isSelfSale: e.is_self_sale ?? false,
    isScribble: e.is_scribble ?? false,
    tokenAdvance: Number(e.token_advance ?? 0),
    extraRate: Number(e.extra_rate ?? 0),
    presetApplied: Number(e.preset_margin ?? 0),
    presetType: (e.preset_type as PresetType) ?? 'PROFIT',
    // API keeps base bid and preset separate; UI shows seller line as bid + preset
    sellerRate: Number(e.bid_rate) + Number(e.preset_margin ?? 0),
    buyerRate: Number(e.buyer_rate ?? e.bid_rate),
    lastModifiedMs: e.last_modified_ms ?? null,
  };
}

const AuctionsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { trader } = useAuth();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Auctions / Sales');
  if (!canView) {
    return <ForbiddenPage moduleName="Auctions" />;
  }
  const [buyers, setBuyers] = useState<Contact[]>([]);
  /** Distinct scribble marks for current trader calendar day (from API); not tied to current lot only. */
  const [temporaryBuyerMarks, setTemporaryBuyerMarks] = useState<string[]>([]);
  const [entries, setEntries] = useState<SaleEntry[]>([]);
  const [showPresetMargin, setShowPresetMargin] = useState(false);
  const [showScribble, setShowScribble] = useState(false);
  const [scribbleMark, setScribbleMark] = useState('');
  const [preset, setPreset] = useState(0);
  const [presetType, setPresetType] = useState<PresetType>('PROFIT');
  const [showTokenInput, setShowTokenInput] = useState<string | null>(null);
  const [scribblePadResetTrigger, setScribblePadResetTrigger] = useState(0);
  /** Last segment appended from the inline scribble pad (for correcting via candidate chip in append mode). */
  const lastScribbleSegmentRef = useRef('');
  const markInputRef = useRef<HTMLInputElement>(null);
  const pendingMarkCaretPosRef = useRef<number | null>(null);
  const markInsertPosRef = useRef<number | null>(null);
  const forceMarkFocusRef = useRef(false);
  const braceLockActiveRef = useRef(false);
  const manualMarkSelectionRef = useRef(false);
  const [activeNumpadField, setActiveNumpadField] = useState<'rate' | 'qty' | 'mark'>('rate');
  const [mobileKeyboardEnabled, setMobileKeyboardEnabled] = useState(false);
  const rateInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Lot selection
  const [showLotSelector, setShowLotSelector] = useState(true);
  const [availableLots, setAvailableLots] = useState<LotInfo[]>([]);
  const [selfSaleLots, setSelfSaleLots] = useState<LotInfo[]>([]);
  const [selectedLot, setSelectedLot] = useState<LotInfo | null>(null);
  const [selectedLotSource, setSelectedLotSource] = useState<LotSource>('regular');
  const [selfSaleContext, setSelfSaleContext] = useState<AuctionSelfSaleContextDTO | null>(null);
  const [lotSearchQuery, setLotSearchQuery] = useState('');
  const [lotNavMode, setLotNavMode] = useState<'all' | 'vehicle' | 'seller' | 'lot_number'>('all');
  const [lotNumberSearch, setLotNumberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LotStatus | 'all'>('all');
  const [showLotList, setShowLotList] = useState(false);

  // Duplicate mark dialog
  const [duplicateMarkDialog, setDuplicateMarkDialog] = useState<{
    mark: string; buyerName: string; buyerContactId: string | null;
    rate: number; qty: number; isScribble: boolean;
    existingEntry: SaleEntry;
  } | null>(null);

  // Quantity increase confirmation
  const [qtyIncreaseDialog, setQtyIncreaseDialog] = useState<{
    currentTotal: number; lotTotal: number; attemptedQty: number;
    pendingEntry: Omit<SaleEntry, 'id' | 'bidNumber'>;
  } | null>(null);

  // Preset options from Settings (dynamic); fallback to default
  const [presetOptions, setPresetOptions] = useState<{ label: string; value: number }[]>(DEFAULT_PRESETS);

  // API loading / 409 retry
  const [lotsLoading, setLotsLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [completedAuction, setCompletedAuction] = useState<AuctionResultDTO | null>(null);
  const [addBidRetryAllowIncrease, setAddBidRetryAllowIncrease] = useState(false);
  const [pendingDeleteBid, setPendingDeleteBid] = useState<{ id: string; label: string } | null>(null);

  /** ENH-34: inline edit bid row */
  const [editingBidId, setEditingBidId] = useState<string | null>(null);
  const [editBidDraft, setEditBidDraft] = useState<{
    rate: string;
    qty: string;
    preset: number;
    presetType: PresetType;
    extraRate: string;
    token: string;
    lastModifiedMs: number | null;
  } | null>(null);
  const [editBidRetryAllowIncrease, setEditBidRetryAllowIncrease] = useState(false);
  const [editBidQtyDialog, setEditBidQtyDialog] = useState<{
    currentTotal: number; lotTotal: number; attemptedQty: number;
    pendingBody: AuctionBidUpdateRequest;
    bidNumericId: number;
  } | null>(null);

  type EditBidFormSnapshot = {
    selectedBuyer: Contact | null;
    scribbleMark: string;
    rate: string;
    qty: string;
    showPresetMargin: boolean;
    preset: number;
    presetType: PresetType;
    activeNumpadField: 'rate' | 'qty' | 'mark';
    mobileKeyboardEnabled: boolean;
    lastScribbleSegment: string;
  };

  const editBidFormSnapshotRef = useRef<EditBidFormSnapshot | null>(null);

  // New entry form
  const [selectedBuyer, setSelectedBuyer] = useState<Contact | null>(null);
  const [rate, setRate] = useState('');
  const [qty, setQty] = useState('');
  const autoPrintedAuctionRef = useRef<string | null>(null);
  const isTouchLayout = !isDesktop;

  // Skip initial draft restore flag
  const draftRestored = useRef(false);

  // Horizontal scroll: mouse-drag and arrow-key support (desktop + touch)
  const contactScrollRef = useRef<HTMLDivElement>(null);
  const markScrollRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);
  const didDragContactRef = useRef(false);
  const didDragMarkRef = useRef(false);

  const makeScrollHandlers = useCallback((
    ref: React.RefObject<HTMLDivElement | null>,
    didDragRef: React.MutableRefObject<boolean>
  ) => {
    return {
      onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
        if (!ref.current) return;
        dragStartX.current = e.clientX;
        dragStartScroll.current = ref.current.scrollLeft;
        didDragContactRef.current = false;
        didDragMarkRef.current = false;
        const onMove = (moveE: MouseEvent) => {
          if (!ref.current) return;
          const dx = dragStartX.current - moveE.clientX;
          ref.current.scrollLeft = dragStartScroll.current + dx;
          if (Math.abs(dx) > 5) didDragRef.current = true;
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          setTimeout(() => {
            didDragContactRef.current = false;
            didDragMarkRef.current = false;
          }, 0);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        if (!ref.current) return;
        if (e.key === 'ArrowLeft') {
          ref.current.scrollLeft -= 140;
          e.preventDefault();
        }
        if (e.key === 'ArrowRight') {
          ref.current.scrollLeft += 140;
          e.preventDefault();
        }
      },
    };
  }, []);

  const loadLots = useCallback(async (opts?: { q?: string; status?: string }) => {
    setLotsLoading(true);
    try {
      const list = await auctionApi.listLots({
        page: 0,
        size: 500,
        q: opts?.q || undefined,
        status: opts?.status || undefined,
      });
      const lots: LotInfo[] = list.map(lotSummaryToLotInfo);
      setAvailableLots(lots);
      return lots;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load lots');
      setAvailableLots([]);
      return [];
    } finally {
      setLotsLoading(false);
    }
  }, []);

  const loadSelfSaleLots = useCallback(async (opts?: { q?: string }) => {
    try {
      const list = await auctionApi.listSelfSaleUnits({
        page: 0,
        size: 500,
        q: opts?.q || undefined,
      });
      const lots: LotInfo[] = list.map(selfSaleUnitToLotInfo);
      setSelfSaleLots(lots);
      return lots;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load self-sale lots');
      setSelfSaleLots([]);
      return [];
    }
  }, []);

  const loadTemporaryBuyerMarks = useCallback(async () => {
    try {
      const marks = await auctionApi.listTemporaryBuyerMarksToday();
      setTemporaryBuyerMarks(Array.isArray(marks) ? marks : []);
    } catch {
      setTemporaryBuyerMarks([]);
    }
  }, []);

  // Load buyers, lots, and preset settings from API
  useEffect(() => {
    contactApi.list({ scope: 'participants' }).then(setBuyers);
    loadTemporaryBuyerMarks();
    loadLots();
    loadSelfSaleLots();
    presetMarksApi
      .list()
      .then((list) => {
        if (list && list.length > 0) {
          setPresetOptions(
            list.map((p) => ({
              label: p.predefined_mark ?? String(p.extra_amount),
              value: Number(p.extra_amount),
            }))
          );
        }
      })
      .catch(() => { /* keep default presets */ });
  }, [loadTemporaryBuyerMarks, loadLots, loadSelfSaleLots]);

  // ── Restore draft after lots are loaded from API ─────────
  useEffect(() => {
    if (draftRestored.current || availableLots.length === 0) return;
    const draft = loadDraft();
    if (!draft || !draft.selectedLotId) return;
    draftRestored.current = true;
    const lot = availableLots.find(l => l.lot_id === draft.selectedLotId);
    if (!lot) return;
    setSelectedLot(lot);
    setShowLotSelector(false);
    setRate(draft.rate || '');
    setQty(draft.qty || '');
    setPreset(draft.preset || 0);
    setPresetType(draft.presetType || 'PROFIT');
    setShowPresetMargin(draft.showPresetMargin || false);
    setScribbleMark(draft.scribbleMark || '');
    lastScribbleSegmentRef.current = '';
    setSessionLoading(true);
    auctionApi
      .getOrStartSession(lot.lot_id)
      .then((session: AuctionSessionDTO) => {
        setEntries(session.entries.map(sessionEntryToSaleEntry));
        void loadTemporaryBuyerMarks();
      })
      .catch(() => { /* entries stay empty from draft if API fails */ })
      .finally(() => setSessionLoading(false));
    toast.info('Draft restored from previous session');
  }, [availableLots, loadTemporaryBuyerMarks]);

  // ── Auto-save draft on state change ─────────────────────
  useEffect(() => {
    if (!draftRestored.current) return;
    saveDraft({
      selectedLotId: selectedLot?.lot_id || null,
      entries,
      rate,
      qty,
      preset,
      presetType,
      showPresetMargin,
      scribbleMark,
    });
  }, [selectedLot, entries, rate, qty, preset, presetType, showPresetMargin, scribbleMark]);

  // Filter lots (lot identifier format e.g. 320/320/110-110 also searchable)
  const filteredLots = useMemo(() => {
    let result = statusFilter === 'self_sale' ? selfSaleLots : availableLots;
    if (lotSearchQuery) {
      const q = lotSearchQuery.toLowerCase();
      result = result.filter(l =>
        l.lot_name.toLowerCase().includes(q) ||
        l.seller_name.toLowerCase().includes(q) ||
        l.seller_mark.toLowerCase().includes(q) ||
        l.vehicle_number.toLowerCase().includes(q) ||
        l.commodity_name.toLowerCase().includes(q) ||
        formatLotDisplayName(l).toLowerCase().includes(q)
      );
    }
    if (lotNumberSearch) {
      const q = lotNumberSearch.toLowerCase();
      result = result.filter(l =>
        l.lot_name.toLowerCase().includes(q) ||
        l.lot_id.toLowerCase().includes(q) ||
        formatLotDisplayName(l).toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all' && statusFilter !== 'self_sale') {
      result = result.filter(l => getLotStatus(l.lot_id, l.bag_count, l.status) === statusFilter);
    }
    return result;
  }, [availableLots, selfSaleLots, lotSearchQuery, lotNumberSearch, statusFilter]);

  const selectorLots = useMemo(
    () => (statusFilter === 'self_sale' ? selfSaleLots : availableLots),
    [statusFilter, selfSaleLots, availableLots]
  );

  // Group lots by vehicle for navigation
  const lotsByVehicle = useMemo(() => {
    const map = new Map<string, LotInfo[]>();
    filteredLots.forEach(l => {
      const key = l.vehicle_number || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return map;
  }, [filteredLots]);

  // Group lots by seller (same structure as vehicle: seller_vehicle_id = unique seller-in-vehicle)
  const lotsBySeller = useMemo(() => {
    const map = new Map<string, LotInfo[]>();
    filteredLots.forEach(l => {
      const key = l.seller_vehicle_id || `sv-${l.seller_name}-${l.vehicle_number}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return map;
  }, [filteredLots]);

  // Row 1: Contacts from contact module — filter by scribble pad search (name/mark/phone)
  const filteredContacts = useMemo(() => {
    const q = (scribbleMark || '').trim().toLowerCase();
    const list = buyers;
    if (!q) return list;
    return list.filter(b =>
      b.name?.toLowerCase().includes(q) ||
      (b.phone && b.phone.includes(q)) ||
      (b.mark && b.mark.toLowerCase().includes(q))
    );
  }, [buyers, scribbleMark]);

  // Row 2: Temporary (scribble) marks for today — server-scoped; filter by search box
  const filteredTemporaryMarks = useMemo(() => {
    const q = (scribbleMark || '').trim().toLowerCase();
    const list = temporaryBuyerMarks;
    if (!q) return list;
    return list.filter(m => m.toLowerCase().includes(q));
  }, [temporaryBuyerMarks, scribbleMark]);

  const clampInsideClosingParen = useCallback((value: string, proposedPos: number, allowManualExit = false) => {
    if (!braceLockActiveRef.current) return proposedPos;
    const closeIdx = value.indexOf(')');
    if (closeIdx === -1) {
      braceLockActiveRef.current = false;
      return proposedPos;
    }
    const openIdx = value.lastIndexOf('(', closeIdx);
    if (openIdx === -1) {
      braceLockActiveRef.current = false;
      return proposedPos;
    }
    if (allowManualExit && proposedPos > closeIdx) {
      braceLockActiveRef.current = false;
      return proposedPos;
    }
    return Math.min(proposedPos, closeIdx);
  }, []);

  const handleScribbleSegmentDetected = useCallback((segment: string, meta?: MarkDetectionMeta) => {
    if (editingBidId) return;
    const up = segment.toUpperCase().slice(0, MAX_MARK_LEN);
    setScribbleMark((prev) => {
      const insertAtRaw = markInsertPosRef.current;
      const basePos = insertAtRaw == null ? prev.length : Math.max(0, Math.min(insertAtRaw, prev.length));
      const insertAt = clampInsideClosingParen(prev, basePos);
      if (meta?.replaceLastSegment && lastScribbleSegmentRef.current) {
        const cutLen = lastScribbleSegmentRef.current.length;
        const replaceStart = Math.max(0, insertAt - cutLen);
        const next = `${prev.slice(0, replaceStart)}${up}${prev.slice(insertAt)}`.slice(0, MAX_MARK_LEN);
        markInsertPosRef.current = clampInsideClosingParen(next, Math.min(replaceStart + up.length, next.length));
        lastScribbleSegmentRef.current = up;
        return next;
      }
      const next = `${prev.slice(0, insertAt)}${up}${prev.slice(insertAt)}`.slice(0, MAX_MARK_LEN);
      markInsertPosRef.current = clampInsideClosingParen(next, Math.min(insertAt + up.length, next.length));
      lastScribbleSegmentRef.current = up;
      return next;
    });
    setSelectedBuyer(null);
    // Do not bump scribblePadResetTrigger here: InlineScribblePad append mode clears ink internally;
    // incrementing would run the reset effect and wipe candidate chips before the user can tap one.
  }, [editingBidId, clampInsideClosingParen]);

  const appendMarkParenFromNumpad = useCallback(() => {
    if (editingBidId) return;
    lastScribbleSegmentRef.current = '';
    setScribbleMark((prev) => {
      const el = markInputRef.current;
      const hasSelection = !!el && document.activeElement === el;
      const start = hasSelection ? (el.selectionStart ?? prev.length) : prev.length;
      const end = hasSelection ? (el.selectionEnd ?? prev.length) : prev.length;
      const next = `${prev.slice(0, start)}()${prev.slice(end)}`.slice(0, MAX_MARK_LEN);
      braceLockActiveRef.current = true;
      pendingMarkCaretPosRef.current = Math.min(start + 1, next.length);
      markInsertPosRef.current = pendingMarkCaretPosRef.current;
      forceMarkFocusRef.current = true;
      return next;
    });
    setSelectedBuyer(null);
    hapticSelection();
  }, [editingBidId]);

  useLayoutEffect(() => {
    const caretPos = pendingMarkCaretPosRef.current;
    if (caretPos == null) return;
    const markEl = markInputRef.current;
    if (!markEl) return;
    const shouldForceFocus = forceMarkFocusRef.current || braceLockActiveRef.current;
    if (shouldForceFocus) markEl.focus();
    if (document.activeElement !== markEl && !shouldForceFocus) return;
    markEl.setSelectionRange(caretPos, caretPos);
    markInsertPosRef.current = caretPos;
    pendingMarkCaretPosRef.current = null;
    forceMarkFocusRef.current = false;
  }, [scribbleMark]);

  const handleMarkBackspace = useCallback(() => {
    if (editingBidId) return;
    lastScribbleSegmentRef.current = '';
    setScribbleMark((prev) => prev.slice(0, -1));
    hapticSelection();
  }, [editingBidId]);

  const totalSold = useMemo(() => entries.reduce((s, e) => s + e.quantity, 0), [entries]);
  const remaining = selectedLot ? selectedLot.bag_count - totalSold : 0;
  const highestBid = useMemo(() => Math.max(0, ...entries.map(e => e.rate)), [entries]);
  const isSelfSaleReauction = selectedLotSource === 'self_sale';
  const previousSelfSaleEntries = selfSaleContext?.previous_entries ?? [];
  const previousBidRate = useMemo(() => {
    if (entries.length === 0) return 0;
    return Math.trunc(entries[entries.length - 1]?.rate ?? 0);
  }, [entries]);
  const getBidRateFromInput = useCallback((rawRate: string) => {
    const parsed = parseInt(rawRate, 10);
    if (!Number.isFinite(parsed)) return 0;
    return showPresetMargin ? parsed - preset : parsed;
  }, [showPresetMargin, preset]);

  const editingEntry = useMemo(() => {
    if (!editingBidId) return null;
    return entries.find(e => e.id === editingBidId) ?? null;
  }, [editingBidId, entries]);

  const applyAuctionSession = useCallback((session: AuctionSessionDTO) => {
    setEntries(session.entries.map(sessionEntryToSaleEntry));
    setSelfSaleContext(session.self_sale_context ?? null);
    const lotId = selectedLot?.lot_id;
    const selfSaleUnitId = selectedLot?.selfSaleUnitId;
    if (session.lot && lotId) {
      setSelectedLot(prev =>
        prev && prev.lot_id === lotId
          ? {
            ...prev,
            bag_count: session.lot!.bag_count ?? prev.bag_count,
            original_bag_count: session.lot!.original_bag_count ?? prev.original_bag_count,
            was_modified: session.lot!.was_modified ?? prev.was_modified,
          }
          : prev
      );
      setAvailableLots(prev =>
        prev.map(l =>
          l.lot_id === lotId && session.lot
            ? {
              ...l,
              bag_count: session.lot!.bag_count ?? l.bag_count,
              original_bag_count: session.lot!.original_bag_count ?? l.original_bag_count,
              was_modified: session.lot!.was_modified ?? l.was_modified,
            }
            : l
        )
      );
      setSelfSaleLots(prev =>
        prev.map(l =>
          l.selfSaleUnitId === selfSaleUnitId && session.lot
            ? {
              ...l,
              bag_count: session.lot!.bag_count ?? l.bag_count,
              original_bag_count: session.lot!.original_bag_count ?? l.original_bag_count,
              was_modified: session.lot!.was_modified ?? l.was_modified,
              remainingQty: session.lot!.bag_count ?? l.remainingQty,
            }
            : l
        )
      );
    }
  }, [selectedLot?.lot_id, selectedLot?.selfSaleUnitId]);

  const refetchAuctionSession = useCallback(async () => {
    if (!selectedLot) return;
    try {
      const session = selectedLotSource === 'self_sale'
        ? await auctionApi.getOrStartSelfSaleSession(selectedLot.selfSaleUnitId ?? selectedLot.lot_id)
        : await auctionApi.getOrStartSession(selectedLot.lot_id);
      applyAuctionSession(session);
    } catch {
      toast.error('Failed to refresh session');
    }
  }, [selectedLot, selectedLotSource, applyAuctionSession]);

  const addBidForCurrentSelection = useCallback(async (body: AuctionBidCreateRequest) => {
    if (!selectedLot) throw new Error('No lot selected');
    return selectedLotSource === 'self_sale'
      ? auctionApi.addSelfSaleBid(selectedLot.selfSaleUnitId ?? selectedLot.lot_id, body)
      : auctionApi.addBid(selectedLot.lot_id, body);
  }, [selectedLot, selectedLotSource]);

  const updateBidForCurrentSelection = useCallback(async (bidId: number, body: AuctionBidUpdateRequest) => {
    if (!selectedLot) throw new Error('No lot selected');
    return selectedLotSource === 'self_sale'
      ? auctionApi.updateSelfSaleBid(selectedLot.selfSaleUnitId ?? selectedLot.lot_id, bidId, body)
      : auctionApi.updateBid(selectedLot.lot_id, bidId, body);
  }, [selectedLot, selectedLotSource]);

  const deleteBidForCurrentSelection = useCallback(async (bidId: number) => {
    if (!selectedLot) throw new Error('No lot selected');
    return selectedLotSource === 'self_sale'
      ? auctionApi.deleteSelfSaleBid(selectedLot.selfSaleUnitId ?? selectedLot.lot_id, bidId)
      : auctionApi.deleteBid(selectedLot.lot_id, bidId);
  }, [selectedLot, selectedLotSource]);

  const completeAuctionForCurrentSelection = useCallback(async () => {
    if (!selectedLot) throw new Error('No lot selected');
    return selectedLotSource === 'self_sale'
      ? auctionApi.completeSelfSaleAuction(selectedLot.selfSaleUnitId ?? selectedLot.lot_id)
      : auctionApi.completeAuction(selectedLot.lot_id);
  }, [selectedLot, selectedLotSource]);

  // ── Lot navigation (prev/next) ─────────────────────────
  const navigationLots = useMemo(
    () => (selectedLotSource === 'self_sale' || statusFilter === 'self_sale' ? selfSaleLots : availableLots),
    [selectedLotSource, statusFilter, selfSaleLots, availableLots]
  );

  const currentLotIndex = useMemo(() => {
    if (!selectedLot) return -1;
    return navigationLots.findIndex(l =>
      selectedLotSource === 'self_sale'
        ? l.selfSaleUnitId === selectedLot.selfSaleUnitId
        : l.lot_id === selectedLot.lot_id
    );
  }, [selectedLot, selectedLotSource, navigationLots]);

  const navigateToLot = (direction: 'prev' | 'next') => {
    if (currentLotIndex === -1) return;
    const newIndex = direction === 'prev' ? currentLotIndex - 1 : currentLotIndex + 1;
    if (newIndex < 0 || newIndex >= navigationLots.length) return;
    selectLot(navigationLots[newIndex], selectedLotSource);
  };

  const canGoPrev = currentLotIndex > 0;
  const canGoNext = currentLotIndex >= 0 && currentLotIndex < navigationLots.length - 1;

  // Status counts for lot selector
  const statusCounts = useMemo(() => {
    const counts = { available: 0, sold: 0, partial: 0, pending: 0, self_sale: 0 };
    availableLots.forEach(l => {
      const s = getLotStatus(l.lot_id, l.bag_count, l.status);
      counts[s]++;
    });
    counts.self_sale = selfSaleLots.length;
    return counts;
  }, [availableLots, selfSaleLots]);

  /** Seller final = base bid rate + signed preset margin (matches server AuctionService). */
  const calcSellerRate = useCallback((bidRate: number, presetVal: number) => {
    if (presetVal === 0) return bidRate;
    return bidRate + presetVal;
  }, []);

  // REQ-AUC-009: Allow quantity increase with confirmation
  const tryAddEntry = (entry: Omit<SaleEntry, 'id' | 'bidNumber'>) => {
    if (!can('Auctions / Sales', 'Create')) {
      toast.error('You do not have permission to add auction bids.');
      return;
    }
    if (!selectedLot) return;
    const currentSold = entries.reduce((s, e) => s + e.quantity, 0);
    const newTotal = currentSold + entry.quantity;

    if (newTotal > selectedLot.bag_count) {
      setQtyIncreaseDialog({
        currentTotal: currentSold,
        lotTotal: selectedLot.bag_count,
        attemptedQty: entry.quantity,
        pendingEntry: entry,
      });
      return;
    }

    commitEntry(entry);
  };

  const commitEntry = (entry: Omit<SaleEntry, 'id' | 'bidNumber'>) => {
    const existingWithMark = entries.find(e => e.buyerMark === entry.buyerMark && !e.isSelfSale);
    if (existingWithMark && !entry.isSelfSale) {
      setDuplicateMarkDialog({
        mark: entry.buyerMark,
        buyerName: entry.buyerName,
        buyerContactId: entry.buyerContactId,
        rate: entry.rate,
        qty: entry.quantity,
        isScribble: entry.isScribble,
        existingEntry: existingWithMark,
      });
      return;
    }

    finalizeEntry(entry);
  };

  const finalizeEntry = useCallback(async (entry: Omit<SaleEntry, 'id' | 'bidNumber'>, allowLotIncrease?: boolean) => {
    if (!selectedLot) return;
    const allow = allowLotIncrease ?? addBidRetryAllowIncrease;
    const body: AuctionBidCreateRequest = {
      buyer_name: entry.buyerName,
      buyer_mark: entry.buyerMark,
      buyer_id: entry.buyerContactId ? parseInt(entry.buyerContactId, 10) : undefined,
      rate: entry.rate,
      quantity: entry.quantity,
      is_scribble: entry.isScribble,
      is_self_sale: entry.isSelfSale,
      extra_rate: entry.extraRate ?? 0,
      preset_applied: entry.presetApplied ?? 0,
      preset_type: entry.presetType ?? 'PROFIT',
      token_advance: entry.tokenAdvance ?? 0,
      allow_lot_increase: allow,
    };
    try {
      const session = await addBidForCurrentSelection(body);
      applyAuctionSession(session);
      void loadTemporaryBuyerMarks();
      hapticNotification(NotificationType.Success);
      setRate('');
      setQty('');
      setSelectedBuyer(null);
      lastScribbleSegmentRef.current = '';
      setScribbleMark('');
      setAddBidRetryAllowIncrease(false);
    } catch (err: unknown) {
      const isConflict = err && typeof err === 'object' && (err as { isConflict?: boolean }).isConflict === true;
      if (isConflict) {
        setAddBidRetryAllowIncrease(true);
        toast.error('Quantity exceeds lot. Tap "Add" again to allow lot increase and retry.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to add bid');
      }
    }
  }, [selectedLot, addBidRetryAllowIncrease, loadTemporaryBuyerMarks, addBidForCurrentSelection, applyAuctionSession]);

  const confirmQtyIncrease = async () => {
    if (!qtyIncreaseDialog || !selectedLot) return;
    await finalizeEntry(qtyIncreaseDialog.pendingEntry, true);
    setQtyIncreaseDialog(null);
    toast.success('Bid added with lot increase allowed.');
  };

  const handleDuplicateMerge = async () => {
    if (!duplicateMarkDialog || !selectedLot) return;
    const { existingEntry, rate: newRate, qty: newQty } = duplicateMarkDialog;
    const mergeEffectivePreset = showPresetMargin ? preset : 0;
    if (existingEntry.rate === newRate) {
      try {
        await deleteBidForCurrentSelection(Number(existingEntry.id));
        const mergedQty = existingEntry.quantity + newQty;
        const session = await addBidForCurrentSelection({
          buyer_name: duplicateMarkDialog.buyerName,
          buyer_mark: duplicateMarkDialog.mark,
          buyer_id: duplicateMarkDialog.buyerContactId ? parseInt(duplicateMarkDialog.buyerContactId, 10) : undefined,
          rate: newRate,
          quantity: mergedQty,
          is_scribble: duplicateMarkDialog.isScribble,
          is_self_sale: false,
          extra_rate: 0,
          preset_applied: mergeEffectivePreset,
          preset_type: presetType,
          token_advance: existingEntry.tokenAdvance ?? 0,
        });
        applyAuctionSession(session);
        void loadTemporaryBuyerMarks();
        toast.success(`Merged ${newQty} bags into existing bid #${existingEntry.bidNumber}`);
        setRate('');
        setQty('');
        lastScribbleSegmentRef.current = '';
        setScribbleMark('');
        setSelectedBuyer(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to merge bid');
      }
    } else {
      await finalizeEntry({
        buyerName: duplicateMarkDialog.buyerName,
        buyerMark: duplicateMarkDialog.mark,
        buyerContactId: duplicateMarkDialog.buyerContactId,
        rate: newRate,
        quantity: newQty,
        amount: newRate * newQty,
        isSelfSale: false,
        isScribble: duplicateMarkDialog.isScribble,
        tokenAdvance: 0,
        extraRate: 0,
        presetApplied: mergeEffectivePreset,
        presetType,
        sellerRate: calcSellerRate(newRate, mergeEffectivePreset),
        buyerRate: newRate,
      });
      toast.info(`Kept as separate bid (different rate)`);
    }
    setDuplicateMarkDialog(null);
  };

  const handleDuplicateNewMark = () => {
    setDuplicateMarkDialog(null);
    toast.info('Enter a different mark for this buyer');
  };

  const handleFormSubmit = () => {
    if (!selectedBuyer || !rate || !qty) return;
    const entryRate = getBidRateFromInput(rate);
    const entryQty = parseInt(qty);
    if (entryRate <= 0 || entryQty <= 0) return;
    const effectivePreset = showPresetMargin ? preset : 0;
    tryAddEntry({
      buyerName: selectedBuyer.name,
      buyerMark: selectedBuyer.mark || selectedBuyer.name.charAt(0),
      buyerContactId: selectedBuyer.contact_id,
      rate: entryRate,
      quantity: entryQty,
      amount: entryRate * entryQty,
      isSelfSale: false,
      isScribble: false,
      tokenAdvance: 0,
      extraRate: 0,
      presetApplied: effectivePreset,
      presetType,
      sellerRate: calcSellerRate(entryRate, effectivePreset),
      buyerRate: entryRate,
    });
  };

  const handleScribbleConfirm = (initials: string, quantity: number) => {
    if (editingBidId) return;
    const currentRate = getBidRateFromInput(rate) || highestBid || 0;
    if (currentRate <= 0) return;
    const effectivePreset = showPresetMargin ? preset : 0;
    tryAddEntry({
      buyerName: `[${initials}]`,
      buyerMark: initials,
      buyerContactId: null,
      rate: currentRate,
      quantity,
      amount: currentRate * quantity,
      isSelfSale: false,
      isScribble: true,
      tokenAdvance: 0,
      extraRate: 0,
      presetApplied: effectivePreset,
      presetType,
      sellerRate: calcSellerRate(currentRate, effectivePreset),
      buyerRate: currentRate,
    });
    setShowScribble(false);
    lastScribbleSegmentRef.current = '';
    setScribbleMark('');
  };

  const handleScribbleInlineAdd = () => {
    if (!scribbleMark || !rate || !qty) return;
    const entryRate = getBidRateFromInput(rate);
    const entryQty = parseInt(qty);
    if (entryRate <= 0 || entryQty <= 0) return;
    const effectivePreset = showPresetMargin ? preset : 0;
    tryAddEntry({
      buyerName: `[${scribbleMark}]`,
      buyerMark: scribbleMark,
      buyerContactId: null,
      rate: entryRate,
      quantity: entryQty,
      amount: entryRate * entryQty,
      isSelfSale: false,
      isScribble: true,
      tokenAdvance: 0,
      extraRate: 0,
      presetApplied: effectivePreset,
      presetType,
      sellerRate: calcSellerRate(entryRate, effectivePreset),
      buyerRate: entryRate,
    });
    lastScribbleSegmentRef.current = '';
    setScribbleMark('');
    setRate('');
    setQty('');
  };

  // Unified Add Bid: use selected contact (name + mark) or scribble mark only — fast path for live auction
  const handleUnifiedAdd = () => {
    const entryRate = getBidRateFromInput(rate);
    const entryQty = parseInt(qty);
    if (!rate || !qty || entryRate <= 0 || entryQty <= 0) return;
    const effectivePreset = showPresetMargin ? preset : 0;

    hapticImpact();

    if (selectedBuyer) {
      tryAddEntry({
        buyerName: selectedBuyer.name,
        buyerMark: selectedBuyer.mark || selectedBuyer.name.charAt(0),
        buyerContactId: selectedBuyer.contact_id,
        rate: entryRate,
        quantity: entryQty,
        amount: entryRate * entryQty,
        isSelfSale: false,
        isScribble: false,
        tokenAdvance: 0,
        extraRate: 0,
        presetApplied: effectivePreset,
        presetType,
        sellerRate: calcSellerRate(entryRate, effectivePreset),
        buyerRate: entryRate,
      });
      setSelectedBuyer(null);
    } else if (scribbleMark.trim()) {
      tryAddEntry({
        buyerName: `[${scribbleMark}]`,
        buyerMark: scribbleMark,
        buyerContactId: null,
        rate: entryRate,
        quantity: entryQty,
        amount: entryRate * entryQty,
        isSelfSale: false,
        isScribble: true,
        tokenAdvance: 0,
        extraRate: 0,
        presetApplied: effectivePreset,
        presetType,
        sellerRate: calcSellerRate(entryRate, effectivePreset),
        buyerRate: entryRate,
      });
    } else return;

    lastScribbleSegmentRef.current = '';
    setScribbleMark('');
    setRate('');
    setQty('');
  };

  const updateActiveNumpadField = (next: string) => {
    if (activeNumpadField === 'rate') {
      setRate(next);
      if (editingBidId) setEditBidDraft((d) => (d ? { ...d, rate: next } : d));
    } else if (activeNumpadField === 'qty') {
      setQty(next);
      if (editingBidId) setEditBidDraft((d) => (d ? { ...d, qty: next } : d));
    } else if (activeNumpadField === 'mark') {
      lastScribbleSegmentRef.current = '';
      const v = next.toUpperCase().slice(0, MAX_MARK_LEN);
      setScribbleMark(v);
      markInsertPosRef.current = clampInsideClosingParen(v, v.length);
      pendingMarkCaretPosRef.current = markInsertPosRef.current;
      setSelectedBuyer(null);
    }
  };

  const getCurrentNumpadValue = () => {
    if (activeNumpadField === 'rate') return rate;
    if (activeNumpadField === 'qty') return qty;
    if (activeNumpadField === 'mark') return scribbleMark;
    return '';
  };

  const handleNumpadKey = (key: string) => {
    const current = getCurrentNumpadValue();
    if (key >= '0' && key <= '9') {
      updateActiveNumpadField(`${current}${key}`.slice(0, 8));
      return;
    }
    if (key === '.') {
      if (activeNumpadField === 'mark') return;
      if (activeNumpadField === 'rate') {
        // Fast entry helper: dot key appends double-zero for rates.
        updateActiveNumpadField(`${current}00`.slice(0, 8));
      }
      return;
    }
    if (key === '+') {
      if (activeNumpadField === 'mark') return;
      const n = parseInt(String(current || '0'), 10) || 0;
      updateActiveNumpadField(String(n + 1));
      return;
    }
    if (key === '*') {
      if (activeNumpadField === 'mark') return;
      const n = parseInt(String(current || '0'), 10) || 0;
      updateActiveNumpadField(String(n * 10));
    }
  };

  const handleNumpadBackspace = () => {
    if (activeNumpadField === 'mark') {
      handleMarkBackspace();
      return;
    }
    const current = getCurrentNumpadValue();
    updateActiveNumpadField(String(current).slice(0, -1));
  };

  const handleNumpadClear = () => {
    updateActiveNumpadField('');
  };

  const handleOpenSystemKeyboard = () => {
    setMobileKeyboardEnabled(true);
    if (activeNumpadField === 'rate') rateInputRef.current?.focus();
    else if (activeNumpadField === 'qty') qtyInputRef.current?.focus();
    else if (activeNumpadField === 'mark') markInputRef.current?.focus();
  };

  const handleSelfSale = () => {
    if (remaining <= 0 || !selectedLot) return;
    hapticImpact();
    const currentRate = highestBid || getBidRateFromInput(rate) || 0;
    tryAddEntry({
      buyerName: 'Self Sale',
      buyerMark: 'SS',
      buyerContactId: null,
      rate: currentRate,
      quantity: remaining,
      amount: currentRate * remaining,
      isSelfSale: true,
      isScribble: false,
      tokenAdvance: 0,
      extraRate: 0,
      presetApplied: 0,
      presetType,
      sellerRate: currentRate,
      buyerRate: currentRate,
    });
  };

  const handleSaveAndCompleteAuction = async () => {
    if (!selectedLot) return;
    setCompleteLoading(true);
    if (!can('Auctions / Sales', 'Approve')) {
      toast.error('You do not have permission to complete auctions.');
      setCompleteLoading(false);
      return;
    }
    try {
      const completed = await completeAuctionForCurrentSelection();
      setCompletedAuction(completed);
      setShowPrint(true);
      clearDraft();
      setShowLotSelector(true);
      setSelectedLot(null);
      setSelectedLotSource('regular');
      setSelfSaleContext(null);
      setEntries([]);
      void loadTemporaryBuyerMarks();
      loadLots();
      loadSelfSaleLots();
      toast.success(remaining > 0 ? 'Auction saved (partial). Navigate to Logistics or Weighing.' : 'Auction saved! Navigate to Logistics or Weighing.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete auction');
    } finally {
      setCompleteLoading(false);
    }
  };

  useEffect(() => {
    if (!showPrint || !completedAuction) return;
    const printKey = String(completedAuction.auction_id);
    if (autoPrintedAuctionRef.current === printKey) return;
    autoPrintedAuctionRef.current = printKey;
    void (async () => {
      const ok = await directPrint(generateAuctionCompletionPrintHTML({
        auctionId: completedAuction.auction_id,
        lotId: completedAuction.lotId,
        lotName: completedAuction.lotName,
        sellerName: completedAuction.sellerName,
        vehicleNumber: completedAuction.vehicleNumber,
        commodityName: completedAuction.commodityName,
        completedAt: completedAuction.completedAt,
        entries: completedAuction.entries,
      }), { mode: "system" });
      ok ? toast.success('Auction completion print opened') : toast.error('Printer not connected.');
    })();
  }, [showPrint, completedAuction]);

  const removeEntry = useCallback(async (id: string) => {
    if (!selectedLot) return;
    if (editingBidId) {
      toast.info('Finish or cancel bid edit first.');
      return;
    }
    if (!can('Auctions / Sales', 'Delete')) {
      toast.error('You do not have permission to delete auction bids.');
      return;
    }
    try {
      const session = await deleteBidForCurrentSelection(Number(id));
      applyAuctionSession(session);
      void loadTemporaryBuyerMarks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove bid');
    }
  }, [selectedLot, loadTemporaryBuyerMarks, editingBidId, can, getBidRateFromInput]);

  const setTokenAdvanceAmount = useCallback(async (id: string, amount: number) => {
    if (!selectedLot) return;
    if (editingBidId === id) {
      toast.info('Save or cancel the bid edit first.');
      return;
    }
    if (!can('Auctions / Sales', 'Edit')) {
      toast.error('You do not have permission to edit auction bids.');
      return;
    }
    try {
      const session = await updateBidForCurrentSelection(Number(id), { token_advance: amount });
      applyAuctionSession(session);
      setShowTokenInput(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update token advance');
    }
  }, [selectedLot, editingBidId, can, applyAuctionSession, updateBidForCurrentSelection]);

  const cancelEditBid = useCallback(() => {
    const snap = editBidFormSnapshotRef.current;

    setEditingBidId(null);
    setEditBidDraft(null);
    setEditBidRetryAllowIncrease(false);
    setEditBidQtyDialog(null);
    setShowTokenInput(null);

    editBidFormSnapshotRef.current = null;

    if (snap) {
      setSelectedBuyer(snap.selectedBuyer);
      setScribbleMark(snap.scribbleMark);
      setRate(snap.rate);
      setQty(snap.qty);
      setShowPresetMargin(snap.showPresetMargin);
      setPreset(snap.preset);
      setPresetType(snap.presetType);
      setActiveNumpadField(snap.activeNumpadField);
      setMobileKeyboardEnabled(snap.mobileKeyboardEnabled);
      lastScribbleSegmentRef.current = snap.lastScribbleSegment;
    }
  }, []);

  const startEditBid = useCallback((entry: SaleEntry) => {
    if (!can('Auctions / Sales', 'Edit')) {
      toast.error('You do not have permission to edit auction bids.');
      return;
    }

    // Snapshot current Sales Pad state so Cancel restores it.
    editBidFormSnapshotRef.current = {
      selectedBuyer,
      scribbleMark,
      rate,
      qty,
      showPresetMargin,
      preset,
      presetType,
      activeNumpadField,
      mobileKeyboardEnabled,
      lastScribbleSegment: lastScribbleSegmentRef.current,
    };

    setShowTokenInput(null);
    setEditBidQtyDialog(null);
    setEditingBidId(entry.id);
    setEditBidRetryAllowIncrease(false);
    setEditBidDraft({
      rate: String(Math.trunc(entry.rate)),
      qty: String(entry.quantity),
      preset: entry.presetApplied,
      presetType: entry.presetType,
      extraRate: String(entry.extraRate ?? 0),
      token: String(Math.trunc(entry.tokenAdvance ?? 0)),
      lastModifiedMs: entry.lastModifiedMs ?? null,
    });

    // Prefill Sales Pad controls from the bid being edited.
    setRate(String(Math.trunc(entry.rate)));
    setQty(String(entry.quantity));
    setPreset(entry.presetApplied);
    setPresetType(entry.presetType);
    setShowPresetMargin(entry.presetApplied !== 0);

    // Buyer display: match contact id when possible; otherwise use scribble mark.
    const matchedBuyer = entry.buyerContactId
      ? buyers.find(b => String(b.contact_id) === entry.buyerContactId) ?? null
      : null;
    if (matchedBuyer) {
      setSelectedBuyer(matchedBuyer);
      setScribbleMark(entry.buyerMark ?? '');
    } else {
      setSelectedBuyer(null);
      setScribbleMark(entry.buyerMark ?? '');
    }
  }, [
    can,
    selectedBuyer,
    scribbleMark,
    rate,
    qty,
    showPresetMargin,
    preset,
    presetType,
    activeNumpadField,
    mobileKeyboardEnabled,
    buyers,
  ]);

  const saveEditBid = useCallback(async (entry: SaleEntry) => {
    if (!selectedLot || !editBidDraft) return;
    if (!can('Auctions / Sales', 'Edit')) {
      toast.error('You do not have permission to edit auction bids.');
      return;
    }
    const rateN = parseInt(editBidDraft.rate, 10);
    const qtyN = parseInt(editBidDraft.qty, 10);
    if (!Number.isFinite(rateN) || rateN < 1 || !Number.isFinite(qtyN) || qtyN < 1) {
      toast.error('Enter valid rate and quantity (at least 1).');
      return;
    }
    const extra = Number(editBidDraft.extraRate);
    const token = Number(editBidDraft.token);
    if (!Number.isFinite(extra) || !Number.isFinite(token)) {
      toast.error('Enter valid numeric values.');
      return;
    }
    const others = entries.filter(e => e.id !== entry.id).reduce((s, e) => s + e.quantity, 0);
    const newTotalSold = others + qtyN;
    const lotCap = selectedLot.bag_count;
    const body: AuctionBidUpdateRequest = {
      rate: rateN,
      quantity: qtyN,
      extra_rate: extra,
      preset_applied: editBidDraft.preset,
      preset_type: editBidDraft.preset < 0 ? 'LOSS' : 'PROFIT',
      token_advance: token,
      expected_last_modified_ms: editBidDraft.lastModifiedMs ?? undefined,
      allow_lot_increase: editBidRetryAllowIncrease,
    };
    if (newTotalSold > lotCap && !editBidRetryAllowIncrease) {
      setEditBidQtyDialog({
        currentTotal: others,
        lotTotal: lotCap,
        attemptedQty: qtyN,
        pendingBody: body,
        bidNumericId: Number(entry.id),
      });
      return;
    }
    try {
      const session = await updateBidForCurrentSelection(Number(entry.id), body);
      applyAuctionSession(session);
      // After successful update, clear entry inputs so next action starts fresh.
      setSelectedBuyer(null);
      lastScribbleSegmentRef.current = '';
      setScribbleMark('');
      setRate('');
      setQty('');
      setEditingBidId(null);
      setEditBidDraft(null);
      setEditBidRetryAllowIncrease(false);
      editBidFormSnapshotRef.current = null;
      void loadTemporaryBuyerMarks();
      hapticNotification(NotificationType.Success);
    } catch (err: unknown) {
      const e = err as { isStaleBid?: boolean; isConflict?: boolean };
      if (e.isStaleBid) {
        toast.error(err instanceof Error ? err.message : 'Bid was updated elsewhere');
        await refetchAuctionSession();
        cancelEditBid();
        return;
      }
      if (e.isConflict) {
        setEditBidRetryAllowIncrease(true);
        toast.error('Quantity exceeds lot. Tap Save again to allow lot increase.');
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update bid');
    }
  }, [
    selectedLot,
    editBidDraft,
    entries,
    editBidRetryAllowIncrease,
    can,
    loadTemporaryBuyerMarks,
    applyAuctionSession,
    refetchAuctionSession,
    cancelEditBid,
  ]);

  const confirmEditBidQtyIncrease = useCallback(async () => {
    if (!editBidQtyDialog || !selectedLot) return;
    const { pendingBody, bidNumericId } = editBidQtyDialog;
    setEditBidQtyDialog(null);
    try {
      const session = await updateBidForCurrentSelection(bidNumericId, { ...pendingBody, allow_lot_increase: true });
      applyAuctionSession(session);
      // Keep behavior same as normal update: clear entry inputs afterwards.
      setSelectedBuyer(null);
      lastScribbleSegmentRef.current = '';
      setScribbleMark('');
      setRate('');
      setQty('');
      setEditingBidId(null);
      setEditBidDraft(null);
      setEditBidRetryAllowIncrease(false);
      editBidFormSnapshotRef.current = null;
      void loadTemporaryBuyerMarks();
      toast.success('Bid updated with lot increase allowed.');
      hapticNotification(NotificationType.Success);
    } catch (err: unknown) {
      const e = err as { isStaleBid?: boolean; isConflict?: boolean };
      if (e.isStaleBid) {
        toast.error(err instanceof Error ? err.message : 'Bid was updated elsewhere');
        await refetchAuctionSession();
        cancelEditBid();
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update bid');
    }
  }, [editBidQtyDialog, selectedLot, applyAuctionSession, loadTemporaryBuyerMarks, refetchAuctionSession, cancelEditBid]);

  const applyPreset = (value: number) => {
    const next = preset === value ? 0 : value;
    const currentInput = parseInt(rate, 10);
    if (!editingBidId && showPresetMargin && Number.isFinite(currentInput) && currentInput > 0) {
      const baseRate = currentInput - preset;
      const nextDisplay = baseRate + next;
      setRate(String(Math.max(0, nextDisplay)));
    }
    setPreset(next);
    if (next !== 0) setPresetType(value >= 0 ? 'PROFIT' : 'LOSS');

    // Sync edit draft so "Update Bid" uses latest preset changes.
    if (editingBidId) {
      setEditBidDraft((d) => (d ? { ...d, preset: next, presetType: next < 0 ? 'LOSS' : 'PROFIT' } : d));
    }
  };

  useEffect(() => {
    if (editingBidId) return;
    if (rate.trim() !== '') return;
    if (previousBidRate <= 0) return;
    const displayRate = showPresetMargin ? previousBidRate + preset : previousBidRate;
    setRate(String(displayRate));
  }, [editingBidId, previousBidRate, rate, showPresetMargin, preset]);

  const handleShowPresetMarginChange = useCallback((checked: boolean) => {
    if (!editingBidId) {
      const currentInput = parseInt(rate, 10);
      if (Number.isFinite(currentInput) && currentInput > 0) {
        const nextInput = checked ? currentInput + preset : currentInput - preset;
        setRate(String(Math.max(0, nextInput)));
      }
    }
    setShowPresetMargin(checked);
    if (!editingBidId) return;
    setEditBidDraft((d) => {
      if (!d) return d;
      const nextPreset = checked ? preset : 0;
      return { ...d, preset: nextPreset, presetType: nextPreset < 0 ? 'LOSS' : 'PROFIT' };
    });
  }, [editingBidId, preset, rate]);

  const selectLot = useCallback((lot: LotInfo, source: LotSource = statusFilter === 'self_sale' ? 'self_sale' : 'regular') => {
    setSelectedLotSource(source);
    setSelectedLot(lot);
    setSelfSaleContext(null);
    setShowLotSelector(false);
    setShowLotList(false);
    setEntries([]);
    setEditingBidId(null);
    setEditBidDraft(null);
    editBidFormSnapshotRef.current = null;
    setEditBidRetryAllowIncrease(false);
    setEditBidQtyDialog(null);
    setRate('');
    setQty('');
    setLotNumberSearch('');
    setSessionLoading(true);
    const loadSession = source === 'self_sale'
      ? auctionApi.getOrStartSelfSaleSession(lot.selfSaleUnitId ?? lot.lot_id)
      : auctionApi.getOrStartSession(lot.lot_id);
    loadSession
      .then((session: AuctionSessionDTO) => {
        const info = lotSummaryToLotInfo(session.lot);
        // Keep seller/vehicle/commodity from list lot if session.lot has empty (backend may omit in some paths)
        setSelectedLot({
          ...info,
          selfSaleUnitId: source === 'self_sale' ? lot.selfSaleUnitId ?? null : null,
          status: source === 'self_sale' ? 'self_sale' : info.status,
          seller_name: info.seller_name || lot.seller_name || '',
          seller_mark: info.seller_mark || lot.seller_mark || '',
          vehicle_number: info.vehicle_number || lot.vehicle_number || '',
          commodity_name: info.commodity_name || lot.commodity_name || '',
        });
        setEntries(session.entries.map(sessionEntryToSaleEntry));
        setSelfSaleContext(session.self_sale_context ?? null);
        void loadTemporaryBuyerMarks();
      })
      .catch(() => toast.error('Failed to load session'))
      .finally(() => setSessionLoading(false));
  }, [loadTemporaryBuyerMarks, statusFilter]);

  const goBackToSelector = () => {
    // Don't clear entries — they're auto-saved
    setShowLotSelector(true);
    // Refetch lots so status (Available / Pending / Partial / Sold) is up to date
    loadLots();
    loadSelfSaleLots();
  };

  // ═══ AUCTION PRINT PREVIEW ═══
  if (showPrint && completedAuction) {
    const totalQty = completedAuction.entries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
    const totalAmount = completedAuction.entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const completedAt = completedAuction.completedAt ? new Date(completedAuction.completedAt) : new Date();
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        {!isDesktop ? (
          <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-[2rem]">
            <div className="relative z-10 flex items-center gap-3">
              <button onClick={() => setShowPrint(false)}
                aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <Printer className="w-5 h-5" /> Auction Print
                </h1>
                <p className="text-white/70 text-xs">Auction #{completedAuction.auction_id}</p>
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
                <Printer className="w-5 h-5 text-blue-500" /> Auction Print
              </h2>
              <p className="text-sm text-muted-foreground">Auction #{completedAuction.auction_id}</p>
            </div>
          </div>
        )}

        <div className="px-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-4 font-mono text-xs space-y-2 shadow-lg">
            <div className="text-center border-b border-dashed border-border pb-2">
              <p className="font-bold text-sm text-foreground">MERCOTRACE</p>
              <p className="text-muted-foreground">Auction Completion</p>
              <p className="text-muted-foreground">{completedAt.toLocaleDateString()} {completedAt.toLocaleTimeString()}</p>
            </div>

            <div className="border-b border-dashed border-border pb-2 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Auction ID</span><span className="font-bold text-foreground">{completedAuction.auction_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lot</span><span className="font-bold text-foreground">{completedAuction.lotName || completedAuction.lotId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span className="font-bold text-foreground">{completedAuction.sellerName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span className="font-bold text-foreground">{completedAuction.vehicleNumber || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span className="font-bold text-foreground">{completedAuction.commodityName || '—'}</span></div>
            </div>

            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">BIDS ({completedAuction.entries.length})</p>
              {completedAuction.entries.map((entry, idx) => (
                <div key={`${entry.bidNumber}-${idx}`} className="flex justify-between text-[10px]">
                  <span className="text-foreground">#{entry.bidNumber} {entry.buyerMark} · {entry.quantity} @ ₹{entry.rate}</span>
                  <span className="font-bold text-foreground">₹{entry.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between"><span className="text-muted-foreground">Total Qty</span><span className="font-bold text-foreground">{totalQty} bags</span></div>
            <div className="flex justify-between text-sm border-t border-dashed border-border pt-2">
              <span className="font-bold text-foreground">TOTAL SALE</span>
              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">₹{totalAmount.toLocaleString()}</span>
            </div>
            <div className="text-center border-t border-dashed border-border pt-2">
              <p className="text-muted-foreground">--- END OF AUCTION ---</p>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              onClick={async () => {
                const ok = await directPrint(generateAuctionCompletionPrintHTML({
                  auctionId: completedAuction.auction_id,
                  lotId: completedAuction.lotId,
                  lotName: completedAuction.lotName,
                  sellerName: completedAuction.sellerName,
                  vehicleNumber: completedAuction.vehicleNumber,
                  commodityName: completedAuction.commodityName,
                  completedAt: completedAuction.completedAt,
                  entries: completedAuction.entries,
                }), { mode: "system" });
                ok ? toast.success('Auction details sent to printer!') : toast.error('Printer not connected.');
              }}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white font-bold shadow-lg"
            >
              <Printer className="w-5 h-5 mr-2" /> Print Auction
            </Button>
            <Button
              onClick={() => {
                setShowPrint(false);
                setCompletedAuction(null);
                setShowLotSelector(true);
                setSelectedLot(null);
                setEntries([]);
                loadLots();
              }}
              variant="outline"
              className="h-12 rounded-xl px-6"
            >
              Done
            </Button>
          </div>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ LOT SELECTOR SCREEN ═══
  if (showLotSelector) {
    return (
      <div className="bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 lg:pb-6">
        {/* Mobile Header */}
        {!isDesktop && (
          <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
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
                <button onClick={() => navigate('/home')} aria-label="Go back" className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <Gavel className="w-5 h-5" /> Sales Pad
                  </h1>
                  <p className="text-white/70 text-xs">Select a lot to begin auction</p>
                </div>
              </div>
              {/* General search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <input
                  placeholder="Search lot, seller, vehicle, or 320/320/110-110…"
                  value={lotSearchQuery}
                  onChange={e => setLotSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30"
                />
              </div>
              {/* Lot Number search */}
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <input
                  placeholder="Lot # or 320/320/110-110…"
                  value={lotNumberSearch}
                  onChange={e => setLotNumberSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/15 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30"
                />
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
                  <Gavel className="w-5 h-5 text-blue-500" /> Sales Pad — Lot Selection
                </h2>
                <p className="text-sm text-muted-foreground">{selectorLots.length} lots available · Select a lot to begin auction</p>
              </div>
              <div className="flex gap-3">
                <div className="relative w-56">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    placeholder="Lot # or 320/320/110-110…"
                    value={lotNumberSearch}
                    onChange={e => setLotNumberSearch(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    placeholder="Search lot, seller, vehicle, or 320/320/110-110…"
                    value={lotSearchQuery}
                    onChange={e => setLotSearchQuery(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-blue-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Lots</p>
                <p className="text-2xl font-black text-foreground">{selectorLots.length}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-emerald-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Bags</p>
                <p className="text-2xl font-black text-foreground">{selectorLots.reduce((s, l) => s + l.bag_count, 0)}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-violet-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Vehicles</p>
                <p className="text-2xl font-black text-foreground">{new Set(selectorLots.map(l => l.vehicle_number)).size}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-amber-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Sellers</p>
                <p className="text-2xl font-black text-foreground">{new Set(selectorLots.map(l => l.seller_name)).size}</p>
              </div>
            </div>
          </div>
        )}

        {/* Status Filter Bar */}
        <div className="px-4 mt-4 mb-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button onClick={() => setStatusFilter('all')}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                statusFilter === 'all'
                  ? 'bg-foreground text-background shadow-md'
                  : 'bg-muted/40 text-muted-foreground')}>
              All ({availableLots.length})
            </button>
            {(Object.entries(STATUS_CONFIG) as [LotStatus, typeof STATUS_CONFIG['available']][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                  statusFilter === key
                    ? `${cfg.bg} ${cfg.text} shadow-md ring-1 ring-current/20`
                    : 'bg-muted/40 text-muted-foreground')}>
                <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                {cfg.label} ({statusCounts[key]})
              </button>
            ))}
          </div>
        </div>

        {/* Navigation Mode */}
        <div className="px-4 mt-2 mb-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[
              { key: 'all', label: 'All Lots', icon: Package },
              { key: 'vehicle', label: 'By Vehicle', icon: Truck },
              { key: 'seller', label: 'By Seller', icon: User },
              { key: 'lot_number', label: 'By Lot #', icon: Hash },
            ].map(m => (
              <button key={m.key} onClick={() => setLotNavMode(m.key as any)}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                  lotNavMode === m.key
                    ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                    : 'bg-muted/40 text-muted-foreground')}>
                <m.icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lot List */}
        <div className="px-4 space-y-2">
          {lotsLoading ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <p className="text-sm text-muted-foreground font-medium">Loading lots…</p>
            </div>
          ) : selectorLots.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Gavel className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">{statusFilter === 'self_sale' ? 'No self-sale lots found' : 'No lots available'}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{statusFilter === 'self_sale' ? 'Self-sale lots will appear here after they are closed to the trader account.' : 'Register arrivals first to create lots'}</p>
              {statusFilter !== 'self_sale' && (
                <Button onClick={() => navigate('/arrivals')} className="mt-4 bg-gradient-to-r from-blue-500 to-violet-500 text-white rounded-xl">
                  Go to Arrivals
                </Button>
              )}
            </div>
          ) : filteredLots.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No results found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term or filter</p>
              <Button onClick={() => { setLotSearchQuery(''); setLotNumberSearch(''); setStatusFilter('all'); }} variant="outline" className="mt-4 rounded-xl">
                Clear Filters
              </Button>
            </div>
          ) : lotNavMode === 'vehicle' ? (
            Array.from(lotsByVehicle.entries())
              .sort(([a], [b]) => (a || '').localeCompare(b || ''))
              .map(([vehicle, lots]) => (
                <div key={vehicle} className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-3 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/20 dark:to-violet-950/20 border-b border-border/30 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-foreground">{vehicle}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{lots.length} lot(s)</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {lots.map(lot => (
                      <LotRow key={getLotRenderKey(lot)} lot={lot} onSelect={selectLot} statusFilter={statusFilter} />
                    ))}
                  </div>
                </div>
              ))
          ) : lotNavMode === 'seller' ? (
            (() => {
              const entries = Array.from(lotsBySeller.entries());
              const toLabel = ([key, lots]: [string, LotInfo[]]) => {
                const first = lots[0];
                if (!first) return { key, lots, label: key, sortKey: key };
                const name = (first.seller_name || '').trim();
                const mark = (first.seller_mark || '').trim();
                const vehicle = (first.vehicle_number || '').trim();
                const label = [name, mark ? `(${mark})` : null, vehicle].filter(Boolean).join(' · ') || `Seller ${key}`;
                const sortKey = `${name.toLowerCase()}|${vehicle}`;
                return { key, lots, label, sortKey };
              };
              const sorted = entries.map(toLabel).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
              return sorted.map(({ key, lots, label }) => (
                <div key={key} className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-3 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 border-b border-border/30 flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-bold text-foreground truncate min-w-0">{label}</span>
                    <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">{lots.length} lot(s)</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {lots.map(lot => (
                      <LotRow key={getLotRenderKey(lot)} lot={lot} onSelect={selectLot} statusFilter={statusFilter} />
                    ))}
                  </div>
                </div>
              ));
            })()
          ) : (
            filteredLots.map(lot => (
              <LotRow key={getLotRenderKey(lot)} lot={lot} onSelect={selectLot} statusFilter={statusFilter} />
            ))
          )}
        </div>
        {isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ SALES PAD (AUCTION) SCREEN ═══
  return (
    <div className={cn(
      "min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 lg:pb-6",
      isDesktop ? "pb-28" : "pb-[38rem]"
    )}>
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
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
              <button onClick={goBackToSelector}
                aria-label="Go back" className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Gavel className="w-5 h-5" /> Sales Pad
                </h1>
                <p className="text-white/70 text-xs">Live auction operations</p>
              </div>
              {/* Lot navigation & list toggle */}
              <div className="flex items-center gap-1">
                <button onClick={() => navigateToLot('prev')} disabled={!canGoPrev}
                  aria-label="Previous lot" className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-all",
                    canGoPrev ? 'bg-white/20 backdrop-blur' : 'bg-white/10 opacity-40')}>
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button onClick={() => setShowLotList(!showLotList)}
                  aria-label="Lot list" className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <List className="w-4 h-4 text-white" />
                </button>
                <button onClick={() => navigateToLot('next')} disabled={!canGoNext}
                  aria-label="Next lot" className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-all",
                    canGoNext ? 'bg-white/20 backdrop-blur' : 'bg-white/10 opacity-40')}>
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Lot Info Strip */}
            {selectedLot && (
              <div className="grid grid-cols-4 gap-2">
                {(
                  isSelfSaleReauction
                    ? [
                      { icon: User, label: 'Trader', value: trader?.business_name || 'Trader' },
                      { icon: Package, label: 'Lot', value: formatLotDisplayName(selectedLot) },
                      { icon: ShoppingCart, label: 'Remaining', value: `${remaining}/${selectedLot.bag_count}${selectedLot.was_modified ? '*' : ''}` },
                      { icon: Gavel, label: 'Prev Bids', value: String(previousSelfSaleEntries.length) },
                    ]
                    : [
                      { icon: User, label: 'Seller', value: selectedLot.seller_name },
                      { icon: Truck, label: 'Vehicle', value: selectedLot.vehicle_number },
                      { icon: Package, label: 'Lot', value: formatLotDisplayName(selectedLot) },
                      { icon: ShoppingCart, label: 'Bags', value: `${remaining}/${selectedLot.bag_count}${selectedLot.was_modified ? '*' : ''}` },
                    ]
                ).map((item) => (
                  <div key={item.label} className="bg-white/15 backdrop-blur-md rounded-xl p-2 text-center">
                    <item.icon className="w-3.5 h-3.5 text-white/70 mx-auto mb-0.5" />
                    <p className="text-[9px] text-white/60 uppercase">{item.label}</p>
                    <p className="text-[11px] font-semibold text-white truncate">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Lot position indicator */}
            {selectedLot && (
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="text-[10px] text-white/60">Lot {currentLotIndex + 1} of {navigationLots.length}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Toolbar */}
      {isDesktop && (
        <div className="px-8 py-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Gavel className="w-5 h-5 text-blue-500" /> Sales Pad — Live Auction
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedLot ? formatLotDisplayName(selectedLot) : 'No lot selected'}
                {selectedLot && <span className="ml-2 text-primary font-medium">({currentLotIndex + 1}/{navigationLots.length})</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => navigateToLot('prev')} disabled={!canGoPrev}
                variant="outline" size="icon" className="rounded-xl h-10 w-10">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button onClick={() => setShowLotList(!showLotList)}
                variant={showLotList ? 'default' : 'outline'} size="icon" className="rounded-xl h-10 w-10">
                <List className="w-4 h-4" />
              </Button>
              <Button onClick={() => navigateToLot('next')} disabled={!canGoNext}
                variant="outline" size="icon" className="rounded-xl h-10 w-10">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button onClick={goBackToSelector}
                variant="outline" className="rounded-xl ml-2">
                ← Change Lot
              </Button>
            </div>
          </div>
          {selectedLot && (
            <div className="grid grid-cols-5 gap-4">
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-blue-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{isSelfSaleReauction ? 'Trader' : 'Seller'}</p>
                <p className="text-sm font-bold text-foreground truncate">{isSelfSaleReauction ? (trader?.business_name || 'Trader') : selectedLot.seller_name}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-violet-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{isSelfSaleReauction ? 'Prev Bids' : 'Vehicle'}</p>
                <p className="text-sm font-bold text-foreground">{isSelfSaleReauction ? previousSelfSaleEntries.length : selectedLot.vehicle_number}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-emerald-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Remaining</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{remaining}<span className="text-xs font-normal ml-1">bags</span></p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-amber-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{isSelfSaleReauction ? 'Self-Sale Rate' : 'Highest Bid'}</p>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400">₹{isSelfSaleReauction ? Number(selfSaleContext?.rate ?? 0) : highestBid}</p>
              </div>
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-rose-500">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{isSelfSaleReauction ? 'Self-Sale Qty' : 'Entries'}</p>
                <p className="text-2xl font-black text-foreground">{isSelfSaleReauction ? (selfSaleContext?.quantity ?? 0) : entries.length}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedLot && isSelfSaleReauction && selfSaleContext && (
        <div className={cn(isDesktop ? "px-8 pb-2" : "px-4 mt-3")}>
          <div className="glass-card rounded-2xl p-4 border border-fuchsia-500/20 bg-fuchsia-500/5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">Self-Sale History</p>
                <p className="text-sm text-muted-foreground">
                  Closed at ₹{Number(selfSaleContext.rate ?? 0).toLocaleString()} for {selfSaleContext.quantity ?? 0} bags
                  {selfSaleContext.created_at ? ` · ${new Date(selfSaleContext.created_at).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                Remaining: <span className="text-foreground">{selfSaleContext.remaining_qty ?? 0}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 px-3 py-2 bg-muted/40 text-[10px] uppercase font-semibold text-muted-foreground">
                <span>Buyer</span>
                <span>Mark</span>
                <span>Rate</span>
                <span>Qty</span>
              </div>
              {previousSelfSaleEntries.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">No previous auction entries were found for this self-sale lot.</div>
              ) : (
                previousSelfSaleEntries.map((entry) => (
                  <div key={`${entry.bidNumber}-${entry.buyerMark}`} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 px-3 py-2 border-t border-border/30 text-sm">
                    <span className="truncate text-foreground">{entry.buyerName || 'Buyer'}</span>
                    <span className="truncate text-muted-foreground">{entry.buyerMark}</span>
                    <span className="font-medium text-foreground">₹{entry.rate}</span>
                    <span className="font-medium text-foreground">{entry.quantity}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ LOT LIST OVERLAY ═══ */}
      <AnimatePresence>
        {showLotList && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="px-4 mb-3 overflow-hidden">
            <div className="glass-card rounded-2xl p-3 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Quick Lot Navigation</p>
                <div className="relative w-40">
                  <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input placeholder="Lot # or 320/320/110-110" value={lotNumberSearch} onChange={e => setLotNumberSearch(e.target.value)}
                    className="w-full h-7 pl-7 pr-2 rounded-lg bg-muted/50 text-foreground text-xs border border-border focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="space-y-1">
                {(lotNumberSearch
                  ? navigationLots.filter(l =>
                    l.lot_name.toLowerCase().includes(lotNumberSearch.toLowerCase()) ||
                    l.lot_id.toLowerCase().includes(lotNumberSearch.toLowerCase()) ||
                    formatLotDisplayName(l).toLowerCase().includes(lotNumberSearch.toLowerCase())
                  )
                  : navigationLots
                ).map(lot => {
                  const status = getRowLotStatus(lot, statusFilter);
                  const cfg = STATUS_CONFIG[status];
                  const isActive = selectedLotSource === 'self_sale'
                    ? selectedLot?.selfSaleUnitId === lot.selfSaleUnitId
                    : selectedLot?.lot_id === lot.lot_id;
                  return (
                    <button key={getLotRenderKey(lot)} onClick={() => selectLot(lot)}
                      className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-all",
                        isActive ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/50')}>
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", cfg.dot)} />
                      <span className={cn("font-semibold truncate flex-1", isActive ? 'text-primary' : 'text-foreground')}>{formatLotDisplayName(lot)}</span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", cfg.bg, cfg.text)}>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 mt-4 flex flex-col gap-3 h-auto min-h-0">
        {/* REQ-AUC-003: Preset margin (preset labels A/B/C; green = profit, red = negative). Toggle to show/hide. */}
        {isDesktop && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preset Margin</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Show</span>
                <Switch checked={showPresetMargin} onCheckedChange={handleShowPresetMarginChange} aria-label="Show preset margin" />
              </div>
            </div>

            {showPresetMargin && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {presetOptions.map((opt) => (
                    <button
                      key={opt.label + String(opt.value)}
                      type="button"
                      onClick={() => applyPreset(opt.value)}
                      className={cn(
                        'flex-1 py-2 rounded-xl text-sm font-bold transition-all',
                        preset === opt.value
                          ? opt.value >= 0
                            ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-md shadow-emerald-500/20'
                            : 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-md shadow-red-500/20'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted/60',
                        preset !== opt.value && opt.value >= 0 && 'text-success',
                        preset !== opt.value && opt.value < 0 && 'text-destructive'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-muted/30 min-w-[60px]">
                    <IndianRupee className="w-3.5 h-3.5 text-primary" />
                    <span className={cn("text-sm font-bold", preset >= 0 ? 'text-success' : 'text-destructive')}>{preset}</span>
                  </div>
                </div>
                {preset !== 0 && highestBid > 0 && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-muted-foreground mt-2">
                    Buyer pays <span className="text-foreground font-semibold">₹{highestBid}</span> · Seller gets{' '}
                    <span className={cn('font-semibold', preset >= 0 ? 'text-success' : 'text-destructive')}>
                      ₹{calcSellerRate(highestBid, preset)}
                    </span>
                    <span className="ml-1">(base ₹{highestBid} + margin {preset >= 0 ? '+' : ''}{preset})</span>
                  </motion.p>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Entry Form — buyer select/search + bid entry (desktop only) */}
        {isDesktop && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-2xl p-3 space-y-3">
            <div className={cn('grid gap-3', isDesktop ? 'grid-cols-[minmax(0,1fr)_280px]' : 'grid-cols-1')}>
              <div className="space-y-2 min-w-0">
                {isDesktop ? (
                  <div className="space-y-2 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Scribble pad
                    </p>
                    <InlineScribblePad
                      appendMode
                      onMarkDetected={handleScribbleSegmentDetected}
                      canvasHeight={280}
                      resetTrigger={scribblePadResetTrigger}
                    />
                    <Input
                      ref={markInputRef}
                      type="text"
                      value={scribbleMark}
                      readOnly={!!editingBidId}
                      onMouseDown={() => { manualMarkSelectionRef.current = true; }}
                      onTouchStart={() => { manualMarkSelectionRef.current = true; }}
                      onChange={(e) => {
                        if (editingBidId) return;
                        lastScribbleSegmentRef.current = '';
                        const v = e.target.value.toUpperCase().slice(0, MAX_MARK_LEN);
                        setScribbleMark(v);
                        const rawPos = e.target.selectionStart ?? v.length;
                        const clampedPos = clampInsideClosingParen(v, rawPos);
                        markInsertPosRef.current = clampedPos;
                        pendingMarkCaretPosRef.current = clampedPos;
                        setSelectedBuyer(null);
                      }}
                      onSelect={(e) => {
                        const rawPos = e.currentTarget.selectionStart ?? scribbleMark.length;
                        const allowManualExit = manualMarkSelectionRef.current;
                        manualMarkSelectionRef.current = false;
                        const clampedPos = clampInsideClosingParen(scribbleMark, rawPos, allowManualExit);
                        markInsertPosRef.current = clampedPos;
                        pendingMarkCaretPosRef.current = clampedPos !== rawPos ? clampedPos : null;
                      }}
                      onFocus={() => setActiveNumpadField('mark')}
                      placeholder="Or type mark / name to search…"
                      className="h-11 rounded-xl text-sm sm:text-base font-medium bg-muted/20 border-violet-400/20"
                    />
                  </div>
                ) : null}
                {/* Two rows always visible. Scroll: touch (smooth left/right), mouse-drag, arrow keys. */}
                {isDesktop && (
                  <div className="space-y-3 min-w-0">
                    {/* Row 1: Registered buyers — contacts — green. */}
                    <div className="min-w-0 w-full max-w-full space-y-1.5">
                      <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Registered buyers
                      </p>
                      <div
                        ref={contactScrollRef}
                        role="region"
                        aria-label="Registered buyers"
                        tabIndex={0}
                        {...makeScrollHandlers(contactScrollRef, didDragContactRef)}
                        className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden flex flex-nowrap gap-2.5 py-1.5 -mx-1 px-0.5 scroll-smooth touch-pan-x select-none cursor-grab active:cursor-grabbing overscroll-x-contain"
                        style={{
                          scrollbarWidth: 'thin',
                          WebkitOverflowScrolling: 'touch',
                          overscrollBehaviorX: 'contain',
                        }}
                      >
                        {filteredContacts.length > 0 ? (
                          filteredContacts.slice(0, 50).map((b) => (
                            <button
                              key={b.contact_id}
                              type="button"
                              disabled={!!editingBidId}
                              onClick={(e) => {
                                if (didDragContactRef.current) {
                                  e.preventDefault();
                                  return;
                                }
                                hapticSelection();
                                hideNativeKeyboard();
                                setSelectedBuyer(b);
                                lastScribbleSegmentRef.current = '';
                                setScribbleMark((b.mark || b.name.charAt(0) || '').toString());
                                setScribblePadResetTrigger((t) => t + 1);
                              }}
                              className={cn(
                                'flex-shrink-0 pl-2.5 pr-3 py-2.5 rounded-xl text-left transition-all border border-l-4 border-l-emerald-500 flex items-center gap-2 min-h-[44px]',
                                selectedBuyer?.contact_id === b.contact_id
                                  ? 'bg-primary text-primary-foreground border-primary shadow-md border-l-primary'
                                  : 'bg-muted/40 border-border/50 hover:bg-muted/60'
                              )}
                            >
                              <span className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                                selectedBuyer?.contact_id === b.contact_id ? 'bg-white/20' : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                              )}>
                                {contactAvatarLetter(b.mark, b.name)}
                              </span>
                              <span className="text-sm sm:text-base font-semibold truncate max-w-[100px] sm:max-w-[120px]">{b.name}</span>
                              {b.mark && <span className="text-xs opacity-90 flex-shrink-0">({b.mark})</span>}
                            </button>
                          ))
                        ) : (
                          <div className="flex-shrink-0 px-4 py-2.5 rounded-xl border border-l-4 border-l-emerald-500 border-dashed bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                            No matching contact
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Temporary buyers (scribble / quick-add), today — violet accent. */}
                    <div className="min-w-0 w-full max-w-full space-y-1.5">
                      <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Temporary buyers · today
                      </p>
                      <div
                        ref={markScrollRef}
                        role="region"
                        aria-label="Temporary buyers"
                        tabIndex={0}
                        {...makeScrollHandlers(markScrollRef, didDragMarkRef)}
                        className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden flex flex-nowrap gap-2.5 py-1.5 -mx-1 px-0.5 scroll-smooth touch-pan-x select-none cursor-grab active:cursor-grabbing overscroll-x-contain"
                        style={{
                          scrollbarWidth: 'thin',
                          WebkitOverflowScrolling: 'touch',
                          overscrollBehaviorX: 'contain',
                        }}
                      >
                        {filteredTemporaryMarks.length > 0 ? (
                          filteredTemporaryMarks.slice(0, 50).map((mark) => {
                            const isSelected = !selectedBuyer && scribbleMark === mark;
                            return (
                              <button
                                key={mark}
                                type="button"
                                disabled={!!editingBidId}
                                onClick={(e) => {
                                  if (didDragMarkRef.current) {
                                    e.preventDefault();
                                    return;
                                  }
                                  hapticSelection();
                                  hideNativeKeyboard();
                                  setSelectedBuyer(null);
                                  lastScribbleSegmentRef.current = '';
                                  setScribbleMark(mark);
                                  setScribblePadResetTrigger((t) => t + 1);
                                }}
                                className={cn(
                                  'flex-shrink-0 pl-2.5 pr-3 py-2.5 rounded-xl text-left transition-all border border-l-4 border-l-violet-500 flex items-center gap-2 min-h-[44px]',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground border-primary shadow-md border-l-primary'
                                    : 'bg-muted/40 border-border/50 hover:bg-muted/60'
                                )}
                              >
                                <span className={cn(
                                  'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                                  isSelected ? 'bg-white/20' : 'bg-violet-500/20 text-violet-700 dark:text-violet-300'
                                )}>
                                  {markAvatarLetter(mark)}
                                </span>
                                <span className="text-sm sm:text-base font-semibold truncate max-w-[100px]">{mark}</span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="flex-shrink-0 px-4 py-2.5 rounded-xl border border-l-4 border-l-violet-400 border-dashed bg-violet-500/5 text-violet-700 dark:text-violet-300 text-sm font-medium">
                            No temporary marks yet today
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {(scribbleMark || selectedBuyer) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedBuyer ? (
                      <>
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase">Buyer:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-sm font-bold border border-primary/30">
                          {selectedBuyer.name} {selectedBuyer.mark ? `(${selectedBuyer.mark})` : ''}
                        </span>
                        <button
                          type="button"
                          disabled={!!editingBidId}
                          onClick={() => { setSelectedBuyer(null); lastScribbleSegmentRef.current = ''; setScribbleMark(''); }}
                          className="text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase">Mark:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-bold shadow-sm">{scribbleMark}</span>
                        <button
                          type="button"
                          onClick={handleMarkBackspace}
                          disabled={!!editingBidId || !scribbleMark}
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-muted/70 text-foreground hover:bg-muted disabled:opacity-40 border border-border/60"
                          aria-label="Delete last character of mark"
                        >
                          Del
                        </button>
                        <button
                          type="button"
                          disabled={!!editingBidId}
                          onClick={() => { lastScribbleSegmentRef.current = ''; setScribbleMark(''); setScribblePadResetTrigger((t) => t + 1); }}
                          className="p-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Clear mark"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className={cn("space-y-2", !isDesktop && "hidden")}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5 block">Rate (₹)</label>
                    <Input
                      ref={rateInputRef}
                      type="number"
                      value={rate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRate(v);
                        if (editingBidId) setEditBidDraft((d) => (d ? { ...d, rate: v } : d));
                      }}
                      onFocus={(e) => {
                        setActiveNumpadField('rate');
                        if (isTouchLayout && !mobileKeyboardEnabled) {
                          e.currentTarget.blur();
                          hideNativeKeyboard();
                        }
                      }}
                      onBlur={() => { if (isTouchLayout) setMobileKeyboardEnabled(false); }}
                      readOnly={isTouchLayout && !mobileKeyboardEnabled}
                      inputMode={isTouchLayout && !mobileKeyboardEnabled ? 'none' : 'numeric'}
                      placeholder="0"
                      className={cn(
                        "h-11 rounded-xl text-center font-bold text-lg bg-muted/20 border-primary/20",
                        activeNumpadField === 'rate' && "ring-2 ring-primary border-primary/50"
                      )} />
                  </div>
                  <div>
                    <label className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5 block">Qty (Bags)</label>
                    <Input
                      ref={qtyInputRef}
                      type="number"
                      value={qty}
                      onChange={(e) => {
                        const v = e.target.value;
                        setQty(v);
                        if (editingBidId) setEditBidDraft((d) => (d ? { ...d, qty: v } : d));
                      }}
                      onFocus={(e) => {
                        setActiveNumpadField('qty');
                        if (isTouchLayout && !mobileKeyboardEnabled) {
                          e.currentTarget.blur();
                          hideNativeKeyboard();
                        }
                      }}
                      onBlur={() => { if (isTouchLayout) setMobileKeyboardEnabled(false); }}
                      readOnly={isTouchLayout && !mobileKeyboardEnabled}
                      inputMode={isTouchLayout && !mobileKeyboardEnabled ? 'none' : 'numeric'}
                      placeholder="0"
                      className={cn(
                        "h-11 rounded-xl text-center font-bold text-lg bg-muted/20 border-primary/20",
                        activeNumpadField === 'qty' && "ring-2 ring-primary border-primary/50"
                      )} />
                  </div>
                </div>
                {isDesktop && (
                  <div className="flex gap-2">
                    {editingBidId && editBidDraft ? (
                      <>
                        <Button
                          onClick={() => { if (editingEntry) void saveEditBid(editingEntry); }}
                          disabled={!editingEntry || !rate || !qty || parseInt(qty) <= 0 || parseInt(rate) <= 0}
                          className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold shadow-md shadow-violet-500/20"
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Update Bid
                        </Button>
                        <Button
                          onClick={cancelEditBid}
                          variant="outline"
                          className="h-11 rounded-xl px-4 border-border/50 text-foreground hover:bg-muted/40"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={handleUnifiedAdd}
                          disabled={(!scribbleMark.trim() && !selectedBuyer) || !rate || !qty || parseInt(qty) <= 0 || parseInt(rate) <= 0}
                          className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold shadow-md shadow-violet-500/20"
                        >
                          <Plus className="w-4 h-4 mr-1" /> Add Bid
                        </Button>
                        {!isSelfSaleReauction && (
                          <Button onClick={handleSelfSale} disabled={remaining <= 0}
                            variant="outline" className="h-11 rounded-xl px-4 border-amber-400/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
                            Self Sale
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Auction Grid — entries list */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={cn(!isDesktop && "order-2")}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Auction Grid · {entries.length} entries
            </p>
            {entries.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-bold text-foreground">₹{entries.reduce((s, e) => s + e.amount, 0).toLocaleString()}</span>
              </p>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Gavel className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No bids yet. Start the auction!</p>
            </div>
          ) : (
            <div
              className={cn(
                'glass-card rounded-2xl h-auto min-h-0',
                entries.length > 5 ? 'overflow-hidden' : 'overflow-visible'
              )}
            >
              <div
                className={cn(
                  'overflow-x-auto h-auto min-h-0 pb-4',
                  entries.length > 5
                    ? 'max-h-[min(42vh,17rem)] overflow-y-auto overscroll-y-contain sm:max-h-[min(48vh,19rem)] md:max-h-[min(52vh,21rem)] touch-pan-y'
                    : 'overflow-y-visible'
                )}
                style={
                  entries.length > 5
                    ? { scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' as const }
                    : undefined
                }
              >
                <table className={cn("w-full text-left border-collapse", showPresetMargin ? "min-w-[380px]" : "min-w-[320px]")}>
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30 sticky top-0 z-10">
                      <th className={cn("font-semibold text-muted-foreground uppercase tracking-wider", isDesktop ? "px-3 py-2.5 text-xs" : "px-2 py-1.5 text-[10px]")}>Mark / Buyer</th>
                      <th className={cn("font-semibold text-muted-foreground uppercase tracking-wider", isDesktop ? "px-3 py-2.5 text-xs" : "px-2 py-1.5 text-[10px]")}>Rate</th>
                      {showPresetMargin && (
                        <th className={cn("font-semibold text-muted-foreground uppercase tracking-wider", isDesktop ? "px-3 py-2.5 text-xs" : "px-2 py-1.5 text-[10px]")}>Preset</th>
                      )}
                      <th className={cn("font-semibold text-muted-foreground uppercase tracking-wider", isDesktop ? "px-3 py-2.5 text-xs" : "px-2 py-1.5 text-[10px]")}>Qty</th>
                      <th className={cn("font-semibold text-muted-foreground uppercase tracking-wider text-right", isDesktop ? "px-3 py-2.5 text-xs" : "px-2 py-1.5 text-[10px]")}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => (
                      <Fragment key={entry.id}>
                        <motion.tr
                          initial={{ opacity: 0, x: -15 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={cn(
                            "border-b border-border/30 hover:bg-muted/20 transition-colors",
                            entry.isSelfSale && "border-l-4 border-l-amber-500",
                            entry.isScribble && "border-l-4 border-l-violet-500",
                            editingBidId === entry.id && "bg-primary/5 ring-1 ring-inset ring-primary/35"
                          )}
                        >
                          <td className={cn("px-3 py-2", isDesktop ? "" : "px-2 py-1.5")}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={cn(
                                "inline-flex items-center justify-center rounded-lg font-bold flex-shrink-0",
                                isDesktop ? "w-8 h-8 text-xs" : "w-6 h-6 text-[10px]",
                                entry.isSelfSale ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white" :
                                  entry.isScribble ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white" :
                                    "bg-gradient-to-br from-blue-500 to-cyan-400 text-white"
                              )}>
                                {markAvatarLetter(entry.buyerMark)}
                              </span>
                              <span className={cn("font-medium text-foreground truncate max-w-[120px]", isDesktop ? "text-sm" : "text-xs")} title={entry.buyerName}>
                                {entry.buyerName}
                              </span>
                              {entry.isScribble && <span className="px-1 py-0.5 rounded bg-violet-500/15 text-violet-500 text-[8px] font-bold">SCRIBBLE</span>}
                              {entry.isSelfSale && <span className="px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[8px] font-bold">SELF</span>}
                              {editingBidId === entry.id && (
                                <span className="px-1 py-0.5 rounded bg-primary/20 text-primary text-[8px] font-bold">EDITING</span>
                              )}
                            </div>
                          </td>
                          <td className={cn("font-semibold text-foreground align-top", isDesktop ? "px-3 py-2 text-sm" : "px-2 py-1.5 text-xs")}>
                            <div>₹{entry.rate}</div>
                            {showPresetMargin && (
                              <div className="text-[10px] font-medium text-muted-foreground">
                                Total ₹{entry.sellerRate}
                              </div>
                            )}
                          </td>
                          {showPresetMargin && (
                            <td
                              className={cn(
                                "align-top font-medium tabular-nums",
                                isDesktop ? "px-3 py-2 text-sm" : "px-2 py-1.5 text-xs",
                                entry.presetApplied > 0 && "text-success",
                                entry.presetApplied < 0 && "text-destructive"
                              )}
                            >
                              {formatPresetMarginCell(entry.presetApplied)}
                            </td>
                          )}
                          <td className={cn("text-muted-foreground", isDesktop ? "px-3 py-2 text-sm" : "px-2 py-1.5 text-xs")}>
                            {entry.quantity}
                          </td>
                          <td className={cn("text-right", isDesktop ? "px-3 py-2" : "px-2 py-1.5")}>
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                disabled={!!editingBidId}
                                onClick={() => setShowTokenInput(showTokenInput === entry.id ? null : entry.id)}
                                className={cn(
                                  "p-1 rounded-md transition-colors disabled:opacity-40",
                                  entry.tokenAdvance > 0 ? "bg-success/15 text-success" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                                )}
                                title="Token advance"
                              >
                                <Banknote className={cn(isDesktop ? "w-3.5 h-3.5" : "w-3 h-3")} />
                              </button>
                              <button
                                onClick={() => setPendingDeleteBid({ id: entry.id, label: `${entry.buyerName} (${entry.buyerMark})` })}
                                type="button"
                                disabled={!!editingBidId}
                                className="p-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40"
                                title="Delete bid"
                              >
                                <Trash2 className={cn(isDesktop ? "w-3.5 h-3.5" : "w-3 h-3")} />
                              </button>
                              {can('Auctions / Sales', 'Edit') && (
                                <button
                                  type="button"
                                  disabled={!!editingBidId}
                                  onClick={() => startEditBid(entry)}
                                  className="p-1 rounded-md bg-muted/60 text-foreground hover:bg-muted disabled:opacity-40"
                                  title="Edit bid"
                                >
                                  <Pencil className={cn(isDesktop ? "w-3.5 h-3.5" : "w-3 h-3")} />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                        <AnimatePresence>
                          {showTokenInput === entry.id && !editingBidId && (
                            <motion.tr
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="border-b border-border/30 bg-muted/10"
                            >
                              <td colSpan={showPresetMargin ? 5 : 4} className={cn("px-3 py-2", isDesktop ? "" : "px-2 py-1.5")}>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Token ₹</span>
                                  <Input
                                    type="number"
                                    defaultValue={entry.tokenAdvance || ""}
                                    placeholder="0"
                                    className={cn("rounded-lg text-center flex-1", isDesktop ? "h-8 text-xs" : "h-7 text-xs")}
                                    onBlur={e => setTokenAdvanceAmount(entry.id, parseInt(e.target.value) || 0)}
                                    onKeyDown={e => { if (e.key === "Enter") setTokenAdvanceAmount(entry.id, parseInt((e.target as HTMLInputElement).value) || 0); }}
                                  />
                                  {entry.tokenAdvance > 0 && <span className="text-[10px] text-success font-semibold">✓ ₹{entry.tokenAdvance}</span>}
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>

        {/* Remaining indicator */}
        {entries.length > 0 && selectedLot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("glass-card rounded-2xl p-3", !isDesktop && "order-1")}>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Sold</span>
              <span className="font-bold text-foreground">
                {totalSold} / {selectedLot.bag_count}{selectedLot.was_modified ? '*' : ''} bags
              </span>
            </div>
            <div className="w-full h-2.5 bg-muted/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (totalSold / selectedLot.bag_count) * 100)}%` }}
                className={cn('h-full rounded-full', totalSold >= selectedLot.bag_count ? 'bg-success' : 'bg-gradient-to-r from-primary to-accent')}
              />
            </div>
            {remaining > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground mt-1">{remaining} bags remaining</p>
                {isDesktop && (
                  <Button
                    disabled={completeLoading}
                    onClick={handleSaveAndCompleteAuction}
                    className="mt-2 w-full h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-sm shadow-md">
                    {completeLoading ? 'Completing…' : `✓ Save & Complete (${remaining} unsold)`}
                  </Button>
                )}
              </>
            )}
            {remaining <= 0 && (
              <>
                <p className="text-[10px] text-success font-semibold mt-1">✓ All bags sold!</p>
                {isDesktop && (
                  <Button
                    disabled={completeLoading}
                    onClick={handleSaveAndCompleteAuction}
                    className="mt-2 w-full h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-sm shadow-md">
                    {completeLoading ? 'Completing…' : '✓ Save & Complete Auction'}
                  </Button>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* Preset margin for mobile: now in fixed dock below rate/qty. */}
      </div>

      {/* Mobile/Tablet Dock: compact layout, preset below rate/qty. */}
      {!isDesktop && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur-xl px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="space-y-2 mb-1.5">
            <div>
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-0.5">
                Registered buyers
              </p>
              <div
                ref={contactScrollRef}
                role="region"
                aria-label="Registered buyers"
                tabIndex={0}
                {...makeScrollHandlers(contactScrollRef, didDragContactRef)}
                className="overflow-x-auto overflow-y-hidden flex gap-1.5 py-0.5 -mx-1 px-0.5 scroll-smooth touch-pan-x select-none cursor-grab active:cursor-grabbing overscroll-x-contain"
                style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
              >
                {filteredContacts.length > 0 ? (
                  filteredContacts.slice(0, 50).map((b) => (
                    <button
                      key={b.contact_id}
                      type="button"
                      disabled={!!editingBidId}
                      onClick={(e) => {
                        if (didDragContactRef.current) { e.preventDefault(); return; }
                        hapticSelection();
                        hideNativeKeyboard();
                        setSelectedBuyer(b);
                        lastScribbleSegmentRef.current = '';
                        setScribbleMark((b.mark || b.name.charAt(0) || '').toString());
                        setScribblePadResetTrigger((t) => t + 1);
                      }}
                      className={cn(
                        'flex-shrink-0 pl-2 pr-2.5 py-1.5 rounded-lg text-left transition-all border border-l-4 border-l-emerald-500 flex items-center gap-1.5 min-h-[40px]',
                        selectedBuyer?.contact_id === b.contact_id
                          ? 'bg-primary text-primary-foreground border-primary shadow-md border-l-primary'
                          : 'bg-muted/40 border-border/50 hover:bg-muted/60'
                      )}
                    >
                      <span className={cn(
                        'w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                        selectedBuyer?.contact_id === b.contact_id ? 'bg-white/20' : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      )}>
                        {contactAvatarLetter(b.mark, b.name)}
                      </span>
                      <span className="text-xs font-semibold truncate max-w-[78px] sm:max-w-[90px]">{b.name}</span>
                      {b.mark && <span className="text-[10px] opacity-90 flex-shrink-0">({b.mark})</span>}
                    </button>
                  ))
                ) : (
                  <div className="flex-shrink-0 px-3 py-2 rounded-lg border border-l-4 border-l-emerald-500 border-dashed bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                    No matching contact
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-0.5">
                Temporary buyers · today
              </p>
              <div
                ref={markScrollRef}
                role="region"
                aria-label="Temporary buyers"
                tabIndex={0}
                {...makeScrollHandlers(markScrollRef, didDragMarkRef)}
                className="overflow-x-auto overflow-y-hidden flex gap-1.5 py-0.5 -mx-1 px-0.5 scroll-smooth touch-pan-x select-none cursor-grab active:cursor-grabbing overscroll-x-contain"
                style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
              >
                {filteredTemporaryMarks.length > 0 ? (
                  filteredTemporaryMarks.slice(0, 50).map((mark) => {
                    const isSelected = !selectedBuyer && scribbleMark === mark;
                    return (
                      <button
                        key={mark}
                        type="button"
                        disabled={!!editingBidId}
                        onClick={(e) => {
                          if (didDragMarkRef.current) { e.preventDefault(); return; }
                          hapticSelection();
                          hideNativeKeyboard();
                          setSelectedBuyer(null);
                          lastScribbleSegmentRef.current = '';
                          setScribbleMark(mark);
                          setScribblePadResetTrigger((t) => t + 1);
                        }}
                        className={cn(
                          'flex-shrink-0 pl-2 pr-2.5 py-1.5 rounded-lg text-left transition-all border border-l-4 border-l-violet-500 flex items-center gap-1.5 min-h-[40px]',
                          isSelected ? 'bg-primary text-primary-foreground border-primary shadow-md border-l-primary' : 'bg-muted/40 border-border/50 hover:bg-muted/60'
                        )}
                      >
                        <span className={cn(
                          'w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                          isSelected ? 'bg-white/20' : 'bg-violet-500/20 text-violet-700 dark:text-violet-300'
                        )}>
                          {markAvatarLetter(mark)}
                        </span>
                        <span className="text-xs font-semibold truncate max-w-[72px]">{mark}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex-shrink-0 px-3 py-2 rounded-lg border border-l-4 border-l-violet-400 border-dashed bg-violet-500/5 text-violet-700 dark:text-violet-300 text-xs font-medium">
                    No temporary marks yet today
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Mobile: selected buyer/mark chip with clear — match desktop UX */}
          {(scribbleMark || selectedBuyer) && (
            <div className="flex items-center gap-2 flex-wrap mb-1 py-0.5">
              {selectedBuyer ? (
                <>
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase">Buyer:</span>
                  <span className="px-2 py-1 rounded-lg bg-primary/15 text-primary text-[11px] font-bold border border-primary/30">
                    {selectedBuyer.name} {selectedBuyer.mark ? `(${selectedBuyer.mark})` : ''}
                  </span>
                  <button
                    type="button"
                    disabled={!!editingBidId}
                    onClick={() => { setSelectedBuyer(null); lastScribbleSegmentRef.current = ''; setScribbleMark(''); setScribblePadResetTrigger(t => t + 1); }}
                    className="p-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Clear selection"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase">Mark:</span>
                  <span className="px-2 py-1 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 text-[11px] font-bold border border-violet-400/30">
                    {scribbleMark}
                  </span>
                  <button
                    type="button"
                    disabled={!!editingBidId}
                    onClick={() => { lastScribbleSegmentRef.current = ''; setScribbleMark(''); setScribblePadResetTrigger(t => t + 1); }}
                    className="p-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Clear mark"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="flex gap-1.5 mb-1 min-w-0">
            <div className="min-w-0 flex-[1.15]">
              <label htmlFor="sales-pad-mark-mobile" className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 block truncate">
                Mark
              </label>
              <Input
                id="sales-pad-mark-mobile"
                ref={markInputRef}
                type="text"
                autoComplete="off"
                value={scribbleMark}
                readOnly={!!editingBidId}
                onMouseDown={() => { manualMarkSelectionRef.current = true; }}
                onTouchStart={() => { manualMarkSelectionRef.current = true; }}
                onChange={(e) => {
                  if (editingBidId) return;
                  lastScribbleSegmentRef.current = '';
                  const v = e.target.value.toUpperCase().slice(0, MAX_MARK_LEN);
                  setScribbleMark(v);
                  const rawPos = e.target.selectionStart ?? v.length;
                  const clampedPos = clampInsideClosingParen(v, rawPos);
                  markInsertPosRef.current = clampedPos;
                  pendingMarkCaretPosRef.current = clampedPos;
                  setSelectedBuyer(null);
                }}
                onSelect={(e) => {
                  const rawPos = e.currentTarget.selectionStart ?? scribbleMark.length;
                  const allowManualExit = manualMarkSelectionRef.current;
                  manualMarkSelectionRef.current = false;
                  const clampedPos = clampInsideClosingParen(scribbleMark, rawPos, allowManualExit);
                  markInsertPosRef.current = clampedPos;
                  pendingMarkCaretPosRef.current = clampedPos !== rawPos ? clampedPos : null;
                }}
                inputMode="none"
                onFocus={() => { setActiveNumpadField('mark'); hideNativeKeyboard(); }}
                placeholder="Search…"
                aria-label="Search mark or name"
                className="h-9 rounded-lg text-[11px] sm:text-xs font-medium bg-muted/20 border-violet-400/20 px-2 min-w-0"
              />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="sales-pad-rate-mobile" className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 block truncate">
                Rate ₹
              </label>
              <Input
                id="sales-pad-rate-mobile"
                ref={rateInputRef}
                type="number"
                value={rate}
                onChange={(e) => {
                  const v = e.target.value;
                  setRate(v);
                  if (editingBidId) setEditBidDraft((d) => (d ? { ...d, rate: v } : d));
                }}
                onFocus={(e) => {
                  setActiveNumpadField('rate');
                  if (!mobileKeyboardEnabled) {
                    e.currentTarget.blur();
                    hideNativeKeyboard();
                  }
                }}
                onBlur={() => setMobileKeyboardEnabled(false)}
                readOnly={!mobileKeyboardEnabled}
                inputMode={!mobileKeyboardEnabled ? 'none' : 'numeric'}
                placeholder="0"
                aria-label="Bid rate in rupees"
                className={cn(
                  "h-9 rounded-lg text-center font-bold text-[11px] sm:text-sm bg-muted/20 border-primary/20 min-w-0",
                  activeNumpadField === 'rate' && "ring-2 ring-primary border-primary shadow-[0_0_0_2px_hsl(var(--primary))]"
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="sales-pad-qty-mobile" className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 block truncate">
                Qty
              </label>
              <Input
                id="sales-pad-qty-mobile"
                ref={qtyInputRef}
                type="number"
                value={qty}
                onChange={(e) => {
                  const v = e.target.value;
                  setQty(v);
                  if (editingBidId) setEditBidDraft((d) => (d ? { ...d, qty: v } : d));
                }}
                onFocus={(e) => {
                  setActiveNumpadField('qty');
                  if (!mobileKeyboardEnabled) {
                    e.currentTarget.blur();
                    hideNativeKeyboard();
                  }
                }}
                onBlur={() => setMobileKeyboardEnabled(false)}
                readOnly={!mobileKeyboardEnabled}
                inputMode={!mobileKeyboardEnabled ? 'none' : 'numeric'}
                placeholder="0"
                aria-label="Quantity in bags"
                className={cn(
                  "h-9 rounded-lg text-center font-bold text-[11px] sm:text-sm bg-muted/20 border-primary/20 min-w-0",
                  activeNumpadField === 'qty' && "ring-2 ring-primary border-primary shadow-[0_0_0_2px_hsl(var(--primary))]"
                )}
              />
            </div>
          </div>
          {/* Preset margin: compact row below rate/qty */}
          <div className="flex items-center justify-between gap-2 mb-1 py-0.5">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase">Preset</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground">Show</span>
              <Switch checked={showPresetMargin} onCheckedChange={handleShowPresetMarginChange} aria-label="Show preset margin" className="scale-75 origin-right" />
            </div>
          </div>
          {showPresetMargin && (
            <div className="flex items-center gap-1 mb-1">
              {presetOptions.map((opt) => (
                <button
                  key={opt.label + String(opt.value)}
                  type="button"
                  onClick={() => applyPreset(opt.value)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all',
                    preset === opt.value
                      ? opt.value >= 0
                        ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white'
                        : 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted/60',
                    preset !== opt.value && opt.value >= 0 && 'text-success',
                    preset !== opt.value && opt.value < 0 && 'text-destructive'
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-muted/30 min-w-[48px] justify-center">
                <IndianRupee className="w-3 h-3 text-primary" />
                <span className={cn("text-xs font-bold", preset >= 0 ? 'text-success' : 'text-destructive')}>{preset}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-[1.4fr_1fr] gap-1.5 items-stretch">
            <div className="rounded-xl border border-violet-400/20 bg-card/80 p-1.5 h-full min-h-[15rem] flex flex-col gap-1">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground px-0.5 shrink-0">
                Scribble pad
              </p>
              <div className="flex-1 min-h-0">
                <InlineScribblePad
                  appendMode
                  onMarkDetected={handleScribbleSegmentDetected}
                  canvasHeight={240}
                  resetTrigger={scribblePadResetTrigger}
                  showStatus={false}
                  fillAvailableHeight
                  className="h-full"
                />
              </div>
            </div>
            <div className="rounded-xl border border-primary/20 bg-card/80 p-1.5 space-y-1.5">
              <div className="grid grid-cols-3 gap-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '*'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleNumpadKey(k)}
                    className="h-11 rounded-xl bg-muted/60 hover:bg-muted text-sm font-bold text-foreground transition-colors"
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={appendMarkParenFromNumpad}
                  disabled={!!editingBidId}
                  className="h-10 rounded-lg bg-violet-500/15 text-violet-800 dark:text-violet-200 border border-violet-500/35 text-[11px] font-bold"
                  title="Add ( or ) to mark"
                  aria-label="Add opening or closing parenthesis to mark"
                >
                  ( )
                </button>
                <button
                  type="button"
                  onClick={handleNumpadBackspace}
                  className="h-10 rounded-lg bg-muted/60 hover:bg-muted text-xs font-semibold text-foreground"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNumpadClear}
                  className="h-10 rounded-lg bg-muted/60 hover:bg-muted text-xs font-semibold text-foreground"
                >
                  Clear
                </button>
              </div>

              {editingBidId && editBidDraft ? (
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => { if (editingEntry) void saveEditBid(editingEntry); }}
                    disabled={!editingEntry || !rate || !qty || parseInt(qty) <= 0 || parseInt(rate) <= 0}
                    className="h-10 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Update Bid
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditBid}
                    className="h-10 rounded-xl bg-muted/60 text-foreground border border-border/50 text-[11px] font-bold"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {!isSelfSaleReauction && (
                    <button
                      type="button"
                      onClick={handleSelfSale}
                      disabled={remaining <= 0}
                      className="w-full h-9 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold disabled:opacity-50"
                    >
                      Self Sale
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleUnifiedAdd}
                    disabled={(!scribbleMark.trim() && !selectedBuyer) || !rate || !qty || parseInt(qty) <= 0 || parseInt(rate) <= 0}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[12px] font-bold disabled:opacity-50"
                  >
                    + Add Bid
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={completeLoading || entries.length === 0}
                onClick={handleSaveAndCompleteAuction}
                className="w-full h-8 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 text-white text-[10px] font-bold disabled:opacity-50"
              >
                {completeLoading ? 'Completing…' : 'Save & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scribble Pad */}
      <ScribblePad open={showScribble} onClose={() => setShowScribble(false)} onConfirm={handleScribbleConfirm} />

      {/* ═══ DUPLICATE MARK DIALOG ═══ */}
      <AnimatePresence>
        {duplicateMarkDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
            onClick={() => setDuplicateMarkDialog(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-2xl border border-border/50" onClick={e => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">Reusing Mark "{duplicateMarkDialog.mark}"?</h3>
              <p className="text-sm text-center text-muted-foreground mb-4">
                This mark already exists in this lot (Bid #{duplicateMarkDialog.existingEntry.bidNumber}).
                {duplicateMarkDialog.existingEntry.rate === duplicateMarkDialog.rate
                  ? ' Same rate — bids will be merged.'
                  : ' Different rate — bids will be kept separate.'}
              </p>
              <div className="flex gap-3">
                <Button onClick={handleDuplicateNewMark} variant="outline" className="flex-1 h-12 rounded-xl">
                  Different Mark
                </Button>
                <Button onClick={handleDuplicateMerge}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  {duplicateMarkDialog.existingEntry.rate === duplicateMarkDialog.rate ? 'Merge' : 'Keep Separate'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ QUANTITY INCREASE CONFIRMATION ═══ */}
      <AnimatePresence>
        {qtyIncreaseDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
            onClick={() => setQtyIncreaseDialog(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-2xl border border-border/50" onClick={e => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Plus className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">Increase Lot Quantity?</h3>
              <p className="text-sm text-center text-muted-foreground mb-4">
                Lot has <strong>{qtyIncreaseDialog.lotTotal}</strong> bags, <strong>{qtyIncreaseDialog.currentTotal}</strong> already sold.
                Adding <strong>{qtyIncreaseDialog.attemptedQty}</strong> bags exceeds the limit.
                <br />New total will be: <strong>{qtyIncreaseDialog.currentTotal + qtyIncreaseDialog.attemptedQty}</strong> bags*
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setQtyIncreaseDialog(null)} variant="outline" className="flex-1 h-12 rounded-xl">Cancel</Button>
                <Button onClick={confirmQtyIncrease}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white">
                  Increase & Add
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editBidQtyDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
            onClick={() => setEditBidQtyDialog(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-2xl border border-border/50" onClick={e => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Pencil className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">Increase Lot Quantity?</h3>
              <p className="text-sm text-center text-muted-foreground mb-4">
                Lot has <strong>{editBidQtyDialog.lotTotal}</strong> bags.
                Other bids use <strong>{editBidQtyDialog.currentTotal}</strong> bags.
                This bid at <strong>{editBidQtyDialog.attemptedQty}</strong> bags would bring the total sold to{' '}
                <strong>{editBidQtyDialog.currentTotal + editBidQtyDialog.attemptedQty}</strong> bags.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setEditBidQtyDialog(null)} variant="outline" className="flex-1 h-12 rounded-xl">Cancel</Button>
                <Button onClick={() => { void confirmEditBidQtyIncrease(); }}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white">
                  Allow & Update
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isDesktop && <BottomNav />}

      <ConfirmDeleteDialog
        open={!!pendingDeleteBid}
        onOpenChange={(v) => { if (!v) setPendingDeleteBid(null); }}
        title="Delete bid?"
        description={pendingDeleteBid ? `Remove bid for "${pendingDeleteBid.label}"? This cannot be undone.` : ''}
        onConfirm={() => pendingDeleteBid && removeEntry(pendingDeleteBid.id)}
      />
    </div>
  );
};

// ── Lot Row Component with Status Badge ──────────────────
const LotRow = ({ lot, onSelect, statusFilter }: { lot: LotInfo; onSelect: (lot: LotInfo) => void; statusFilter: LotStatus | 'all' }) => {
  const status = getRowLotStatus(lot, statusFilter);
  const cfg = STATUS_CONFIG[status];

  return (
    <button onClick={() => onSelect(lot)}
      className="w-full glass-card rounded-2xl p-3 flex items-center gap-3 hover:shadow-lg transition-all text-left group">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-md flex-shrink-0 relative overflow-hidden">
        <Package className="w-4 h-4 text-white relative z-10" />
        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-foreground truncate">
            {formatLotDisplayName(lot)}{lot.was_modified ? '*' : ''}
          </p>
          <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 flex-shrink-0", cfg.bg, cfg.text)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {lot.commodity_name}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-foreground">{lot.bag_count}</p>
        <p className="text-[10px] text-muted-foreground">bags</p>
      </div>
    </button>
  );
};

export default AuctionsPage;
