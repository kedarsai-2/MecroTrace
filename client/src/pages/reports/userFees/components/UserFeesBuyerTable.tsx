import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDesktopMode } from '@/hooks/use-desktop';
import { dailySalesTableHeaderClassName } from '@/pages/reports/reportUiTokens';
import type { UserFeesBillRowDTO, UserFeesTotalsDTO } from '@/services/api/reports';
import { userFeesMoney } from '@/pages/reports/userFees/userFeesFormat';

const PAGE_SIZE = 10;

const HEADERS = ['Buyer Name', 'Bill No.', 'Total Bags', 'Total Sales', 'User Charges', 'Weighman Charge'] as const;

type UserFeesBuyerTableProps = {
  selectedDate: string | null;
  bills: UserFeesBillRowDTO[];
  totals: UserFeesTotalsDTO | null;
  loading?: boolean;
  className?: string;
};

export function UserFeesBuyerTable({ selectedDate, bills, totals, loading, className }: UserFeesBuyerTableProps) {
  const isDesktop = useDesktopMode();
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [selectedDate, bills.length, loading]);

  const totalPages = useMemo(() => {
    if (!isDesktop || bills.length <= PAGE_SIZE) return 1;
    return Math.max(1, Math.ceil(bills.length / PAGE_SIZE));
  }, [bills.length, isDesktop]);

  const safePage = Math.min(page, totalPages - 1);
  const pagedBills = useMemo(() => {
    if (!isDesktop || bills.length <= PAGE_SIZE) return bills;
    const start = safePage * PAGE_SIZE;
    return bills.slice(start, start + PAGE_SIZE);
  }, [bills, isDesktop, safePage]);

  const showPager = isDesktop && bills.length > PAGE_SIZE && !loading && selectedDate;

  const emptyMessage = !selectedDate ? '—' : 'No bills for this day.';

  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <h3 className="text-sm font-semibold text-foreground shrink-0">Buyer Details Table</h3>
        {selectedDate ? (
          <span
            className="text-[11px] text-muted-foreground font-mono truncate text-right tabular-nums"
            title={selectedDate}
          >
            {selectedDate}
          </span>
        ) : null}
      </div>
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !selectedDate || bills.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pagedBills.map((b, idx) => (
                  <tr key={`${b.billNumber}-${idx}`} className="border-b border-border/40">
                    <td className="px-1.5 sm:px-2 py-2 text-left sm:text-center max-w-[140px] truncate" title={b.buyerName}>
                      {b.buyerName || '—'}
                    </td>
                    <td className="px-1.5 sm:px-2 py-2 text-center font-mono text-[10px] sm:text-[11px]">{b.billNumber || '—'}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center tabular-nums">{b.totalBags ?? 0}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center tabular-nums">{userFeesMoney(Number(b.totalSales) || 0)}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center tabular-nums">{userFeesMoney(Number(b.userCharges) || 0)}</td>
                    <td className="px-1.5 sm:px-2 py-2 text-center tabular-nums">{userFeesMoney(Number(b.weighmanCharge) || 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && selectedDate && bills.length > 0 && totals ? (
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
            ) : null}
          </table>
        </div>

        {showPager ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/40 px-2 py-2 bg-muted/10">
            <p className="text-[11px] text-muted-foreground tabular-nums">
              Bills {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, bills.length)} of {bills.length}{' '}
              <span className="hidden sm:inline">(totals are for full day)</span>
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
