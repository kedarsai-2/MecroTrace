import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Printer, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BottomNav from '@/components/BottomNav';
import ForbiddenPage from '@/components/ForbiddenPage';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/lib/permissions';
import { printSettingsApi, type PrintModuleKey, type PrintPaperSize } from '@/services/api';

function isTraderOwnerRole(role: string | undefined): boolean {
  return String(role ?? '').trim().toUpperCase() === 'TRADER_OWNER';
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
};

const DEFAULT_ROWS: RowState[] = [
  {
    moduleKey: 'SETTLEMENT',
    label: 'Settlement',
    dualPaperSizes: true,
    paperSizeWithHeader: 'A4',
    paperSizeWithoutHeader: 'A4',
    includeHeader: true,
  },
  {
    moduleKey: 'BILLING',
    label: 'GST Billing',
    description: 'Used when bill contains any GST / IGST commodity (or mixed).',
    dualPaperSizes: true,
    paperSizeWithHeader: 'A4',
    paperSizeWithoutHeader: 'A4',
    includeHeader: true,
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
  },
];

function rowsSnapshot(rows: RowState[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      k: r.moduleKey,
      wh: r.paperSizeWithHeader,
      woh: r.paperSizeWithoutHeader,
      h: r.includeHeader,
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

  const [rows, setRows] = useState<RowState[]>(DEFAULT_ROWS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);

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
    const load = async () => {
      setLoading(true);
      setBaseline(null);
      try {
        const data = await printSettingsApi.list();
        const map = new Map(data.map((item) => [item.module_key, item]));
        const next = DEFAULT_ROWS.map((row) => {
          const item = map.get(row.moduleKey);
          const wh = (item?.paper_size_with_header as PrintPaperSize | undefined) ?? row.paperSizeWithHeader;
          const woh = (item?.paper_size_without_header as PrintPaperSize | undefined) ?? row.paperSizeWithoutHeader;
          return {
            ...row,
            paperSizeWithHeader: wh,
            paperSizeWithoutHeader: woh,
            includeHeader: row.headerLocked ? false : item?.include_header ?? row.includeHeader,
          };
        });
        setRows(next);
        setBaseline(rowsSnapshot(next));
      } catch (e) {
        console.error(e);
        toast.error('Failed to load print settings');
        setRows(DEFAULT_ROWS);
        setBaseline(rowsSnapshot(DEFAULT_ROWS));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [canView]);

  const saveAll = async () => {
    if (!canEdit || saving || baseline === null) return;
    setSaving(true);
    try {
      for (const row of rows) {
        await printSettingsApi.upsert({
          module_key: row.moduleKey,
          paper_size_with_header: row.paperSizeWithHeader,
          paper_size_without_header: row.paperSizeWithoutHeader,
          include_header: row.headerLocked ? false : row.includeHeader,
        });
      }
      setBaseline(rowsSnapshot(rows));
      toast.success('Print settings saved');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save print settings');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return <ForbiddenPage moduleName="Print Settings" />;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
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
