import type { PattiPrintData } from '@/utils/printDocumentTemplates';
import {
  buildRateClustersFromSellerLots,
  defaultSellerExpenses,
  lotStableId,
  mainPattiNumberForDisplay,
  mergeLotDisplayRow,
  roundMoney2,
  settlementLotFromExtraBid,
} from './settlementCalculations';
import type {
  ExtraBidLot,
  LotSalesOverride,
  MainPattiPrintHeader,
  PattiData,
  SellerExpenseFormState,
  SellerSettlement,
  SettlementLot,
} from './settlementTypes';

/** Sales Patti print footers: auction-based vs summary-based settlement. */
/**
 * Print Settings → Settlement named copies (Original, Duplicate, …). Each name generates two physical sheets
 * (original-rate vs modified-rate layout); footer shows only the configured label (optional seller suffix).
 */
export function buildSettlementPattiPagesForConfiguredCopies(
  copyLabels: string[],
  printPayloadOrig: PattiPrintData,
  printPayloadMod: PattiPrintData,
  sellerDisplaySuffix?: string,
): { patti: PattiPrintData; copyLabel: string }[] {
  const labels =
    copyLabels.length > 0
      ? copyLabels.map((l) => (l && String(l).trim()) || 'COPY').filter((s) => s.length > 0)
      : ['ORIGINAL COPY'];
  const tail =
    sellerDisplaySuffix != null && String(sellerDisplaySuffix).trim() !== ''
      ? ` — ${String(sellerDisplaySuffix).trim()}`
      : '';
  const out: { patti: PattiPrintData; copyLabel: string }[] = [];
  for (const raw of labels) {
    const caption = `${raw}${tail}`;
    out.push({ patti: printPayloadOrig, copyLabel: caption }, { patti: printPayloadMod, copyLabel: caption });
  }
  return out;
}


/**
 * Main vehicle patti: two printable payloads (ALT O vs ALT M detail rows / gross & net only).
 * Freight, weighing merge, and every deduction line use the same loop that legacy single-page
 * `printPayload` used (scope sellers → `sellerExpensesById` → `deductionTotals` → `deductions`); that block is not altered here beyond feeding one shared `printBase`.
 */
export function buildMainVehiclePattiPrintPayloadPair(
  pattiData: PattiData,
  scopeSellers: SellerSettlement[],
  removedLotsBySellerId: Record<string, string[]>,
  lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride> | undefined>,
  extraBidLotsBySellerId: Record<string, ExtraBidLot[]>,
  getLotDivisor: (lot: SettlementLot) => number,
  vehicleNetPayableFromPatti: number,
  headerId: MainPattiPrintHeader,
  displayMainSalesPattiNo: string,
  firmInfo: PattiPrintData['firm'],
  sellerExpensesById: Record<string, SellerExpenseFormState>,
  isWeighingEnabledForSeller: (id: string) => boolean,
  isWeighingMergedIntoFreight: (id: string) => boolean
): { printPayloadOrig: PattiPrintData; printPayloadMod: PattiPrintData } {
  const detailRowsMod = buildMainVehiclePattiDetailRows(
    scopeSellers,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
    'modified',
  );
  const detailRowsOrig = buildMainVehiclePattiDetailRows(
    scopeSellers,
    removedLotsBySellerId,
    lotSalesOverridesBySellerId,
    extraBidLotsBySellerId,
    getLotDivisor,
    'original',
  );
  const totalBags = detailRowsMod.reduce((s, r) => s + (Number(r.bags) || 0), 0);
  const commodityNames = Array.from(
    new Set(
      scopeSellers.flatMap(s => [
        ...s.lots.map(l => String(l.commodityName || '').trim()).filter(Boolean),
        ...(extraBidLotsBySellerId[s.sellerId] ?? []).map(e => String(e.commodityName || '').trim()).filter(Boolean),
      ])
    )
  );
  const commodityName =
    commodityNames.length === 1
      ? commodityNames[0]
      : (commodityNames.length > 1 ? 'Mixed Commodity' : 'Commodity');
  const deductionTotals = {
    freight: 0,
    unloading: 0,
    weighing: 0,
    advance: 0,
    gunnies: 0,
    others: 0,
  };
  for (const seller of scopeSellers) {
    const exp = sellerExpensesById[seller.sellerId] ?? defaultSellerExpenses();
    const mergeIntoFreight = isWeighingMergedIntoFreight(seller.sellerId);
    if (isWeighingEnabledForSeller(seller.sellerId)) {
      if (mergeIntoFreight) {
        deductionTotals.freight += (Number(exp.freight) || 0) + (Number(exp.weighman) || 0);
      } else {
        deductionTotals.freight += Number(exp.freight) || 0;
        deductionTotals.weighing += Number(exp.weighman) || 0;
      }
    } else {
      deductionTotals.freight += Number(exp.freight) || 0;
    }
    deductionTotals.unloading += Number(exp.unloading) || 0;
    deductionTotals.advance += Number(exp.cashAdvance) || 0;
    deductionTotals.gunnies += Number(exp.gunnies) || 0;
    deductionTotals.others += Number(exp.others) || 0;
  }
  const deductions: PattiPrintData['deductions'] = [
    { key: 'freight', label: 'Freight', amount: roundMoney2(deductionTotals.freight) },
    { key: 'coolie', label: 'Unloading', amount: roundMoney2(deductionTotals.unloading) },
    ...(deductionTotals.weighing > 0
      ? [{ key: 'weighing', label: 'Weighing', amount: roundMoney2(deductionTotals.weighing) }]
      : []),
    { key: 'advance', label: 'Cash Advance', amount: roundMoney2(deductionTotals.advance) },
    { key: 'gunnies', label: 'Gunnies', amount: roundMoney2(deductionTotals.gunnies) },
    { key: 'others', label: 'Others', amount: roundMoney2(deductionTotals.others) },
  ];
  const primarySeller = scopeSellers[0];
  const totalDeductions = roundMoney2(deductions.reduce((s, d) => s + d.amount, 0));
  const grossMod = roundMoney2(detailRowsMod.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const grossOrig = roundMoney2(detailRowsOrig.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const netMod = roundMoney2(vehicleNetPayableFromPatti);
  const netOrig = roundMoney2(grossOrig - totalDeductions);
  const printBase: PattiPrintData = {
    ...pattiData,
    sellerName: headerId?.sellerName || pattiData.sellerName || primarySeller.sellerName,
    sellerMobile: headerId?.sellerMobile || '',
    sellerAddress: headerId?.sellerAddress || '',
    vehicleNumber: headerId?.vehicleNumber || '',
    pattiNoDisplay: mainPattiNumberForDisplay(displayMainSalesPattiNo, pattiData.pattiId),
    commodityName,
    totalBags,
    deductions,
    totalDeductions,
    firm: firmInfo,
  };
  return {
    printPayloadOrig: {
      ...printBase,
      detailRows: detailRowsOrig,
      grossAmount: grossOrig,
      rateClusters: [],
      netPayable: netOrig,
    },
    printPayloadMod: {
      ...printBase,
      detailRows: detailRowsMod,
      grossAmount: grossMod,
      rateClusters: pattiData.rateClusters,
      netPayable: netMod,
    },
  };
}


/** All sellers on the vehicle: detail rows for main patti print (per rate mode). */
export function buildMainVehiclePattiDetailRows(
  scopeSellers: SellerSettlement[],
  removedLotsBySellerId: Record<string, string[]>,
  lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride> | undefined>,
  extraBidLotsBySellerId: Record<string, ExtraBidLot[]>,
  getLotDivisor: (lot: SettlementLot) => number,
  mode: 'original' | 'modified'
): { mark: string; bags: number; weight: number; rate: number; amount: number }[] {
  return scopeSellers.flatMap(seller => {
    const removedSet = new Set(removedLotsBySellerId[seller.sellerId] ?? []);
    const lotOverrides = lotSalesOverridesBySellerId[seller.sellerId];
    const fromApi = seller.lots.flatMap((lot, lotIndex) => {
      const sid = lotStableId(lot, lotIndex);
      if (removedSet.has(sid)) return [];
      const row = mergeLotDisplayRow(lot, sid, lotOverrides, getLotDivisor(lot), mode);
      return [
        {
          mark: (seller.sellerMark || '-').trim() || '-',
          bags: Number(row.qty) || 0,
          weight: Number(row.weight) || 0,
          rate: Number(row.ratePerBag) || 0,
          amount: Number(row.amount) || 0,
        },
      ];
    });
    const extras = extraBidLotsBySellerId[seller.sellerId] ?? [];
    const fromExtra = extras.map(e => {
      const lot = settlementLotFromExtraBid(e);
      const row = mergeLotDisplayRow(lot, '', undefined, getLotDivisor(lot), mode);
      return {
        mark: (seller.sellerMark || '-').trim() || '-',
        bags: Number(row.qty) || 0,
        weight: Number(row.weight) || 0,
        rate: Number(row.ratePerBag) || 0,
        amount: Number(row.amount) || 0,
      };
    });
    return [...fromApi, ...fromExtra];
  });
}


export function buildSellerSubPattiPrintData(
  seller: SellerSettlement,
  displayName: string,
  expenses: SellerExpenseFormState,
  removedIds: Set<string>,
  pattiId: string,
  createdAt: string,
  lotOverrides?: Record<string, LotSalesOverride>,
  getDivisor?: (lot: SettlementLot) => number,
  weighingEnabled = true,
  mergeWeighingIntoFreight = true,
  sellerMobile = '',
  sellerPattiNoForPrint = '',
  extraBidLots: ExtraBidLot[] = [],
  settlementRateMode: 'original' | 'modified' = 'modified'
): PattiPrintData {
  const divisorFn = getDivisor ?? (() => 50);
  const lotRowsFromApi = seller.lots.flatMap((lot, lotIndex) => {
    const sid = lotStableId(lot, lotIndex);
    if (removedIds.has(sid)) return [];
    const ov = lotOverrides?.[sid];
    const row = mergeLotDisplayRow(lot, sid, lotOverrides, divisorFn(lot), settlementRateMode);
    return [{
      mark: (seller.sellerMark || '-').trim() || '-',
      bags: Number(row.qty) || 0,
      weight: Number(row.weight) || 0,
      rate: Number(row.ratePerBag) || 0,
      amount: Number(row.amount) || 0,
    }];
  });
  const lotRowsFromExtra = extraBidLots.map(e => {
    const lot = settlementLotFromExtraBid(e);
    const row = mergeLotDisplayRow(lot, '', undefined, divisorFn(lot), settlementRateMode);
    return {
      mark: (seller.sellerMark || '-').trim() || '-',
      bags: Number(row.qty) || 0,
      weight: Number(row.weight) || 0,
      rate: Number(row.ratePerBag) || 0,
      amount: Number(row.amount) || 0,
    };
  });
  const lotRows = [...lotRowsFromApi, ...lotRowsFromExtra];

  const rateClusters = buildRateClustersFromSellerLots(
    seller,
    removedIds,
    lotOverrides,
    getDivisor,
    extraBidLots,
    settlementRateMode
  );
  const grossAmount = lotRows.reduce((s, r) => s + r.amount, 0);
  const merged = weighingEnabled && mergeWeighingIntoFreight;
  let freightAmount = expenses.freight;
  let weighingAmount = 0;
  if (weighingEnabled) {
    if (merged) {
      freightAmount += expenses.weighman;
    } else {
      weighingAmount = expenses.weighman;
    }
  }

  const deductions = [
    {
      key: 'freight',
      label: merged ? 'Freight Amount (incl. weighing)' : 'Freight Amount',
      amount: freightAmount,
      autoPulled: false,
    },
    { key: 'unloading', label: 'Unloading Charges', amount: expenses.unloading, autoPulled: false },
    { key: 'advance', label: 'Cash Advance', amount: expenses.cashAdvance, autoPulled: false },
    { key: 'gunnies', label: 'Gunnies', amount: expenses.gunnies, autoPulled: false },
    { key: 'others', label: 'Others', amount: expenses.others, autoPulled: false },
  ];
  if (weighingEnabled && !merged) {
    deductions.splice(2, 0, { key: 'weighing', label: 'Weighing Charges', amount: weighingAmount, autoPulled: false });
  }

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const subLabel = pattiId ? `${pattiId} · Sub` : 'Sub-patti';
  const displayNo = String(sellerPattiNoForPrint || '').trim();
  const commodityNames = Array.from(
    new Set([
      ...seller.lots.map(l => String(l.commodityName || '').trim()).filter(Boolean),
      ...extraBidLots.map(e => String(e.commodityName || '').trim()).filter(Boolean),
    ]),
  );
  const commodityName = commodityNames.length === 1
    ? commodityNames[0]
    : (commodityNames.length > 1 ? 'Mixed Commodity' : 'Commodity');
  const totalBags = lotRows.reduce((s, r) => s + r.bags, 0);

  return {
    pattiId: subLabel,
    pattiNoDisplay: displayNo || undefined,
    sellerName: displayName,
    sellerMobile,
    sellerAddress: seller.fromLocation || '',
    vehicleNumber: seller.vehicleNumber || '',
    commodityName,
    totalBags,
    detailRows: lotRows,
    rateClusters,
    grossAmount,
    deductions,
    totalDeductions,
    netPayable: grossAmount - totalDeductions,
    createdAt,
    useAverageWeight: false,
  };
}
