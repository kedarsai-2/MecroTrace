import { cn } from '@/lib/utils';

/**
 * Reports module accent — tabs (active) + primary actions (Generate).
 * Spec: linear-gradient(90deg, #4B7CF3, #5B8CFF 45%, #7B61FF); text #FFF; border rgba(255,255,255,0.25);
 * shadow default/hover rgba(91,140,255,0.85) / rgba(123,97,255,0.9).
 */
const accentBase = cn(
  'text-[#FFFFFF] font-semibold border border-[rgba(255,255,255,0.25)]',
  'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)]',
  'shadow-[0_4px_14px_rgba(91,140,255,0.85)]',
  'hover:shadow-[0_6px_18px_rgba(123,97,255,0.9)]',
  'transition-[box-shadow,opacity] duration-200',
);

export const reportsAccentTabActiveClassName = cn(
  accentBase,
  'rounded-md px-2.5 py-2 text-sm text-center no-underline',
);

export const reportsAccentTabInactiveClassName = cn(
  'rounded-md px-2.5 py-2 text-sm font-semibold text-center transition-colors no-underline',
  'text-muted-foreground hover:text-foreground hover:bg-muted/45 border border-transparent',
);

export function reportsAccentPrimaryButtonClassName(disabled: boolean) {
  return cn(
    accentBase,
    'rounded-md px-3 min-h-10 h-10 lg:min-h-9 lg:h-9 text-sm inline-flex items-center justify-center whitespace-nowrap touch-manipulation',
    'w-full shrink-0 lg:w-auto lg:min-w-[140px]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[rgba(255,255,255,0.45)] focus-visible:ring-offset-transparent',
    disabled && 'opacity-50 pointer-events-none shadow-none hover:shadow-none',
  );
}

/** Same gradient as Generate; square icon-only (e.g. refresh). */
export function reportsAccentIconButtonClassName(disabled: boolean) {
  return cn(
    accentBase,
    'rounded-md size-10 lg:size-9 shrink-0 inline-flex items-center justify-center touch-manipulation',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[rgba(255,255,255,0.45)] focus-visible:ring-offset-transparent',
    disabled && 'opacity-50 pointer-events-none shadow-none hover:shadow-none',
  );
}

/** Same gradient as primary; **equal width/height** for paired actions (e.g. Clear + Apply). */
export function reportsAccentPairedActionButtonClassName(disabled: boolean) {
  return cn(
    accentBase,
    'rounded-md px-2 sm:px-3 h-10 min-h-[2.5rem] text-sm font-semibold inline-flex items-center justify-center touch-manipulation',
    'flex-1 basis-0 min-w-0 w-0',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[rgba(255,255,255,0.45)] focus-visible:ring-offset-transparent',
    disabled && 'opacity-50 pointer-events-none shadow-none hover:shadow-none',
  );
}

/** Billing / Settlement primary gradient (export + print actions on Daily Sales Summary). */
export const dailySalesExportButtonGradientClass =
  '!bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] !text-white border border-white/25 shadow-[0_10px_24px_-12px_rgba(91,140,255,0.85)] hover:!brightness-110 hover:border-white/45 hover:shadow-[0_14px_30px_-12px_rgba(123,97,255,0.9)] active:scale-[0.99] transition-all';

export function dailySalesExportButtonClassName(disabled: boolean) {
  return cn(
    dailySalesExportButtonGradientClass,
    'rounded-xl h-8 sm:h-9 text-xs sm:text-sm font-semibold px-2.5 sm:px-3 gap-1 inline-flex items-center justify-center',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[rgba(255,255,255,0.45)]',
    disabled && 'opacity-50 pointer-events-none shadow-none hover:shadow-none',
  );
}

/** Table header row — same linear gradient as Billing / Settlement data tables. */
export const dailySalesTableHeaderClassName =
  'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] border-b border-white/25 text-[10px] sm:text-[11px] font-extrabold text-white uppercase tracking-wider text-center whitespace-nowrap';
