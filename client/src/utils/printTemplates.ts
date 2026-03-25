import { Capacitor, registerPlugin } from "@capacitor/core";

// ── Print Templates for Print Hub ──────────────────────────
// REQ-LOG-002: All print formats per SRS (same format as client_origin)

type MercoPrinterPlugin = {
  printHtml(options: {
    html: string;
    thermalText?: string;
    mode?: "auto" | "system" | "thermal";
    deviceMac?: string;
    jobName?: string;
  }): Promise<{ ok?: boolean }>;
  listPrinters(): Promise<{ printers: { mac: string; name: string }[] }>;
  requestBluetoothPermissions(): Promise<{ granted: boolean }>;
};

const mercoPrinter = registerPlugin<MercoPrinterPlugin>("MercoPrinter");

type PrintMode = "auto" | "system" | "thermal";

const BOUND_PRINTER_MAC_KEY = "merco.boundBluetoothPrinterMac";

export interface BidInfo {
  bidNumber: number;
  buyerMark: string;
  buyerName: string;
  quantity: number;
  /** Total bags for this vehicle across all sellers (vehicle total qty) */
  vehicleTotalQty?: number;
  /** Total bags for this seller on the same vehicle (seller qty) */
  sellerVehicleQty?: number;
  rate: number;
  lotId: string;
  lotName: string;
  sellerName: string;
  sellerSerial: number;
  lotNumber: number;
  vehicleNumber: string;
  commodityName: string;
  origin?: string;
  godown?: string;
  weight?: number;
}

type ThermalPayload = { html: string; thermalText: string };
type PrintPayload = string | ThermalPayload;

// ── Helpers ───────────────────────────────────────────────
function lotDisplay(bid: BidInfo): string {
  if (bid.vehicleTotalQty != null && bid.sellerVehicleQty != null) {
    return `${bid.vehicleTotalQty}/${bid.sellerVehicleQty}`;
  }
  if (bid.lotName && bid.lotName !== String(bid.lotNumber)) {
    return `${bid.lotNumber} / ${bid.lotName}`;
  }
  return String(bid.lotNumber);
}

/**
 * Lot identifier format: Vehicle QTY / Seller QTY / Lot Name - Lot QTY (e.g. 320/320/110-110).
 * Aligns with AuctionsPage format for list display and search consistency.
 */
export function formatLotIdentifierForBid(bid: BidInfo): string {
  const vTotal = bid.vehicleTotalQty ?? bid.quantity;
  const sTotal = bid.sellerVehicleQty ?? bid.quantity;
  const lotName = (bid.lotName || '').trim() || String(bid.lotNumber);
  const lotQty = bid.quantity;
  return `${vTotal}/${sTotal}/${lotName}-${lotQty}`;
}

function todayStr(): string {
  return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function firmHeader(): string {
  return `<div class="firm-header">
    <div class="firm-name">MERCOTRACE</div>
    <div class="firm-line">Agricultural Produce Market Committee</div>
    <div class="firm-line">APMC Market Yard</div>
    <div class="firm-info-row">
      <span class="firm-lbl">APMC Code</span>
      <span class="firm-val">MT-001</span>
    </div>
    <div class="firm-info-row">
      <span class="firm-lbl">Date</span>
      <span class="firm-val">${todayStr()}</span>
    </div>
  </div>`;
}

// Thermal ESC/POS helpers
const THERMAL_CHARS_PER_LINE = 48; // matches EscPosPrinter(..., 48)
function clampThermalText(s: string, maxLen: number): string {
  const str = String(s ?? "");
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 1)) + ".";
}
function padThermalLeft(s: string, width: number): string {
  const str = String(s ?? "");
  if (str.length >= width) return str;
  return " ".repeat(width - str.length) + str;
}
function padThermalRight(s: string, width: number): string {
  const str = String(s ?? "");
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}
function centerThermal(s: string, width: number = THERMAL_CHARS_PER_LINE): string {
  const str = String(s ?? "").trim();
  if (str.length >= width) return str.slice(0, width);
  const total = width - str.length;
  const left = Math.floor(total / 2);
  const right = total - left;
  return " ".repeat(left) + str + " ".repeat(right);
}
function escposBold(s: string): string {
  return `<b>${s}</b>`;
}
function escapeThermalPrice(s: string): string {
  // Keep the rupee symbol to match desktop output text.
  return String(s);
}

// ── Direct Print Engine ──────────────────────────────────
export async function directPrint(
  payload: PrintPayload,
  options?: { mode?: PrintMode; deviceMac?: string }
): Promise<boolean> {
  const html = typeof payload === "string" ? payload : payload.html;
  const thermalText = typeof payload === "string" ? undefined : payload.thermalText;
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  const mode: PrintMode = options?.mode ?? "system";
  const deviceMac = options?.deviceMac ?? getBoundPrinterMac();

  // 1) Android native attempt
  if (isAndroidNative) {
    try {
      await Promise.race([
        mercoPrinter.printHtml({
          html,
          thermalText,
          mode,
          deviceMac,
          jobName: "MercoPrint",
        }),
        new Promise<never>((_resolve, reject) => {
          window.setTimeout(() => reject(new Error("Native print timeout")), 12000);
        }),
      ]);
      return true;
    } catch {
      // If native plugin is not available/registered on this build/device,
      // fall back to iframe printing.
    }
  }

  // 2) Desktop / web (and Android fallback): open an offscreen iframe and trigger print()
  return directPrintViaIframe(html);
}

function getBoundPrinterMac(): string | undefined {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return undefined;
  try {
    const v = window.localStorage.getItem(BOUND_PRINTER_MAC_KEY);
    return v ?? undefined;
  } catch {
    return undefined;
  }
}

async function directPrintViaIframe(html: string): Promise<boolean> {
  try {
    const printFrame = document.createElement("iframe");
    // Use a real size (not 0x0) to help Android WebView render/print reliably.
    printFrame.style.cssText =
      "position:fixed;top:-10000px;left:-10000px;width:800px;height:600px;opacity:0;pointer-events:none;border:0;";
    document.body.appendChild(printFrame);

    const cleanup = () => {
      try {
        document.body.removeChild(printFrame);
      } catch {
        // ignore
      }
    };

    // Prefer `srcdoc` so the iframe actually loads content before printing.
    // (Some WebViews fail if we rely only on `contentDocument` immediately.)
    printFrame.srcdoc = html;

    const timeoutMs = 8000;
    const startedAt = Date.now();

    return await new Promise<boolean>((resolve) => {
      let settled = false;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        // Give WebView a moment to hand off the print job to Android.
        if (ok) {
          window.setTimeout(() => cleanup(), 1500);
        } else {
          cleanup();
        }
        resolve(ok);
      };

      printFrame.onload = () => {
        setTimeout(() => {
          try {
            printFrame.contentWindow?.focus();
            printFrame.contentWindow?.print();
            finish(true);
          } catch {
            finish(false);
          }
        }, 250);
      };

      const timer = window.setTimeout(() => {
        if (Date.now() - startedAt >= timeoutMs) {
          // If load never happened, printing likely can't be triggered.
          finish(false);
        }
        window.clearTimeout(timer);
      }, timeoutMs);
    });
  } catch {
    return false;
  }
}

// ── 1. Sales Sticker (Thermal Adhesive, Landscape) ──────
// Layout: top = firm name, then seller name; then origin full width; then lot id; then buyer mark; then grid (label + value start from left)
export function generateSalesSticker(bid: BidInfo): string {
  const commodity = (bid.commodityName && bid.commodityName.trim()) ? bid.commodityName.trim() : '—';
  return `<!DOCTYPE html><html><head><style>
    @page { size: landscape; margin: 2mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 4mm; }
    .sticker { border: 2px dashed #333; border-radius: 8px; padding: 10px; max-width: 400px; }
    .firm-name { text-align: center; font-size: 13px; font-weight: 900; letter-spacing: 1px; margin-bottom: 2px; }
    .cell { display: flex; align-items: baseline; gap: 6px; padding: 2px 0; font-size: 11px; }
    .cell .lbl { color: #666; font-size: 9px; text-transform: uppercase; font-weight: 600; flex-shrink: 0; }
    .cell .val { font-weight: 800; font-size: 13px; }
    .center-top { text-align: center; font-size: 14px; font-weight: 800; margin-bottom: 4px; }
    .origin-full { text-align: center; font-size: 11px; font-weight: 700; width: 100%; margin-bottom: 6px; word-break: break-word; }
    .lot-big { text-align: center; font-size: 36px; font-weight: 900; padding: 8px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; margin: 6px 0; }
    .mark-big { text-align: center; font-size: 28px; font-weight: 900; letter-spacing: 3px; background: #f0f0f0; border-radius: 6px; padding: 6px; margin: 4px 0; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 2px; }
    @media print { body { margin: 0; padding: 2mm; } }
  </style></head><body>
    <div class="sticker">
      <div class="firm-name">MERCOTRACE</div>
      <div class="center-top">${escapeStickerHtml(bid.sellerName)}</div>
      <div class="origin-full">${escapeStickerHtml(bid.origin || '—')}</div>
      <div class="lot-big">${lotDisplay(bid)}</div>
      <div class="mark-big">[${escapeStickerHtml(bid.buyerMark)}]</div>
      <div class="grid2">
        <div class="cell"><span class="lbl">Sl No</span><span class="val">${bid.sellerSerial}</span></div>
        <div class="cell"><span class="lbl">Qty</span><span class="val">${bid.quantity} bags</span></div>
        <div class="cell"><span class="lbl">Godown</span><span class="val">${escapeStickerHtml(bid.godown || '—')}</span></div>
        <div class="cell"><span class="lbl">V No</span><span class="val">${escapeStickerHtml(bid.vehicleNumber)}</span></div>
        <div class="cell"><span class="lbl">Commodity</span><span class="val">${escapeStickerHtml(commodity)}</span></div>
        <div class="cell"><span class="lbl">Date</span><span class="val">${todayStr()}</span></div>
      </div>
    </div>
  </body></html>`;
}

// ── Thermal (ESC/POS) Templates ───────────────────────────
export function generateSalesStickerThermal(bid: BidInfo): string {
  const commodity = (bid.commodityName && bid.commodityName.trim()) ? bid.commodityName.trim() : "—";
  const lot = lotDisplay(bid);
  const dateStr = todayStr();
  const col = 24; // 48/2
  const row = (a: string, b: string) => padThermalRight(clampThermalText(a, col), col) + padThermalRight(clampThermalText(b, col), col);

  return [
    "[C]" + escposBold("MERCOTRACE"),
    "[C]" + escposBold(String(bid.sellerName ?? "")),
    "[C]" + clampThermalText(String(bid.origin ?? "—"), THERMAL_CHARS_PER_LINE),
    "[C]" + escposBold(clampThermalText(lot, THERMAL_CHARS_PER_LINE)),
    "[C]" + escposBold(`[${String(bid.buyerMark ?? "").trim()}]`),
    "",
    "[L]" + row(`Sl No ${bid.sellerSerial}`, `${bid.quantity} bags`),
    "[L]" + row(`Godown ${bid.godown || "—"}`, `V No ${bid.vehicleNumber}`),
    "[L]" + row(`Commodity ${commodity}`, `Date ${dateStr}`),
    "",
  ].join("\n");
}

export function generateBuyerChitiThermal(
  buyerName: string,
  buyerMark: string,
  bids: BidInfo[],
  stage: "post-auction" | "post-weighing" = "post-auction"
): string {
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalAmt = bids.reduce((s, b) => s + b.quantity * b.rate, 0);

  // Column widths sum to 48 (approximation for thermal alignment)
  const wLot = 15;
  const wGdwn = 8;
  const wQty = 4;
  const wMark = 8;
  const wRate = 8;
  const wWt = stage === "post-weighing" ? 5 : 0;

  const pad = (s: string, w: number) => padThermalRight(clampThermalText(s, w), w);
  const lineLR = (left: string, right: string) => {
    const l = String(left ?? "");
    const r = String(right ?? "");
    const rClamped = clampThermalText(r, THERMAL_CHARS_PER_LINE);
    const lClamped = clampThermalText(l, THERMAL_CHARS_PER_LINE);
    if (rClamped.length >= THERMAL_CHARS_PER_LINE) return rClamped.slice(0, THERMAL_CHARS_PER_LINE);
    const available = THERMAL_CHARS_PER_LINE - rClamped.length;
    const lPart = lClamped.length > available ? lClamped.slice(0, Math.max(0, available)) : lClamped;
    const spaces = Math.max(1, available - lPart.length);
    return lPart + " ".repeat(spaces) + rClamped;
  };

  const header = [
    "[C]Mercotrace",
    "[C]" + clampThermalText(buyerName, THERMAL_CHARS_PER_LINE),
    "[C]" + escposBold(`[${String(buyerMark ?? "").trim()}]`),
    "",
    "[L]" + pad("Lot", wLot) + pad("Gdwn", wGdwn) + pad("Qty", wQty) + pad("Mark", wMark) + pad("Rate", wRate) + (stage === "post-weighing" ? pad("Wt", wWt) : ""),
  ].join("\n");

  const rows = bids
    .map((b) => {
      const lot = lotDisplay(b);
      const rateTxt = escapeThermalPrice(`₹${b.rate}`);
      const wtTxt = stage === "post-weighing" ? `${b.weight ?? "—"} kg` : "";

      const line1 =
        pad(lot, wLot) +
        pad(b.godown || "—", wGdwn) +
        pad(String(b.quantity), wQty) +
        pad(`[${b.buyerMark}]`, wMark) +
        pad(rateTxt, wRate) +
        (stage === "post-weighing" ? pad(wtTxt, wWt) : "");

      return "[L]" + line1;
    })
    .join("\n");

  const totals = [
    "",
    "[L]" + lineLR("Total Qty", `${totalQty} bags`),
    "[L]" + lineLR("Total Amount", `₹${totalAmt.toLocaleString("en-IN")}`),
    "",
    "[C]Powered by Mercotrace",
    "",
    "[L]--------------------------------",
    "",
  ].join("\n");

  return header + "\n" + rows + totals;
}

export function generateSellerChitiThermal(
  sellerName: string,
  sellerSerial: number,
  bids: BidInfo[],
  stage: "post-auction" | "post-weighing" = "post-auction"
): string {
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalAmt = bids.reduce((s, b) => s + b.quantity * b.rate, 0);

  const primaryMark = bids[0]?.buyerMark ?? "";

  // Column widths sum to 48 (approximation for thermal alignment)
  const wLot = 18;
  const wMark = 10;
  const wQty = 4;
  const wRate = 10;
  const wWt = stage === "post-weighing" ? 6 : 0;

  const pad = (s: string, w: number) => padThermalRight(clampThermalText(s, w), w);
  const lineLR = (left: string, right: string) => {
    const l = String(left ?? "");
    const r = String(right ?? "");
    const rClamped = clampThermalText(r, THERMAL_CHARS_PER_LINE);
    const lClamped = clampThermalText(l, THERMAL_CHARS_PER_LINE);
    if (rClamped.length >= THERMAL_CHARS_PER_LINE) return rClamped.slice(0, THERMAL_CHARS_PER_LINE);
    const available = THERMAL_CHARS_PER_LINE - rClamped.length;
    const lPart = lClamped.length > available ? lClamped.slice(0, Math.max(0, available)) : lClamped;
    const spaces = Math.max(1, available - lPart.length);
    return lPart + " ".repeat(spaces) + rClamped;
  };

  const header = [
    "[C]Mercotrace",
    "",
    "[C]" + clampThermalText(sellerName, THERMAL_CHARS_PER_LINE),
    "[C]" + (primaryMark ? escposBold(`[${String(primaryMark ?? "").trim()}]`) : ""),
    "[C]" + clampThermalText(`S.No: ${sellerSerial}`, THERMAL_CHARS_PER_LINE),
    "",
    "[L]" + pad("Lot", wLot) + pad("Mark", wMark) + pad("Qty", wQty) + pad("Rate", wRate) + (stage === "post-weighing" ? pad("Wt", wWt) : ""),
  ].join("\n");

  const rows = bids
    .map((b) => {
      const rateTxt = escapeThermalPrice(`₹${b.rate}`);
      const wtTxt = stage === "post-weighing" ? `${b.weight ?? "—"} kg` : "";

      const line =
        pad(lotDisplay(b), wLot) +
        pad(`[${b.buyerMark}]`, wMark) +
        pad(String(b.quantity), wQty) +
        pad(rateTxt, wRate) +
        (stage === "post-weighing" ? pad(wtTxt, wWt) : "");

      return "[L]" + line;
    })
    .join("\n");

  const totals = [
    "",
    "[L]" + lineLR("Total Qty", `${totalQty} bags`),
    "[L]" + lineLR("Total Amount", `₹${totalAmt.toLocaleString("en-IN")}`),
    "",
    "[C]Powered by Mercotrace",
    "",
    "[L]--------------------------------",
    "",
  ].join("\n");

  return header + "\n" + rows + totals;
}

function escapeStickerHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 2. Buyer Chiti (80mm thermal) ────────────────────────
export function generateBuyerChiti(buyerName: string, buyerMark: string, bids: BidInfo[], stage: 'post-auction' | 'post-weighing' = 'post-auction'): string {
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalAmt = bids.reduce((s, b) => s + b.quantity * b.rate, 0);
  const rows = bids.map(b => `
    <tr>
      <td>${lotDisplay(b)}</td>
      <td>${b.godown || '—'}</td>
      <td>${b.quantity}</td>
      <td>[${b.buyerMark}]</td>
      <td>₹${b.rate}</td>
      ${stage === 'post-weighing' ? `<td>${b.weight ?? '—'} kg</td>` : ''}
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><style>
    @page { size: 80mm auto; margin: 2mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 4px; width: 76mm; font-size: 11px; }
    .header { text-align: center; border-bottom: 1px dashed #333; padding-bottom: 4px; margin-bottom: 4px; }
    .header h3 { margin: 2px 0; font-size: 14px; }
    .header small { color: #666; font-size: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .buyer-info { background: #f5f5f5; border-radius: 4px; padding: 6px; margin-bottom: 6px; text-align: center; }
    .buyer-info .mark { font-size: 22px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #eee; padding: 3px 2px; text-align: left; font-size: 9px; text-transform: uppercase; }
    td { padding: 3px 2px; border-bottom: 1px dotted #ddd; }
    .totals { border-top: 2px solid #333; margin-top: 6px; padding-top: 6px; font-weight: 800; }
    .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .stage { display: none; }
    .powered { text-align: center; font-size: 8px; color: #666; margin-top: 4px; }
    .cut-line { border-top: 1px dashed #999; margin-top: 6px; padding-top: 2px; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <div class="header"><h3>Mercotrace</h3></div>
    <div class="buyer-info">
      <div style="font-size:11px;color:#666">${buyerName}</div>
      <div class="mark">[${buyerMark}]</div>
    </div>
    <table>
      <thead><tr><th>Lot</th><th>Gdwn</th><th>Qty</th><th>Mark</th><th>Rate</th>${stage === 'post-weighing' ? '<th>Wt</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Total Qty</span><span>${totalQty} bags</span></div>
      <div class="row"><span>Total Amount</span><span>₹${totalAmt.toLocaleString('en-IN')}</span></div>
    </div>
    <div class="powered">Powered by Mercotrace</div>
    <div class="cut-line"></div>
  </body></html>`;
}

// ── 3. Seller Chiti (80mm thermal) ───────────────────────
export function generateSellerChiti(sellerName: string, sellerSerial: number, bids: BidInfo[], stage: 'post-auction' | 'post-weighing' = 'post-auction'): string {
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalAmt = bids.reduce((s, b) => s + b.quantity * b.rate, 0);
  const primaryMark = bids[0]?.buyerMark ?? '';
  const rows = bids.map(b => `
    <tr>
      <td>${lotDisplay(b)}</td>
      <td>[${b.buyerMark}]</td>
      <td>${b.quantity}</td>
      <td>₹${b.rate}</td>
      ${stage === 'post-weighing' ? `<td>${b.weight ?? '—'} kg</td>` : ''}
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><style>
    @page { size: 80mm auto; margin: 2mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 4px; width: 76mm; font-size: 11px; }
    .header { text-align: center; border-bottom: 1px dashed #333; padding-bottom: 4px; margin-bottom: 4px; }
    .header h3 { margin: 2px 0; font-size: 14px; }
    .header small { color: #666; font-size: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .seller-info { background: #f5f5f5; border-radius: 4px; padding: 6px; margin-bottom: 6px; text-align: center; }
    .seller-info .name { font-size: 13px; font-weight: 800; }
    .seller-info .mark { font-size: 18px; font-weight: 900; letter-spacing: 2px; margin-top: 2px; }
    .seller-info .serial { font-size: 10px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #eee; padding: 3px 2px; text-align: left; font-size: 9px; text-transform: uppercase; }
    td { padding: 3px 2px; border-bottom: 1px dotted #ddd; }
    .totals { border-top: 2px solid #333; margin-top: 6px; padding-top: 6px; font-weight: 800; }
    .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .stage { display: none; }
    .powered { text-align: center; font-size: 8px; color: #666; margin-top: 4px; }
    .cut-line { border-top: 1px dashed #999; margin-top: 6px; padding-top: 2px; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <div class="header"><h3>Mercotrace</h3></div>
    <div class="seller-info">
      <div class="name">${sellerName}</div>
      ${primaryMark ? `<div class="mark">[${primaryMark}]</div>` : ''}
      <div class="serial">S.No: ${sellerSerial}</div>
    </div>
    <table>
      <thead><tr><th>Lot</th><th>Mark</th><th>Qty</th><th>Rate</th>${stage === 'post-weighing' ? '<th>Wt</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Total Qty</span><span>${totalQty} bags</span></div>
      <div class="row"><span>Total Amount</span><span>₹${totalAmt.toLocaleString('en-IN')}</span></div>
    </div>
    <div class="powered">Powered by Mercotrace</div>
    <div class="cut-line"></div>
  </body></html>`;
}

// ── 4. Sale Pad Print (A5 Portrait) ─────────────────────
export function generateSalePadPrint(bids: BidInfo[]): string {
  const rows = bids.map(b => `
    <tr>
      <td>${b.sellerSerial}</td>
      <td>${b.sellerName}</td>
      <td>${lotDisplay(b)}</td>
      <td>[${b.buyerMark}]</td>
      <td>${b.quantity}</td>
      <td>₹${b.rate}</td>
      <td>₹${b.quantity * b.rate}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><style>
    @page { size: A5 portrait; margin: 8mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 8mm; font-size: 11px; }
    ${firmHeaderCSS()}
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #333; color: #fff; padding: 4px 6px; font-size: 9px; text-transform: uppercase; text-align: left; }
    td { padding: 4px 6px; border-bottom: 1px solid #ddd; font-size: 10px; }
    tr:nth-child(even) { background: #f9f9f9; }
    @media print { body { margin: 0; padding: 8mm; } }
  </style></head><body>
    ${firmHeader()}
    <table>
      <thead><tr><th>Sl</th><th>Seller</th><th>Lot</th><th>Mark</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;
}

// ── 5. Tender Slip for Buyers (A4 Landscape, Triplicate) ─
export function generateTenderSlip(bids: BidInfo[]): string {
  const rows = bids.map(b => `<tr><td>${lotDisplay(b)}</td><td>${b.quantity}</td><td>₹${b.rate}</td></tr>`).join('');
  const singleSlip = `<div class="slip">
    <div class="firm-header">
      <div class="firm-name">MERCOTRACE</div>
      <div class="firm-line">Agricultural Produce Market Committee</div>
      <div class="firm-line">APMC Market Yard</div>
      <div class="info-row">
        <span class="lbl">APMC Code</span>
        <span class="val">MT-001</span>
      </div>
      <div class="info-row">
        <span class="lbl">Date</span>
        <span class="val">${todayStr()}</span>
      </div>
    </div>
    <table><thead><tr><th>LOT</th><th>BAGS</th><th>RATE</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;

  return `<!DOCTYPE html><html><head><style>
    @page { size: A4 landscape; margin: 6mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 6mm; }
    .triplicate { display: flex; flex-direction: row; gap: 8px; }
    .slip { border: 1px solid #ccc; border-radius: 4px; padding: 8px; page-break-inside: avoid; flex: 1 1 0; }
    .firm-header { text-align: center; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
    .firm-name { font-size: 16px; font-weight: 900; text-transform: uppercase; }
    .firm-line { font-size: 10px; color: #555; }
    .info-row { display: flex; align-items: baseline; gap: 6px; font-size: 10px; margin-top: 2px; }
    .info-row .lbl { color: #666; font-size: 9px; text-transform: uppercase; font-weight: 400; flex-shrink: 0; }
    .info-row .val { font-weight: 700; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #eee; padding: 3px 6px; font-size: 10px; text-transform: uppercase; text-align: left; border: 1px solid #ccc; }
    td { padding: 3px 6px; font-size: 11px; border: 1px solid #ddd; }
    @media print { body { margin: 0; padding: 6mm; } }
  </style></head><body>
    <div class="triplicate">
      ${singleSlip}
      ${singleSlip}
      ${singleSlip}
    </div>
  </body></html>`;
}

// ── 6. Dispatch Control for Coolie (A5 Portrait) ────────
export function generateDispatchControl(bids: BidInfo[]): string {
  const sellerGroups: Record<string, BidInfo[]> = {};
  bids.forEach(b => {
    const key = b.sellerName;
    if (!sellerGroups[key]) sellerGroups[key] = [];
    sellerGroups[key].push(b);
  });

  let sections = '';
  Object.entries(sellerGroups).forEach(([seller, sBids]) => {
    const sellerQty = sBids.reduce((s, b) => s + b.quantity, 0);
    sections += `<div class="seller-block">
      <div class="seller-head">
        <span class="sname">${seller}</span>
        <span class="sqty">Total: ${sellerQty} bags</span>
      </div>`;
    sBids.forEach((b, idx) => {
      sections += `<div class="lot-row">
        <span>Sr ${idx + 1}</span>
        <span>Lot ${lotDisplay(b)}</span>
        <span>Gdwn: ${b.godown || '—'}</span>
        <span>[${b.buyerMark}]</span>
        <span>${b.quantity} bags</span>
      </div>`;
    });
    sections += `</div>`;
  });

  return `<!DOCTYPE html><html><head><style>
    @page { size: A5 portrait; margin: 6mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 6mm; font-size: 11px; }
    .title { text-align: center; font-size: 14px; font-weight: 900; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
    .seller-block { margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
    .seller-head { background: #333; color: #fff; padding: 4px 8px; display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
    .lot-row { display: flex; justify-content: space-between; padding: 3px 8px; font-size: 10px; border-bottom: 1px dotted #eee; }
    .lot-row:last-child { border-bottom: none; }
    @media print { body { margin: 0; padding: 6mm; } }
  </style></head><body>
    <div class="title">Dispatch Control - Coolie</div>
    ${sections}
  </body></html>`;
}

function firmHeaderCSS(): string {
  return `.firm-header { text-align: center; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
    .firm-name { font-size: 16px; font-weight: 900; text-transform: uppercase; }
    .firm-line { font-size: 10px; color: #555; }
    .firm-info-row { display: flex; align-items: baseline; gap: 6px; font-size: 10px; margin-top: 2px; justify-content: center; }
    .firm-lbl { color: #666; font-size: 9px; text-transform: uppercase; font-weight: 400; flex-shrink: 0; }
    .firm-val { font-weight: 700; font-size: 10px; }`;
}
