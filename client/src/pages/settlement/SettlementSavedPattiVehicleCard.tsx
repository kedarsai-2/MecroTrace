import { cn } from '@/lib/utils';
import { uniqueArrivalSellerCount } from './settlementCalculations';
import type { SavedArrivalSummaryRow } from './settlementTypes';

/** Vehicle-group saved patti card (same grouping as table): bags + weighed bar + aggregated sellers. */
export function SettlementSavedPattiVehicleCard({
  row,
  onOpen,
}: {
  row: SavedArrivalSummaryRow;
  onOpen: () => void;
}) {
  const total = Math.round(Math.max(row.totalBags ?? 0, row.lots));
  const weighedPct = total > 0 ? (Math.min(Math.max(0, row.weighed), total) / total) * 100 : 0;
  const nSellers = uniqueArrivalSellerCount(row.sellerIds);
  const canOpen = row.representativePattiId != null;

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={onOpen}
      className={cn(
        'w-full rounded-2xl border border-border/50 bg-white p-4 text-left shadow-sm transition-colors dark:bg-card touch-manipulation',
        canOpen
          ? 'hover:bg-muted/25 active:scale-[0.99]'
          : 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#eef0ff] px-2 py-0.5 text-[10px] font-bold text-[#6075FF] dark:bg-[#6075FF]/20">
              {row.vehicleNumber}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
              {nSellers} seller{nSellers === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-bold text-foreground">{row.sellerNames || '-'}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.fromLocation}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums leading-none text-foreground">{total}</p>
          <p className="text-[11px] font-medium text-muted-foreground">Bags</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/40 px-1 py-2">
          <div className="text-base font-bold tabular-nums text-foreground">{row.lots}</div>
          <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Lots</div>
        </div>
        <div className="rounded-lg bg-muted/40 px-1 py-2">
          <div className="text-base font-bold tabular-nums text-foreground">{row.bids}</div>
          <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Bids</div>
        </div>
        <div className="rounded-lg bg-muted/40 px-1 py-2">
          <div className="text-base font-bold tabular-nums text-foreground">{row.weighed}</div>
          <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Weighed</div>
        </div>
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-border/30 pt-2">
        <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Completed</span>
        <div
          className="relative h-8 min-h-[2rem] min-w-0 flex-1 overflow-hidden rounded-xl border-2 border-foreground/15 shadow-inner dark:border-white/20"
          title={total > 0 ? `Weighed ${row.weighed} of ${total} bags` : 'Bag total unavailable'}
          aria-label={total > 0 ? `Weighed ${row.weighed} of ${total} bags` : 'Weighing progress'}
        >
          <div className="absolute inset-0 bg-red-500" aria-hidden />
          <div
            className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-300 ease-out"
            style={{ width: `${weighedPct}%` }}
            aria-hidden
          />
          <div className="relative flex h-full items-center justify-center px-2">
            <span className="text-[11px] font-bold tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
              {total > 0 ? `${row.weighed}/${total}` : '—'}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{row.dateLabel}</span>
      </div>
    </button>
  );
}
