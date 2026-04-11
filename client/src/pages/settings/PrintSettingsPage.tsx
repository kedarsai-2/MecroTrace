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
  /** Short description shown below the label */
  description?: string;
  paperSize: PrintPaperSize;
  includeHeader: boolean;
  /** When true the "Layout / header" control is hidden — header is always off for this module */
  headerLocked?: boolean;
};

const DEFAULT_ROWS: RowState[] = [
  { moduleKey: 'SETTLEMENT',      label: 'Settlement',           paperSize: 'A4', includeHeader: true },
  { moduleKey: 'BILLING',         label: 'GST Billing',          description: 'Applied when the bill contains any GST commodity', paperSize: 'A4', includeHeader: true },
  { moduleKey: 'BILLING_NON_GST', label: 'Without GST Billing',  description: 'Applied when the bill has no GST on any commodity', paperSize: 'A5', includeHeader: false, headerLocked: true },
];

function rowsSnapshot(rows: RowState[]): string {
  return JSON.stringify(
    rows.map((r) => ({ k: r.moduleKey, p: r.paperSize, h: r.includeHeader })),
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
  /** `null` until first successful load — avoids treating defaults as “dirty” before fetch. */
  const [baseline, setBaseline] = useState<string | null>(null);

  const updateRow = useCallback((moduleKey: PrintModuleKey, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((row) => (row.moduleKey === moduleKey ? { ...row, ...patch } : row)));
  }, []);

  const isDirty = useMemo(() => {
    if (baseline === null) return false;
    return rowsSnapshot(rows) !== baseline;
  }, [rows, baseline]);

  useEffect(() => {
    if (!canView) return;
    const load = async () => {
      setLoading(true);
      setBaseline(null);
      try {
        const data = await printSettingsApi.list();
        const map = new Map(data.map((item) => [item.module_key, item]));
        const next = DEFAULT_ROWS.map((row) => ({
          ...row,
          paperSize: (map.get(row.moduleKey)?.paper_size as PrintPaperSize | undefined) ?? row.paperSize,
          includeHeader: map.get(row.moduleKey)?.include_header ?? row.includeHeader,
        }));
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
          paper_size: row.paperSize,
          include_header: row.includeHeader,
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
            <p className="text-sm text-muted-foreground">Choose print format size and header layout by module</p>
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
              <div className="p-4 space-y-4">
                {rows.map((row) => (
                  <div key={row.moduleKey} className="rounded-xl border border-border/50 p-4">
                    <div className="mb-3">
                      <div className="font-semibold text-foreground">{row.label}</div>
                      {row.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Paper Size — always visible */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Paper Size</p>
                        <Select
                          value={row.paperSize}
                          onValueChange={(value) => updateRow(row.moduleKey, { paperSize: value as PrintPaperSize })}
                          disabled={!canEdit || saving}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A4">A4</SelectItem>
                            <SelectItem value="A5">A5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Layout / Header — hidden when headerLocked */}
                      {!row.headerLocked ? (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Layout</p>
                          <Select
                            value={row.includeHeader ? 'WITH_HEADER' : 'WITHOUT_HEADER'}
                            onValueChange={(value) =>
                              updateRow(row.moduleKey, { includeHeader: value === 'WITH_HEADER' })
                            }
                            disabled={!canEdit || saving}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select layout" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WITH_HEADER">With Header</SelectItem>
                              <SelectItem value="WITHOUT_HEADER">Without Header</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="flex items-end pb-0.5">
                          <p className="text-xs text-muted-foreground italic">
                            Header: always off (Non-GST format has no letterhead)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
