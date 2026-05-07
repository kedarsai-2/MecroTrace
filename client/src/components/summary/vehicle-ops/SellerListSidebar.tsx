import { useRef } from 'react';
import { cn } from '@/lib/utils';
import type { ArrivalSellerFullDetail } from '@/services/api/arrivals';
import type { LotSummaryDTO } from '@/services/api/auction';
import {
  isLotFullyAuctioned,
  lotSummaryBelongsToSeller,
  sellerBagSoldPending,
  sellerKeyFromArrivalSeller,
} from './vehicleOpsUtils';
import { vehicleOpsAuctionStripClass } from './vehicleOpsUi';

export type SellerListSidebarProps = {
  sellers: ArrivalSellerFullDetail[];
  lotSummaries: LotSummaryDTO[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
};

export function SellerListSidebar({
  sellers,
  lotSummaries,
  selectedKey,
  onSelectKey,
}: SellerListSidebarProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div
      role="listbox"
      aria-label="Sellers on this vehicle"
      className={cn(
        'flex min-h-0 gap-2 pb-1 [-webkit-overflow-scrolling:touch]',
        /* Horizontal strip + touch pan for phone; vertical sidebar from md (768px) when workspace grid is split. */
        'touch-[pan-x_pan-y] overflow-x-auto no-scrollbar',
        'md:flex-col md:touch-auto md:gap-1.5 md:overflow-y-visible md:overflow-x-visible md:pb-0 md:pr-1 lg:gap-2',
      )}
    >
      {sellers.map((seller, i) => {
        const key = sellerKeyFromArrivalSeller(seller);
        const lots = lotSummaries.filter((l) => lotSummaryBelongsToSeller(l, seller));
        const { sold, pending } = sellerBagSoldPending(lots);
        const name = (seller.sellerName ?? '').trim() || '—';
        const mark = (seller.sellerMark ?? '').trim() || '—';
        const selected = selectedKey === key;
        const sellerAllLotsAuctioned = lots.length > 0 && lots.every(isLotFullyAuctioned);
        return (
          <button
            key={key}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelectKey(key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                const next = sellers[i + 1];
                if (next) {
                  const nk = sellerKeyFromArrivalSeller(next);
                  onSelectKey(nk);
                  itemRefs.current[i + 1]?.focus();
                }
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const prev = sellers[i - 1];
                if (prev) {
                  const pk = sellerKeyFromArrivalSeller(prev);
                  onSelectKey(pk);
                  itemRefs.current[i - 1]?.focus();
                }
              }
            }}
            className={cn(
              'flex min-w-[220px] shrink-0 touch-manipulation rounded-2xl border text-left transition-colors md:min-w-0 md:max-w-full md:w-full md:rounded-xl lg:rounded-2xl',
              selected
                ? 'border-[#6075FF]/50 bg-violet-500/10 shadow-sm dark:bg-violet-500/15'
                : 'border-border/40 bg-white/80 hover:bg-muted/30 dark:bg-card/80',
            )}
          >
            <span
              className={cn(
                'w-1.5 shrink-0 self-stretch rounded-l-2xl md:w-1 md:rounded-l-xl lg:w-1.5 lg:rounded-l-2xl',
                vehicleOpsAuctionStripClass(sellerAllLotsAuctioned),
              )}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-3 md:gap-0.5 md:px-2 md:py-2 lg:gap-1 lg:px-3 lg:py-3">
              <span className="truncate text-sm font-semibold text-foreground md:text-xs lg:text-sm">
                {name} / {mark}
              </span>
              <span className="text-[11px] font-medium tabular-nums text-foreground md:text-[10px] lg:text-[11px]">
                {sold} / {pending}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
