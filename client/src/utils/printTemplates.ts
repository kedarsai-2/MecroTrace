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
  const lotIdentifier = formatLotIdentifierForBid(bid);
  const shortOrigin = String(bid.origin || "—").trim().slice(0, 28);
  return `<!DOCTYPE html><html><head><style>
    @page { size: landscape; margin: 2mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 4mm; }
    .sticker { border: 2px dashed #333; border-radius: 8px; padding: 10px; max-width: 400px; }
    .firm-name { text-align: center; font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 2px; text-transform: uppercase; }
    .cell { display: flex; align-items: baseline; gap: 6px; padding: 2px 0; font-size: 11px; }
    .cell .lbl { color: #666; font-size: 9px; text-transform: uppercase; font-weight: 600; flex-shrink: 0; }
    .cell .val { font-weight: 800; font-size: 13px; }
    .center-top { text-align: center; font-size: 16px; font-weight: 900; margin-bottom: 2px; }
    .origin-full { text-align: center; font-size: 10px; font-weight: 700; width: 100%; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 2px; }
    @media print { body { margin: 0; padding: 2mm; } }
  </style></head><body>
    <div class="sticker">
      <div class="firm-name">MERCOTRACE</div>
      <div class="center-top">${escapeStickerHtml(bid.sellerName || '—')}</div>
      <div class="origin-full">${escapeStickerHtml(shortOrigin)}</div>
      <div class="grid2">
        <div class="cell"><span class="lbl">Slr Sr No</span><span class="val">${escapeStickerHtml(String(bid.sellerSerial ?? '—'))}</span></div>
        <div class="cell"><span class="lbl">Qty</span><span class="val">${escapeStickerHtml(String(bid.quantity ?? '—'))}</span></div>
        <div class="cell"><span class="lbl">Lot Name / No</span><span class="val">${escapeStickerHtml(lotIdentifier || '—')}</span></div>
        <div class="cell"><span class="lbl">Lot No</span><span class="val">${escapeStickerHtml(String(bid.lotNumber ?? '—'))}</span></div>
        <div class="cell"><span class="lbl">V. No</span><span class="val">${escapeStickerHtml(bid.vehicleNumber || '—')}</span></div>
        <div class="cell"><span class="lbl">Godown</span><span class="val">${escapeStickerHtml(bid.godown || '—')}</span></div>
      </div>
    </div>
  </body></html>`;
}

// ── Thermal (ESC/POS) Templates ───────────────────────────
export function generateSalesStickerThermal(bid: BidInfo): string {
  const lotIdentifier = formatLotIdentifierForBid(bid);
  const shortOrigin = String(bid.origin ?? "—").trim().slice(0, 28);
  const col = 24; // 48/2
  const row = (a: string, b: string) => padThermalRight(clampThermalText(a, col), col) + padThermalRight(clampThermalText(b, col), col);

  return [
    "[C]" + escposBold("MERCOTRACE"),
    "[C]" + escposBold(String(bid.sellerName ?? "")),
    "[C]" + clampThermalText(shortOrigin, THERMAL_CHARS_PER_LINE),
    "",
    "[L]" + row("SLR SR NO", "QTY"),
    "[L]" + row(String(bid.sellerSerial ?? "—"), String(bid.quantity ?? "—")),
    "[L]" + row("LOT NAME / NO", "LOT NO"),
    "[L]" + row(String(lotIdentifier || "—"), String(bid.lotNumber ?? "—")),
    "[L]" + row("V. NO", "GODOWN"),
    "[L]" + row(String(bid.vehicleNumber || "—"), String(bid.godown || "—")),
    "",
  ].join("\n");
}

export function generateBuyerChitiThermal(
  buyerName: string,
  buyerMark: string,
  bids: BidInfo[],
  stage: "post-auction" | "post-weighing" = "post-auction"
): string {
  const _stage = stage;
  void _stage;
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalBid = bids.length;

  // Column widths sum to 48 (approximation for thermal alignment)
  const wLot = 13;
  const wLotSl = 6;
  const wGdwn = 8;
  const wRate = 7;
  const wQty = 4;
  const wMark = 8;

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
    "[L]--------------------------------",
    "",
    "[L]" + pad("Lot Name", wLot) + pad("LotSL", wLotSl) + pad("Gdwn", wGdwn) + pad("Rate", wRate) + pad("Qty", wQty) + pad("Mark", wMark),
  ].join("\n");

  const rows = bids
    .map((b) => {
      const lot = formatLotIdentifierForBid(b);
      const rateTxt = escapeThermalPrice(`₹${b.rate}`);

      const line1 =
        pad(lot, wLot) +
        pad(String(b.lotNumber && b.lotNumber > 0 ? b.lotNumber : "—"), wLotSl) +
        pad(b.godown || "—", wGdwn) +
        pad(rateTxt, wRate) +
        pad(String(b.quantity), wQty) +
        pad(`[${b.buyerMark}]`, wMark);

      return "[L]" + line1;
    })
    .join("\n");

  const totals = [
    "",
    "[L]" + lineLR("Total Bid", String(totalBid)),
    "[L]" + lineLR("Total QTY", `${totalQty}`),
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
  const _stage = stage;
  void _stage;
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalLot = bids.length;

  // Column widths sum to 48 (approximation for thermal alignment)
  const wLot = 14;
  const wLotSl = 6;
  const wMark = 9;
  const wQty = 4;
  const wRate = 8;

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
    "[C]" + clampThermalText(`S.No: ${sellerSerial}`, THERMAL_CHARS_PER_LINE),
    "[L]--------------------------------",
    "",
    "[L]" + pad("Lot Name", wLot) + pad("LotSL", wLotSl) + pad("Mark", wMark) + pad("Qty", wQty) + pad("Rate", wRate),
  ].join("\n");

  const rows = bids
    .map((b) => {
      const rateTxt = escapeThermalPrice(`₹${b.rate}`);

      const line =
        pad(formatLotIdentifierForBid(b), wLot) +
        pad(String(b.lotNumber && b.lotNumber > 0 ? b.lotNumber : "—"), wLotSl) +
        pad(`[${b.buyerMark}]`, wMark) +
        pad(String(b.quantity), wQty) +
        pad(rateTxt, wRate);

      return "[L]" + line;
    })
    .join("\n");

  const totals = [
    "",
    "[L]" + lineLR("Total Lot", String(totalLot)),
    "[L]" + lineLR("Total QTY", String(totalQty)),
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
  const _stage = stage;
  void _stage;
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalBid = bids.length;
  const rows = bids.map(b => `
    <tr>
      <td>${formatLotIdentifierForBid(b)}</td>
      <td>${b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}</td>
      <td>${b.godown || '—'}</td>
      <td>₹${b.rate}</td>
      <td>${b.quantity}</td>
      <td>[${b.buyerMark}]</td>
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
      <thead><tr><th>Lot Name</th><th>Lot SL No</th><th>Gdwn</th><th>Rate</th><th>Qty</th><th>Mark</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Total Bid</span><span>${totalBid}</span></div>
      <div class="row"><span>Total QTY</span><span>${totalQty}</span></div>
    </div>
    <div class="cut-line"></div>
  </body></html>`;
}

// ── 3. Seller Chiti (80mm thermal) ───────────────────────
export function generateSellerChiti(sellerName: string, sellerSerial: number, bids: BidInfo[], stage: 'post-auction' | 'post-weighing' = 'post-auction'): string {
  const _stage = stage;
  void _stage;
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalLot = bids.length;
  const rows = bids.map(b => `
    <tr>
      <td>${formatLotIdentifierForBid(b)}</td>
      <td>${b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}</td>
      <td>[${b.buyerMark}]</td>
      <td>${b.quantity}</td>
      <td>₹${b.rate}</td>
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
      <div class="serial">S.No: ${sellerSerial}</div>
    </div>
    <table>
      <thead><tr><th>Lot Name</th><th>Lot SL No</th><th>Mark</th><th>Qty</th><th>Rate</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Total Lot</span><span>${totalLot}</span></div>
      <div class="row"><span>Total QTY</span><span>${totalQty}</span></div>
    </div>
    <div class="cut-line"></div>
  </body></html>`;
}

// ── 4. Sale Pad Print (A5 Portrait) ─────────────────────
export function generateSalePadPrint(bids: BidInfo[]): string {
  const rows = bids.map(b => `
    <tr>
      <td>${b.vehicleTotalQty ?? b.quantity}</td>
      <td>${b.sellerSerial && b.sellerSerial > 0 ? b.sellerSerial : '—'}</td>
      <td>${escapeStickerHtml(b.sellerName || '—')}</td>
      <td>${b.sellerVehicleQty ?? b.quantity}</td>
      <td>${b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}</td>
      <td>${escapeStickerHtml(formatLotIdentifierForBid(b))}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><style>
    @page { size: A5 portrait; margin: 8mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 8mm; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; }
    th { background: #333; color: #fff; padding: 4px 6px; font-size: 9px; text-transform: uppercase; text-align: center; }
    td { padding: 4px 6px; border-bottom: 1px solid #ddd; font-size: 10px; text-align: center; }
    tr:nth-child(even) { background: #f9f9f9; }
    .sale-pad-title { text-align: center; font-size: 13px; font-weight: 800; margin-top: 2px; margin-bottom: 6px; letter-spacing: 0.3px; }
    @media print { body { margin: 0; padding: 8mm; } }
  </style></head><body>
    <div class="sale-pad-title">SALE PAD</div>
    <table>
      <thead><tr><th>Vehicle Qty</th><th>Seller SL No</th><th>Seller Name</th><th>Seller Qty</th><th>Lot SL No</th><th>Lot Name</th></tr></thead>
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
  const safeBids = bids.length > 0 ? bids : [{
    bidNumber: 0,
    buyerMark: '—',
    buyerName: '—',
    quantity: 0,
    rate: 0,
    lotId: '0',
    lotName: '—',
    sellerName: '—',
    sellerSerial: 0,
    lotNumber: 0,
    vehicleNumber: '—',
    commodityName: '—',
    origin: '—',
    godown: '—',
  }];

  const vehicleQty = safeBids.reduce((s, b) => s + b.quantity, 0);
  const godown = safeBids[0]?.godown || '—';

  const rows = safeBids.map((b) => `
    <tr>
      <td>${b.sellerSerial && b.sellerSerial > 0 ? b.sellerSerial : '—'}</td>
      <td>${escapeStickerHtml(b.sellerName || '—')}</td>
      <td>${b.sellerVehicleQty ?? b.quantity}</td>
      <td>${b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}</td>
      <td>${escapeStickerHtml(formatLotIdentifierForBid(b))}</td>
      <td>${escapeStickerHtml(b.buyerMark || '—')}</td>
      <td>${b.quantity}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><style>
    @page { size: A5 portrait; margin: 6mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 6mm; font-size: 10px; color: #111; }
    .sheet { border: 1px solid #8f8f8f; min-height: calc(100vh - 12mm); padding: 8px 10px; box-sizing: border-box; }
    .head { display: flex; justify-content: center; gap: 24px; font-size: 10px; font-weight: 700; margin-bottom: 4px; text-align: center; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; }
    th { text-align: center; font-size: 9px; font-weight: 700; padding: 2px 3px; border-bottom: 1px dashed #777; }
    td { font-size: 9px; font-weight: 700; padding: 2px 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px dotted #ddd; text-align: center; }
    th:nth-child(1), td:nth-child(1) { width: 8%; }
    th:nth-child(2), td:nth-child(2) { width: 19%; }
    th:nth-child(3), td:nth-child(3) { width: 12%; }
    th:nth-child(4), td:nth-child(4) { width: 9%; }
    th:nth-child(5), td:nth-child(5) { width: 24%; }
    th:nth-child(6), td:nth-child(6) { width: 14%; }
    th:nth-child(7), td:nth-child(7) { width: 10%; }
    @media print { body { margin: 0; padding: 6mm; } }
  </style></head><body>
    <div class="sheet">
      <div class="head">
        <span>Vehicle Qty ${vehicleQty}</span>
        <span>Godown: ${escapeStickerHtml(godown)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Slr No</th><th>Seller Name</th><th>Seller QTY</th><th>Lot No</th><th>Lot Name</th><th>Buyer Mark</th><th>Quantity</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
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
