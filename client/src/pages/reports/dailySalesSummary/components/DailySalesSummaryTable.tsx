import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDesktopMode } from '@/hooks/use-desktop';
import { dailySalesTableHeaderClassName } from '@/pages/reports/reportUiTokens';
import type { DailySalesSummaryReportDTO } from '@/services/api/reports';
import {
  DSS_COLUMN_HELP,
  DSS_TABLE_HEADERS,
  dayToRowCells,
  totalsToRowCells,
} from '@/pages/reports/dailySalesSummary/dssReportFormat';

const PAGE_SIZE = 10;

type DailySalesSummaryTableProps = {
  report: DailySalesSummaryReportDTO;
  className?: string;
};

export function DailySalesSummaryTable({ report, className }: DailySalesSummaryTableProps) {
  const isDesktop = useDesktopMode();
  const { days, totals } = report;
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [report.periodStart, report.periodEnd, days.length]);

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
    <div
      className={cn(
        'w-full overflow-hidden rounded-xl border border-border/50 shadow-sm bg-white',
        className
      )}
    >
      <div
        className={cn(
          'overflow-x-auto',
          !showPager && 'max-h-[70vh] overflow-y-auto lg:max-h-none lg:overflow-y-visible'
        )}
      >
        <table className="w-full min-w-[720px] text-[11px] sm:text-xs border-collapse">
          <thead>
            <tr className={cn(dailySalesTableHeaderClassName, 'shadow-md')}>
              {DSS_TABLE_HEADERS.map((h) => (
                <th key={h} className="px-1.5 sm:px-2 py-2.5 first:rounded-tl-xl last:rounded-tr-xl">
                  <span className="inline-flex items-center justify-center gap-0.5 text-white">
                    <span>{h}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex rounded-full p-0.5 text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70"
                          aria-label={`About ${h}`}
                        >
                          <Info className="h-3 w-3 shrink-0 text-white" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-snug">
                        <p className="font-semibold text-foreground mb-1">{h}</p>
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">What it is:</span> {DSS_COLUMN_HELP[h].source}
                        </p>
                        <p className="text-muted-foreground mt-1">
                          <span className="font-medium text-foreground">How we add it up:</span>{' '}
                          {DSS_COLUMN_HELP[h].calculation}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white text-foreground">
            {pagedDays.map((d) => (
              <tr key={d.date} className="border-b border-border/40 hover:bg-muted/20">
                {dayToRowCells(d).map((cell, i) => (
                  <td
                    key={`${d.date}-${i}`}
                    className={cn(
                      'px-1.5 sm:px-2 py-2 text-center tabular-nums font-medium',
                      i === 0 && 'font-mono text-[10px] sm:text-[11px] text-foreground'
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr
              className={cn(
                'border-t-2 border-violet-500/40 bg-gradient-to-r from-violet-500/12 via-indigo-500/12 to-slate-500/10',
                'text-[11px] font-bold text-foreground'
              )}
            >
              {totalsToRowCells(totals).map((cell, i) => (
                <td key={`t-${i}`} className="px-1.5 sm:px-2 py-2.5 text-center tabular-nums">
                  {i === 0 ? (
                    <span className="uppercase tracking-wide text-violet-800 dark:text-violet-200">{cell}</span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
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
  );
}
