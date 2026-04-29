import { cn } from '@/lib/utils';
import type { ArrivalSummary } from '@/services/api/arrivals';

const ARRIVAL_SUMMARY_PRIMARY_PILL_CLASS =
  'px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0';

/** Arrivals summary first column: Vehicle | Seller | Qty (shared desktop table + mobile cards). */
export default function ArrivalSummaryVehicleSellerQty({
  vehicleNumber,
  vehicleMarkAlias,
  primarySellerName,
  totalBags,
  layout = 'inline',
}: Pick<ArrivalSummary, 'vehicleNumber' | 'primarySellerName' | 'totalBags'> & {
  vehicleMarkAlias?: string | null;
  layout?: 'inline' | 'stack';
}) {
  const seller = primarySellerName ?? '-';
  const qty = totalBags ?? 0;
  const vehicle = vehicleNumber?.trim() ? vehicleNumber : '—';
  const alias = vehicleMarkAlias?.trim() ? vehicleMarkAlias.trim() : '';

  if (layout === 'stack') {
    return (
      <div className="flex min-w-0 flex-col gap-1 text-left">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(ARRIVAL_SUMMARY_PRIMARY_PILL_CLASS, 'max-w-full self-start truncate')}
            title={vehicleNumber?.trim() ? vehicleNumber : undefined}
          >
            {vehicle}
          </span>
          {alias ? (
            <span
              className="max-w-full self-start truncate rounded-md border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-800/50 dark:bg-violet-950/40 dark:text-violet-200"
              title={alias}
            >
              {alias}
            </span>
          ) : null}
        </div>
        <span className="truncate text-sm font-semibold text-foreground" title={seller}>
          {seller}
        </span>
        <span className="text-xs text-muted-foreground">
          Bags{' '}
          <span className="font-semibold tabular-nums text-foreground">{qty}</span>
        </span>
      </div>
    );
  }

  return (
    <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={cn(ARRIVAL_SUMMARY_PRIMARY_PILL_CLASS, 'max-w-[min(100%,10rem)] truncate')}
        title={vehicleNumber?.trim() ? vehicleNumber : undefined}
      >
        {vehicle}
      </span>
      {alias ? (
        <>
          <span
            className="max-w-[min(100%,8rem)] truncate rounded-md border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:border-violet-800/50 dark:bg-violet-950/40 dark:text-violet-200"
            title={alias}
          >
            {alias}
          </span>
        </>
      ) : null}
      <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
        |
      </span>
      <span
        className="max-w-[min(100%,14rem)] min-w-0 truncate text-xs font-medium text-foreground sm:max-w-[min(100%,18rem)]"
        title={seller}
      >
        {seller}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
        |
      </span>
      <span className={ARRIVAL_SUMMARY_PRIMARY_PILL_CLASS}>{qty}</span>
    </span>
  );
}
