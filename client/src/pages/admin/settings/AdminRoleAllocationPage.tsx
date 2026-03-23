import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserCog, Search, Save, ArrowLeft, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import type { Profile, Role, UserRole } from '@/types/rbac';
import { rbacApi } from '@/services/api';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import AdminForbiddenPage from '@/admin/components/AdminForbiddenPage';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';

const AdminRoleAllocationPage = () => {
  const navigate = useNavigate();
  const { canAccessModule } = useAdminPermissions();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const dialogBaselineRef = useRef<string | null>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [profilesData, rolesData, userRolesData] = await Promise.all([
        rbacApi.listProfiles(),
        rbacApi.listRoles(),
        rbacApi.listUserRoles(),
      ]);
      setProfiles(profilesData as Profile[]);
      setRoles(rolesData.map((r: Role) => ({ ...r, permissions: r.permissions || {} })) as Role[]);
      setUserRoles(userRolesData as UserRole[]);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load role allocation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const getDialogSnapshot = useCallback(
    () =>
      JSON.stringify({
        profileId: selectedProfile?.id ?? null,
        roleIds: Array.from(selectedRoleIds).sort(),
      }),
    [selectedProfile, selectedRoleIds],
  );

  const isDialogDirty = useMemo(() => {
    if (!dialogOpen || dialogBaselineRef.current == null) return false;
    return getDialogSnapshot() !== dialogBaselineRef.current;
  }, [dialogOpen, getDialogSnapshot]);

  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isDialogDirty && !saving,
  });

  const getUserRoles = (profileId: string) =>
    userRoles
      .filter(ur => ur.user_id === profileId)
      .map(ur => roles.find(r => r.id === ur.role_id))
      .filter(Boolean) as Role[];

  const openAllocate = (profile: Profile) => {
    setSelectedProfile(profile);
    const currentRoleIds = userRoles.filter(ur => ur.user_id === profile.id).map(ur => ur.role_id);
    setSelectedRoleIds(new Set(currentRoleIds));
    setDialogOpen(true);
    dialogBaselineRef.current = JSON.stringify({
      profileId: profile.id,
      roleIds: [...currentRoleIds].sort(),
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

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds(prev => {
      const s = new Set(prev);
      if (s.has(roleId)) s.delete(roleId);
      else s.add(roleId);
      return s;
    });
  };

  const handleSave = async () => {
    if (!selectedProfile) return;
    setSaving(true);
    const newRoleIds = [...selectedRoleIds];
    try {
      await rbacApi.setUserRoles(selectedProfile.id, newRoleIds);
      toast.success('Roles updated successfully');
      setDialogOpen(false);
      dialogBaselineRef.current = null;
      fetchAll();
    } catch (error) {
      console.error(error);
      toast.error('Failed to update role assignments');
    } finally {
      setSaving(false);
    }
  };

  const filtered = profiles.filter(
    p => p.full_name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase()),
  );

  const avatarGradients = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-blue-600',
  ];

  const roleColors = [
    'bg-blue-500/10 text-blue-600 border-blue-500/20',
    'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    'bg-violet-500/10 text-violet-600 border-violet-500/20',
    'bg-amber-500/10 text-amber-600 border-amber-500/20',
    'bg-rose-500/10 text-rose-600 border-rose-500/20',
  ];

  if (!canAccessModule('Settings')) {
    return <AdminForbiddenPage moduleName="Settings" />;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-6">
      <UnsavedChangesDialog />
      <div className="px-4 md:px-8 pt-4 lg:pt-6 space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
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
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 border border-white/20">
            <UserCog className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Role Allocation</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">Assign and manage roles for each user</p>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex gap-3 flex-wrap">
          <div className="glass-card rounded-xl px-4 py-2.5 border border-border/30 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-violet-500 to-purple-500" />
            <span className="text-xs font-semibold text-foreground">{profiles.length}</span>
            <span className="text-xs text-muted-foreground">Users</span>
          </div>
          <div className="glass-card rounded-xl px-4 py-2.5 border border-border/30 flex items-center gap-2">
            <Shield className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold text-foreground">{roles.length}</span>
            <span className="text-xs text-muted-foreground">Roles Available</span>
          </div>
        </motion.div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 glass border-border/30" />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 flex items-center justify-center">
              <UserCog className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <p className="font-semibold text-foreground">No users found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p, i) => {
              const pRoles = getUserRoles(p.id);
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="glass-card rounded-2xl p-5 border border-border/40 hover:shadow-xl transition-all relative overflow-hidden group"
                >
                  {/* Accent blobs */}
                  <div
                    className={cn(
                      'absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-15 bg-gradient-to-br group-hover:opacity-30 transition-opacity duration-500 pointer-events-none',
                      avatarGradients[i % avatarGradients.length],
                    )}
                  />
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-md border border-white/20',
                            avatarGradients[i % avatarGradients.length],
                          )}
                        >
                          <span className="text-sm font-bold text-white">{p.full_name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-bold text-foreground text-sm">{p.full_name || 'Unnamed'}</p>
                          <p className="text-[11px] text-muted-foreground">{p.email}</p>
                        </div>
                      </div>
                      <Badge
                        variant={p.status === 'active' ? 'default' : 'secondary'}
                        className={cn(
                          'text-[10px] capitalize',
                          p.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                            : 'bg-muted/50',
                        )}
                      >
                        {p.status}
                      </Badge>
                    </div>

                    <div className="mb-4">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Assigned Roles</p>
                      <div className="flex gap-1.5 flex-wrap min-h-[26px]">
                        {pRoles.length ? (
                          pRoles.map((r, ri) => (
                            <Badge
                              key={r.id}
                              variant="secondary"
                              className={cn('text-[10px] capitalize border', roleColors[ri % roleColors.length])}
                            >
                              <Shield className="w-2.5 h-2.5 mr-1" />
                              {r.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No roles assigned</span>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAllocate(p)}
                      className="w-full gap-2 glass border-border/30 hover:bg-muted/30 h-10"
                    >
                      <UserCog className="w-4 h-4" /> Manage Roles
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Allocate Dialog */}
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md border border-white/20">
                  <UserCog className="w-5 h-5 text-white" />
                </div>
                <DialogTitle>Assign Roles to {selectedProfile?.full_name}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-2 py-2">
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No roles created yet. Create roles first.</p>
              ) : (
                roles.map((role, ri) => (
                  <label
                    key={role.id}
                    className={cn(
                      'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all',
                      selectedRoleIds.has(role.id)
                        ? 'border-primary/30 bg-primary/5 shadow-sm'
                        : 'border-border/40 hover:bg-muted/20 hover:border-border/60',
                    )}
                  >
                    <Checkbox checked={selectedRoleIds.has(role.id)} onCheckedChange={() => toggleRole(role.id)} />
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 border border-white/20',
                        avatarGradients[ri % avatarGradients.length],
                      )}
                    >
                      <Shield className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground capitalize">{role.name}</p>
                      <p className="text-[11px] text-muted-foreground">{role.description || 'No description'}</p>
                    </div>
                  </label>
                ))
              )}
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
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2 shadow-lg shadow-primary/20">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Assignments'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminRoleAllocationPage;

