import { Truck } from 'lucide-react';
import { ReportDateRangeSelector } from '@/pages/reports/components/ReportDateRangeSelector';
import { useReportDateRangeState } from '@/pages/reports/hooks/useReportDateRangeState';
import { ReportDetailPageShell } from './ReportDetailPageShell';

const ArrivalsReportPage = () => {
  const dateRange = useReportDateRangeState();

  return (
    <ReportDetailPageShell
      title="Arrivals Report"
      subtitle="Arrival lots, freight, and advances (placeholder)."
      icon={Truck}
      filterControls={<ReportDateRangeSelector state={dateRange} idPrefix="arrivals" />}
    />
  );
};

export default ArrivalsReportPage;
