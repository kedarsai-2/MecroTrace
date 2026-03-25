import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, FileText, Receipt, HandCoins, ArrowRightLeft, Landmark, BadgeAlert, Eraser, Search, Filter, ChevronDown, Check, X, Banknote, Smartphone, Building2, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { VoucherHeader, VoucherLine, VoucherType, VoucherLifecycle, COALedger, PaymentModeType } from '@/types/accounting';
import { chartOfAccountsApi, dtoToCOALedger } from '@/services/api/chartOfAccounts';
import { voucherHeadersApi } from '@/services/api/voucherHeaders';
import { toast } from 'sonner';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

const AMOUNT_MAX = 1_000_000;
const NARRATION_MIN_LEN = 2;
const NARRATION_MAX_LEN = 100;

const VOUCHER_CONFIG: Record<VoucherType, { label: string; icon: typeof FileText; gradient: string; debitLabel: string; creditLabel: string }> = {
  SALES_BILL: { label: 'Sales Bill', icon: FileText, gradient: 'from-blue-400 to-cyan-500', debitLabel: 'Receivable', creditLabel: 'Income/Payable' },
  SALES_SETTLEMENT: { label: 'Sales Settlement', icon: Receipt, gradient: 'from-rose-400 to-pink-500', debitLabel: 'Expense/Payable', creditLabel: 'Payable' },
  RECEIPT: { label: 'Receipt', icon: HandCoins, gradient: 'from-emerald-400 to-teal-500', debitLabel: 'Cash/Bank', creditLabel: 'Receivable' },
  PAYMENT: { label: 'Payment', icon: Banknote, gradient: 'from-amber-400 to-orange-500', debitLabel: 'Payable', creditLabel: 'Cash/Bank' },
  JOURNAL: { label: 'Journal', icon: ArrowRightLeft, gradient: 'from-violet-400 to-purple-500', debitLabel: 'Any', creditLabel: 'Any' },
  CONTRA: { label: 'Contra', icon: Landmark, gradient: 'from-indigo-400 to-blue-500', debitLabel: 'Cash/Bank', creditLabel: 'Cash/Bank' },
  ADVANCE: { label: 'Advance', icon: BadgeAlert, gradient: 'from-fuchsia-400 to-pink-500', debitLabel: 'Advance', creditLabel: 'Cash/Bank' },
  WRITE_OFF: { label: 'Write-Off', icon: Eraser, gradient: 'from-red-400 to-rose-500', debitLabel: 'Bad Debt', creditLabel: 'Receivable/Payable' },
};

const STATUS_COLORS: Record<VoucherLifecycle, string> = {
  DRAFT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  POSTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  PARTIALLY_SETTLED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  CLOSED: 'bg-muted text-muted-foreground',
  REVERSED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const VouchersPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Vouchers & Payments');
  if (!canView) {
    return <ForbiddenPage moduleName="Vouchers" />;
  }
  const [vouchers, setVouchers] = useState<VoucherHeader[]>([]);
  const [selectedVoucherLines, setSelectedVoucherLines] = useState<VoucherLine[]>([]);
  const [ledgers, setLedgers] = useState<COALedger[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<VoucherType | 'ALL'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherHeader | null>(null);
  const [loadingVouchers, setLoadingVouchers] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [pendingRemoveLine, setPendingRemoveLine] = useState<number | null>(null);

  // Load Chart of Accounts only when Create Voucher sheet is opened (for ledger dropdown)
  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    setLoadingLedgers(true);
    const load = async () => {
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
        if (!cancelled) setLoadingLedgers(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [showCreate]);

  useEffect(() => {
    let cancelled = false;
    setLoadingVouchers(true);
    voucherHeadersApi
      .getPage({
        page: 0,
        size: 50,
        sort: 'createdDate,desc',
        voucherType: filterType === 'ALL' ? '' : filterType,
        search: search.trim() || undefined,
      })
      .then((res) => {
        if (!cancelled) setVouchers(res.content);
      })
      .catch(() => {
        if (!cancelled) setVouchers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingVouchers(false);
      });
    return () => { cancelled = true; };
  }, [filterType, search]);

  // Create form state
  const [createType, setCreateType] = useState<VoucherType>('RECEIPT');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<{ ledger_id: string; debit: string; credit: string }[]>([
    { ledger_id: '', debit: '', credit: '' },
    { ledger_id: '', debit: '', credit: '' },
  ]);
  const [paymentMode, setPaymentMode] = useState<PaymentModeType>('CASH');

  const filtered = useMemo(() => vouchers, [vouchers]);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = totalDebit > 0 && totalDebit === totalCredit;

  const addLine = () => setLines([...lines, { ledger_id: '', debit: '', credit: '' }]);
  const removeLine = (i: number) => { if (lines.length > 2) setLines(lines.filter((_, idx) => idx !== i)); };

  const openVoucherDetail = (v: VoucherHeader) => {
    setSelectedVoucher(v);
    setLoadingDetail(true);
    voucherHeadersApi
      .getById(v.voucher_id)
      .then(({ header, lines: ls }) => {
        setSelectedVoucher(header);
        setSelectedVoucherLines(ls);
      })
      .catch(() => {
        setSelectedVoucher(null);
        setSelectedVoucherLines([]);
      })
      .finally(() => setLoadingDetail(false));
  };

  /** Round to 2 decimals so floating-point noise is not sent to the API. */
  const round2 = (n: number) => Math.round(n * 100) / 100;

  type CreateValidationErrors = { amount?: string; narration?: string; paymentMode?: string };

  const validateCreateVoucher = (): { isValid: boolean; errors: CreateValidationErrors } => {
    const errors: CreateValidationErrors = {};

    // Receiver/Payee (narration): required, 2–100 chars
    const trimmed = narration.trim();
    if (trimmed.length === 0) {
      errors.narration = 'Required (2–100 characters)';
    } else if (trimmed.length < NARRATION_MIN_LEN) {
      errors.narration = `Minimum ${NARRATION_MIN_LEN} characters`;
    } else if (trimmed.length > NARRATION_MAX_LEN) {
      errors.narration = `Maximum ${NARRATION_MAX_LEN} characters`;
    }

    // Payment Mode: required for RECEIPT/PAYMENT/CONTRA (always set via state; validate non-null)
    const needsPaymentMode = createType === 'RECEIPT' || createType === 'PAYMENT' || createType === 'CONTRA';
    if (needsPaymentMode && !paymentMode) {
      errors.paymentMode = 'Payment mode is required';
    }

    // Amount: required, 0–1,000,000, precision 2 (map to totalDebit when balanced)
    const payloadLines = lines.filter(l => l.ledger_id && (parseFloat(l.debit) || parseFloat(l.credit)));
    const total = totalDebit;
    const balanced = total > 0 && totalDebit === totalCredit;

    if (!balanced || payloadLines.length === 0) {
      errors.amount = 'Entries must be balanced (Dr = Cr) with at least one line';
    } else {
      if (total < 0) errors.amount = 'Amount must be at least ₹0';
      else if (total > AMOUNT_MAX) errors.amount = `Amount must not exceed ₹${AMOUNT_MAX.toLocaleString()}`;
      else {
        // Check decimal precision (max 2) on each debit/credit
        const hasInvalidPrecision = (s: string) => {
          if (!s.trim()) return false;
          const parts = s.split('.');
          return parts.length === 2 && parts[1].length > 2;
        };
        for (const l of lines) {
          if (hasInvalidPrecision(l.debit) || hasInvalidPrecision(l.credit)) {
            errors.amount = 'Amount must have at most 2 decimal places';
            break;
          }
        }
      }
    }

    return { isValid: Object.keys(errors).length === 0, errors };
  };

  const createValidation = useMemo(() => validateCreateVoucher(), [createType, narration, lines, paymentMode, totalDebit, totalCredit]);

  const handleCreate = async () => {
    if (!createValidation.isValid) return;
    const payloadLines = lines
      .filter(l => l.ledger_id && (parseFloat(l.debit) || parseFloat(l.credit)))
      .map(l => ({
        ledgerId: parseInt(l.ledger_id, 10),
        debit: round2(parseFloat(l.debit) || 0),
        credit: round2(parseFloat(l.credit) || 0),
      }));
    if (payloadLines.length === 0) return;
    if (!can('Vouchers & Payments', 'Create')) {
      toast.error('You do not have permission to create vouchers.');
      return;
    }
    try {
      await voucherHeadersApi.create({
        voucherType: createType,
        narration: narration.trim(),
        voucherDate: new Date().toISOString().split('T')[0],
        lines: payloadLines,
      });
      setShowCreate(false);
      setNarration('');
      setLines([{ ledger_id: '', debit: '', credit: '' }, { ledger_id: '', debit: '', credit: '' }]);
      const res = await voucherHeadersApi.getPage({ page: 0, size: 50, sort: 'createdDate,desc', voucherType: filterType === 'ALL' ? '' : filterType, search: search.trim() || undefined });
      setVouchers(res.content);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePost = async (v: VoucherHeader) => {
    if (!can('Vouchers & Payments', 'Approve')) {
      toast.error('You do not have permission to approve vouchers.');
      return;
    }
    try {
      const updated = await voucherHeadersApi.post(v.voucher_id);
      setVouchers(prev => prev.map(x => x.voucher_id === v.voucher_id ? updated : x));
      setSelectedVoucher(null);
      setSelectedVoucherLines([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReverse = async (v: VoucherHeader) => {
    if (!can('Vouchers & Payments', 'Approve')) {
      toast.error('You do not have permission to reverse vouchers.');
      return;
    }
    try {
      const updated = await voucherHeadersApi.reverse(v.voucher_id);
      setVouchers(prev => prev.map(x => x.voucher_id === v.voucher_id ? updated : x));
      setSelectedVoucher(null);
      setSelectedVoucherLines([]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-400 via-purple-500 to-fuchsia-500 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 px-5 rounded-b-[2.5rem]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25)_0%,transparent_50%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white">Vouchers & Payments</h1>
                <p className="text-white/70 text-xs">Double-Entry Bookkeeping</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vouchers..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/15 backdrop-blur text-white placeholder:text-white/40 text-sm border border-white/20 outline-none" />
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
            <p className="text-sm text-muted-foreground">Double-Entry Bookkeeping · {vouchers.length} vouchers</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vouchers…"
                className="w-full pl-10 pr-4 h-10 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50" />
            </div>
            <button onClick={() => setShowCreate(true)} className="h-10 px-5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold text-sm flex items-center gap-2 shadow-md">
              <Plus className="w-4 h-4" /> New Voucher
            </button>
          </div>
        </div>
      )}

      {/* Voucher Summary Chart */}
      <div className="px-4 -mt-4 relative z-10 mb-3">
        {(() => {
          const statusData = [
            { name: 'Draft', value: vouchers.filter(v => v.status === 'DRAFT').length, fill: '#f59e0b' },
            { name: 'Posted', value: vouchers.filter(v => v.status === 'POSTED').length, fill: '#10b981' },
            { name: 'Reversed', value: vouchers.filter(v => v.status === 'REVERSED').length, fill: '#ef4444' },
          ].filter(d => d.value > 0);
          const totalAmount = vouchers.reduce((s, v) => s + v.total_debit, 0);
          return (
            <div className="glass-card rounded-2xl p-4 border border-violet-200/20 dark:border-violet-800/10 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
              <div className="flex items-center gap-4">
                {statusData.length > 0 && (
                  <div className="w-20 h-20 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} cx="50%" cy="50%" innerRadius={18} outerRadius={35} paddingAngle={3} dataKey="value">
                          {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-sm">
                      <BarChart3 className="w-3 h-3 text-white" />
                    </div>
                    Voucher Summary
                  </p>
                  <p className="text-xl font-black text-foreground">₹{totalAmount.toLocaleString()}</p>
                  <div className="flex gap-3 mt-1">
                    {statusData.map(d => (
                      <div key={d.name} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                        <span className="text-[10px] text-muted-foreground">{d.name}: {d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Quick Type Filters */}
      <div className="px-4 mb-4">
        <div className="glass-card rounded-2xl p-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          <button onClick={() => setFilterType('ALL')} className={cn('px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95', filterType === 'ALL' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted/40 text-muted-foreground')}>All ({vouchers.length})</button>
          {(Object.keys(VOUCHER_CONFIG) as VoucherType[]).map(t => (
            <button key={t} onClick={() => setFilterType(t)} className={cn('px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all whitespace-nowrap active:scale-95', filterType === t ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted/40 text-muted-foreground')}>
              {VOUCHER_CONFIG[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Voucher List */}
      <div className="px-4 space-y-3">
        {loadingVouchers && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Loading vouchers…</p>
          </div>
        )}
        {!loadingVouchers && filtered.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No vouchers found</p>
          </div>
        )}
        {!loadingVouchers && filtered.map((v, i) => {
          const cfg = VOUCHER_CONFIG[v.voucher_type];
          const borderColor = v.voucher_type === 'RECEIPT' ? 'border-emerald-200/30 dark:border-emerald-800/20'
            : v.voucher_type === 'PAYMENT' ? 'border-amber-200/30 dark:border-amber-800/20'
            : v.voucher_type === 'JOURNAL' ? 'border-violet-200/30 dark:border-violet-800/20'
            : 'border-border/30';
          return (
            <motion.button
              key={v.voucher_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => openVoucherDetail(v)}
              className={cn("w-full glass-card rounded-2xl p-4 text-left hover:shadow-lg transition-all border", borderColor)}
            >
              <div className="flex items-start gap-3">
                <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md shrink-0', cfg.gradient)}>
                  <cfg.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm text-foreground">{v.voucher_number}</p>
                    <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-medium', STATUS_COLORS[v.status])}>{v.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{v.narration}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{v.voucher_date} • {cfg.label}</p>
                </div>
                <p className="text-sm font-bold text-foreground shrink-0">₹{v.total_debit.toLocaleString()}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* FAB — mobile only */}
      {!isDesktop && (
        <motion.button
          onClick={() => setShowCreate(true)}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/30 z-20"
          whileTap={{ scale: 0.9 }}
        >
          <Plus className="w-6 h-6 text-white" />
        </motion.button>
      )}

      {/* Voucher Detail Sheet */}
      <AnimatePresence>
        {selectedVoucher && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end lg:items-center justify-center" onClick={() => setSelectedVoucher(null)}>
            <motion.div initial={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }} animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }} exit={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-t-3xl lg:rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto border border-border/30" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
              <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-5 lg:hidden" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground">{selectedVoucher.voucher_number}</h3>
                <span className={cn('px-3 py-1 rounded-lg text-xs font-medium', STATUS_COLORS[selectedVoucher.status])}>{selectedVoucher.status.replace('_', ' ')}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{selectedVoucher.narration}</p>

              {/* Lines */}
              <div className="rounded-xl border border-border overflow-hidden mb-4">
                <div className="bg-muted/50 px-3 py-2 flex text-[10px] font-medium text-muted-foreground uppercase">
                  <span className="flex-1">Ledger</span>
                  <span className="w-20 text-right">Debit</span>
                  <span className="w-20 text-right">Credit</span>
                </div>
                {(loadingDetail ? [] : selectedVoucherLines).map(l => (
                  <div key={l.line_id} className="px-3 py-2.5 flex items-center border-t border-border/50">
                    <span className="flex-1 text-xs text-foreground truncate">{l.ledger_name || l.ledger_id}</span>
                    <span className="w-20 text-right text-xs font-medium">{l.debit > 0 ? `₹${l.debit.toLocaleString()}` : '—'}</span>
                    <span className="w-20 text-right text-xs font-medium">{l.credit > 0 ? `₹${l.credit.toLocaleString()}` : '—'}</span>
                  </div>
                ))}
                <div className="bg-muted/30 px-3 py-2 flex font-bold text-xs border-t border-border">
                  <span className="flex-1">Total</span>
                  <span className="w-20 text-right">₹{selectedVoucher.total_debit.toLocaleString()}</span>
                  <span className="w-20 text-right">₹{selectedVoucher.total_credit.toLocaleString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {selectedVoucher.status === 'DRAFT' && (
                  <button onClick={() => handlePost(selectedVoucher)} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 text-white font-semibold text-sm flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Post Voucher
                  </button>
                )}
                {selectedVoucher.status === 'POSTED' && (
                  <button onClick={() => handleReverse(selectedVoucher)} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-400 to-rose-500 text-white font-semibold text-sm flex items-center justify-center gap-2">
                    <X className="w-4 h-4" /> Reverse
                  </button>
                )}
                <button onClick={() => setSelectedVoucher(null)} className="px-6 py-3 rounded-xl bg-muted text-muted-foreground font-medium text-sm">Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Voucher Sheet */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end lg:items-center justify-center" onClick={() => setShowCreate(false)}>
            <motion.div initial={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }} animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }} exit={isDesktop ? { opacity: 0, scale: 0.95 } : { y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-t-3xl lg:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto border border-border/30" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
              <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-5 lg:hidden" />
              <h3 className="text-lg font-bold text-foreground mb-4">Create Voucher</h3>

              {/* Voucher Type */}
              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Voucher Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['RECEIPT', 'PAYMENT', 'JOURNAL', 'CONTRA', 'ADVANCE', 'WRITE_OFF'] as VoucherType[]).map(t => (
                    <button key={t} onClick={() => setCreateType(t)} className={cn('p-2 rounded-xl text-center transition-all', createType === t ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground')}>
                      {(() => { const Icon = VOUCHER_CONFIG[t].icon; return <Icon className="w-4 h-4 mx-auto mb-1" />; })()}
                      <p className="text-[10px] font-medium">{VOUCHER_CONFIG[t].label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Mode (for Receipt/Payment) */}
              {(createType === 'RECEIPT' || createType === 'PAYMENT' || createType === 'CONTRA') && (
                <div className="mb-4">
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Payment Mode</label>
                  <div className="flex gap-2">
                    {([{ mode: 'CASH', icon: Banknote, label: 'Cash' }, { mode: 'UPI', icon: Smartphone, label: 'UPI' }, { mode: 'BANK', icon: Building2, label: 'Bank' }] as const).map(m => (
                      <button key={m.mode} onClick={() => setPaymentMode(m.mode)} className={cn('flex-1 p-3 rounded-xl flex flex-col items-center gap-1 transition-all', paymentMode === m.mode ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground')}>
                        <m.icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{m.label}</span>
                      </button>
                    ))}
                  </div>
                  {createValidation.errors.paymentMode && (
                    <p className="text-xs text-destructive mt-1">{createValidation.errors.paymentMode}</p>
                  )}
                </div>
              )}

              {/* Narration */}
              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Narration (Receiver/Payee)</label>
                <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g., Receipt from Vijay Traders" className={cn('w-full px-4 py-3 rounded-xl bg-muted text-foreground text-sm border outline-none focus:ring-2 focus:ring-primary/30', createValidation.errors.narration ? 'border-destructive' : 'border-border')} />
                {createValidation.errors.narration && (
                  <p className="text-xs text-destructive mt-1">{createValidation.errors.narration}</p>
                )}
              </div>

              {/* Debit/Credit Lines */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground">Entries (Dr / Cr)</label>
                  <button onClick={addLine} className="text-xs text-primary font-medium">+ Add Line</button>
                </div>
                <div className="space-y-2">
                  {lines.map((line, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={line.ledger_id} onChange={e => { const nl = [...lines]; nl[i].ledger_id = e.target.value; setLines(nl); }} disabled={loadingLedgers} className="flex-1 px-3 py-2.5 rounded-xl bg-muted text-foreground text-xs border border-border outline-none min-w-0 disabled:opacity-70">
                        <option value="">{loadingLedgers ? 'Loading ledgers…' : 'Select Ledger'}</option>
                        {ledgers.filter(l => l.classification !== 'CONTROL').map(l => (
                          <option key={l.ledger_id} value={l.ledger_id}>{l.ledger_name}</option>
                        ))}
                      </select>
                      <input type="number" value={line.debit} onChange={e => { const nl = [...lines]; nl[i].debit = e.target.value; if (e.target.value) nl[i].credit = ''; setLines(nl); }} placeholder="Dr" className="w-20 px-2 py-2.5 rounded-xl bg-muted text-foreground text-xs border border-border outline-none text-right" />
                      <input type="number" value={line.credit} onChange={e => { const nl = [...lines]; nl[i].credit = e.target.value; if (e.target.value) nl[i].debit = ''; setLines(nl); }} placeholder="Cr" className="w-20 px-2 py-2.5 rounded-xl bg-muted text-foreground text-xs border border-border outline-none text-right" />
                      {lines.length > 2 && <button onClick={() => setPendingRemoveLine(i)} className="text-destructive"><X className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs font-bold px-1">
                  <span className="text-muted-foreground">Balance:</span>
                  <span className={isBalanced ? 'text-emerald-500' : 'text-destructive'}>
                    Dr ₹{totalDebit.toLocaleString()} = Cr ₹{totalCredit.toLocaleString()} {isBalanced ? '✓' : '✗'}
                  </span>
                </div>
                {createValidation.errors.amount && (
                  <p className="text-xs text-destructive mt-1">{createValidation.errors.amount}</p>
                )}
              </div>

              <button onClick={handleCreate} disabled={!createValidation.isValid} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-400 to-purple-500 text-white font-semibold text-sm shadow-lg shadow-violet-500/20 disabled:opacity-50">
                Create as Draft
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isDesktop && <BottomNav />}

      <ConfirmDeleteDialog
        open={pendingRemoveLine !== null}
        onOpenChange={(v) => { if (!v) setPendingRemoveLine(null); }}
        title="Remove line?"
        description="Remove this journal line from the voucher form?"
        confirmLabel="Remove"
        onConfirm={() => { if (pendingRemoveLine !== null) removeLine(pendingRemoveLine); }}
      />
    </div>
  );
};

export default VouchersPage;
