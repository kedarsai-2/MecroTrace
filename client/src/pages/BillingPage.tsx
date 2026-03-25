import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Receipt, Search, User, Package, Truck, Hash,
  Edit3, Lock, Unlock, Save, Printer, Plus, Trash2,
  Percent, FileText, ChevronDown, ChevronUp,
  History
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useAuctionResults } from '@/hooks/useAuctionResults';
import { commodityApi, printLogApi, weighingApi, billingApi, arrivalsApi } from '@/services/api';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';
import type { FullCommodityConfigDto } from '@/services/api/commodities';
import type { SalesBillDTO } from '@/services/api/billing';
import type { ArrivalDetail } from '@/services/api/arrivals';
import { directPrint } from '@/utils/printTemplates';
import { generateSalesBillPrintHTML } from '@/utils/printDocumentTemplates';

// ── Types ─────────────────────────────────────────────────
interface BuyerPurchase {
  buyerMark: string;
  buyerName: string;
  buyerContactId: string | null;
  entries: BillEntry[];
}

interface BillEntry {
  bidNumber: number;
  lotId: string;
  lotName: string;
  sellerName: string;
  commodityName: string;
  rate: number;
  quantity: number;
  weight: number;
  presetApplied: number;
  isSelfSale: boolean;
}

interface CommodityGroup {
  commodityName: string;
  hsnCode: string;
  gstRate: number;
  commissionPercent: number;
  userFeePercent: number;
  items: BillLineItem[];
  subtotal: number;
  commissionAmount: number;
  userFeeAmount: number;
  totalCharges: number;
}

interface BillLineItem {
  bidNumber: number;
  lotName: string;
  sellerName: string;
  quantity: number;
  weight: number;
  baseRate: number; // B = Auction bid
  presetApplied: number; // P = Preset
  brokerage: number; // BRK
  otherCharges: number; // Other (from preset or manual)
  newRate: number; // REQ-BIL-002: NR = B + P + BRK + Other
  amount: number;
}

interface BillData {
  billId: string;
  billNumber: string;
  buyerName: string;
  buyerMark: string;
  billingName: string;
  billDate: string;
  commodityGroups: CommodityGroup[];
  buyerCoolie: number;
  outboundFreight: number;
  outboundVehicle: string;
  discount: number;
  discountType: 'PERCENT' | 'AMOUNT';
  manualRoundOff: number;
  grandTotal: number;
  brokerageType: 'PERCENT' | 'AMOUNT';
  brokerageValue: number;
  globalOtherCharges: number;
  pendingBalance: number;
  versions: any[];
}

/** True if billId was issued by backend (numeric string). */
function isBackendBillId(billId: string): boolean {
  return /^\d+$/.test(billId);
}

/** Normalize bill from API: add presetApplied (derived) and gstRate to items/groups. */
function normalizeBillFromApi(b: any, fullConfigs?: FullCommodityConfigDto[], commodities?: any[]): BillData {
  const configByCommName = new Map<string, number>();
  if (fullConfigs && commodities) {
    commodities.forEach((c: any) => {
      const cfg = fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(c.commodity_id));
      const name = c.commodity_name ?? c.commodityName;
      if (name && cfg?.config?.gstRate != null) configByCommName.set(name, cfg.config.gstRate);
    });
  }
  const groups = (b.commodityGroups || []).map((g: any) => ({
    ...g,
    gstRate: g.gstRate ?? configByCommName.get(g.commodityName) ?? 0,
    items: (g.items || []).map((item: any) => {
      const base = Number(item.baseRate) || 0;
      const brk = Number(item.brokerage) || 0;
      const other = Number(item.otherCharges) || 0;
      const nr = Number(item.newRate) || 0;
      const preset = Math.max(0, nr - base - brk - other);
      return { ...item, presetApplied: item.presetApplied ?? preset };
    }),
  }));
  return { ...b, commodityGroups: groups };
}

// ── Validation ────────────────────────────────────────────
type ValidationErrors = Record<string, string>;

function validateBill(b: BillData): { isValid: boolean; errors: ValidationErrors } {
  const errors: ValidationErrors = {};

  const trimmedName = (b.billingName ?? '').trim();
  if (!trimmedName) {
    errors.billingName = 'Billing name is required';
  } else if (trimmedName.length < 2) {
    errors.billingName = 'Minimum 2 characters';
  } else if (trimmedName.length > 150) {
    errors.billingName = 'Maximum 150 characters';
  }

  const v = (b.outboundVehicle ?? '').trim();
  if (v.length > 0) {
    if (v.length < 2 || v.length > 12) {
      errors.outboundVehicle = 'Must be 2–12 characters';
    } else if (v !== v.toUpperCase()) {
      errors.outboundVehicle = 'Must be uppercase';
    }
  }

  if (!Number.isFinite(b.brokerageValue) || b.brokerageValue < 0) {
    errors.brokerageValue = 'Must be a positive number';
  } else if (b.brokerageType === 'PERCENT' && b.brokerageValue > 100) {
    errors.brokerageValue = 'Percent cannot exceed 100';
  } else if (b.brokerageType === 'AMOUNT' && b.brokerageValue > 10000000) {
    errors.brokerageValue = 'Cannot exceed ₹1,00,00,000';
  }

  if (!Number.isFinite(b.globalOtherCharges) || b.globalOtherCharges < 0) {
    errors.globalOtherCharges = 'Must be a positive number';
  } else if (b.globalOtherCharges > 100000) {
    errors.globalOtherCharges = 'Cannot exceed ₹1,00,000';
  }

  if (!Number.isFinite(b.buyerCoolie) || b.buyerCoolie < 0) {
    errors.buyerCoolie = 'Must be a positive number';
  } else if (b.buyerCoolie > 100000) {
    errors.buyerCoolie = 'Cannot exceed ₹1,00,000';
  }

  if (!Number.isFinite(b.outboundFreight) || b.outboundFreight < 0) {
    errors.outboundFreight = 'Must be a positive number';
  } else if (b.outboundFreight > 100000) {
    errors.outboundFreight = 'Cannot exceed ₹1,00,000';
  }

  if (!Number.isFinite(b.discount) || b.discount < 0) {
    errors.discount = 'Must be a positive number';
  } else if (b.discountType === 'PERCENT' && b.discount > 100) {
    errors.discount = 'Percent cannot exceed 100';
  } else if (b.discountType === 'AMOUNT' && b.discount > 100000) {
    errors.discount = 'Cannot exceed ₹1,00,000';
  }

  if (!Number.isFinite(b.manualRoundOff)) {
    errors.manualRoundOff = 'Must be a valid number';
  } else if (Math.abs(b.manualRoundOff) > 100000) {
    errors.manualRoundOff = 'Cannot exceed ±₹1,00,000';
  }

  b.commodityGroups.forEach((group, gi) => {
    group.items.forEach((item, ii) => {
      if (item.quantity < 1) {
        errors[`items.${gi}.${ii}.quantity`] = 'Quantity must be at least 1';
      }
      if (!item.weight || item.weight <= 0) {
        errors[`items.${gi}.${ii}.weight`] = 'Weight cannot be zero';
      }
      if (!Number.isFinite(item.brokerage) || item.brokerage < 0) {
        errors[`items.${gi}.${ii}.brokerage`] = 'Invalid';
      } else if (item.brokerage > 10000000) {
        errors[`items.${gi}.${ii}.brokerage`] = 'Too large';
      }
      if (!Number.isFinite(item.otherCharges) || item.otherCharges < 0) {
        errors[`items.${gi}.${ii}.otherCharges`] = 'Invalid';
      } else if (item.otherCharges > 10000) {
        errors[`items.${gi}.${ii}.otherCharges`] = 'Max ₹10,000';
      }
      if (item.newRate < 0.01 || item.newRate > 100000) {
        errors[`items.${gi}.${ii}.newRate`] = 'Rate out of range (0.01–1,00,000)';
      }
    });
  });

  return { isValid: Object.keys(errors).length === 0, errors };
}

const BillingPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { trader } = useAuth();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Billing');
  const [buyers, setBuyers] = useState<BuyerPurchase[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerPurchase | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Bill state
  const [bill, setBill] = useState<BillData | null>(null);
  const [editLocked, setEditLocked] = useState(true);
  const [showPrint, setShowPrint] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);

  const isBillingDirty = !!bill && !showPrint && !isBackendBillId(bill.billId);
  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isBillingDirty,
  });

  // Validation
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Search mode for bill search
  const [billSearchMode, setBillSearchMode] = useState<'buyer' | 'bill'>('buyer');
  const [savedBills, setSavedBills] = useState<SalesBillDTO[]>([]);
  const [savedBillsLoading, setSavedBillsLoading] = useState(false);
  const [commodities, setCommodities] = useState<any[]>([]);
  const [fullConfigs, setFullConfigs] = useState<FullCommodityConfigDto[]>([]);
  const [weighingSessions, setWeighingSessions] = useState<any[]>([]);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);

  const { auctionResults: auctionData } = useAuctionResults();

  useEffect(() => {
    commodityApi.list().then(setCommodities);
    commodityApi.getAllFullConfigs().then(setFullConfigs);
  }, []);

  useEffect(() => {
    weighingApi.list({ page: 0, size: 2000 }).then(setWeighingSessions).catch(() => setWeighingSessions([]));
  }, []);

  // Load arrival details for buyer/lot enrichment (seller name, lot name, commodity from arrivals API)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const all: ArrivalDetail[] = [];
      for (let page = 0; page < 20; page++) {
        const chunk = await arrivalsApi.listDetail(page, 100);
        if (chunk.length === 0) break;
        all.push(...chunk);
        if (chunk.length < 100) break;
      }
      if (!cancelled) setArrivalDetails(all);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load saved bills from backend
  const loadSavedBills = useCallback(async () => {
    setSavedBillsLoading(true);
    try {
      const page = await billingApi.getPage({ page: 0, size: 200, sort: 'billDate,desc' });
      setSavedBills(page.content ?? []);
    } catch {
      setSavedBills([]);
    } finally {
      setSavedBillsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (billSearchMode === 'bill') loadSavedBills();
  }, [billSearchMode, loadSavedBills]);

  // Load buyer data from completed auctions (arrivals from API; weighing from API)
  useEffect(() => {
    const buyerMap = new Map<string, BuyerPurchase>();

    auctionData.forEach((auction: any) => {
      let sellerName = auction.sellerName || 'Unknown';
      let lotName = auction.lotName || '';
      const commodityName = auction.commodityName || '';

      arrivalDetails.forEach((arr) => {
        (arr.sellers || []).forEach((seller) => {
          (seller.lots || []).forEach((lot) => {
            if (String(lot.id) === String(auction.lotId)) {
              sellerName = seller.sellerName;
              lotName = lot.lotName || lotName;
            }
          });
        });
      });

      (auction.entries || []).forEach((entry: any) => {
        if (entry.isSelfSale) return;

        const key = entry.buyerMark || entry.buyerName;
        if (!buyerMap.has(key)) {
          buyerMap.set(key, {
            buyerMark: entry.buyerMark,
            buyerName: entry.buyerName,
            buyerContactId: entry.buyerContactId ?? (entry.buyerId != null ? String(entry.buyerId) : null),
            entries: [],
          });
        }

        const ws = weighingSessions.find((s: any) => s.bid_number === entry.bidNumber);
        const weight = ws ? ws.net_weight : entry.quantity * 50;

        buyerMap.get(key)!.entries.push({
          bidNumber: entry.bidNumber,
          lotId: auction.lotId,
          lotName,
          sellerName,
          commodityName,
          rate: entry.rate,
          quantity: entry.quantity,
          weight,
          presetApplied: entry.presetApplied || 0,
          isSelfSale: false,
        });
      });
    });

    setBuyers(Array.from(buyerMap.values()));
  }, [auctionData, weighingSessions, arrivalDetails]);

  // Generate Bill (commodity config from API)
  const generateBill = useCallback((buyer: BuyerPurchase) => {
    setSelectedBuyer(buyer);
    const commodityMap = new Map<string, CommodityGroup>();

    buyer.entries.forEach(entry => {
      const commName = entry.commodityName || 'Unknown';
      if (!commodityMap.has(commName)) {
        const commodity = commodities.find((c: any) => c.commodity_name === commName);
        const fullCfg = commodity ? fullConfigs.find((f: FullCommodityConfigDto) => String(f.commodityId) === String(commodity.commodity_id)) : null;
        const config = fullCfg?.config;

        commodityMap.set(commName, {
          commodityName: commName,
          hsnCode: config?.hsnCode || '',
          gstRate: config?.gstRate ?? 0,
          commissionPercent: config?.commissionPercent || 0,
          userFeePercent: config?.userFeePercent || 0,
          items: [],
          subtotal: 0,
          commissionAmount: 0,
          userFeeAmount: 0,
          totalCharges: 0,
        });
      }

      const group = commodityMap.get(commName)!;
      
      // REQ-BIL-002: NR = B + P + BRK + Other Charges
      const brokerage = 0; // default, can be edited
      const otherCharges = 0; // default
      const presetApplied = entry.presetApplied ?? 0;
      const newRate = entry.rate + presetApplied + brokerage + otherCharges;

      group.items.push({
        bidNumber: entry.bidNumber,
        lotName: entry.lotName,
        sellerName: entry.sellerName,
        quantity: entry.quantity,
        weight: entry.weight,
        baseRate: entry.rate,
        presetApplied,
        brokerage,
        otherCharges,
        newRate,
        amount: newRate * entry.quantity,
      });
    });
    
    // Calculate per-commodity totals
    commodityMap.forEach(group => {
      group.subtotal = group.items.reduce((s, item) => s + item.amount, 0);
      // REQ-BIL-005: CA = BG × C%
      group.commissionAmount = Math.round(group.subtotal * group.commissionPercent / 100);
      // REQ-BIL-006: UFA = BG × UF%
      group.userFeeAmount = Math.round(group.subtotal * group.userFeePercent / 100);
      group.totalCharges = group.commissionAmount + group.userFeeAmount;
    });
    
    const commodityGroups = Array.from(commodityMap.values());
    const subtotalSum = commodityGroups.reduce((s, g) => s + g.subtotal + g.totalCharges, 0);
    
    // REQ-BIL-009: GT = Σ(Commodity Totals) + Additions - Discount + Manual Round OFF
    setBill({
      billId: crypto.randomUUID(),
      billNumber: '', // Generated on print (per SRS)
      buyerName: buyer.buyerName,
      buyerMark: buyer.buyerMark,
      billingName: buyer.buyerName,
      billDate: new Date().toISOString(),
      commodityGroups,
      buyerCoolie: 0,
      outboundFreight: 0,
      outboundVehicle: '',
      discount: 0,
      discountType: 'AMOUNT',
      manualRoundOff: 0,
      grandTotal: subtotalSum,
      brokerageType: 'AMOUNT',
      brokerageValue: 0,
      globalOtherCharges: 0,
      pendingBalance: subtotalSum,
      versions: [],
    });
    setEditLocked(false);
  }, [commodities, fullConfigs]);

  // Recalculate grand total
  const recalcGrandTotal = useCallback((b: BillData): BillData => {
    const subtotalSum = b.commodityGroups.reduce((s, g) => s + g.subtotal + g.totalCharges, 0);
    const additions = b.buyerCoolie + b.outboundFreight;
    let discountAmount = b.discount;
    if (b.discountType === 'PERCENT') {
      discountAmount = Math.round(subtotalSum * b.discount / 100);
    }
    const grandTotal = subtotalSum + additions - discountAmount + b.manualRoundOff;
    return { ...b, grandTotal, pendingBalance: grandTotal };
  }, []);

  // Update brokerage/charges on a line item
  const updateLineItem = (commIdx: number, itemIdx: number, field: 'brokerage' | 'otherCharges', value: number) => {
    if (!bill) return;
    const updated = { ...bill };
    const group = { ...updated.commodityGroups[commIdx] };
    const item = { ...group.items[itemIdx] };
    item[field] = value;
    const preset = (item as { presetApplied?: number }).presetApplied ?? 0;
    // REQ-BIL-002: NR = B + P + BRK + Other
    item.newRate = item.baseRate + preset + item.brokerage + item.otherCharges;
    item.amount = item.newRate * item.quantity;
    group.items = [...group.items];
    group.items[itemIdx] = item;
    group.subtotal = group.items.reduce((s, i) => s + i.amount, 0);
    group.commissionAmount = Math.round(group.subtotal * group.commissionPercent / 100);
    group.userFeeAmount = Math.round(group.subtotal * group.userFeePercent / 100);
    group.totalCharges = group.commissionAmount + group.userFeeAmount;
    updated.commodityGroups = [...updated.commodityGroups];
    updated.commodityGroups[commIdx] = group;
    setBill(recalcGrandTotal(updated));
  };

  // Apply global brokerage/charges to all items
  const applyGlobalCharges = () => {
    if (!bill) return;
    const updated = { ...bill };
    updated.commodityGroups = updated.commodityGroups.map(group => {
      const items = group.items.map(item => {
        const preset = item.presetApplied ?? 0;
        const brk = bill.brokerageType === 'PERCENT'
          ? Math.round((item.baseRate + preset) * bill.brokerageValue / 100)
          : bill.brokerageValue;
        const newItem = {
          ...item,
          brokerage: brk,
          otherCharges: bill.globalOtherCharges,
          newRate: item.baseRate + preset + brk + bill.globalOtherCharges,
          amount: 0,
        };
        newItem.amount = newItem.newRate * newItem.quantity;
        return newItem;
      });
      const subtotal = items.reduce((s, i) => s + i.amount, 0);
      return {
        ...group,
        items,
        subtotal,
        commissionAmount: Math.round(subtotal * group.commissionPercent / 100),
        userFeeAmount: Math.round(subtotal * group.userFeePercent / 100),
        totalCharges: Math.round(subtotal * group.commissionPercent / 100) + Math.round(subtotal * group.userFeePercent / 100),
      };
    });
    setBill(recalcGrandTotal(updated));
    toast.success('Global charges applied to all line items');
  };

  // Save bill (backend assigns bill number; vouchers created by backend when coolie/freight > 0)
  const saveBill = async () => {
    if (!bill) return;

    const { isValid, errors } = validateBill(bill);
    setValidationErrors(errors);
    if (!isValid) {
      const count = Object.keys(errors).length;
      toast.error(`Please fix ${count} validation ${count === 1 ? 'error' : 'errors'} before saving`);
      return;
    }

    const payload = {
      buyerName: bill.buyerName,
      buyerMark: bill.buyerMark,
      billingName: bill.billingName,
      billDate: typeof bill.billDate === 'string' ? bill.billDate : new Date(bill.billDate).toISOString(),
      commodityGroups: bill.commodityGroups,
      buyerCoolie: bill.buyerCoolie ?? 0,
      outboundFreight: bill.outboundFreight ?? 0,
      outboundVehicle: bill.outboundVehicle ?? '',
      discount: bill.discount ?? 0,
      discountType: bill.discountType ?? 'AMOUNT',
      manualRoundOff: bill.manualRoundOff ?? 0,
      grandTotal: bill.grandTotal,
      brokerageType: bill.brokerageType ?? 'AMOUNT',
      brokerageValue: bill.brokerageValue ?? 0,
      globalOtherCharges: bill.globalOtherCharges ?? 0,
      pendingBalance: bill.pendingBalance ?? bill.grandTotal,
    };
    if (!can('Billing', 'Create')) {
      toast.error('You do not have permission to save bills.');
      return;
    }
    try {
      const isUpdate = bill.billId && isBackendBillId(bill.billId);
      const result = isUpdate
        ? await billingApi.update(bill.billId, payload)
        : await billingApi.create(payload);
      setBill(normalizeBillFromApi(result, fullConfigs, commodities) as BillData);
      toast.success(`Bill ${result.billNumber} saved!`);
      setShowPrint(true);
      loadSavedBills();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save bill');
    }
  };

  const filteredBuyers = useMemo(() => {
    if (!searchQuery) return buyers;
    const q = searchQuery.toLowerCase();
    return buyers.filter(b =>
      b.buyerMark.toLowerCase().includes(q) ||
      b.buyerName.toLowerCase().includes(q)
    );
  }, [buyers, searchQuery]);

  // Search saved bills
  const filteredBills = useMemo(() => {
    if (!searchQuery) return savedBills;
    const q = searchQuery.toLowerCase();
    return savedBills.filter((b: any) =>
      b.buyerMark?.toLowerCase().includes(q) ||
      b.buyerName?.toLowerCase().includes(q) ||
      b.billNumber?.toLowerCase().includes(q) ||
      b.billingName?.toLowerCase().includes(q) ||
      b.outboundVehicle?.toLowerCase().includes(q)
    );
  }, [savedBills, searchQuery]);

  if (!canView) {
    return <ForbiddenPage moduleName="Billing" />;
  }

  // ═══ PRINT PREVIEW ═══
  if (showPrint && bill) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-indigo-400 via-blue-500 to-cyan-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-4 rounded-b-[2rem]">
          <div className="relative z-10 flex items-center gap-3">
            <button onClick={() => setShowPrint(false)}
              aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Printer className="w-5 h-5" /> Sales Bill Print
              </h1>
              <p className="text-white/70 text-xs">{bill.billNumber || 'Draft'}</p>
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
              <Printer className="w-5 h-5 text-indigo-500" /> Sales Bill Print
            </h2>
            <p className="text-sm text-muted-foreground">{bill.billNumber || 'Draft'}</p>
          </div>
        </div>
        )}

        <div className="px-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-4 font-mono text-xs space-y-2 shadow-lg">
            <div className="text-center border-b border-dashed border-border pb-2">
              <p className="font-bold text-sm text-foreground">MERCOTRACE</p>
              <p className="text-muted-foreground">Sales Bill (Buyer Invoice)</p>
              <p className="text-muted-foreground">{new Date(bill.billDate).toLocaleDateString()}</p>
            </div>

            <div className="border-b border-dashed border-border pb-2 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Bill No.</span><span className="font-bold text-foreground">{bill.billNumber || 'DRAFT'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span className="font-bold text-foreground">{bill.billingName} ({bill.buyerMark})</span></div>
              {bill.outboundVehicle && <div className="flex justify-between"><span className="text-muted-foreground">Out Vehicle</span><span className="font-bold text-foreground">{bill.outboundVehicle}</span></div>}
            </div>

            {/* Per-commodity tables — REQ-BIL-004 */}
            {bill.commodityGroups.map((group, gi) => (
              <div key={gi} className="border-b border-dashed border-border pb-2">
                <p className="font-bold text-foreground mb-1">{group.commodityName} {group.hsnCode && `(HSN: ${group.hsnCode})`}{(group.gstRate ?? 0) > 0 && ` · GST: ${group.gstRate}%`}</p>
                {group.items.map((item, ii) => (
                  <div key={ii} className="flex justify-between text-[10px]">
                    <span className="text-foreground">{item.quantity}×{item.weight.toFixed(0)}kg @₹{item.newRate}</span>
                    <span className="font-bold text-foreground">₹{item.amount.toLocaleString()}</span>
                  </div>
                ))}
                <div className="mt-1 pt-1 border-t border-dotted border-border/50 space-y-0.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="text-foreground">₹{group.subtotal.toLocaleString()}</span></div>
                  {group.commissionPercent > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Commission ({group.commissionPercent}%)</span><span className="text-foreground">₹{group.commissionAmount.toLocaleString()}</span></div>}
                  {group.userFeePercent > 0 && <div className="flex justify-between"><span className="text-muted-foreground">User Fee ({group.userFeePercent}%)</span><span className="text-foreground">₹{group.userFeeAmount.toLocaleString()}</span></div>}
                  {(group.gstRate ?? 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">GST ({group.gstRate}%)</span><span className="text-foreground">₹{Math.round(group.subtotal * (group.gstRate ?? 0) / 100).toLocaleString()}</span></div>}
                </div>
              </div>
            ))}

            {/* Additions */}
            {(bill.buyerCoolie > 0 || bill.outboundFreight > 0) && (
              <div className="border-b border-dashed border-border pb-2">
                <p className="font-bold text-foreground mb-1">ADDITIONS</p>
                {bill.buyerCoolie > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Buyer Coolie</span><span className="text-foreground">₹{bill.buyerCoolie.toLocaleString()}</span></div>}
                {bill.outboundFreight > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Outbound Freight</span><span className="text-foreground">₹{bill.outboundFreight.toLocaleString()}</span></div>}
              </div>
            )}

            {/* REQ-BIL-010: Cumulative tax table (Commission, User Fee, GST) */}
            <div className="border-b border-dashed border-border pb-2">
              <p className="font-bold text-foreground mb-1">TAX SUMMARY</p>
              {bill.commodityGroups.filter(g => g.commissionPercent > 0 || g.userFeePercent > 0 || (g.gstRate ?? 0) > 0).map((g, i) => (
                <div key={i} className="text-[10px] space-y-0.5">
                  <span className="text-muted-foreground">{g.commodityName}:</span>
                  {g.commissionPercent > 0 && <div className="flex justify-between pl-2"><span>Commission</span><span>₹{g.commissionAmount}</span></div>}
                  {g.userFeePercent > 0 && <div className="flex justify-between pl-2"><span>User Fee</span><span>₹{g.userFeeAmount}</span></div>}
                  {(g.gstRate ?? 0) > 0 && <div className="flex justify-between pl-2"><span>GST ({g.gstRate}%)</span><span>₹{Math.round(g.subtotal * (g.gstRate ?? 0) / 100).toLocaleString()}</span></div>}
                </div>
              ))}
            </div>

            {bill.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">−₹{bill.discountType === 'PERCENT' ? Math.round(bill.commodityGroups.reduce((s, g) => s + g.subtotal, 0) * bill.discount / 100) : bill.discount}</span></div>}
            {bill.manualRoundOff !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">Round Off</span><span className="text-foreground">{bill.manualRoundOff > 0 ? '+' : ''}₹{bill.manualRoundOff}</span></div>}

            <div className="flex justify-between text-sm border-t border-dashed border-border pt-2">
              <span className="font-bold text-foreground">GRAND TOTAL</span>
              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">₹{bill.grandTotal.toLocaleString()}</span>
            </div>

            <div className="text-center text-muted-foreground/70 text-[9px] border-t border-dashed border-border pt-2">
              <p>NR = B + P + BRK + Other</p>
              <p>GT = Σ(Commodity Totals) + Additions − Discount + Round Off</p>
            </div>

            <div className="text-center border-t border-dashed border-border pt-2">
              <p className="text-muted-foreground">--- END OF BILL ---</p>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={async () => {
              const printedAt = new Date().toISOString();
              try {
                await printLogApi.create({
                  reference_type: 'SALES_BILL',
                  reference_id: bill.billId,
                  print_type: 'SALES_BILL',
                  printed_at: printedAt,
                });
              } catch {
                // backend optional
              }
              const ok = await directPrint(generateSalesBillPrintHTML(bill), { mode: "system" });
              ok ? toast.success('Sales Bill sent to printer!') : toast.error('Printer not connected.');
            }}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold shadow-lg">
              <Printer className="w-5 h-5 mr-2" /> Print Bill
            </Button>
            <Button
              onClick={() => {
                void (async () => {
                  const ok = await confirmIfDirty();
                  if (!ok) return;
                  setShowPrint(false);
                  setBill(null);
                  setSelectedBuyer(null);
                })();
              }}
              variant="outline" className="h-12 rounded-xl px-6">
              Done
            </Button>
          </div>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ BILL DETAIL SCREEN ═══
  if (selectedBuyer && bill) {
    const totalItems = bill.commodityGroups.reduce((s, g) => s + g.items.length, 0);

    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
        {!isDesktop ? (
        <div className="bg-gradient-to-br from-indigo-400 via-blue-500 to-cyan-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
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
               <button
                 onClick={() => {
                   void (async () => {
                     const ok = await confirmIfDirty();
                     if (!ok) return;
                     setSelectedBuyer(null);
                     setBill(null);
                   })();
                 }}
                aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5" /> Sales Bill
                </h1>
                <p className="text-white/70 text-xs">{bill.billNumber || 'New Bill'} · {totalItems} item(s)</p>
              </div>
              <button onClick={() => setShowPaymentHistory(!showPaymentHistory)}
                className="px-2.5 py-1.5 rounded-xl bg-white/15 text-white/80 text-[10px] font-bold flex items-center gap-1">
                <History className="w-3 h-3" /> History
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/15 backdrop-blur-md rounded-xl p-2 text-center">
                <User className="w-3.5 h-3.5 text-white/70 mx-auto mb-0.5" />
                <p className="text-[9px] text-white/60 uppercase">Buyer</p>
                <p className="text-[11px] font-semibold text-white truncate">{bill.buyerMark}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-md rounded-xl p-2 text-center">
                <Package className="w-3.5 h-3.5 text-white/70 mx-auto mb-0.5" />
                <p className="text-[9px] text-white/60 uppercase">Items</p>
                <p className="text-[11px] font-semibold text-white">{totalItems}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-md rounded-xl p-2 text-center">
                <p className="text-base font-bold text-white/90 mb-0.5">₹</p>
                <p className="text-[9px] text-white/60 uppercase">Total</p>
                <p className="text-[11px] font-semibold text-white">₹{bill.grandTotal.toLocaleString()}</p>
              </div>
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
                  setSelectedBuyer(null);
                  setBill(null);
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
                <Receipt className="w-5 h-5 text-indigo-500" /> Sales Bill — {bill.buyerMark}
              </h2>
              <p className="text-sm text-muted-foreground">{bill.billNumber || 'New Bill'} · {totalItems} item(s) · ₹{bill.grandTotal.toLocaleString()}</p>
            </div>
            <button onClick={() => setShowPaymentHistory(!showPaymentHistory)}
              className="px-3 py-1.5 rounded-xl bg-muted/50 text-muted-foreground text-xs font-bold flex items-center gap-1.5 hover:bg-muted transition-all">
              <History className="w-3.5 h-3.5" /> History
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-indigo-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Buyer</p>
              <p className="text-lg font-black text-foreground">{bill.buyerName} ({bill.buyerMark})</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-blue-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Items</p>
              <p className="text-lg font-black text-foreground">{totalItems}</p>
            </div>
            <div className="glass-card rounded-2xl p-4 border-l-4 border-l-emerald-500">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Grand Total</p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">₹{bill.grandTotal.toLocaleString()}</p>
            </div>
          </div>
        </div>
        )}

        <div className="px-4 mt-4 space-y-3">
          {/* Billing Name text box */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Billing Name (appears on print) <span className="text-destructive">*</span></p>
            <Input value={bill.billingName}
              onChange={e => { setBill({ ...bill, billingName: e.target.value }); setValidationErrors(prev => { const n = { ...prev }; delete n.billingName; return n; }); }}
              className={cn("h-10 rounded-xl text-sm font-medium bg-muted/20 border-border/30", validationErrors.billingName && "border-destructive ring-1 ring-destructive/30")} />
            {validationErrors.billingName && <p className="text-[10px] text-destructive mt-1">{validationErrors.billingName}</p>}
          </motion.div>

          {/* Global Brokerage & Other Charges — Apply to all */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="glass-card rounded-2xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Global Charges (Apply to All Items)</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <p className="text-[9px] text-muted-foreground mb-0.5">Brokerage</p>
                <div className="flex gap-1">
                  <button onClick={() => setBill({ ...bill, brokerageType: bill.brokerageType === 'PERCENT' ? 'AMOUNT' : 'PERCENT' })}
                    className="px-2 py-1.5 rounded-lg bg-muted/30 text-[10px] font-bold text-muted-foreground">
                    {bill.brokerageType === 'PERCENT' ? '%' : '₹'}
                  </button>
                  <Input type="number" value={bill.brokerageValue || ''}
                    onChange={e => { setBill({ ...bill, brokerageValue: parseFloat(e.target.value) || 0 }); setValidationErrors(prev => { const n = { ...prev }; delete n.brokerageValue; return n; }); }}
                    className={cn("h-8 rounded-lg text-xs text-center font-bold bg-muted/10 flex-1", validationErrors.brokerageValue && "border-destructive ring-1 ring-destructive/30")} />
                </div>
                {validationErrors.brokerageValue && <p className="text-[9px] text-destructive mt-0.5">{validationErrors.brokerageValue}</p>}
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground mb-0.5">Other Charges (₹)</p>
                <Input type="number" value={bill.globalOtherCharges || ''}
                  onChange={e => { setBill({ ...bill, globalOtherCharges: parseFloat(e.target.value) || 0 }); setValidationErrors(prev => { const n = { ...prev }; delete n.globalOtherCharges; return n; }); }}
                  className={cn("h-8 rounded-lg text-xs text-center font-bold bg-muted/10", validationErrors.globalOtherCharges && "border-destructive ring-1 ring-destructive/30")} />
                {validationErrors.globalOtherCharges && <p className="text-[9px] text-destructive mt-0.5">{validationErrors.globalOtherCharges}</p>}
              </div>
            </div>
            <Button onClick={applyGlobalCharges} size="sm"
              className="w-full h-9 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white text-xs font-bold">
              Apply to All Line Items
            </Button>
          </motion.div>

          {/* Per-commodity breakdown — REQ-BIL-004 */}
          {bill.commodityGroups.map((group, gi) => (
            <motion.div key={gi} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + gi * 0.05 }}
              className="glass-card rounded-2xl overflow-hidden">
              <div className="p-3 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border-b border-border/30">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-sm font-bold text-foreground">{group.commodityName}</p>
                  <div className="flex gap-1.5">
                    {group.hsnCode && <span className="px-2 py-0.5 rounded bg-muted/40 text-[9px] font-bold text-muted-foreground">HSN: {group.hsnCode}</span>}
                    {(group.gstRate ?? 0) > 0 && <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-[9px] font-bold text-amber-800 dark:text-amber-200">GST: {group.gstRate}%</span>}
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-2">
                {group.items.map((item, ii) => (
                  <div key={ii} className="p-2.5 rounded-xl bg-muted/15 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-foreground">Bid #{item.bidNumber} · {item.lotName}</p>
                        <p className="text-[10px] text-muted-foreground">{item.sellerName} · {item.quantity} bags · {item.weight.toFixed(0)}kg</p>
                      </div>
                      <p className="text-sm font-bold text-foreground">₹{item.amount.toLocaleString()}</p>
                    </div>
                    <div className={cn("grid gap-1 text-[9px]", (item.presetApplied ?? 0) > 0 ? 'grid-cols-5' : 'grid-cols-4')}>
                      <div className="text-center p-1 rounded bg-muted/20">
                        <p className="text-muted-foreground">Base</p>
                        <p className="font-bold text-foreground">₹{item.baseRate}</p>
                      </div>
                      {(item.presetApplied ?? 0) > 0 && (
                        <div className="text-center p-1 rounded bg-amber-100/50 dark:bg-amber-900/20">
                          <p className="text-muted-foreground">Preset</p>
                          <p className="font-bold text-amber-700 dark:text-amber-300">₹{item.presetApplied}</p>
                        </div>
                      )}
                      <div className={cn("text-center p-1 rounded bg-muted/20", validationErrors[`items.${gi}.${ii}.brokerage`] && "ring-1 ring-destructive/40")}>
                        <p className="text-muted-foreground">BRK</p>
                        <Input type="number" value={item.brokerage || ''}
                          onChange={e => { updateLineItem(gi, ii, 'brokerage', parseFloat(e.target.value) || 0); setValidationErrors(prev => { const n = { ...prev }; delete n[`items.${gi}.${ii}.brokerage`]; return n; }); }}
                          className="h-5 text-[9px] text-center p-0 border-0 bg-transparent font-bold" />
                        {validationErrors[`items.${gi}.${ii}.brokerage`] && <p className="text-[7px] text-destructive">{validationErrors[`items.${gi}.${ii}.brokerage`]}</p>}
                      </div>
                      <div className={cn("text-center p-1 rounded bg-muted/20", validationErrors[`items.${gi}.${ii}.otherCharges`] && "ring-1 ring-destructive/40")}>
                        <p className="text-muted-foreground">Other</p>
                        <Input type="number" value={item.otherCharges || ''}
                          onChange={e => { updateLineItem(gi, ii, 'otherCharges', parseFloat(e.target.value) || 0); setValidationErrors(prev => { const n = { ...prev }; delete n[`items.${gi}.${ii}.otherCharges`]; return n; }); }}
                          className="h-5 text-[9px] text-center p-0 border-0 bg-transparent font-bold" />
                        {validationErrors[`items.${gi}.${ii}.otherCharges`] && <p className="text-[7px] text-destructive">{validationErrors[`items.${gi}.${ii}.otherCharges`]}</p>}
                      </div>
                      <div className={cn("text-center p-1 rounded bg-primary/10", validationErrors[`items.${gi}.${ii}.newRate`] && "ring-1 ring-destructive/40")}>
                        <p className="text-primary text-[8px]">New Rate</p>
                        <p className={cn("font-bold", validationErrors[`items.${gi}.${ii}.newRate`] ? "text-destructive" : "text-primary")}>₹{item.newRate}</p>
                        {validationErrors[`items.${gi}.${ii}.newRate`] && <p className="text-[7px] text-destructive">{validationErrors[`items.${gi}.${ii}.newRate`]}</p>}
                      </div>
                    </div>
                    {(validationErrors[`items.${gi}.${ii}.quantity`] || validationErrors[`items.${gi}.${ii}.weight`]) && (
                      <p className="text-[8px] text-destructive">{validationErrors[`items.${gi}.${ii}.quantity`] || validationErrors[`items.${gi}.${ii}.weight`]}</p>
                    )}
                  </div>
                ))}
                {/* Commodity subtotals */}
                <div className="pt-2 border-t border-border/30 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-bold text-foreground">₹{group.subtotal.toLocaleString()}</span>
                  </div>
                  {group.commissionPercent > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commission ({group.commissionPercent}%)</span>
                      <span className="text-foreground">₹{group.commissionAmount.toLocaleString()}</span>
                    </div>
                  )}
                  {group.userFeePercent > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">User Fee ({group.userFeePercent}%)</span>
                      <span className="text-foreground">₹{group.userFeeAmount.toLocaleString()}</span>
                    </div>
                  )}
                  {(group.gstRate ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST ({group.gstRate}%)</span>
                      <span className="text-foreground">₹{Math.round(group.subtotal * (group.gstRate ?? 0) / 100).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Additions Panel */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="glass-card rounded-2xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Additions</p>
            <div className="space-y-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-foreground flex-1">Buyer Coolie (Rate × Qty)</p>
                  <Input type="number" value={bill.buyerCoolie || ''}
                    onChange={e => { setBill(recalcGrandTotal({ ...bill, buyerCoolie: parseInt(e.target.value) || 0 })); setValidationErrors(prev => { const n = { ...prev }; delete n.buyerCoolie; return n; }); }}
                    className={cn("h-8 w-24 rounded-lg text-right text-xs font-bold bg-muted/10", validationErrors.buyerCoolie && "border-destructive ring-1 ring-destructive/30")} />
                </div>
                {validationErrors.buyerCoolie && <p className="text-[9px] text-destructive text-right mt-0.5">{validationErrors.buyerCoolie}</p>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-foreground flex-1">Outbound Freight</p>
                  <Input type="number" value={bill.outboundFreight || ''}
                    onChange={e => { setBill(recalcGrandTotal({ ...bill, outboundFreight: parseInt(e.target.value) || 0 })); setValidationErrors(prev => { const n = { ...prev }; delete n.outboundFreight; return n; }); }}
                    className={cn("h-8 w-24 rounded-lg text-right text-xs font-bold bg-muted/10", validationErrors.outboundFreight && "border-destructive ring-1 ring-destructive/30")} />
                </div>
                {validationErrors.outboundFreight && <p className="text-[9px] text-destructive text-right mt-0.5">{validationErrors.outboundFreight}</p>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-foreground flex-1">Outbound Vehicle #</p>
                  <Input value={bill.outboundVehicle}
                    onChange={e => { setBill({ ...bill, outboundVehicle: e.target.value }); setValidationErrors(prev => { const n = { ...prev }; delete n.outboundVehicle; return n; }); }}
                    placeholder="MH-12-XX-1234"
                    className={cn("h-8 w-32 rounded-lg text-right text-xs font-bold bg-muted/10", validationErrors.outboundVehicle && "border-destructive ring-1 ring-destructive/30")} />
                </div>
                {validationErrors.outboundVehicle && <p className="text-[9px] text-destructive text-right mt-0.5">{validationErrors.outboundVehicle}</p>}
              </div>
            </div>
          </motion.div>

          {/* Discount & Round Off — REQ-BIL-009 */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="glass-card rounded-2xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Discount & Adjustments</p>
            <div className="space-y-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-foreground flex-1">Discount</p>
                  <button onClick={() => setBill({ ...bill, discountType: bill.discountType === 'PERCENT' ? 'AMOUNT' : 'PERCENT' })}
                    className="px-2 py-1 rounded-lg bg-muted/30 text-[10px] font-bold text-muted-foreground">
                    {bill.discountType === 'PERCENT' ? '%' : '₹'}
                  </button>
                  <Input type="number" value={bill.discount || ''}
                    onChange={e => { setBill(recalcGrandTotal({ ...bill, discount: parseFloat(e.target.value) || 0 })); setValidationErrors(prev => { const n = { ...prev }; delete n.discount; return n; }); }}
                    className={cn("h-8 w-20 rounded-lg text-right text-xs font-bold bg-muted/10", validationErrors.discount && "border-destructive ring-1 ring-destructive/30")} />
                </div>
                {validationErrors.discount && <p className="text-[9px] text-destructive text-right mt-0.5">{validationErrors.discount}</p>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-foreground flex-1">Manual Round Off</p>
                  <Input type="number" value={bill.manualRoundOff || ''}
                    onChange={e => { setBill(recalcGrandTotal({ ...bill, manualRoundOff: parseFloat(e.target.value) || 0 })); setValidationErrors(prev => { const n = { ...prev }; delete n.manualRoundOff; return n; }); }}
                    className={cn("h-8 w-24 rounded-lg text-right text-xs font-bold bg-muted/10", validationErrors.manualRoundOff && "border-destructive ring-1 ring-destructive/30")}
                    placeholder="±" />
                </div>
                {validationErrors.manualRoundOff && <p className="text-[9px] text-destructive text-right mt-0.5">{validationErrors.manualRoundOff}</p>}
              </div>
            </div>
          </motion.div>

          {/* Grand Total Footer — REQ-BIL-009 */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="glass-card rounded-2xl p-4 border-2 border-emerald-500/30">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Commodity Totals</span>
                <span className="font-bold text-foreground">
                  ₹{bill.commodityGroups.reduce((s, g) => s + g.subtotal + g.totalCharges, 0).toLocaleString()}
                </span>
              </div>
              {(bill.buyerCoolie > 0 || bill.outboundFreight > 0) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ Additions</span>
                  <span className="text-foreground">₹{(bill.buyerCoolie + bill.outboundFreight).toLocaleString()}</span>
                </div>
              )}
              {bill.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">− Discount</span>
                  <span className="text-destructive">
                    −₹{bill.discountType === 'PERCENT'
                      ? Math.round(bill.commodityGroups.reduce((s, g) => s + g.subtotal, 0) * bill.discount / 100).toLocaleString()
                      : bill.discount.toLocaleString()}
                  </span>
                </div>
              )}
              {bill.manualRoundOff !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Round Off</span>
                  <span className="text-foreground">{bill.manualRoundOff > 0 ? '+' : ''}₹{bill.manualRoundOff}</span>
                </div>
              )}
              <div className="flex justify-between text-lg border-t border-border/50 pt-2">
                <span className="font-bold text-foreground">Grand Total</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">₹{bill.grandTotal.toLocaleString()}</span>
              </div>
              <p className="text-[9px] text-muted-foreground text-center">GT = Σ(Commodity) + Additions − Discount + Round Off</p>
            </div>

            {bill.pendingBalance > 0 && (
              <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-400/20">
                <div className="flex justify-between text-xs">
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">Pending Balance</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">₹{bill.pendingBalance.toLocaleString()}</span>
                </div>
              </div>
            )}

            <Button onClick={saveBill}
              className="w-full mt-4 h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold text-base shadow-lg">
              <Save className="w-5 h-5 mr-2" /> Generate Bill & Print
            </Button>
          </motion.div>

          {/* Payment History (toggle) */}
          <AnimatePresence>
            {showPaymentHistory && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="glass-card rounded-2xl p-3 overflow-hidden">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment History</p>
                <p className="text-xs text-muted-foreground text-center py-4">No payments recorded yet</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!isDesktop && <BottomNav />}
      </div>
    );
  }

  // ═══ BUYER LIST / BILL SEARCH ═══
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      <UnsavedChangesDialog />
      {!isDesktop ? (
      <div className="bg-gradient-to-br from-indigo-400 via-blue-500 to-cyan-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
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
                <span className="text-xl font-black">₹</span> Billing (Sales Bill)
              </h1>
              <p className="text-white/70 text-xs mt-0.5">{buyers.length} buyers · Invoicing & bill generation</p>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <button onClick={() => setBillSearchMode('buyer')}
              className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                billSearchMode === 'buyer'
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                  : 'bg-white/10 text-white/70 hover:text-white')}>
              <User className="w-4 h-4" /> New Bill
            </button>
            <button onClick={() => setBillSearchMode('bill')}
              className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                billSearchMode === 'bill'
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                  : 'bg-white/10 text-white/70 hover:text-white')}>
              <FileText className="w-4 h-4" /> Saved Bills
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input aria-label="Search" placeholder={billSearchMode === 'buyer' ? 'Search buyer mark, name…' : 'Search bill #, mark, vehicle…'}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30" />
          </div>
        </div>
      </div>
      ) : (
      <div className="px-8 py-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <span className="text-xl font-black text-indigo-500">₹</span> Billing (Sales Bill)
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{buyers.length} buyers · Invoicing & bill generation</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex gap-2">
            <button onClick={() => setBillSearchMode('buyer')}
              className={cn("px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all",
                billSearchMode === 'buyer' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md' : 'glass-card text-muted-foreground hover:text-foreground')}>
              <User className="w-4 h-4" /> New Bill
            </button>
            <button onClick={() => setBillSearchMode('bill')}
              className={cn("px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all",
                billSearchMode === 'bill' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md' : 'glass-card text-muted-foreground hover:text-foreground')}>
              <FileText className="w-4 h-4" /> Saved Bills
            </button>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input aria-label="Search" placeholder={billSearchMode === 'buyer' ? 'Search buyer mark, name…' : 'Search bill #, mark, vehicle…'}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50" />
          </div>
        </div>
      </div>
      )}

      <div className="px-4 mt-4 space-y-2">
        {billSearchMode === 'buyer' ? (
          // New bill — buyer list
          filteredBuyers.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">
                {buyers.length === 0 ? 'No buyer purchases found' : 'No matching buyers'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {buyers.length === 0 ? 'Complete auctions first to generate bills' : 'Try a different search'}
              </p>
              {buyers.length === 0 && (
                <Button onClick={() => navigate('/auctions')} className="mt-4 bg-gradient-to-r from-indigo-500 to-blue-500 text-white rounded-xl">
                  Go to Auctions
                </Button>
              )}
            </div>
          ) : (
            filteredBuyers.map((buyer, i) => {
              const totalQty = buyer.entries.reduce((s, e) => s + e.quantity, 0);
              const totalAmount = buyer.entries.reduce((s, e) => s + (e.rate * e.quantity), 0);
              const commodities = [...new Set(buyer.entries.map(e => e.commodityName))];
              return (
                <motion.button key={buyer.buyerMark + i}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => generateBill(buyer)}
                  className="w-full glass-card rounded-2xl p-4 text-left hover:shadow-lg transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-md flex-shrink-0">
                      <span className="text-white font-black text-sm">{buyer.buyerMark}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{buyer.buyerName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{totalQty} bags</span>
                        <span>•</span>
                        <span>{buyer.entries.length} bid(s)</span>
                        <span>•</span>
                        <span>{commodities.join(', ')}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-foreground">₹{totalAmount.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">est. total</p>
                    </div>
                  </div>
                </motion.button>
              );
            })
          )
        ) : (
          // Saved bills search — REQ-BIL searchable
          filteredBills.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No saved bills found</p>
            </div>
          ) : (
            filteredBills.map((b: any, i: number) => (
              <motion.button key={b.billId}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => {
                  setSelectedBuyer({ buyerMark: b.buyerMark, buyerName: b.buyerName, buyerContactId: null, entries: [] });
                  setBill(normalizeBillFromApi(b, fullConfigs, commodities));
                }}
                className="w-full glass-card rounded-2xl p-4 text-left hover:shadow-lg transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-md flex-shrink-0">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{b.billNumber}</p>
                    <p className="text-xs text-muted-foreground">{b.billingName} ({b.buyerMark})</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">₹{b.grandTotal?.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(b.billDate).toLocaleDateString()}</p>
                  </div>
                </div>
              </motion.button>
            ))
          )
        )}
      </div>
      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default BillingPage;
