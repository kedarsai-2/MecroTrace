/** Mobile / tablet Sales Pad layout — shared types + parse (server + localStorage). */

export const AUCTION_TOUCH_LAYOUT_STORAGE_KEY = 'merco:auctionTouchLayout:v1';

export type AuctionTouchHeroLayout = 'compact' | 'balanced' | 'spacious' | 'default_tab';

export interface AuctionTouchLayoutConfig {
  textScale: number;
  scribbleMinRemPhone: number;
  scribbleMinRemTablet: number;
  scribbleCanvasHeight: number;
  scribbleColRatio: number;
  numpadKeyHeight: number;
  numpadKeyFontPx: number;
  numpadSecondaryRowHeight: number;
  /** Mobile dock preset margin chips — min touch target (px). */
  presetChipMinWidthPx: number;
  presetChipMinHeightPx: number;
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
  presetChipMinWidthPx: 92,
  presetChipMinHeightPx: 48,
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
    if (typeof o.presetChipMinWidthPx === 'number') d.presetChipMinWidthPx = clampNum(o.presetChipMinWidthPx, 64, 140);
    if (typeof o.presetChipMinHeightPx === 'number') d.presetChipMinHeightPx = clampNum(o.presetChipMinHeightPx, 40, 76);
    if (typeof o.gridMinWidthPx === 'number') d.gridMinWidthPx = clampNum(o.gridMinWidthPx, 320, 560);
    if (typeof o.gridMaxVhExpanded === 'number') d.gridMaxVhExpanded = clampNum(o.gridMaxVhExpanded, 28, 56);
    if (typeof o.gridMaxVhCollapsed === 'number') d.gridMaxVhCollapsed = clampNum(o.gridMaxVhCollapsed, 48, 82);
    if (typeof o.gridMaxVhCollapsedMd === 'number') d.gridMaxVhCollapsedMd = clampNum(o.gridMaxVhCollapsedMd, 48, 82);
    if (
      o.heroLayout === 'compact' ||
      o.heroLayout === 'balanced' ||
      o.heroLayout === 'spacious' ||
      o.heroLayout === 'default_tab'
    ) {
      d.heroLayout = o.heroLayout;
    }
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

/** One-shot preset: every slider at minimum — fits small phones best. */
export const MOBILE_TOUCH_LAYOUT_PRESET: AuctionTouchLayoutConfig = {
  textScale: 0.82,
  scribbleMinRemPhone: 14,
  scribbleMinRemTablet: 20,
  scribbleCanvasHeight: 220,
  scribbleColRatio: 0.48,
  numpadKeyHeight: 40,
  numpadKeyFontPx: 14,
  numpadSecondaryRowHeight: 38,
  presetChipMinWidthPx: 64,
  presetChipMinHeightPx: 40,
  gridMinWidthPx: 320,
  gridMaxVhExpanded: 28,
  gridMaxVhCollapsed: 48,
  gridMaxVhCollapsedMd: 48,
  heroLayout: 'compact',
};

/** Hero density buttons apply full layout — keeps Custom sliders aligned with compact / balanced / spacious. */
export const COMPACT_TOUCH_LAYOUT_PRESET: AuctionTouchLayoutConfig = {
  textScale: 0.9,
  scribbleMinRemPhone: 16,
  scribbleMinRemTablet: 26,
  scribbleCanvasHeight: 260,
  scribbleColRatio: 0.52,
  numpadKeyHeight: 46,
  numpadKeyFontPx: 15,
  numpadSecondaryRowHeight: 44,
  presetChipMinWidthPx: 72,
  presetChipMinHeightPx: 44,
  gridMinWidthPx: 360,
  gridMaxVhExpanded: 34,
  gridMaxVhCollapsed: 58,
  gridMaxVhCollapsedMd: 56,
  heroLayout: 'compact',
};

export const BALANCED_TOUCH_LAYOUT_PRESET: AuctionTouchLayoutConfig = {
  ...DEFAULT_AUCTION_TOUCH_LAYOUT,
  heroLayout: 'balanced',
};

export const SPACIOUS_TOUCH_LAYOUT_PRESET: AuctionTouchLayoutConfig = {
  textScale: 1.1,
  scribbleMinRemPhone: 26,
  scribbleMinRemTablet: 38,
  scribbleCanvasHeight: 340,
  scribbleColRatio: 0.64,
  numpadKeyHeight: 64,
  numpadKeyFontPx: 20,
  numpadSecondaryRowHeight: 60,
  presetChipMinWidthPx: 108,
  presetChipMinHeightPx: 56,
  gridMinWidthPx: 480,
  gridMaxVhExpanded: 50,
  gridMaxVhCollapsed: 72,
  gridMaxVhCollapsedMd: 70,
  heroLayout: 'spacious',
};

/** "Default tab" hero density — user-specified mix (chips + collapsed grid vh from app defaults). */
export const DEFAULT_TAB_TOUCH_LAYOUT_PRESET: AuctionTouchLayoutConfig = {
  textScale: 1.02,
  scribbleMinRemPhone: 28,
  scribbleMinRemTablet: 32,
  scribbleCanvasHeight: 300,
  scribbleColRatio: 0.6,
  numpadKeyHeight: 66,
  numpadKeyFontPx: 20,
  numpadSecondaryRowHeight: 64,
  presetChipMinWidthPx: 92,
  presetChipMinHeightPx: 48,
  gridMinWidthPx: 440,
  /** Request had "441"; must be vh in 28–56 range — stored as 41. */
  gridMaxVhExpanded: 41,
  gridMaxVhCollapsed: 64,
  gridMaxVhCollapsedMd: 60,
  heroLayout: 'default_tab',
};

export const HERO_DENSITY_TOUCH_PRESETS: Record<
  AuctionTouchHeroLayout,
  AuctionTouchLayoutConfig
> = {
  compact: COMPACT_TOUCH_LAYOUT_PRESET,
  balanced: BALANCED_TOUCH_LAYOUT_PRESET,
  spacious: SPACIOUS_TOUCH_LAYOUT_PRESET,
  default_tab: DEFAULT_TAB_TOUCH_LAYOUT_PRESET,
};
