/**
 * User charges report — standalone print HTML (A4, directPrint pipeline).
 * Kept separate from `client/src/utils/printDocumentTemplates.ts` (billing / settlement).
 */

export interface UserFeesPrintDocumentOptions {
  /** When false, firm block prints compact (no bottom rule). */
  includeHeader?: boolean;
}

export interface UserFeesChargesReportPrintHeader {
  traderName: string;
  apmcCode: string;
  address: string;
  mobile: string;
}

export interface UserFeesChargesReportSummaryRowStrings {
  dateDisplay: string;
  dayShort: string;
  totalBags: string;
  totalSales: string;
  userCharges: string;
  weighmanCharge: string;
}

export interface UserFeesChargesReportTotalsRowStrings {
  totalBags: string;
  totalSales: string;
  userCharges: string;
  weighmanCharge: string;
}

export interface UserFeesChargesReportPaymentStrings {
  modeLabel: string;
  referenceLine?: string;
  userChargesInr: string;
  rupeesWordsUpper: string;
  dateDisplay: string;
}

export interface UserFeesChargesReportBuyerRowStrings {
  buyerName: string;
  billNo: string;
  totalBags: string;
  totalSales: string;
  userCharges: string;
  weighmanCharge: string;
}

export interface UserFeesChargesReportDayPrintSection {
  dateYmd: string;
  dateDisplay: string;
  weekdayLong: string;
  buyerRows: UserFeesChargesReportBuyerRowStrings[];
  totals: UserFeesChargesReportTotalsRowStrings;
  emptyMessage?: string;
}

export interface UserFeesChargesReportPrintData {
  header: UserFeesChargesReportPrintHeader;
  periodStartDisplay: string;
  periodEndDisplay: string;
  summaryRows: UserFeesChargesReportSummaryRowStrings[];
  summaryTotals: UserFeesChargesReportTotalsRowStrings;
  payment: UserFeesChargesReportPaymentStrings;
  daySections: UserFeesChargesReportDayPrintSection[];
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePrintOptions(options?: UserFeesPrintDocumentOptions): Required<UserFeesPrintDocumentOptions> {
  return {
    includeHeader: options?.includeHeader !== false,
  };
}

function firmHeaderHtml(h: UserFeesChargesReportPrintHeader, includeHeader: boolean): string {
  const name = escapeHtml((h.traderName || 'Trader').trim());
  const apmc = escapeHtml((h.apmcCode || '—').trim());
  const addr = escapeHtml((h.address || '—').trim()).replace(/\n/g, '<br/>');
  const mob = escapeHtml((h.mobile || '').trim());
  const cls = includeHeader ? 'uf-firm uf-firm-on' : 'uf-firm uf-firm-off';
  return `
    <div class="${cls}">
      <div class="uf-trader-name">${name}</div>
      <div class="uf-rmc-line">RMC/APMC code : ${apmc}</div>
      <div class="uf-addr-line">${addr}</div>
      <div class="uf-phone-line">Phone Mob: ${mob ? mob : '—'}</div>
    </div>`;
}

function summaryTable(rows: UserFeesChargesReportSummaryRowStrings[], totals: UserFeesChargesReportTotalsRowStrings): string {
  const hdr = ['Date', 'Day', 'Total Bags', 'Total Sales', 'User Charges', 'Weighman Charge']
    .map((c) => `<th>${escapeHtml(c)}</th>`)
    .join('');
  const cols = `
    <colgroup>
      <col class="uf-cg-sum-date" />
      <col class="uf-cg-sum-day" />
      <col class="uf-cg-sum-bags" />
      <col class="uf-cg-sum-amt" />
      <col class="uf-cg-sum-amt" />
      <col class="uf-cg-sum-amt" />
    </colgroup>`;
  const body = rows
    .map(
      (r) => `<tr>
      <td class="uf-c uf-nowrap">${escapeHtml(r.dateDisplay)}</td>
      <td class="uf-c uf-nowrap">${escapeHtml(r.dayShort)}</td>
      <td class="uf-c uf-nowrap">${escapeHtml(r.totalBags)}</td>
      <td class="uf-num uf-nowrap">${escapeHtml(r.totalSales)}</td>
      <td class="uf-num uf-nowrap">${escapeHtml(r.userCharges)}</td>
      <td class="uf-num uf-nowrap">${escapeHtml(r.weighmanCharge)}</td>
    </tr>`,
    )
    .join('');
  const foot = `<tr>
    <td class="uf-c uf-bold uf-nowrap" colspan="2">Total</td>
    <td class="uf-c uf-bold uf-nowrap">${escapeHtml(totals.totalBags)}</td>
    <td class="uf-num uf-bold uf-nowrap">${escapeHtml(totals.totalSales)}</td>
    <td class="uf-num uf-bold uf-nowrap">${escapeHtml(totals.userCharges)}</td>
    <td class="uf-num uf-bold uf-nowrap">${escapeHtml(totals.weighmanCharge)}</td>
  </tr>`;
  return `<table class="uf-tbl uf-tbl-sum">${cols}<thead><tr>${hdr}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`;
}

function buyerTable(section: UserFeesChargesReportDayPrintSection): string {
  const hdr = ['Buyer Name', 'Bill No.', 'Total Bags', 'Total Sales', 'User Charges', 'Weighman Charge']
    .map((c) => `<th>${escapeHtml(c)}</th>`)
    .join('');
  const cols = `
    <colgroup>
      <col class="uf-cg-buy-name" />
      <col class="uf-cg-buy-bill" />
      <col class="uf-cg-buy-bags" />
      <col class="uf-cg-buy-amt" />
      <col class="uf-cg-buy-amt" />
      <col class="uf-cg-buy-amt" />
    </colgroup>`;
  let body: string;
  if (section.buyerRows.length === 0) {
    body = `<tr><td class="uf-c uf-nowrap" colspan="6">${escapeHtml(section.emptyMessage || 'No bills for this day.')}</td></tr>`;
  } else {
    body = section.buyerRows
      .map(
        (r) => `<tr>
        <td class="uf-left uf-nowrap">${escapeHtml(r.buyerName)}</td>
        <td class="uf-c uf-nowrap">${escapeHtml(r.billNo)}</td>
        <td class="uf-c uf-nowrap">${escapeHtml(r.totalBags)}</td>
        <td class="uf-num uf-nowrap">${escapeHtml(r.totalSales)}</td>
        <td class="uf-num uf-nowrap">${escapeHtml(r.userCharges)}</td>
        <td class="uf-num uf-nowrap">${escapeHtml(r.weighmanCharge)}</td>
      </tr>`,
      )
      .join('');
  }
  const t = section.totals;
  const foot = `<tr>
    <td class="uf-c uf-bold uf-nowrap" colspan="2">Total</td>
    <td class="uf-c uf-bold uf-nowrap">${escapeHtml(t.totalBags)}</td>
    <td class="uf-num uf-bold uf-nowrap">${escapeHtml(t.totalSales)}</td>
    <td class="uf-num uf-bold uf-nowrap">${escapeHtml(t.userCharges)}</td>
    <td class="uf-num uf-bold uf-nowrap">${escapeHtml(t.weighmanCharge)}</td>
  </tr>`;
  return `<table class="uf-tbl uf-tbl-buy">${cols}<thead><tr>${hdr}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`;
}

function paymentBlock(p: UserFeesChargesReportPaymentStrings): string {
  const ref = p.referenceLine?.trim()
    ? `<div class="uf-pay-line uf-nowrap">${escapeHtml(p.referenceLine!.trim())}</div>`
    : '';
  return `
    <div class="uf-payment">
      <div class="uf-pay-title">Payment Details</div>
      <div class="uf-pay-line uf-nowrap">Mode of payment : ${escapeHtml(p.modeLabel)}</div>
      ${ref}
      <div class="uf-pay-line uf-nowrap">User Charges : ${escapeHtml(p.userChargesInr)}</div>
      <div class="uf-pay-line uf-nowrap">RUPEES : ${escapeHtml(p.rupeesWordsUpper)}</div>
      <div class="uf-pay-line uf-nowrap">DATE : ${escapeHtml(p.dateDisplay)}</div>
    </div>`;
}

/** Always A4 portrait; tables use full content width, no cell wrapping. */
export function generateUserFeesChargesReportPrintHTML(
  data: UserFeesChargesReportPrintData,
  options?: UserFeesPrintDocumentOptions,
): string {
  const printOptions = normalizePrintOptions(options);
  const ufCss = `
    @page { size: A4 portrait; margin: 5mm 6mm; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, 'Segoe UI', sans-serif;
      color: #111;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .uf-sheet {
      width: 100%;
      max-width: 100%;
    }
    .uf-page {
      page-break-after: always;
      padding-bottom: 2mm;
    }
    .uf-page:last-child { page-break-after: auto; }
    .uf-spacer { height: 6px; }
    .uf-firm { text-align: center; margin-bottom: 8px; }
    .uf-firm-on { border-bottom: 1px solid #333; padding-bottom: 6px; }
    .uf-firm-off { padding-bottom: 2px; }
    .uf-trader-name {
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .uf-rmc-line { font-size: 14px; margin-top: 2px; }
    .uf-addr-line { font-size: 14px; margin-top: 3px; line-height: 1.3; }
    .uf-phone-line { font-size: 14px; margin-top: 3px; }
    .uf-range-title {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      margin: 6px 0 5px;
    }
    .uf-day-sub {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      margin: 8px 0 6px;
    }
    .uf-tbl {
      width: 100%;
      max-width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      table-layout: fixed;
    }
    .uf-tbl th, .uf-tbl td {
      border: 1px solid #222;
      padding: 3px 4px;
      vertical-align: middle;
      white-space: nowrap;
    }
    .uf-tbl th {
      font-weight: 700;
      text-align: center;
      background: #e8e8ee;
    }
    .uf-c { text-align: center; }
    .uf-left { text-align: left; }
    .uf-num { text-align: right; font-variant-numeric: tabular-nums; }
    .uf-bold { font-weight: 800; }
    .uf-nowrap { white-space: nowrap; overflow: visible; }
    .uf-tbl tfoot td { border-top: 2px solid #333; background: #f0f0f5; }
    .uf-cg-sum-date { width: 11%; }
    .uf-cg-sum-day { width: 7%; }
    .uf-cg-sum-bags { width: 10%; }
    .uf-cg-sum-amt { width: 24%; }
    .uf-cg-buy-name { width: 34%; }
    .uf-cg-buy-bill { width: 13%; }
    .uf-cg-buy-bags { width: 9%; }
    .uf-cg-buy-amt { width: 14.67%; }
    .uf-payment {
      margin-top: 10px;
      font-size: 11px;
      text-align: left;
      line-height: 1.45;
      width: 100%;
    }
    .uf-pay-title { font-weight: 800; margin-bottom: 3px; }
    .uf-pay-line { margin: 1px 0; }
    @media screen {
      body { padding: 8px; background: #ddd; }
      .uf-sheet {
        max-width: 210mm;
        margin: 0 auto;
        background: #fff;
        box-shadow: 0 1px 6px rgba(0,0,0,0.12);
        padding: 5mm 6mm;
      }
    }
  `;

  const rangeLabel = `User Charges Report from ${escapeHtml(data.periodStartDisplay)} to ${escapeHtml(data.periodEndDisplay)}`;
  const page1Body = `
    ${firmHeaderHtml(data.header, printOptions.includeHeader)}
    <div class="uf-spacer"></div>
    <p class="uf-range-title">${rangeLabel}</p>
    ${summaryTable(data.summaryRows, data.summaryTotals)}
    ${paymentBlock(data.payment)}
  `;

  const dayPages = data.daySections
    .map((sec) => {
      const sub = `RMC Report as on ${escapeHtml(sec.weekdayLong)} ${escapeHtml(sec.dateDisplay)}`;
      return `
      <div class="uf-page">
        ${firmHeaderHtml(data.header, printOptions.includeHeader)}
        <div class="uf-spacer"></div>
        <p class="uf-day-sub">${sub}</p>
        ${buyerTable(sec)}
      </div>`;
    })
    .join('');

  const body = `
  <div class="uf-sheet">
    <div class="uf-page">${page1Body}</div>
    ${dayPages}
  </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${ufCss}</style></head><body>${body}</body></html>`;
}
