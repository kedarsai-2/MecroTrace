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
import { globalPresetMarksApi, type GlobalPresetMarkSettingDTO } from '@/services/api/globalPresetMarks';
import { toast } from 'sonner';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import AdminForbiddenPage from '@/admin/components/AdminForbiddenPage';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';

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
  list: GlobalPresetMarkSettingDTO[],
  excludeId: number | null,
): boolean {
  const normalized = mark.trim().toLowerCase();
  if (!normalized) return false;
  return list.some(
    row =>
      (row.predefined_mark ?? '').toLowerCase() === normalized && (excludeId == null || row.id !== excludeId),
  );
}

const AdminGlobalPresetSettingsPage = () => {
  const navigate = useNavigate();
  const { canAccessModule } = useAdminPermissions();
  const canView = canAccessModule('Settings');

  const [list, setList] = useState<GlobalPresetMarkSettingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formMark, setFormMark] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formErrors, setFormErrors] = useState<{ mark?: string; amount?: string }>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const dialogBaselineRef = useRef<string | null>(null);

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
      const data = await globalPresetMarksApi.list();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load global presets');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) fetchList();
  }, [canView]);

  const openCreate = () => {
    setEditingId(null);
    setFormMark('');
    setFormAmount('');
    setFormErrors({});
    setDialogOpen(true);
    dialogBaselineRef.current = JSON.stringify({ editingId: null, mark: '', amount: '' });
  };

  const openEdit = (row: GlobalPresetMarkSettingDTO) => {
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
      const payload: GlobalPresetMarkSettingDTO = {
        predefined_mark: formMark.trim(),
        extra_amount: parseFloat(formAmount),
      };
      if (editingId != null) {
        await globalPresetMarksApi.update(editingId, payload);
        toast.success('Global preset updated');
      } else {
        await globalPresetMarksApi.create(payload);
        toast.success('Global preset added');
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
      await globalPresetMarksApi.delete(id);
      toast.success('Global preset deleted');
      setDeleteConfirmId(null);
      fetchList();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete');
    }
  };

  if (!canView) {
    return <AdminForbiddenPage moduleName="Settings" />;
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesDialog />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/settings')} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Sliders className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Global preset marks</h1>
          <p className="text-sm text-muted-foreground">
            Default auction margin presets for traders who do not have &quot;own presets&quot; enabled
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl border border-border/40 overflow-hidden"
      >
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Global preset mark settings</h2>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Predefined Mark</TableHead>
                <TableHead>Extra Amount (₹)</TableHead>
                <TableHead className="w-[100px] text-right">Edit</TableHead>
                <TableHead className="w-[80px] text-right">Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No global presets yet. Traders with preset disabled will have empty margin shortcuts until you add
                    some.
                  </TableCell>
                </TableRow>
              ) : (
                list.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.predefined_mark}</TableCell>
                    <TableCell>₹{Number(row.extra_amount).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      {deleteConfirmId === row.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(row.id!)}>
                            Yes
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}>
                            No
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(row.id ?? null)}
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </motion.div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId != null ? 'Edit global preset' : 'Add global preset'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="global-preset-mark">Predefined Mark</Label>
              <Input
                id="global-preset-mark"
                value={formMark}
                onChange={e => setFormMark(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                placeholder="e.g. 10 or AB"
                maxLength={PREDEFINED_MARK_MAX}
                className={formErrors.mark ? 'border-destructive' : ''}
              />
              {formErrors.mark && <p className="text-sm text-destructive">{formErrors.mark}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="global-extra-amount">Extra Amount (₹)</Label>
              <Input
                id="global-extra-amount"
                type="number"
                min={EXTRA_AMOUNT_MIN}
                max={EXTRA_AMOUNT_MAX}
                step="0.01"
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                placeholder="0"
                className={formErrors.amount ? 'border-destructive' : ''}
              />
              {formErrors.amount && <p className="text-sm text-destructive">{formErrors.amount}</p>}
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminGlobalPresetSettingsPage;
