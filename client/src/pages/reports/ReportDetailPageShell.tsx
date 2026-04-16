import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { ReportContentPlaceholder } from './ReportDetailSections';
import { ReportLayoutWrapper } from './components/ReportLayoutWrapper';
import { ReportsHeroHeader } from './components/ReportsHeroHeader';

type ReportDetailPageShellProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  filterControls: ReactNode;
  reportBody?: ReactNode;
};

/**
 * Mobile / tablet: gradient hero + body. Desktop: no hero and no duplicate title row (tabs show context).
 */
export function ReportDetailPageShell({
  title,
  subtitle,
  icon: Icon,
  filterControls,
  reportBody,
}: ReportDetailPageShellProps) {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {!isDesktop ? (
        <ReportsHeroHeader
          title={title}
          subtitle={subtitle}
          icon={Icon}
          onBack={() => navigate('/reports')}
          backAriaLabel="Back to reports"
        />
      ) : null}

      <ReportLayoutWrapper className={cn(!isDesktop ? 'pt-2 space-y-3' : 'pt-3 lg:pt-4 space-y-3')}>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          {filterControls}
          {reportBody ?? <ReportContentPlaceholder />}
        </motion.div>
      </ReportLayoutWrapper>

      <BottomNav />
    </div>
  );
}
