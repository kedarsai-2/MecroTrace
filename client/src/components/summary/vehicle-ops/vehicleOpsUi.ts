import { cn } from '@/lib/utils';

/** Primary CTA — Vehicle Operations (gradient, border, shadows per product spec). */
export const vehicleOpsPrimaryBtnClass = cn(
  'border border-white/25 text-white',
  'bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)]',
  'shadow-[0_4px_14px_rgba(91,140,255,0.85)]',
  'hover:shadow-[0_6px_18px_rgba(123,97,255,0.9)]',
  'hover:bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)]',
  'transition-[box-shadow,filter]',
);

/** Secondary outline — module-adjacent borders without full gradient fill. */
export const vehicleOpsSecondaryOutlineBtnClass = cn(
  'border border-[#5B8CFF]/45 bg-background/90 text-foreground',
  'hover:border-[#7B61FF]/55 hover:bg-muted/30',
);

/** Mobile circular back into vehicle ops hero. */
export const vehicleOpsBackCircleClass = cn(
  vehicleOpsPrimaryBtnClass,
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 touch-manipulation',
);

/** Bid row / seller strip: rose = not fully auctioned yet; auctioned = brand green #92D050. */
export const vehicleOpsAuctionStripPendingClass = 'bg-rose-500';
export const vehicleOpsAuctionStripAuctionedClass = 'bg-[#92D050]';

export function vehicleOpsAuctionStripClass(entryOrLotAuctionComplete: boolean): string {
  return entryOrLotAuctionComplete ? vehicleOpsAuctionStripAuctionedClass : vehicleOpsAuctionStripPendingClass;
}

/** Lot block header background — 50% opacity brand green vs rose. */
export function vehicleOpsLotHeaderBgClass(lotFullyAuctioned: boolean): string {
  return lotFullyAuctioned
    ? 'bg-[#92D050]/50 dark:bg-[#92D050]/45'
    : 'bg-rose-500/50 dark:bg-rose-600/45';
}
