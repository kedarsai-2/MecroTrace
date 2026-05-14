import { cn } from '@/lib/utils';
import type { SellerArrivalTally, SettlementHeaderParticle } from './settlementTypes';

export const SETTLEMENT_SAVED_PATTI_LAYOUT_STORAGE_KEY = 'merco.settlement.savedPatti.layout';


/**
 * Settlement button language:
 * - Premium gradient (same family as table headers)
 * - Hover highlight border + stronger glow
 */
export const settlementBtnGradient =
  '!bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] !text-white border border-white/25 shadow-[0_10px_24px_-12px_rgba(91,140,255,0.85)] hover:!brightness-110 hover:border-white/45 hover:shadow-[0_14px_30px_-12px_rgba(123,97,255,0.9)] active:scale-[0.99] transition-all';


export const arrOutlineMd = cn('rounded-xl h-9 text-sm font-semibold', settlementBtnGradient);


export const arrOutlineTall = cn('rounded-xl h-12 text-sm font-semibold', settlementBtnGradient);


export const arrOutlineSm = cn('rounded-xl h-8 text-xs font-semibold', settlementBtnGradient);


export const arrSolid =
  cn('rounded-xl font-bold', settlementBtnGradient);


export const arrSolidMd = cn(arrSolid, 'h-9 px-3 text-sm');


export const arrSolidTall = cn(arrSolid, 'h-12 px-6 text-sm');


export const arrSolidSm = cn(arrSolid, 'h-8 px-2.5 text-xs');


/**
 * Settlement toggle row: same visual language as New Patti / Saved Patti (rounded-xl, gradient active).
 * Used for main tabs (Arrival summary / Create settlements) and arrival-summary sub-tabs.
 */
export const settlementToggleTabBtn = (active: boolean) =>
  cn(
    'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-10',
    active
      ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
      : 'glass-card text-muted-foreground hover:text-foreground',
  );


/** Same as settlementToggleTabBtn but inactive state readable on the teal mobile hero. */
export const settlementToggleTabBtnOnHero = (active: boolean) =>
  cn(
    'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-10',
    active
      ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
      : 'bg-white/15 text-white/90 hover:bg-white/25 border border-white/10 backdrop-blur-sm',
  );


/** Lightweight inline hint for keyboard shortcuts (same pattern as Billing). */
export const tabHint = (key: string) => ` (${key})`;


/** Commodity-settings style toggle shell for settlement expense card. */
export const settlementExpenseToggleBtnClass = (
  checked: boolean,
  tone: 'emerald' | 'violet',
  disabled?: boolean
) =>
  cn(
    'w-[54px] h-[30px] rounded-full transition-all relative shadow-inner',
    checked
      ? tone === 'emerald'
        ? 'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] shadow-[0_8px_20px_-12px_rgba(91,140,255,0.9)]'
        : 'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] shadow-[0_8px_20px_-12px_rgba(123,97,255,0.9)]'
      : 'bg-slate-300 dark:bg-slate-600',
    disabled && 'opacity-60 cursor-not-allowed'
  );


/** Sales report: outer card border per seller (same accent idea as Vehicle details tiles). */
export const SALES_REPORT_SELLER_CARD_STYLES = [
  'border-blue-500/20 bg-muted/30',
  'border-cyan-500/20 bg-muted/30',
  'border-amber-500/20 bg-muted/30',
  'border-emerald-500/20 bg-muted/30',
  'border-violet-500/20 bg-muted/30',
  'border-fuchsia-500/20 bg-muted/30',
] as const;


/** Same gradient language as `DesktopSidebar` (linear + radial shine). */
export const DESKTOP_SIDEBAR_LIKE_GRADIENT_BG =
  'bg-[linear-gradient(180deg,#4B7CF3_0%,#5B8CFF_30%,#7B61FF_100%)]';


export const DESKTOP_SIDEBAR_LIKE_SHINE =
  'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15)_0%,transparent_60%)]';


/** Horizontal variant so the full sweep reads across column headers. */
export const SETTLEMENT_LOTS_TABLE_HEADER_GRADIENT =
  'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)]';


export const EMPTY_SELLER_ARRIVAL_TALLY: SellerArrivalTally = { lots: 0, bids: 0, weighed: 0 };


export function createSettlementHeaderParticles(): SettlementHeaderParticle[] {
  return Array.from({ length: 6 }, () => ({
    left: `${10 + Math.random() * 80}%`,
    top: `${10 + Math.random() * 80}%`,
    duration: 2 + Math.random() * 2,
    delay: Math.random() * 2,
  }));
}


export const SETTLEMENT_EDIT_HEADER_PARTICLES = createSettlementHeaderParticles();


export const SETTLEMENT_LIST_HEADER_PARTICLES = createSettlementHeaderParticles();


// ── Validation constants (align with ArrivalService multi-seller: 2–12 chars) ──
export const DEDUCTION_MAX = 10_000_000;


export const VEHICLE_NUMBER_MIN = 2;


export const VEHICLE_NUMBER_MAX = 12;


/** Same visual language as Billing commodity read-only cells (computed fields). */
export const settlementReadOnlyCellClass =
  'h-9 lg:h-8 min-h-[2.25rem] px-2 lg:px-1.5 border border-dashed border-border/70 rounded-md bg-muted/50 text-muted-foreground inline-flex items-center justify-center w-full text-xs lg:text-[11px] cursor-not-allowed shadow-inner select-text tabular-nums';


/** Uniform editable expense amount fields (per seller). */
export const settlementExpenseInputClass =
  'h-9 w-full min-w-[5.5rem] max-w-[6.75rem] rounded-md border border-border bg-background px-2 text-right text-xs tabular-nums shadow-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';


/** Freight & unloading on Expenses card: auto-derived — dashed border, muted fill, lock (matches Billing computed-cell language). */
export const settlementExpenseDerivedInputAffordanceClass =
  'border-dashed border-border/75 bg-muted/45 shadow-inner cursor-not-allowed select-text';


export const PATTI_EXTENSION_JSON_VERSION = 1 as const;


export const SETTLEMENT_VIRTUAL_MIN_ROWS = 48;
