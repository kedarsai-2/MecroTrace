import { Printer, Truck } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ArrivalSummary } from '@/services/api/arrivals';
import { Button } from '@/components/ui/button';
import type { AuctionBagStats, VehicleBillingBagStats } from '@/components/summary/summaryArrivalPipelineMetrics';
import { progressPercent, pipelineTotalBags } from '@/components/summary/summaryArrivalPipelineMetrics';

function formatCardDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.getDate();
  const mon = d.toLocaleDateString('en-GB', { month: 'short' });
  const y = d.getFullYear();
  return `${day}-${mon}-${y}`;
}

function PipelineStepPill({
  label,
  done,
  total,
  variant = 'count',
}: {
  label: string;
  done: number;
  total: number;
  variant?: 'count' | 'invoiced';
}) {
  const t = Math.max(0, Math.round(total));
  const dRaw = Math.max(0, done);
  const pct = t > 0 ? progressPercent(dRaw, t) : 0;
  const complete = t > 0 && dRaw >= t - 0.5;

  const displayNumber = t > 0 ? Math.min(Math.round(dRaw), t) : Math.round(dRaw);

  return (
    <div className="flex min-w-0 flex-[1_1_0%] flex-col items-center gap-1 sm:gap-1.5">
      <div
        className={cn(
          'relative h-11 w-full min-w-0 overflow-hidden rounded-lg border-2 shadow-inner sm:h-[3.25rem] sm:rounded-xl',
          variant === 'invoiced' && complete
            ? 'border-blue-500 dark:border-blue-400'
            : 'border-foreground/15 dark:border-white/20',
        )}
      >
        {/* Pending (rose) full track */}
        <div className="absolute inset-0 bg-rose-500" aria-hidden />
        {/* Completed fill — brand green #92D050 */}
        <div
          className="absolute inset-y-0 left-0 bg-[#92D050] transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <div className="relative flex h-full min-w-0 items-center justify-center px-0.5 sm:px-1.5">
          {variant === 'invoiced' && complete ? (
            <span className="max-w-full truncate text-center text-[10px] font-bold leading-tight text-white drop-shadow-sm sm:text-xs">
              Invoiced
            </span>
          ) : variant === 'invoiced' && !complete ? (
            <span className="text-center text-[10px] font-bold tabular-nums leading-none text-white drop-shadow-sm sm:text-xs">
              {displayNumber}
            </span>
          ) : (
            <span className="text-center text-[11px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] sm:text-base">
              {displayNumber}
            </span>
          )}
        </div>
      </div>
      <span className="max-w-full truncate text-center text-[10px] font-medium leading-tight text-muted-foreground sm:text-xs">
        {label}
      </span>
    </div>
  );
}

function StepConnector() {
  return (
    <div
      className="h-px w-1 shrink-0 self-center bg-foreground/25 sm:mx-0.5 sm:w-3 sm:min-w-[0.75rem] md:min-w-[1rem]"
      aria-hidden
    />
  );
}

type Props = {
  arrival: ArrivalSummary;
  billing: VehicleBillingBagStats | undefined;
  auction: AuctionBagStats | undefined;
  index: number;
  onOpenVehicle: (a: ArrivalSummary) => void;
  onPrint?: (a: ArrivalSummary) => void;
};

const SummaryArrivalPipelineCard = ({ arrival: a, billing, auction, index, onOpenVehicle, onPrint }: Props) => {
  const denom = pipelineTotalBags(a, auction);
  const location = [a.origin, a.godown].map((x) => (x ?? '').trim()).filter(Boolean).join(', ') || '—';
  const sellerName = (a.primarySellerName ?? '').trim() || '—';
  const totalBagsHeader =
    typeof a.totalBags === 'number' && a.totalBags > 0
      ? a.totalBags
      : Math.max(auction?.totalBags ?? 0, denom);

  const bidDone = auction?.auctionedBags ?? 0;
  const weighedDone = billing?.weighedBags ?? 0;
  const billedDone = billing?.billedBags ?? 0;
  const invoicedDone = billing?.invoicedBags ?? 0;

  const handlePrint = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onPrint) onPrint(a);
    else onOpenVehicle(a);
  };

  const handleSummary = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onOpenVehicle(a);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      role="button"
      tabIndex={0}
      onClick={() => onOpenVehicle(a)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenVehicle(a);
        }
      }}
      className="flex min-w-0 cursor-pointer flex-col rounded-2xl border border-border/60 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:bg-card"
    >
      {/* Header: vehicle block left, total bags top-right (no fractions here) */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
            <Truck className="h-7 w-7 text-blue-600 dark:text-blue-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-base font-bold tracking-wide text-foreground">{a.vehicleNumber}</p>
            <p className="truncate text-sm text-foreground/90">{sellerName}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{location}</p>
            <p className="text-[11px] tabular-nums text-muted-foreground/90">
              <time dateTime={a.arrivalDatetime}>{formatCardDate(a.arrivalDatetime)}</time>
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums leading-none text-foreground">
            {totalBagsHeader}
          </p>
          <p className="text-[11px] font-medium text-muted-foreground">Bag</p>
        </div>
      </div>

      <div className="mb-1 flex min-w-0 items-center gap-0 pb-1">
        <PipelineStepPill label="Bid" done={bidDone} total={denom} />
        <StepConnector />
        <PipelineStepPill label="Weighed" done={weighedDone} total={denom} />
        <StepConnector />
        <PipelineStepPill label="Billed" done={billedDone} total={denom} />
        <StepConnector />
        <PipelineStepPill label="Invoiced" done={invoicedDone} total={denom} variant="invoiced" />
      </div>

      <div className="mt-auto flex gap-2 border-t border-border/40 pt-3">
        <Button
          type="button"
          size="sm"
          className="flex-1 rounded-xl bg-[#6075FF] font-semibold text-white hover:bg-[#5468e6]"
          onClick={handleSummary}
        >
          Summary
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1 rounded-xl border-[#6075FF]/40 font-semibold text-[#6075FF] hover:bg-[#6075FF]/10"
          onClick={handlePrint}
        >
          <Printer className="mr-1.5 h-4 w-4" aria-hidden />
          Print
        </Button>
      </div>
    </motion.article>
  );
};

export default SummaryArrivalPipelineCard;
