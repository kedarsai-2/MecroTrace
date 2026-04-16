import { Shield } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ReportDateRangeSelector } from '@/pages/reports/components/ReportDateRangeSelector';
import { useReportDateRangeState } from '@/pages/reports/hooks/useReportDateRangeState';
import { ReportDetailPageShell } from './ReportDetailPageShell';
import { BillPrefixCombobox } from '@/pages/reports/userFees/components/BillPrefixCombobox';
import { UserFeesBuyerTable } from '@/pages/reports/userFees/components/UserFeesBuyerTable';
import { UserFeesDayTable } from '@/pages/reports/userFees/components/UserFeesDayTable';
import { UserFeesReportActions } from '@/pages/reports/userFees/components/UserFeesReportActions';
import { fetchUserFeesDayDetail, fetchUserFeesReport } from '@/pages/reports/userFees/userFeesReportService';
import { isUserFeesReportEmpty } from '@/pages/reports/userFees/userFeesFormat';
import { commodityApi, printSettingsApi } from '@/services/api';
import type { UserFeesDayDetailDTO, UserFeesReportDTO } from '@/services/api/reports';
import { minYmd, todayIstYmd } from '@/utils/reportIstDates';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const UserFeesReportPage = () => {
  const dateRange = useReportDateRangeState();
  const { trader, user } = useAuth();
  const [billPrefix, setBillPrefix] = useState('');
  const [prefixOptions, setPrefixOptions] = useState<string[]>([]);
  const [data, setData] = useState<UserFeesReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserFeesDayDetailDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [billingIncludeHeader, setBillingIncludeHeader] = useState(true);

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

  const userFeesDocumentOptions = useMemo(
    () => ({
      includeHeader: billingIncludeHeader,
    }),
    [billingIncludeHeader],
  );

  useEffect(() => {
    const loadPrintSetting = async () => {
      try {
        const list = await printSettingsApi.list();
        const gstRow = list.find((item) => item.module_key === 'BILLING');
        if (gstRow) {
          setBillingIncludeHeader(gstRow.include_header !== false);
        }
      } catch {
        /* keep defaults */
      }
    };
    void loadPrintSetting();
  }, []);

  const printHeader = useMemo(() => {
    const addressParts = [trader?.address, trader?.city, trader?.state, trader?.pin_code].filter(Boolean);
    return {
      traderName: trader?.business_name?.trim() || user?.name?.trim() || 'Trader',
      apmcCode: (trader?.rmc_apmc_code ?? '').trim(),
      address: addressParts.join(', '),
      mobile: (trader?.mobile ?? '').trim(),
    };
  }, [trader, user?.name]);

  const latestParamsRef = useRef({
    start: effectiveRange.startDate,
    end: effectiveRange.endDate,
    prefix: billPrefix,
  });
  latestParamsRef.current = {
    start: effectiveRange.startDate,
    end: effectiveRange.endDate,
    prefix: billPrefix,
  };

  useEffect(() => {
    void commodityApi
      .getAllFullConfigs()
      .then((cfgs) => {
        const set = new Set<string>();
        for (const c of cfgs) {
          const p = c.config?.billPrefix?.trim().toUpperCase();
          if (p) set.add(p);
        }
        setPrefixOptions([...set].sort());
      })
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  const doFetchSummary = useCallback(async (signal: AbortSignal) => {
    const { start, end, prefix } = latestParamsRef.current;
    setLoading(true);
    try {
      const res = await fetchUserFeesReport(start, end, prefix, signal);
      setData(res);
      setSummaryVersion((v) => v + 1);
      setSelectedDate((prev) => {
        if (!prev) return null;
        return res.days.some((d) => d.date === prev) ? prev : null;
      });
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      setData(null);
      toast.error((e as Error)?.message ?? 'Failed to load user fees report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void doFetchSummary(ac.signal);
    return () => ac.abort();
  }, [doFetchSummary]);

  useEffect(() => {
    if (dateRange.generateRequestId === 0) return;
    const ac = new AbortController();
    void doFetchSummary(ac.signal);
    return () => ac.abort();
  }, [dateRange.generateRequestId, doFetchSummary]);

  useEffect(() => {
    if (refreshNonce === 0) return;
    const ac = new AbortController();
    void doFetchSummary(ac.signal);
    return () => ac.abort();
  }, [refreshNonce, doFetchSummary]);

  const appliedPrefixForDetail = data?.billPrefixApplied ?? '';

  useEffect(() => {
    if (!selectedDate) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    const ac = new AbortController();
    setDetailLoading(true);
    void fetchUserFeesDayDetail(selectedDate, appliedPrefixForDetail, ac.signal)
      .then((d) => {
        setDetail(d);
      })
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setDetail(null);
        toast.error((e as Error)?.message ?? 'Failed to load buyer details');
      })
      .finally(() => {
        if (!ac.signal.aborted) setDetailLoading(false);
      });
    return () => ac.abort();
  }, [selectedDate, appliedPrefixForDetail, summaryVersion]);

  const empty = data != null && isUserFeesReportEmpty(data);
  const loadFailed = !loading && data == null;

  const onSelectDay = useCallback((date: string) => {
    setSelectedDate((prev) => (prev === date ? null : date));
  }, []);

  return (
    <ReportDetailPageShell
      title="User Fees Report"
      subtitle="Per-day billed bags, sales, user charges, and weighman charges."
      icon={Shield}
      filterControls={
        <ReportDateRangeSelector
          state={dateRange}
          idPrefix="ufees"
          beforeGenerateActions={
            <BillPrefixCombobox
              idPrefix="ufees-prefix"
              prefixes={prefixOptions}
              value={billPrefix}
              onChange={setBillPrefix}
              disabled={loading}
            />
          }
          onRefresh={() => setRefreshNonce((n) => n + 1)}
          refreshDisabled={loading}
        />
      }
      reportBody={
        <div className="merco-ufees-report space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full max-w-md ml-auto rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : loadFailed ? (
            <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Report could not be loaded. Adjust the range and use Generate Report.
            </div>
          ) : empty ? (
            <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No billing activity for the selected range and filters.
              <div className="mt-1 font-mono text-[11px] opacity-80">
                {effectiveRange.startDate} … {effectiveRange.endDate}
                {appliedPrefixForDetail ? ` · prefix ${appliedPrefixForDetail}` : ''}
              </div>
            </div>
          ) : data ? (
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
              <UserFeesReportActions
                className="lg:col-span-2"
                report={data}
                printHeader={printHeader}
                documentOptions={userFeesDocumentOptions}
                disabled={loading}
              />
              <UserFeesDayTable
                days={data.days}
                totals={data.totals}
                selectedDate={selectedDate}
                onSelectDay={onSelectDay}
                periodStart={data.periodStart}
                periodEnd={data.periodEnd}
              />
              <UserFeesBuyerTable
                selectedDate={selectedDate}
                bills={detail?.bills ?? []}
                totals={detail?.totals ?? null}
                loading={detailLoading}
              />
            </div>
          ) : null}
        </div>
      }
    />
  );
};

export default UserFeesReportPage;
