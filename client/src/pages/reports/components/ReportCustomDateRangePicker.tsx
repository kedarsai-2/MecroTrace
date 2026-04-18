import { useCallback, useMemo, useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import {
  clampYmdToReportCustomRange,
  getReportCustomRangeCalendarExclusiveAfter,
  getReportCustomRangeMaxDate,
  getReportCustomRangeMinDate,
} from '@/pages/reports/utils/reportCustomDateBounds';
import { CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const disabledMatchers = useMemo(
    () => [
      { before: getReportCustomRangeMinDate() },
      { after: getReportCustomRangeCalendarExclusiveAfter() },
    ],
    [startOpen, endOpen],
  );

  const startSelected = useMemo(() => {
    const d = parseYmd(clampYmdToReportCustomRange(start));
    return d ? clampDateToCustomRange(d) : undefined;
  }, [start]);

  const endSelected = useMemo(() => {
    const d = parseYmd(clampYmdToReportCustomRange(end));
    return d ? clampDateToCustomRange(d) : undefined;
  }, [end]);

  const startTriggerId = id ? `${id}-start` : undefined;
  const endTriggerId = id ? `${id}-end` : undefined;

  const handleStartSelect = useCallback(
    (d: Date | undefined) => {
      if (!d) return;
      onStartChange(fmt(clampDateToCustomRange(d)));
      setStartOpen(false);
    },
    [onStartChange],
  );

  const handleEndSelect = useCallback(
    (d: Date | undefined) => {
      if (!d) return;
      onEndChange(fmt(clampDateToCustomRange(d)));
      setEndOpen(false);
    },
    [onEndChange],
  );

  const startLabel = startSelected ? fmtDisplay(startSelected) : 'Select start date';
  const endLabel = endSelected ? fmtDisplay(endSelected) : 'Select end date';
  const startDefaultMonth = startSelected ?? new Date();
  const endDefaultMonth = endSelected ?? startSelected ?? new Date();

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3', className)}>
      <div className="min-w-0 flex-1">
        <Popover open={startOpen} onOpenChange={setStartOpen}>
          <PopoverTrigger asChild>
            <Button
              id={startTriggerId}
              type="button"
              variant="outline"
              disabled={disabled}
              className="h-10 lg:h-9 w-full min-w-0 justify-start text-left font-normal touch-manipulation px-2.5"
              aria-label="Open start date calendar"
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
              <span className="truncate text-sm">{startLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
            <Calendar
              mode="single"
              selected={startSelected}
              onSelect={handleStartSelect}
              disabled={disabledMatchers}
              defaultMonth={startDefaultMonth}
              initialFocus
              className="p-2"
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="min-w-0 flex-1">
        <Popover open={endOpen} onOpenChange={setEndOpen}>
          <PopoverTrigger asChild>
            <Button
              id={endTriggerId}
              type="button"
              variant="outline"
              disabled={disabled}
              className="h-10 lg:h-9 w-full min-w-0 justify-start text-left font-normal touch-manipulation px-2.5"
              aria-label="Open end date calendar"
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
              <span className="truncate text-sm">{endLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
            <Calendar
              mode="single"
              selected={endSelected}
              onSelect={handleEndSelect}
              disabled={disabledMatchers}
              defaultMonth={endDefaultMonth}
              initialFocus
              className="p-2"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
