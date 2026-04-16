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
  stage: "post-auction" | "post-weighing" = "post-auction",
  traderDisplayName?: string
): string {
  const _stage = stage;
  void _stage;
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalBid = bids.length;

  // Column widths sum to 48 (Mark column removed; widths redistributed)
  const wLot = 16;
  const wLotSl = 8;
  const wGdwn = 10;
  const wRate = 9;
  const wQty = 5;

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

  const firmLine = clampThermalText(String(traderDisplayName ?? "").trim() || "Trader", THERMAL_CHARS_PER_LINE);

  const header = [
    "[C]" + firmLine,
    "[C]" + clampThermalText(buyerName, THERMAL_CHARS_PER_LINE),
    "[C]" + escposBold(`[${String(buyerMark ?? "").trim()}]`),
    "[L]--------------------------------",
    "",
    "[L]" + pad("Lot Name", wLot) + pad("LotSL", wLotSl) + pad("Gdwn", wGdwn) + pad("Rate", wRate) + pad("Qty", wQty),
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
        pad(String(b.quantity), wQty);

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
  stage: "post-auction" | "post-weighing" = "post-auction",
  traderDisplayName?: string
): string {
  const _stage = stage;
  void _stage;
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalLot = bids.length;

  // Column widths sum to 48 (Mark column removed; widths redistributed)
  const wLot = 20;
  const wLotSl = 7;
  const wQty = 7;
  const wRate = 14;

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

  const firmLine = clampThermalText(String(traderDisplayName ?? "").trim() || "Trader", THERMAL_CHARS_PER_LINE);

  const header = [
    "[C]" + firmLine,
    "",
    "[C]" + clampThermalText(sellerName, THERMAL_CHARS_PER_LINE),
    "[C]" + clampThermalText(`S.No: ${sellerSerial}`, THERMAL_CHARS_PER_LINE),
    "[L]--------------------------------",
    "",
    "[L]" + pad("Lot Name", wLot) + pad("LotSL", wLotSl) + pad("Qty", wQty) + pad("Rate", wRate),
  ].join("\n");

  const rows = bids
    .map((b) => {
      const rateTxt = escapeThermalPrice(`₹${b.rate}`);

      const line =
        pad(formatLotIdentifierForBid(b), wLot) +
        pad(String(b.lotNumber && b.lotNumber > 0 ? b.lotNumber : "—"), wLotSl) +
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
export function generateBuyerChiti(
  buyerName: string,
  buyerMark: string,
  bids: BidInfo[],
  stage: 'post-auction' | 'post-weighing' = 'post-auction',
  traderDisplayName?: string
): string {
  const _stage = stage;
  void _stage;
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalBid = bids.length;
  const headerTitle = escapeStickerHtml((traderDisplayName ?? '').trim() || 'Trader');
  const rows = bids.map(b => `
    <tr>
      <td>${formatLotIdentifierForBid(b)}</td>
      <td>${b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}</td>
      <td>${b.godown || '—'}</td>
      <td>₹${b.rate}</td>
      <td>${b.quantity}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><style>
    @page { size: 80mm auto; margin: 2mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 4px; width: 76mm; font-size: 13px; }
    .header { text-align: center; border-bottom: 1px dashed #333; padding-bottom: 4px; margin-bottom: 4px; }
    .header h3 { margin: 2px 0; font-size: 16px; }
    .header small { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
    .buyer-info { background: #f5f5f5; border-radius: 4px; padding: 6px; margin-bottom: 6px; text-align: center; }
    .buyer-info .mark { font-size: 24px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #eee; padding: 3px 2px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 3px 2px; border-bottom: 1px dotted #ddd; }
    .totals { border-top: 2px solid #333; margin-top: 6px; padding-top: 6px; font-weight: 800; font-size: 13px; }
    .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .stage { display: none; }
    .powered { text-align: center; font-size: 10px; color: #666; margin-top: 4px; }
    .cut-line { border-top: 1px dashed #999; margin-top: 6px; padding-top: 2px; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <div class="header"><h3>${headerTitle}</h3></div>
    <div class="buyer-info">
      <div style="font-size:13px;color:#666">${escapeStickerHtml(buyerName)}</div>
      <div class="mark">[${escapeStickerHtml(buyerMark)}]</div>
    </div>
    <table>
      <thead><tr><th>Lot Name</th><th>Lot SL No</th><th>Gdwn</th><th>Rate</th><th>Qty</th></tr></thead>
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
export function generateSellerChiti(
  sellerName: string,
  sellerSerial: number,
  bids: BidInfo[],
  stage: 'post-auction' | 'post-weighing' = 'post-auction',
  traderDisplayName?: string
): string {
  const _stage = stage;
  void _stage;
  const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
  const totalLot = bids.length;
  const headerTitle = escapeStickerHtml((traderDisplayName ?? '').trim() || 'Trader');
  const rows = bids.map(b => `
    <tr>
      <td>${formatLotIdentifierForBid(b)}</td>
      <td>${b.lotNumber && b.lotNumber > 0 ? b.lotNumber : '—'}</td>
      <td>${b.quantity}</td>
      <td>₹${b.rate}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><style>
    @page { size: 80mm auto; margin: 2mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 4px; width: 76mm; font-size: 13px; }
    .header { text-align: center; border-bottom: 1px dashed #333; padding-bottom: 4px; margin-bottom: 4px; }
    .header h3 { margin: 2px 0; font-size: 16px; }
    .header small { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
    .seller-info { background: #f5f5f5; border-radius: 4px; padding: 6px; margin-bottom: 6px; text-align: center; }
    .seller-info .name { font-size: 15px; font-weight: 800; }
    .seller-info .mark { font-size: 20px; font-weight: 900; letter-spacing: 2px; margin-top: 2px; }
    .seller-info .serial { font-size: 12px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #eee; padding: 3px 2px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 3px 2px; border-bottom: 1px dotted #ddd; }
    .totals { border-top: 2px solid #333; margin-top: 6px; padding-top: 6px; font-weight: 800; font-size: 13px; }
    .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .stage { display: none; }
    .powered { text-align: center; font-size: 10px; color: #666; margin-top: 4px; }
    .cut-line { border-top: 1px dashed #999; margin-top: 6px; padding-top: 2px; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <div class="header"><h3>${headerTitle}</h3></div>
    <div class="seller-info">
      <div class="name">${escapeStickerHtml(sellerName)}</div>
      <div class="serial">S.No: ${escapeStickerHtml(String(sellerSerial))}</div>
    </div>
    <table>
      <thead><tr><th>Lot Name</th><th>Lot SL No</th><th>Qty</th><th>Rate</th></tr></thead>
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
/** A5 portrait content height inside @page margin (11mm × 2). */
const SALE_PAD_CONTENT_HEIGHT_MM = 210 - 11 * 2;
/** Reserved height: trader title + Vehicle Qty + meta + gap after Seller Qty row + dashed rule (mm). */
const SALE_PAD_HEADER_RESERVE_MM = 28;
/** Minimum lot-row slots (grid shares remaining height equally). */
const SALE_PAD_MIN_LOT_ROWS = 3;
/** One seller section per printed A5 page. */
const SALE_PAD_SECTIONS_PER_PAGE = 1;
const SALE_PAD_SHEET_COUNT = 2;

function getSalePadLotRowCount(): number {
  const approxRowMm = 20;
  const available = Math.max(0, SALE_PAD_CONTENT_HEIGHT_MM - SALE_PAD_HEADER_RESERVE_MM);
  const n = Math.floor(available / approxRowMm);
  return Math.max(SALE_PAD_MIN_LOT_ROWS, n);
}

function buildEmptySalePadSellerSection(lotRowCount: number): string {
  const lotRows = Array.from({ length: lotRowCount }, () => `
    <div class="sp-lot-row">
      <span class="sp-lot-no">Lot No</span>
      <span class="sp-lot-name">Lot Name</span>
    </div>`).join('');

  return `
  <section class="sp-seller-block" style="--sp-lot-rows:${lotRowCount}" aria-label="Seller lot section">
    <div class="sp-header-group">
      <div class="sp-line-vehicle">Vehicle Qty</div>
      <div class="sp-line-meta">
        <span class="sp-sl">Slr No</span>
        <span class="sp-sn">Seller Name</span>
        <span class="sp-sq">Seller Qty</span>
      </div>
    </div>
    <div class="sp-lot-rows">${lotRows}</div>
  </section>`;
}

/**
 * Blank Sale Pad (A5 portrait): trader title, one seller section per page, empty lot rows.
 * `bids` ignored — template is always empty (Print Hub + preview).
 */
export function generateSalePadPrint(_bids?: BidInfo[], traderDisplayName?: string): string {
  void _bids;
  const traderTitle = escapeStickerHtml((traderDisplayName ?? '').trim() || 'Trader');
  const lotRowCount = getSalePadLotRowCount();
  const sectionHtml = buildEmptySalePadSellerSection(lotRowCount);
  const sheets: string[] = [];
  for (let p = 0; p < SALE_PAD_SHEET_COUNT; p++) {
    const inner = Array.from({ length: SALE_PAD_SECTIONS_PER_PAGE }, () => sectionHtml).join('');
    sheets.push(
      `<div class="sp-sheet"><div class="sp-page-inner"><div class="sp-trader-header">${traderTitle}</div>${inner}</div></div>`
    );
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Sale Pad</title><style>
    @page { size: A5 portrait; margin: 11mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, Inter, "Segoe UI", sans-serif;
      font-size: 11px;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sp-sheet {
      page-break-after: always;
      break-after: page;
      width: 100%;
      height: calc(210mm - 22mm);
      min-height: calc(210mm - 22mm);
      max-height: calc(210mm - 22mm);
      display: flex;
      flex-direction: column;
    }
    .sp-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .sp-page-inner {
      flex: 1;
      min-height: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
    }
    .sp-trader-header {
      flex: 0 0 auto;
      text-align: center;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      padding: 0 0 4mm 0;
      margin-bottom: 3mm;
      border-bottom: 1px solid #ccc;
    }
    .sp-seller-block {
      break-inside: avoid;
      page-break-inside: avoid;
      width: 100%;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .sp-header-group {
      flex: 0 0 auto;
    }
    .sp-line-vehicle {
      font-size: 11px;
      line-height: 1.2;
      padding: 0 0 1mm 0;
      text-align: left;
    }
    .sp-line-meta {
      display: grid;
      grid-template-columns: 1fr 2fr 1fr;
      column-gap: 2mm;
      align-items: baseline;
      font-size: 11px;
      line-height: 1.25;
      padding: 2mm 0 9mm 0;
      margin-bottom: 0;
      border-bottom: 1px dashed #333;
    }
    .sp-sl { text-align: left; }
    .sp-sn { text-align: center; }
    .sp-sq { text-align: right; }
    .sp-lot-rows {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-rows: repeat(var(--sp-lot-rows, 8), minmax(0, 1fr));
      width: 100%;
    }
    .sp-lot-row {
      display: grid;
      grid-template-columns: 1fr 2fr 1fr;
      column-gap: 2mm;
      align-items: start;
      padding-top: 1mm;
      font-size: 11px;
      line-height: 1.2;
      min-height: 0;
      border-bottom: 1px dashed #bbb;
    }
    .sp-lot-no { grid-column: 1; text-align: left; }
    .sp-lot-name { grid-column: 2 / span 2; text-align: left; }
    @media print {
      body { margin: 0; }
    }
    @media screen {
      body { background: #e8e8e8; padding: 8px; }
      .sp-sheet {
        width: 148mm;
        margin: 0 auto 12px;
        background: #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,0.12);
        padding: 0;
      }
    }
  </style></head><body>
    <!-- A5 content ${SALE_PAD_CONTENT_HEIGHT_MM}mm; ${lotRowCount} lot rows share remaining height -->
    ${sheets.join('')}
  </body></html>`;
}

// ── 5. Tender Slip for Buyers (A4 Landscape, Triplicate) ─
const TENDER_SLIP_BLANK_ROW_COUNT = 16;

/** Blank triplicate form: header + empty LOT/BAGS/RATE grid (user fills by hand). */
export function generateTenderSlip(traderDisplayName?: string): string {
  const firmName = escapeStickerHtml((traderDisplayName ?? '').trim() || 'Trader');
  const blankRows = Array.from({ length: TENDER_SLIP_BLANK_ROW_COUNT }, () => '<tr class="ts-blank-row"><td></td><td></td><td></td></tr>').join('');
  const singleSlip = `<div class="slip">
    <div class="firm-header">
      <div class="firm-name">${firmName}</div>
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
    <table class="ts-table"><thead><tr><th>LOT</th><th>BAGS</th><th>RATE</th></tr></thead><tbody>${blankRows}</tbody></table>
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
    table.ts-table { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; empty-cells: show; }
    th { background: #eee; padding: 3px 6px; font-size: 10px; text-transform: uppercase; text-align: left; border: 1px solid #ccc; }
    td { padding: 3px 6px; font-size: 11px; border: 1px solid #ddd; vertical-align: middle; }
    tr.ts-blank-row td { height: 1.55rem; }
    @media print { body { margin: 0; padding: 6mm; } }
    @media screen {
      body { background: #e8e8e8; padding: 8px; }
      .triplicate { max-width: 297mm; margin: 0 auto; }
    }
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
