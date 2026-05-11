import { motion } from 'framer-motion';
import { Lock, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArrivalSummary } from '@/services/api/arrivals';
import ArrivalStatusBadge, { getArrivalStatus } from '@/components/arrivals/ArrivalStatusBadge';
import ArrivalSummaryVehicleSellerQty from '@/components/arrivals/ArrivalSummaryVehicleSellerQty';
import { ARRIVALS_TABLE_HEADER_GRADIENT } from '@/components/arrivals/arrivalsTableTokens';
import type { SummaryArrivalCardMeta } from './SummaryArrivalPipelineCard';

type Props = {
  arrivals: ArrivalSummary[];
  metaByVehicleId?: Map<string, SummaryArrivalCardMeta>;
  onSelectArrival: (a: ArrivalSummary) => void;
};

function formatSummaryEditTooltip(meta: SummaryArrivalCardMeta | undefined): string {
  if (!meta?.summaryEdited) return '';
  const when = meta.summaryEditedAt ? new Date(meta.summaryEditedAt) : null;
  const whenText = when && !Number.isNaN(when.getTime()) ? when.toLocaleString() : 'unknown time';
  const byText = meta.summaryEditedBy?.trim() || 'unknown user';
  return `Edited in Summary. Last edited ${whenText} by ${byText}.`;
}

const SummaryArrivalsTable = ({ arrivals, metaByVehicleId, onSelectArrival }: Props) => (
  <div className="glass-card max-w-full touch-[pan-x_pan-y] lg:touch-auto overflow-x-auto rounded-2xl [-webkit-overflow-scrolling:touch]">
    <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
      <thead className={cn(ARRIVALS_TABLE_HEADER_GRADIENT, 'shadow-md')}>
        <tr className="border-b border-white/20">
          <th className="rounded-tl-xl px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
            Vehicle | Seller | Qty
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
            Mark / Alias
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
            Status
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
            From
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
            Bids
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
            Weighed
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
            Sellers
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
            Lots
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
            Net Wt
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/95">
            Freight
          </th>
          <th className="rounded-tr-xl px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/95">
            Date
          </th>
        </tr>
      </thead>
      <tbody>
        {arrivals.map((a, i) => {
          const status = getArrivalStatus(a);
          const meta = metaByVehicleId?.get(String(a.vehicleId));
          const editTooltip = formatSummaryEditTooltip(meta);
          return (
            <motion.tr
              key={`${a.vehicleId}-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              role="button"
              tabIndex={0}
              onClick={() => onSelectArrival(a)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectArrival(a);
                }
              }}
              className="cursor-pointer border-b border-border/20 transition-colors hover:bg-muted/20"
            >
              <td className="px-4 py-3 text-foreground">
                <div className="flex items-center gap-2">
                  <ArrivalSummaryVehicleSellerQty
                    vehicleNumber={a.vehicleNumber}
                    primarySellerName={a.primarySellerName}
                    totalBags={a.totalBags}
                  />
                  {meta?.summaryEdited ? (
                    <Pencil
                      className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
                      aria-label={editTooltip}
                      title={editTooltip}
                    />
                  ) : null}
                  {meta?.frozen ? (
                    <Lock
                      className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300"
                      aria-label="Frozen: Settlement Patti is printed for one or more sellers in this vehicle."
                      title="Frozen: Settlement Patti is printed for one or more sellers in this vehicle."
                    />
                  ) : null}
                </div>
              </td>
              <td
                className="max-w-[10rem] truncate px-4 py-3 text-xs text-muted-foreground"
                title={a.vehicleMarkAlias?.trim() || undefined}
              >
                {a.vehicleMarkAlias?.trim() ? a.vehicleMarkAlias.trim() : '—'}
              </td>
              <td className="px-4 py-3">
                <ArrivalStatusBadge status={status} />
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{a.godown ?? '—'}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{a.bidsCount ?? 0}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{a.weighedCount ?? 0}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{a.sellerCount}</td>
              <td className="px-4 py-3 text-right font-medium text-foreground">{a.lotCount}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{a.netWeight}kg</td>
              <td className="px-4 py-3 text-right text-muted-foreground">
                {a.freightTotal > 0 ? `₹${a.freightTotal.toLocaleString()}` : '—'}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(a.arrivalDatetime).toLocaleDateString()}
              </td>
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default SummaryArrivalsTable;
