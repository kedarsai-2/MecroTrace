import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sliders, ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { presetMarksApi, type PresetMarkSettingDTO } from '@/services/api';
import { toast } from 'sonner';
import BottomNav from '@/components/BottomNav';
import { usePermissions } from '@/lib/permissions';
import ForbiddenPage from '@/components/ForbiddenPage';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';
import { useAuth } from '@/context/AuthContext';

const PREDEFINED_MARK_MIN = 1;
const PREDEFINED_MARK_MAX = 20;
const EXTRA_AMOUNT_MIN = -100000;
const EXTRA_AMOUNT_MAX = 100000;
const ALPHANUMERIC_REGEX = /^[a-zA-Z0-9]*$/;

function validatePredefinedMark(value: string): string | null {
  const t = value.trim();
  if (!t) return 'Predefined Mark is required';
  if (t.length < PREDEFINED_MARK_MIN || t.length > PREDEFINED_MARK_MAX)
    return `Length must be between ${PREDEFINED_MARK_MIN} and ${PREDEFINED_MARK_MAX}`;
  if (!ALPHANUMERIC_REGEX.test(t)) return 'Only letters and numbers allowed (no spaces or special characters)';
  return null;
}

function validateExtraAmount(value: string): string | null {
  const n = parseFloat(value);
  if (value.trim() === '' || isNaN(n)) return 'Extra Amount is required';
  if (n < EXTRA_AMOUNT_MIN || n > EXTRA_AMOUNT_MAX)
    return `Must be between ₹${EXTRA_AMOUNT_MIN} and ₹${EXTRA_AMOUNT_MAX}`;
  return null;
}

function isDuplicateMark(
  mark: string,
  list: PresetMarkSettingDTO[],
  excludeId: number | null
): boolean {
  const normalized = mark.trim().toLowerCase();
  if (!normalized) return false;
  return list.some(
    (row) =>
      (row.predefined_mark ?? '').toLowerCase() === normalized &&
      (excludeId == null || row.id !== excludeId)
  );
}

const PresetSettingsPage = () => {
  const navigate = useNavigate();
  const { trader, hasBootstrapped } = useAuth();
  const { can } = usePermissions();
  const [list, setList] = useState<PresetMarkSettingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formMark, setFormMark] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formErrors, setFormErrors] = useState<{ mark?: string; amount?: string }>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const dialogBaselineRef = useRef<string | null>(null);

  const canViewPresetSettings = can('Preset Settings', 'View');
  const canCreatePreset = can('Preset Settings', 'Create');
  const canEditPreset = can('Preset Settings', 'Edit');
  const canDeletePreset = can('Preset Settings', 'Delete');

  const getDialogSnapshot = useCallback(
    () =>
      JSON.stringify({
        editingId,
        mark: formMark.trim(),
        amount: formAmount.trim(),
      }),
    [editingId, formMark, formAmount],
  );

  const isDialogDirty = useMemo(() => {
    if (!dialogOpen || dialogBaselineRef.current == null) return false;
    return getDialogSnapshot() !== dialogBaselineRef.current;
  }, [dialogOpen, getDialogSnapshot]);

  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isDialogDirty && !saving,
  });

  const fetchList = async () => {
    try {
      setLoading(true);
      const data = await presetMarksApi.list();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load preset settings');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  const traderCanCustomizePresets = trader?.preset_enabled !== false;

  useEffect(() => {
    if (!canViewPresetSettings || !traderCanCustomizePresets) return;
    fetchList();
  }, [canViewPresetSettings, traderCanCustomizePresets]);

  const openCreate = () => {
    setEditingId(null);
    setFormMark('');
    setFormAmount('');
    setFormErrors({});
    setDialogOpen(true);
    dialogBaselineRef.current = JSON.stringify({ editingId: null, mark: '', amount: '' });
  };

  const openEdit = (row: PresetMarkSettingDTO) => {
    setEditingId(row.id ?? null);
    setFormMark(row.predefined_mark ?? '');
    setFormAmount(String(row.extra_amount ?? ''));
    setFormErrors({});
    setDialogOpen(true);
    dialogBaselineRef.current = JSON.stringify({
      editingId: row.id ?? null,
      mark: (row.predefined_mark ?? '').trim(),
      amount: String(row.extra_amount ?? '').trim(),
    });
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      setDialogOpen(true);
      return;
    }
    void (async () => {
      const ok = await confirmIfDirty();
      if (!ok) return;
      setDialogOpen(false);
      dialogBaselineRef.current = null;
    })();
  };

  const validateForm = (): boolean => {
    let markErr = validatePredefinedMark(formMark);
    if (!markErr && isDuplicateMark(formMark, list, editingId)) {
      markErr = 'Same Predefined Mark already exists';
    }
    const amountErr = validateExtraAmount(formAmount);
    setFormErrors({ mark: markErr ?? undefined, amount: amountErr ?? undefined });
    return !markErr && !amountErr;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload: PresetMarkSettingDTO = {
        predefined_mark: formMark.trim(),
        extra_amount: parseFloat(formAmount),
      };
      if (editingId != null) {
        await presetMarksApi.update(editingId, payload);
        toast.success('Preset updated');
      } else {
        await presetMarksApi.create(payload);
        toast.success('Preset added');
      }
      setDialogOpen(false);
      dialogBaselineRef.current = null;
      fetchList();
    } catch (e) {
      console.error(e);
      toast.error(editingId != null ? 'Failed to update' : 'Failed to add');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await presetMarksApi.delete(id);
      toast.success('Preset deleted');
      setDeleteConfirmId(null);
      fetchList();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete');
    }
  };

  if (!canViewPresetSettings) {
    return <ForbiddenPage moduleName="Preset Settings" />;
  }

  if (!hasBootstrapped) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
    );
  }

  if (!traderCanCustomizePresets) {
    return (
      <ForbiddenPage
        moduleName="Preset Settings"
        message="Your business uses administrator-defined preset marks for auctions. You cannot view or change them here."
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      <UnsavedChangesDialog />
      <div className="px-4 md:px-8 pt-4 lg:pt-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              void (async () => {
                const ok = await confirmIfDirty();
                if (!ok) return;
                navigate('/settings');
              })();
            }}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Sliders className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Preset Settings</h1>
            <p className="text-sm text-muted-foreground">Predefined marks and extra amounts (₹) for auction margin</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-border/40 overflow-hidden"
        >
          <div className="p-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Preset Mark Settings</h2>
            {canCreatePreset && (
              <Button size="sm" onClick={openCreate} className="gap-1.5">
                <Plus className="w-4 h-4" /> Add
              </Button>
            )}
          </div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Predefined Mark</TableHead>
                  <TableHead>Extra Amount (₹)</TableHead>
                  {canEditPreset && <TableHead className="w-[100px] text-right">Edit</TableHead>}
                  {canDeletePreset && <TableHead className="w-[80px] text-right">Delete</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2 + (canEditPreset ? 1 : 0) + (canDeletePreset ? 1 : 0)} className="text-center text-muted-foreground py-8">
                      No presets. Add one to use in Auctions.
                    </TableCell>
                  </TableRow>
                ) : (
                  list.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.predefined_mark}</TableCell>
                      <TableCell>₹{Number(row.extra_amount).toLocaleString('en-IN')}</TableCell>
                      {canEditPreset && (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Edit">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                      {canDeletePreset && (
                        <TableCell className="text-right">
                          {deleteConfirmId === row.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="destructive" onClick={() => handleDelete(row.id!)}>Yes</Button>
                              <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}>No</Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(row.id ?? null)} aria-label="Delete">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </motion.div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId != null ? 'Edit Preset' : 'Add Preset'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="preset-mark">Predefined Mark</Label>
              <Input
                id="preset-mark"
                value={formMark}
                onChange={(e) => setFormMark(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                placeholder="e.g. 10 or AB"
                maxLength={PREDEFINED_MARK_MAX}
                className={formErrors.mark ? 'border-destructive' : ''}
              />
              {formErrors.mark && <p className="text-sm text-destructive">{formErrors.mark}</p>}
              <p className="text-xs text-muted-foreground">Letters and numbers only, 1–20 characters (no spaces or special characters)</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="extra-amount">Extra Amount (₹)</Label>
              <Input
                id="extra-amount"
                type="number"
                min={EXTRA_AMOUNT_MIN}
                max={EXTRA_AMOUNT_MAX}
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0"
                className={formErrors.amount ? 'border-destructive' : ''}
              />
              {formErrors.amount && <p className="text-sm text-destructive">{formErrors.amount}</p>}
              <p className="text-xs text-muted-foreground">₹−1,00,000 – ₹1,00,000 (negative = loss)</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                void (async () => {
                  const ok = await confirmIfDirty();
                  if (!ok) return;
                  setDialogOpen(false);
                  dialogBaselineRef.current = null;
                })();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default PresetSettingsPage;
