import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import { downloadDailySalesExcel, printDailySalesSummaryReport } from '@/pages/reports/dailySalesSummary/exportDailySalesSummary';
import { dailySalesExportButtonClassName } from '@/pages/reports/reportUiTokens';
import type { DailySalesSummaryReportDTO } from '@/services/api/reports';
import type { DailySalesSummaryPrintHeader } from '@/utils/printDocumentTemplates';
import { toast } from 'sonner';

type ReportActionsProps = {
  report: DailySalesSummaryReportDTO | null;
  printHeader: DailySalesSummaryPrintHeader;
  filenameBase: string;
  disabled?: boolean;
  className?: string;
};

export function ReportActions({ report, printHeader, filenameBase, disabled, className }: ReportActionsProps) {
  const isDesktop = useDesktopMode();

  const run = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error)?.message ?? `${label} failed`);
    }
  };

  const onPrint = () =>
    void run('Print', async () => {
      if (!report) return;
      const ok = await printDailySalesSummaryReport(report, printHeader);
      ok ? toast.success('Print job sent.') : toast.error('Print could not be started.');
    });

  const onPdf = () =>
    void run('PDF', async () => {
      if (!report) return;
      const ok = await printDailySalesSummaryReport(report, printHeader);
      if (ok) {
        toast.success('Print dialog opened — choose "Save as PDF" or your printer.');
      } else {
        toast.error('Could not open print dialog.');
      }
    });

  const exportDisabled = disabled || !report;
  const btn = (extra: string) =>
    cn(
      dailySalesExportButtonClassName(exportDisabled),
      extra,
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[rgba(255,255,255,0.45)]'
    );

  const actions = (
    <>
      <button
        type="button"
        className={btn('gap-1')}
        disabled={exportDisabled}
        onClick={() => void run('Excel', () => downloadDailySalesExcel(report!, filenameBase))}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Excel
      </button>
      <button
        type="button"
        className={btn('gap-1')}
        disabled={exportDisabled}
        onClick={() => void onPdf()}
      >
        <Download className="h-3.5 w-3.5" />
        PDF
      </button>
      <button type="button" className={btn('gap-1')} disabled={!report} onClick={() => void onPrint()}>
        <Printer className="h-3.5 w-3.5" />
        Print
      </button>
    </>
  );

  if (!isDesktop) {
    return (
      <div className={cn('flex justify-end', className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={btn('gap-1')} disabled={!report}>
              <Download className="h-3.5 w-3.5" />
              Export / Print
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={exportDisabled}
              onClick={() => void run('Excel', () => downloadDailySalesExcel(report!, filenameBase))}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </DropdownMenuItem>
            <DropdownMenuItem disabled={exportDisabled} onClick={() => void onPdf()}>
              <Download className="h-4 w-4 mr-2" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!report} onClick={() => void onPrint()}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-1.5', className)}>{actions}</div>
  );
}
