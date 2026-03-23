import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Edit2, Trash2, ChevronDown, ChevronRight, Search, ArrowLeft, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Role, ModulePermissions } from '@/types/rbac';
import { ADMIN_AVAILABLE_MODULES } from '@/admin/types/rbac';
import { rbacApi } from '@/services/api';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import AdminForbiddenPage from '@/admin/components/AdminForbiddenPage';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';

const emptyPermissions = (): ModulePermissions => {
  const perms: ModulePermissions = {};
  Object.entries(ADMIN_AVAILABLE_MODULES).forEach(([mod, features]) => {
    perms[mod] = { enabled: false, features: {} };
    features.forEach(f => {
      perms[mod].features[f] = false;
    });
  });
  return perms;
};

const AdminRoleManagementPage = () => {
  const navigate = useNavigate();
  const { canAccessModule } = useAdminPermissions();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<ModulePermissions>(emptyPermissions());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const formBaselineRef = useRef<string | null>(null);

  const getFormSnapshot = useCallback(
    () =>
      JSON.stringify({
        name: formName.trim(),
        description: formDesc.trim(),
        permissions: formPerms,
      }),
    [formName, formDesc, formPerms],
  );

  const isDialogDirty = useMemo(() => {
    if (!dialogOpen || formBaselineRef.current == null) return false;
    return getFormSnapshot() !== formBaselineRef.current;
  }, [dialogOpen, getFormSnapshot]);

  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isDialogDirty && !saving,
  });

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const data = await rbacApi.listRoles();
      setRoles((data || []) as Role[]);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const openCreate = () => {
    setEditingRole(null);
    setFormName('');
    setFormDesc('');
    setFormPerms(emptyPermissions());
    setExpandedModules(new Set());
    setDialogOpen(true);
    formBaselineRef.current = JSON.stringify({
      name: '',
      description: '',
      permissions: emptyPermissions(),
    });
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormDesc(role.description);
    const merged = emptyPermissions();
    Object.entries(role.permissions).forEach(([mod, val]) => {
      if (merged[mod]) {
        merged[mod].enabled = val.enabled;
        Object.entries(val.features || {}).forEach(([f, v]) => {
          if (merged[mod].features[f] !== undefined) merged[mod].features[f] = v;
        });
      }
    });
    setFormPerms(merged);
    setExpandedModules(new Set());
    setDialogOpen(true);
    formBaselineRef.current = JSON.stringify({
      name: role.name.trim(),
      description: role.description.trim(),
      permissions: merged,
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
      formBaselineRef.current = null;
    })();
  };

  const toggleModule = (mod: string) => {
    setFormPerms(prev => {
      const next = { ...prev };
      const enabled = !next[mod].enabled;
      next[mod] = { ...next[mod], enabled, features: { ...next[mod].features } };
      if (!enabled) Object.keys(next[mod].features).forEach(f => {
        next[mod].features[f] = false;
      });
      return next;
    });
  };

  const toggleFeature = (mod: string, feature: string) => {
    setFormPerms(prev => {
      const next = { ...prev };
      next[mod] = { ...next[mod], features: { ...next[mod].features, [feature]: !next[mod].features[feature] } };
      return next;
    });
  };

  const toggleExpand = (mod: string) => {
    setExpandedModules(prev => {
      const s = new Set(prev);
      if (s.has(mod)) s.delete(mod);
      else s.add(mod);
      return s;
    });
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Role name is required');
      return;
    }
    if (roles.some(r => r.name.toLowerCase() === formName.trim().toLowerCase() && r.id !== editingRole?.id)) {
      toast.error('A role with this name already exists');
      return;
    }
    setSaving(true);
    const payload = { name: formName.trim(), description: formDesc.trim(), permissions: formPerms as any };
    try {
      if (editingRole) {
        await rbacApi.updateRole(editingRole.id, payload);
        toast.success('Role updated');
      } else {
        await rbacApi.createRole(payload);
        toast.success('Role created');
      }
      setDialogOpen(false);
      formBaselineRef.current = null;
      fetchRoles();
    } catch (error) {
      console.error(error);
      toast.error(editingRole ? 'Failed to update role' : 'Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await rbacApi.deleteRole(id);
      toast.success('Role deleted');
      setDeleteConfirm(null);
      fetchRoles();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete role');
    }
  };

  const filtered = roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase()));
  const enabledCount = (perms: ModulePermissions) => Object.values(perms).filter(m => m.enabled).length;
  const totalFeatures = (perms: ModulePermissions) =>
    Object.values(perms).reduce(
      (sum, m) => sum + (m.enabled ? Object.values(m.features).filter(Boolean).length : 0),
      0,
    );

  const moduleColors: Record<string, string> = {
    Dashboard: 'from-sky-500/15 to-blue-500/10',
    Traders: 'from-blue-500/15 to-indigo-500/10',
    Categories: 'from-emerald-500/15 to-teal-500/10',
    Commodities: 'from-amber-500/15 to-orange-500/10',
    Contacts: 'from-rose-500/15 to-pink-500/10',
    Reports: 'from-violet-500/15 to-purple-500/10',
    Settings: 'from-slate-500/15 to-zinc-500/10',
  };

  if (!canAccessModule('Settings')) {
    return <AdminForbiddenPage moduleName="Settings" />;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-6">
      <UnsavedChangesDialog />
      <div className="px-4 md:px-8 pt-4 lg:pt-6 space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                void (async () => {
                  const ok = await confirmIfDirty();
                  if (!ok) return;
                  navigate('/admin/settings');
                })();
              }}
              aria-label="Back to settings"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl glass flex items-center justify-center hover:bg-muted/50 transition-colors border border-border/30"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 border border-white/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Role Management</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">Create and configure roles with granular permissions</p>
            </div>
          </div>
          <Button onClick={openCreate} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Create</span> Role
          </Button>
        </motion.div>

        {/* Stats Bar */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex gap-3 flex-wrap">
          <div className="glass-card rounded-xl px-4 py-2.5 border border-border/30 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-violet-500 animate-pulse" />
            <span className="text-xs font-semibold text-foreground">{roles.length}</span>
            <span className="text-xs text-muted-foreground">Total Roles</span>
          </div>
        </motion.div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search roles..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 glass border-border/30" />
        </div>

        {/* Roles List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <p className="font-semibold text-foreground">No roles found</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first role to get started</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block rounded-2xl border border-border/40 overflow-hidden glass-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-muted/40 to-muted/20">
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase">Role Name</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase">Description</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase">Modules</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase">Features</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase">Created</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((role, i) => (
                      <motion.tr
                        key={role.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-t border-border/20 hover:bg-muted/15 transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/15 to-indigo-600/15 flex items-center justify-center border border-blue-500/20">
                              <Shield className="w-4 h-4 text-primary" />
                            </div>
                            <span className="font-semibold text-foreground capitalize">{role.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs max-w-[200px] truncate">{role.description || 'No description'}</td>
                        <td className="px-5 py-3.5">
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border border-primary/15">
                            <Layers className="w-3 h-3 mr-1" />
                            {enabledCount(role.permissions)} modules
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant="secondary" className="text-[10px] bg-accent/10 text-accent-foreground">
                            {totalFeatures(role.permissions)} features
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">{new Date(role.created_at).toLocaleDateString()}</td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => openEdit(role)}
                              aria-label="Edit role"
                              className="w-8 h-8 min-w-[44px] min-h-[44px] rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors border border-primary/15"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-primary" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(role.id)}
                              aria-label="Delete role"
                              className="w-8 h-8 min-w-[44px] min-h-[44px] rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors border border-destructive/15"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile/Tablet Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:hidden">
              {filtered.map((role, i) => (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card rounded-2xl p-5 border border-border/40 hover:shadow-xl transition-all group relative overflow-hidden"
                >
                  <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-20 bg-gradient-to-br from-blue-500 to-indigo-600 group-hover:opacity-35 transition-opacity duration-500 pointer-events-none" />
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/15 to-indigo-600/15 flex items-center justify-center border border-blue-500/20">
                          <Shield className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground capitalize">{role.name}</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{role.description || 'No description'}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(role)}
                          aria-label="Edit role"
                          className="w-8 h-8 min-w-[44px] min-h-[44px] rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-primary" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(role.id)}
                          aria-label="Delete role"
                          className="w-8 h-8 min-w-[44px] min-h-[44px] rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold border border-primary/15">
                        <Layers className="w-3 h-3 inline mr-1" />
                        {enabledCount(role.permissions)} modules
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-accent/10 text-accent-foreground font-medium">
                        {totalFeatures(role.permissions)} features
                      </span>
                      <span className="text-muted-foreground ml-auto text-[10px]">{new Date(role.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md border border-white/20">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <DialogTitle className="text-lg">{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Role Name *</Label>
                  <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Manager" className="mt-1.5 glass border-border/30" />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Description</Label>
                  <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description" className="mt-1.5 glass border-border/30" />
                </div>
              </div>

              <div>
                <Label className="mb-3 block text-xs font-semibold uppercase text-muted-foreground">Module & Feature Permissions</Label>
                <div className="space-y-2 rounded-2xl border border-border/30 p-3 glass">
                  {Object.entries(ADMIN_AVAILABLE_MODULES).map(([mod, features]) => {
                    const colorClass = moduleColors[mod] || 'from-primary/15 to-accent/10';
                    return (
                      <div key={mod} className="rounded-xl border border-border/30 overflow-hidden">
                        <div className={cn('flex items-center gap-3 px-4 py-3 bg-gradient-to-r', colorClass)}>
                          <Switch checked={formPerms[mod]?.enabled || false} onCheckedChange={() => toggleModule(mod)} />
                          <button onClick={() => toggleExpand(mod)} className="flex-1 flex items-center gap-2 text-sm font-semibold text-foreground text-left">
                            {expandedModules.has(mod) ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4" />}
                            {mod}
                          </button>
                          <span
                            className={cn(
                              'text-[10px] font-medium px-2 py-0.5 rounded-full',
                              formPerms[mod]?.enabled ? 'bg-primary/15 text-primary' : 'bg-muted/50 text-muted-foreground',
                            )}
                          >
                            {features.length} features
                          </span>
                        </div>
                        <AnimatePresence>
                          {expandedModules.has(mod) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-2 bg-background/50 border-t border-border/20">
                                {features.map(f => (
                                  <label
                                    key={f}
                                    className={cn(
                                      'flex items-center gap-2 text-xs cursor-pointer px-2.5 py-2 rounded-lg hover:bg-muted/40 transition-colors border border-transparent hover:border-border/30',
                                      !formPerms[mod]?.enabled && 'opacity-35 pointer-events-none',
                                    )}
                                  >
                                    <Checkbox
                                      checked={formPerms[mod]?.features?.[f] || false}
                                      onCheckedChange={() => toggleFeature(mod, f)}
                                      disabled={!formPerms[mod]?.enabled}
                                    />
                                    <span className="font-medium">{f}</span>
                                  </label>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
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
                    formBaselineRef.current = null;
                  })();
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="shadow-lg shadow-primary/20">
                {saving ? 'Saving...' : editingRole ? 'Update Role' : 'Create Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <DialogTitle>Delete Role?</DialogTitle>
              </div>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will remove the role and unassign it from all users. This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminRoleManagementPage;

