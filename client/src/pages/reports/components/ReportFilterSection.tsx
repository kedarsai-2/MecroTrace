import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

type ReportFilterSectionProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Tighter card + optional hide description on large screens. */
  density?: 'default' | 'compact';
};

export function ReportFilterSection({
  title = 'Filters',
  description = 'Adjust parameters before generating the report.',
  children,
  className,
  density = 'default',
}: ReportFilterSectionProps) {
  const compact = density === 'compact';

  return (
    <section
      aria-label={title}
      className={cn(
        'glass-card rounded-lg border border-border/40 flex flex-col',
        compact ? 'p-2 sm:p-2.5 gap-1.5' : 'p-3 sm:p-4 gap-2',
        className,
      )}
    >
      <div className={cn('flex items-start gap-2', compact && 'items-center')}>
        <div
          className={cn(
            'rounded-lg bg-muted/50 border border-border/40 flex items-center justify-center shrink-0',
            compact ? 'w-7 h-7' : 'w-8 h-8',
          )}
        >
          <SlidersHorizontal className={cn('text-muted-foreground', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className={cn('font-semibold text-foreground leading-none', compact ? 'text-xs sm:text-sm' : 'text-sm')}>
            {title}
          </h2>
          <p
            className={cn(
              'text-muted-foreground leading-snug',
              compact ? 'text-[10px] sm:text-[11px] mt-0.5 lg:hidden' : 'text-[11px] mt-1',
            )}
          >
            {description}
          </p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
