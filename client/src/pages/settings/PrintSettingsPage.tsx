import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BottomNav from '@/components/BottomNav';
import ForbiddenPage from '@/components/ForbiddenPage';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/lib/permissions';
import {
  DEFAULT_PRINT_COPIES,
  parsePrintCopiesJson,
  printSettingsApi,
  serializePrintCopiesJson,
  type PrintCopyItem,
  type PrintModuleKey,
  type PrintPaperSize,
  type PrintSettingDTO,
} from '@/services/api';

/** Billing / Settlement main-tab gradient (same as `billingToggleTabBtn` on BillingPage). */
const PRINT_SETTINGS_TAB_ACTIVE =
  'data-[state=active]:bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] data-[state=active]:text-white data-[state=active]:shadow-md';

const printSettingsTabsTriggerClass = cn(
  'flex-1 min-h-[3rem] sm:min-h-[3.25rem] py-2.5 px-2 sm:px-3 rounded-xl transition-all shadow-none border-0 ring-offset-background',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  PRINT_SETTINGS_TAB_ACTIVE,
  'data-[state=inactive]:glass-card data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground',
);

/** Labels and values share one scale (14px); h-11 hits ~44px touch target without oversized type. */
const printFieldLabelClass = 'text-sm font-medium text-foreground';
const printFieldControlClass = 'h-11 text-sm';

function isTraderOwnerRole(role: string | undefined): boolean {
  return String(role ?? '').trim().toUpperCase() === 'TRADER_OWNER';
}

function supportsNumberingAndCopies(moduleKey: PrintModuleKey): boolean {
  return moduleKey === 'SETTLEMENT' || moduleKey === 'BILLING';
}

type RowState = {
  moduleKey: PrintModuleKey;
  label: string;
  /** When false, UI shows one paper control; both API sizes stay equal (Non-GST). */
  dualPaperSizes: boolean;
  paperSizeWithHeader: PrintPaperSize;
  paperSizeWithoutHeader: PrintPaperSize;
  includeHeader: boolean;
  headerLocked?: boolean;
  /** Next sequence suffix floor for bills (BILLING) or patti base (SETTLEMENT); null = disabled. */
  billNumberStartFrom: number | null;
  printCopies: PrintCopyItem[];
};

const defaultCopies = (): PrintCopyItem[] => DEFAULT_PRINT_COPIES.map((c) => ({ ...c }));

/** Deep-clone template rows so UI edits never mutate module-level `DEFAULT_ROWS`. */
function cloneDefaultRows(): RowState[] {
  return DEFAULT_ROWS.map((r) => ({
    ...r,
    printCopies: r.printCopies.map((c) => ({ ...c })),
  }));
}

function mergePrintRowsFromList(data: PrintSettingDTO[]): RowState[] {
  const map = new Map(data.map((item) => [item.module_key, item]));
  return cloneDefaultRows().map((row) => {
    const item = map.get(row.moduleKey);
    const wh = (item?.paper_size_with_header as PrintPaperSize | undefined) ?? row.paperSizeWithHeader;
    const woh = (item?.paper_size_without_header as PrintPaperSize | undefined) ?? row.paperSizeWithoutHeader;
    const numbering =
      supportsNumberingAndCopies(row.moduleKey)
        ? {
            billNumberStartFrom:
              item != null &&
              item.bill_number_start_from != null &&
              Number.isFinite(Number(item.bill_number_start_from)) &&
              Number(item.bill_number_start_from) >= 1
                ? Math.floor(Number(item.bill_number_start_from))
                : null,
            printCopies: parsePrintCopiesJson(item?.print_copies_json ?? null).map((c) => ({ ...c })),
          }
        : {};
    return {
      ...row,
      paperSizeWithHeader: wh,
      paperSizeWithoutHeader: woh,
      includeHeader: row.headerLocked ? false : item?.include_header ?? row.includeHeader,
      ...numbering,
    };
  });
}

function validateNumberingRows(rows: RowState[]): string | null {
  for (const row of rows) {
    if (!supportsNumberingAndCopies(row.moduleKey)) continue;
    if (row.billNumberStartFrom != null && row.billNumberStartFrom < 1) {
      return `${row.label}: "start from" must be at least 1 or left empty.`;
    }
    for (let i = 0; i < row.printCopies.length; i++) {
      if (!String(row.printCopies[i]?.label ?? '').trim()) {
        return `${row.label}: copy ${i + 1} needs a non-empty label.`;
      }
    }
  }
  return null;
}

const DEFAULT_ROWS: RowState[] = [
  {
    moduleKey: 'SETTLEMENT',
    label: 'Settlement',
    dualPaperSizes: true,
    paperSizeWithHeader: 'A4',
    paperSizeWithoutHeader: 'A4',
    includeHeader: true,
    billNumberStartFrom: null,
    printCopies: defaultCopies(),
  },
  {
    moduleKey: 'BILLING',
    label: 'GST Billing',
    dualPaperSizes: true,
    paperSizeWithHeader: 'A4',
    paperSizeWithoutHeader: 'A4',
    includeHeader: true,
    billNumberStartFrom: null,
    printCopies: defaultCopies(),
  },
  {
    moduleKey: 'BILLING_NON_GST',
    label: 'Non-GST Billing',
    dualPaperSizes: false,
    paperSizeWithHeader: 'A5',
    paperSizeWithoutHeader: 'A5',
    includeHeader: false,
    headerLocked: true,
    billNumberStartFrom: null,
    printCopies: defaultCopies(),
  },
];

function rowsSnapshot(rows: RowState[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      k: r.moduleKey,
      wh: r.paperSizeWithHeader,
      woh: r.paperSizeWithoutHeader,
      h: r.includeHeader,
      f: r.billNumberStartFrom,
      c: r.printCopies,
    })),
  );
}

type SnapshotPiece = {
  k: PrintModuleKey;
  wh: PrintPaperSize;
  woh: PrintPaperSize;
  h: boolean;
  f: number | null;
  c: PrintCopyItem[];
};

function snapshotSubset(fullSnapshot: string, keys: readonly PrintModuleKey[]): string {
  const arr = JSON.parse(fullSnapshot) as SnapshotPiece[];
  const want = new Set<PrintModuleKey>(keys);
  return JSON.stringify(arr.filter((x) => want.has(x.k)));
}

const SETTLEMENT_TAB_KEYS = ['SETTLEMENT'] as const satisfies readonly PrintModuleKey[];
const BILLING_TAB_KEYS = ['BILLING', 'BILLING_NON_GST'] as const satisfies readonly PrintModuleKey[];

function PaperSizeSelect(props: {
  value: PrintPaperSize;
  onChange: (v: PrintPaperSize) => void;
  disabled: boolean;
}) {
  return (
    <Select value={props.value} onValueChange={(v) => props.onChange(v as PrintPaperSize)} disabled={props.disabled}>
      <SelectTrigger className={printFieldControlClass}>
        <SelectValue placeholder="Size" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="A4">A4</SelectItem>
        <SelectItem value="A5">A5</SelectItem>
      </SelectContent>
    </Select>
  );
}

const PrintSettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();

  const ownerBypass = isTraderOwnerRole(user?.role);
  const canView = can('Print Settings', 'View') || ownerBypass;
  const canEdit = can('Print Settings', 'Edit') || ownerBypass;

  const [rows, setRows] = useState<RowState[]>(() => cloneDefaultRows());
  const [loading, setLoading] = useState(true);
  const [savingTarget, setSavingTarget] = useState<'settlement' | 'billing' | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [copyModalModule, setCopyModalModule] = useState<'SETTLEMENT' | 'BILLING' | null>(null);
  const [newCopyName, setNewCopyName] = useState('');

  const updateRow = useCallback((moduleKey: PrintModuleKey, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((row) => (row.moduleKey === moduleKey ? { ...row, ...patch } : row)));
  }, []);

  const saving = savingTarget !== null;

  const settlementDirty = useMemo(() => {
    if (baseline === null) return false;
    return snapshotSubset(rowsSnapshot(rows), SETTLEMENT_TAB_KEYS) !== snapshotSubset(baseline, SETTLEMENT_TAB_KEYS);
  }, [rows, baseline]);

  const billingDirty = useMemo(() => {
    if (baseline === null) return false;
    return snapshotSubset(rowsSnapshot(rows), BILLING_TAB_KEYS) !== snapshotSubset(baseline, BILLING_TAB_KEYS);
  }, [rows, baseline]);

  const settlementRow = rows.find((r) => r.moduleKey === 'SETTLEMENT')!;
  const gstRow = rows.find((r) => r.moduleKey === 'BILLING')!;
  const nonGstRow = rows.find((r) => r.moduleKey === 'BILLING_NON_GST')!;

  useEffect(() => {
    if (!canView) return;
    const ac = new AbortController();
    const load = async () => {
      setLoading(true);
      setBaseline(null);
      try {
        const data = await printSettingsApi.list({ signal: ac.signal });
        const next = mergePrintRowsFromList(data);
        if (ac.signal.aborted) return;
        setRows(next);
        setBaseline(rowsSnapshot(next));
      } catch (e: unknown) {
        if (!ac.signal.aborted) {
          console.error(e);
          toast.error(e instanceof Error ? e.message : 'Failed to load print settings');
          const fallback = cloneDefaultRows();
          setRows(fallback);
          setBaseline(rowsSnapshot(fallback));
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => ac.abort();
  }, [canView]);

  const upsertRow = async (row: RowState) => {
    if (row.moduleKey === 'BILLING_NON_GST') {
      await printSettingsApi.upsert({
        module_key: row.moduleKey,
        paper_size_with_header: row.paperSizeWithHeader,
        paper_size_without_header: row.paperSizeWithoutHeader,
        include_header: false,
      });
    } else {
      await printSettingsApi.upsert({
        module_key: row.moduleKey,
        paper_size_with_header: row.paperSizeWithHeader,
        paper_size_without_header: row.paperSizeWithoutHeader,
        include_header: row.includeHeader,
        bill_number_start_from: row.billNumberStartFrom ?? null,
        print_copies_json: serializePrintCopiesJson(row.printCopies),
      });
    }
  };

  const finalizeSave = async () => {
    const refreshed = await printSettingsApi.list();
    const merged = mergePrintRowsFromList(refreshed);
    setRows(merged);
    setBaseline(rowsSnapshot(merged));
    toast.success('Saved');
  };

  const saveSettlementTab = async () => {
    if (!canEdit || saving || baseline === null) return;
    const err = validateNumberingRows([settlementRow]);
    if (err) {
      toast.error(err);
      return;
    }
    setSavingTarget('settlement');
    try {
      await upsertRow(settlementRow);
      await finalizeSave();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingTarget(null);
    }
  };

  const saveBillingTab = async () => {
    if (!canEdit || saving || baseline === null) return;
    const err = validateNumberingRows([gstRow]);
    if (err) {
      toast.error(err);
      return;
    }
    setSavingTarget('billing');
    try {
      await upsertRow(gstRow);
      await upsertRow(nonGstRow);
      await finalizeSave();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingTarget(null);
    }
  };

  const openAddCopy = (moduleKey: 'SETTLEMENT' | 'BILLING') => {
    setNewCopyName('');
    setCopyModalModule(moduleKey);
  };

  const confirmAddCopy = () => {
    if (!copyModalModule) return;
    const name = newCopyName.trim();
    if (!name) {
      toast.error('Enter a name for the copy');
      return;
    }
    const row = rows.find((r) => r.moduleKey === copyModalModule);
    if (!row) return;
    updateRow(copyModalModule, { printCopies: [...row.printCopies, { label: name }] });
    setCopyModalModule(null);
    setNewCopyName('');
  };

  const renderNumberingAndCopies = (row: RowState, opts?: { showTopDivider?: boolean }) => {
    if (!supportsNumberingAndCopies(row.moduleKey)) return null;
    const copyLabelIssue = row.printCopies.some((c) => !String(c.label ?? '').trim());
    const isBilling = row.moduleKey === 'BILLING';
    const floorLabel = isBilling ? 'Bill number start from' : 'Patti number start from';
    const showTopDivider = opts?.showTopDivider ?? false;

    return (
      <div
        className={cn(
          'space-y-5',
          showTopDivider && 'pt-2 border-t border-border/40',
        )}
      >
        <div className="space-y-2">
          <Label className={printFieldLabelClass} htmlFor={`${row.moduleKey}-floor`}>
            {floorLabel}
          </Label>
          <Input
            id={`${row.moduleKey}-floor`}
            type="number"
            min={1}
            inputMode="numeric"
            className={cn(printFieldControlClass, 'max-w-full sm:max-w-[12rem]')}
            placeholder="Default sequence"
            value={row.billNumberStartFrom ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                updateRow(row.moduleKey, { billNumberStartFrom: null });
                return;
              }
              const n = Number(v);
              if (Number.isFinite(n) && n >= 1) {
                updateRow(row.moduleKey, { billNumberStartFrom: Math.floor(n) });
              }
            }}
            disabled={!canEdit || saving}
            aria-invalid={row.billNumberStartFrom != null && row.billNumberStartFrom < 1}
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className={printFieldLabelClass}>Print copies</span>
            <Button
              type="button"
              variant="outline"
              className={cn(printFieldControlClass, 'gap-1.5 shrink-0 px-4 text-sm font-medium')}
              disabled={!canEdit || saving}
              onClick={() => openAddCopy(row.moduleKey as 'SETTLEMENT' | 'BILLING')}
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden />
              Add copy
            </Button>
          </div>
          {copyLabelIssue ? (
            <p className="text-sm text-destructive" role="alert">
              Every copy needs a label before save.
            </p>
          ) : null}
          <ul className="space-y-2 list-none p-0 m-0" role="list">
            {row.printCopies.map((c, idx) => {
              const emptyLabel = !String(c.label ?? '').trim();
              const inputId = `${row.moduleKey}-copy-label-${idx}`;
              return (
                <li
                  key={`${row.moduleKey}-copy-${idx}`}
                  className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3 rounded-lg border border-border/60 bg-muted/5 p-3"
                >
                  <Badge variant={idx === 0 ? 'default' : 'secondary'} className="tabular-nums text-xs w-fit shrink-0">
                    #{idx + 1}
                  </Badge>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor={inputId} className={printFieldLabelClass}>
                        Label
                      </Label>
                      <Input
                        id={inputId}
                        className={cn(
                          printFieldControlClass,
                          'w-full',
                          emptyLabel ? 'border-destructive/60 focus-visible:ring-destructive/40' : '',
                        )}
                        value={c.label}
                        onChange={(e) => {
                          const next = row.printCopies.map((x, j) =>
                            j === idx ? { label: e.target.value } : x,
                          );
                          updateRow(row.moduleKey, { printCopies: next });
                        }}
                        disabled={!canEdit || saving}
                        placeholder="e.g. ORIGINAL"
                        aria-invalid={emptyLabel}
                      />
                    </div>
                    {idx > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 self-end text-destructive hover:text-destructive sm:self-start"
                        disabled={!canEdit || saving}
                        onClick={() =>
                          updateRow(row.moduleKey, {
                            printCopies: row.printCopies.filter((_, j) => j !== idx),
                          })
                        }
                        aria-label={`Remove copy ${idx + 1}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  };

  if (!canView) {
    return <ForbiddenPage moduleName="Print Settings" />;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      <Dialog open={copyModalModule != null} onOpenChange={(o) => !o && setCopyModalModule(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add print copy</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-copy-name" className={printFieldLabelClass}>
              Copy name
            </Label>
            <Input
              id="new-copy-name"
              value={newCopyName}
              onChange={(e) => setNewCopyName(e.target.value)}
              placeholder="e.g. DUPLICATE COPY"
              autoFocus
              className={printFieldControlClass}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCopyModalModule(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => confirmAddCopy()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="px-4 md:px-8 pt-4 lg:pt-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Printer className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Print Settings</h1>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-border/40 overflow-hidden"
        >
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <>
              <div className="p-4">
                <Tabs defaultValue="settlement" className="w-full">
                  <TabsList className="flex w-full gap-2 h-auto p-0 bg-transparent rounded-none border-0 shadow-none">
                    <TabsTrigger value="settlement" className={printSettingsTabsTriggerClass}>
                      <span className="text-base sm:text-lg leading-tight">
                        <span className="font-black tracking-tight">Settle</span>
                        <span className="font-semibold">ment</span>
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="billing" className={printSettingsTabsTriggerClass}>
                      <span className="text-base sm:text-lg leading-tight">
                        <span className="font-black tracking-tight">Bill</span>
                        <span className="font-semibold">ing</span>
                      </span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="settlement" className="space-y-4 pt-4 focus-visible:outline-none">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className={printFieldLabelClass}>With header — paper</Label>
                        <PaperSizeSelect
                          value={settlementRow.paperSizeWithHeader}
                          onChange={(v) => updateRow('SETTLEMENT', { paperSizeWithHeader: v })}
                          disabled={!canEdit || saving}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className={printFieldLabelClass}>Without header — paper</Label>
                        <PaperSizeSelect
                          value={settlementRow.paperSizeWithoutHeader}
                          onChange={(v) => updateRow('SETTLEMENT', { paperSizeWithoutHeader: v })}
                          disabled={!canEdit || saving}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className={printFieldLabelClass}>Default layout</Label>
                      <Select
                        value={settlementRow.includeHeader ? 'WITH_HEADER' : 'WITHOUT_HEADER'}
                        onValueChange={(value) =>
                          updateRow('SETTLEMENT', { includeHeader: value === 'WITH_HEADER' })
                        }
                        disabled={!canEdit || saving}
                      >
                        <SelectTrigger className={printFieldControlClass}>
                          <SelectValue placeholder="Layout" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WITH_HEADER">With header</SelectItem>
                          <SelectItem value="WITHOUT_HEADER">Without header</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {renderNumberingAndCopies(settlementRow, { showTopDivider: true })}
                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        className="gap-2 w-full sm:w-auto min-w-[10rem]"
                        onClick={() => void saveSettlementTab()}
                        disabled={!canEdit || saving || !settlementDirty}
                      >
                        <Save className="w-4 h-4" />
                        {savingTarget === 'settlement' ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="billing" className="flex flex-col gap-5 pt-4 focus-visible:outline-none">
                    <section
                      aria-labelledby="print-gst-billing-heading"
                      className="rounded-xl border border-border/50 bg-muted/5 p-4 sm:p-5 space-y-4"
                    >
                      <h2 id="print-gst-billing-heading" className="text-sm font-bold text-foreground tracking-tight">
                        <span className="font-black">GST</span>
                        <span className="font-semibold text-muted-foreground"> billing</span>
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className={printFieldLabelClass}>With header — paper</Label>
                          <PaperSizeSelect
                            value={gstRow.paperSizeWithHeader}
                            onChange={(v) => updateRow('BILLING', { paperSizeWithHeader: v })}
                            disabled={!canEdit || saving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className={printFieldLabelClass}>Without header — paper</Label>
                          <PaperSizeSelect
                            value={gstRow.paperSizeWithoutHeader}
                            onChange={(v) => updateRow('BILLING', { paperSizeWithoutHeader: v })}
                            disabled={!canEdit || saving}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className={printFieldLabelClass}>Default layout</Label>
                        <Select
                          value={gstRow.includeHeader ? 'WITH_HEADER' : 'WITHOUT_HEADER'}
                          onValueChange={(value) => updateRow('BILLING', { includeHeader: value === 'WITH_HEADER' })}
                          disabled={!canEdit || saving}
                        >
                          <SelectTrigger className={printFieldControlClass}>
                            <SelectValue placeholder="Layout" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="WITH_HEADER">With header</SelectItem>
                            <SelectItem value="WITHOUT_HEADER">Without header</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </section>

                    <section
                      aria-labelledby="print-non-gst-billing-heading"
                      className="rounded-xl border border-border/50 bg-muted/10 p-4 sm:p-5 space-y-4"
                    >
                      <h2 id="print-non-gst-billing-heading" className="text-sm font-bold text-foreground tracking-tight">
                        <span className="font-black">Non-GST</span>
                        <span className="font-semibold text-muted-foreground"> billing</span>
                      </h2>
                      <div className="space-y-2">
                        <Label className={printFieldLabelClass}>Paper</Label>
                        <PaperSizeSelect
                          value={nonGstRow.paperSizeWithoutHeader}
                          onChange={(v) =>
                            updateRow('BILLING_NON_GST', {
                              paperSizeWithHeader: v,
                              paperSizeWithoutHeader: v,
                            })
                          }
                          disabled={!canEdit || saving}
                        />
                      </div>
                    </section>

                    <section
                      aria-labelledby="print-billing-numbers-heading"
                      className="rounded-xl border border-border/50 bg-muted/5 p-4 sm:p-5 space-y-4"
                    >
                      <h2 id="print-billing-numbers-heading" className="text-sm font-bold text-foreground tracking-tight">
                        <span className="font-black">Bill numbers</span>
                        <span className="font-semibold text-muted-foreground"> & print copies</span>
                      </h2>
                      {renderNumberingAndCopies(gstRow)}
                    </section>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        className="gap-2 w-full sm:w-auto min-w-[10rem]"
                        onClick={() => void saveBillingTab()}
                        disabled={!canEdit || saving || !billingDirty}
                      >
                        <Save className="w-4 h-4" />
                        {savingTarget === 'billing' ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default PrintSettingsPage;
