import { useCallback, useMemo, useState } from 'react';
import {
  getReportCustomRangeMaxYmd,
  getReportCustomRangeMinYmd,
  REPORT_CUSTOM_DATE_LOOKBACK_DAYS,
} from '@/pages/reports/utils/reportCustomDateBounds';
import { getWeekRangeByOffset, type ReportWeekPresetOffset } from '@/pages/reports/utils/weekRange';

export type ReportDateFilterMode = 'by_week' | 'custom_date';

/** Serializable snapshot for future API calls (no fetch here). */
export type ReportDateRangePreparedPayload = {
  mode: ReportDateFilterMode;
  /** Set when mode is `by_week`: weeks back from current week (matches preset offset). */
  weekOffset?: number;
  startDate: string;
  endDate: string;
};

function todayLocalYMD(): string {
  return new Date().toLocaleDateString('en-CA');
}

export type ReportDateRangeStateApi = {
  mode: ReportDateFilterMode;
  setMode: (m: ReportDateFilterMode) => void;
  weekOffset: ReportWeekPresetOffset;
  setWeekOffset: (w: ReportWeekPresetOffset) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  validationError: string | null;
  isValid: boolean;
  preparedPayload: ReportDateRangePreparedPayload;
  generateRequestId: number;
  requestGenerate: () => void;
};

/**
 * Isolated date-range state per report screen. Treat as the single source of truth
 * until API wiring replaces local-only updates.
 */
export function useReportDateRangeState(): ReportDateRangeStateApi {
  /** Default: By Week + Current Week (offset 0). */
  const [mode, setMode] = useState<ReportDateFilterMode>('by_week');
  const [weekOffset, setWeekOffset] = useState<ReportWeekPresetOffset>(0);
  const [customStart, setCustomStart] = useState(todayLocalYMD);
  const [customEnd, setCustomEnd] = useState(todayLocalYMD);
  const [generateRequestId, setGenerateRequestId] = useState(0);

  const validationError = useMemo(() => {
    if (mode !== 'custom_date') return null;
    if (!customStart || !customEnd) return null;
    if (customStart > customEnd) {
      return 'Start date must be on or before end date.';
    }
    const minY = getReportCustomRangeMinYmd();
    const maxY = getReportCustomRangeMaxYmd();
    if (customStart < minY || customEnd < minY) {
      return `Dates cannot be more than ${REPORT_CUSTOM_DATE_LOOKBACK_DAYS} days in the past. Earliest allowed day is ${minY}.`;
    }
    if (customStart > maxY || customEnd > maxY) {
      return `Dates cannot be after today (${maxY}).`;
    }
    return null;
  }, [mode, customStart, customEnd]);

  const preparedPayload = useMemo((): ReportDateRangePreparedPayload => {
    if (mode === 'by_week') {
      const { start, end } = getWeekRangeByOffset(weekOffset);
      return { mode, weekOffset, startDate: start, endDate: end };
    }
    return { mode, startDate: customStart, endDate: customEnd };
  }, [mode, weekOffset, customStart, customEnd]);

  const requestGenerate = useCallback(() => {
    setGenerateRequestId((n) => n + 1);
  }, []);

  return {
    mode,
    setMode,
    weekOffset,
    setWeekOffset,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    validationError,
    isValid: validationError === null,
    preparedPayload,
    generateRequestId,
    requestGenerate,
  };
}
