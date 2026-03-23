import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, BookOpen, Plus, Lock, Unlock, Shield, Search, ChevronRight, Layers, Wallet, TrendingUp, TrendingDown, Building2, PiggyBank } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { COALedger, AccountingClass, LedgerClassification } from '@/types/accounting';
import { chartOfAccountsApi, dtoToCOALedger } from '@/services/api/chartOfAccounts';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import useAutofocusWhen from '@/hooks/useAutofocusWhen';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';

const CLASS_CONFIG: Record<AccountingClass, { label: string; icon: typeof Wallet; gradient: string; glow: string; chartColor: string }> = {
  ASSET: { label: 'Assets', icon: Wallet, gradient: 'from-emerald-400 to-teal-500', glow: 'shadow-emerald-500/20', chartColor: '#10b981' },
  LIABILITY: { label: 'Liabilities', icon: TrendingDown, gradient: 'from-rose-400 to-pink-500', glow: 'shadow-rose-500/20', chartColor: '#f43f5e' },
  EQUITY: { label: 'Equity', icon: PiggyBank, gradient: 'from-violet-400 to-purple-500', glow: 'shadow-violet-500/20', chartColor: '#8b5cf6' },
  INCOME: { label: 'Income', icon: TrendingUp, gradient: 'from-blue-400 to-cyan-500', glow: 'shadow-blue-500/20', chartColor: '#3b82f6' },
  EXPENSE: { label: 'Expenses', icon: Building2, gradient: 'from-amber-400 to-orange-500', glow: 'shadow-amber-500/20', chartColor: '#f59e0b' },
};

const CLASSIFICATION_OPTIONS: { value: LedgerClassification; label: string }[] = [
  { value: 'RECEIVABLE', label: 'Receivable (Asset)' },
  { value: 'PAYABLE', label: 'Payable (Liability)' },
  { value: 'BANK', label: 'Bank' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'LOAN', label: 'Loan' },
];

const CLASSIFICATION_TO_CLASS: Record<string, AccountingClass> = {
  RECEIVABLE: 'ASSET', BANK: 'ASSET', CASH: 'ASSET', INVENTORY: 'ASSET', TAX: 'ASSET', CONTROL: 'ASSET',
  PAYABLE: 'LIABILITY', LOAN: 'LIABILITY',
  INCOME: 'INCOME', EXPENSE: 'EXPENSE', EQUITY: 'EQUITY',
};

const AccountingPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Chart of Accounts');
  if (!canView) {
    return <ForbiddenPage moduleName="Accounting" />;
  }
  const [ledgers, setLedgers] = useState<COALedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedClass, setExpandedClass] = useState<AccountingClass | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClassification, setNewClassification] = useState<LedgerClassification>('RECEIVABLE');
  const [newOpening, setNewOpening] = useState('0');
  const [errors, setErrors] = useState<{ name?: string; opening?: string; classification?: string }>({});

  const ledgerNameInputRef = useRef<HTMLInputElement | null>(null);
  useAutofocusWhen(showAdd, ledgerNameInputRef);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const all: COALedger[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore && !cancelled) {
          const res = await chartOfAccountsApi.getPage({ page, size: 100, sort: 'ledgerName,asc' });
          res.content.forEach(dto => all.push(dtoToCOALedger(dto)));
          hasMore = page + 1 < res.totalPages;
          page += 1;
        }
        if (!cancelled) setLedgers(all);
      } catch {
        if (!cancelled) setLedgers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!search) return ledgers;
    const q = search.toLowerCase();
    return ledgers.filter(l => l.ledger_name.toLowerCase().includes(q));
  }, [ledgers, search]);

  const grouped = useMemo(() => {
    const g: Record<AccountingClass, COALedger[]> = { ASSET: [], LIABILITY: [], EQUITY: [], INCOME: [], EXPENSE: [] };
    filtered.forEach(l => { g[l.accounting_class]?.push(l); });
    return g;
  }, [filtered]);

  // Chart data — class totals
  const classChartData = useMemo(() => {
    return (Object.keys(CLASS_CONFIG) as AccountingClass[]).map(cls => ({
      name: CLASS_CONFIG[cls].label,
      total: grouped[cls].reduce((s, l) => s + l.current_balance, 0),
      fill: CLASS_CONFIG[cls].chartColor,
    })).filter(d => d.total > 0);
  }, [grouped]);

  const arControlLedger = ledgers.find(l => l.ledger_name.toLowerCase().includes('accounts receivable') && l.classification === 'CONTROL');
  const apControlLedger = ledgers.find(l => l.ledger_name.toLowerCase().includes('accounts payable') && l.classification === 'CONTROL');
  const arControlBalance = arControlLedger?.current_balance ?? 0;
  const arSubledgerSum = ledgers.filter(l => l.classification === 'RECEIVABLE').reduce((s, l) => s + l.current_balance, 0);
  const apControlBalance = apControlLedger?.current_balance ?? 0;
  const apSubledgerSum = ledgers.filter(l => l.classification === 'PAYABLE' && !l.is_system).reduce((s, l) => s + l.current_balance, 0);

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    const nextErrors: { name?: string; classification?: string; opening?: string } = {};

    if (!trimmedName) {
      nextErrors.name = 'Ledger name is required';
    } else if (trimmedName.length < 4) {
      nextErrors.name = 'Ledger name must be at least 4 characters';
    } else if (trimmedName.length > 50) {
      nextErrors.name = 'Ledger name must be at most 50 characters';
    }

    if (!newClassification) {
      nextErrors.classification = 'Classification is required';
    }

    const openingNum = parseFloat(newOpening);
    if (newOpening.trim() !== '' && !Number.isFinite(openingNum)) {
      nextErrors.opening = 'Enter a valid number';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parentId = newClassification === 'RECEIVABLE' ? arControlLedger?.ledger_id : newClassification === 'PAYABLE' ? apControlLedger?.ledger_id : undefined;
    const parentControlId = parentId != null && parentId !== '' ? Number(parentId) : null;
    if (!can('Chart of Accounts', 'Create')) {
      return;
    }
    try {
      const dto = await chartOfAccountsApi.create({
        ledgerName: trimmedName,
        classification: newClassification,
        openingBalance: Number.isFinite(openingNum) ? openingNum : 0,
        parentControlId: parentControlId ?? undefined,
      });
      setLedgers(prev => [...prev, dtoToCOALedger(dto)]);
      setNewName('');
      setNewOpening('0');
      setErrors({});
      setShowAdd(false);
    } catch (err) {
      console.error('Failed to create ledger', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center pb-28 lg:pb-6">
        <p className="text-muted-foreground">Loading chart of accounts…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 px-5 rounded-b-[2.5rem]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25)_0%,transparent_50%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center active:scale-95 transition-transform">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white">Chart of Accounts</h1>
                <p className="text-white/70 text-xs">GAAP Compliant Double-Entry Ledgers</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input aria-label="Search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ledgers…"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/15 backdrop-blur text-white placeholder:text-white/40 text-sm border border-white/20 outline-none" />
            </div>
          </div>
        </div>
      )}

      {/* Desktop Toolbar */}
      {isDesktop && (
        <div className="px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/home')} className="h-9 px-3 rounded-xl border border-border bg-background text-foreground text-sm font-medium flex items-center gap-1.5 hover:bg-muted transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <p className="text-sm text-muted-foreground">GAAP Compliant Double-Entry Ledgers</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input aria-label="Search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ledgers…"
                className="w-full pl-10 pr-4 h-10 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50" />
            </div>
            <button onClick={() => setShowAdd(true)} className="h-10 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-sm flex items-center gap-2 shadow-md">
              <Plus className="w-4 h-4" /> Create Ledger
            </button>
          </div>
        </div>
      )}

      {/* AR/AP Reconciliation */}
      <div className="px-4 -mt-4 relative z-10 mb-4">
        <div className="glass-card rounded-2xl p-4 flex gap-3 border border-emerald-200/20 dark:border-emerald-800/10">
          <div className="flex-1 text-center bg-gradient-to-br from-blue-500/10 to-cyan-500/5 rounded-xl p-3 border border-blue-200/20 dark:border-blue-800/10">
            <div className="w-8 h-8 mx-auto mb-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <p className="text-[9px] text-blue-600 dark:text-blue-400 uppercase tracking-wide font-bold">AR Control</p>
            <p className="text-lg font-black text-foreground">₹{arControlBalance.toLocaleString()}</p>
            <p className={cn('text-[10px] font-bold mt-0.5', arControlBalance === arSubledgerSum ? 'text-emerald-500' : 'text-destructive')}>
              {arControlBalance === arSubledgerSum ? '✓ Reconciled' : `⚠ Mismatch`}
            </p>
          </div>
          <div className="flex-1 text-center bg-gradient-to-br from-rose-500/10 to-pink-500/5 rounded-xl p-3 border border-rose-200/20 dark:border-rose-800/10">
            <div className="w-8 h-8 mx-auto mb-1.5 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-md">
              <TrendingDown className="w-4 h-4 text-white" />
            </div>
            <p className="text-[9px] text-rose-600 dark:text-rose-400 uppercase tracking-wide font-bold">AP Control</p>
            <p className="text-lg font-black text-foreground">₹{apControlBalance.toLocaleString()}</p>
            <p className={cn('text-[10px] font-bold mt-0.5', apControlBalance === apSubledgerSum ? 'text-emerald-500' : 'text-destructive')}>
              {apControlBalance === apSubledgerSum ? '✓ Reconciled' : `⚠ Mismatch`}
            </p>
          </div>
        </div>
      </div>

      {/* Class Overview Chart */}
      {classChartData.length > 0 && (
        <div className="px-4 mb-4">
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
              <BarChart className="w-4 h-4 text-primary" /> Account Class Overview
            </p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classChartData} layout="vertical" barSize={16}>
                  <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                    {classChartData.map((entry, i) => (
                      <rect key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Groups */}
      <div className="px-4 space-y-3">
        {(Object.keys(CLASS_CONFIG) as AccountingClass[]).map(cls => {
          const cfg = CLASS_CONFIG[cls];
          const items = grouped[cls];
          const isExpanded = expandedClass === cls;
          const total = items.reduce((s, l) => s + l.current_balance, 0);

          return (
            <motion.div key={cls} layout className="glass-card rounded-2xl overflow-hidden">
              <button onClick={() => setExpandedClass(isExpanded ? null : cls)}
                className="w-full flex items-center gap-3 p-4 text-left active:bg-muted/20 transition-colors">
                <div className={cn('w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md', cfg.gradient, cfg.glow)}>
                  <cfg.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground">{cfg.label}</p>
                  <p className="text-[11px] text-muted-foreground">{items.length} ledger{items.length !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-sm font-black text-foreground">₹{total.toLocaleString()}</p>
                <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-90')} />
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="px-4 pb-4 space-y-2">
                      {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">No ledgers in this category</p>}
                      {items.map(ledger => (
                        <motion.button key={ledger.ledger_id} onClick={() => navigate(`/ledger-view/${ledger.ledger_id}`)}
                          className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-background/50 hover:bg-background/80 active:scale-[0.98] transition-all text-left"
                          whileTap={{ scale: 0.98 }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-foreground truncate">{ledger.ledger_name}</p>
                              {ledger.is_system && <Shield className="w-3.5 h-3.5 text-primary shrink-0" />}
                              {ledger.is_locked ? <Lock className="w-3 h-3 text-amber-500 shrink-0" /> : <Unlock className="w-3 h-3 text-muted-foreground shrink-0" />}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{ledger.classification} {ledger.parent_control_id ? '→ Control' : ''}</p>
                          </div>
                          <p className={cn('text-sm font-bold', ledger.current_balance >= 0 ? 'text-foreground' : 'text-destructive')}>₹{Math.abs(ledger.current_balance).toLocaleString()}</p>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* FAB — mobile only */}
      {!isDesktop && (
        <motion.button onClick={() => setShowAdd(true)}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 z-20 active:scale-90 transition-transform"
          whileTap={{ scale: 0.9 }}>
          <Plus className="w-6 h-6 text-white" />
        </motion.button>
      )}

      {/* Add Ledger Sheet */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end lg:items-center justify-center" onClick={() => setShowAdd(false)}>
            <motion.div initial={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }} animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }} exit={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-t-3xl lg:rounded-3xl p-6 shadow-2xl lg:max-h-[85vh] lg:overflow-y-auto border border-border/30" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
              <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-5 lg:hidden" />
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" /> Create New Ledger
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">Ledger Name</label>
                  <input
                    ref={ledgerNameInputRef}
                    value={newName}
                    onChange={e => { setNewName(e.target.value); setErrors(prev => ({ ...prev, name: undefined })); }}
                    placeholder="e.g., ABC Traders – Receivable"
                    className={cn(
                      'w-full px-4 py-3.5 rounded-xl bg-muted text-foreground text-sm border outline-none focus:ring-2 focus:ring-primary/30',
                      errors.name ? 'border-destructive' : 'border-border',
                    )}
                  />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">Classification</label>
                  <select value={newClassification} onChange={e => { setNewClassification(e.target.value as LedgerClassification); setErrors(prev => ({ ...prev, classification: undefined })); }}
                    className={cn('w-full px-4 py-3.5 rounded-xl bg-muted text-foreground text-sm border outline-none', errors.classification ? 'border-destructive' : 'border-border')}>
                    {CLASSIFICATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {errors.classification && <p className="text-xs text-destructive mt-1">{errors.classification}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {newClassification === 'RECEIVABLE' && 'Auto-mapped to AR Control.'}
                    {newClassification === 'PAYABLE' && 'Auto-mapped to AP Control.'}
                    {newClassification === 'BANK' && 'Bank account ledger under Assets.'}
                    {newClassification === 'LOAN' && 'Loan ledger under Liabilities.'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">Opening Balance (₹)</label>
                  <input type="number" value={newOpening} onChange={e => { setNewOpening(e.target.value); setErrors(prev => ({ ...prev, opening: undefined })); }}
                    className={cn('w-full px-4 py-3.5 rounded-xl bg-muted text-foreground text-sm border outline-none focus:ring-2 focus:ring-primary/30', errors.opening ? 'border-destructive' : 'border-border')} />
                  {errors.opening && <p className="text-xs text-destructive mt-1">{errors.opening}</p>}
                </div>
                <button onClick={handleAdd} disabled={!newName.trim() || newName.trim().length < 4 || newName.trim().length > 50}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-50 active:scale-[0.98] transition-transform">
                  Create Ledger
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isDesktop && <BottomNav />}
    </div>
  );
};

export default AccountingPage;
