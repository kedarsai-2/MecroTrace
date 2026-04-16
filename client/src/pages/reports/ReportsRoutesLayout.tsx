import { Outlet } from 'react-router-dom';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { useDesktopMode } from '@/hooks/use-desktop';
import { ReportsDesktopTabNav } from '@/pages/reports/components/ReportsDesktopTabNav';

/**
 * Wraps all `/reports` routes. Desktop: tab strip + outlet. Mobile/tablet: outlet only (card hub on index).
 */
const ReportsRoutesLayout = () => {
  const { canAccessModule } = usePermissions();
  const isDesktop = useDesktopMode();

  if (!canAccessModule('Reports')) {
    return <ForbiddenPage moduleName="Reports" />;
  }

  return (
    <div className="min-h-0 flex flex-col bg-background w-full min-w-0">
      {isDesktop ? (
        <header className="shrink-0 border-b border-border/40 bg-background/90 backdrop-blur-md z-10 px-4 sm:px-6 lg:px-8 pt-4 pb-3">
          <ReportsDesktopTabNav />
        </header>
      ) : null}
      <div className="flex-1 min-h-0 min-w-0 w-full">
        <Outlet />
      </div>
    </div>
  );
};

export default ReportsRoutesLayout;
