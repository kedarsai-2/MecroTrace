/** Mobile / tablet Sales Pad layout — shared types + parse (server + localStorage). */

export const AUCTION_TOUCH_LAYOUT_STORAGE_KEY = 'merco:auctionTouchLayout:v1';

export type AuctionTouchHeroLayout = 'compact' | 'balanced' | 'spacious';

export interface AuctionTouchLayoutConfig {
  textScale: number;
  scribbleMinRemPhone: number;
  scribbleMinRemTablet: number;
  scribbleCanvasHeight: number;
  scribbleColRatio: number;
  numpadKeyHeight: number;
  numpadKeyFontPx: number;
  numpadSecondaryRowHeight: number;
  gridMinWidthPx: number;
  gridMaxVhExpanded: number;
  gridMaxVhCollapsed: number;
  gridMaxVhCollapsedMd: number;
  heroLayout: AuctionTouchHeroLayout;
}

export const DEFAULT_AUCTION_TOUCH_LAYOUT: AuctionTouchLayoutConfig = {
  textScale: 1,
  scribbleMinRemPhone: 21,
  scribbleMinRemTablet: 32,
  scribbleCanvasHeight: 300,
  scribbleColRatio: 1.4 / 2.4,
  numpadKeyHeight: 54,
  numpadKeyFontPx: 18,
  numpadSecondaryRowHeight: 50,
  gridMinWidthPx: 400,
  gridMaxVhExpanded: 42,
  gridMaxVhCollapsed: 64,
  gridMaxVhCollapsedMd: 60,
  heroLayout: 'balanced',
};

function clampNum(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function parseAuctionTouchLayout(raw: string | null): AuctionTouchLayoutConfig {
  const d: AuctionTouchLayoutConfig = { ...DEFAULT_AUCTION_TOUCH_LAYOUT };
  if (!raw) return d;
  try {
    const o = JSON.parse(raw) as Partial<AuctionTouchLayoutConfig>;
    if (typeof o.textScale === 'number') d.textScale = clampNum(o.textScale, 0.82, 1.28);
    if (typeof o.scribbleMinRemPhone === 'number') d.scribbleMinRemPhone = clampNum(o.scribbleMinRemPhone, 14, 40);
    if (typeof o.scribbleMinRemTablet === 'number') d.scribbleMinRemTablet = clampNum(o.scribbleMinRemTablet, 20, 48);
    if (typeof o.scribbleCanvasHeight === 'number') d.scribbleCanvasHeight = clampNum(o.scribbleCanvasHeight, 200, 400);
    if (typeof o.scribbleColRatio === 'number') d.scribbleColRatio = clampNum(o.scribbleColRatio, 0.48, 0.74);
    if (typeof o.numpadKeyHeight === 'number') d.numpadKeyHeight = clampNum(o.numpadKeyHeight, 40, 92);
    if (typeof o.numpadKeyFontPx === 'number') d.numpadKeyFontPx = clampNum(o.numpadKeyFontPx, 14, 26);
    if (typeof o.numpadSecondaryRowHeight === 'number') d.numpadSecondaryRowHeight = clampNum(o.numpadSecondaryRowHeight, 38, 88);
    if (typeof o.gridMinWidthPx === 'number') d.gridMinWidthPx = clampNum(o.gridMinWidthPx, 320, 560);
    if (typeof o.gridMaxVhExpanded === 'number') d.gridMaxVhExpanded = clampNum(o.gridMaxVhExpanded, 28, 56);
    if (typeof o.gridMaxVhCollapsed === 'number') d.gridMaxVhCollapsed = clampNum(o.gridMaxVhCollapsed, 48, 82);
    if (typeof o.gridMaxVhCollapsedMd === 'number') d.gridMaxVhCollapsedMd = clampNum(o.gridMaxVhCollapsedMd, 48, 82);
    if (o.heroLayout === 'compact' || o.heroLayout === 'balanced' || o.heroLayout === 'spacious') d.heroLayout = o.heroLayout;
  } catch {
    /* ignore corrupt */
  }
  return d;
}

export function persistLocalAuctionTouchLayout(cfg: AuctionTouchLayoutConfig) {
  try {
    localStorage.setItem(AUCTION_TOUCH_LAYOUT_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* quota / private mode */
  }
}

export function readLocalAuctionTouchLayout(): AuctionTouchLayoutConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_AUCTION_TOUCH_LAYOUT };
  try {
    return parseAuctionTouchLayout(localStorage.getItem(AUCTION_TOUCH_LAYOUT_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_AUCTION_TOUCH_LAYOUT };
  }
}
