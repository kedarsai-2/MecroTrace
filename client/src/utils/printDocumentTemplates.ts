// ── Print document HTML for Billing, Settlement, Weighing ───
// Same format as client_origin; used with directPrint() + printLogApi.

const PRINT_STYLES = `
  body { font-family: system-ui, sans-serif; margin: 0; padding: 12px; font-size: 12px; color: #111; }
  .wrap { max-width: 400px; margin: 0 auto; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .bolder { font-weight: 800; }
  .muted { color: #666; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .section { border-bottom: 1px dashed #ccc; padding-bottom: 8px; margin-bottom: 8px; }
  .section-t { border-top: 1px dashed #ccc; padding-top: 8px; margin-top: 8px; }
  .foot { font-size: 9px; color: #888; }
  .total { font-size: 14px; }
  .grand { font-size: 18px; font-weight: 800; color: #059669; }
  .destructive { color: #dc2626; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 4px; }
  .text-right { text-align: right; }
  @media print { body { padding: 4px; } }
`;

// ── Sales Bill (BillingPage) ───────────────────────────────
export interface BillPrintData {
  billId: string;
  billNumber: string;
  buyerName: string;
  buyerMark: string;
  billingName: string;
  billDate: string;
  outboundVehicle?: string;
  commodityGroups: {
    commodityName: string;
    hsnCode?: string;
    gstRate?: number;
    commissionPercent: number;
    userFeePercent: number;
    items: { quantity: number; weight: number; newRate: number; amount: number }[];
    subtotal: number;
    commissionAmount: number;
    userFeeAmount: number;
  }[];
  buyerCoolie: number;
  outboundFreight: number;
  discount: number;
  discountType: 'PERCENT' | 'AMOUNT';
  manualRoundOff: number;
  grandTotal: number;
}

export function generateSalesBillPrintHTML(bill: BillPrintData): string {
  const dateStr = new Date(bill.billDate).toLocaleDateString();
  let body = `
    <div class="wrap">
      <div class="center section">
        <p class="bold">MERCOTRACE</p>
        <p class="muted">Sales Bill (Buyer Invoice)</p>
        <p class="muted">${dateStr}</p>
      </div>
      <div class="section">
        <div class="row"><span class="muted">Bill No.</span><span class="bold">${bill.billNumber || 'DRAFT'}</span></div>
        <div class="row"><span class="muted">Buyer</span><span class="bold">${escapeHtml(bill.billingName)} (${escapeHtml(bill.buyerMark)})</span></div>
        ${bill.outboundVehicle ? `<div class="row"><span class="muted">Out Vehicle</span><span class="bold">${escapeHtml(bill.outboundVehicle)}</span></div>` : ''}
      </div>
  `;
  for (const group of bill.commodityGroups) {
    body += `
      <div class="section">
        <p class="bold">${escapeHtml(group.commodityName)}${group.hsnCode ? ` (HSN: ${escapeHtml(group.hsnCode)})` : ''}${(group.gstRate ?? 0) > 0 ? ` · GST: ${group.gstRate}%` : ''}</p>
        ${group.items.map((item) => `
          <div class="row" style="font-size:10px">
            <span>${item.quantity}×${item.weight.toFixed(0)}kg @₹${item.newRate}</span>
            <span class="bold">₹${item.amount.toLocaleString()}</span>
          </div>
        `).join('')}
        <div class="section-t" style="border-top-style:dotted">
          <div class="row"><span class="muted">Subtotal</span><span>₹${group.subtotal.toLocaleString()}</span></div>
          ${group.commissionPercent > 0 ? `<div class="row"><span class="muted">Commission (${group.commissionPercent}%)</span><span>₹${group.commissionAmount.toLocaleString()}</span></div>` : ''}
          ${group.userFeePercent > 0 ? `<div class="row"><span class="muted">User Fee (${group.userFeePercent}%)</span><span>₹${group.userFeeAmount.toLocaleString()}</span></div>` : ''}
          ${(group.gstRate ?? 0) > 0 ? `<div class="row"><span class="muted">GST (${group.gstRate}%)</span><span>₹${Math.round(group.subtotal * (group.gstRate ?? 0) / 100).toLocaleString()}</span></div>` : ''}
        </div>
      </div>
    `;
  }
  if (bill.buyerCoolie > 0 || bill.outboundFreight > 0) {
    body += `
      <div class="section">
        <p class="bold">ADDITIONS</p>
        ${bill.buyerCoolie > 0 ? `<div class="row"><span class="muted">Buyer Coolie</span><span>₹${bill.buyerCoolie.toLocaleString()}</span></div>` : ''}
        ${bill.outboundFreight > 0 ? `<div class="row"><span class="muted">Outbound Freight</span><span>₹${bill.outboundFreight.toLocaleString()}</span></div>` : ''}
      </div>
    `;
  }
  const subtotalSum = bill.commodityGroups.reduce((s, g) => s + g.subtotal, 0);
  const discountAmount = bill.discountType === 'PERCENT' ? Math.round(subtotalSum * bill.discount / 100) : bill.discount;
  body += `
      <div class="section">
        <p class="bold">TAX SUMMARY</p>
        ${bill.commodityGroups.filter((g) => g.commissionPercent > 0 || g.userFeePercent > 0 || (g.gstRate ?? 0) > 0).map((g) => `
          <div style="font-size:10px">
            <span class="muted">${escapeHtml(g.commodityName)}:</span>
            ${g.commissionPercent > 0 ? `<div class="row" style="padding-left:8px"><span>Commission</span><span>₹${g.commissionAmount}</span></div>` : ''}
            ${g.userFeePercent > 0 ? `<div class="row" style="padding-left:8px"><span>User Fee</span><span>₹${g.userFeeAmount}</span></div>` : ''}
            ${(g.gstRate ?? 0) > 0 ? `<div class="row" style="padding-left:8px"><span>GST (${g.gstRate}%)</span><span>₹${Math.round(g.subtotal * (g.gstRate ?? 0) / 100).toLocaleString()}</span></div>` : ''}
          </div>
        `).join('')}
      </div>
      ${bill.discount > 0 ? `<div class="row"><span class="muted">Discount</span><span class="destructive">−₹${discountAmount}</span></div>` : ''}
      ${bill.manualRoundOff !== 0 ? `<div class="row"><span class="muted">Round Off</span><span>${bill.manualRoundOff > 0 ? '+' : ''}₹${bill.manualRoundOff}</span></div>` : ''}
      <div class="row total section-t">
        <span class="bold">GRAND TOTAL</span>
        <span class="grand">₹${bill.grandTotal.toLocaleString()}</span>
      </div>
      <div class="center foot section-t">
        <p>NR = B + P + BRK + Other</p>
        <p>GT = Σ(Commodity Totals) + Additions − Discount + Round Off</p>
      </div>
      <div class="center section-t"><p class="muted">--- END OF BILL ---</p></div>
    </div>
  `;
  return wrapPrintDocument(body);
}

// ── Sales Patti (SettlementPage) ─────────────────────────
export interface PattiPrintData {
  pattiId: string;
  sellerName: string;
  rateClusters: { rate: number; totalQuantity: number; totalWeight: number; amount: number }[];
  grossAmount: number;
  deductions: { key: string; label: string; amount: number; autoPulled?: boolean }[];
  totalDeductions: number;
  netPayable: number;
  createdAt: string;
  useAverageWeight?: boolean;
}

export function generateSalesPattiPrintHTML(patti: PattiPrintData): string {
  const dateStr = new Date(patti.createdAt).toLocaleDateString();
  const timeStr = new Date(patti.createdAt).toLocaleTimeString();
  let body = `
    <div class="wrap">
      <div class="center section">
        <p class="bold">MERCOTRACE</p>
        <p class="muted">Sales Patti (Settlement)</p>
        <p class="muted">${dateStr} ${timeStr}</p>
      </div>
      <div class="section">
        <div class="row"><span class="muted">Patti ID</span><span class="bold">${patti.pattiId || '(New Patti)'}</span></div>
        <div class="row"><span class="muted">Seller</span><span class="bold">${escapeHtml(patti.sellerName)}</span></div>
        ${patti.useAverageWeight ? '<div class="row"><span class="muted">Mode</span><span class="bold" style="color:#d97706">AVG WEIGHT (Quick Close)</span></div>' : ''}
      </div>
      <div class="section">
        <p class="bold">RATE CLUSTERS</p>
        ${patti.rateClusters.map((c) => `
          <div class="row">
            <span>${c.totalQuantity} bags @ ₹${c.rate} (${c.totalWeight.toFixed(0)}kg)</span>
            <span class="bold">₹${c.amount.toLocaleString()}</span>
          </div>
        `).join('')}
      </div>
      <div class="row bold"><span>Gross Amount</span><span>₹${patti.grossAmount.toLocaleString()}</span></div>
      <div class="section">
        <p class="bold">DEDUCTIONS</p>
        ${patti.deductions.filter((d) => d.amount > 0).map((d) => `
          <div class="row">
            <span class="muted">${escapeHtml(d.label)}${d.autoPulled ? ' (Auto)' : ''}</span>
            <span class="destructive">−₹${d.amount.toLocaleString()}</span>
          </div>
        `).join('')}
        <div class="row bold section-t">
          <span>Total Deductions</span>
          <span class="destructive">−₹${patti.totalDeductions.toLocaleString()}</span>
        </div>
      </div>
      <div class="row total section-t">
        <span class="bold">NET PAYABLE</span>
        <span class="grand">₹${patti.netPayable.toLocaleString()}</span>
      </div>
      <div class="center foot section-t">
        <p>GA = Σ (NW × SR)</p>
        <p>NP = GA − TD</p>
        <p>TD = Freight + Coolie + Weighing + Advance + Gunnies + Other</p>
      </div>
      <div class="center section-t"><p class="muted">--- END OF PATTI ---</p></div>
    </div>
  `;
  return wrapPrintDocument(body);
}

// ── Weighing Slip (WeighingPage) ──────────────────────────
export interface WeighingSlipPrintData {
  sessionId: string;
  bidNumber: number;
  bagWeights: { bagNumber: number; weight: number }[];
  originalWeight: number;
  deductions: number;
  netWeight: number;
  manualEntry: boolean;
  govtDeductionApplied: boolean;
  roundOffApplied: boolean;
}

// ── Auction Completion Slip (AuctionsPage) ─────────────────
export interface AuctionCompletionPrintData {
  auctionId: number | string;
  lotId: number | string;
  lotName: string;
  sellerName: string;
  vehicleNumber: string;
  commodityName: string;
  completedAt?: string;
  entries: {
    bidNumber: number;
    buyerMark: string;
    buyerName: string;
    rate: number;
    quantity: number;
    amount: number;
    presetApplied?: number;
    presetType?: 'PROFIT' | 'LOSS';
  }[];
}

export function generateAuctionCompletionPrintHTML(auction: AuctionCompletionPrintData): string {
  const completedAt = auction.completedAt ? new Date(auction.completedAt) : new Date();
  const dateStr = completedAt.toLocaleDateString();
  const timeStr = completedAt.toLocaleTimeString();
  const totalQty = auction.entries.reduce((s, e) => s + (Number(e.quantity) || 0), 0);
  const totalAmount = auction.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const highestRate = auction.entries.reduce((max, e) => Math.max(max, Number(e.rate) || 0), 0);
  const rows = auction.entries.map((entry) => {
    const preset = Number(entry.presetApplied ?? 0);
    const presetTxt = preset === 0 ? '—' : `${preset > 0 ? '+' : ''}${preset} (${entry.presetType ?? (preset < 0 ? 'LOSS' : 'PROFIT')})`;
    return `
      <div class="section" style="margin-bottom:6px;padding-bottom:6px">
        <div class="row"><span class="muted">Bid #</span><span class="bold">${entry.bidNumber}</span></div>
        <div class="row"><span class="muted">Buyer</span><span class="bold">${escapeHtml(entry.buyerName)} (${escapeHtml(entry.buyerMark)})</span></div>
        <div class="row"><span class="muted">Rate</span><span class="bold">₹${entry.rate}</span></div>
        <div class="row"><span class="muted">Preset</span><span>${presetTxt}</span></div>
        <div class="row"><span class="muted">Qty</span><span class="bold">${entry.quantity} bags</span></div>
        <div class="row"><span class="muted">Amount</span><span class="bold">₹${entry.amount.toLocaleString()}</span></div>
      </div>
    `;
  }).join('');

  const body = `
    <div class="wrap">
      <div class="center section">
        <p class="bold">MERCOTRACE</p>
        <p class="muted">Auction Completion</p>
        <p class="muted">${dateStr} ${timeStr}</p>
      </div>
      <div class="section">
        <div class="row"><span class="muted">Auction ID</span><span class="bold">${auction.auctionId}</span></div>
        <div class="row"><span class="muted">Lot</span><span class="bold">${escapeHtml(auction.lotName || String(auction.lotId))}</span></div>
        <div class="row"><span class="muted">Seller</span><span class="bold">${escapeHtml(auction.sellerName)}</span></div>
        <div class="row"><span class="muted">Vehicle</span><span class="bold">${escapeHtml(auction.vehicleNumber || '—')}</span></div>
        <div class="row"><span class="muted">Commodity</span><span class="bold">${escapeHtml(auction.commodityName || '—')}</span></div>
      </div>
      <div class="section">
        <p class="bold">BIDS (${auction.entries.length})</p>
        ${rows || '<p class="muted">No bids found.</p>'}
      </div>
      <div class="row"><span class="muted">Total Qty</span><span class="bold">${totalQty} bags</span></div>
      <div class="row"><span class="muted">Highest Rate</span><span class="bold">₹${highestRate.toLocaleString()}</span></div>
      <div class="row total section-t">
        <span class="bold">TOTAL SALE</span>
        <span class="grand">₹${totalAmount.toLocaleString()}</span>
      </div>
      <div class="center section-t"><p class="muted">--- END OF AUCTION ---</p></div>
    </div>
  `;

  return wrapPrintDocument(body);
}

export function generateWeighingSlipPrintHTML(slip: WeighingSlipPrintData, totalWeight: number): string {
  const avgWeight = slip.bagWeights.length > 0
    ? (slip.bagWeights.reduce((s, b) => s + b.weight, 0) / slip.bagWeights.length).toFixed(2)
    : '0.00';
  let body = `
    <div class="wrap">
      <div class="center section">
        <p class="bold">MERCOTRACE</p>
        <p class="muted">Weighing Slip</p>
        <p class="muted">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
      </div>
      <div class="section">
        <div class="row"><span class="muted">Bid #</span><span class="bold">${slip.bidNumber}</span></div>
        <div class="row"><span class="muted">Mode</span><span class="bold">${slip.manualEntry ? 'MANUAL' : 'DIGITAL SCALE'}</span></div>
        ${slip.govtDeductionApplied ? '<div class="row"><span class="muted">Govt Ded.</span><span class="bold">APPLIED</span></div>' : ''}
        ${slip.roundOffApplied ? '<div class="row"><span class="muted">Round Off</span><span class="bold">APPLIED</span></div>' : ''}
      </div>
      <div class="section">
        <p class="bold">BAG WEIGHTS (${slip.bagWeights.length})</p>
        <div class="grid4">
          ${slip.bagWeights.map((b) => `
            <div class="text-right"> <span class="muted" style="margin-right:4px">${b.bagNumber}.</span>${b.weight.toFixed(1)} </div>
          `).join('')}
        </div>
      </div>
      <div class="section">
        <div class="row"><span class="muted">Total Weight</span><span class="bold">${totalWeight.toFixed(2)} kg</span></div>
        <div class="row"><span class="muted">Original Wt (Legal)</span><span class="bold">${slip.originalWeight.toFixed(2)} kg</span></div>
        <div class="row"><span class="muted">Deductions</span><span class="bold destructive">−${slip.deductions.toFixed(2)} kg</span></div>
        <div class="row total section-t">
          <span class="bold">NET WEIGHT</span>
          <span class="grand">${slip.netWeight.toFixed(2)} kg</span>
        </div>
      </div>
      <div class="center foot section-t">
        <p>NW = OW − D</p>
        ${slip.bagWeights.length > 0 ? `<p>AW = Σ Wi ÷ n = ${avgWeight} kg</p>` : ''}
        ${slip.manualEntry ? '<p>⚠ Manual Entry: OW = 0 (no scale used)</p>' : ''}
      </div>
      <div class="center section-t"><p class="muted">--- END OF SLIP ---</p></div>
    </div>
  `;
  return wrapPrintDocument(body);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapPrintDocument(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PRINT_STYLES}</style></head><body>${body}</body></html>`;
}
