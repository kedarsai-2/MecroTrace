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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BottomNav from '@/components/BottomNav';
import ForbiddenPage from '@/components/ForbiddenPage';
import { useAuth } from '@/context/AuthContext';
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

function isTraderOwnerRole(role: string | undefined): boolean {
  return String(role ?? '').trim().toUpperCase() === 'TRADER_OWNER';
}

function supportsNumberingAndCopies(moduleKey: PrintModuleKey): boolean {
  return moduleKey === 'SETTLEMENT' || moduleKey === 'BILLING';
}

type RowState = {
  moduleKey: PrintModuleKey;
  label: string;
  description?: string;
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
    description: 'Used when bill contains any GST / IGST commodity (or mixed).',
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
    description: 'Used when no line has GST.',
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

function PaperSizeSelect(props: {
  value: PrintPaperSize;
  onChange: (v: PrintPaperSize) => void;
  disabled: boolean;
}) {
  return (
    <Select value={props.value} onValueChange={(v) => props.onChange(v as PrintPaperSize)} disabled={props.disabled}>
      <SelectTrigger>
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
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [copyModalModule, setCopyModalModule] = useState<'SETTLEMENT' | 'BILLING' | null>(null);
  const [newCopyName, setNewCopyName] = useState('');

  const updateRow = useCallback((moduleKey: PrintModuleKey, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((row) => (row.moduleKey === moduleKey ? { ...row, ...patch } : row)));
  }, []);

  const isDirty = useMemo(() => {
    if (baseline === null) return false;
    return rowsSnapshot(rows) !== baseline;
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

  const saveAll = async () => {
    if (!canEdit || saving || baseline === null) return;
    const validationError = validateNumberingRows(rows);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      for (const row of rows) {
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
      }
      const refreshed = await printSettingsApi.list();
      const merged = mergePrintRowsFromList(refreshed);
      setRows(merged);
      setBaseline(rowsSnapshot(merged));
      toast.success('Print settings saved');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to save print settings');
    } finally {
      setSaving(false);
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

  const renderNumberingAndCopies = (row: RowState) => {
    if (!supportsNumberingAndCopies(row.moduleKey)) return null;
    const copyLabelIssue = row.printCopies.some((c) => !String(c.label ?? '').trim());
    const isBilling = row.moduleKey === 'BILLING';
    const floorSectionTitle = isBilling ? 'Bill number start from' : 'Patti number start from';
    const floorFieldLabel = isBilling ? 'Minimum numeric suffix for next bill' : 'Minimum numeric suffix for next patti';
    const floorIntro =
      row.moduleKey === 'BILLING'
        ? 'Starting value for the numeric part of the bill (e.g. 555 so the next default-prefix bill is …-00555, then 556). Applies only to your default bill prefix from the trader profile; other prefixes (e.g. commodity bill prefixes) each have their own counter that increments from 1.'
        : 'Optional floor for the shared patti counter (per prefix). Same idea as billing: a minimum for the next reserved base, not a forced reset.';
    const floorHelperId = `${row.moduleKey}-floor-helper`;
    const copiesSectionId = `${row.moduleKey}-copies-heading`;

    return (
      <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-5 mt-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Numbering and print copies</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {row.moduleKey === 'BILLING'
              ? 'Bill numbers share one running sequence per prefix.'
              : 'Patti numbers share one running sequence per prefix.'}{' '}
            Settings below only affect how the next value is chosen, not past documents.
          </p>
        </div>

        <section className="space-y-3" aria-labelledby={`${row.moduleKey}-floor-heading`}>
          <div className="space-y-1.5">
            <h3 id={`${row.moduleKey}-floor-heading`} className="text-sm font-semibold text-foreground">
              {floorSectionTitle}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{floorIntro}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground" htmlFor={`${row.moduleKey}-floor`}>
              {floorFieldLabel}
            </Label>
            <Input
              id={`${row.moduleKey}-floor`}
              type="number"
              min={1}
              inputMode="numeric"
              className="max-w-full sm:max-w-[12rem] min-h-10"
              placeholder="Empty — use default sequence"
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
              aria-describedby={floorHelperId}
            />
            <p id={floorHelperId} className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
              <span className="block">
                Leave empty to use the default sequence from the server (no floor).
              </span>
              <span className="block">
                The floor only affects the next assignment when the live counter is still below this value; it never moves
                the sequence backward.
              </span>
            </p>
          </div>
        </section>

        <div className="h-px bg-border/60" role="presentation" />

        <section className="space-y-3" aria-labelledby={copiesSectionId}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="space-y-1.5 min-w-0 flex-1">
              <h3 id={copiesSectionId} className="text-sm font-semibold text-foreground">
                Named print copies
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Labels appear in the document footer. Order is print order (first row is page one). At least one copy is
                required.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 shrink-0 self-stretch sm:self-start sm:min-w-[9rem] justify-center"
              disabled={!canEdit || saving}
              onClick={() => openAddCopy(row.moduleKey as 'SETTLEMENT' | 'BILLING')}
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden />
              Add copy
            </Button>
          </div>
          {copyLabelIssue ? (
            <p className="text-xs text-destructive" role="alert">
              Every copy needs a non-empty label before you can save.
            </p>
          ) : null}
          <ul className="space-y-3 list-none p-0 m-0" role="list">
            {row.printCopies.map((c, idx) => {
              const emptyLabel = !String(c.label ?? '').trim();
              const inputId = `${row.moduleKey}-copy-label-${idx}`;
              const positionLabel = idx === 0 ? 'Primary copy' : `Copy ${idx + 1}`;
              return (
                <li
                  key={`${row.moduleKey}-copy-${idx}`}
                  className="rounded-lg border border-border/60 bg-background/80 p-3 sm:p-3.5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-start sm:gap-2 sm:pt-0.5">
                      <Badge variant={idx === 0 ? 'default' : 'secondary'} className="tabular-nums text-xs px-2 py-0.5">
                        #{idx + 1}
                      </Badge>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {positionLabel}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={inputId} className="text-xs font-medium text-foreground">
                          Footer label ({positionLabel})
                        </Label>
                        <Input
                          id={inputId}
                          className={`min-h-10 w-full ${emptyLabel ? 'border-destructive/60 focus-visible:ring-destructive/40' : ''}`}
                          value={c.label}
                          onChange={(e) => {
                            const next = row.printCopies.map((x, j) =>
                              j === idx ? { label: e.target.value } : x,
                            );
                            updateRow(row.moduleKey, { printCopies: next });
                          }}
                          disabled={!canEdit || saving}
                          placeholder="e.g. ORIGINAL FOR RECIPIENT"
                          aria-invalid={emptyLabel}
                        />
                      </div>
                      {idx > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0 self-end text-destructive hover:text-destructive sm:self-start"
                          disabled={!canEdit || saving}
                          onClick={() =>
                            updateRow(row.moduleKey, {
                              printCopies: row.printCopies.filter((_, j) => j !== idx),
                            })
                          }
                          aria-label={`Remove ${positionLabel}`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
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
            <Label htmlFor="new-copy-name">Copy name</Label>
            <Input
              id="new-copy-name"
              value={newCopyName}
              onChange={(e) => setNewCopyName(e.target.value)}
              placeholder="e.g. DUPLICATE COPY"
              autoFocus
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
            <p className="text-sm text-muted-foreground">
              Paper size per layout (with / without letterhead) and default layout where it applies
            </p>
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
              <div className="p-4 space-y-5">
                {/* Settlement */}
                <div className="rounded-xl border border-border/50 p-4 space-y-3">
                  <div className="font-semibold text-foreground">{settlementRow.label}</div>
                  <p className="text-xs text-muted-foreground">Sales patti / settlement prints.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">With header — paper</p>
                      <PaperSizeSelect
                        value={settlementRow.paperSizeWithHeader}
                        onChange={(v) => updateRow('SETTLEMENT', { paperSizeWithHeader: v })}
                        disabled={!canEdit || saving}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Without header — paper</p>
                      <PaperSizeSelect
                        value={settlementRow.paperSizeWithoutHeader}
                        onChange={(v) => updateRow('SETTLEMENT', { paperSizeWithoutHeader: v })}
                        disabled={!canEdit || saving}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Default layout</p>
                    <Select
                      value={settlementRow.includeHeader ? 'WITH_HEADER' : 'WITHOUT_HEADER'}
                      onValueChange={(value) =>
                        updateRow('SETTLEMENT', { includeHeader: value === 'WITH_HEADER' })
                      }
                      disabled={!canEdit || saving}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Layout" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WITH_HEADER">With header</SelectItem>
                        <SelectItem value="WITHOUT_HEADER">Without header</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {renderNumberingAndCopies(settlementRow)}
                </div>

                {/* User Billing — nested GST / Non-GST */}
                <div className="rounded-xl border border-border/50 p-4 space-y-3">
                  <div className="font-semibold text-foreground">Billing</div>
                  <p className="text-xs text-muted-foreground">Sales bill print formats.</p>

                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-3">
                    <div className="font-medium text-sm text-foreground">GST Billing</div>
                    {gstRow.description && <p className="text-xs text-muted-foreground">{gstRow.description}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">With header — paper</p>
                        <PaperSizeSelect
                          value={gstRow.paperSizeWithHeader}
                          onChange={(v) => updateRow('BILLING', { paperSizeWithHeader: v })}
                          disabled={!canEdit || saving}
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Without header — paper</p>
                        <PaperSizeSelect
                          value={gstRow.paperSizeWithoutHeader}
                          onChange={(v) => updateRow('BILLING', { paperSizeWithoutHeader: v })}
                          disabled={!canEdit || saving}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Default layout</p>
                      <Select
                        value={gstRow.includeHeader ? 'WITH_HEADER' : 'WITHOUT_HEADER'}
                        onValueChange={(value) => updateRow('BILLING', { includeHeader: value === 'WITH_HEADER' })}
                        disabled={!canEdit || saving}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Layout" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WITH_HEADER">With header</SelectItem>
                          <SelectItem value="WITHOUT_HEADER">Without header</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {renderNumberingAndCopies(gstRow)}
                  </div>

                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-3">
                    <div className="font-medium text-sm text-foreground">Non-GST Billing</div>
                    {nonGstRow.description && <p className="text-xs text-muted-foreground">{nonGstRow.description}</p>}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Paper size</p>
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
                    <p className="text-xs text-muted-foreground italic">Letterhead not used on non-GST bill template.</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 px-4 pb-4 pt-0 sm:pt-2 border-t border-border/40 mt-2">
                <Button
                  className="gap-2 w-full sm:w-auto min-w-[10rem]"
                  onClick={() => void saveAll()}
                  disabled={!canEdit || saving || !isDirty}
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save all'}
                </Button>
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
