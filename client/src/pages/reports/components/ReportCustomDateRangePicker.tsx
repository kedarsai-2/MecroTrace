import { useCallback, useMemo, useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import {
  clampYmdToReportCustomRange,
  getReportCustomRangeCalendarExclusiveAfter,
  getReportCustomRangeMaxDate,
  getReportCustomRangeMinDate,
} from '@/pages/reports/utils/reportCustomDateBounds';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { reportsAccentPairedActionButtonClassName } from '@/pages/reports/reportUiTokens';

function parseYmd(s: string): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = parse(s.trim(), 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : undefined;
}

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function fmtDisplay(d: Date): string {
  return format(d, 'd MMM yyyy');
}

type ReportCustomDateRangePickerProps = {
  start: string;
  end: string;
  onStartChange: (iso: string) => void;
  onEndChange: (iso: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * Range calendar in a popover: selection stays **draft** until **Apply**.
 * **Clear** resets the draft only; parent updates only on **Apply** with both ends set.
 */
function clampDateToCustomRange(d: Date): Date {
  const min = getReportCustomRangeMinDate();
  const max = getReportCustomRangeMaxDate();
  const t = d.getTime();
  if (t < min.getTime()) return min;
  if (t > max.getTime()) return max;
  return d;
}

export function ReportCustomDateRangePicker({
  start,
  end,
  onStartChange,
  onEndChange,
  disabled,
  id,
  className,
}: ReportCustomDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  /** Draft while popover is open — not committed until Apply. */
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  /** Refresh when popover opens so “today” / bounds stay correct if session crosses midnight. */
  const disabledMatchers = useMemo(
    () => [
      { before: getReportCustomRangeMinDate() },
      { after: getReportCustomRangeCalendarExclusiveAfter() },
    ],
    [open],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        const cs = clampYmdToReportCustomRange(start);
        const ce = clampYmdToReportCustomRange(end);
        const from = parseYmd(cs);
        const to = parseYmd(ce);
        if (from && to) {
          const a = clampDateToCustomRange(from);
          const b = clampDateToCustomRange(to);
          setDraft(a <= b ? { from: a, to: b } : { from: b, to: a });
        } else if (from) {
          setDraft({ from: clampDateToCustomRange(from), to: undefined });
        } else setDraft(undefined);
      }
      setOpen(next);
    },
    [start, end],
  );

  const label = useMemo(() => {
    const from = parseYmd(start);
    const to = parseYmd(end);
    if (!from) return 'Select date range';
    if (!to || +from === +to) return fmtDisplay(from);
    return `${fmtDisplay(from)} → ${fmtDisplay(to)}`;
  }, [start, end]);

  const canApply = Boolean(draft?.from && draft?.to);
  const canClear = Boolean(draft?.from || draft?.to);

  const handleApply = useCallback(() => {
    if (!draft?.from || !draft.to) return;
    const a = clampDateToCustomRange(draft.from);
    const b = clampDateToCustomRange(draft.to);
    const lo = a <= b ? a : b;
    const hi = a <= b ? b : a;
    onStartChange(fmt(lo));
    onEndChange(fmt(hi));
    setOpen(false);
  }, [draft, onStartChange, onEndChange]);

  const handleClear = useCallback(() => {
    setDraft(undefined);
  }, []);

  const defaultMonth = draft?.from ?? parseYmd(start) ?? new Date();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-10 lg:h-9 w-full min-w-0 justify-start text-left font-normal touch-manipulation px-2.5',
            className,
          )}
          aria-label="Open date range calendar"
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate text-sm">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
        <Calendar
          mode="range"
          numberOfMonths={1}
          defaultMonth={defaultMonth}
          selected={draft}
          onSelect={(range: DateRange | undefined) => {
            if (!range) {
              setDraft(undefined);
              return;
            }
            const from = range.from ? clampDateToCustomRange(range.from) : undefined;
            const to = range.to ? clampDateToCustomRange(range.to) : undefined;
            setDraft({ from, to });
          }}
          disabled={disabledMatchers}
          initialFocus
          className="p-2"
        />
        <div className="flex gap-2 border-t border-border/40 px-2 py-2 bg-muted/20">
          <button
            type="button"
            disabled={!canClear}
            onClick={handleClear}
            className={reportsAccentPairedActionButtonClassName(!canClear)}
          >
            Clear
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={handleApply}
            className={reportsAccentPairedActionButtonClassName(!canApply)}
          >
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
