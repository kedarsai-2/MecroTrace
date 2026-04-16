import { BarChart3 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReportDateRangeSelector } from '@/pages/reports/components/ReportDateRangeSelector';
import { useReportDateRangeState } from '@/pages/reports/hooks/useReportDateRangeState';
import { ReportDetailPageShell } from './ReportDetailPageShell';
import { fetchDailySalesSummaryReport } from '@/pages/reports/dailySalesSummary/dailySalesSummaryReportService';
import { DailySalesSummaryTable } from '@/pages/reports/dailySalesSummary/components/DailySalesSummaryTable';
import { ReportActions } from '@/pages/reports/dailySalesSummary/components/ReportActions';
import { isReportEmpty } from '@/pages/reports/dailySalesSummary/dssReportFormat';
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import type { DailySalesSummaryReportDTO } from '@/services/api/reports';
import { minYmd, todayIstYmd } from '@/utils/reportIstDates';
import { toast } from 'sonner';

const DailySalesSummaryPage = () => {
  const dateRange = useReportDateRangeState();
  const { trader, user } = useAuth();

  const [data, setData] = useState<DailySalesSummaryReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const effectiveRange = useMemo(() => {
    const { startDate, endDate, ...rest } = dateRange.preparedPayload;
    const cap = todayIstYmd();
    const endClamped = minYmd(endDate, cap);
    return {
      ...rest,
      startDate,
      endDate: endClamped,
    };
  }, [dateRange.preparedPayload]);

  const latestRangeRef = useRef({ start: effectiveRange.startDate, end: effectiveRange.endDate });
  latestRangeRef.current = { start: effectiveRange.startDate, end: effectiveRange.endDate };

  const doFetch = useCallback(async (signal: AbortSignal) => {
    const { start, end } = latestRangeRef.current;
    setLoading(true);
    try {
      const res = await fetchDailySalesSummaryReport(start, end, signal);
      setData(res);
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      setData(null);
      toast.error((e as Error)?.message ?? 'Failed to load daily sales summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void doFetch(ac.signal);
    return () => ac.abort();
  }, [doFetch]);

  useEffect(() => {
    if (dateRange.generateRequestId === 0) return;
    const ac = new AbortController();
    void doFetch(ac.signal);
    return () => ac.abort();
  }, [dateRange.generateRequestId, doFetch]);

  useEffect(() => {
    if (refreshNonce === 0) return;
    const ac = new AbortController();
    void doFetch(ac.signal);
    return () => ac.abort();
  }, [refreshNonce, doFetch]);

  const printHeader = useMemo(() => {
    const addressParts = [trader?.address, trader?.city, trader?.state, trader?.pin_code].filter(Boolean);
    return {
      traderName: trader?.business_name?.trim() || user?.name?.trim() || 'Trader',
      apmcCode: (trader?.rmc_apmc_code ?? '').trim(),
      address: addressParts.join(', '),
    };
  }, [trader, user?.name]);

  const filenameBase = useMemo(() => {
    return `daily-sales-summary_${effectiveRange.startDate}_${effectiveRange.endDate}`;
  }, [effectiveRange.startDate, effectiveRange.endDate]);

  const empty = data != null && isReportEmpty(data);
  const loadFailed = !loading && data == null;

  return (
    <ReportDetailPageShell
      title="Daily Sales Summary"
      subtitle="One row per day (newest first). Range totals in table footer."
      icon={BarChart3}
      filterControls={
        <ReportDateRangeSelector
          state={dateRange}
          idPrefix="dss"
          onRefresh={() => setRefreshNonce((n) => n + 1)}
          refreshDisabled={loading}
        />
      }
      reportBody={
        <div className="merco-dss-report">
          <div className="space-y-3 dss-screen-wrap">
            <ReportActions
              report={data}
              printHeader={printHeader}
              filenameBase={filenameBase}
              disabled={loading}
            />

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full max-w-md ml-auto rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            ) : loadFailed ? (
              <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                Report could not be loaded. Adjust the range and use Generate Report.
              </div>
            ) : empty ? (
              <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                No billing or arrival activity for the selected range.
                <div className="mt-1 font-mono text-[11px] opacity-80">
                  {effectiveRange.startDate} … {effectiveRange.endDate}
                </div>
              </div>
            ) : (
              data && <DailySalesSummaryTable report={data} />
            )}
          </div>
        </div>
      }
    />
  );
};

export default DailySalesSummaryPage;
