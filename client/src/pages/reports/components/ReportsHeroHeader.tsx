import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReportsHeroHeaderProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** When set, shows circular back control (Billing / Arrivals pattern). */
  onBack?: () => void;
  backAriaLabel?: string;
  children?: ReactNode;
  className?: string;
};

/**
 * Hero strip aligned with Billing / Arrivals / Auctions (`hero-gradient` + radial highlight).
 */
export function ReportsHeroHeader({
  title,
  subtitle,
  icon: Icon,
  onBack,
  backAriaLabel = 'Go back',
  children,
  className,
}: ReportsHeroHeaderProps) {
  return (
    <header
      className={cn(
        'hero-gradient pt-[max(0.75rem,env(safe-area-inset-top))] pb-3.5 sm:pb-4 px-4 sm:px-6 lg:px-8 rounded-b-[2rem] relative overflow-hidden mb-2 sm:mb-3',
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)] pointer-events-none" />
      <div className="relative z-10 space-y-2.5">
        <div className="flex items-start gap-2 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backAriaLabel}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shrink-0 mt-0.5 touch-manipulation"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          ) : null}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center border border-white/15 shrink-0">
              <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 py-0.5">
              <h1 className="text-base sm:text-lg font-bold text-white leading-tight">{title}</h1>
              <p className="text-white/75 text-[11px] sm:text-xs mt-0.5 leading-snug">{subtitle}</p>
            </div>
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
