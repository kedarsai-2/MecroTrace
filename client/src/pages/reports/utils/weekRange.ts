/** Local calendar date YYYY-MM-DD (avoids UTC shift from toISOString). */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-based week start for the calendar week containing `ref`. */
export function startOfWeekMonday(ref: Date = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Preset list for “By week” UI. Extend by appending rows only — `getWeekRangeByOffset`
 * stays unchanged (open for extension).
 */
export const REPORT_WEEK_PRESETS = [
  { offset: 0, label: 'Current Week' },
  { offset: 1, label: 'Previous Week' },
  { offset: 2, label: 'Week -2' },
  { offset: 3, label: 'Week -3' },
] as const;

export type ReportWeekPresetOffset = (typeof REPORT_WEEK_PRESETS)[number]['offset'];

/** Monday–Sunday range for the week `weeksBackFromCurrent` steps before this week (0 = current). */
export function getWeekRangeByOffset(weeksBackFromCurrent: number): { start: string; end: string } {
  const mon = startOfWeekMonday(new Date());
  mon.setDate(mon.getDate() - 7 * weeksBackFromCurrent);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  return { start: toLocalYMD(mon), end: toLocalYMD(sun) };
}

export function coerceReportWeekOffset(raw: number): ReportWeekPresetOffset {
  const match = REPORT_WEEK_PRESETS.find((p) => p.offset === raw);
  return (match?.offset ?? 0) as ReportWeekPresetOffset;
}
