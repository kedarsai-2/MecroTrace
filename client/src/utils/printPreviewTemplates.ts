/**
 * Print preview templates — SRS-style quick previews share HTML with module prints where applicable.
 * Billing + Settlement previews call `printDocumentTemplates` (same as BillingPage / SettlementPage).
 */
import type { ArrivalDetail } from '@/services/api/arrivals';
import {
  generateNonGstSalesBillPrintHTML,
  generateSalesBillPrintHTML,
  generateSalesPattiBatchPrintHTML,
  generateSalesPattiPrintHTML,
} from '@/utils/printDocumentTemplates';
import {
  generateBuyerChiti,
  generateDispatchControl,
  generateSalePadPrint,
  generateSalesSticker,
  generateSellerChiti,
  generateTenderSlip,
} from '@/utils/printTemplates';
import {
  buildSampleBillPrintData,
  buildSampleBidInfosForLogisticsPrints,
  buildSamplePattiPrintPayloads,
  FALLBACK_LOGISTICS_PREVIEW_BID,
  resolveSampleLots,
  type PrintPreviewFirmInput,
} from '@/utils/printPreviewSamplePayloads';

export type FirmInfo = PrintPreviewFirmInput;

const FULL_DOC_TEMPLATE_IDS = new Set([
  'gst_bill',
  'nongst_bill',
  'seller_invoice',
  'main_invoice',
  'invoice_a5',
  'sale_pad',
  /** Same full HTML documents as `printTemplates` / LogisticsPage direct print */
  'sales_sticker',
  'tender_slip',
  'chiti_buyer',
  'chiti_seller',
  'dispatch_coolie',
]);

/** True → full HTML document (`iframe` / `directPrint`); false → fragment for `dangerouslySetInnerHTML`. */
export function isFullDocumentPrintTemplate(templateId: string): boolean {
  return FULL_DOC_TEMPLATE_IDS.has(templateId);
}

function numberToWords(n: number): string {
  if (n === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numberToWords(n % 100) : '');
  if (n < 100000) return numberToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numberToWords(n % 1000) : '');
  if (n < 10000000) return numberToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numberToWords(n % 100000) : '');
  return numberToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numberToWords(n % 10000000) : '');
}

/** Generate template HTML for preview/print — Billing/Settlement IDs return full documents from `printDocumentTemplates`. */
export function generateTemplateHTML(templateId: string, arrivalDetails: ArrivalDetail[], firm: FirmInfo): string {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const sampleLots = resolveSampleLots(arrivalDetails);
  const logisticsTraderTitle = (firm.name ?? '').trim() || 'Trader';

  if (templateId === 'gst_bill') {
    return generateSalesBillPrintHTML(buildSampleBillPrintData(arrivalDetails, firm, 'gst'), {
      pageSize: 'A4',
      includeHeader: true,
    });
  }
  if (templateId === 'nongst_bill') {
    return generateNonGstSalesBillPrintHTML(buildSampleBillPrintData(arrivalDetails, firm, 'nongst'), {
      pageSize: 'A5',
    });
  }
  if (templateId === 'seller_invoice' || templateId === 'invoice_a5') {
    const pattis = buildSamplePattiPrintPayloads(arrivalDetails, firm);
    const first = pattis[0];
    return generateSalesPattiPrintHTML(first, {
      pageSize: templateId === 'invoice_a5' ? 'A5' : 'A4',
      includeHeader: true,
    });
  }
  if (templateId === 'main_invoice') {
    return generateSalesPattiBatchPrintHTML(buildSamplePattiPrintPayloads(arrivalDetails, firm), {
      pageSize: 'A4',
      includeHeader: true,
    });
  }
  if (templateId === 'sale_pad') {
    return generateSalePadPrint([], logisticsTraderTitle);
  }

  const sampleBidsLogistics =
    buildSampleBidInfosForLogisticsPrints(arrivalDetails);
  const bidsForLogisticsPreview =
    sampleBidsLogistics.length > 0 ? sampleBidsLogistics : [FALLBACK_LOGISTICS_PREVIEW_BID];

  if (templateId === 'sales_sticker') {
    return generateSalesSticker(bidsForLogisticsPreview[0]);
  }
  if (templateId === 'tender_slip') {
    return generateTenderSlip(logisticsTraderTitle);
  }
  if (templateId === 'chiti_buyer') {
    return generateBuyerChiti(
      'Vijay Traders',
      'VT',
      bidsForLogisticsPreview,
      'post-auction',
      logisticsTraderTitle,
    );
  }
  if (templateId === 'chiti_seller') {
    const firstSeller = bidsForLogisticsPreview[0]?.sellerName || 'Seller';
    const sellerBids = bidsForLogisticsPreview.filter((b) => b.sellerName === firstSeller);
    const serial =
      sellerBids[0]?.sellerSerial && sellerBids[0].sellerSerial > 0
        ? sellerBids[0].sellerSerial
        : 1;
    return generateSellerChiti(
      firstSeller,
      serial,
      sellerBids.length ? sellerBids : bidsForLogisticsPreview,
      'post-auction',
      logisticsTraderTitle,
    );
  }
  if (templateId === 'dispatch_coolie') {
    return generateDispatchControl(bidsForLogisticsPreview);
  }

  const commonHeader = `
    <div style="text-align:center; border-bottom:2px solid #222; padding-bottom:10px; margin-bottom:14px">
      <div style="font-size:8px; color:#888; letter-spacing:1px">${firm.apmcCode || ''}</div>
      <div style="font-size:20px; font-weight:800; color:#1a1a2e">${firm.name || '—'}</div>
      <div style="font-size:11px; color:#555">${firm.about || ''}</div>
      <div style="font-size:10px; color:#777">${firm.address || ''}</div>
      <div style="font-size:10px; color:#777">Ph: ${firm.phone || ''} | ${firm.email || ''}</div>
    </div>`;

  const footer = `
    <div style="margin-top:28px; border-top:1px solid #ddd; padding-top:8px; display:flex; justify-content:space-between; font-size:9px; color:#aaa">
      <span>Powered by MERCOTRACE</span>
      <span>Page 1/1</span>
      <span>Authorized Signatory</span>
    </div>`;

  const sampleBuyer = { name: 'Vijay Traders', mark: 'VT', address: 'Shop 42, Market Area', phone: '+91 98765 11111' };

  const tableStyle = 'width:100%; border-collapse:collapse; font-size:11px';
  const thStyle = 'background:#f0f4ff; border:1px solid #d0d8e8; padding:6px; text-align:left; font-weight:600; color:#374151; font-size:10px';
  const tdStyle = 'border:1px solid #e0e4ec; padding:5px';

  switch (templateId) {
    case 'tender_form':
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:700px; margin:auto; padding:20px; font-size:12px">
        ${commonHeader}
        <div style="text-align:center; font-weight:bold; font-size:17px; margin-bottom:16px; color:#1a1a2e">TENDER FORM</div>
        <div style="margin-bottom:10px; font-size:11px"><strong>Item Name:</strong> Onion A-Grade &nbsp;&nbsp;&nbsp; <strong>Rate:</strong> ₹/50kg &nbsp;&nbsp;&nbsp; <strong>Date:</strong> ${today}</div>
        <table style="${tableStyle}">
          <tr><th style="${thStyle}">Lot No</th><th style="${thStyle}">Bags</th><th style="${thStyle}">Farmer's Name</th><th style="${thStyle}">Purchaser</th></tr>
          ${sampleLots.map((l: any) => `<tr><td style="${tdStyle}">${l.lot_no}</td><td style="${tdStyle}; text-align:right">${l.qty}</td><td style="${tdStyle}">${l.seller}</td><td style="${tdStyle}"></td></tr>`).join('')}
        </table>
        ${footer}
      </div>`;

    case 'buyer_delivery':
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:700px; margin:auto; padding:20px; font-size:12px">
        ${commonHeader}
        <div style="display:flex; justify-content:space-between; margin-bottom:14px">
          <div><strong>M/s</strong> ${sampleBuyer.name}<br/><span style="font-size:10px; color:#666">Customer Mark: ${sampleBuyer.mark}</span></div>
          <div style="text-align:right; font-size:11px"><strong>Bill No:</strong> BIL-2026-0042<br/><strong>Bill Date:</strong> ${today}<br/><strong>Item:</strong> Onion A-Grade<br/><strong>Qty:</strong> 55 bags</div>
        </div>
        ${sampleLots.map((l: any) => `<div style="margin-bottom:14px; border:1px solid #e0e4ec; padding:10px; border-radius:6px; background:#fafbff">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px"><strong>${l.lot_name} / ${l.lot_no}</strong><span style="font-size:11px; color:#555">Qty: ${l.qty} | Weight: ${l.weight || l.qty * 50}kg | Rate: ₹${l.rate || 800}/50kg</span></div>
          <div style="font-size:10px; color:#888; word-break:break-all">${Array.from({ length: l.qty || 10 }, () => `${(48 + Math.random() * 4).toFixed(1)}`).join(' ')}</div>
        </div>`).join('')}
        <div style="text-align:right; font-weight:bold; margin-top:10px">For ${firm.name || '—'}</div>
        ${footer}
      </div>`;

    case 'market_fee':
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:700px; margin:auto; padding:20px; font-size:12px">
        ${commonHeader}
        <div style="text-align:center; font-weight:800; font-size:17px; margin-bottom:4px; color:#1a1a2e">MARKET FEE REPORT</div>
        <div style="text-align:center; font-size:11px; color:#888; margin-bottom:14px">Single Commodity: Onion A-Grade | Date: ${today}</div>
        <table style="${tableStyle}">
          <tr><th style="${thStyle}">Bill No</th><th style="${thStyle}">Purchaser</th><th style="${thStyle}">Bags</th><th style="${thStyle}">Amount</th><th style="${thStyle}">Market Fee</th></tr>
          <tr><td style="${tdStyle}">BIL-0042</td><td style="${tdStyle}">Vijay Traders</td><td style="${tdStyle}; text-align:right">30</td><td style="${tdStyle}; text-align:right">₹24,750</td><td style="${tdStyle}; text-align:right">₹495</td></tr>
          <tr><td style="${tdStyle}">BIL-0043</td><td style="${tdStyle}">Ganesh Mart</td><td style="${tdStyle}; text-align:right">25</td><td style="${tdStyle}; text-align:right">₹20,125</td><td style="${tdStyle}; text-align:right">₹403</td></tr>
          <tr style="font-weight:bold; background:#f0f4ff"><td style="${tdStyle}" colspan="2">Total</td><td style="${tdStyle}; text-align:right">55</td><td style="${tdStyle}; text-align:right">₹44,875</td><td style="${tdStyle}; text-align:right">₹898</td></tr>
        </table>
        <div style="margin-top:18px; border:1px solid #e0e4ec; padding:12px; border-radius:6px; font-size:11px; background:#fafbff">
          <strong>Payment Detail</strong><br/>
          Amount: ₹898 | Amount in Words: Rupees Eight Hundred Ninety-Eight Only<br/>
          Payment Mode: Bank Transfer – NEFT | Payment Date: ${today}
        </div>
        ${footer}
      </div>`;

    case 'gst_report':
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:700px; margin:auto; padding:20px; font-size:12px">
        ${commonHeader}
        <div style="text-align:center; font-weight:800; font-size:17px; margin-bottom:4px; color:#1a1a2e">GST REPORT</div>
        <div style="text-align:center; font-size:11px; color:#888; margin-bottom:14px">From ${today} to ${today}</div>
        <table style="${tableStyle}">
          <tr><th style="${thStyle}">HSN/SAC</th><th style="${thStyle}">UQC</th><th style="${thStyle}">Total Qty</th><th style="${thStyle}">Total Value</th><th style="${thStyle}">Rate</th><th style="${thStyle}">Taxable Value</th><th style="${thStyle}">IGST</th><th style="${thStyle}">CGST</th><th style="${thStyle}">SGST</th></tr>
          <tr><td style="${tdStyle}">07031019</td><td style="${tdStyle}">Bags</td><td style="${tdStyle}; text-align:right">55</td><td style="${tdStyle}; text-align:right">₹44,875</td><td style="${tdStyle}">5%</td><td style="${tdStyle}; text-align:right">₹44,875</td><td style="${tdStyle}; text-align:right">-</td><td style="${tdStyle}; text-align:right">₹1,122</td><td style="${tdStyle}; text-align:right">₹1,122</td></tr>
          <tr style="font-weight:bold; background:#f0f4ff"><td style="${tdStyle}" colspan="5">Grand Total</td><td style="${tdStyle}; text-align:right">₹44,875</td><td style="${tdStyle}; text-align:right">-</td><td style="${tdStyle}; text-align:right">₹1,122</td><td style="${tdStyle}; text-align:right">₹1,122</td></tr>
        </table>
        ${footer}
      </div>`;

    default:
      return `<div style="font-family:Arial,sans-serif; padding:20px; text-align:center; color:#999">Template not found</div>`;
  }
}
