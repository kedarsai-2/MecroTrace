import { reportsApi, type DailySalesSummaryReportDTO } from '@/services/api/reports';

export async function fetchDailySalesSummaryReport(
  dateFrom: string,
  dateTo: string,
  signal?: AbortSignal
): Promise<DailySalesSummaryReportDTO> {
  return reportsApi.getDailySalesSummaryReport(dateFrom, dateTo, signal);
}
