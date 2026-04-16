import { reportsApi, type UserFeesDayDetailDTO, type UserFeesReportDTO } from '@/services/api/reports';

export async function fetchUserFeesReport(
  dateFrom: string,
  dateTo: string,
  billPrefix: string | null | undefined,
  signal?: AbortSignal
): Promise<UserFeesReportDTO> {
  return reportsApi.getUserFeesReport(dateFrom, dateTo, billPrefix ?? '', signal);
}

export async function fetchUserFeesDayDetail(
  date: string,
  billPrefix: string | null | undefined,
  signal?: AbortSignal
): Promise<UserFeesDayDetailDTO> {
  return reportsApi.getUserFeesDayDetail(date, billPrefix ?? '', signal);
}
