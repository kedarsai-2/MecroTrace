import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { ReportDateFilterMode } from '@/pages/reports/hooks/useReportDateRangeState';

type ReportDateModeRadioGroupProps = {
  value: ReportDateFilterMode;
  onValueChange: (v: ReportDateFilterMode) => void;
  idPrefix?: string;
  disabled?: boolean;
  /** `inline`: one row (mobile/desktop toolbar). `stack`: vertical list. */
  layout?: 'inline' | 'stack';
  className?: string;
};

export function ReportDateModeRadioGroup({
  value,
  onValueChange,
  idPrefix,
  disabled,
  layout = 'inline',
  className,
}: ReportDateModeRadioGroupProps) {
  const reactId = useId();
  const base = idPrefix ?? `rdm-${reactId}`;

  const itemClass = (active: boolean) =>
    cn(
      'flex items-center gap-2 cursor-pointer transition-colors border rounded-md',
      layout === 'inline' ? 'flex-1 min-h-11 sm:min-h-10 px-2.5 py-2 justify-center' : 'min-h-10 px-2.5 py-2',
      active ? 'border-primary/45 bg-primary/8' : 'border-border/50 bg-muted/20 hover:bg-muted/35',
      disabled && 'pointer-events-none opacity-50',
    );

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onValueChange(v as ReportDateFilterMode)}
      disabled={disabled}
      className={cn(layout === 'inline' ? 'flex flex-row gap-2 w-full lg:w-auto lg:shrink-0' : 'grid gap-1.5 w-full', className)}
      aria-label="Date range mode"
    >
      <label htmlFor={`${base}-week`} className={itemClass(value === 'by_week')}>
        <RadioGroupItem value="by_week" id={`${base}-week`} className="shrink-0" />
        <Label htmlFor={`${base}-week`} className="cursor-pointer font-medium text-sm leading-none whitespace-nowrap">
          By Week
        </Label>
      </label>
      <label htmlFor={`${base}-custom`} className={itemClass(value === 'custom_date')}>
        <RadioGroupItem value="custom_date" id={`${base}-custom`} className="shrink-0" />
        <Label htmlFor={`${base}-custom`} className="cursor-pointer font-medium text-sm leading-none whitespace-nowrap">
          Custom Date
        </Label>
      </label>
    </RadioGroup>
  );
}
