import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, ChevronRight, Search, Sparkles } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { REPORT_CARD_LIST, reportHref, reportPath, type ReportCardMeta } from '@/pages/reports/reportRegistry';
import { ReportsHeroHeader } from '@/pages/reports/components/ReportsHeroHeader';

/** Desktop: index `/reports` is not used — tabs + default report route only. */
const DESKTOP_REPORTS_DEFAULT = reportPath('daily-sales-summary');

const ReportsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const [query, setQuery] = useState('');

  if (isDesktop) {
    return <Navigate to={DESKTOP_REPORTS_DEFAULT} replace />;
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REPORT_CARD_LIST;
    return REPORT_CARD_LIST.filter(
      (r: ReportCardMeta) =>
        r.title.toLowerCase().includes(q) || r.shortDescription.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6 w-full min-w-0">
      <ReportsHeroHeader
        title="Reports"
        subtitle="Pick a report to set filters and view output"
        icon={BarChart3}
        onBack={() => navigate('/home')}
        backAriaLabel="Back to dashboard"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
          <input
            aria-label="Search reports"
            placeholder="Search reports…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30 touch-manipulation"
          />
        </div>
      </ReportsHeroHeader>

      <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-4 space-y-3 w-full min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>Same reports are available as tabs on large screens.</span>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map((card, i) => (
            <motion.button
              key={card.segment}
              type="button"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 240 }}
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => navigate(reportHref(card))}
              className="glass-card rounded-xl p-4 text-left hover:shadow-lg transition-all border border-border/40 group relative overflow-hidden min-h-[120px] touch-manipulation"
            >
              <div
                className={cn(
                  'absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-15 bg-gradient-to-br group-hover:opacity-25 transition-opacity',
                  card.gradient,
                )}
              />
              <div className="relative z-10">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-md mb-3 border border-white/20',
                    card.gradient,
                    card.glow,
                  )}
                >
                  <card.icon className="w-5 h-5 text-white" />
                </div>
                <h2 className="font-bold text-foreground mb-0.5 text-sm leading-snug">{card.title}</h2>
                <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed line-clamp-2">{card.shortDescription}</p>
                <div className="flex items-center gap-1 text-[11px] text-primary font-semibold group-hover:gap-1.5 transition-all">
                  Open <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No reports match your search.</p>
        ) : null}
      </div>

      <BottomNav />
    </div>
  );
};

export default ReportsPage;
