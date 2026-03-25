import { cn } from '@/lib/utils';

export type ArrivalStatus = 'PENDING' | 'WEIGHED' | 'AUCTIONED' | 'SETTLED' | 'PARTIALLY_COMPLETED';

const STATUS_CONFIG: Record<ArrivalStatus, { label: string; bg: string; text: string; dot: string }> = {
  PENDING:              { label: 'Pending',              bg: 'bg-amber-100 dark:bg-amber-950/30',    text: 'text-amber-700 dark:text-amber-300',    dot: 'bg-amber-500' },
  WEIGHED:              { label: 'Weighed',              bg: 'bg-blue-100 dark:bg-blue-950/30',      text: 'text-blue-700 dark:text-blue-300',      dot: 'bg-blue-500' },
  AUCTIONED:            { label: 'Auctioned',            bg: 'bg-violet-100 dark:bg-violet-950/30',  text: 'text-violet-700 dark:text-violet-300',  dot: 'bg-violet-500' },
  SETTLED:              { label: 'Settled',              bg: 'bg-emerald-100 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  PARTIALLY_COMPLETED:  { label: 'Partially Completed',  bg: 'bg-orange-100 dark:bg-orange-950/30',  text: 'text-orange-700 dark:text-orange-300',  dot: 'bg-orange-500' },
};

export const ALL_STATUSES: ArrivalStatus[] = ['PENDING', 'WEIGHED', 'AUCTIONED', 'SETTLED'];

export const COMPLETED_STATUSES: ArrivalStatus[] = ['PENDING', 'WEIGHED', 'AUCTIONED', 'SETTLED'];

/**
 * Derive status from backend arrival data.
 * If the record is partially completed (draft), returns PARTIALLY_COMPLETED.
 * Otherwise: WEIGHED when all lots have weighing; AUCTIONED when any bid; else PENDING.
 */
export function getArrivalStatus(arrival: {
  netWeight?: number;
  lotCount?: number;
  bidsCount?: number;
  weighedCount?: number;
  partiallyCompleted?: boolean;
}): ArrivalStatus {
  if (arrival.partiallyCompleted) return 'PARTIALLY_COMPLETED';
  const lotCount = arrival.lotCount ?? 0;
  const bidsCount = arrival.bidsCount ?? 0;
  const weighedCount = arrival.weighedCount ?? 0;
  if (lotCount > 0 && weighedCount >= lotCount) return 'WEIGHED';
  if (bidsCount > 0) return 'AUCTIONED';
  return 'PENDING';
}

interface ArrivalStatusBadgeProps {
  status: ArrivalStatus;
  size?: 'sm' | 'md';
}

const ArrivalStatusBadge = ({ status, size = 'sm' }: ArrivalStatusBadgeProps) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-semibold',
      cfg.bg, cfg.text,
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
};

export default ArrivalStatusBadge;
