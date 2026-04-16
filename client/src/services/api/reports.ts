import { apiFetch } from './http';
import type {
  TrialBalanceRow,
  PLRow,
  BalanceSheetRow,
  AgingBucket,
  CommodityProfitRow,
} from '@/types/accounting';

export interface TrialBalanceRowDTO {
  ledgerId: string;
  ledgerName: string;
  accountingClass: string;
  debit: number;
  credit: number;
}

export interface PLRowDTO {
  category: 'INCOME' | 'EXPENSE';
  ledgerName: string;
  amount: number;
}

export interface BalanceSheetRowDTO {
  category: 'ASSET' | 'LIABILITY' | 'EQUITY';
  ledgerName: string;
  amount: number;
}

export interface AgingBucketDTO {
  contactName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

export interface CommodityProfitRowDTO {
  commodityName: string;
  income: number;
  expenses: number;
  profit: number;
}

/** One calendar day (YYYY-MM-DD), newest first in `days`. */
export interface DailySalesSummaryDayRowDTO {
  date: string;
  totalBills: number;
  totalBags: number;
  grossSale: number;
  commission: number;
  userFee: number;
  coolie: number;
  netSales: number;
  totalCollected: number;
  outstanding: number;
}

export interface DailySalesSummaryTotalsDTO {
  totalBills: number;
  totalBags: number;
  grossSale: number;
  commission: number;
  userFee: number;
  coolie: number;
  netSales: number;
  totalCollected: number;
  outstanding: number;
}

export interface DailySalesSummaryReportDTO {
  periodStart?: string;
  periodEnd?: string;
  days: DailySalesSummaryDayRowDTO[];
  totals: DailySalesSummaryTotalsDTO;
}

export interface UserFeesDayRowDTO {
  date: string;
  totalBags: number;
  totalSales: number;
  userCharges: number;
  weighmanCharge: number;
}

export interface UserFeesTotalsDTO {
  totalBags: number;
  totalSales: number;
  userCharges: number;
  weighmanCharge: number;
}

export interface UserFeesReportDTO {
  periodStart?: string;
  periodEnd?: string;
  billPrefixApplied?: string;
  days: UserFeesDayRowDTO[];
  totals: UserFeesTotalsDTO;
}

export interface UserFeesBillRowDTO {
  buyerName: string;
  billNumber: string;
  totalBags: number;
  totalSales: number;
  userCharges: number;
  weighmanCharge: number;
}

export interface UserFeesDayDetailDTO {
  date: string;
  billPrefixApplied?: string;
  bills: UserFeesBillRowDTO[];
  totals: UserFeesTotalsDTO;
}

export interface PartyExposureRowDTO {
  party: string;
  totalSale: number;
  totalCollected: number;
  outstanding: number;
  oldestDue: string;
  riskLevel: string;
}

export interface AdminDailySummaryDTO {
  totalArrivals: number;
  totalLots: number;
  totalAuctions: number;
  totalBills: number;
  totalRevenue: number;
  totalCollected: number;
  totalPending: number;
}

function handleError(defaultMessage: string) {
  return async (res: Response) => {
    if (res.ok) return res;
    let message = defaultMessage;
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const problem = (await res.json()) as { detail?: string; message?: string; title?: string };
        if (problem.detail && problem.detail.trim()) message = problem.detail;
        else if (problem.message && problem.message.trim()) message = problem.message;
        else if (problem.title && problem.title.trim()) message = problem.title;
      } else {
        const text = await res.text();
        if (text && text.length < 200) message = text;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  };
}

const errTrialBalance = handleError('Failed to load trial balance');
const errPL = handleError('Failed to load profit & loss');
const errBS = handleError('Failed to load balance sheet');
const errAging = handleError('Failed to load aging report');
const errCommodity = handleError('Failed to load commodity profitability');
const errDailySales = handleError('Failed to load daily sales summary');
const errPartyExposure = handleError('Failed to load party exposure');
const errAdminSummary = handleError('Failed to load admin reports summary');
const errUserFees = handleError('Failed to load user fees report');
const errUserFeesDay = handleError('Failed to load user fees day detail');

export const reportsApi = {
  async getTrialBalance(dateFrom: string, dateTo: string): Promise<TrialBalanceRow[]> {
    const q = new URLSearchParams({ dateFrom, dateTo });
    const res = await apiFetch(`/reports/trial-balance?${q.toString()}`, { method: 'GET' }).then(errTrialBalance);
    const data = (await res.json()) as TrialBalanceRowDTO[];
    return data.map((d) => ({
      ledger_id: d.ledgerId,
      ledger_name: d.ledgerName,
      accounting_class: d.accountingClass as TrialBalanceRow['accounting_class'],
      debit: Number(d.debit),
      credit: Number(d.credit),
    }));
  },

  async getProfitAndLoss(): Promise<PLRow[]> {
    const res = await apiFetch('/reports/profit-loss', { method: 'GET' }).then(errPL);
    const data = (await res.json()) as PLRowDTO[];
    return data.map((d) => ({
      category: d.category,
      ledger_name: d.ledgerName,
      amount: Number(d.amount),
    }));
  },

  async getBalanceSheet(): Promise<BalanceSheetRow[]> {
    const res = await apiFetch('/reports/balance-sheet', { method: 'GET' }).then(errBS);
    const data = (await res.json()) as BalanceSheetRowDTO[];
    return data.map((d) => ({
      category: d.category,
      ledger_name: d.ledgerName,
      amount: Number(d.amount),
    }));
  },

  async getAging(type: 'AR' | 'AP'): Promise<AgingBucket[]> {
    const q = new URLSearchParams({ type });
    const res = await apiFetch(`/reports/aging?${q.toString()}`, { method: 'GET' }).then(errAging);
    const data = (await res.json()) as AgingBucketDTO[];
    return data.map((d) => ({
      contact_name: d.contactName,
      current: Number(d.current),
      days_30: Number(d.days30),
      days_60: Number(d.days60),
      days_90: Number(d.days90),
      over_90: Number(d.over90),
      total: Number(d.total),
    }));
  },

  async getCommodityProfit(dateFrom: string, dateTo: string): Promise<CommodityProfitRow[]> {
    const q = new URLSearchParams({ dateFrom, dateTo });
    const res = await apiFetch(`/reports/commodity-profit?${q.toString()}`, { method: 'GET' }).then(errCommodity);
    const data = (await res.json()) as CommodityProfitRowDTO[];
    return data.map((d) => ({
      commodity_name: d.commodityName,
      income: Number(d.income),
      expenses: Number(d.expenses),
      profit: Number(d.profit),
    }));
  },

  async getDailySalesSummaryReport(
    dateFrom: string,
    dateTo: string,
    signal?: AbortSignal
  ): Promise<DailySalesSummaryReportDTO> {
    const q = new URLSearchParams({ dateFrom, dateTo });
    const res = await apiFetch(`/reports/daily-sales-summary?${q.toString()}`, { method: 'GET', signal }).then(errDailySales);
    return (await res.json()) as DailySalesSummaryReportDTO;
  },

  async getPartyExposure(dateFrom: string, dateTo: string): Promise<PartyExposureRowDTO[]> {
    const q = new URLSearchParams({ dateFrom, dateTo });
    const res = await apiFetch(`/reports/party-exposure?${q.toString()}`, { method: 'GET' }).then(errPartyExposure);
    return (await res.json()) as PartyExposureRowDTO[];
  },

  async getAdminDailySummary(dateFrom: string, dateTo: string): Promise<AdminDailySummaryDTO> {
    const q = new URLSearchParams({ dateFrom, dateTo });
    const res = await apiFetch(`/admin/reports/daily-summary?${q.toString()}`, { method: 'GET' }).then(errAdminSummary);
    return (await res.json()) as AdminDailySummaryDTO;
  },

  async getUserFeesReport(
    dateFrom: string,
    dateTo: string,
    billPrefix?: string | null,
    signal?: AbortSignal
  ): Promise<UserFeesReportDTO> {
    const q = new URLSearchParams({ dateFrom, dateTo });
    const p = billPrefix?.trim();
    if (p) {
      q.set('billPrefix', p);
    }
    const res = await apiFetch(`/reports/user-fees?${q.toString()}`, { method: 'GET', signal }).then(errUserFees);
    return (await res.json()) as UserFeesReportDTO;
  },

  async getUserFeesDayDetail(
    date: string,
    billPrefix?: string | null,
    signal?: AbortSignal
  ): Promise<UserFeesDayDetailDTO> {
    const q = new URLSearchParams({ date });
    const p = billPrefix?.trim();
    if (p) {
      q.set('billPrefix', p);
    }
    const res = await apiFetch(`/reports/user-fees/day?${q.toString()}`, { method: 'GET', signal }).then(errUserFeesDay);
    return (await res.json()) as UserFeesDayDetailDTO;
  },
};

