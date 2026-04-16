import { format, parse } from 'date-fns';
import { CalendarIcon, Download, Printer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDesktopMode } from '@/hooks/use-desktop';
import { cn } from '@/lib/utils';
import {
  printUserFeesChargesReport,
  type UserFeesPaymentMode,
  type UserFeesPrintDocumentOptions,
  type UserFeesPrintPaymentInput,
} from '@/pages/reports/userFees/exportUserFeesReport';
import { dailySalesExportButtonClassName } from '@/pages/reports/reportUiTokens';
import { ymdToDdMmYyyy } from '@/pages/reports/userFees/userFeesFormat';
import type { UserFeesReportDTO } from '@/services/api/reports';
import type { UserFeesChargesReportPrintHeader } from '@/pages/reports/userFees/userFeesChargesReportPrintHtml';
import { formatBillingInr } from '@/utils/billingMoney';
import { todayIstYmd } from '@/utils/reportIstDates';
import { toast } from 'sonner';

type UserFeesReportActionsProps = {
  report: UserFeesReportDTO | null;
  printHeader: UserFeesChargesReportPrintHeader;
  documentOptions?: UserFeesPrintDocumentOptions;
  disabled?: boolean;
  className?: string;
};

function parseYmd(s: string): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = parse(s.trim(), 'yyyy-MM-dd', new Date());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function fmtYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function inr(n: number): string {
  return `₹ ${formatBillingInr(Number(n) || 0)}`;
}

const MODE_ITEMS: { value: UserFeesPaymentMode; label: string }[] = [
  { value: 'CASH', label: 'CASH' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'CHEQUE' },
  { value: 'NEFT_RTGS', label: 'NEFT/RTGS' },
];

export function UserFeesReportActions({
  report,
  printHeader,
  documentOptions,
  disabled,
  className,
}: UserFeesReportActionsProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<UserFeesPaymentMode>('CASH');
  const [reference, setReference] = useState('');
  const [paymentYmd, setPaymentYmd] = useState(() => todayIstYmd());
  const [payOpen, setPayOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('CASH');
    setReference('');
    setPaymentYmd(todayIstYmd());
  }, [open]);

  const periodLine = useMemo(() => {
    if (!report) return '';
    const a = report.periodStart ? ymdToDdMmYyyy(report.periodStart) : '—';
    const b = report.periodEnd ? ymdToDdMmYyyy(report.periodEnd) : '—';
    return `Print User Charges Report from ${a} to ${b}`;
  }, [report]);

  const totalsLine = useMemo(() => {
    if (!report?.totals) return '';
    const t = report.totals;
    const bags = Number(t.totalBags) || 0;
    const sales = Number(t.totalSales) || 0;
    const uc = Number(t.userCharges) || 0;
    return `Total of ${bags.toLocaleString('en-IN')} bags with Sales of ${inr(sales)} and Users Charges of ${inr(uc)}`;
  }, [report]);

  const paymentDateLabel = useMemo(() => {
    const d = parseYmd(paymentYmd);
    return d ? format(d, 'dd-MM-yyyy') : paymentYmd;
  }, [paymentYmd]);

  const runPrint = useCallback(
    async (asPdfHint: boolean) => {
      if (!report) return;
      const ref = reference.trim();
      if (mode !== 'CASH' && !ref) {
        toast.error('Enter payment reference details for the selected mode.');
        return;
      }
      if (!paymentYmd.trim()) {
        toast.error('Select date of payment.');
        return;
      }
      const payment: UserFeesPrintPaymentInput = {
        mode,
        referenceDetail: mode === 'CASH' ? undefined : ref,
        paymentDateYmd: paymentYmd.trim(),
      };
      setPrinting(true);
      try {
        const ok = await printUserFeesChargesReport(report, printHeader, payment, documentOptions);
        if (ok) {
          toast.success(
            asPdfHint ? 'Print dialog opened — choose "Save as PDF" or your printer.' : 'Print job sent.',
          );
          setOpen(false);
        } else {
          toast.error('Print could not be started.');
        }
      } catch (e) {
        toast.error((e as Error)?.message ?? 'Print failed');
      } finally {
        setPrinting(false);
      }
    },
    [report, printHeader, documentOptions, mode, reference, paymentYmd],
  );

  const exportDisabled = disabled || !report;
  const btn = (extra: string) =>
    cn(
      dailySalesExportButtonClassName(exportDisabled),
      extra,
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[rgba(255,255,255,0.45)]',
    );

  const showRef = mode !== 'CASH';
  const refLabel =
    mode === 'UPI' ? 'UPI details' : mode === 'CHEQUE' ? 'Cheque details' : mode === 'NEFT_RTGS' ? 'NEFT/RTGS details' : '';

  const dialog = (
    <Dialog open={open} onOpenChange={(v) => !printing && setOpen(v)}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print user charges report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-foreground font-medium leading-snug">{periodLine}</p>
          <p className="text-muted-foreground leading-snug">{totalsLine}</p>
          <div className="border-t border-border pt-3 space-y-3">
            <h3 className="font-semibold text-foreground">Enter Payment Details</h3>
            <div className="space-y-2">
              <Label htmlFor="uf-pay-mode">Mode of payment</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as UserFeesPaymentMode)}>
                <SelectTrigger id="uf-pay-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_ITEMS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showRef ? (
              <div className="space-y-2">
                <Label htmlFor="uf-pay-ref">{refLabel}</Label>
                <Input
                  id="uf-pay-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Required"
                  autoComplete="off"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Date of payment</Label>
              <Popover open={payOpen} onOpenChange={setPayOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal" type="button">
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
                    {paymentDateLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseYmd(paymentYmd)}
                    onSelect={(d) => {
                      if (d) {
                        setPaymentYmd(fmtYmd(d));
                        setPayOpen(false);
                      }
                    }}
                    disabled={{ after: new Date() }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={printing}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={() => void runPrint(true)} disabled={printing}>
            <Download className="h-4 w-4 mr-1.5" />
            PDF
          </Button>
          <Button type="button" onClick={() => void runPrint(false)} disabled={printing}>
            <Printer className="h-4 w-4 mr-1.5" />
            {printing ? 'Preparing…' : 'Print'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const openModal = () => setOpen(true);

  const actions = (
    <>
      <button type="button" className={btn('gap-1')} disabled={exportDisabled} onClick={openModal}>
        <Printer className="h-3.5 w-3.5" />
        Print
      </button>
    </>
  );

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-1.5', className)}>
      {dialog}
      {actions}
    </div>
  );
}
