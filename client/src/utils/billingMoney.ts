/** Round to exactly 2 decimal places (half away from zero). */
export function roundMoney2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** INR display: always two fractional digits (e.g. 12 → 12.00). */
export function formatBillingInr(n: number): string {
  return roundMoney2(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function gstOnSubtotal(subtotal: number, gstRatePercent: number): number {
  return roundMoney2(subtotal * (gstRatePercent || 0) / 100);
}

/**
 * Single effective GST % for money calculations.
 * - If combined `gstRate` > 0, it wins (master rate from commodity / bill).
 * - Otherwise: intra-state = SGST + CGST; inter-state = IGST. SGST+CGST and IGST are
 *   alternatives — if both are filled, we take the larger (avoids double-counting).
 */
export function effectiveGstPercent(g: {
  gstRate?: number;
  sgstRate?: number;
  cgstRate?: number;
  igstRate?: number;
}): number {
  const combined = roundMoney2(Number(g.gstRate) || 0);
  if (combined > 0) return combined;
  const sgst = roundMoney2(Number(g.sgstRate) || 0);
  const cgst = roundMoney2(Number(g.cgstRate) || 0);
  const igst = roundMoney2(Number(g.igstRate) || 0);
  const intra = roundMoney2(sgst + cgst);
  if (igst > 0 && intra > 0) {
    return Math.max(igst, intra);
  }
  if (igst > 0) return igst;
  return intra;
}

/** Shape needed for split GST (₹ amount vs % per component). */
export type GstSplitGroup = {
  subtotal?: number;
  gstRate?: number;
  sgstRate?: number;
  cgstRate?: number;
  igstRate?: number;
  sgstInputMode?: 'PERCENT' | 'AMOUNT';
  cgstInputMode?: 'PERCENT' | 'AMOUNT';
  igstInputMode?: 'PERCENT' | 'AMOUNT';
  sgstAmountFixed?: number;
  cgstAmountFixed?: number;
  igstAmountFixed?: number;
};

/**
 * Rupees for one SGST/CGST/IGST column. When input mode is ₹, uses stored fixed amount so value
 * stays stable when line items change subtotal (percent-only storage used to shrink ₹45 → ₹42).
 */
export function gstComponentRupees(g: GstSplitGroup, component: 'sgst' | 'cgst' | 'igst'): number {
  const sub = roundMoney2(Number(g.subtotal) || 0);
  if (component === 'sgst') {
    if (g.sgstInputMode === 'AMOUNT' && g.sgstAmountFixed != null && Number.isFinite(Number(g.sgstAmountFixed))) {
      return roundMoney2(Number(g.sgstAmountFixed));
    }
    return gstOnSubtotal(sub, roundMoney2(Number(g.sgstRate) || 0));
  }
  if (component === 'cgst') {
    if (g.cgstInputMode === 'AMOUNT' && g.cgstAmountFixed != null && Number.isFinite(Number(g.cgstAmountFixed))) {
      return roundMoney2(Number(g.cgstAmountFixed));
    }
    return gstOnSubtotal(sub, roundMoney2(Number(g.cgstRate) || 0));
  }
  if (g.igstInputMode === 'AMOUNT' && g.igstAmountFixed != null && Number.isFinite(Number(g.igstAmountFixed))) {
    return roundMoney2(Number(g.igstAmountFixed));
  }
  return gstOnSubtotal(sub, roundMoney2(Number(g.igstRate) || 0));
}

/** Total GST ₹ for a commodity group (matches `effectiveGstPercent` split rules, supports ₹-fixed components). */
export function totalGstRupeesForGroup(g: GstSplitGroup): number {
  const sub = roundMoney2(Number(g.subtotal) || 0);
  const combined = roundMoney2(Number(g.gstRate) || 0);
  if (combined > 0) return gstOnSubtotal(sub, combined);

  const sgstPart = gstComponentRupees(g, 'sgst');
  const cgstPart = gstComponentRupees(g, 'cgst');
  const igstPart = gstComponentRupees(g, 'igst');
  const intra = roundMoney2(sgstPart + cgstPart);
  if (igstPart > 0 && intra > 0) {
    return roundMoney2(Math.max(igstPart, intra));
  }
  if (igstPart > 0) return igstPart;
  return intra;
}

/** Refresh implied % fields from fixed ₹ when subtotal changes (keeps API/print rates aligned). */
export function syncGstRatesFromFixedAmounts<G extends GstSplitGroup>(g: G): G {
  const sub = roundMoney2(Number(g.subtotal) || 0);
  const next = { ...g };
  if (sub <= 0) {
    if (next.sgstInputMode === 'AMOUNT' && next.sgstAmountFixed != null) next.sgstRate = 0;
    if (next.cgstInputMode === 'AMOUNT' && next.cgstAmountFixed != null) next.cgstRate = 0;
    if (next.igstInputMode === 'AMOUNT' && next.igstAmountFixed != null) next.igstRate = 0;
    return next;
  }
  if (next.sgstInputMode === 'AMOUNT' && next.sgstAmountFixed != null && Number.isFinite(Number(next.sgstAmountFixed))) {
    next.sgstRate = roundMoney2((Number(next.sgstAmountFixed) * 100) / sub);
  }
  if (next.cgstInputMode === 'AMOUNT' && next.cgstAmountFixed != null && Number.isFinite(Number(next.cgstAmountFixed))) {
    next.cgstRate = roundMoney2((Number(next.cgstAmountFixed) * 100) / sub);
  }
  if (next.igstInputMode === 'AMOUNT' && next.igstAmountFixed != null && Number.isFinite(Number(next.igstAmountFixed))) {
    next.igstRate = roundMoney2((Number(next.igstAmountFixed) * 100) / sub);
  }
  return next;
}

export function percentOfAmount(amount: number, percent: number): number {
  return roundMoney2(amount * (percent || 0) / 100);
}

/** Subtotal + commission + user fee + coolie + weighman + GST (for discount base). */
export function billGroupSubtotalWithTaxAndCharges(g: {
  subtotal: number;
  commissionAmount?: number;
  userFeeAmount?: number;
  coolieAmount?: number;
  weighmanChargeAmount?: number;
  gstRate?: number;
  sgstRate?: number;
  cgstRate?: number;
  igstRate?: number;
  sgstInputMode?: 'PERCENT' | 'AMOUNT';
  cgstInputMode?: 'PERCENT' | 'AMOUNT';
  igstInputMode?: 'PERCENT' | 'AMOUNT';
  sgstAmountFixed?: number;
  cgstAmountFixed?: number;
  igstAmountFixed?: number;
}): number {
  return roundMoney2(
    roundMoney2(g.subtotal || 0)
      + roundMoney2(g.commissionAmount || 0)
      + roundMoney2(g.userFeeAmount || 0)
      + roundMoney2(g.coolieAmount || 0)
      + roundMoney2(g.weighmanChargeAmount || 0)
      + totalGstRupeesForGroup(g),
  );
}

/**
 * Commodity net ₹ before round-off (matches BillingPage `recalcGrandTotal`: subtotal + bundled charges
 * + coolie + weighman − discount).
 */
export function commodityPreRoundTotalRupees(group: {
  subtotal: number;
  totalCharges?: number;
  coolieAmount?: number;
  weighmanChargeAmount?: number;
  discount?: number;
  discountType?: string;
}): number {
  const subtotalWithCharges = roundMoney2(
    roundMoney2(Number(group.subtotal) || 0) + roundMoney2(Number(group.totalCharges) || 0),
  );
  const additionsSum = roundMoney2(
    roundMoney2(Number(group.coolieAmount) || 0) + roundMoney2(Number(group.weighmanChargeAmount) || 0),
  );
  let discountAmount = roundMoney2(Number(group.discount) || 0);
  if (String(group.discountType || 'AMOUNT').toUpperCase() === 'PERCENT') {
    discountAmount = percentOfAmount(subtotalWithCharges, discountAmount);
  }
  return roundMoney2(subtotalWithCharges + additionsSum - discountAmount);
}

/**
 * Signed adjustment so `amountBeforeRoundOff + delta` is a whole rupee: fractional part strictly below 0.50 → floor,
 * else ceil (half-up toward +∞ for positive amounts; mirrored for negatives).
 */
export function rupeeWholeRoundOffDelta(amountBeforeRoundOff: number): number {
  const a = roundMoney2(amountBeforeRoundOff);
  if (!Number.isFinite(a)) return 0;
  if (a === 0) return 0;
  const sign = a > 0 ? 1 : -1;
  const abs = roundMoney2(Math.abs(a));
  const intPart = Math.floor(abs);
  const frac = roundMoney2(abs - intPart);
  const roundedAbs = frac < 0.5 ? intPart : intPart + 1;
  const rounded = roundMoney2(sign * roundedAbs);
  return roundMoney2(rounded - a);
}
