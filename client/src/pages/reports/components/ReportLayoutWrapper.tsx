import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ReportLayoutWrapperProps = {
  children: ReactNode;
  className?: string;
};

/** Fluid width: horizontal padding aligned with trader main content (no max-width cap). */
export function ReportLayoutWrapper({ children, className }: ReportLayoutWrapperProps) {
  return (
    <div className={cn('w-full min-w-0 px-4 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  );
}
