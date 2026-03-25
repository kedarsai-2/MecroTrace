import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Box, Search, Plus, Trash2, Save, Package, User, TrendingUp, ShoppingCart
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { contactApi, stockPurchaseApi, commodityApi } from '@/services/api';
import type { Contact, Commodity } from '@/types/models';
import type { StockPurchaseDTO } from '@/services/api';
import { toast } from 'sonner';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface PurchaseLineItem {
  id: string;
  commodityId: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface PurchaseCharge {
  id: string;
  name: string;
  amount: number;
}

const StockPurchasePage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Stock Purchase');
  if (!canView) {
    return <ForbiddenPage moduleName="Stock Purchase" />;
  }
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [records, setRecords] = useState<StockPurchaseDTO[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [commoditiesLoading, setCommoditiesLoading] = useState(false);

  // Form state
  const [selectedVendor, setSelectedVendor] = useState<Contact | null>(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [items, setItems] = useState<PurchaseLineItem[]>([{ id: crypto.randomUUID(), commodityId: '', quantity: 0, rate: 0, amount: 0 }]);
  const [charges, setCharges] = useState<PurchaseCharge[]>([]);
  const [saving, setSaving] = useState(false);
  /** Hide autocomplete after dismiss until user focuses / edits search again */
  const [vendorResultsDismissed, setVendorResultsDismissed] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ kind: 'item' | 'charge'; id: string } | null>(null);

  const pageSize = 10;

  const loadPurchases = (page: number = 0) => {
    setLoading(true);
    setError(null);
    stockPurchaseApi
      .getPage({ page, size: pageSize, vendorSearch: search.trim() || undefined })
      .then((p) => {
        setRecords(p.content);
        setTotalElements(p.totalElements);
        setTotalPages(p.totalPages);
        setCurrentPage(p.number);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load purchases');
        setRecords([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!showForm) return;
    setVendorsLoading(true);
    /** Participants scope = trader-owned contacts + global (network) contacts for mandi pool — correct for vendors / suppliers. */
    contactApi
      .list({ scope: 'participants' })
      .then((c) => {
        const seen = new Set<string>();
        const unique: Contact[] = [];
        for (const v of c) {
          const id = String(v.contact_id ?? '').trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          unique.push(v);
        }
        unique.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
        setVendors(unique);
      })
      .catch(() => setVendors([]))
      .finally(() => setVendorsLoading(false));
  }, [showForm]);

  useEffect(() => {
    if (!showForm) return;
    setCommoditiesLoading(true);
    commodityApi
      .list()
      .then(setCommodities)
      .catch(() => setCommodities([]))
      .finally(() => setCommoditiesLoading(false));
  }, [showForm]);

  useEffect(() => {
    loadPurchases(0);
  }, [search]);

  useEffect(() => {
    if (showForm) setVendorResultsDismissed(false);
  }, [showForm]);

  const filteredVendors = useMemo(() => {
    const raw = vendorSearch.trim();
    if (!raw) return [];
    const q = raw.toLowerCase();
    return vendors.filter(
      v =>
        v.name?.toLowerCase().includes(q) ||
        v.phone?.includes(raw) ||
        v.mark?.toLowerCase().includes(q)
    );
  }, [vendors, vendorSearch]);

  /** Autocomplete: show at most this many matches in the floating panel */
  const VENDOR_SEARCH_MAX_RESULTS = 25;
  const vendorSearchMatches = useMemo(
    () => filteredVendors.slice(0, VENDOR_SEARCH_MAX_RESULTS),
    [filteredVendors]
  );
  const vendorSearchHasMore = filteredVendors.length > VENDOR_SEARCH_MAX_RESULTS;

  const searchQuery = vendorSearch.trim();
  const showVendorAutocomplete =
    !vendorsLoading &&
    !selectedVendor &&
    searchQuery.length >= 1 &&
    !vendorResultsDismissed;

  const isNetworkContact = (v: Contact) => !v.trader_id || String(v.trader_id).trim() === '';

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);
  const totalCharges = useMemo(() => charges.reduce((s, c) => s + c.amount, 0), [charges]);
  const grandTotal = subtotal + totalCharges;
  const pageTotalSpent = useMemo(() => records.reduce((s, r) => s + (r.grandTotal ?? 0), 0), [records]);

  const updateItem = (id: string, field: string, value: any) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const updated = { ...i, [field]: value };
      updated.amount = updated.quantity * updated.rate;
      return updated;
    }));
  };

  const addItem = () => setItems(prev => [...prev, { id: crypto.randomUUID(), commodityId: '', quantity: 0, rate: 0, amount: 0 }]);
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const addCharge = () => setCharges(prev => [...prev, { id: crypto.randomUUID(), name: '', amount: 0 }]);
  const removeCharge = (id: string) => setCharges(prev => prev.filter(c => c.id !== id));

  const handleSave = () => {
    if (!selectedVendor || items.every(i => i.amount === 0)) {
      toast.error('Select vendor and add at least one item');
      return;
    }
    const validItems = items.filter(i => i.amount > 0);
    const missingCommodity = validItems.find(i => !i.commodityId || String(i.commodityId).trim() === '');
    if (missingCommodity) {
      toast.error('Select a commodity for every line item');
      return;
    }
    const rawVendorId = String(selectedVendor.contact_id ?? '').trim();
    const vendorId = Number(rawVendorId);
    if (!rawVendorId || !Number.isFinite(vendorId) || vendorId <= 0 || !Number.isInteger(vendorId)) {
      toast.error('Invalid vendor — select a contact again');
      return;
    }
    if (!can('Stock Purchase', 'Create')) {
      toast.error('You do not have permission to create stock purchases.');
      return;
    }
    setSaving(true);
    stockPurchaseApi
      .create({
        vendorId,
        items: validItems.map((i) => {
          const commodity = commodities.find(c => String(c.commodity_id) === String(i.commodityId));
          return {
            commodityId: Number(i.commodityId),
            commodity: commodity?.commodity_name,
            quantity: i.quantity,
            rate: i.rate,
            amount: i.amount,
          };
        }),
        charges: charges.map((c) => ({ name: c.name, amount: c.amount })),
      })
      .then(() => {
        setShowForm(false);
        resetForm();
        loadPurchases(0);
        toast.success('Stock purchase recorded & inventory updated');
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Failed to save purchase');
      })
      .finally(() => setSaving(false));
  };

  const resetForm = () => {
    setSelectedVendor(null);
    setVendorSearch('');
    setVendorResultsDismissed(false);
    setItems([{ id: crypto.randomUUID(), commodityId: '', quantity: 0, rate: 0, amount: 0 }]);
    setCharges([]);
  };

  const displayRecords = records;

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {!isDesktop && (
        <div className="bg-gradient-to-br from-teal-400 via-emerald-500 to-green-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute top-2 right-2 opacity-10">
            <ShoppingCart className="w-28 h-28 text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center active:scale-95 transition-transform">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Box className="w-5 h-5" /> Stock Purchase
                </h1>
                <p className="text-white/80 text-xs font-medium">Record vendor stock purchases</p>
              </div>
              <button onClick={() => setShowForm(true)} className="w-10 h-10 rounded-full bg-white/25 backdrop-blur-md flex items-center justify-center active:scale-95 transition-transform">
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/20 backdrop-blur-md rounded-xl px-3 py-2">
                <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">Purchases</p>
                <p className="text-white text-lg font-bold">{loading ? '…' : totalElements}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-md rounded-xl px-3 py-2">
                <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">Page Total</p>
                <p className="text-white text-lg font-bold">₹{(loading ? 0 : pageTotalSpent).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDesktop && (
        <div className="px-8 pt-6 pb-4 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search purchases by vendor…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11" />
          </div>
          <div className="flex items-center gap-3">
            <div className="glass-card rounded-xl px-4 py-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-teal-500" />
              <span className="text-sm font-semibold">{loading ? '…' : totalElements} purchases</span>
            </div>
            <div className="glass-card rounded-xl px-4 py-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold">₹{(loading ? 0 : pageTotalSpent).toLocaleString()} (page)</span>
            </div>
          </div>
          <Button onClick={() => setShowForm(true)} className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-bold h-11">
            <Plus className="w-4 h-4 mr-1.5" /> New Purchase
          </Button>
        </div>
      )}

      <div className={cn("px-4", isDesktop ? "lg:px-8" : "mt-4")}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-teal-400 to-emerald-500" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Purchase History</h2>
        </div>

        {error ? (
          <div className="glass-card rounded-2xl p-6 text-center">
            <p className="text-sm font-semibold text-destructive mb-1">Error loading purchases</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : loading ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <p className="text-sm text-muted-foreground">Loading purchases…</p>
          </div>
        ) : displayRecords.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-900/20 mx-auto mb-4 flex items-center justify-center">
              <Box className="w-8 h-8 text-teal-500" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No Stock Purchases Yet</p>
            <p className="text-xs text-muted-foreground">Tap + to record your first vendor purchase</p>
          </div>
        ) : isDesktop ? (
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/10 dark:to-emerald-900/10 border-b border-border/50">
                  <th className="text-left p-3 text-teal-800 dark:text-teal-300 font-semibold text-xs uppercase tracking-wide">Date</th>
                  <th className="text-left p-3 text-teal-800 dark:text-teal-300 font-semibold text-xs uppercase tracking-wide">Vendor</th>
                  <th className="text-right p-3 text-teal-800 dark:text-teal-300 font-semibold text-xs uppercase tracking-wide">Items</th>
                  <th className="text-right p-3 text-teal-800 dark:text-teal-300 font-semibold text-xs uppercase tracking-wide">Subtotal</th>
                  <th className="text-right p-3 text-teal-800 dark:text-teal-300 font-semibold text-xs uppercase tracking-wide">Charges</th>
                  <th className="text-right p-3 text-teal-800 dark:text-teal-300 font-semibold text-xs uppercase tracking-wide">Grand Total</th>
                  <th className="text-left p-3 text-teal-800 dark:text-teal-300 font-semibold text-xs uppercase tracking-wide">Lot #</th>
                </tr>
              </thead>
              <tbody>
                {displayRecords.map(r => (
                  <tr key={r.id} className="border-b border-border/30 last:border-0 hover:bg-teal-50/30 dark:hover:bg-teal-900/5 transition-colors">
                    <td className="p-3 text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="p-3 font-semibold">{r.vendorName}</td>
                    <td className="p-3 text-right">{r.items?.length ?? 0}</td>
                    <td className="p-3 text-right">₹{(r.subtotal ?? 0).toLocaleString()}</td>
                    <td className="p-3 text-right text-amber-600 dark:text-amber-400">₹{(r.totalCharges ?? 0).toLocaleString()}</td>
                    <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">₹{(r.grandTotal ?? 0).toLocaleString()}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{(r.lotNumbers ?? []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 py-3 border-t border-border/30">
                <Button variant="outline" size="sm" disabled={currentPage <= 0} onClick={() => loadPurchases(currentPage - 1)}>Previous</Button>
                <span className="text-xs self-center px-2">Page {currentPage + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => loadPurchases(currentPage + 1)}>Next</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayRecords.map(r => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-4 border-l-4 border-l-teal-400">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{r.vendorName}</p>
                      <p className="text-[11px] text-muted-foreground">{(r.items?.length ?? 0)} items · {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</p>
                    </div>
                  </div>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">₹{(r.grandTotal ?? 0).toLocaleString()}</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {(r.lotNumbers ?? []).map((ln, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[10px] font-bold">{ln}</span>
                  ))}
                </div>
              </motion.div>
            ))}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 0} onClick={() => loadPurchases(currentPage - 1)}>Previous</Button>
                <span className="text-xs self-center">Page {currentPage + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => loadPurchases(currentPage + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Purchase Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent
          className={cn(
            'sm:max-w-2xl max-h-[90vh] overflow-visible flex flex-col gap-0',
            isDesktop && 'glass-card'
          )}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center">
                <Box className="w-4 h-4 text-white" />
              </div>
              New Stock Purchase
            </DialogTitle>
            <DialogDescription>Record purchase from vendor with cost allocation</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 max-h-[min(68vh,520px)] overflow-y-auto overflow-x-visible space-y-4 py-2 pr-1 -mr-0.5">
            {/* Vendor Selection */}
            <div>
              <label className="text-xs font-bold text-teal-700 dark:text-teal-400 mb-1.5 block uppercase tracking-wide">Vendor</label>
              {selectedVendor ? (
                <div className="rounded-xl p-3 flex items-center justify-between bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800/50">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{selectedVendor.name}</span>
                        {isNetworkContact(selectedVendor) ? (
                          <span className="text-[10px] font-semibold uppercase rounded-md px-1.5 py-0.5 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">Network</span>
                        ) : (
                          <span className="text-[10px] font-semibold uppercase rounded-md px-1.5 py-0.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Trader</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{selectedVendor.phone}{selectedVendor.mark ? ` · ${selectedVendor.mark}` : ''}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedVendor(null)}>Change</Button>
                </div>
              ) : (
                <div>
                  <Popover
                    open={showVendorAutocomplete}
                    onOpenChange={(open) => {
                      if (!open) setVendorResultsDismissed(true);
                    }}
                  >
                    <PopoverAnchor asChild>
                      <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
                        <Input
                          placeholder="Type name, phone, or mark to search…"
                          value={vendorSearch}
                          onChange={e => {
                            setVendorSearch(e.target.value);
                            setVendorResultsDismissed(false);
                          }}
                          onFocus={() => setVendorResultsDismissed(false)}
                          className="h-11 pl-10"
                          disabled={vendorsLoading}
                          autoComplete="off"
                          aria-autocomplete="list"
                          aria-expanded={showVendorAutocomplete}
                        />
                      </div>
                    </PopoverAnchor>
                    <PopoverContent
                      align="start"
                      side="bottom"
                      sideOffset={6}
                      collisionPadding={16}
                      className="p-0 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-[200] w-[var(--radix-popper-anchor-width)] min-w-[min(100vw-2rem,24rem)]"
                      role="listbox"
                      onOpenAutoFocus={e => e.preventDefault()}
                    >
                      {vendorSearchMatches.length > 0 ? (
                        <>
                          {vendorSearchMatches.map(v => (
                            <button
                              key={v.contact_id}
                              type="button"
                              role="option"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                setSelectedVendor(v);
                                setVendorSearch('');
                                setVendorResultsDismissed(false);
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-teal-50 dark:hover:bg-teal-900/10 text-sm transition-colors border-b border-border/40 last:border-0 flex items-center justify-between gap-2"
                            >
                              <span className="min-w-0">
                                <span className="font-medium">{v.name}</span>
                                <span className="text-muted-foreground"> · {v.phone}</span>
                                {v.mark ? <span className="text-muted-foreground"> · {v.mark}</span> : null}
                              </span>
                              {isNetworkContact(v) ? (
                                <span className="shrink-0 text-[10px] font-semibold uppercase rounded-md px-1.5 py-0.5 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">Network</span>
                              ) : (
                                <span className="shrink-0 text-[10px] font-semibold uppercase rounded-md px-1.5 py-0.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Trader</span>
                              )}
                            </button>
                          ))}
                          {vendorSearchHasMore && (
                            <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border/50 bg-muted/30">
                              Showing first {VENDOR_SEARCH_MAX_RESULTS} matches — type more to narrow.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="px-3 py-3 text-xs text-muted-foreground">No contacts match. Try another spelling or phone.</p>
                      )}
                    </PopoverContent>
                  </Popover>
                  {vendorsLoading && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Loading contacts (trader + network)…</p>
                  )}
                  {!vendorsLoading && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {vendors.length} contact{vendors.length === 1 ? '' : 's'} in directory — type to search, then choose a match from the list.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wide">Line Items</label>
                <Button variant="ghost" size="sm" onClick={addItem} className="text-teal-600"><Plus className="w-3 h-3 mr-1" /> Add Item</Button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={item.id} className="rounded-xl p-3 bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-1 mb-2">
                      <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                      <span className="text-xs text-muted-foreground font-medium flex-1">Item {idx + 1}</span>
                      {items.length > 1 && (
                        <button onClick={() => setPendingRemove({ kind: 'item', id: item.id })} className="text-destructive p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <label className="sr-only">Commodity</label>
                        <select
                          value={item.commodityId}
                          onChange={e => updateItem(item.id, 'commodityId', e.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
                          disabled={commoditiesLoading}
                        >
                          <option value="">{commoditiesLoading ? 'Loading…' : 'Select commodity'}</option>
                          {commodities.map((c) => (
                            <option key={c.commodity_id} value={c.commodity_id}>{c.commodity_name}</option>
                          ))}
                          {!commoditiesLoading && commodities.length === 0 && <option value="" disabled>No commodities</option>}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Qty" value={item.quantity || ''} onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)} className="text-xs h-9" />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" placeholder="Rate ₹" value={item.rate || ''} onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)} className="text-xs h-9" />
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{item.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Charges */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Overhead Charges</label>
                <Button variant="ghost" size="sm" onClick={addCharge} className="text-amber-600"><Plus className="w-3 h-3 mr-1" /> Add Charge</Button>
              </div>
              {charges.length === 0 && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">No charges added. Freight, labour etc. will be allocated proportionally to items.</p>
              )}
              {charges.map(ch => (
                <div key={ch.id} className="flex gap-2 mb-2 items-center">
                  <Input placeholder="e.g. Freight, Labour" value={ch.name} onChange={e => setCharges(prev => prev.map(c => c.id === ch.id ? { ...c, name: e.target.value } : c))} className="flex-1 h-9 text-xs" />
                  <Input type="number" placeholder="₹ Amount" value={ch.amount || ''} onChange={e => setCharges(prev => prev.map(c => c.id === ch.id ? { ...c, amount: parseFloat(e.target.value) || 0 } : c))} className="w-28 h-9 text-xs" />
                  <button onClick={() => setPendingRemove({ kind: 'charge', id: ch.id })} className="text-destructive p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="rounded-xl p-4 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 border border-teal-200 dark:border-teal-800/50 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground font-medium">Subtotal</span><span className="font-semibold">₹{subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-amber-600 dark:text-amber-400 font-medium">+ Charges</span><span className="font-semibold text-amber-600 dark:text-amber-400">₹{totalCharges.toLocaleString()}</span></div>
              <div className="flex justify-between text-base font-black border-t border-teal-200 dark:border-teal-800/50 pt-2 mt-1">
                <span>Grand Total</span><span className="text-emerald-600 dark:text-emerald-400 text-xl">₹{grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-3 mt-1 shrink-0 border-t border-border/60">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-11" disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} className="flex-1 h-11 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-bold shadow-lg" disabled={saving}>
              <Save className="w-4 h-4 mr-1.5" /> {saving ? 'Saving…' : 'Save Purchase'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />

      <ConfirmDeleteDialog
        open={!!pendingRemove}
        onOpenChange={(v) => { if (!v) setPendingRemove(null); }}
        title={pendingRemove?.kind === 'item' ? 'Remove item?' : 'Remove charge?'}
        description={pendingRemove?.kind === 'item' ? 'Remove this item from the purchase form?' : 'Remove this charge from the purchase form?'}
        confirmLabel="Remove"
        onConfirm={() => {
          if (!pendingRemove) return;
          if (pendingRemove.kind === 'item') removeItem(pendingRemove.id);
          else removeCharge(pendingRemove.id);
        }}
      />
    </div>
  );
};

export default StockPurchasePage;
