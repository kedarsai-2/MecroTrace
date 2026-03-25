import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Send, Search, Plus, Package, Truck, User, Key, Trash2,
  Copy, Download, Clock, CheckCircle, AlertTriangle, FileText, Share2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cdnApi, contactApi } from '@/services/api';
import type { CDNResponseDTO } from '@/services/api';
import type { Contact } from '@/types/models';
import { toast } from 'sonner';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

function apiToRecord(dto: CDNResponseDTO): CDNRecord {
  return {
    id: String(dto.id),
    cdn_number: dto.cdnNumber,
    date: typeof dto.date === 'string' ? dto.date : (dto.date as unknown as { toString: () => string })?.toString?.() ?? new Date().toISOString(),
    dispatching_party: dto.dispatchingParty ?? '',
    receiving_party: dto.receivingParty ?? '',
    items: (dto.items ?? []).map((i, idx) => ({ id: i.id ?? String(idx), lot_name: i.lotName ?? '', quantity: i.quantity ?? 0, variant: i.variant ?? '' })),
    freight_formula: dto.freightFormula ?? '',
    transporter: dto.transporter ?? '',
    driver: dto.driver ?? '',
    advance_paid: Number(dto.advancePaid ?? 0),
    remarks: dto.remarks ?? '',
    pin: dto.pin ?? '',
    pin_used: dto.pinUsed ?? false,
    pin_expires_at: dto.pinExpiresAt ? (typeof dto.pinExpiresAt === 'string' ? dto.pinExpiresAt : String(dto.pinExpiresAt)) : '',
    source: (dto.source === 'DIRECT' ? 'MANUAL' : dto.source) as CDNRecord['source'],
    status: (dto.status === 'EXPIRED' ? 'EXPIRED' : dto.status) as CDNRecord['status'],
    created_at: (dto.createdAt ?? dto.date) ? (typeof (dto.createdAt ?? dto.date) === 'string' ? (dto.createdAt ?? dto.date) as string : String(dto.createdAt ?? dto.date)) : new Date().toISOString(),
  };
}

interface CDNLineItem {
  id: string;
  lot_name: string;
  quantity: number;
  variant: string;
}

interface CDNRecord {
  id: string;
  cdn_number: string;
  date: string;
  dispatching_party: string;
  receiving_party: string;
  items: CDNLineItem[];
  freight_formula: string;
  transporter: string;
  driver: string;
  advance_paid: number;
  remarks: string;
  pin: string;
  pin_used: boolean;
  pin_expires_at: string;
  source: 'SALES_PAD' | 'SELF_SALE' | 'STOCK_PURCHASE' | 'MANUAL';
  status: 'ACTIVE' | 'TRANSFERRED' | 'EXPIRED';
  created_at: string;
}

const CDNPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('CDN');
  if (!canView) {
    return <ForbiddenPage moduleName="CDN" />;
  }
  const [records, setRecords] = useState<CDNRecord[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showDetail, setShowDetail] = useState<CDNRecord | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Create form
  const [receivingParty, setReceivingParty] = useState('');
  const [items, setItems] = useState<CDNLineItem[]>([{ id: crypto.randomUUID(), lot_name: '', quantity: 0, variant: '' }]);
  const [freight, setFreight] = useState('');
  const [transporter, setTransporter] = useState('');
  const [driver, setDriver] = useState('');
  const [advance, setAdvance] = useState('');
  const [remarks, setRemarks] = useState('');
  const [source, setSource] = useState<CDNRecord['source']>('MANUAL');

  // Receive form
  const [receivePin, setReceivePin] = useState('');

  const [loading, setLoading] = useState(true);
  const [pendingRemoveCdnItem, setPendingRemoveCdnItem] = useState<string | null>(null);

  useEffect(() => {
    contactApi.list().then(setContacts);
    cdnApi
      .list({ page: 0, size: 500 })
      .then((result) => setRecords(result.content.map(apiToRecord)))
      .catch(() => {
        setRecords([]);
        toast.error('Failed to load CDNs');
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter(r =>
      r.cdn_number.toLowerCase().includes(q) ||
      r.receiving_party.toLowerCase().includes(q) ||
      r.dispatching_party.toLowerCase().includes(q)
    );
  }, [records, search]);

  const addItem = () => setItems(prev => [...prev, { id: crypto.randomUUID(), lot_name: '', quantity: 0, variant: '' }]);
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const activeCount = useMemo(() => records.filter(r => r.status === 'ACTIVE').length, [records]);
  const transferredCount = useMemo(() => records.filter(r => r.status === 'TRANSFERRED').length, [records]);

  const handleCreate = () => {
    if (!receivingParty || items.every(i => !i.lot_name)) {
      toast.error('Fill receiving party and at least one lot');
      return;
    }

    if (!can('CDN', 'Create')) {
      toast.error('You do not have permission to create CDNs.');
      return;
    }

    cdnApi
      .create({
        receivingParty,
        items: items.filter(i => i.lot_name).map(i => ({ lotName: i.lot_name, quantity: i.quantity || 0, variant: i.variant })),
        freightFormula: freight || undefined,
        transporter: transporter || undefined,
        driver: driver || undefined,
        advancePaid: parseFloat(advance) || 0,
        remarks: remarks || undefined,
        source,
      })
      .then((result) => {
        const cdn = apiToRecord(result);
        setRecords((prev) => [...prev, cdn]);
        setShowCreate(false);
        resetForm();
        toast.success(`CDN ${cdn.cdn_number} created. PIN: ${result.pin ?? cdn.pin}`, { duration: 8000 });
      })
      .catch((err: Error) => {
        toast.error(err.message || 'Failed to create CDN');
      });
  };

  const handleReceive = () => {
    if (!can('CDN', 'Create')) {
      toast.error('You do not have permission to receive CDNs.');
      return;
    }

    cdnApi
      .receiveByPin({ pin: receivePin })
      .then((result) => {
        const received = apiToRecord(result);
        setRecords((prev) => prev.map((r) => (r.id === received.id ? received : r)));
        setShowReceive(false);
        setReceivePin('');
        toast.success(`CDN ${received.cdn_number} received`);
      })
      .catch((err: Error) => {
        toast.error(err.message || 'Invalid or expired PIN');
      });
  };

  const resetForm = () => {
    setReceivingParty('');
    setItems([{ id: crypto.randomUUID(), lot_name: '', quantity: 0, variant: '' }]);
    setFreight(''); setTransporter(''); setDriver(''); setAdvance(''); setRemarks('');
    setSource('MANUAL');
  };

  const copyPin = (pin: string) => {
    navigator.clipboard.writeText(pin);
    toast.success('PIN copied to clipboard');
  };

  const statusColor = (s: CDNRecord['status']) => {
    if (s === 'ACTIVE') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    if (s === 'TRANSFERRED') return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  };

  const statusIcon = (s: CDNRecord['status']) => {
    if (s === 'ACTIVE') return <Clock className="w-3.5 h-3.5" />;
    if (s === 'TRANSFERRED') return <CheckCircle className="w-3.5 h-3.5" />;
    return <AlertTriangle className="w-3.5 h-3.5" />;
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {!isDesktop && (
        <div className="bg-gradient-to-br from-indigo-400 via-violet-500 to-purple-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute top-4 right-2 opacity-10">
            <Send className="w-28 h-28 text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center active:scale-95 transition-transform">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Send className="w-5 h-5" /> CDN
                </h1>
                <p className="text-white/80 text-xs font-medium">Consignment Dispatch Notes</p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-white/20 backdrop-blur-md rounded-xl px-3 py-2">
                <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">Active</p>
                <p className="text-white text-lg font-bold">{activeCount}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-md rounded-xl px-3 py-2">
                <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">Transferred</p>
                <p className="text-white text-lg font-bold">{transferredCount}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowCreate(true)} className="flex-1 py-3 rounded-xl bg-white/25 backdrop-blur-md text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform border border-white/20">
                <Plus className="w-4 h-4" /> Create CDN
              </button>
              <button onClick={() => setShowReceive(true)} className="flex-1 py-3 rounded-xl bg-white/25 backdrop-blur-md text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform border border-white/20">
                <Key className="w-4 h-4" /> Receive CDN
              </button>
            </div>
          </div>
        </div>
      )}

      {isDesktop && (
        <div className="px-8 pt-6 pb-4 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search CDNs by number, party…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11" />
          </div>
          <div className="flex items-center gap-3">
            <div className="glass-card rounded-xl px-4 py-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold">{activeCount} active</span>
            </div>
            <div className="glass-card rounded-xl px-4 py-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-sky-500" />
              <span className="text-sm font-semibold">{transferredCount} transferred</span>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white font-bold h-11">
            <Plus className="w-4 h-4 mr-1.5" /> Create CDN
          </Button>
          <Button variant="outline" onClick={() => setShowReceive(true)} className="h-11 font-bold">
            <Key className="w-4 h-4 mr-1.5" /> Receive CDN
          </Button>
        </div>
      )}

      <div className={cn("px-4", isDesktop ? "lg:px-8" : "mt-4")}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Dispatch Notes</h2>
        </div>

        {filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/20 mx-auto mb-4 flex items-center justify-center">
              <Send className="w-8 h-8 text-indigo-500" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No CDNs Yet</p>
            <p className="text-xs text-muted-foreground">Create a CDN to dispatch goods or receive one via PIN</p>
          </div>
        ) : isDesktop ? (
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/10 dark:to-violet-900/10 border-b border-border/50">
                  <th className="text-left p-3 text-indigo-800 dark:text-indigo-300 font-semibold text-xs uppercase tracking-wide">CDN #</th>
                  <th className="text-left p-3 text-indigo-800 dark:text-indigo-300 font-semibold text-xs uppercase tracking-wide">Date</th>
                  <th className="text-left p-3 text-indigo-800 dark:text-indigo-300 font-semibold text-xs uppercase tracking-wide">To</th>
                  <th className="text-center p-3 text-indigo-800 dark:text-indigo-300 font-semibold text-xs uppercase tracking-wide">Items</th>
                  <th className="text-center p-3 text-indigo-800 dark:text-indigo-300 font-semibold text-xs uppercase tracking-wide">Source</th>
                  <th className="text-center p-3 text-indigo-800 dark:text-indigo-300 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="text-center p-3 text-indigo-800 dark:text-indigo-300 font-semibold text-xs uppercase tracking-wide">PIN</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-border/30 last:border-0 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-900/5 transition-colors" onClick={() => setShowDetail(r)}>
                    <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{r.cdn_number}</td>
                    <td className="p-3 text-muted-foreground">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="p-3 font-medium">{r.receiving_party}</td>
                    <td className="p-3 text-center">{r.items.length}</td>
                    <td className="p-3 text-center"><span className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold">{r.source.replace('_', ' ')}</span></td>
                    <td className="p-3 text-center"><span className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1", statusColor(r.status))}>{statusIcon(r.status)} {r.status}</span></td>
                    <td className="p-3 text-center">
                      {r.status === 'ACTIVE' && (
                        <button onClick={e => { e.stopPropagation(); copyPin(r.pin); }} className="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-bold hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors">
                          {r.pin} <Copy className="w-3 h-3 inline ml-1" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-4 border-l-4 border-l-indigo-400 active:scale-[0.98] transition-transform"
                onClick={() => setShowDetail(r)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center">
                      <Send className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-indigo-600 dark:text-indigo-400">{r.cdn_number}</p>
                      <p className="text-[11px] text-muted-foreground">To: {r.receiving_party}</p>
                    </div>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1", statusColor(r.status))}>{statusIcon(r.status)} {r.status}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{r.items.length} lots · {r.source.replace('_', ' ')}</span>
                  {r.status === 'ACTIVE' && (
                    <button onClick={e => { e.stopPropagation(); copyPin(r.pin); }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-bold">
                      PIN: {r.pin} <Copy className="w-3 h-3 inline ml-1" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create CDN Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className={cn("sm:max-w-2xl max-h-[85vh] overflow-y-auto", isDesktop && "glass-card")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center">
                <Send className="w-4 h-4 text-white" />
              </div>
              Create CDN
            </DialogTitle>
            <DialogDescription>Dispatch goods without immediate sale — a secure PIN will be generated</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-2 block uppercase tracking-wide">Source</label>
              <div className="flex gap-2 flex-wrap">
                {(['MANUAL', 'SALES_PAD', 'SELF_SALE', 'STOCK_PURCHASE'] as const).map(s => (
                  <button key={s} onClick={() => setSource(s)}
                    className={cn("px-3.5 py-2 rounded-xl text-xs font-bold transition-all",
                      source === s ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md' : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-border')}>
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1.5 block uppercase tracking-wide">Receiving Party</label>
              <Input placeholder="Enter receiving trader name" value={receivingParty} onChange={e => setReceivingParty(e.target.value)} className="h-11" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">Lot Items</label>
                <Button variant="ghost" size="sm" onClick={addItem} className="text-indigo-600"><Plus className="w-3 h-3 mr-1" /> Add Lot</Button>
              </div>
              {items.map((item, idx) => (
                <div key={item.id} className="rounded-xl p-3 bg-muted/30 border border-border/50 mb-2">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Input placeholder="Lot Name" value={item.lot_name} onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, lot_name: e.target.value } : i))}
                        className="h-9 text-xs" />
                    </div>
                    <div className="col-span-3">
                      <Input type="number" placeholder="Qty" value={item.quantity || ''} onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: parseInt(e.target.value) || 0 } : i))}
                        className="h-9 text-xs" />
                    </div>
                    <div className="col-span-3">
                      <Input placeholder="Variant" value={item.variant} onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, variant: e.target.value } : i))}
                        className="h-9 text-xs" />
                    </div>
                    <button onClick={() => setPendingRemoveCdnItem(item.id)} className="col-span-1 text-destructive flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block uppercase tracking-wide">Transporter</label>
                <Input placeholder="Transporter name" value={transporter} onChange={e => setTransporter(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block uppercase tracking-wide">Driver</label>
                <Input placeholder="Driver name" value={driver} onChange={e => setDriver(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block uppercase tracking-wide">Freight Formula</label>
                <Input placeholder="e.g. ₹500/ton" value={freight} onChange={e => setFreight(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block uppercase tracking-wide">Advance Paid (₹)</label>
                <Input type="number" placeholder="0" value={advance} onChange={e => setAdvance(e.target.value)} className="h-10" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block uppercase tracking-wide">Remarks</label>
              <Textarea placeholder="Optional notes…" value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} />
            </div>

            <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  CDN is an operational document. No revenue, AR/AP, or GST liability will be created. A secure one-time PIN valid for 24 hours will be generated.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} className="flex-1 h-11">Cancel</Button>
            <Button onClick={handleCreate} className="flex-1 h-11 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white font-bold shadow-lg">
              <Send className="w-4 h-4 mr-1.5" /> Create CDN
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive CDN Dialog */}
      <Dialog open={showReceive} onOpenChange={setShowReceive}>
        <DialogContent className={cn("sm:max-w-sm", isDesktop && "glass-card")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <Key className="w-4 h-4 text-white" />
              </div>
              Receive CDN
            </DialogTitle>
            <DialogDescription>Enter the 6-character PIN to receive goods and auto-create an arrival</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input placeholder="Enter PIN" value={receivePin} onChange={e => setReceivePin(e.target.value.toUpperCase())}
              className="text-center text-3xl font-mono tracking-[0.5em] h-16 border-2 border-emerald-200 dark:border-emerald-800 focus:border-emerald-400" maxLength={6} autoFocus />
            <p className="text-[11px] text-muted-foreground text-center">PIN is case-insensitive and valid for 24 hours from creation</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowReceive(false)} className="flex-1 h-11">Cancel</Button>
            <Button onClick={handleReceive} disabled={receivePin.length < 6} className="flex-1 h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold shadow-lg">
              <Download className="w-4 h-4 mr-1.5" /> Receive
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CDN Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className={cn("sm:max-w-lg", isDesktop && "glass-card")}>
          {showDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  {showDetail.cdn_number}
                </DialogTitle>
                <DialogDescription>{new Date(showDetail.date).toLocaleString()}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-3 bg-muted/30">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">From</span>
                    <span className="font-bold text-sm">{showDetail.dispatching_party}</span>
                  </div>
                  <div className="rounded-xl p-3 bg-muted/30">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">To</span>
                    <span className="font-bold text-sm">{showDetail.receiving_party}</span>
                  </div>
                  <div className="rounded-xl p-3 bg-muted/30">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">Source</span>
                    <span className="font-semibold text-sm">{showDetail.source.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="rounded-xl p-3 bg-muted/30">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">Status</span>
                    <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1", statusColor(showDetail.status))}>{statusIcon(showDetail.status)} {showDetail.status}</span>
                  </div>
                </div>
                <div className="border-t border-border/50 pt-3">
                  <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-2 uppercase tracking-wide">Items ({showDetail.items.length})</p>
                  {showDetail.items.map((item, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                      <span className="font-medium">{item.lot_name}</span>
                      <span className="font-bold">{item.quantity} bags {item.variant && <span className="text-muted-foreground font-normal">({item.variant})</span>}</span>
                    </div>
                  ))}
                </div>
                {(showDetail.transporter || showDetail.driver || showDetail.advance_paid > 0) && (
                  <div className="border-t border-border/50 pt-3 space-y-1.5">
                    {showDetail.transporter && <p className="text-xs"><span className="text-muted-foreground font-semibold">Transporter:</span> {showDetail.transporter}</p>}
                    {showDetail.driver && <p className="text-xs"><span className="text-muted-foreground font-semibold">Driver:</span> {showDetail.driver}</p>}
                    {showDetail.advance_paid > 0 && <p className="text-xs"><span className="text-muted-foreground font-semibold">Advance:</span> <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{showDetail.advance_paid}</span></p>}
                  </div>
                )}
                {showDetail.remarks && (
                  <div className="border-t border-border/50 pt-3">
                    <p className="text-xs text-muted-foreground font-semibold mb-1">Remarks</p>
                    <p className="text-xs">{showDetail.remarks}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <BottomNav />

      <ConfirmDeleteDialog
        open={!!pendingRemoveCdnItem}
        onOpenChange={(v) => { if (!v) setPendingRemoveCdnItem(null); }}
        title="Remove item?"
        description="Remove this lot/item from the CDN form?"
        confirmLabel="Remove"
        onConfirm={() => pendingRemoveCdnItem && removeItem(pendingRemoveCdnItem)}
      />
    </div>
  );
};

export default CDNPage;
