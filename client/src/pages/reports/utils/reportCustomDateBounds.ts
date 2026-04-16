import { addDays, endOfDay, startOfDay, subDays } from 'date-fns';

/** Custom range in report filters: only the last N calendar days from today (inclusive). */
export const REPORT_CUSTOM_DATE_LOOKBACK_DAYS = 180;

/** Earliest selectable calendar day (local). */
export function getReportCustomRangeMinDate(): Date {
  return startOfDay(subDays(new Date(), REPORT_CUSTOM_DATE_LOOKBACK_DAYS));
}

/** Latest selectable instant (local): end of today — for clamping picked times. */
export function getReportCustomRangeMaxDate(): Date {
  return endOfDay(new Date());
}

/**
 * Days strictly after this are disabled (react-day-picker `after` matcher excludes this date).
 * Use start of tomorrow so “today” stays selectable.
 */
export function getReportCustomRangeCalendarExclusiveAfter(): Date {
  return startOfDay(addDays(new Date(), 1));
}

/** YYYY-MM-DD in local calendar, comparable with ISO date strings. */
export function ymdFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getReportCustomRangeMinYmd(): string {
  return ymdFromLocalDate(getReportCustomRangeMinDate());
}

export function getReportCustomRangeMaxYmd(): string {
  return ymdFromLocalDate(startOfDay(new Date()));
}

export function clampYmdToReportCustomRange(ymd: string): string {
  const min = getReportCustomRangeMinYmd();
  const max = getReportCustomRangeMaxYmd();
  if (ymd < min) return min;
  if (ymd > max) return max;
  return ymd;
}
