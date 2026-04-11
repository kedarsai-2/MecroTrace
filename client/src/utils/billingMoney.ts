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
}): number {
  return roundMoney2(
    roundMoney2(g.subtotal || 0)
      + roundMoney2(g.commissionAmount || 0)
      + roundMoney2(g.userFeeAmount || 0)
      + roundMoney2(g.coolieAmount || 0)
      + roundMoney2(g.weighmanChargeAmount || 0)
      + gstOnSubtotal(g.subtotal || 0, effectiveGstPercent(g)),
  );
}
