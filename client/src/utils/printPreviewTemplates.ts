/**
 * Print preview templates — same UI format as client_origin (PrintsPage).
 * Used by PrintsPage and PrintsReportsPage; data from real API (arrivalsApi + firm from auth).
 */
import type { ArrivalDetail } from '@/services/api/arrivals';

export type FirmInfo = {
  name: string;
  about: string;
  address: string;
  apmcCode: string;
  phone: string;
  email: string;
  gstin: string;
  bank: { name: string; acc: string; ifsc: string; branch: string };
};

function flattenArrivalDetailsToSampleLots(details: ArrivalDetail[]): { lot_name: string; lot_no: string; seller: string; vehicle: string; qty: number; rate?: number; weight?: number }[] {
  const out: { lot_name: string; lot_no: string; seller: string; vehicle: string; qty: number; rate?: number; weight?: number }[] = [];
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

/** Generate template HTML for preview/print — same format as client_origin PrintsPage. */
export function generateTemplateHTML(templateId: string, arrivalDetails: ArrivalDetail[], firm: FirmInfo): string {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const flatLots = flattenArrivalDetailsToSampleLots(arrivalDetails);
  const sampleLots = flatLots.length > 0
    ? flatLots.slice(0, 5).map((l) => ({ ...l, lot_name: l.lot_name, lot_no: l.lot_no, seller: l.seller, vehicle: l.vehicle, qty: l.qty || 10 }))
    : [
        { lot_name: 'Onion A-Grade', lot_no: 'ONI/001/26', seller: 'Ramesh Kumar', vehicle: 'MH-12-AB-1234', qty: 30, rate: 825, weight: 1500 },
        { lot_name: 'Onion B-Grade', lot_no: 'ONI/002/26', seller: 'Suresh Patil', vehicle: 'MH-14-CD-5678', qty: 25, rate: 805, weight: 1250 },
        { lot_name: 'Tomato Fresh', lot_no: 'TOM/003/26', seller: 'Ramesh Kumar', vehicle: 'MH-12-AB-1234', qty: 20, rate: 600, weight: 1000 },
      ];

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
    case 'sale_pad':
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:420px; margin:auto; padding:16px; font-size:12px">
        ${commonHeader}
        <div style="text-align:center; font-weight:bold; font-size:15px; margin-bottom:14px; color:#1a1a2e">SALE PAD</div>
        <div style="font-size:11px; margin-bottom:8px; color:#555">Date: ${today}</div>
        <table style="${tableStyle}">
          <tr><th style="${thStyle}">Vehicle</th><th style="${thStyle}">Qty</th></tr>
          ${sampleLots.map((l: any) => `<tr><td style="${tdStyle}">${l.vehicle}</td><td style="${tdStyle}; text-align:right">${l.qty}</td></tr>`).join('')}
        </table>
        <table style="${tableStyle}; margin-top:12px">
          <tr><th style="${thStyle}">Slr No</th><th style="${thStyle}">Seller Name</th><th style="${thStyle}">Qty</th></tr>
          ${sampleLots.map((l: any, i: number) => `<tr><td style="${tdStyle}">${i + 1}</td><td style="${tdStyle}">${l.seller}</td><td style="${tdStyle}; text-align:right">${l.qty}</td></tr>`).join('')}
        </table>
        <table style="${tableStyle}; margin-top:12px">
          <tr><th style="${thStyle}">Lot No</th><th style="${thStyle}">Lot Name</th></tr>
          ${sampleLots.map((l: any) => `<tr><td style="${tdStyle}">${l.lot_no}</td><td style="${tdStyle}">${l.lot_name}</td></tr>`).join('')}
        </table>
        ${footer}
      </div>`;

    case 'sales_sticker': {
      const lot = sampleLots[0] || { lot_name: 'Onion', lot_no: 'ONI/001', seller: 'Seller', qty: 10 };
      const shortOrigin = 'Origin';
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; width:150mm; padding:10px; font-size:11px; border:2px dashed #999">
        <div style="text-align:center; font-weight:800; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#1a1a2e">${firm.name || '—'}</div>
        <div style="text-align:center; font-size:16px; font-weight:900; margin-top:4px">${lot.seller}</div>
        <div style="text-align:center; font-size:10px; color:#666; font-weight:700; margin-top:2px">${shortOrigin}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:2px 2px; margin-top:4px">
          <div><strong>Slr Sr No:</strong> 1</div><div><strong>Qty:</strong> ${lot.qty}</div>
          <div><strong>Lot Name / No:</strong> ${lot.lot_name} / ${lot.lot_no}</div><div><strong>Lot No:</strong> ${lot.lot_no}</div>
          <div><strong>V.No:</strong> ${lot.vehicle || 'MH-12-AB-1234'}</div><div><strong>Godown:</strong> A1</div>
        </div>
      </div>`;
    }

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

    case 'tender_slip':
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:900px; margin:auto; padding:20px; font-size:11px">
        ${commonHeader}
        <div style="text-align:center; font-weight:bold; font-size:15px; margin-bottom:12px; color:#1a1a2e">TENDER SLIP FOR BUYERS (Triplicate)</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px">
          ${[1, 2, 3].map(c => `<div style="border:1px solid #d0d8e8; padding:10px; border-radius:6px; background:#fafbff">
            <div style="font-weight:bold; font-size:10px; text-align:center; margin-bottom:6px; color:#5B8CFF">Copy ${c}</div>
            <div style="font-size:10px; text-align:center; font-weight:700">${firm.name || '—'}</div>
            <div style="font-size:9px; text-align:center; color:#666">${firm.about || ''}</div>
            <div style="font-size:9px; text-align:center; color:#666">${firm.address || ''}</div>
            <div style="font-size:9px; text-align:center; color:#888">APMC: ${firm.apmcCode || ''}</div>
            <div style="font-size:9px; margin-top:4px">Date: ${today}</div>
            <table style="width:100%; border-collapse:collapse; font-size:9px; margin-top:4px">
              <tr style="background:#f0f4ff"><th style="border:1px solid #ddd; padding:3px">Lot</th><th style="border:1px solid #ddd; padding:3px">Qty</th><th style="border:1px solid #ddd; padding:3px">Rate</th></tr>
              ${sampleLots.slice(0, 3).map((l: any) => `<tr><td style="border:1px solid #ddd; padding:3px">${l.lot_no}</td><td style="border:1px solid #ddd; padding:3px">${l.qty}</td><td style="border:1px solid #ddd; padding:3px"></td></tr>`).join('')}
            </table>
          </div>`).join('')}
        </div>
        ${footer}
      </div>`;

    case 'chiti_buyer':
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; width:80mm; padding:10px; font-size:10px; border:2px dashed #999">
        <div style="text-align:center; font-weight:800; font-size:13px; color:#1a1a2e">${firm.name || '—'}</div>
        <div style="margin-top:6px"><strong>Buyer's Mark:</strong> ${sampleBuyer.mark}</div>
        <table style="width:100%; border-collapse:collapse; font-size:9px; margin-top:8px">
          <tr style="background:#f0f4ff"><th style="border:1px solid #ddd; padding:4px">Lot Name/No</th><th style="border:1px solid #ddd; padding:4px">Godown</th><th style="border:1px solid #ddd; padding:4px">Qty</th><th style="border:1px solid #ddd; padding:4px">Rate/50kg</th><th style="border:1px solid #ddd; padding:4px">Weight</th><th style="border:1px solid #ddd; padding:4px">Amount</th></tr>
          ${sampleLots.map((l: any) => `<tr>
            <td style="border:1px solid #ddd; padding:3px">${l.lot_name}<br/><small style="color:#888">${l.lot_no}</small></td>
            <td style="border:1px solid #ddd; padding:3px">A1</td>
            <td style="border:1px solid #ddd; padding:3px; text-align:right">${l.qty}</td>
            <td style="border:1px solid #ddd; padding:3px; text-align:right">₹${l.rate || 800}</td>
            <td style="border:1px solid #ddd; padding:3px; text-align:right">${l.weight || l.qty * 50}</td>
            <td style="border:1px solid #ddd; padding:3px; text-align:right">₹${((l.rate || 800) * (l.weight || l.qty * 50) / 50).toLocaleString()}</td>
          </tr>`).join('')}
        </table>
        <div style="font-weight:bold; margin-top:8px; text-align:right">Total Bids: ${sampleLots.length}</div>
        <div style="text-align:center; font-size:8px; margin-top:10px; color:#aaa">Delivered by MERCOTRACE</div>
        <div style="border-top:2px dashed #ccc; margin-top:10px; text-align:center; font-size:8px; color:#bbb; padding-top:4px">--- CUT HERE ---</div>
      </div>`;

    case 'dispatch_coolie':
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:420px; margin:auto; padding:16px; font-size:11px">
        ${commonHeader}
        <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:12px; color:#1a1a2e">DISPATCH CONTROL — COOLIE</div>
        <div style="margin-bottom:10px; font-size:11px; color:#555"><strong>Vehicle:</strong> MH-12-AB-1234 &nbsp; <strong>Qty:</strong> 75 bags &nbsp; <strong>Godown:</strong> A1</div>
        <table style="${tableStyle}">
          <tr><th style="${thStyle}">Slr No</th><th style="${thStyle}">Seller Name</th><th style="${thStyle}">Qty</th><th style="${thStyle}">Lot No</th><th style="${thStyle}">Lot Name</th></tr>
          ${sampleLots.map((l: any, i: number) => `<tr><td style="${tdStyle}">${i + 1}</td><td style="${tdStyle}">${l.seller}</td><td style="${tdStyle}; text-align:right">${l.qty}</td><td style="${tdStyle}">${l.lot_no}</td><td style="${tdStyle}">${l.lot_name}</td></tr>`).join('')}
        </table>
        <div style="margin-top:14px; font-size:10px; font-weight:600"><strong>Buyer Mark & Quantity:</strong></div>
        <table style="${tableStyle}; margin-top:4px">
          <tr><th style="${thStyle}">Buyer Mark</th><th style="${thStyle}">Quantity</th></tr>
          <tr><td style="${tdStyle}">${sampleBuyer.mark}</td><td style="${tdStyle}; text-align:right">30</td></tr>
        </table>
        <div style="font-size:9px; color:#aaa; margin-top:8px; text-align:center">Post Auction – Pre Weighing</div>
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

    case 'chiti_seller': {
      const firstSeller = sampleLots[0]?.seller || 'Ramesh Kumar';
      const sellerLots = sampleLots.filter((l: any) => l.seller === firstSeller);
      const totalQty = sellerLots.reduce((s: number, l: any) => s + (l.qty || 0), 0);
      const totalAmt = sellerLots.reduce((s: number, l: any) => s + ((l.rate || 800) * (l.weight || l.qty * 50) / 50), 0);
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; width:80mm; padding:10px; font-size:10px; border:2px dashed #999">
        <div style="text-align:center; font-weight:800; font-size:13px; color:#1a1a2e">${firm.name || '—'}</div>
        <div style="margin-top:6px"><strong>Seller:</strong> ${firstSeller} &nbsp; <strong>Slr Sr No:</strong> 1</div>
        <table style="width:100%; border-collapse:collapse; font-size:9px; margin-top:8px">
          <tr style="background:#f0f4ff"><th style="border:1px solid #ddd; padding:4px">Lot Name/No</th><th style="border:1px solid #ddd; padding:4px">Qty</th><th style="border:1px solid #ddd; padding:4px">Rate/50kg</th><th style="border:1px solid #ddd; padding:4px">Weight</th></tr>
          ${sellerLots.map((l: any) => `<tr>
            <td style="border:1px solid #ddd; padding:3px">${l.lot_name}<br/><small style="color:#888">${l.lot_no}</small></td>
            <td style="border:1px solid #ddd; padding:3px; text-align:right">${l.qty}</td>
            <td style="border:1px solid #ddd; padding:3px; text-align:right">₹${l.rate || 800}</td>
            <td style="border:1px solid #ddd; padding:3px; text-align:right">${l.weight || l.qty * 50}</td>
          </tr>`).join('')}
        </table>
        <div style="font-weight:bold; margin-top:8px; display:flex; justify-content:space-between; font-size:9px">
          <span>Total Lots: ${sellerLots.length}</span>
          <span>Total Qty: ${totalQty}</span>
          <span>₹${totalAmt.toLocaleString()}</span>
        </div>
        <div style="text-align:center; font-size:8px; margin-top:10px; color:#aaa">Delivered by MERCOTRACE</div>
        <div style="border-top:2px dashed #ccc; margin-top:10px; text-align:center; font-size:8px; color:#bbb; padding-top:4px">--- CUT HERE ---</div>
      </div>`;
    }

    case 'gst_bill': {
      const totalVal = sampleLots.reduce((s: number, l: any) => s + ((l.rate || 800) * (l.weight || l.qty * 50) / 50), 0);
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:700px; margin:auto; padding:20px; font-size:12px">
        <div style="display:flex; justify-content:space-between; font-size:9px; margin-bottom:4px; color:#888">
          <span>GSTIN: ${firm.gstin || '—'}</span><span>PAN: AABCK1234F</span>
        </div>
        ${commonHeader}
        <div style="text-align:center; font-weight:800; font-size:17px; margin-bottom:14px; color:#1a1a2e">TAX INVOICE</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:14px">
          <div><strong>To,</strong><br/>M/s ${sampleBuyer.name}<br/><span style="font-size:10px; color:#666">${sampleBuyer.address}</span></div>
          <div style="text-align:right; font-size:11px"><strong>Bill No:</strong> GST-2026-0042<br/><strong>Bill Date:</strong> ${today}<br/><strong>Item:</strong> Onion A-Grade<br/><strong>HSN Code:</strong> 07031019</div>
        </div>
        <table style="${tableStyle}">
          <tr><th style="${thStyle}">Mark</th><th style="${thStyle}">Quantity</th><th style="${thStyle}">Weight, kg</th><th style="${thStyle}">Rate, ₹/50kg</th><th style="${thStyle}">Amount</th></tr>
          ${sampleLots.map((l: any) => {
            const wt = l.weight || l.qty * 50;
            const amt = (l.rate || 800) * wt / 50;
            return `<tr><td style="${tdStyle}">${sampleBuyer.mark}</td><td style="${tdStyle}; text-align:right">${l.qty}</td><td style="${tdStyle}; text-align:right">${wt}</td><td style="${tdStyle}; text-align:right">₹${l.rate || 800}</td><td style="${tdStyle}; text-align:right">₹${amt.toLocaleString()}</td></tr>`;
          }).join('')}
          <tr style="font-weight:bold; background:#f0f4ff"><td style="${tdStyle}" colspan="4">Total</td><td style="${tdStyle}; text-align:right">₹${totalVal.toLocaleString()}</td></tr>
        </table>
        <table style="${tableStyle}; margin-top:14px">
          <tr style="background:#f0f4ff"><th style="${thStyle}">Tax</th><th style="${thStyle}">Rate</th><th style="${thStyle}">Amount</th></tr>
          <tr><td style="${tdStyle}">CGST</td><td style="${tdStyle}">2.5%</td><td style="${tdStyle}; text-align:right">₹${(totalVal * 0.025).toFixed(0)}</td></tr>
          <tr><td style="${tdStyle}">SGST</td><td style="${tdStyle}">2.5%</td><td style="${tdStyle}; text-align:right">₹${(totalVal * 0.025).toFixed(0)}</td></tr>
          <tr style="font-weight:bold; background:#f0f4ff"><td style="${tdStyle}" colspan="2">Total Tax</td><td style="${tdStyle}; text-align:right">₹${(totalVal * 0.05).toFixed(0)}</td></tr>
        </table>
        <div style="margin-top:14px; font-size:12px; font-weight:700"><strong>Total Amount:</strong> ₹${(totalVal * 1.05).toFixed(0)}</div>
        <div style="font-size:10px; margin-top:4px; color:#666">Total Amount in words: Rupees ${numberToWords(Math.round(totalVal * 1.05))} Only</div>
        <div style="margin-top:16px; padding:10px; background:#f8faff; border-radius:6px; font-size:10px; border:1px solid #e0e4ec">
          <strong>Bank Details:</strong> ${firm.bank.name || '—'} | A/c: ${firm.bank.acc || '—'} | IFSC: ${firm.bank.ifsc || '—'} | ${firm.bank.branch || '—'}
        </div>
        <div style="margin-top:6px; font-size:10px"><strong>COPY NAME:</strong> Original &nbsp; | &nbsp; <strong>BUYER'S MARK:</strong> ${sampleBuyer.mark}</div>
        <div style="text-align:right; font-weight:bold; margin-top:14px">For ${firm.name || '—'}</div>
        ${footer}
      </div>`;
    }

    case 'nongst_bill': {
      const totalVal = sampleLots.reduce((s: number, l: any) => s + ((l.rate || 800) * (l.weight || l.qty * 50) / 50), 0);
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:420px; margin:auto; padding:16px; font-size:11px">
        ${commonHeader}
        <div style="text-align:center; font-weight:bold; font-size:15px; margin-bottom:12px; color:#1a1a2e">SALES BILL (Non-GST)</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:12px">
          <div><strong>To,</strong><br/>M/s ${sampleBuyer.name}<br/><small style="color:#666">${sampleBuyer.address} | ${sampleBuyer.phone}</small></div>
          <div style="text-align:right; font-size:10px"><strong>Bill No:</strong> BIL-2026-0042<br/><strong>Bill Date:</strong> ${today}</div>
        </div>
        <table style="${tableStyle}">
          <tr><th style="${thStyle}">Mark</th><th style="${thStyle}">Qty</th><th style="${thStyle}">Weight</th><th style="${thStyle}">Rate ₹/50kg</th><th style="${thStyle}">Amount</th></tr>
          ${sampleLots.map((l: any) => {
            const wt = l.weight || l.qty * 50;
            const amt = (l.rate || 800) * wt / 50;
            return `<tr><td style="${tdStyle}">${sampleBuyer.mark}</td><td style="${tdStyle}; text-align:right">${l.qty}</td><td style="${tdStyle}; text-align:right">${wt}</td><td style="${tdStyle}; text-align:right">₹${l.rate || 800}</td><td style="${tdStyle}; text-align:right">₹${amt.toLocaleString()}</td></tr>`;
          }).join('')}
        </table>
        <div style="margin-top:10px; text-align:right; font-size:10px; color:#555">
          ${['Commission @5%', 'User Fee @2%', 'Coolie ₹20/bag'].map((c, i) => `<div>${c}: ₹${[3000, 1200, 1500][i]}</div>`).join('')}
          <div style="font-weight:bold; margin-top:6px; font-size:13px; color:#1a1a2e">Total Amount: ₹${(totalVal + 5700).toLocaleString()}</div>
        </div>
        <div style="font-size:9px; margin-top:4px; color:#888">Total Amount in words: Rupees Sixty-Two Thousand Seven Hundred Only</div>
        <div style="margin-top:6px; font-size:10px"><strong>COPY NAME:</strong> Original &nbsp; | &nbsp; <strong>BUYER'S MARK:</strong> ${sampleBuyer.mark}</div>
        <div style="text-align:right; font-weight:bold; margin-top:10px">For ${firm.name || '—'}</div>
        ${footer}
      </div>`;
    }

    case 'seller_invoice':
    case 'main_invoice':
    case 'invoice_a5': {
      const isA5 = templateId === 'invoice_a5';
      const isCollated = templateId === 'main_invoice';
      const totalVal = sampleLots.reduce((s: number, l: any) => s + ((l.rate || 800) * (l.weight || l.qty * 50) / 50), 0);
      return `<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:${isA5 ? '420px' : '700px'}; margin:auto; padding:${isA5 ? '16px' : '20px'}; font-size:${isA5 ? '10px' : '12px'}">
        ${commonHeader}
        <div style="text-align:center; font-weight:800; font-size:${isA5 ? '14px' : '17px'}; margin-bottom:14px; color:#1a1a2e">SALES INVOICE${isCollated ? ' (Collated)' : ''}</div>
        <div style="font-size:11px; margin-bottom:6px; color:#555">Sold <strong>75</strong> Bags of <strong>Onion A-Grade</strong> on account and risk of</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:12px">
          <div>${sampleLots[0]?.seller || 'Ramesh Kumar'}, Nashik<br/><small style="color:#666">Address: Village Road, Nashik</small><br/><small style="color:#666">Vehicle No: MH-12-AB-1234</small></div>
          <div style="text-align:right; font-size:11px"><strong>Invoice No:</strong> INV-2026-0018<br/><strong>Invoice Date:</strong> ${today}</div>
        </div>
        <table style="${tableStyle}">
          <tr><th style="${thStyle}">Mark</th><th style="${thStyle}">Qty</th><th style="${thStyle}">Weight, kg</th><th style="${thStyle}">Rate ₹/50kg</th><th style="${thStyle}">Amount</th><th style="${thStyle}">Particulars</th><th style="${thStyle}">Deductions</th></tr>
          ${sampleLots.map((l: any) => {
            const wt = l.weight || l.qty * 50;
            const amt = (l.rate || 800) * wt / 50;
            return `<tr><td style="${tdStyle}">${sampleBuyer.mark}</td><td style="${tdStyle}; text-align:right">${l.qty}</td><td style="${tdStyle}; text-align:right">${wt}</td><td style="${tdStyle}; text-align:right">₹${l.rate || 800}</td><td style="${tdStyle}; text-align:right">₹${amt.toLocaleString()}</td><td style="${tdStyle}"></td><td style="${tdStyle}"></td></tr>`;
          }).join('')}
        </table>
        <div style="margin-top:10px; text-align:right; font-size:10px; color:#555">
          <div>Commission @5%: ₹3,000 (Deductible)</div>
          <div>User Fee @2%: ₹1,200 (Deductible)</div>
          <div>Coolie ₹20/bag: ₹1,500 (Deductible)</div>
          <div style="font-weight:bold; margin-top:6px; font-size:13px; color:#1a1a2e">Total Amount: ₹${(totalVal - 5700).toLocaleString()}</div>
        </div>
        <div style="font-size:9px; margin-top:4px; color:#888">Total Amount in words: Rupees Fifty-One Thousand Three Hundred Only</div>
        <div style="margin-top:6px; font-size:10px"><strong>COPY NAME:</strong> Original</div>
        <div style="text-align:right; font-weight:bold; margin-top:10px">For ${firm.name || '—'}</div>
        ${footer}
      </div>`;
    }

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
