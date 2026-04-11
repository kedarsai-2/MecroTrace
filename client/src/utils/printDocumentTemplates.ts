// ── Print document HTML for Billing, Settlement, Weighing ───
// Same format as client_origin; used with directPrint() + printLogApi.

import { effectiveGstPercent, formatBillingInr, gstOnSubtotal, percentOfAmount, roundMoney2 } from '@/utils/billingMoney';

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

export interface DocumentPrintOptions {
  pageSize?: 'A4' | 'A5';
  includeHeader?: boolean;
}

function normalizeOptions(options?: DocumentPrintOptions): Required<DocumentPrintOptions> {
  return {
    pageSize: options?.pageSize === 'A5' ? 'A5' : 'A4',
    includeHeader: options?.includeHeader !== false,
  };
}

// ── Sales Bill (BillingPage) — GST layout + firm header ─────
export interface BillPrintFirmInfo {
  businessName: string;
  ownerName?: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  category?: string;
  gstNumber?: string;
  /** When omitted, PAN may be derived from a 15-character GSTIN. */
  panNumber?: string;
  rmcApmcCode?: string;
  mobile?: string;
  email?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  bankBranch?: string;
}

export interface BillPrintData {
  billId: string;
  billNumber: string;
  buyerName: string;
  buyerMark: string;
  billingName: string;
  billDate: string;
  buyerPhone?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerGstin?: string;
  outboundVehicle?: string;
  /** Seller / firm details for letterhead (from trader profile). */
  firm?: BillPrintFirmInfo | null;
  commodityGroups: {
    commodityName: string;
    hsnCode?: string;
    gstRate?: number;
    sgstRate?: number;
    cgstRate?: number;
    igstRate?: number;
    divisor: number;
    commissionPercent: number;
    commissionAmount: number;
    userFeePercent: number;
    userFeeAmount: number;
    coolieAmount?: number;
    weighmanChargeAmount?: number;
    discount?: number;
    discountType?: 'PERCENT' | 'AMOUNT';
    manualRoundOff?: number;
    items: {
      quantity: number;
      weight: number;
      newRate: number;
      amount: number;
      tokenAdvance?: number;
      lotName?: string;
      /** Total bags for the whole lot (used to build the lot identifier). */
      lotTotalQty?: number;
      bidNumber?: number;
      sellerName?: string;
    }[];
    subtotal: number;
    totalCharges?: number;
  }[];
  outboundFreight: number;
  grandTotal: number;
}

function panFromGstin(gst: string | undefined): string {
  const g = String(gst || '').replace(/\s/g, '').toUpperCase();
  if (g.length >= 12) return g.slice(2, 12);
  return '';
}

function numberToWordsInt(n: number): string {
  const x = Math.floor(Math.abs(n));
  if (x === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words(v: number): string {
    if (v < 20) return ones[v];
    if (v < 100) return tens[Math.floor(v / 10)] + (v % 10 ? ' ' + ones[v % 10] : '');
    if (v < 1000) return ones[Math.floor(v / 100)] + ' Hundred' + (v % 100 ? ' ' + words(v % 100) : '');
    if (v < 100000) return words(Math.floor(v / 1000)) + ' Thousand' + (v % 1000 ? ' ' + words(v % 1000) : '');
    if (v < 10000000) return words(Math.floor(v / 100000)) + ' Lakh' + (v % 100000 ? ' ' + words(v % 100000) : '');
    return words(Math.floor(v / 10000000)) + ' Crore' + (v % 10000000 ? ' ' + words(v % 10000000) : '');
  }
  return words(x);
}

function inrAmountToWords(amount: number): string {
  const rupees = Math.floor(Math.abs(roundMoney2(amount)));
  const paise = Math.round(Math.abs(roundMoney2(amount) * 100 - rupees * 100));
  const core = numberToWordsInt(rupees);
  if (paise > 0) return `${core} Rupees and ${numberToWordsInt(paise)} Paise`;
  return `${core} Rupees Only`;
}

function commodityNetTotal(group: BillPrintData['commodityGroups'][number]): number {
  const subtotalWithCharges = roundMoney2(roundMoney2(group.subtotal) + roundMoney2(group.totalCharges ?? 0));
  const additionsSum = roundMoney2((group.coolieAmount || 0) + (group.weighmanChargeAmount || 0));
  let discountAmount = roundMoney2(group.discount || 0);
  if (group.discountType === 'PERCENT') {
    discountAmount = percentOfAmount(subtotalWithCharges, discountAmount);
  }
  return roundMoney2(subtotalWithCharges + additionsSum - discountAmount + roundMoney2(group.manualRoundOff || 0));
}

/**
 * Lot identifier — mirrors BillingPage `formatLotIdentifierForBillEntry`:
 * "{lotTotalQty}/{lotTotalQty}/{lotName}-{lotTotalQty}"
 * Falls back gracefully when fields are absent.
 */
function formatLotIdentifierForPrint(
  item: BillPrintData['commodityGroups'][number]['items'][number],
): string {
  const lotQty  = Number(item.lotTotalQty ?? item.quantity ?? 0);
  const lotName = String(item.lotName || String(lotQty || ''));
  return `${lotQty}/${lotQty}/${lotName}-${lotQty}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GST Sales Bill (Buyer) — layout matches design spec image
// Header embedded in every commodity page; footer only on last page.
// ─────────────────────────────────────────────────────────────────────────────

function buildGstBillCSS(pageSize: 'A4' | 'A5'): string {
  return `
    @page { size: ${pageSize} portrait; margin: 10mm 8mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, 'Segoe UI', sans-serif;
      font-size: 9.5px;
      color: #111;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── PAGE WRAPPER ─────────────────────── */
    .pg { margin-bottom: 0; }
    .pg-break { page-break-after: always; }

    /* ── HEADER BOX (every page) ──────────── */
    .hdr { border: 1px solid #333; margin-bottom: 3px; }

    /* Row 1: 3-col strip */
    .hdr-row1 {
      display: grid;
      grid-template-columns: 1fr 1.5fr 1fr;
      border-bottom: 1px solid #333;
      min-height: 34px;
    }
    .hdr-left {
      padding: 5px 7px;
      font-size: 8.5px;
      line-height: 1.65;
      border-right: 1px solid #333;
    }
    .hdr-center {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 4px 6px;
      font-size: 8px;
      font-weight: 700;
      border-right: 1px solid #333;
    }
    .hdr-right {
      padding: 5px 7px;
      font-size: 8.5px;
      line-height: 1.65;
      text-align: right;
    }

    /* Row 2: Firm name band */
    .hdr-firm {
      text-align: center;
      padding: 7px 8px 5px;
      border-bottom: 1px solid #333;
    }
    .hdr-firm-name {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1.2;
    }
    .hdr-firm-sub {
      font-size: 8px;
      color: #333;
      margin-top: 2px;
    }

    /* Row 3: TAX INVOICE */
    .hdr-title {
      text-align: center;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.1em;
      padding: 3px 0;
      border-bottom: 1px solid #333;
    }

    /* Row 4: Buyer + Invoice 2-col */
    .hdr-buyer {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .buyer-l {
      padding: 5px 8px;
      border-right: 1px solid #333;
      font-size: 9px;
      line-height: 1.75;
    }
    .buyer-r {
      padding: 5px 8px;
      font-size: 9px;
      line-height: 1.75;
    }
    .buyer-r .bline {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .lbl { color: #555; }

    /* ── ITEM TABLE ───────────────────────── */
    .tbl-wrap { margin-bottom: 3px; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    table.items th, table.items td {
      border: 1px solid #333;
      padding: 4px 5px;
      vertical-align: middle;
    }
    table.items th {
      text-align: center;
      font-weight: 700;
      font-size: 8.5px;
    }
    table.items td.r { text-align: right; }
    table.items td.l { text-align: left; }
    table.items td.c { text-align: center; }
    tr.tot-row td {
      font-weight: 700;
      border-top: 2px solid #222;
    }

    /* ── FOOTER (last page only) ──────────── */
    .footer { margin-top: 3px; }

    /* 2-col: bank | charges */
    .footer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid #333;
      margin-bottom: 3px;
    }
    .bank-col {
      padding: 6px 8px;
      border-right: 1px solid #333;
      font-size: 8.5px;
      line-height: 1.5;
    }
    .bank-col .bank-title {
      font-size: 9px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .bank-col .bank-line { margin-bottom: 1px; }

    /* CGST / SGST / IGST table — 6-col horizontal */
    table.gtax {
      width: 100%;
      border-collapse: collapse;
      margin-top: 5px;
      font-size: 8px;
    }
    table.gtax th, table.gtax td {
      border: 1px solid #888;
      padding: 2px 3px;
      text-align: center;
    }
    table.gtax th { font-weight: 700; }

    /* Charges right column */
    .chg-col {
      padding: 6px 8px;
      font-size: 9px;
    }
    .chg-line {
      display: flex;
      justify-content: space-between;
      gap: 4px;
      padding: 2px 0;
    }
    .chg-sep {
      border-top: 1px solid #bbb;
      margin-top: 3px;
      padding-top: 4px;
    }
    .chg-bold { font-weight: 700; }
    .chg-grand {
      font-weight: 800;
      font-size: 10px;
      border-top: 2px solid #222;
      margin-top: 3px;
      padding-top: 3px;
    }

    /* Total Amount in Words */
    .words-strip {
      border: 1px solid #333;
      padding: 5px 8px;
      font-size: 9px;
      font-weight: 600;
      margin-bottom: 3px;
    }

    /* Bottom strip: COPY NAME | BUYER'S MARK | For FIRM NAME */
    .bot-strip {
      border: 1px solid #333;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      padding: 5px 8px;
      font-size: 9px;
      font-weight: 700;
      align-items: center;
      margin-bottom: 3px;
    }
    .bot-strip .mid { text-align: center; }
    .bot-strip .right { text-align: right; font-size: 8.5px; font-weight: 400; }

    /* Page number line */
    .page-line {
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #555;
      padding: 2px 0;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

/** Full per-page header: 3-col strip → firm band → TAX INVOICE → buyer 2-col */
function gstBillPageHeader(
  bill: BillPrintData,
  group: BillPrintData['commodityGroups'][number],
  includeHeader: boolean,
): string {
  const f = bill.firm;
  const gst  = escapeHtml((f?.gstNumber  || '—').trim());
  const pan  = escapeHtml((f?.panNumber  || panFromGstin(f?.gstNumber) || '—').trim());
  const apmc = escapeHtml((f?.rmcApmcCode || '—').trim());
  const firmName = escapeHtml((f?.businessName || 'Firm Name').trim());
  const about    = escapeHtml((f?.category || '').trim());
  const addr     = escapeHtml([f?.address, f?.city, f?.state, f?.pinCode].filter(Boolean).join(', ') || '—');
  const owner    = escapeHtml((f?.ownerName || '').trim());
  const phone    = escapeHtml((f?.mobile || '').trim());
  const email    = escapeHtml((f?.email || '').trim());

  const d = new Date(bill.billDate);
  const dateStr = Number.isNaN(d.getTime())
    ? escapeHtml(String(bill.billDate))
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const threeColStrip = includeHeader ? `
    <div class="hdr-row1">
      <div class="hdr-left">
        <div><span class="lbl">GST&nbsp;&nbsp;</span>${gst}</div>
        <div><span class="lbl">PAN&nbsp;&nbsp;</span>${pan}</div>
        <div><span class="lbl">APMC Code&nbsp;</span>${apmc}</div>
      </div>
      <div class="hdr-center">${about}</div>
      <div class="hdr-right">
        ${owner ? `<div>${owner}</div>` : ''}
        ${phone ? `<div>${phone}</div>` : ''}
        ${email ? `<div>${email}</div>` : ''}
      </div>
    </div>
    <div class="hdr-firm">
      <div class="hdr-firm-name">${firmName}</div>
      ${about ? `<div class="hdr-firm-sub">${about}</div>` : ''}
      <div class="hdr-firm-sub">${addr}</div>
    </div>` : '';

  const hsn = escapeHtml((group.hsnCode || '—').trim());
  const buyerName = escapeHtml((bill.billingName || bill.buyerName || '—').trim());
  const buyerAddr = escapeHtml((bill.buyerAddress || '—').trim());
  const contact   = escapeHtml([bill.buyerPhone, bill.buyerEmail].filter(Boolean).join(' / ') || '—');
  const buyerGst  = escapeHtml((bill.buyerGstin || '—').trim());
  const billNum   = escapeHtml(bill.billNumber || 'DRAFT');
  const commodity = escapeHtml(group.commodityName || '—');
  const vehicle   = bill.outboundVehicle ? `<div class="bline"><span class="lbl">Vehicle</span><span>${escapeHtml(bill.outboundVehicle)}</span></div>` : '';

  return `
  <div class="hdr">
    ${threeColStrip}
    <div class="hdr-title">TAX INVOICE</div>
    <div class="hdr-buyer">
      <div class="buyer-l">
        <div>To,</div>
        <div><span class="lbl">M/s&nbsp;</span><strong>${buyerName}</strong></div>
        <div><span class="lbl">Address&nbsp;</span>${buyerAddr}</div>
        <div><span class="lbl">Contact&nbsp;</span>${contact}</div>
        <div><span class="lbl">GSTIN&nbsp;</span>${buyerGst}</div>
      </div>
      <div class="buyer-r">
        <div class="bline"><span class="lbl">Bill No</span><strong>${billNum}</strong></div>
        <div class="bline"><span class="lbl">Bill Date</span><span>${dateStr}</span></div>
        ${timeStr ? `<div class="bline"><span class="lbl">Time</span><span>${escapeHtml(timeStr)}</span></div>` : ''}
        <div class="bline"><span class="lbl">Item</span><span>${commodity}</span></div>
        <div class="bline"><span class="lbl">HSN Code</span><span>${hsn}</span></div>
        ${vehicle}
      </div>
    </div>
  </div>`;
}

/** Item table with totals row */
function gstBillItemTable(group: BillPrintData['commodityGroups'][number]): string {
  const divisor = Number(group.divisor) > 0 ? Number(group.divisor) : 50;

  let totalQty = 0;
  let totalWt  = 0;
  let totalAmt = 0;

  const rows = group.items.map((item) => {
    const q = roundMoney2(Number(item.quantity) || 0);
    const w = roundMoney2(Number(item.weight) || 0);
    const a = roundMoney2(Number(item.amount) || 0);
    totalQty = roundMoney2(totalQty + q);
    totalWt  = roundMoney2(totalWt  + w);
    totalAmt = roundMoney2(totalAmt + a);
    const tok = (item.tokenAdvance ?? 0) > 0
      ? ` <span style="font-size:7.5px;color:#555">(Tok ₹${formatBillingInr(item.tokenAdvance ?? 0)})</span>`
      : '';
    return `<tr>
      <td class="l">${escapeHtml(formatLotIdentifierForPrint(item))}${tok}</td>
      <td class="r">${formatBillingInr(q)}</td>
      <td class="r">${formatBillingInr(w)}</td>
      <td class="r">${formatBillingInr(item.newRate)}</td>
      <td class="r">${formatBillingInr(a)}</td>
    </tr>`;
  }).join('');

  return `
  <div class="tbl-wrap">
    <table class="items">
      <thead>
        <tr>
          <th style="width:36%;text-align:left">Item</th>
          <th style="width:12%">Quantity</th>
          <th style="width:14%">Weight, kg</th>
          <th style="width:18%">Rate, ₹/${divisor} kg</th>
          <th style="width:20%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="tot-row">
          <td class="l">Total</td>
          <td class="r">${formatBillingInr(totalQty)}</td>
          <td class="r">${formatBillingInr(totalWt)}</td>
          <td></td>
          <td class="r">${formatBillingInr(totalAmt)}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

/** Footer block — only rendered on the LAST commodity page */
function gstBillFooter(
  bill: BillPrintData,
  group: BillPrintData['commodityGroups'][number],
  pageNum: number,
  totalPages: number,
): string {
  const f = bill.firm;

  /* ── Bank + GST table (left) ── */
  const sub   = roundMoney2(group.subtotal);
  const cgstR = roundMoney2(group.cgstRate ?? 0);
  const sgstR = roundMoney2(group.sgstRate ?? 0);
  const igstR = roundMoney2(group.igstRate ?? 0);
  const cgstA = cgstR > 0 ? gstOnSubtotal(sub, cgstR) : 0;
  const sgstA = sgstR > 0 ? gstOnSubtotal(sub, sgstR) : 0;
  const igstA = igstR > 0 ? gstOnSubtotal(sub, igstR) : 0;
  const totalTax = roundMoney2(cgstA + sgstA + igstA);

  const bankHtml = `
    <div class="bank-col">
      <div class="bank-title">Bank Account Information</div>
      <div class="bank-line">${escapeHtml((f?.bankName    || '—').trim())}</div>
      <div class="bank-line">A/c: ${escapeHtml((f?.bankAccount || '—').trim())}</div>
      <div class="bank-line">IFSC: ${escapeHtml((f?.bankIfsc   || '—').trim())}</div>
      ${f?.bankBranch ? `<div class="bank-line">${escapeHtml(f.bankBranch)}</div>` : ''}
      <table class="gtax">
        <thead>
          <tr>
            <th colspan="2">CGST</th>
            <th colspan="2">SGST</th>
            <th colspan="2">IGST</th>
          </tr>
          <tr>
            <th>Rate</th><th>Amount</th>
            <th>Rate</th><th>Amount</th>
            <th>Rate</th><th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${cgstR > 0 ? formatBillingInr(cgstR) + '%' : '—'}</td>
            <td>${cgstA > 0 ? formatBillingInr(cgstA) : '—'}</td>
            <td>${sgstR > 0 ? formatBillingInr(sgstR) + '%' : '—'}</td>
            <td>${sgstA > 0 ? formatBillingInr(sgstA) : '—'}</td>
            <td>${igstR > 0 ? formatBillingInr(igstR) + '%' : '—'}</td>
            <td>${igstA > 0 ? formatBillingInr(igstA) : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  /* ── Charges (right) ── */
  const commAmt   = roundMoney2(group.commissionAmount || 0);
  const userAmt   = roundMoney2(group.userFeeAmount    || 0);
  const handling  = roundMoney2((group.coolieAmount || 0) + (group.weighmanChargeAmount || 0));
  const net       = commodityNetTotal(group);
  const fr        = roundMoney2(bill.outboundFreight || 0);
  const grandTot  = bill.grandTotal;

  const subtotalWithCharges = roundMoney2(sub + roundMoney2(group.totalCharges ?? 0));
  let discAmt = roundMoney2(group.discount || 0);
  if (group.discountType === 'PERCENT') discAmt = percentOfAmount(subtotalWithCharges, discAmt);

  const charge1Label = commAmt > 0
    ? (group.commissionPercent > 0 ? `Commission (${formatBillingInr(group.commissionPercent)}%)` : 'Charge 1')
    : 'Charge 1';
  const charge2Label = userAmt > 0
    ? (group.userFeePercent > 0 ? `User Fee (${formatBillingInr(group.userFeePercent)}%)` : 'Charge 2')
    : 'Charge 2';
  const charge3Label = handling > 0 ? 'Coolie / Weighman' : 'Charge 3';

  const optLine = (show: boolean, label: string, val: string) =>
    show ? `<div class="chg-line"><span>${label}</span><span>${val}</span></div>` : '';

  const chargesHtml = `
    <div class="chg-col">
      <div class="chg-line"><span>${escapeHtml(charge1Label)}</span><span>${commAmt > 0 ? '₹' + formatBillingInr(commAmt) : '—'}</span></div>
      <div class="chg-line"><span>${escapeHtml(charge2Label)}</span><span>${userAmt > 0 ? '₹' + formatBillingInr(userAmt) : '—'}</span></div>
      <div class="chg-line"><span>${escapeHtml(charge3Label)}</span><span>${handling > 0 ? '₹' + formatBillingInr(handling) : '—'}</span></div>
      ${optLine(discAmt > 0, 'Discount', '−₹' + formatBillingInr(discAmt))}
      ${optLine(roundMoney2(group.manualRoundOff || 0) !== 0, 'Round Off', ((group.manualRoundOff ?? 0) > 0 ? '+' : '') + '₹' + formatBillingInr(group.manualRoundOff ?? 0))}
      <div class="chg-line chg-sep"><span>Taxable Amount</span><span>₹${formatBillingInr(sub)}</span></div>
      <div class="chg-line chg-bold"><span>Total Tax</span><span>${totalTax > 0 ? '₹' + formatBillingInr(totalTax) : '—'}</span></div>
      <div class="chg-line chg-grand"><span>Total Amount</span><span>₹${formatBillingInr(net)}</span></div>
      ${optLine(fr > 0, 'Outbound Freight', '₹' + formatBillingInr(fr))}
      ${totalPages > 1 || fr > 0 ? `<div class="chg-line chg-grand" style="margin-top:4px"><span>Bill Grand Total</span><span>₹${formatBillingInr(grandTot)}</span></div>` : ''}
    </div>`;

  /* ── Amount in words ── */
  const wordsAmt   = totalPages > 1 ? grandTot : net;
  const wordsStr   = inrAmountToWords(wordsAmt);

  /* ── Firm sign name ── */
  const firmSign = escapeHtml((f?.businessName || '').trim() || 'Firm Name');

  return `
  <div class="footer">
    <div class="footer-grid">
      ${bankHtml}
      ${chargesHtml}
    </div>
    <div class="words-strip">Total Amount in Words: ${escapeHtml(wordsStr)}</div>
    <div class="bot-strip">
      <div>COPY NAME</div>
      <div class="mid">BUYER'S MARK: ${escapeHtml(bill.buyerMark || '—')}</div>
      <div class="right">For ${firmSign}</div>
    </div>
    <div class="page-line">
      <span>Page ${pageNum}/${totalPages}</span>
      <span>Authorized Signatory</span>
    </div>
  </div>`;
}

/** Non-last pages get a minimal page number strip at the bottom */
function gstBillPageLine(pageNum: number, totalPages: number): string {
  return `
  <div class="page-line" style="margin-top:4px">
    <span>Page ${pageNum}/${totalPages}</span>
    <span></span>
  </div>`;
}

export function generateSalesBillPrintHTML(bill: BillPrintData, options?: DocumentPrintOptions): string {
  const opts   = normalizeOptions(options);
  const groups = bill.commodityGroups || [];
  const total  = groups.length;

  const css = buildGstBillCSS(opts.pageSize);

  if (total === 0) {
    const empty = `<p style="padding:20px;font-family:Arial">No commodities on this bill.</p>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${empty}</body></html>`;
  }

  const pages = groups.map((group, gi) => {
    const pageNum = gi + 1;
    const isLast  = gi === total - 1;

    const header  = gstBillPageHeader(bill, group, opts.includeHeader);
    const table   = gstBillItemTable(group);
    const footer  = isLast
      ? gstBillFooter(bill, group, pageNum, total)
      : gstBillPageLine(pageNum, total);

    return `<div class="${isLast ? 'pg' : 'pg pg-break'}">${header}${table}${footer}</div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice ${escapeHtml(bill.billNumber || '')}</title><style>${css}</style></head><body>${pages}</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-GST Sales Bill (Buyer)
// Always: no header (no firm letterhead), A5 portrait by default.
// Layout mirrors design spec: "Sold X Bags of ITEM..." info block,
// combined 7-col table (items left + particulars right), words strip, copy name.
// ─────────────────────────────────────────────────────────────────────────────

function buildNonGstBillCSS(pageSize: 'A4' | 'A5'): string {
  return `
    @page { size: ${pageSize} portrait; margin: 8mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, 'Segoe UI', sans-serif;
      font-size: 9.5px;
      color: #111;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .pg { }
    .pg-break { page-break-after: always; }

    /* ── Info block ─────────────────────── */
    .info-blk {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid #333;
      border-bottom: none;
    }
    .info-l {
      padding: 6px 8px;
      border-right: 1px solid #333;
      font-size: 9px;
      line-height: 1.65;
    }
    .info-r {
      padding: 6px 8px;
      font-size: 9px;
      line-height: 1.7;
    }
    .info-r .ln {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .lbl { color: #555; }

    /* ── Combined item + particulars table ─ */
    table.ng {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    table.ng th, table.ng td {
      border: 1px solid #333;
      padding: 4px 5px;
      vertical-align: top;
    }
    table.ng th {
      font-weight: 700;
      text-align: center;
      font-size: 8.5px;
    }
    table.ng th.l, table.ng td.l { text-align: left; }
    table.ng td.r { text-align: right; }
    .sep-col { border-left: 2px solid #555; }
    tr.tot-row td {
      font-weight: 700;
      border-top: 2px solid #333;
    }
    tr.words-row td {
      font-weight: 600;
      padding: 4px 8px;
      font-size: 8.5px;
    }
    tr.words-row .wamt {
      font-weight: 800;
      text-align: right;
    }

    /* ── Bottom ─────────────────────────── */
    .copy-name {
      margin-top: 6px;
      font-size: 9px;
      font-weight: 700;
    }
    .page-line {
      margin-top: 3px;
      font-size: 8px;
      color: #555;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

function generateNonGstCommodityPage(
  bill: BillPrintData,
  group: BillPrintData['commodityGroups'][number],
  pageNum: number,
  totalPages: number,
): string {
  const d = new Date(bill.billDate);
  const dateStr = Number.isNaN(d.getTime())
    ? String(bill.billDate)
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const commodity = escapeHtml((group.commodityName || 'Item').trim());
  const divisor   = Number(group.divisor) > 0 ? Number(group.divisor) : 50;
  const billNum   = escapeHtml(bill.billNumber || 'DRAFT');
  const buyerName = escapeHtml((bill.billingName || bill.buyerName || '—').trim());
  const contact   = escapeHtml([bill.buyerPhone, bill.buyerEmail].filter(Boolean).join(', ') || '');
  const addr      = escapeHtml((bill.buyerAddress || '').trim());
  const vehicle   = escapeHtml((bill.outboundVehicle || '').trim());

  /* ── Compute item totals ── */
  let totalQty = 0;
  let totalWt  = 0;
  let totalAmt = 0;
  const items = group.items.map((item) => {
    const q = roundMoney2(Number(item.quantity) || 0);
    const w = roundMoney2(Number(item.weight)   || 0);
    const a = roundMoney2(Number(item.amount)   || 0);
    totalQty = roundMoney2(totalQty + q);
    totalWt  = roundMoney2(totalWt  + w);
    totalAmt = roundMoney2(totalAmt + a);
    return { ...item, q, w, a };
  });

  /* ── Build particulars list ── */
  const pars: { label: string; amount: number }[] = [];
  const commAmt  = roundMoney2(group.commissionAmount || 0);
  const userAmt  = roundMoney2(group.userFeeAmount    || 0);
  const handling = roundMoney2((group.coolieAmount || 0) + (group.weighmanChargeAmount || 0));
  const fr       = roundMoney2(bill.outboundFreight || 0);

  if (commAmt  > 0) pars.push({ label: group.commissionPercent > 0 ? `Commission (${formatBillingInr(group.commissionPercent)}%)` : 'Commission', amount: commAmt });
  if (userAmt  > 0) pars.push({ label: group.userFeePercent > 0 ? `User Fee (${formatBillingInr(group.userFeePercent)}%)` : 'User Fee', amount: userAmt });
  if (handling > 0) pars.push({ label: 'Coolie / Weighman', amount: handling });
  if (fr       > 0) pars.push({ label: 'Outbound Freight', amount: fr });

  const subtotalWithCharges = roundMoney2(roundMoney2(group.subtotal) + roundMoney2(group.totalCharges ?? 0));
  let discAmt = roundMoney2(group.discount || 0);
  if (group.discountType === 'PERCENT') discAmt = percentOfAmount(subtotalWithCharges, discAmt);
  if (discAmt > 0) pars.push({ label: 'Discount', amount: -discAmt });

  const ro = roundMoney2(group.manualRoundOff || 0);
  if (ro !== 0) pars.push({ label: 'Round Off', amount: ro });

  const totalParsAmt = roundMoney2(pars.reduce((s, p) => s + p.amount, 0));
  const net          = commodityNetTotal(group);
  const wordsStr     = inrAmountToWords(net);
  const totalQtyInt  = Math.round(totalQty);

  /* ── Build data rows (max of items vs particulars count) ── */
  const maxRows = Math.max(items.length, pars.length);
  const rows = Array.from({ length: maxRows }, (_, i) => {
    const it = items[i];
    const p  = pars[i];
    const tok = it && (it.tokenAdvance ?? 0) > 0
      ? ` <span style="font-size:7.5px;color:#555">(Tok ₹${formatBillingInr(it.tokenAdvance ?? 0)})</span>`
      : '';
    const mark = it ? escapeHtml(formatLotIdentifierForPrint(it)) : '';
    const parAmt = p
      ? (p.amount < 0 ? `\u2212\u20B9${formatBillingInr(-p.amount)}` : `\u20B9${formatBillingInr(p.amount)}`)
      : '';
    return `<tr>
      <td class="l">${mark}</td>
      <td class="r">${it ? formatBillingInr(it.q) : ''}</td>
      <td class="r">${it ? formatBillingInr(it.w) : ''}</td>
      <td class="r">${it ? formatBillingInr(it.newRate) : ''}</td>
      <td class="r">${it ? formatBillingInr(it.a) + tok : ''}</td>
      <td class="l sep-col">${p ? escapeHtml(p.label) : ''}</td>
      <td class="r">${parAmt}</td>
    </tr>`;
  }).join('');

  /* ── Total row ── */
  const totalParsStr = totalParsAmt !== 0
    ? (totalParsAmt < 0 ? `\u2212\u20B9${formatBillingInr(-totalParsAmt)}` : `\u20B9${formatBillingInr(totalParsAmt)}`)
    : '';

  return `
  <div class="${pageNum < totalPages ? 'pg pg-break' : 'pg'}">
    <div class="info-blk">
      <div class="info-l">
        <div>Sold <strong>${totalQtyInt}</strong> Bags of <strong>${commodity}</strong> on account and risk of</div>
        <div>${buyerName}${contact ? ', ' + contact : ''}</div>
        ${addr    ? `<div>${addr}</div>`                       : ''}
        ${vehicle ? `<div>Vehicle No : ${vehicle}</div>` : ''}
      </div>
      <div class="info-r">
        <div class="ln"><span class="lbl">Invoice No</span><strong>${billNum}</strong></div>
        <div class="ln"><span class="lbl">Invoice Date</span><span>${escapeHtml(dateStr)}</span></div>
      </div>
    </div>
    <table class="ng">
      <thead>
        <tr>
          <th class="l" style="width:18%">Mark</th>
          <th style="width:10%">Quantity</th>
          <th style="width:12%">Weight, kg</th>
          <th style="width:13%">Rate, \u20B9/${divisor} kg</th>
          <th style="width:13%">Amount</th>
          <th class="l sep-col" style="width:20%">Particulars</th>
          <th style="width:14%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="tot-row">
          <td class="l">Total</td>
          <td class="r">${formatBillingInr(totalQty)}</td>
          <td class="r">${formatBillingInr(totalWt)}</td>
          <td></td>
          <td class="r">${formatBillingInr(totalAmt)}</td>
          <td class="sep-col"></td>
          <td class="r">${totalParsStr}</td>
        </tr>
        <tr class="words-row">
          <td colspan="5">Total Amount in Words: ${escapeHtml(wordsStr)}</td>
          <td class="sep-col">Total Amount</td>
          <td class="wamt">\u20B9${formatBillingInr(net)}</td>
        </tr>
      </tbody>
    </table>
    <div class="copy-name">COPY NAME</div>
    <div class="page-line">Page ${pageNum}/${totalPages}</div>
  </div>`;
}

export function generateNonGstSalesBillPrintHTML(
  bill: BillPrintData,
  options?: Pick<DocumentPrintOptions, 'pageSize'>,
): string {
  // Non-GST bills: always no header; default A5 unless caller overrides
  const pageSize: 'A4' | 'A5' = options?.pageSize ?? 'A5';
  const groups = bill.commodityGroups || [];
  const total  = groups.length;
  const css    = buildNonGstBillCSS(pageSize);

  if (total === 0) {
    const empty = `<p style="padding:16px;font-family:Arial">No commodities on this bill.</p>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${empty}</body></html>`;
  }

  const pages = groups
    .map((group, gi) => generateNonGstCommodityPage(bill, group, gi + 1, total))
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(bill.billNumber || '')}</title><style>${css}</style></head><body>${pages}</body></html>`;
}

// ── Sales Patti (SettlementPage) ─────────────────────────
export interface PattiPrintData {
  pattiId: string;
  /** Shown on "Patti No" line; when set, overrides pattiId for print only. */
  pattiNoDisplay?: string;
  sellerName: string;
  sellerMobile?: string;
  sellerAddress?: string;
  vehicleNumber?: string;
  commodityName?: string;
  totalBags?: number;
  detailRows?: { mark: string; bags: number; weight: number; rate: number; amount: number }[];
  rateClusters: { rate: number; totalQuantity: number; totalWeight: number; amount: number }[];
  grossAmount: number;
  deductions: { key: string; label: string; amount: number; autoPulled?: boolean }[];
  totalDeductions: number;
  netPayable: number;
  createdAt: string;
  useAverageWeight?: boolean;
  /** Trader/firm letterhead — shown when includeHeader is true. */
  firm?: BillPrintFirmInfo | null;
}

function buildSalesPattiStyle(): string {
  return `
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 9.5px; color: #111; }

    /* ── Letterhead header box ── */
    .ph-box { border: 1px solid #333; margin-bottom: 6px; }

    /* Row 1: 3-col strip */
    .ph-row1 {
      display: grid;
      grid-template-columns: 1fr 1.6fr 1fr;
      border-bottom: 1px solid #333;
      min-height: 30px;
    }
    .ph-left {
      padding: 4px 6px;
      font-size: 8px;
      line-height: 1.6;
      border-right: 1px solid #333;
    }
    .ph-center {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 3px 5px;
      font-size: 8px;
      font-weight: 700;
      border-right: 1px solid #333;
    }
    .ph-right {
      padding: 4px 6px;
      font-size: 8px;
      line-height: 1.6;
      text-align: right;
    }

    /* Row 2: Firm name band */
    .ph-firm {
      text-align: center;
      padding: 4px 8px 3px;
      border-bottom: 1px solid #333;
    }
    .ph-firm-name {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1.3;
    }
    .ph-firm-sub {
      font-size: 8px;
      color: #333;
      margin-top: 1px;
    }

    /* Row 3: SALES PATTI title */
    .ph-title {
      text-align: center;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.12em;
      padding: 2px 0;
      border-bottom: 1px solid #333;
    }

    /* Row 4: Sold line + Patti No 2-col */
    .ph-sold {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 4px 7px;
      font-size: 8.5px;
      line-height: 1.6;
    }
    .ph-sold-left p { margin: 0; }
    .ph-sold-right { text-align: right; font-size: 8.5px; line-height: 1.6; white-space: nowrap; }
    .ph-sold-right p { margin: 0; }

    .patti-a4 { font-family: Arial, sans-serif; color: #000; font-size: 14px; }
    .patti-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
    .patti-head-left p, .patti-head-right p { margin: 0; line-height: 1.2; }
    .patti-head-right { text-align:right; min-width: 200px; }
    .patti-table { width:100%; border-collapse: collapse; table-layout: fixed; }
    .patti-table th, .patti-table td { border: 1px solid #000; padding: 3px 6px; }
    .patti-table th { font-weight: 700; text-align: left; }
    .right { text-align:right; }
    .centered { text-align:center; }
    .footer-net { margin-top: 8px; display:flex; justify-content:flex-end; font-size: 20px; font-weight: 700; gap: 16px; }
  </style>
`;
}

export function generateSalesPattiPrintHTML(patti: PattiPrintData, options?: DocumentPrintOptions): string {
  const printOptions = normalizeOptions(options);
  const dateStr = new Date(patti.createdAt).toLocaleDateString('en-GB');
  const rows = (patti.detailRows && patti.detailRows.length > 0)
    ? patti.detailRows
    : patti.rateClusters.map((c) => ({
      mark: '-',
      bags: Number(c.totalQuantity) || 0,
      weight: Number(c.totalWeight) || 0,
      rate: Number(c.rate) || 0,
      amount: Number(c.amount) || 0,
    }));
  const totalBags = Number(patti.totalBags ?? rows.reduce((s, r) => s + (Number(r.bags) || 0), 0)) || 0;
  const totalWeight = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const deductionByKey = new Map<string, number>();
  for (const d of patti.deductions || []) {
    deductionByKey.set(String(d.key || '').toLowerCase(), Number(d.amount) || 0);
  }
  const freight = deductionByKey.get('freight') ?? 0;
  const unloading = deductionByKey.get('coolie') ?? deductionByKey.get('unloading') ?? 0;
  const weighingPresent = deductionByKey.has('weighing') || deductionByKey.has('weighman');
  const weighing = deductionByKey.get('weighing') ?? deductionByKey.get('weighman') ?? 0;
  const cashAdvance = deductionByKey.get('advance') ?? deductionByKey.get('cashadvance') ?? 0;
  const gunnies = deductionByKey.get('gunnies') ?? 0;
  const others = deductionByKey.get('others') ?? 0;

  const particularsRows: Array<{ label: string; amount: number }> = [
    { label: 'Freight', amount: freight },
    { label: 'Unloading', amount: unloading },
    ...(weighingPresent ? [{ label: 'Weighing', amount: weighing }] : []),
    { label: 'Cash Advance', amount: cashAdvance },
    { label: 'Gunnies', amount: gunnies },
    { label: 'Others', amount: others },
  ];

  const commodityLabel = (patti.commodityName || '').trim() || 'Commodity';
  const soldLine = `Sold ${formatBillingInr(totalBags)} Bags of ${escapeHtml(commodityLabel)} on account and risk of`;
  const identityLine = `${escapeHtml(patti.sellerName || '-')}${patti.sellerMobile ? `, ${escapeHtml(patti.sellerMobile)}` : ''}`;
  const addressLine = escapeHtml((patti.sellerAddress || '').trim() || '-');
  const vehicleLine = escapeHtml((patti.vehicleNumber || '').trim() || '-');

  const f = patti.firm;

  // Letterhead strip (3-col + firm band + title) — only when includeHeader is true
  const letterheadHtml = (printOptions.includeHeader && f)
    ? (() => {
        const apmc     = escapeHtml((f.rmcApmcCode || '').trim());
        const firmName = escapeHtml((f.businessName || '').trim());
        const about    = escapeHtml((f.category || '').trim());
        const addr     = escapeHtml([f.address, f.city, f.state, f.pinCode].filter(Boolean).join(', ') || '');
        const owner    = escapeHtml((f.ownerName || '').trim());
        const phone    = escapeHtml((f.mobile || '').trim());
        const email    = escapeHtml((f.email || '').trim());
        return `
          <div class="ph-row1">
            <div class="ph-left">
              ${apmc ? `<div><strong>APMC Code</strong>&nbsp;:&nbsp;${apmc}</div>` : ''}
            </div>
            <div class="ph-center">${about}</div>
            <div class="ph-right">
              ${owner ? `<div>${owner}</div>` : ''}
              ${phone ? `<div>${phone}</div>` : ''}
              ${email ? `<div>${email}</div>` : ''}
            </div>
          </div>
          ${firmName ? `
          <div class="ph-firm">
            <div class="ph-firm-name">${firmName}</div>
            ${about ? `<div class="ph-firm-sub">${about}</div>` : ''}
            ${addr ? `<div class="ph-firm-sub">${addr}</div>` : ''}
          </div>` : ''}
          <div class="ph-title">SALES PATTI</div>`;
      })()
    : '';

  // Sold line + Patti No/Date — always shown
  const soldSectionHtml = `
    <div class="ph-sold">
      <div class="ph-sold-left">
        <p><strong>${soldLine}</strong></p>
        <p><strong>${identityLine}</strong></p>
        <p><strong>${addressLine}</strong></p>
        <p><strong>Vehicle No : ${vehicleLine}</strong></p>
      </div>
      <div class="ph-sold-right">
        <p><strong>Patti No : ${escapeHtml((patti.pattiNoDisplay ?? patti.pattiId) || '-')}</strong></p>
        <p><strong>Date : ${dateStr}</strong></p>
      </div>
    </div>`;

  const firmHeaderHtml = `<div class="ph-box">${letterheadHtml}${soldSectionHtml}</div>`;

  const body = `
    <div class="patti-a4">
      ${firmHeaderHtml}

      <table class="patti-table">
        <thead>
          <tr>
            <th style="width:9%;">Marks</th>
            <th style="width:9%;" class="centered">Bags</th>
            <th style="width:13%;" class="right">Weight, kg</th>
            <th style="width:12%;" class="right">Rate, ₹</th>
            <th style="width:16%;" class="right">Amount, ₹</th>
            <th style="width:23%;">Particulars</th>
            <th style="width:18%;" class="right">Amount, ₹</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, idx) => `
            <tr>
              <td>${escapeHtml(r.mark || '-')}</td>
              <td class="centered">${formatBillingInr(r.bags)}</td>
              <td class="right">${formatBillingInr(r.weight)}</td>
              <td class="right">${formatBillingInr(r.rate)}</td>
              <td class="right">${formatBillingInr(r.amount)}</td>
              <td>${idx < particularsRows.length ? particularsRows[idx].label : '-'}</td>
              <td class="right">${idx < particularsRows.length ? formatBillingInr(particularsRows[idx].amount) : '-'}</td>
            </tr>
          `).join('')}
          ${Array.from({ length: Math.max(0, particularsRows.length - rows.length) }).map((_, i) => {
            const pRow = particularsRows[rows.length + i];
            return `
              <tr>
                <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
                <td>${pRow.label}</td>
                <td class="right">${formatBillingInr(pRow.amount)}</td>
              </tr>
            `;
          }).join('')}
          <tr>
            <td>-</td>
            <td class="centered" style="font-weight:700;">${formatBillingInr(totalBags)}</td>
            <td class="right" style="font-weight:700;">${formatBillingInr(totalWeight)}</td>
            <td>-</td>
            <td class="right" style="font-weight:700;">${formatBillingInr(totalAmount)}</td>
            <td>-</td>
            <td class="right" style="font-weight:700;">${formatBillingInr(particularsRows.reduce((s, p) => s + p.amount, 0))}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer-net">
        <span>Net Payable</span>
        <span>${formatBillingInr(patti.netPayable)}</span>
      </div>
    </div>
  `;
  return wrapPrintDocument(`${buildSalesPattiStyle()}${body}`, printOptions.pageSize);
}

export function generateSalesPattiBatchPrintHTML(pattis: PattiPrintData[], options?: DocumentPrintOptions): string {
  const pages = (pattis || []).map((p, idx, arr) => `
    <div${idx < arr.length - 1 ? ' style="page-break-after: always;"' : ''}>
      ${generateSalesPattiPrintHTMLBody(p, options)}
    </div>
  `).join('');
  const printOptions = normalizeOptions(options);
  return wrapPrintDocument(`${buildSalesPattiStyle()}${pages}`, printOptions.pageSize);
}

function generateSalesPattiPrintHTMLBody(patti: PattiPrintData, options?: DocumentPrintOptions): string {
  const full = generateSalesPattiPrintHTML(patti, options);
  const bodyMatch = full.match(/<body>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : '';
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
  const body = `
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

function wrapPrintDocument(body: string, pageSize: 'A4' | 'A5' = 'A4'): string {
  const maxWidth = pageSize === 'A5' ? '130mm' : '180mm';
  const pageCss = `@page { size: ${pageSize} portrait; margin: 8mm; } .wrap { max-width: ${maxWidth}; }`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${pageCss}${PRINT_STYLES}</style></head><body>${body}</body></html>`;
}
