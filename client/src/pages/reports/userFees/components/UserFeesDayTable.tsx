import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDesktopMode } from '@/hooks/use-desktop';
import { dailySalesTableHeaderClassName } from '@/pages/reports/reportUiTokens';
import type { UserFeesDayRowDTO, UserFeesTotalsDTO } from '@/services/api/reports';
import { userFeesMoney, utcWeekdayShort } from '@/pages/reports/userFees/userFeesFormat';

const PAGE_SIZE = 10;

const HEADERS = ['Date', 'Day', 'Total Bags', 'Total Sales', 'User Charges', 'Weighman Charge'] as const;

type UserFeesDayTableProps = {
  days: UserFeesDayRowDTO[];
  totals: UserFeesTotalsDTO;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
  periodStart?: string;
  periodEnd?: string;
  className?: string;
};

export function UserFeesDayTable({
  days,
  totals,
  selectedDate,
  onSelectDay,
  periodStart,
  periodEnd,
  className,
}: UserFeesDayTableProps) {
  const isDesktop = useDesktopMode();
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [periodStart, periodEnd, days.length]);

  const totalPages = useMemo(() => {
    if (!isDesktop || days.length <= PAGE_SIZE) return 1;
    return Math.max(1, Math.ceil(days.length / PAGE_SIZE));
  }, [days.length, isDesktop]);

  const safePage = Math.min(page, totalPages - 1);
  const pagedDays = useMemo(() => {
    if (!isDesktop || days.length <= PAGE_SIZE) return days;
    const start = safePage * PAGE_SIZE;
    return days.slice(start, start + PAGE_SIZE);
  }, [days, isDesktop, safePage]);

  const showPager = isDesktop && days.length > PAGE_SIZE;

  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      <h3 className="text-sm font-semibold text-foreground">Bills Details Table</h3>
      <div className="w-full overflow-hidden rounded-xl border border-border/50 shadow-sm bg-white">
        <div
          className={cn(
            'overflow-x-auto',
            !showPager && 'max-h-[50vh] overflow-y-auto lg:max-h-none lg:overflow-y-visible'
          )}
        >
          <table className="w-full min-w-[640px] text-[11px] sm:text-xs border-collapse">
            <thead>
              <tr className={cn(dailySalesTableHeaderClassName, 'shadow-md')}>
                {HEADERS.map((h) => (
                  <th key={h} className="px-1.5 sm:px-2 py-2.5 first:rounded-tl-xl last:rounded-tr-xl text-center text-white font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white text-foreground">
              {pagedDays.map((d) => {
                const active = selectedDate === d.date;
                return (
                  <tr
                    key={d.date}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectDay(d.date)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectDay(d.date);
                      }
                    }}
                    className={cn(
                      'border-b border-border/40 cursor-pointer transition-colors',
                      active ? 'bg-violet-500/15' : 'hover:bg-muted/25'
                    )}
                  >
                    <td className="px-1.5 sm:px-2 py-2 text-center font-mono text-[10px] sm:text-[11px]">{d.date}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center">{utcWeekdayShort(d.date)}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center tabular-nums">{d.totalBags ?? 0}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center tabular-nums">{userFeesMoney(Number(d.totalSales) || 0)}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center tabular-nums">{userFeesMoney(Number(d.userCharges) || 0)}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center tabular-nums">{userFeesMoney(Number(d.weighmanCharge) || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr
                className={cn(
                  'border-t-2 border-violet-500/40 bg-gradient-to-r from-violet-500/12 via-indigo-500/12 to-slate-500/10',
                  'text-[11px] font-bold text-foreground'
                )}
              >
                <td className="px-1.5 sm:px-2 py-2.5 text-center uppercase tracking-wide text-violet-800 dark:text-violet-200">
                  Total
                </td>
                <td className="px-1.5 sm:px-2 py-2.5 text-center"> </td>
                <td className="px-1.5 sm:px-2 py-2.5 text-center tabular-nums">{totals.totalBags ?? 0}</td>
                <td className="px-1.5 sm:px-2 py-2.5 text-center tabular-nums">{userFeesMoney(Number(totals.totalSales) || 0)}</td>
                <td className="px-1.5 sm:px-2 py-2.5 text-center tabular-nums">{userFeesMoney(Number(totals.userCharges) || 0)}</td>
                <td className="px-1.5 sm:px-2 py-2.5 text-center tabular-nums">{userFeesMoney(Number(totals.weighmanCharge) || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {showPager ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/40 px-2 py-2 bg-muted/10">
            <p className="text-[11px] text-muted-foreground tabular-nums">
              Days {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, days.length)} of {days.length}{' '}
              <span className="hidden sm:inline">(totals are for full range)</span>
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                disabled={safePage <= 0}
                onClick={() => setPage((x) => Math.max(0, x - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-[11px] text-muted-foreground tabular-nums min-w-[4.5rem] text-center">
                {safePage + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((x) => Math.min(totalPages - 1, x + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
