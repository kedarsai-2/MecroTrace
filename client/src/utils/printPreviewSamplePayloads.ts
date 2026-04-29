/**
 * Sample payloads for PrintsPage preview — same shapes as BillingPage / SettlementPage
 * feed into printDocumentTemplates (single source of truth for HTML).
 */
import type { ArrivalDetail } from '@/services/api/arrivals';
import type { BillPrintData, BillPrintFirmInfo, PattiPrintData } from '@/utils/printDocumentTemplates';
import { effectiveGstPercent, gstOnSubtotal, percentOfAmount, roundMoney2 } from '@/utils/billingMoney';
import type { BidInfo } from '@/utils/printTemplates';

/** Structural twin of `FirmInfo` from printPreviewTemplates (avoid circular imports). */
export type PrintPreviewFirmInput = {
  name: string;
  about: string;
  address: string;
  apmcCode: string;
  phone: string;
  email: string;
  gstin: string;
  bank: { name: string; acc: string; ifsc: string; branch: string };
};

export type SampleLotRow = {
  lot_name: string;
  lot_no: string;
  seller: string;
  vehicle: string;
  qty: number;
  rate?: number;
  weight?: number;
};

export function flattenArrivalDetailsToSampleLots(details: ArrivalDetail[]): SampleLotRow[] {
  const out: SampleLotRow[] = [];
  details.forEach((arr) => {
    (arr.sellers || []).forEach((seller) => {
      (seller.lots || []).forEach((lot) => {
        out.push({
          lot_name: lot.lotName || 'Lot',
          lot_no: String(lot.id),
          seller: seller.sellerName || 'Seller',
          vehicle: arr.vehicleNumber || 'MH-12-XX-0000',
          qty: 0,
        });
      });
    });
  });
  return out;
}

export function resolveSampleLots(details: ArrivalDetail[]): SampleLotRow[] {
  const flatLots = flattenArrivalDetailsToSampleLots(details);
  if (flatLots.length > 0) {
    return flatLots.slice(0, 5).map((l) => ({ ...l, qty: l.qty || 10 }));
  }
  return [
    { lot_name: 'Onion A-Grade', lot_no: 'ONI/001/26', seller: 'Ramesh Kumar', vehicle: 'MH-12-AB-1234', qty: 30, rate: 825, weight: 1500 },
    { lot_name: 'Onion B-Grade', lot_no: 'ONI/002/26', seller: 'Suresh Patil', vehicle: 'MH-14-CD-5678', qty: 25, rate: 805, weight: 1250 },
    { lot_name: 'Tomato Fresh', lot_no: 'TOM/003/26', seller: 'Ramesh Kumar', vehicle: 'MH-12-AB-1234', qty: 20, rate: 600, weight: 1000 },
  ];
}

/** Same `BidInfo` shape as LogisticsPage → `printTemplates` (vehicle totals mirror live aggregation). */
export function buildSampleBidInfosForLogisticsPrints(details: ArrivalDetail[]): BidInfo[] {
  const sampleLots = resolveSampleLots(details);
  const vehicleTotals = new Map<string, number>();
  const vehicleSellerTotals = new Map<string, number>();
  sampleLots.forEach((l) => {
    const vKey = l.vehicle || '';
    const qty = Number(l.qty) || 0;
    vehicleTotals.set(vKey, (vehicleTotals.get(vKey) ?? 0) + qty);
    const vsKey = `${vKey}||${l.seller || ''}`;
    vehicleSellerTotals.set(vsKey, (vehicleSellerTotals.get(vsKey) ?? 0) + qty);
  });

  const sellerOrder: string[] = [];
  sampleLots.forEach((l) => {
    const s = l.seller || 'Seller';
    if (!sellerOrder.includes(s)) sellerOrder.push(s);
  });
  const sellerSerialByName = new Map<string, number>();
  sellerOrder.forEach((name, i) => sellerSerialByName.set(name, i + 1));

  return sampleLots.map((l, idx) => {
    const vKey = l.vehicle || '';
    const vsKey = `${vKey}||${l.seller || ''}`;
    const qty = Number(l.qty) || 0;
    const sellerName = l.seller || 'Seller';
    const lotNoRaw = String(l.lot_no ?? '').trim();
    const lotNumParsed = /^\d+$/.test(lotNoRaw) ? Number(lotNoRaw) : NaN;
    const lotNumber = Number.isFinite(lotNumParsed) && lotNumParsed > 0 ? lotNumParsed : idx + 1;
    return {
      bidNumber: idx + 1,
      buyerMark: 'VT',
      buyerName: 'Vijay Traders',
      quantity: qty,
      vehicleMark: `V${idx + 1}`,
      sellerMark: `S${idx + 1}`,
      vehicleTotalQty: vehicleTotals.get(vKey) ?? qty,
      sellerVehicleQty: vehicleSellerTotals.get(vsKey) ?? qty,
      rate: Number(l.rate) > 0 ? Number(l.rate) : 800,
      lotId: lotNoRaw || String(idx + 1),
      lotName: l.lot_name || 'Lot',
      sellerName,
      sellerSerial: sellerSerialByName.get(sellerName) ?? 1,
      lotNumber,
      vehicleNumber: l.vehicle || 'MH-12-AB-1234',
      commodityName: l.lot_name || 'Commodity',
      origin: 'Nashik',
      godown: 'A1',
    };
  });
}

/** When arrivals yield no lots — still preview sticker/chiti/dispatch with stable demo bids. */
export const FALLBACK_LOGISTICS_PREVIEW_BID: BidInfo = {
  bidNumber: 1,
  buyerMark: 'VT',
  buyerName: 'Vijay Traders',
  quantity: 110,
  vehicleMark: 'AB',
  sellerMark: 'SA',
  vehicleTotalQty: 320,
  sellerVehicleQty: 110,
  rate: 825,
  lotId: 'demo-1',
  lotName: '110',
  sellerName: 'Ramesh Kumar',
  sellerSerial: 1,
  lotNumber: 110,
  vehicleNumber: 'MH-12-AB-1234',
  commodityName: 'Onion A-Grade',
  origin: 'Nashik',
  godown: 'A1',
};

export function firmInputToBillPrintFirm(f: PrintPreviewFirmInput): BillPrintFirmInfo {
  return {
    businessName: f.name,
    category: f.about,
    address: f.address,
    gstNumber: f.gstin,
    mobile: f.phone,
    email: f.email,
    bankName: f.bank.name,
    bankAccount: f.bank.acc,
    bankIfsc: f.bank.ifsc,
    bankBranch: f.bank.branch,
    rmcApmcCode: f.apmcCode,
  };
}

function recalcSampleBillGrandTotal(b: BillPrintData): BillPrintData {
  const commodityGroups = b.commodityGroups.map((group) => {
    const next = { ...group };
    const sub = roundMoney2(next.subtotal);
    const commissionAmount = percentOfAmount(sub, next.commissionPercent || 0);
    const userFeeAmount = percentOfAmount(sub, next.userFeePercent || 0);
    const gstAmount = gstOnSubtotal(sub, effectiveGstPercent(next));
    next.commissionAmount = commissionAmount;
    next.userFeeAmount = userFeeAmount;
    next.totalCharges = roundMoney2(commissionAmount + userFeeAmount + gstAmount);
    return next;
  });

  let grandTotal = 0;
  commodityGroups.forEach((group) => {
    const subtotalWithCharges = roundMoney2(group.subtotal + group.totalCharges);
    const additionsSum = roundMoney2((group.coolieAmount || 0) + (group.weighmanChargeAmount || 0));
    let discountAmount = roundMoney2(group.discount || 0);
    if (group.discountType === 'PERCENT') {
      discountAmount = percentOfAmount(subtotalWithCharges, discountAmount);
    }
    const commodityTotal = roundMoney2(
      subtotalWithCharges + additionsSum - discountAmount + roundMoney2(group.manualRoundOff || 0),
    );
    grandTotal = roundMoney2(grandTotal + commodityTotal);
  });
  grandTotal = roundMoney2(grandTotal + roundMoney2(b.outboundFreight || 0));

  return { ...b, commodityGroups, grandTotal };
}

export function buildSampleBillPrintData(
  arrivalDetails: ArrivalDetail[],
  firm: PrintPreviewFirmInput,
  mode: 'gst' | 'nongst',
): BillPrintData {
  const sampleLots = resolveSampleLots(arrivalDetails);
  const divisor = 50;
  const firmObj = firmInputToBillPrintFirm(firm);

  const items = sampleLots.map((l, idx) => {
    const qty = Number(l.qty) || 0;
    const weight = roundMoney2(Number(l.weight) > 0 ? Number(l.weight) : qty * divisor);
    const newRate = roundMoney2(Number(l.rate) || 800);
    const amount = roundMoney2((weight * newRate) / divisor);
    return {
      bidNumber: idx + 1,
      lotName: l.lot_name,
      lotTotalQty: qty,
      vehicleTotalQty: qty,
      sellerVehicleQty: qty,
      vehicleMark: `V${idx + 1}`,
      sellerMark: `S${idx + 1}`,
      sellerName: l.seller,
      quantity: qty,
      weight,
      baseRate: newRate,
      presetApplied: 0,
      brokerage: 0,
      otherCharges: 0,
      sellerOtherCharges: 0,
      newRate,
      amount,
      tokenAdvance: 0,
    };
  });

  const subtotal = roundMoney2(items.reduce((s, i) => s + i.amount, 0));
  const totalQty = roundMoney2(items.reduce((s, i) => s + i.quantity, 0));
  const firstCommodity = sampleLots[0]?.lot_name || 'Onion A-Grade';

  const isGst = mode === 'gst';
  const group = {
    commodityName: firstCommodity,
    hsnCode: '07031019',
    taxMode: (isGst ? 'GST' : 'NONE') as 'GST' | 'IGST' | 'NONE',
    gstRate: 0,
    sgstRate: isGst ? 2.5 : 0,
    cgstRate: isGst ? 2.5 : 0,
    igstRate: 0,
    divisor,
    commissionPercent: 5,
    userFeePercent: 2,
    coolieRate: 20,
    coolieAmount: roundMoney2(totalQty * 20),
    weighmanChargeRate: 0,
    weighmanChargeAmount: 0,
    discount: 0,
    discountType: 'AMOUNT' as const,
    manualRoundOff: 0,
    items,
    subtotal,
    commissionAmount: 0,
    userFeeAmount: 0,
    totalCharges: 0,
  };

  const base: BillPrintData = {
    billId: 'preview',
    billNumber: isGst ? 'GST-2026-PREV' : 'BIL-2026-PREV',
    buyerName: 'Vijay Traders',
    buyerMark: 'VT',
    billingName: 'Vijay Traders',
    billDate: new Date().toISOString(),
    buyerPhone: '+91 98765 11111',
    buyerAddress: 'Shop 42, Market Area',
    buyerEmail: '',
    buyerGstin: '',
    outboundVehicle: sampleLots[0]?.vehicle || 'MH-12-AB-1234',
    firm: firmObj,
    commodityGroups: [group],
    outboundFreight: 0,
    grandTotal: 0,
  };

  return recalcSampleBillGrandTotal(base);
}

function buildPattiForSeller(
  sellerName: string,
  lots: SampleLotRow[],
  firm: BillPrintFirmInfo | null,
  buyerMark: string,
  pattiSuffix: string,
): PattiPrintData {
  const divisor = 50;
  const detailRows = lots.map((l) => {
    const qty = Number(l.qty) || 0;
    const weight = roundMoney2(Number(l.weight) > 0 ? Number(l.weight) : qty * divisor);
    const rate = roundMoney2(Number(l.rate) || 800);
    const amount = roundMoney2((weight * rate) / divisor);
    return { mark: buyerMark, bags: qty, weight, rate, amount };
  });

  const grossAmount = roundMoney2(detailRows.reduce((s, r) => s + r.amount, 0));
  const totalBags = roundMoney2(detailRows.reduce((s, r) => s + r.bags, 0));
  const freight = roundMoney2(grossAmount * 0.02);
  const unloading = roundMoney2(totalBags * 15);
  const advance = 500;
  const gunnies = 200;
  const others = 100;

  const deductions: PattiPrintData['deductions'] = [
    { key: 'freight', label: 'Freight', amount: freight },
    { key: 'coolie', label: 'Unloading', amount: unloading },
    { key: 'advance', label: 'Cash Advance', amount: advance },
    { key: 'gunnies', label: 'Gunnies', amount: gunnies },
    { key: 'others', label: 'Others', amount: others },
  ];
  const totalDeductions = roundMoney2(deductions.reduce((s, d) => s + d.amount, 0));
  const netPayable = roundMoney2(grossAmount - totalDeductions);

  const vehicle = lots[0]?.vehicle || 'MH-12-AB-1234';
  const commodityName = lots[0]?.lot_name || 'Onion A-Grade';

  return {
    pattiId: `preview-${pattiSuffix}`,
    pattiNoDisplay: `PTI-2026-${pattiSuffix}`,
    sellerName,
    sellerMobile: '',
    sellerAddress: 'Village Road, Nashik',
    vehicleNumber: vehicle,
    commodityName,
    totalBags,
    detailRows,
    rateClusters: [],
    grossAmount,
    deductions,
    totalDeductions,
    netPayable,
    createdAt: new Date().toISOString(),
    firm,
  };
}

/** One patti per distinct seller in sample lots (up to 3); batch preview uses all. */
export function buildSamplePattiPrintPayloads(
  arrivalDetails: ArrivalDetail[],
  firm: PrintPreviewFirmInput,
): PattiPrintData[] {
  const sampleLots = resolveSampleLots(arrivalDetails);
  const firmObj = firmInputToBillPrintFirm(firm);
  const bySeller = new Map<string, SampleLotRow[]>();
  sampleLots.forEach((l) => {
    const key = l.seller || 'Seller';
    if (!bySeller.has(key)) bySeller.set(key, []);
    bySeller.get(key)!.push(l);
  });
  const sellers = [...bySeller.entries()].slice(0, 3);
  if (sellers.length === 0) {
    return [buildPattiForSeller('Ramesh Kumar', sampleLots, firmObj, 'VT', '001')];
  }
  return sellers.map(([name, lots], i) => buildPattiForSeller(name, lots, firmObj, 'VT', String(100 + i)));
}
