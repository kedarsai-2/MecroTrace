/**
 * Canonical auction lot identifier (Sales Pad, Billing, Logistics, print hub).
 * Format: {vehicleMark}-{vehicleTotalQty}/{sellerMark}-{sellerTotalQty}/{lotName}/{lotQty}
 * Example: AB-200/SA-122/SA1/22
 * When marks are blank, segments fall back to qty-only (e.g. 200/122/SA1/22).
 */
export function formatAuctionLotIdentifier(parts: {
  vehicleMark?: string | null;
  vehicleTotalQty: number;
  sellerMark?: string | null;
  sellerTotalQty: number;
  lotName: string;
  lotQty: number;
}): string {
  const vm = String(parts.vehicleMark ?? '').trim();
  const sm = String(parts.sellerMark ?? '').trim();
  const vq = Number(parts.vehicleTotalQty);
  const sq = Number(parts.sellerTotalQty);
  const vSeg = Number.isFinite(vq) ? (vm ? `${vm}-${vq}` : String(vq)) : '0';
  const sSeg = Number.isFinite(sq) ? (sm ? `${sm}-${sq}` : String(sq)) : '0';
  const lotQty = Number(parts.lotQty);
  const lq = Number.isFinite(lotQty) ? lotQty : 0;
  const ln = String(parts.lotName ?? '').trim() || String(lq);
  return `${vSeg}/${sSeg}/${ln}/${lq}`;
}
