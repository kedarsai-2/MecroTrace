import { SlidersHorizontal, TableProperties } from 'lucide-react';
import { cn } from '@/lib/utils';

type SectionProps = {
  className?: string;
};

/** Empty block styled like filter/settings areas elsewhere in the app */
export function ReportFiltersPlaceholder({ className }: SectionProps) {
  return (
    <section
      aria-label="Filters and settings"
      className={cn(
        'glass-card rounded-xl border border-border/40 p-3 sm:p-4 min-h-[100px] flex flex-col gap-1.5',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border/40 flex items-center justify-center">
          <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        Filters and settings
      </div>
      <p className="text-xs text-muted-foreground leading-snug">
        Date range, parties, and export options will be configured here.
      </p>
      <div className="flex-1 min-h-[40px] rounded-lg border border-dashed border-border/60 bg-muted/15 flex items-center justify-center">
        <span className="text-[11px] font-medium text-muted-foreground">No controls yet</span>
      </div>
    </section>
  );
}

/** Empty state for future table / chart output */
export function ReportContentPlaceholder({ className }: SectionProps) {
  return (
    <section
      aria-label="Report results"
      className={cn(
        'glass-card rounded-xl border border-border/40 p-3 sm:p-4 min-h-[160px] flex flex-col gap-2',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border/40 flex items-center justify-center">
          <TableProperties className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        Report output
      </div>
      <div className="flex-1 rounded-lg border border-dashed border-border/60 bg-muted/10 flex flex-col items-center justify-center gap-1.5 py-6 px-3 text-center">
        <p className="text-sm font-medium text-foreground">No data loaded</p>
        <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed">
          Table or charts for this report will render here after filters are applied.
        </p>
      </div>
    </section>
  );
}
