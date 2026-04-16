import { formatBillingInr } from '@/utils/billingMoney';
import type { DailySalesSummaryDayRowDTO, DailySalesSummaryReportDTO, DailySalesSummaryTotalsDTO } from '@/services/api/reports';

export const DSS_TABLE_HEADERS = [
  'Date',
  'Bills',
  'Bags',
  'Gross Sale',
  'Commission',
  'User Fee',
  'Coolie',
  'Net Sales',
  'Collected',
  'Outstanding',
] as const;

export type DssTableHeader = (typeof DSS_TABLE_HEADERS)[number];

/** Short tooltip copy for traders (no jargon). */
export const DSS_COLUMN_HELP: Record<DssTableHeader, { source: string; calculation: string }> = {
  Date: {
    source: 'Billing and arrivals for that calendar day.',
    calculation: 'Newest day at the top.',
  },
  Bills: {
    source: 'Your sales bills.',
    calculation: 'How many bills were made that day.',
  },
  Bags: {
    source: 'Lots you received.',
    calculation: 'Total bags counted that day.',
  },
  'Gross Sale': {
    source: 'Bill totals before fees.',
    calculation: 'Sum of bill amounts for the day.',
  },
  Commission: {
    source: 'Commission on bills.',
    calculation: 'Total commission charged that day.',
  },
  'User Fee': {
    source: 'User fee on bills.',
    calculation: 'Total user fee charged that day.',
  },
  Coolie: {
    source: 'Coolie charges on bills.',
    calculation: 'Total coolie charged that day.',
  },
  'Net Sales': {
    source: 'After common bill charges.',
    calculation: 'Gross sale minus commission, user fee, and coolie.',
  },
  Collected: {
    source: 'Money already taken in.',
    calculation: 'Bill amount minus what is still pending.',
  },
  Outstanding: {
    source: 'Still to be collected.',
    calculation: 'Pending balance on bills for that day.',
  },
};

export function money(n: number): string {
  return `₹${formatBillingInr(Number(n) || 0)}`;
}

export function dayToRowCells(d: DailySalesSummaryDayRowDTO): string[] {
  return [
    d.date,
    String(d.totalBills ?? 0),
    String(d.totalBags ?? 0),
    money(d.grossSale),
    money(d.commission),
    money(d.userFee),
    money(d.coolie),
    money(d.netSales),
    money(d.totalCollected),
    money(d.outstanding),
  ];
}

export function totalsToRowCells(t: DailySalesSummaryTotalsDTO): string[] {
  return [
    'Total',
    String(t.totalBills ?? 0),
    String(t.totalBags ?? 0),
    money(t.grossSale),
    money(t.commission),
    money(t.userFee),
    money(t.coolie),
    money(t.netSales),
    money(t.totalCollected),
    money(t.outstanding),
  ];
}

export function reportToAoa(report: DailySalesSummaryReportDTO): (string | number)[][] {
  const rows: (string | number)[][] = [Array.from(DSS_TABLE_HEADERS)];
  const days = report.days ?? [];
  for (const d of days) {
    rows.push(dayToRowCells(d));
  }
  if (report.totals) {
    rows.push(totalsToRowCells(report.totals));
  }
  return rows;
}

export function isReportEmpty(report: DailySalesSummaryReportDTO): boolean {
  const t = report.totals;
  if (!t) return true;
  return (t.totalBills ?? 0) === 0 && (t.totalBags ?? 0) === 0;
}
