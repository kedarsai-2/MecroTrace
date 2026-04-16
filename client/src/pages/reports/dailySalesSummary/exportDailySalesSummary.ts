import {
  DSS_TABLE_HEADERS,
  dayToRowCells,
  reportToAoa,
  totalsToRowCells,
} from '@/pages/reports/dailySalesSummary/dssReportFormat';
import type { DailySalesSummaryReportDTO } from '@/services/api/reports';
import {
  generateDailySalesSummaryPrintHTML,
  type DailySalesSummaryPrintData,
  type DailySalesSummaryPrintHeader,
} from '@/utils/printDocumentTemplates';
import { directPrint } from '@/utils/printTemplates';

export type { DailySalesSummaryPrintHeader };

function downloadBlob(filename: string, mime: string, body: BlobPart) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadDailySalesExcel(report: DailySalesSummaryReportDTO, filenameBase: string) {
  const XLSX = await import('xlsx');
  const aoa = reportToAoa(report);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Sales');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
  downloadBlob(`${filenameBase}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', out);
}

export function buildDailySalesSummaryPrintData(
  report: DailySalesSummaryReportDTO,
  header: DailySalesSummaryPrintHeader,
  title = 'Daily Sales Summary'
): DailySalesSummaryPrintData {
  return {
    title,
    header: {
      traderName: header.traderName,
      apmcCode: header.apmcCode,
      address: header.address,
    },
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    headers: DSS_TABLE_HEADERS,
    dayRows: (report.days ?? []).map((d) => dayToRowCells(d)),
    totalsRow: report.totals ? totalsToRowCells(report.totals) : DSS_TABLE_HEADERS.map(() => '—'),
  };
}

/** Same HTML pipeline as Billing/Settlement: iframe / native print (choose “Save as PDF” in dialog). */
export async function printDailySalesSummaryReport(
  report: DailySalesSummaryReportDTO,
  header: DailySalesSummaryPrintHeader,
  title = 'Daily Sales Summary'
): Promise<boolean> {
  const html = generateDailySalesSummaryPrintHTML(buildDailySalesSummaryPrintData(report, header, title));
  return directPrint(html, { mode: 'system' });
}
