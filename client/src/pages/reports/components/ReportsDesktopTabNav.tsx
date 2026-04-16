import { NavLink } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REPORT_CARD_LIST, reportPath } from '@/pages/reports/reportRegistry';
import { reportsAccentTabActiveClassName, reportsAccentTabInactiveClassName } from '@/pages/reports/reportUiTokens';

export function ReportsDesktopTabNav() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary via-blue-500 to-violet-600 flex items-center justify-center shadow-md shadow-primary/20 border border-white/15 shrink-0">
          <BarChart3 className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight leading-tight">Reports</h1>
          <p className="text-[11px] text-muted-foreground leading-snug">Open a tab to switch report workspace</p>
        </div>
      </div>

      <nav className="glass-card rounded-lg p-0.5 flex flex-wrap gap-0.5 border border-border/40" aria-label="Report shortcuts">
        {REPORT_CARD_LIST.map((r) => {
          const to = reportPath(r.segment);
          return (
            <NavLink
              key={r.segment}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex-1 min-w-[120px] sm:min-w-0 touch-manipulation transition-shadow',
                  isActive ? reportsAccentTabActiveClassName : reportsAccentTabInactiveClassName,
                )
              }
            >
              {r.title}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
