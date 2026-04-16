import type { LucideIcon } from 'lucide-react';
import { BarChart3, Shield, Truck } from 'lucide-react';

/** URL segment under `/reports/` — add new reports here and register route in App.tsx */
export type ReportSegment = 'daily-sales-summary' | 'user-fees-report' | 'arrivals-report';

export type ReportCardMeta = {
  segment: ReportSegment;
  title: string;
  shortDescription: string;
  icon: LucideIcon;
  gradient: string;
  glow: string;
};

const base = '/reports';

export const REPORT_CARD_LIST: ReportCardMeta[] = [
  {
    segment: 'daily-sales-summary',
    title: 'Daily Sales Summary',
    shortDescription: 'Bills, bags, revenue, commission, and collections for a date range.',
    icon: BarChart3,
    gradient: 'from-blue-500 to-cyan-600',
    glow: 'shadow-blue-500/20',
  },
  {
    segment: 'user-fees-report',
    title: 'User Fees Report',
    shortDescription: 'Market fee and user-fee compliance view (placeholder).',
    icon: Shield,
    gradient: 'from-violet-500 to-purple-600',
    glow: 'shadow-violet-500/20',
  },
  {
    segment: 'arrivals-report',
    title: 'Arrivals Report',
    shortDescription: 'Farmer arrivals, freight, and advance details (placeholder).',
    icon: Truck,
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/20',
  },
];

export function reportPath(segment: ReportSegment): string {
  return `${base}/${segment}`;
}

export function reportHref(meta: ReportCardMeta): string {
  return reportPath(meta.segment);
}
