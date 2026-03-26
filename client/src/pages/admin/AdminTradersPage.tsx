import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, CheckCircle2, XCircle, Clock, Eye,
  Building2, Phone, Mail, MapPin, Crown, Users2,
  Power, PowerOff, Trash2, AlertTriangle, Sliders,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { traderApi } from '@/services/api';
import type { Trader, ApprovalStatus } from '@/types/models';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import AdminForbiddenPage from '@/admin/components/AdminForbiddenPage';

const statusConfig: Record<ApprovalStatus, { color: string; icon: typeof CheckCircle2; label: string }> = {
  PENDING: { color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: Clock, label: 'Pending' },
  APPROVED: { color: 'bg-success/10 text-success', icon: CheckCircle2, label: 'Approved' },
  REJECTED: { color: 'bg-destructive/10 text-destructive', icon: XCircle, label: 'Rejected' },
};

const LOC_PREVIEW_LEN = 10;

function formatTableDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  if (status === 'APPROVED') {
    return (
      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90 shadow-none pointer-events-none whitespace-nowrap">
        Approved
      </Badge>
    );
  }
  if (status === 'REJECTED') {
    return (
      <Badge variant="destructive" className="shadow-none pointer-events-none whitespace-nowrap">
        Rejected
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-amber-500 text-white hover:bg-amber-500/90 shadow-none pointer-events-none whitespace-nowrap">
      Pending
    </Badge>
  );
}

function traderLocationLine(t: { city?: string; state?: string }): string {
  const parts = [t.city, t.state].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function LocationCell({
  traderId,
  expanded,
  onToggle,
  full,
}: {
  traderId: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  full: string;
}) {
  const needsTruncate = full.length > LOC_PREVIEW_LEN;
  const shown = needsTruncate && !expanded ? `${full.slice(0, LOC_PREVIEW_LEN)}…` : full;
  return (
    <button
      type="button"
      onClick={() => needsTruncate && onToggle(traderId)}
      className={cn(
        'text-left text-muted-foreground max-w-[200px]',
        needsTruncate && 'cursor-pointer hover:text-foreground underline-offset-2 hover:underline',
      )}
      title={needsTruncate ? (expanded ? 'Click to collapse' : 'Click to expand') : undefined}
    >
      {shown}
    </button>
  );
}

type Tab = 'active' | 'inactive';

const AdminTradersPage = () => {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [inactiveTraders, setInactiveTraders] = useState<Trader[]>([]);
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus | 'ALL'>('ALL');
  const [selectedTrader, setSelectedTrader] = useState<Trader | null>(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<Trader | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<Trader | null>(null);
  const [activateConfirm, setActivateConfirm] = useState<Trader | null>(null);
  const [expandedLocationIds, setExpandedLocationIds] = useState<Set<string>>(() => new Set());
  const [presetToggleTraderId, setPresetToggleTraderId] = useState<string | null>(null);
  const { canAccessModule, can } = useAdminPermissions();

  const canView = canAccessModule('Traders');
  const canApprove = can('Traders', 'Approve');

  if (!canView) {
    return <AdminForbiddenPage moduleName="Traders" />;
  }

  const loadActive = () => traderApi.listForAdmin({ page: 0, size: 500 }).then(setTraders).catch(() => setTraders([]));
  const loadInactive = () => traderApi.listInactive({ page: 0, size: 500 }).then(setInactiveTraders).catch(() => setInactiveTraders([]));

  const toggleLocationExpanded = useCallback((id: string) => {
    setExpandedLocationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    loadActive();
  }, []);

  useEffect(() => {
    if (tab === 'inactive') loadInactive();
  }, [tab]);

  const filtered = traders.filter(t => {
    const matchSearch = t.business_name.toLowerCase().includes(search.toLowerCase()) || t.owner_name.toLowerCase().includes(search.toLowerCase()) || (t.city || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'ALL' || t.approval_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const filteredInactive = inactiveTraders.filter(t =>
    t.business_name.toLowerCase().includes(search.toLowerCase()) || t.owner_name.toLowerCase().includes(search.toLowerCase()) || (t.city || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleApprove = async (id: string) => {
    if (!canApprove) return;
    try {
      const updated = await traderApi.approve(id);
      setTraders(prev => prev.map(t => t.trader_id === id ? updated : t));
      setSelectedTrader(null);
    } catch { /* keep UI state */ }
  };

  const handleReject = async (id: string) => {
    if (!canApprove) return;
    try {
      const updated = await traderApi.reject(id);
      setTraders(prev => prev.map(t => t.trader_id === id ? updated : t));
      setSelectedTrader(null);
    } catch { /* keep UI state */ }
  };

  const handleActivate = async (id: string) => {
    if (!canApprove) return;
    try {
      await traderApi.activate(id);
      setActivateConfirm(null);
      setSelectedTrader(null);
      loadActive();
      loadInactive();
    } catch { /* keep UI state */ }
  };

  const handleDeactivate = async (id: string) => {
    if (!canApprove) return;
    try {
      await traderApi.deactivate(id);
      setDeactivateConfirm(null);
      setSelectedTrader(null);
      loadActive();
      loadInactive();
    } catch { /* keep UI state */ }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!canApprove) return;
    try {
      await traderApi.permanentDelete(id);
      setPermanentDeleteConfirm(null);
      setSelectedTrader(null);
      loadInactive();
    } catch { /* keep UI state */ }
  };

  const handlePresetEnabledChange = async (t: Trader, enabled: boolean) => {
    if (!canApprove) return;
    setPresetToggleTraderId(t.trader_id);
    try {
      const updated = await traderApi.setPresetEnabled(t.trader_id, enabled);
      setTraders(prev => prev.map(x => (x.trader_id === t.trader_id ? updated : x)));
      setInactiveTraders(prev => prev.map(x => (x.trader_id === t.trader_id ? updated : x)));
      setSelectedTrader(prev => (prev?.trader_id === t.trader_id ? updated : prev));
      toast.success(enabled ? 'Trader can use own preset settings' : 'Trader now uses global presets');
    } catch {
      toast.error('Could not update preset setting');
    } finally {
      setPresetToggleTraderId(null);
    }
  };

  const counts = {
    ALL: traders.length,
    PENDING: traders.filter(t => t.approval_status === 'PENDING').length,
    APPROVED: traders.filter(t => t.approval_status === 'APPROVED').length,
    REJECTED: traders.filter(t => t.approval_status === 'REJECTED').length,
    INACTIVE: inactiveTraders.length,
  };

  return (
    <div className="space-y-5 relative">
      <div className="fixed pointer-events-none z-0" style={{ left: 0, right: 0, top: 0, bottom: 0 }}>
        <div className="absolute bottom-0 right-1/4 w-[450px] h-[450px] bg-gradient-to-tl from-blue-500/8 via-cyan-400/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/4 left-0 w-[400px] h-[400px] bg-gradient-to-br from-violet-500/7 via-purple-400/4 to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Users2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Trader Management</h1>
            <p className="text-sm text-muted-foreground">{traders.length} active, {inactiveTraders.length} inactive</p>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="flex gap-3 relative z-10">
        {[
          { label: 'Active', value: counts.ALL, gradient: 'from-primary to-accent', icon: Crown },
          { label: 'Pending', value: counts.PENDING, gradient: 'from-amber-400 to-orange-500', icon: Clock },
          { label: 'Approved', value: counts.APPROVED, gradient: 'from-emerald-400 to-teal-500', icon: CheckCircle2 },
          { label: 'Rejected', value: counts.REJECTED, gradient: 'from-rose-400 to-red-500', icon: XCircle },
          { label: 'Inactive', value: counts.INACTIVE, gradient: 'from-slate-400 to-slate-500', icon: PowerOff },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.06 }}
            className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3 min-w-[100px]">
            <div className={cn('w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md', s.gradient)}>
              <s.icon className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex items-center gap-3 flex-wrap relative z-10">
        <div className="flex gap-2">
          {([
            { key: 'active' as Tab, label: 'Active Traders', icon: Power },
            { key: 'inactive' as Tab, label: 'Inactive Traders', icon: PowerOff },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all', tab === t.key ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md' : 'glass-card text-muted-foreground hover:text-foreground')}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search traders…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10 rounded-xl" />
        </div>
        {tab === 'active' && (
          <div className="flex gap-2">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={cn('px-3 py-2 rounded-xl text-xs font-semibold transition-all', filterStatus === s ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md' : 'glass-card text-muted-foreground hover:text-foreground')}>
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl overflow-hidden relative z-10 border border-white/40 dark:border-white/10">
        <div className="relative z-10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-b border-primary/10">
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Registration date</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Approved / Rejected date</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Preset</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tab === 'active' && filtered.map((t, i) => {
                const loc = traderLocationLine(t);
                return (
                  <motion.tr key={t.trader_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.04 }}
                    className="border-b border-border/20 hover:bg-primary/5 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md shadow-primary/20">
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-semibold text-foreground">{t.business_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">{t.owner_name}</td>
                    <td className="py-3.5 px-4">
                      <LocationCell
                        traderId={t.trader_id}
                        expanded={expandedLocationIds.has(t.trader_id)}
                        onToggle={toggleLocationExpanded}
                        full={loc}
                      />
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">{formatTableDate(t.created_at)}</td>
                    <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                      {t.approval_status === 'PENDING' ? '—' : formatTableDate(t.approval_decision_at)}
                    </td>
                    <td className="py-3.5 px-4">
                      <ApprovalStatusBadge status={t.approval_status} />
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex justify-center" title="Allow this trader to define their own auction preset marks (off = global admin presets)">
                        <Switch
                          checked={t.preset_enabled !== false}
                          disabled={!canApprove || presetToggleTraderId === t.trader_id}
                          onCheckedChange={v => handlePresetEnabledChange(t, v)}
                          aria-label="Trader own preset settings"
                        />
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setSelectedTrader(t)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                        {t.approval_status === 'PENDING' && canApprove && (
                          <button onClick={() => handleApprove(t.trader_id)} className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-all" title="Approve">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {t.approval_status === 'PENDING' && canApprove && (
                          <button onClick={() => handleReject(t.trader_id)} className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all" title="Reject">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {canApprove && (
                          <button onClick={() => setDeactivateConfirm(t)} className="p-2 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-all" title="Deactivate">
                            <PowerOff className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
              {tab === 'inactive' && filteredInactive.map((t, i) => {
                const loc = traderLocationLine(t);
                return (
                  <motion.tr key={t.trader_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.04 }}
                    className="border-b border-border/20 hover:bg-primary/5 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-500/30 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-slate-400" />
                        </div>
                        <span className="font-semibold text-foreground">{t.business_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">{t.owner_name}</td>
                    <td className="py-3.5 px-4">
                      <LocationCell
                        traderId={t.trader_id}
                        expanded={expandedLocationIds.has(t.trader_id)}
                        onToggle={toggleLocationExpanded}
                        full={loc}
                      />
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">{formatTableDate(t.created_at)}</td>
                    <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                      {t.approval_status === 'PENDING' ? '—' : formatTableDate(t.approval_decision_at)}
                    </td>
                    <td className="py-3.5 px-4">
                      <ApprovalStatusBadge status={t.approval_status} />
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex justify-center" title="Allow this trader to define their own auction preset marks (off = global admin presets)">
                        <Switch
                          checked={t.preset_enabled !== false}
                          disabled={!canApprove || presetToggleTraderId === t.trader_id}
                          onCheckedChange={v => handlePresetEnabledChange(t, v)}
                          aria-label="Trader own preset settings"
                        />
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setSelectedTrader(t)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                        {canApprove && (
                          <button onClick={() => setActivateConfirm(t)} className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-all" title="Activate">
                            <Power className="w-4 h-4" />
                          </button>
                        )}
                        {canApprove && (
                          <button onClick={() => setPermanentDeleteConfirm(t)} className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all" title="Permanent delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {tab === 'active' && filtered.length === 0 && <div className="p-12 text-center text-muted-foreground">No active traders found</div>}
        {tab === 'inactive' && filteredInactive.length === 0 && <div className="p-12 text-center text-muted-foreground">No inactive traders found</div>}
      </motion.div>

      <AnimatePresence>
        {selectedTrader && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelectedTrader(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-lg glass-card rounded-2xl p-6 shadow-elevated border border-white/30 dark:border-white/10 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{selectedTrader.business_name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedTrader.category}</p>
                    </div>
                  </div>
                  <span className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold', statusConfig[selectedTrader.approval_status].color)}>
                    {statusConfig[selectedTrader.approval_status].label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl glass-card mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <Sliders className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Own preset settings</p>
                      <p className="text-sm text-foreground font-medium">
                        {selectedTrader.preset_enabled !== false
                          ? 'On — trader can edit presets in Settings'
                          : 'Off — uses global admin presets in auction'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={selectedTrader.preset_enabled !== false}
                    disabled={!canApprove || presetToggleTraderId === selectedTrader.trader_id}
                    onCheckedChange={v => handlePresetEnabledChange(selectedTrader, v)}
                    aria-label="Toggle trader preset settings"
                  />
                </div>
                <div className="space-y-3 mb-6">
                  {[
                    { icon: Clock, label: 'Registration date', value: formatTableDate(selectedTrader.created_at) },
                    {
                      icon: CheckCircle2,
                      label: 'Approved / Rejected date',
                      value:
                        selectedTrader.approval_status === 'PENDING'
                          ? '—'
                          : formatTableDate(selectedTrader.approval_decision_at),
                    },
                    { icon: Building2, label: 'Owner', value: selectedTrader.owner_name },
                    { icon: Phone, label: 'Mobile', value: selectedTrader.mobile || '' },
                    { icon: Mail, label: 'Email', value: selectedTrader.email || '' },
                    { icon: MapPin, label: 'Address', value: `${selectedTrader.address}, ${selectedTrader.city}, ${selectedTrader.state} - ${selectedTrader.pin_code}` },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl glass-card">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <item.icon className="w-4 h-4 text-primary flex-shrink-0" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                        <p className="text-sm text-foreground font-medium">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 flex-wrap">
                  {selectedTrader.approval_status === 'PENDING' && canApprove && (
                    <Button onClick={() => handleApprove(selectedTrader.trader_id)} className="flex-1 min-w-[120px] bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl h-11">
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                    </Button>
                  )}
                  {selectedTrader.approval_status === 'PENDING' && canApprove && (
                    <Button onClick={() => handleReject(selectedTrader.trader_id)} variant="outline" className="flex-1 min-w-[120px] border-destructive/50 text-destructive hover:bg-destructive/10 rounded-xl h-11">
                      <XCircle className="w-4 h-4 mr-2" /> Reject
                    </Button>
                  )}
                  {canApprove && tab === 'active' && (
                    <Button onClick={() => { setSelectedTrader(null); setDeactivateConfirm(selectedTrader); }} variant="outline" className="flex-1 min-w-[120px] border-amber-500/50 text-amber-600 hover:bg-amber-500/10 rounded-xl h-11">
                      <PowerOff className="w-4 h-4 mr-2" /> Deactivate
                    </Button>
                  )}
                  {canApprove && tab === 'inactive' && (
                    <>
                      <Button onClick={() => { setSelectedTrader(null); setActivateConfirm(selectedTrader); }} className="flex-1 min-w-[120px] bg-success text-white rounded-xl h-11">
                        <Power className="w-4 h-4 mr-2" /> Activate
                      </Button>
                      <Button onClick={() => { setSelectedTrader(null); setPermanentDeleteConfirm(selectedTrader); }} variant="outline" className="flex-1 min-w-[120px] border-destructive/50 text-destructive hover:bg-destructive/10 rounded-xl h-11">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Permanently
                      </Button>
                    </>
                  )}
                  <Button onClick={() => setSelectedTrader(null)} variant="outline" className="flex-1 min-w-[80px] rounded-xl h-11">Close</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deactivateConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDeactivateConfirm(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-md glass-card rounded-2xl p-6 shadow-elevated border border-amber-500/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <PowerOff className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Deactivate Trader</h3>
                  <p className="text-sm text-muted-foreground">Trader and staff will not be able to log in</p>
                </div>
              </div>
              <p className="text-sm text-foreground mb-6">
                Deactivate <strong>{deactivateConfirm.business_name}</strong>? The trader and their staff will be blocked from logging in until reactivated.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setDeactivateConfirm(null)} variant="outline" className="flex-1 rounded-xl h-11">Cancel</Button>
                <Button onClick={() => handleDeactivate(deactivateConfirm.trader_id)} className="flex-1 bg-amber-500 text-white hover:bg-amber-600 rounded-xl h-11">
                  <PowerOff className="w-4 h-4 mr-2" /> Deactivate
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activateConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setActivateConfirm(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-md glass-card rounded-2xl p-6 shadow-elevated border border-success/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                  <Power className="w-6 h-6 text-success" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Activate Trader</h3>
                  <p className="text-sm text-muted-foreground">Allow trader and staff to log in</p>
                </div>
              </div>
              <p className="text-sm text-foreground mb-6">
                Activate <strong>{activateConfirm.business_name}</strong>? The trader and their staff will be able to log in again.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setActivateConfirm(null)} variant="outline" className="flex-1 rounded-xl h-11">Cancel</Button>
                <Button onClick={() => handleActivate(activateConfirm.trader_id)} className="flex-1 bg-success text-white hover:bg-success/90 rounded-xl h-11">
                  <Power className="w-4 h-4 mr-2" /> Activate
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {permanentDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setPermanentDeleteConfirm(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-md glass-card rounded-2xl p-6 shadow-elevated border border-destructive/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Permanent Delete</h3>
                  <p className="text-sm text-muted-foreground">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-foreground mb-6">
                Permanently delete <strong>{permanentDeleteConfirm.business_name}</strong>? This will remove the trader and <strong>all associated data</strong> (users, roles, vehicles, lots, auctions, commodities, vouchers, CDN, stocks, etc.) from the system. <strong>All data will be permanently deleted. No retrieval possible!</strong>
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setPermanentDeleteConfirm(null)} variant="outline" className="flex-1 rounded-xl h-11">Cancel</Button>
                <Button onClick={() => handlePermanentDelete(permanentDeleteConfirm.trader_id)} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl h-11">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Permanently
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminTradersPage;
