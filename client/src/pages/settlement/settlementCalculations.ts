import type { PattiDTO } from '@/services/api';
import type { ArrivalFullDetail, ArrivalSellerFullDetail } from '@/services/api/arrivals';
import type { FullCommodityConfigDto } from '@/services/api/commodities';
import type { Commodity } from '@/types/models';
import { formatAuctionLotIdentifier, lotBagCountForIdentifier } from '@/utils/auctionLotIdentifier';
import { DEDUCTION_MAX, PATTI_EXTENSION_JSON_VERSION, VEHICLE_NUMBER_MAX, VEHICLE_NUMBER_MIN } from './settlementConstants';
import type {
  AddVoucherRowState,
  DeductionItem,
  ExtraBidLot,
  LotSalesOverride,
  PattiData,
  PattiExtensionJsonV1,
  RateCluster,
  SalesRowOrderKey,
  SellerExpenseFormState,
  SellerRegFormState,
  SellerSettlement,
  SettlementEntry,
  SettlementLot,
  SellerArrivalTally,
  SplitGroupSnapshot,
  VehicleExpenseFieldValues,
  VehicleExpenseRow,
} from './settlementTypes';

/** Canonical `VM-VTOT/SM-STOT/lotName/lotQty` — same util as Auction, Billing, PrintHub. */
export function formatSettlementAuctionLotIdentifier(seller: SellerSettlement, lot: SettlementLot): string {
  const rawBags = Number(lot.arrivalBagCount) || 0;
  const lotBagCount = lotBagCountForIdentifier(lot.arrivalBagCount);
  const lotName = String(lot.lotName || '').trim() || String(rawBags || '');
  const vTotal =
    Number(seller.vehicleTotalQty ?? seller.arrivalTotalBags ?? rawBags) || rawBags;
  const sTotal = Number(seller.arrivalTotalBags ?? rawBags) || rawBags;
  return formatAuctionLotIdentifier({
    vehicleMark: seller.vehicleMark,
    vehicleTotalQty: vTotal,
    sellerMark: seller.sellerMark,
    sellerTotalQty: sTotal,
    lotName,
    lotQty: lotBagCount,
  });
}


export function tallySellerArrival(seller: SellerSettlement): SellerArrivalTally {
  let lots = 0;
  let bids = 0;
  let weighed = 0;
  for (const lot of seller.lots ?? []) {
    const entries = lot.entries ?? [];
    bids += entries.length;
    for (const entry of entries) {
      lots += entry.quantity;
      if (entry.weight > 0) weighed += entry.quantity;
    }
  }
  return { lots, bids, weighed };
}


export function areRateClustersEqual(a: RateCluster[], b: RateCluster[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.rate !== y.rate ||
      x.totalQuantity !== y.totalQuantity ||
      x.totalWeight !== y.totalWeight ||
      x.amount !== y.amount
    ) {
      return false;
    }
  }
  return true;
}


export function areDeductionItemsEqual(a: DeductionItem[], b: DeductionItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.key !== y.key ||
      x.label !== y.label ||
      x.amount !== y.amount ||
      x.editable !== y.editable ||
      x.autoPulled !== y.autoPulled
    ) {
      return false;
    }
  }
  return true;
}


export function isFrozenPatti(dto: PattiDTO | null | undefined): boolean {
  return !!dto && (dto.frozen === true || (!!dto.lockedAt && !dto.reopenedAt));
}


/** Lower SL No. sorts first; missing serial sorts last (stable tie-break on sellerId). */
export function sellerSerialSortKey(serial: string | number | null | undefined): number {
  if (serial == null || serial === '') return Number.POSITIVE_INFINITY;
  const n = Number(serial);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}


export function pickFirstArrivalSeller(
  sellerIds: string[],
  sellerById: Map<string, SellerSettlement>
): SellerSettlement | undefined {
  const list = sellerIds
    .map(id => sellerById.get(String(id)))
    .filter((s): s is SellerSettlement => s != null);
  if (list.length === 0) return undefined;
  list.sort((a, b) => {
    const d = sellerSerialSortKey(a.sellerSerialNo) - sellerSerialSortKey(b.sellerSerialNo);
    if (d !== 0) return d;
    return String(a.sellerId).localeCompare(String(b.sellerId));
  });
  return list[0];
}


export function formatSettlementSellerLabel(s: SellerSettlement): string {
  const name = (s.sellerName || '').trim();
  const mark = (s.sellerMark || '').trim();
  if (!name && !mark) return '-';
  return mark ? `${name} – ${mark}` : name;
}


/** One label for the arrival-summary table: first seller on the vehicle by arrival serial. */
export function firstArrivalSellerLabel(
  sellerIds: string[],
  sellerById: Map<string, SellerSettlement>,
  fallbackName?: string
): string {
  const first = pickFirstArrivalSeller(sellerIds, sellerById);
  if (first) return formatSettlementSellerLabel(first);
  const fb = (fallbackName || '').trim();
  return fb || '-';
}


export function uniqueArrivalSellerCount(sellerIds: string[] | undefined): number {
  const set = new Set<string>();
  for (const raw of sellerIds ?? []) {
    const s = String(raw ?? '').trim();
    if (s) set.add(s);
  }
  return set.size;
}


/** Saved / New / In-progress cards: primary seller plus “(+N more)” when row bundles multiple sellers. */
export function formatArrivalSellerListLabel(
  sellerIds: string[],
  sellerById: Map<string, SellerSettlement>,
  fallbackName?: string
): string {
  const first = firstArrivalSellerLabel(sellerIds, sellerById, fallbackName);
  const n = uniqueArrivalSellerCount(sellerIds);
  if (n <= 1) return first;
  return `${first} (+${n - 1} more)`;
}


/** Group pattis onto one arrival vehicle row — use `vehicleId` when known so duplicate plates on different trips do not collide. */
export function arrivalVehicleGroupSegment(vehicleNumber: string, seller?: SellerSettlement): string {
  const vid = seller?.vehicleId;
  if (vid != null && Number.isFinite(Number(vid))) return `vid:${Number(vid)}`;
  return `plate:${(vehicleNumber || '').trim().toLowerCase()}`;
}


/**
 * Sellers in current patti workspace. Prefer explicit ids; never fall back to everyone on normalized plate string.
 */
export function sellersForSettlementArrivalScope(
  sellers: SellerSettlement[],
  selectedSeller: SellerSettlement,
  selectedArrivalSellerIds: string[]
): SellerSettlement[] {
  if (selectedArrivalSellerIds.length > 0) {
    const idSet = new Set(selectedArrivalSellerIds.map(String));
    const scoped = sellers.filter(s => idSet.has(String(s.sellerId)));
    if (scoped.length > 0) return scoped;
    const lone = sellers.find(s => String(s.sellerId) === String(selectedSeller.sellerId));
    return lone ? [lone] : [selectedSeller];
  }
  return [selectedSeller];
}


/** Sales Patti “compound” identity: links seller-1 … seller-N rows (`pattiBaseNumber` or part of `BASE-SEQ`). */
export function settlementPattiCompoundBaseKey(p: PattiDTO): string {
  const raw = String(p.pattiBaseNumber ?? '').trim();
  if (raw) return raw;
  const pid = String(p.pattiId ?? '').trim();
  const m = pid.match(/^(.*)-(\d+)$/);
  return m ? m[1].trim() : '';
}


export function parseCompoundBaseFromPattiId(pattiId?: string): string {
  const raw = String(pattiId ?? '').trim();
  const m = raw.match(/^(.*)-(\d+)$/);
  return m ? m[1].trim() : '';
}


export function parseCompoundSeqFromPattiId(pattiId?: string): number | undefined {
  const raw = String(pattiId ?? '').trim();
  const m = raw.match(/^(.*)-(\d+)$/);
  if (!m) return undefined;
  const n = Number(m[2]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}


/**
 * Key for Saved / In-progress summaries: rows that share compound base merge even if `createdAt` differs
 * (avoids splitting one main patti into two saved cards).
 */
export function settlementPattiListGroupKey(p: PattiDTO, seller: SellerSettlement | undefined): string {
  const vehicleNumber = (p.vehicleNumber || '').trim();
  const fromLocation = (p.fromLocation || '').trim();
  const dateRaw = (p.date ?? p.createdAt ?? '').toString();
  const vseg = arrivalVehicleGroupSegment(vehicleNumber, seller);
  const flo = fromLocation.toLowerCase();
  const compound = settlementPattiCompoundBaseKey(p);
  if (compound) return `compound:${compound}|${vseg}|${flo}`;
  return `legacy:${vseg}|${flo}|${dateRaw}`;
}


export function totalBagsFromPattiRateClusters(p: PattiDTO): number {
  let s = 0;
  for (const c of p.rateClusters ?? []) {
    const q = (c as { totalQuantity?: unknown }).totalQuantity;
    const n = typeof q === 'number' && !Number.isNaN(q) ? q : Number(q) || 0;
    s += n;
  }
  return Math.round(s);
}


/** Map backend PattiDTO to form PattiData (numbers and ISO date). */
export function mapPattiDTOToPattiData(dto: PattiDTO): PattiData {
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


/**
 * Alt+O original view: body fields (clusters, extensionJson, amounts) come only from immutable snapshot `raw`.
 * Do not fall back to current `pattiDetailDto` for those keys — missing keys mean empty/default, not “live” split/edit state.
 */
export function pattiDtoFromOriginalSnapshotPayload(baseDto: PattiDTO, raw: Record<string, unknown>): PattiDTO {
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(raw, key);

  const rateClusters: PattiDTO['rateClusters'] =
    has('rateClusters') && Array.isArray(raw.rateClusters)
      ? (raw.rateClusters as PattiDTO['rateClusters'])
      : [];

  const deductions: PattiDTO['deductions'] =
    has('deductions') && Array.isArray(raw.deductions)
      ? (raw.deductions as PattiDTO['deductions'])
      : [];

  const toNum = (key: string, defaultValue: number): number => {
    if (!has(key)) return defaultValue;
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : defaultValue;
  };

  const totalDeductionsFromLines = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const grossAmount = toNum('grossAmount', 0);
  const totalDeductions = has('totalDeductions') ? toNum('totalDeductions', totalDeductionsFromLines) : totalDeductionsFromLines;
  const netPayable = has('netPayable') ? toNum('netPayable', grossAmount - totalDeductions) : grossAmount - totalDeductions;

  let extensionJson: string | undefined;
  if (has('extensionJson')) {
    const ej = raw.extensionJson;
    if (ej == null || ej === '') extensionJson = undefined;
    else extensionJson = typeof ej === 'string' ? ej : String(ej);
  } else {
    extensionJson = undefined;
  }

  const useAverageWeight = has('useAverageWeight') ? Boolean(raw.useAverageWeight) : false;

  const sellerName =
    has('sellerName') && raw.sellerName != null ? String(raw.sellerName) : baseDto.sellerName;
  const vehicleNumber = has('vehicleNumber')
    ? raw.vehicleNumber == null
      ? undefined
      : String(raw.vehicleNumber)
    : baseDto.vehicleNumber;
  const fromLocation = has('fromLocation')
    ? raw.fromLocation == null
      ? undefined
      : String(raw.fromLocation)
    : baseDto.fromLocation;

  const createdAt = has('createdAt')
    ? raw.createdAt == null
      ? baseDto.createdAt
      : typeof raw.createdAt === 'string'
        ? raw.createdAt
        : String(raw.createdAt)
    : baseDto.createdAt;

  const pattiBaseNumber = has('pattiBaseNumber')
    ? raw.pattiBaseNumber == null
      ? undefined
      : String(raw.pattiBaseNumber)
    : baseDto.pattiBaseNumber;

  let sellerSequenceNumber = baseDto.sellerSequenceNumber;
  if (has('sellerSequenceNumber')) {
    const v = raw.sellerSequenceNumber;
    if (typeof v === 'number' && Number.isFinite(v)) sellerSequenceNumber = v;
    else {
      const n = Number(v);
      if (Number.isFinite(n)) sellerSequenceNumber = n;
    }
  }

  const sellerSerialNo = has('sellerSerialNo')
    ? (raw.sellerSerialNo as PattiDTO['sellerSerialNo'])
    : baseDto.sellerSerialNo;

  const date = has('date') ? (raw.date == null ? baseDto.date : String(raw.date)) : baseDto.date;

  return {
    id: baseDto.id,
    pattiId: baseDto.pattiId,
    pattiBaseNumber,
    sellerSequenceNumber,
    sellerId: baseDto.sellerId,
    sellerName,
    vehicleNumber,
    fromLocation,
    sellerSerialNo,
    date,
    rateClusters,
    grossAmount,
    deductions,
    totalDeductions,
    netPayable,
    createdAt,
    useAverageWeight,
    inProgress: has('inProgress') ? Boolean(raw.inProgress) : baseDto.inProgress,
    extensionJson,
    originalData: baseDto.originalData,
  };
}


/** Arrival-summary stats from saved patti body (stays in sync after weight/qty edits are saved). */
export function tallyFromPattiDtoClusters(dto: PattiDTO): { lots: number; bids: number; weighed: number } {
  const clusters = dto.rateClusters ?? [];
  let lots = 0;
  let weighed = 0;
  for (const c of clusters) {
    lots += Number(c.totalQuantity) || 0;
    weighed += Number(c.totalWeight) || 0;
  }
  return { lots, bids: clusters.length, weighed };
}


export function sumPattiClusterQty(pd: PattiData): number {
  return pd.rateClusters.reduce((s, c) => s + (Number(c.totalQuantity) || 0), 0);
}


export function sumPattiClusterWeight(pd: PattiData): number {
  return pd.rateClusters.reduce((s, c) => s + (Number(c.totalWeight) || 0), 0);
}


/** INR display: always two decimals (en-IN), signed-safe (unlike `roundMoney2` which floors negatives). */
export function formatMoney2Display(n: number): string {
  if (!Number.isFinite(n)) {
    return (0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const x = Math.round((n + Number.EPSILON) * 100) / 100;
  return x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


/** Restore per-seller expense form from saved patti deduction lines. */
export function deductionsToSellerExpenseForm(
  deds: DeductionItem[],
  opts?: { inferredWeighmanFromSlabs?: number }
): SellerExpenseFormState {
  const byKey = Object.fromEntries(deds.map(d => [d.key, d.amount])) as Record<string, number>;
  const freightDed = deds.find(d => d.key === 'freight');
  const hasWeighingLine = deds.some(d => d.key === 'weighing' || d.key === 'weighman');

  let freight = Number(byKey.freight ?? 0);
  let weighman = Number(byKey.weighing ?? byKey.weighman ?? 0);

  /**
   * Legacy saves (Add to freight ON): single `freight` row held freight+weighing with no `weighing` key.
   * Split using slab-derived weighing when freight label indicates merged line.
   */
  if (
    !hasWeighingLine &&
    freight > 0 &&
    weighman === 0 &&
    opts?.inferredWeighmanFromSlabs != null &&
    Number.isFinite(opts.inferredWeighmanFromSlabs)
  ) {
    const inf = clampMoney(opts.inferredWeighmanFromSlabs);
    const lab = String(freightDed?.label ?? '').toLowerCase();
    const looksMergedFreight = lab.includes('incl');
    if (looksMergedFreight && inf > 0) {
      const w = Math.min(inf, freight);
      weighman = w;
      freight = clampMoney(freight - w);
    }
  }

  return {
    freight: clampMoney(freight),
    unloading: Number(byKey.coolie ?? byKey.unloading ?? 0),
    weighman: clampMoney(weighman),
    cashAdvance: Number(byKey.advance ?? 0),
    gunnies: Number(byKey.gunnies ?? 0),
    others: Number(byKey.others ?? 0),
  };
}


/** Main patti deduction rows from primary seller expense state (labels for print/save). */
export function buildDeductionItemsFromSellerExpenses(
  exp: SellerExpenseFormState,
  coolieMode: 'FLAT' | 'RECALCULATED',
  weighingEnabled: boolean,
  mergeWeighingIntoFreight: boolean
): DeductionItem[] {
  const coolieLabel =
    coolieMode === 'FLAT'
      ? 'Unloading (Coolie) — commodity slab'
      : 'Unloading (Coolie) — commodity slab (weight mode reference)';

  const merged = weighingEnabled && mergeWeighingIntoFreight;
  /** Always persist base freight + weighing on separate rows so reopening saved pattis restores `weighman` (Quick Adjustment + expense card). UI merge only affects display, not stored shape. */
  const freightAmt = exp.freight;

  const items: DeductionItem[] = [
    {
      key: 'freight',
      label: merged ? 'Freight (incl. weighing)' : 'Freight',
      amount: freightAmt,
      editable: true,
      autoPulled: true,
    },
    { key: 'coolie', label: coolieLabel, amount: exp.unloading, editable: true, autoPulled: true },
  ];
  if (weighingEnabled) {
    items.push({
      key: 'weighing',
      label: 'Weighing Charges',
      amount: exp.weighman,
      editable: true,
      autoPulled: true,
    });
  }
  items.push(
    { key: 'advance', label: 'Cash Advance', amount: exp.cashAdvance, editable: true, autoPulled: false },
    { key: 'gunnies', label: 'Gunnies', amount: exp.gunnies, editable: true, autoPulled: false },
    { key: 'others', label: 'Others', amount: exp.others, editable: true, autoPulled: false }
  );
  return items;
}


export function totalSellerExpenses(
  exp: SellerExpenseFormState,
  weighingEnabled: boolean,
  mergeWeighingIntoFreight: boolean
): number {
  let freight = exp.freight;
  let w = 0;
  if (weighingEnabled) {
    if (mergeWeighingIntoFreight) {
      freight = exp.freight + exp.weighman;
    } else {
      w = exp.weighman;
    }
  }
  return freight + exp.unloading + w + exp.cashAdvance + exp.gunnies + exp.others;
}


export function clampMoney(value: number, min = 0, max = DEDUCTION_MAX): number {
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}


export function isVehicleNumberValid(v: string): boolean {
  return v.length >= VEHICLE_NUMBER_MIN && v.length <= VEHICLE_NUMBER_MAX;
}


export function presetDelta(entry: SettlementEntry): number {
  const p = entry.presetMargin;
  if (p == null) return 0;
  const n = Number(p);
  return Number.isFinite(n) ? n : 0;
}


/**
 * Per-bag amount for settlement:
 * - Original: bid (rate) + preset (signed, from pad).
 * - Modified: vehicle-ops summary new seller rate only — that value is the final per-bag amount (pad preset already incorporated there). Do not add preset again. If missing, fall back to bid + preset (legacy / extra-bid rows).
 */
export function settlementEffectiveRatePerBag(entry: SettlementEntry, mode: 'original' | 'modified'): number {
  if (mode === 'original') {
    return (Number(entry.rate) || 0) + presetDelta(entry);
  }
  if (entry.summarySellerRate != null && Number.isFinite(Number(entry.summarySellerRate))) {
    return Number(entry.summarySellerRate);
  }
  return (Number(entry.rate) || 0) + presetDelta(entry);
}


export function normalizeVehicleKey(v: string | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '');
}


export function totalBagsForSeller(s: SellerSettlement): number {
  return s.lots.reduce((acc, l) => acc + l.entries.reduce((a2, e) => a2 + (Number(e.quantity) || 0), 0), 0);
}


/** Sales Pad style estimate: Σ (bags × 50 kg) when actual weight not yet applied. */
export function totalPadEstimateWeightForSeller(s: SellerSettlement): number {
  return s.lots.reduce(
    (acc, l) => acc + l.entries.reduce((a2, e) => a2 + (Number(e.quantity) || 0) * 50, 0),
    0
  );
}


/** Arrivals module: total bags (lot.bag_count) for this seller. */
export function totalArrivalBagsForSeller(s: SellerSettlement): number {
  if (typeof s.arrivalTotalBags === 'number' && !Number.isNaN(s.arrivalTotalBags)) {
    return s.arrivalTotalBags;
  }
  return s.lots.reduce((acc, l) => acc + (Number(l.arrivalBagCount) || 0), 0);
}


/** Billing module: Σ persisted line weights for this seller's lots; falls back to pad estimate if API omitted. */
export function totalBillingNetWeightForSeller(s: SellerSettlement): number {
  if (s.billingNetWeightKg != null && Number.isFinite(Number(s.billingNetWeightKg))) {
    return Number(s.billingNetWeightKg);
  }
  return totalPadEstimateWeightForSeller(s);
}


export function vehicleArrivalNetBillableKgForSeller(s: SellerSettlement): number | null {
  if (s.vehicleArrivalNetBillableKg == null || !Number.isFinite(Number(s.vehicleArrivalNetBillableKg))) {
    return null;
  }
  return Number(s.vehicleArrivalNetBillableKg);
}


export function roundMoney2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}


/** SRS hamali / weighing slab: charge = Rf × max(1, W / T). Round only after bag distribution (see modal / auto-pull). */
export function computeSlabChargeTotal(actualWeight: number, fixedRate: number, threshold: number): number {
  const w = Math.max(0, Number(actualWeight) || 0);
  const T = Math.max(0, Number(threshold) || 0);
  const F = Math.max(0, Number(fixedRate) || 0);
  if (T <= 0) return 0;
  return F * Math.max(1, w / T);
}


export function findArrivalSellerForSettlement(
  arrival: ArrivalFullDetail,
  settlement: SellerSettlement
): ArrivalSellerFullDetail | undefined {
  const sellers = arrival.sellers ?? [];
  const byMark = sellers.find(
    x =>
      (x.sellerName || '').trim().toLowerCase() === (settlement.sellerName || '').trim().toLowerCase() &&
      (x.sellerMark || '').trim().toLowerCase() === (settlement.sellerMark || '').trim().toLowerCase()
  );
  if (byMark) return byMark;
  return sellers.find(
    x => (x.sellerName || '').trim().toLowerCase() === (settlement.sellerName || '').trim().toLowerCase()
  );
}


export function bagsFromArrivalSeller(arrivalSeller: ArrivalSellerFullDetail | undefined): number {
  if (!arrivalSeller) return 0;
  return arrivalSeller.lots.reduce((a, l) => a + (Number(l.bagCount) || 0), 0);
}


export function formatOptionalKg(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}


export function formatOptionalInt(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return String(Math.round(value));
}


export function formatRupeeInr(value: number): string {
  return `₹ ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


/** Parsed `grossAmount` from a stored original snapshot body (session JSON or API `originalData`). */
export function grossAmountFromOriginalPayloadRecord(raw: Record<string, unknown> | null | undefined): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw.grossAmount;
  if (typeof g === 'number' && Number.isFinite(g)) return g;
  const n = Number(g);
  return Number.isFinite(n) ? n : null;
}


export function stringifyOriginalDataForHydration(od: unknown): string | null {
  if (!od || typeof od !== 'object' || Array.isArray(od)) return null;
  try {
    return JSON.stringify(od);
  } catch {
    return null;
  }
}


/** Copy API `originalData` into session ref so multi-seller footers can sum every seller's first snapshot. */
export function hydrateSessionOriginalSnapshotFromDto(bucket: Record<string, string>, p: PattiDTO | null | undefined): void {
  if (!p?.sellerId) return;
  const sid = String(p.sellerId).trim();
  if (!sid) return;
  const s = stringifyOriginalDataForHydration(p.originalData);
  if (s) bucket[sid] = s;
}


export function clearSessionOriginalSnapshotsForSellerIds(bucket: Record<string, string>, ids: Iterable<string>): void {
  for (const raw of ids) {
    const sid = String(raw ?? '').trim();
    if (sid) delete bucket[sid];
  }
}


export function readOriginalGrossForSellerId(
  sellerId: string,
  sessionJsonBySellerId: Record<string, string>,
  pattiDetail: PattiDTO | null,
): number | null {
  const sid = String(sellerId ?? '').trim();
  if (!sid) return null;
  const json = sessionJsonBySellerId[sid];
  if (json) {
    try {
      const g = grossAmountFromOriginalPayloadRecord(JSON.parse(json) as Record<string, unknown>);
      if (g != null) return g;
    } catch {
      /* ignore */
    }
  }
  if (pattiDetail && String(pattiDetail.sellerId ?? '').trim() === sid) {
    return grossAmountFromOriginalPayloadRecord(pattiDetail.originalData as Record<string, unknown>);
  }
  return null;
}


/** True when the bill treats this seller as registry-backed (no manual Unregistered print confirmation needed). */
export function isSettlementSellerPrintRegistered(form: SellerRegFormState): boolean {
  if (form.registered) return true;
  const cid = form.contactId;
  return cid != null && String(cid).trim() !== '';
}


/** Print allowed for registered (or linked-contact) sellers without checking Unregistered; otherwise requires `unregisteredPrintConfirmed`. */
export function isSettlementSellerPrintAllowed(_seller: SellerSettlement, form: SellerRegFormState): boolean {
  if (isSettlementSellerPrintRegistered(form)) return true;
  return form.unregisteredPrintConfirmed === true;
}


export function settlementSellerPrintGateMessage(seller: SellerSettlement, form: SellerRegFormState): string | null {
  if (isSettlementSellerPrintAllowed(seller, form)) return null;
  const name = (seller.sellerName || 'Seller').trim();
  const mark = (seller.sellerMark || '').trim();
  const label = mark ? `${name} – ${mark}` : name;
  return `${label}: check Unregistered to confirm printing for this non-registered seller.`;
}


/** Distribute total lot weight across entries (billing total or sum of entry weights). */
export function distributeLotEntryWeights(lot: SettlementLot, totalW: number): number[] {
  const entries = lot.entries ?? [];
  const n = entries.length;
  if (n === 0) return [];

  const tw = Math.max(0, Number(totalW) || 0);
  if (tw <= 0) return entries.map(() => 0);

  const sumEw = entries.reduce((s, e) => s + (Number(e.weight) || 0), 0);
  if (sumEw > 0) {
    return entries.map(e => ((Number(e.weight) || 0) / sumEw) * tw);
  }

  // Per-bid kg often missing until Sales/Patti edits; split merged lot kg by bag shares, else evenly.
  const qtyParts = entries.map(e => Math.max(0, Math.round(Number(e.quantity) || 0)));
  const sumQ = qtyParts.reduce((a, b) => a + b, 0);
  if (sumQ > 0) {
    const shares = qtyParts.map(q => (q / sumQ) * tw);
    const sumFirst = shares.slice(0, -1).reduce((a, b) => a + b, 0);
    return [...shares.slice(0, -1), tw - sumFirst];
  }

  const base = tw / n;
  return entries.map((_, i) => (i === n - 1 ? tw - base * (n - 1) : base));
}


/**
 * Lot-level Sales Patti row: amount = Σ (distributedWeight × rate per bag) / commodity divisor (same as Billing).
 */
export function lotBaseSalesRow(
  lot: SettlementLot,
  divisor: number,
  settlementRateMode: 'original' | 'modified' = 'modified'
) {
  const div = divisor > 0 ? divisor : 50;
  const qty = lot.entries.reduce((s, e) => s + (Number(e.quantity) || 0), 0);
  const sumEntryW = lot.entries.reduce((s, e) => s + (Number(e.weight) || 0), 0);
  const bw = lot.billingWeightKg;
  // Weight comes strictly from billing. Prefer lot-level aggregate if > 0, else sum of billing-sourced entries.
  const weight = bw != null && Number(bw) > 0 ? Number(bw) : sumEntryW;
  const itemLabel = lot.lotName || lot.commodityName || '—';
  if (qty <= 0 || weight <= 0) {
    return {
      itemLabel,
      qty,
      weight,
      avg: 0,
      ratePerBag: 0,
      amount: 0,
      divisor: div,
    };
  }
  const distW = distributeLotEntryWeights(lot, weight);
  let amount = 0;
  lot.entries.forEach((e, i) => {
    const w = distW[i] ?? 0;
    amount += (w * settlementEffectiveRatePerBag(e, settlementRateMode)) / div;
  });
  amount = roundMoney2(amount);
  const ratePerBag = weight > 0 ? roundMoney2((amount * div) / weight) : 0;
  const avg = qty > 0 ? weight / qty : 0;
  return {
    itemLabel,
    qty,
    weight,
    avg,
    ratePerBag,
    amount,
    divisor: div,
  };
}


export function hasLotSalesOverride(o: LotSalesOverride | undefined): boolean {
  if (!o) return false;
  return o.qty !== undefined || o.weight !== undefined || o.ratePerBag !== undefined;
}


/** Storage key for Sales report overrides: one key per lot when a single bid; per-bid keys when multiple buyers. */
export function lotSalesOverrideStorageKey(sid: string, entryIndex: number, numEntries: number): string {
  if (numEntries <= 1) return sid;
  return `${sid}::${entryIndex}`;
}


export function parseExtraBidLotsArray(raw: unknown): ExtraBidLot[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtraBidLot[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const id = String(o.id ?? '').trim();
    if (!id) continue;
    const qty = Math.max(0, Math.round(Number(o.qty) || 0));
    const weight = Number(o.weight);
    const ratePerBag = Number(o.ratePerBag);
    if (!Number.isFinite(weight) || !Number.isFinite(ratePerBag)) continue;
    out.push({
      id,
      lotName: String(o.lotName ?? '').trim(),
      commodityName: String(o.commodityName ?? '').trim(),
      qty,
      weight: Math.max(0, weight),
      ratePerBag: Math.max(0, ratePerBag),
    });
  }
  return out;
}


export function settlementLotFromExtraBid(e: ExtraBidLot): SettlementLot {
  return {
    lotId: e.id,
    lotName: e.lotName,
    commodityName: e.commodityName,
    arrivalBagCount: 0,
    billingWeightKg: null,
    entries: [
      {
        bidNumber: 0,
        buyerMark: '',
        buyerName: '',
        rate: e.ratePerBag,
        presetMargin: 0,
        quantity: e.qty,
        weight: e.weight,
      },
    ],
  };
}


export function buildPattiExtensionJsonForSeller(
  sellerId: string,
  removedLotsBySellerId: Record<string, string[]>,
  lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride>>,
  extraBidLotsBySellerId: Record<string, ExtraBidLot[]>,
  unregisteredPrintConfirmed: boolean,
  salesRowOrderBySellerId?: Record<string, SalesRowOrderKey[]>,
  sellerForOrder?: SellerSettlement
): string | undefined {
  const removed = removedLotsBySellerId[sellerId] ?? [];
  const ov = lotSalesOverridesBySellerId[sellerId] ?? {};
  const slimOverrides: Record<string, { weight?: number; ratePerBag?: number; qty?: number }> = {};
  for (const [lotSid, v] of Object.entries(ov)) {
    if (!v) continue;
    const entry: { weight?: number; ratePerBag?: number; qty?: number } = {};
    if (v.weight !== undefined) entry.weight = v.weight;
    if (v.ratePerBag !== undefined) entry.ratePerBag = v.ratePerBag;
    if (v.qty !== undefined) entry.qty = v.qty;
    if (Object.keys(entry).length > 0) slimOverrides[lotSid] = entry;
  }
  const extraBidLots = extraBidLotsBySellerId[sellerId] ?? [];
  const storedOrder = salesRowOrderBySellerId?.[sellerId];
  let persistOrder: SalesRowOrderKey[] | undefined;
  if (storedOrder?.length && sellerForOrder) {
    const removedSet = new Set(removed);
    const def = buildDefaultSalesRowOrder(sellerForOrder, removedSet, extraBidLots);
    if (JSON.stringify(storedOrder) !== JSON.stringify(def)) {
      persistOrder = storedOrder;
    }
  }
  if (
    removed.length === 0 &&
    Object.keys(slimOverrides).length === 0 &&
    extraBidLots.length === 0 &&
    !unregisteredPrintConfirmed &&
    !persistOrder?.length
  ) {
    return undefined;
  }
  const payload: PattiExtensionJsonV1 = { v: PATTI_EXTENSION_JSON_VERSION };
  if (removed.length > 0) payload.removedLotIds = [...removed];
  if (Object.keys(slimOverrides).length > 0) payload.lotOverrides = slimOverrides;
  if (extraBidLots.length > 0) payload.extraBidLots = extraBidLots.map(e => ({ ...e }));
  if (persistOrder?.length) payload.salesRowOrder = [...persistOrder];
  if (unregisteredPrintConfirmed) payload.unregisteredPrintConfirmed = true;
  return JSON.stringify(payload);
}


export function parsePattiExtensionJson(
  extensionJson: string | null | undefined
): {
  removedLotIds: string[];
  lotOverrides: Record<string, LotSalesOverride>;
  extraBidLots: ExtraBidLot[];
  salesRowOrder: SalesRowOrderKey[];
  unregisteredPrintConfirmed: boolean;
} | null {
  if (extensionJson == null || !String(extensionJson).trim()) return null;
  try {
    const parsed = JSON.parse(extensionJson) as PattiExtensionJsonV1;
    if (parsed.v !== PATTI_EXTENSION_JSON_VERSION) return null;
    const removedLotIds = Array.isArray(parsed.removedLotIds) ? parsed.removedLotIds.map(String) : [];
    const lotOverrides: Record<string, LotSalesOverride> = {};
    if (parsed.lotOverrides && typeof parsed.lotOverrides === 'object') {
      for (const [k, v] of Object.entries(parsed.lotOverrides)) {
        if (!v || typeof v !== 'object') continue;
        const o: LotSalesOverride = {};
        if (typeof v.weight === 'number' && Number.isFinite(v.weight)) o.weight = v.weight;
        if (typeof v.ratePerBag === 'number' && Number.isFinite(v.ratePerBag)) o.ratePerBag = v.ratePerBag;
        if (typeof v.qty === 'number' && Number.isFinite(v.qty)) o.qty = v.qty;
        if (hasLotSalesOverride(o)) lotOverrides[k] = o;
      }
    }
    const extraBidLots = parseExtraBidLotsArray(parsed.extraBidLots);
    const unregisteredPrintConfirmed = parsed.unregisteredPrintConfirmed === true;
    const rawOrder = Array.isArray(parsed.salesRowOrder)
      ? parsed.salesRowOrder.map(String).filter(Boolean)
      : [];
    return {
      removedLotIds,
      lotOverrides,
      extraBidLots,
      salesRowOrder: rawOrder as SalesRowOrderKey[],
      unregisteredPrintConfirmed,
    };
  } catch {
    return null;
  }
}


/** Merge API lot totals with optional user overrides. Amount = (weight × rate per bag) / divisor. */
export function mergeLotDisplayRowLegacy(
  lot: SettlementLot,
  o: LotSalesOverride | undefined,
  divisor: number,
  settlementRateMode: 'original' | 'modified' = 'modified'
) {
  // dummy
  const base = lotBaseSalesRow(lot, divisor, settlementRateMode);
  if (!hasLotSalesOverride(o)) return base;
  const qty =
    o!.qty !== undefined && Number.isFinite(o!.qty) ? Math.max(0, Math.round(Number(o!.qty))) : base.qty;
  const weight = o!.weight !== undefined ? o!.weight : base.weight;
  const div = base.divisor;
  const ratePerBag =
    settlementRateMode === 'modified' && o!.ratePerBag !== undefined ? o!.ratePerBag : base.ratePerBag;
  const amount = roundMoney2((weight * ratePerBag) / div);
  const avg = qty > 0 ? weight / qty : 0;
  return {
    ...base,
    qty,
    weight,
    avg,
    ratePerBag,
    amount,
  };
}


export function mergeLotDisplayRow(
  lot: SettlementLot,
  sid: string,
  lotOv: Record<string, LotSalesOverride> | undefined,
  divisor: number,
  settlementRateMode: 'original' | 'modified' = 'modified'
) {
  const entries = lot.entries ?? [];
  const div = divisor > 0 ? divisor : 50;
  const itemLabel = String(lot.lotName || lot.commodityName || '—').trim() || '—';

  if (entries.length === 0) {
    return { ...mergeLotDisplayRowLegacy(lot, lotOv?.[sid], divisor, settlementRateMode), itemLabel };
  }

  if (entries.length > 1) {
    let totalQty = 0;
    let totalWeight = 0;
    let totalAmount = 0;
    let firstRate: number | undefined;
    for (let i = 0; i < entries.length; i++) {
      const row = mergeLotEntryDisplayRow(undefined, lot, i, lotOv, sid, divisor, settlementRateMode);
      totalQty += row.qty;
      totalWeight += row.weight;
      totalAmount += row.amount;
      if (firstRate === undefined) firstRate = row.ratePerBag;
    }
    const avg = totalQty > 0 ? totalWeight / totalQty : 0;
    return {
      itemLabel,
      qty: totalQty,
      weight: totalWeight,
      avg,
      ratePerBag: firstRate ?? 0,
      amount: totalAmount,
      divisor: div,
    };
  }

  const row = mergeLotEntryDisplayRow(undefined, lot, 0, lotOv, sid, divisor, settlementRateMode);
  return {
    itemLabel,
    qty: row.qty,
    weight: row.weight,
    avg: row.avg,
    ratePerBag: row.ratePerBag,
    amount: row.amount,
    divisor: row.divisor,
  };
}


/** Split merged lot quantity across bids in proportion to arrival quantities (matches weight distribution idea). */
export function distributeMergedQtyAcrossEntries(lot: SettlementLot, totalQty: number): number[] {
  const entries = lot.entries ?? [];
  const n = entries.length;
  if (n === 0) return [];
  const rounded = Math.max(0, Math.round(Number(totalQty) || 0));
  if (rounded <= 0) return entries.map(() => 0);
  const q0 = entries.map(e => Math.max(0, Math.round(Number(e.quantity) || 0)));
  const sum0 = q0.reduce((a, b) => a + b, 0);
  if (sum0 <= 0) {
    const base = Math.floor(rounded / n);
    const rem = rounded - base * n;
    return entries.map((_, i) => base + (i < rem ? 1 : 0));
  }
  const raw = q0.map(q => (q / sum0) * rounded);
  const fl = raw.map(x => Math.floor(x));
  const rem = rounded - fl.reduce((a, b) => a + b, 0);
  const ord = raw.map((x, i) => ({ i, r: x - fl[i] })).sort((a, b) => b.r - a.r);
  const out = [...fl];
  for (let k = 0; k < rem && k < ord.length; k++) out[ord[k].i]++;
  return out;
}


/**
 * One Sales Report row per buyer bid: qty / weight / rate are per-bid when a lot has multiple entries
 * (no automatic split of one lot-level weight across buyers).
 */
export function mergeLotEntryDisplayRow(
  seller: SellerSettlement | undefined,
  lot: SettlementLot,
  entryIndex: number,
  lotOv: Record<string, LotSalesOverride> | undefined,
  sid: string,
  divisor: number,
  settlementRateMode: 'original' | 'modified' = 'modified'
) {
  const entries = lot.entries ?? [];
  const n = entries.length;
  const lotIdLabel = seller ? formatSettlementAuctionLotIdentifier(seller, lot) : '';

  if (n === 0) {
    const base = lotBaseSalesRow(lot, divisor, settlementRateMode);
    return { ...base, itemLabel: lotIdLabel };
  }

  const e = entries[entryIndex];
  if (!e) {
    const base = lotBaseSalesRow(lot, divisor, settlementRateMode);
    return { ...base, itemLabel: lotIdLabel };
  }

  const entryKey = lotSalesOverrideStorageKey(sid, entryIndex, n);
  let o: LotSalesOverride | undefined = lotOv?.[entryKey];
  // Older pattis stored merged edits only on `sid`; map those to the first bid when multiple buyers exist.
  if (o === undefined && entryIndex === 0 && n > 1) {
    o = lotOv?.[sid];
  }

  const baseQty = e.quantity ?? 0;
  const baseWeight = e.weight ?? 0;
  const baseRate = settlementEffectiveRatePerBag(e, settlementRateMode);

  const qty = o?.qty !== undefined && Number.isFinite(o.qty) ? Math.max(0, Math.round(Number(o.qty))) : baseQty;
  const weight = o?.weight !== undefined && Number.isFinite(o.weight) ? o.weight : baseWeight;
  const ratePerBag =
    settlementRateMode === 'modified' && o?.ratePerBag !== undefined && Number.isFinite(o.ratePerBag)
      ? o.ratePerBag
      : baseRate;

  const div = divisor > 0 ? divisor : 50;
  const amount = roundMoney2((weight * ratePerBag) / div);
  const avg = qty > 0 ? weight / qty : 0;

  return {
    itemLabel: lotIdLabel,
    qty,
    weight,
    avg,
    ratePerBag,
    amount,
    divisor: div,
  };
}


/** Stable row id for delete/hide when `lotId` is missing from API. */
export function lotStableId(lot: SettlementLot, index: number): string {
  if (lot.lotId && String(lot.lotId).trim()) return String(lot.lotId).trim();
  return `__idx_${index}_${encodeURIComponent(lot.lotName || '')}_${encodeURIComponent(lot.commodityName || '')}`;
}


export function salesRowKeyApi(sid: string): SalesRowOrderKey {
  return `a:${sid}`;
}


export function salesRowKeyExtra(id: string): SalesRowOrderKey {
  return `e:${id}`;
}


export function parseSalesRowOrderKey(k: string): { type: 'api'; sid: string } | { type: 'extra'; id: string } | null {
  if (k.startsWith('a:')) return { type: 'api', sid: k.slice(2) };
  if (k.startsWith('e:')) return { type: 'extra', id: k.slice(2) };
  return null;
}


export function newExtraBidLotId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `eb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}


export function buildDefaultSalesRowOrder(
  seller: SellerSettlement,
  removedSet: Set<string>,
  extraLots: ExtraBidLot[]
): SalesRowOrderKey[] {
  const keys: SalesRowOrderKey[] = [];
  for (let i = 0; i < (seller.lots ?? []).length; i++) {
    const lot = seller.lots![i];
    const sid = lotStableId(lot, i);
    if (removedSet.has(sid)) continue;
    keys.push(salesRowKeyApi(sid));
  }
  for (const e of extraLots) keys.push(salesRowKeyExtra(e.id));
  return keys;
}


export function sanitizeSalesRowOrder(
  order: SalesRowOrderKey[] | undefined,
  seller: SellerSettlement,
  removedSet: Set<string>,
  extraLots: ExtraBidLot[]
): SalesRowOrderKey[] {
  const fallback = buildDefaultSalesRowOrder(seller, removedSet, extraLots);
  const validApi = new Set(
    (seller.lots ?? [])
      .map((lot, i) => lotStableId(lot, i))
      .filter(sid => !removedSet.has(sid))
  );
  const validExtra = new Set(extraLots.map(e => e.id));
  if (!order?.length) return fallback;
  const seen = new Set<SalesRowOrderKey>();
  const out: SalesRowOrderKey[] = [];
  for (const k of order) {
    const p = parseSalesRowOrderKey(k);
    if (!p) continue;
    if (p.type === 'api' && validApi.has(p.sid) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
    if (p.type === 'extra' && validExtra.has(p.id) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of fallback) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}


export function splitGroupHasRowKey(g: SplitGroupSnapshot, k: SalesRowOrderKey): boolean {
  return g.rowKeyA === k || g.rowKeyB === k;
}


export function getSalesRowKeyForTableRow(isExtraBid: boolean, sid: string): SalesRowOrderKey {
  return isExtraBid ? salesRowKeyExtra(sid) : salesRowKeyApi(sid);
}


export function addSlabChargesForLotWeight(
  lot: SettlementLot,
  actualW: number,
  nameToId: Map<string, number>,
  configById: Map<number, FullCommodityConfigDto>
): { unloading: number; weighing: number } {
  let unloading = 0;
  let weighing = 0;
  const cname = (lot.commodityName || '').trim();
  if (!cname) return { unloading, weighing };
  const cid = nameToId.get(cname.toLowerCase());
  if (cid == null) return { unloading, weighing };
  const full = configById.get(cid);
  if (!full?.config) return { unloading, weighing };

  const slabs = [...(full.hamaliSlabs ?? [])].sort((a, b) => a.thresholdWeight - b.thresholdWeight);
  const slab = slabs[0];
  if (slab && slab.thresholdWeight > 0) {
    unloading += computeSlabChargeTotal(actualW, slab.fixedRate, slab.thresholdWeight);
  }

  const cfg = full.config;
  const wTh = cfg.weighingThreshold ?? 0;
  const wCh = cfg.weighingCharge ?? 0;
  if (wTh > 0) {
    weighing += computeSlabChargeTotal(actualW, wCh, wTh);
  }
  return { unloading, weighing };
}


/** Lot-level unloading (hamali slab) + weighing (commodity threshold/charge) using Sales report weights. */
export function sumLotSlabChargesForSeller(
  seller: SellerSettlement,
  extraBidLots: ExtraBidLot[],
  removed: Set<string>,
  lotOv: Record<string, LotSalesOverride>,
  nameToId: Map<string, number>,
  configById: Map<number, FullCommodityConfigDto>,
  getDivisor: (lot: SettlementLot) => number
): { unloading: number; weighing: number } {
  let unloading = 0;
  let weighing = 0;
  seller.lots.forEach((lot, i) => {
    const sid = lotStableId(lot, i);
    if (removed.has(sid)) return;
    const merged = mergeLotDisplayRow(lot, sid, lotOv, getDivisor(lot));
    const actualW = merged.weight;
    const add = addSlabChargesForLotWeight(lot, actualW, nameToId, configById);
    unloading += add.unloading;
    weighing += add.weighing;
  });
  for (const e of extraBidLots) {
    const lot = settlementLotFromExtraBid(e);
    const merged = mergeLotDisplayRow(lot, '', undefined, getDivisor(lot));
    const add = addSlabChargesForLotWeight(lot, merged.weight, nameToId, configById);
    unloading += add.unloading;
    weighing += add.weighing;
  }
  return { unloading, weighing };
}


/**
 * Recompute commodity weighing slab total for a patti row (extensionJson + seller lots).
 * Used when hydrating legacy saves that merged weighing into `freight` with no `weighing` deduction line.
 */
export function inferWeighmanSlabHintForPattiHydration(
  p: PattiDTO,
  sellers: SellerSettlement[],
  commodityList: Commodity[],
  fullCommodityConfigs: FullCommodityConfigDto[],
  getLotDivisor: (lot: SettlementLot) => number
): number | undefined {
  const sidKey = String(p.sellerId ?? '').trim();
  if (!sidKey) return undefined;
  const sellerModel =
    sellers.find(s => s.sellerId === sidKey) ??
    ({
      sellerId: sidKey,
      sellerName: (p.sellerName ?? '').trim(),
      sellerMark: '',
      vehicleNumber: '',
      lots: [],
    } as SellerSettlement);
  const parsed = parsePattiExtensionJson(p.extensionJson);
  const removed = new Set(parsed?.removedLotIds ?? []);
  const lotOv = parsed?.lotOverrides ?? {};
  const extraLots = parsed?.extraBidLots ?? [];
  if ((sellerModel.lots?.length ?? 0) === 0 && extraLots.length === 0) return undefined;
  const nameToId = new Map<string, number>();
  for (const c of commodityList) {
    const name = String(c.commodity_name ?? '').trim().toLowerCase();
    const id = Number(c.commodity_id);
    if (name && Number.isFinite(id)) nameToId.set(name, id);
  }
  const configById = new Map(fullCommodityConfigs.map(c => [c.commodityId, c]));
  const { weighing } = sumLotSlabChargesForSeller(
    sellerModel,
    extraLots,
    removed,
    lotOv,
    nameToId,
    configById,
    getLotDivisor
  );
  const w = roundMoney2(weighing);
  return w > 0 ? w : undefined;
}


/** Per-seller slab sums + qty/weight for vehicle; shared by Quick Adjustment modal and expense auto-pull. */
export function buildSellerSlabChargeBaseForPattiSellers(
  arrivalSellersForPatti: SellerSettlement[],
  removedLotsBySellerId: Record<string, string[]>,
  lotSalesOverridesBySellerId: Record<string, Record<string, LotSalesOverride>>,
  extraBidLotsBySellerId: Record<string, ExtraBidLot[]>,
  nameToId: Map<string, number>,
  configById: Map<number, FullCommodityConfigDto>,
  getDivisor: (lot: SettlementLot) => number
): Array<{
  sellerId: string;
  sellerName: string;
  quantity: number;
  unloading: number;
  weighing: number;
  actualWeight: number;
}> {
  return arrivalSellersForPatti.map(s => {
    const removed = new Set(removedLotsBySellerId[s.sellerId] ?? []);
    const lotOv = lotSalesOverridesBySellerId[s.sellerId] ?? {};
    const extras = extraBidLotsBySellerId[s.sellerId] ?? [];
    const { unloading, weighing } = sumLotSlabChargesForSeller(
      s,
      extras,
      removed,
      lotOv,
      nameToId,
      configById,
      getDivisor
    );
    const actualWeight =
      s.lots.reduce((sum, lot, i) => {
        const sid = lotStableId(lot, i);
        if (removed.has(sid)) return sum;
        const merged = mergeLotDisplayRow(lot, sid, lotOv, getDivisor(lot));
        return sum + (Number(merged.weight) || 0);
      }, 0) +
      extras.reduce((sum, e) => {
        const lot = settlementLotFromExtraBid(e);
        const merged = mergeLotDisplayRow(lot, '', undefined, getDivisor(lot));
        return sum + (Number(merged.weight) || 0);
      }, 0);
    const qty = Math.max(
      0,
      Math.round(
        s.lots.reduce((sum, lot, i) => {
          const sid = lotStableId(lot, i);
          if (removed.has(sid)) return sum;
          const merged = mergeLotDisplayRow(lot, sid, lotOv, getDivisor(lot));
          return sum + (Number(merged.qty) || 0);
        }, 0) +
          extras.reduce((sum, e) => {
            const lot = settlementLotFromExtraBid(e);
            const merged = mergeLotDisplayRow(lot, '', undefined, getDivisor(lot));
            return sum + (Number(merged.qty) || 0);
          }, 0)
      )
    );
    return {
      sellerId: s.sellerId,
      sellerName: s.sellerName || 'Seller',
      quantity: qty,
      unloading,
      weighing,
      actualWeight,
    };
  });
}


export function buildRateClustersFromSellerLots(
  seller: SellerSettlement,
  removedIds: Set<string>,
  lotOverrides?: Record<string, LotSalesOverride>,
  getDivisor?: (lot: SettlementLot) => number,
  extraBidLots?: ExtraBidLot[],
  settlementRateMode: 'original' | 'modified' = 'modified'
): RateCluster[] {
  const divFn = getDivisor ?? (() => 50);
  const rateMap = new Map<number, RateCluster>();
  const pushRow = (row: ReturnType<typeof mergeLotDisplayRow>) => {
    const ratePerBag = row.ratePerBag;
    const qty = row.qty;
    const weight = row.weight;
    const amount = row.amount;
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
  };
  seller.lots.forEach((lot, i) => {
    const sid = lotStableId(lot, i);
    if (removedIds.has(sid)) return;
    const ov = lotOverrides?.[sid];
    pushRow(mergeLotDisplayRow(lot, sid, lotOverrides, divFn(lot), settlementRateMode));
  });
  for (const e of extraBidLots ?? []) {
    const lot = settlementLotFromExtraBid(e);
    pushRow(mergeLotDisplayRow(lot, '', undefined, divFn(lot), settlementRateMode));
  }
  return Array.from(rateMap.values()).sort((a, b) => b.rate - a.rate);
}


export function defaultSellerExpenses(): SellerExpenseFormState {
  return { freight: 0, unloading: 0, weighman: 0, cashAdvance: 0, gunnies: 0, others: 0 };
}


/** Quick Adjustment: amounts from expense card; quantities/names from slab base rows. */
export function rowsFromExpenseCardAndSlabQuantities(
  sellerComputedBase: Array<{ sellerId: string; sellerName: string; quantity: number }>,
  sellerExpensesById: Record<string, SellerExpenseFormState>
): VehicleExpenseRow[] {
  return sellerComputedBase.map(s => {
    const exp = sellerExpensesById[s.sellerId] ?? defaultSellerExpenses();
    return {
      id: `ve_${s.sellerId}`,
      sellerId: s.sellerId,
      sellerName: s.sellerName,
      quantity: s.quantity,
      freight: roundMoney2(exp.freight),
      unloading: roundMoney2(exp.unloading),
      weighing: roundMoney2(exp.weighman),
      gunnies: roundMoney2(exp.gunnies),
    };
  });
}


/** Fresh slab + bag distribution only (no DB hydrate, no expense-card freight/unloading/weighing). Gunnies kept per seller from `gunniesBySellerId`. */
export function buildVehicleExpenseRowsComputedFromSlabs(
  sellerComputedBase: Array<{
    sellerId: string;
    sellerName: string;
    quantity: number;
    unloading: number;
    weighing: number;
    actualWeight: number;
  }>,
  freightTotal: number,
  equalShareFreight: number,
  gunniesBySellerId: Record<string, number>
): VehicleExpenseRow[] {
  const nSellers = sellerComputedBase.length;
  const totalActualWeightOnSettlement = sellerComputedBase.reduce((sum, s) => sum + s.actualWeight, 0);
  const perKgFreight = totalActualWeightOnSettlement > 0 ? freightTotal / totalActualWeightOnSettlement : 0;
  const unloadingTotal = sellerComputedBase.reduce((sum, s) => sum + (Number(s.unloading) || 0), 0);
  const weighingTotal = sellerComputedBase.reduce((sum, s) => sum + (Number(s.weighing) || 0), 0);
  const totalQtyOnSettlement = sellerComputedBase.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
  const perBagUnloading = totalQtyOnSettlement > 0 ? unloadingTotal / totalQtyOnSettlement : 0;
  const perBagWeighing = totalQtyOnSettlement > 0 ? weighingTotal / totalQtyOnSettlement : 0;
  const equalShareUnloading = nSellers > 0 ? unloadingTotal / nSellers : 0;
  const equalShareWeighing = nSellers > 0 ? weighingTotal / nSellers : 0;

  return sellerComputedBase.map(s => {
    const freight = roundMoney2(
      perKgFreight > 0 ? perKgFreight * s.actualWeight : equalShareFreight
    );
    const unloading = roundMoney2(
      perBagUnloading > 0
        ? perBagUnloading * s.quantity
        : equalShareUnloading > 0
          ? equalShareUnloading
          : s.unloading
    );
    const weighing = roundMoney2(
      perBagWeighing > 0
        ? perBagWeighing * s.quantity
        : equalShareWeighing > 0
          ? equalShareWeighing
          : s.weighing
    );
    return {
      id: `ve_${s.sellerId}`,
      sellerId: s.sellerId,
      sellerName: s.sellerName,
      quantity: s.quantity,
      freight,
      unloading,
      weighing,
      gunnies: roundMoney2(gunniesBySellerId[s.sellerId] ?? 0),
    };
  });
}


export function vehicleExpenseOriginalsFromRows(rows: VehicleExpenseRow[]): Record<string, VehicleExpenseFieldValues> {
  return rows.reduce<Record<string, VehicleExpenseFieldValues>>((acc, row) => {
    acc[row.id] = {
      freight: row.freight,
      unloading: row.unloading,
      weighing: row.weighing,
      gunnies: row.gunnies,
    };
    return acc;
  }, {});
}


export function moneyNearEqual(a: number, b: number): boolean {
  return Math.abs(roundMoney2(a) - roundMoney2(b)) < 0.005;
}


/** Main vehicle patti number for print (e.g. "16"), not seller sub-card "16-2". */
export function mainPattiNumberForDisplay(displayMainFromMemo: string, pattiId: string): string {
  const d = String(displayMainFromMemo || '').trim();
  if (d) return d;
  const raw = String(pattiId || '').trim();
  const m = raw.match(/^(.*)-\d+$/);
  return (m ? m[1] : raw) || '-';
}


export function defaultSellerForm(seller: SellerSettlement): SellerRegFormState {
  const linked = seller.contactId != null && String(seller.contactId).trim() !== '';
  return {
    registrationChosen: false,
    registered: false,
    contactId: linked ? String(seller.contactId) : null,
    replacementSellerId: null,
    mark: seller.sellerMark || '',
    name: seller.sellerName || '',
    mobile: (seller.sellerPhone ?? '').trim(),
    contactSearchQuery: '',
    addAndChangeSeller: false,
    allowRegisteredEdit: false,
    unregisteredPrintConfirmed: false,
  };
}


export function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  );
}
