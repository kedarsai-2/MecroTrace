import { fetchUserFeesDayDetail } from '@/pages/reports/userFees/userFeesReportService';
import { utcWeekdayLong, utcWeekdayShort, ymdToDdMmYyyy } from '@/pages/reports/userFees/userFeesFormat';
import type { UserFeesDayDetailDTO, UserFeesReportDTO } from '@/services/api/reports';
import { printLogApi } from '@/services/api';
import { formatBillingInr } from '@/utils/billingMoney';
import { inrAmountToWords } from '@/utils/moneyToWords';
import { directPrint } from '@/utils/printTemplates';
import {
  generateUserFeesChargesReportPrintHTML,
  type UserFeesChargesReportBuyerRowStrings,
  type UserFeesChargesReportDayPrintSection,
  type UserFeesChargesReportPrintData,
  type UserFeesChargesReportPrintHeader,
  type UserFeesPrintDocumentOptions,
} from '@/pages/reports/userFees/userFeesChargesReportPrintHtml';

export type UserFeesPaymentMode = 'CASH' | 'UPI' | 'CHEQUE' | 'NEFT_RTGS';

export type UserFeesPrintPaymentInput = {
  mode: UserFeesPaymentMode;
  /** Required when mode is not CASH (UPI id / cheque no / NEFT ref). */
  referenceDetail?: string;
  /** `YYYY-MM-DD` */
  paymentDateYmd: string;
};

export type { UserFeesPrintDocumentOptions };

function inrCell(n: number): string {
  return `₹ ${formatBillingInr(Number(n) || 0)}`;
}

async function fetchDayDetailsBatched(
  dates: string[],
  billPrefix: string,
  concurrency: number,
): Promise<Map<string, UserFeesDayDetailDTO>> {
  const map = new Map<string, UserFeesDayDetailDTO>();
  for (let i = 0; i < dates.length; i += concurrency) {
    const chunk = dates.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (date) => {
        const d = await fetchUserFeesDayDetail(date, billPrefix);
        return { date, d };
      }),
    );
    for (const { date, d } of results) {
      map.set(date, d);
    }
  }
  return map;
}

function modeLabel(mode: UserFeesPaymentMode): string {
  if (mode === 'NEFT_RTGS') return 'NEFT/RTGS';
  return mode;
}

function paymentReferenceLine(mode: UserFeesPaymentMode, referenceDetail?: string): string | undefined {
  const t = (referenceDetail ?? '').trim();
  if (!t) return undefined;
  if (mode === 'UPI') return `UPI details : ${t}`;
  if (mode === 'CHEQUE') return `Cheque details : ${t}`;
  if (mode === 'NEFT_RTGS') return `NEFT/RTGS details : ${t}`;
  return undefined;
}

function buildPrintData(
  report: UserFeesReportDTO,
  detailByDate: Map<string, UserFeesDayDetailDTO>,
  header: UserFeesChargesReportPrintHeader,
  payment: UserFeesPrintPaymentInput,
): UserFeesChargesReportPrintData {
  const ps = report.periodStart ?? '';
  const pe = report.periodEnd ?? '';
  const periodStartDisplay = ps ? ymdToDdMmYyyy(ps) : '—';
  const periodEndDisplay = pe ? ymdToDdMmYyyy(pe) : '—';

  const totals = report.totals;
  const summaryRows = (report.days ?? []).map((d) => ({
    dateDisplay: ymdToDdMmYyyy(d.date),
    dayShort: utcWeekdayShort(d.date),
    totalBags: String(Number(d.totalBags) || 0),
    totalSales: inrCell(Number(d.totalSales) || 0),
    userCharges: inrCell(Number(d.userCharges) || 0),
    weighmanCharge: inrCell(Number(d.weighmanCharge) || 0),
  }));

  const summaryTotals = {
    totalBags: String(Number(totals?.totalBags) || 0),
    totalSales: inrCell(Number(totals?.totalSales) || 0),
    userCharges: inrCell(Number(totals?.userCharges) || 0),
    weighmanCharge: inrCell(Number(totals?.weighmanCharge) || 0),
  };

  const ucAmt = Number(totals?.userCharges) || 0;
  const paymentDateDisplay = ymdToDdMmYyyy(payment.paymentDateYmd);

  const paymentBlock = {
    modeLabel: modeLabel(payment.mode),
    referenceLine: paymentReferenceLine(payment.mode, payment.referenceDetail),
    userChargesInr: inrCell(ucAmt),
    rupeesWordsUpper: inrAmountToWords(ucAmt).toUpperCase(),
    dateDisplay: paymentDateDisplay,
  };

  const daySections: UserFeesChargesReportDayPrintSection[] = (report.days ?? []).map((row) => {
    const detail = detailByDate.get(row.date);
    const bills = detail?.bills ?? [];
    const t = detail?.totals ?? {
      totalBags: 0,
      totalSales: 0,
      userCharges: 0,
      weighmanCharge: 0,
    };
    const buyerRows: UserFeesChargesReportBuyerRowStrings[] = bills.map((b) => ({
      buyerName: (b.buyerName || '—').trim() || '—',
      billNo: (b.billNumber || '—').trim() || '—',
      totalBags: String(Number(b.totalBags) || 0),
      totalSales: inrCell(Number(b.totalSales) || 0),
      userCharges: inrCell(Number(b.userCharges) || 0),
      weighmanCharge: inrCell(Number(b.weighmanCharge) || 0),
    }));
    return {
      dateYmd: row.date,
      dateDisplay: ymdToDdMmYyyy(row.date),
      weekdayLong: utcWeekdayLong(row.date),
      buyerRows,
      totals: {
        totalBags: String(Number(t.totalBags) || 0),
        totalSales: inrCell(Number(t.totalSales) || 0),
        userCharges: inrCell(Number(t.userCharges) || 0),
        weighmanCharge: inrCell(Number(t.weighmanCharge) || 0),
      },
      emptyMessage: buyerRows.length === 0 ? 'No bills for this day.' : undefined,
    };
  });

  return {
    header,
    periodStartDisplay,
    periodEndDisplay,
    summaryRows,
    summaryTotals,
    payment: paymentBlock,
    daySections,
  };
}

/**
 * Batch-load day buyer rows, log print, open system print dialog (same stack as Billing / Settlement).
 */
export async function printUserFeesChargesReport(
  report: UserFeesReportDTO,
  header: UserFeesChargesReportPrintHeader,
  payment: UserFeesPrintPaymentInput,
  documentOptions?: UserFeesPrintDocumentOptions,
): Promise<boolean> {
  const dates = (report.days ?? []).map((d) => d.date);
  const prefix = report.billPrefixApplied ?? '';
  const detailByDate = await fetchDayDetailsBatched(dates, prefix, 5);

  const printData = buildPrintData(report, detailByDate, header, payment);
  const html = generateUserFeesChargesReportPrintHTML(printData, documentOptions);

  const refStart = report.periodStart ?? dates[dates.length - 1] ?? '';
  const refEnd = report.periodEnd ?? dates[0] ?? '';
  const printedAt = new Date().toISOString();
  try {
    await printLogApi.create({
      reference_type: 'USER_FEES_REPORT',
      reference_id: refStart && refEnd ? `${refStart}_${refEnd}` : undefined,
      print_type: 'USER_FEES_REPORT',
      printed_at: printedAt,
    });
  } catch {
    /* non-fatal — same as Billing */
  }

  return directPrint(html, { mode: 'system' });
}
