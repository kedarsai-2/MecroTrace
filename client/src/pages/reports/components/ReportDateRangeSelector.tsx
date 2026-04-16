import { useId, type ReactNode } from 'react';
import { Redo2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ReportDateRangeStateApi } from '@/pages/reports/hooks/useReportDateRangeState';
import { REPORT_WEEK_PRESETS, coerceReportWeekOffset } from '@/pages/reports/utils/weekRange';
import { reportsAccentIconButtonClassName, reportsAccentPrimaryButtonClassName } from '@/pages/reports/reportUiTokens';
import { ReportDateModeRadioGroup } from './ReportDateModeRadioGroup';
import { ReportFilterSection } from './ReportFilterSection';
import { ReportCustomDateRangePicker } from './ReportCustomDateRangePicker';

type ReportDateRangeSelectorProps = {
  state: ReportDateRangeStateApi;
  idPrefix?: string;
  /** Rendered after week/custom control and before Generate Report. */
  beforeGenerateActions?: ReactNode;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
};

export function ReportDateRangeSelector({
  state,
  idPrefix,
  beforeGenerateActions,
  onRefresh,
  refreshDisabled,
}: ReportDateRangeSelectorProps) {
  const reactId = useId();
  const base = idPrefix ?? `rdr-${reactId}`;

  const canGenerate = state.mode === 'by_week' || state.isValid;

  return (
    <ReportFilterSection
      title="Date range"
      description="Week presets or custom range."
      density="compact"
    >
      {/* Mobile / tablet: ≤3 content rows (radios | control | generate) + compact footer */}
      <div className="flex flex-col gap-2 min-w-0 lg:flex-row lg:flex-nowrap lg:items-center lg:gap-2">
        <ReportDateModeRadioGroup
          value={state.mode}
          onValueChange={state.setMode}
          idPrefix={`${base}-mode`}
          layout="inline"
          className="lg:max-w-[280px]"
        />

        <div className="min-w-0 flex-1 w-full lg:flex-1 lg:min-w-0">
          {state.mode === 'by_week' ? (
            <Select
              value={String(state.weekOffset)}
              onValueChange={(v) => state.setWeekOffset(coerceReportWeekOffset(Number(v)))}
            >
              <SelectTrigger
                id={`${base}-week-select`}
                className="h-10 lg:h-9 w-full text-sm touch-manipulation lg:max-w-none"
              >
                <SelectValue placeholder="Current Week" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_WEEK_PRESETS.map((p) => (
                  <SelectItem key={p.offset} value={String(p.offset)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ReportCustomDateRangePicker
              id={`${base}-custom-range`}
              start={state.customStart}
              end={state.customEnd}
              onStartChange={state.setCustomStart}
              onEndChange={state.setCustomEnd}
            />
          )}
          {state.mode === 'custom_date' && state.validationError ? (
            <p role="alert" className="text-[11px] font-medium text-destructive leading-tight mt-1 lg:mt-0.5">
              {state.validationError}
            </p>
          ) : null}
        </div>

        {beforeGenerateActions ? (
          <div className="min-w-0 w-full lg:w-auto lg:max-w-[220px] shrink-0">{beforeGenerateActions}</div>
        ) : null}

        <button
          type="button"
          disabled={!canGenerate}
          onClick={() => state.requestGenerate()}
          className={reportsAccentPrimaryButtonClassName(!canGenerate)}
        >
          Generate Report
        </button>
        {onRefresh ? (
          <button
            type="button"
            disabled={refreshDisabled}
            onClick={() => onRefresh()}
            title="Reload report for this range"
            aria-label="Reload report for this range"
            className={reportsAccentIconButtonClassName(!!refreshDisabled)}
          >
            <Redo2 className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 pt-1.5 mt-1 border-t border-border/25">
        <p
          className="text-[10px] text-muted-foreground font-mono truncate"
          title={JSON.stringify(state.preparedPayload)}
        >
          {state.preparedPayload.startDate} … {state.preparedPayload.endDate}
        </p>
      </div>
    </ReportFilterSection>
  );
}
