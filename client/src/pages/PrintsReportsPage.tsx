import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Printer, BarChart3, Search, FileText, Download, Filter,
  Calendar, DollarSign, Users, Package, Truck, AlertTriangle,
  TrendingUp, Shield, Clock, Eye, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { useAuth } from '@/context/AuthContext';
import { contactApi, arrivalsApi, billingApi, settlementApi, printLogApi } from '@/services/api';
import { directPrint } from '@/utils/printTemplates';
import { generateTemplateHTML, type FirmInfo } from '@/utils/printPreviewTemplates';
import type { ArrivalDetail } from '@/services/api/arrivals';
import { reportsApi, type DailySalesSummaryDTO } from '@/services/api/reports';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import type { SalesBillDTO } from '@/services/api/billing';
import type { PattiDTO } from '@/services/api/settlement';

// ── Print Templates ─────────────────────────────────────
const printTemplates = [
  { id: 'sale_pad', name: 'Sale Pad Print', stage: 'Pre-Auction', size: 'A5 Portrait', icon: FileText, color: 'from-blue-400 to-cyan-500' },
  { id: 'sales_sticker', name: 'Sales Sticker', stage: 'Pre-Auction', size: '150mm×80mm Thermal', icon: Printer, color: 'from-emerald-400 to-teal-500' },
  { id: 'tender_form', name: 'Tender Form (APMC)', stage: 'Pre-Auction', size: 'A4 Portrait', icon: FileText, color: 'from-violet-400 to-purple-500' },
  { id: 'tender_slip', name: 'Tender Slip for Buyers', stage: 'Pre-Auction', size: 'A4 Landscape (Triplicate)', icon: FileText, color: 'from-amber-400 to-orange-500' },
  { id: 'chiti_buyer', name: 'Chiti for Buyer', stage: 'Post-Auction', size: '80mm Thermal Roll', icon: Printer, color: 'from-pink-400 to-rose-500' },
  { id: 'dispatch_coolie', name: 'Dispatch Control (Coolie)', stage: 'Post-Auction', size: 'A5 Portrait', icon: Truck, color: 'from-indigo-400 to-blue-500' },
  { id: 'buyer_delivery', name: 'Buyer Delivery Report', stage: 'Post-Weighing', size: 'A4 Portrait', icon: FileText, color: 'from-cyan-400 to-blue-500' },
  { id: 'chiti_seller', name: 'Chiti for Seller', stage: 'Post-Weighing', size: '80mm Thermal Roll', icon: Printer, color: 'from-rose-400 to-pink-500' },
  { id: 'gst_bill', name: 'GST Sales Bill (Buyer)', stage: 'Billing', size: 'A4 Portrait', icon: FileText, color: 'from-emerald-400 to-green-500' },
  { id: 'nongst_bill', name: 'Non-GST Sales Bill', stage: 'Billing', size: 'A5 Portrait', icon: FileText, color: 'from-amber-400 to-yellow-500' },
  { id: 'seller_invoice', name: 'Non-GST Sales Invoice (Seller)', stage: 'Settlement', size: 'A4/A5 Portrait', icon: FileText, color: 'from-purple-400 to-violet-500' },
  { id: 'main_invoice', name: 'Main Invoice A4 (Collated)', stage: 'Settlement', size: 'A4 Portrait', icon: FileText, color: 'from-blue-400 to-indigo-500' },
  { id: 'market_fee', name: 'Market Fee Report', stage: 'Compliance', size: 'A4 Portrait', icon: DollarSign, color: 'from-teal-400 to-emerald-500' },
  { id: 'gst_report', name: 'GST Report', stage: 'Compliance', size: 'A4 Portrait', icon: Shield, color: 'from-red-400 to-rose-500' },
];

// ── Analytics Report Types ──────────────────────────────
const reportTypes = [
  { id: 'daily_sales', name: 'Daily Sales Summary', icon: TrendingUp, desc: 'Total bills, bags, revenue, commission, collections' },
  { id: 'bill_register', name: 'Bill Register', icon: FileText, desc: 'Date-range filtered bill history with version tracking' },
  { id: 'gst_report', name: 'GST Report', icon: Shield, desc: 'Input/Output GST with HSN code breakdown' },
  { id: 'arrival_report', name: 'Arrival Report', icon: Truck, desc: 'Farmer arrivals with freight & advance details' },
  { id: 'patti_register', name: 'Sales Invoice (Patti) Register', icon: FileText, desc: 'Seller settlement register' },
  { id: 'lot_reconciliation', name: 'Lot Reconciliation', icon: Package, desc: 'Arrived vs sold bags with pending balance' },
  { id: 'collection_report', name: 'Collection Report', icon: DollarSign, desc: 'Cash and bank collections by date' },
  { id: 'party_exposure', name: 'Party Exposure Summary', icon: AlertTriangle, desc: 'Outstanding amounts with risk levels' },
  { id: 'commission_income', name: 'Commission Income Report', icon: TrendingUp, desc: 'Commission earned by party (RBAC restricted)' },
  { id: 'market_fee_report', name: 'Market Fee Report', icon: Shield, desc: 'User fee / market cess compliance report' },
];

const PrintsReportsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { canAccessModule } = usePermissions();
  const canView = canAccessModule('Print Templates');
  if (!canView) {
    return <ForbiddenPage moduleName="Print Templates" />;
  }
  const [activeTab, setActiveTab] = useState('prints');
  const [search, setSearch] = useState('');
  const [selectedPrint, setSelectedPrint] = useState<typeof printTemplates[0] | null>(null);
  const [selectedReport, setSelectedReport] = useState<typeof reportTypes[0] | null>(null);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [showPreview, setShowPreview] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [arrivals, setArrivals] = useState<any[]>([]);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const [bills, setBills] = useState<SalesBillDTO[]>([]);
  const [settlements, setSettlements] = useState<PattiDTO[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySalesSummaryDTO | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { trader } = useAuth();
  const firm: FirmInfo = useMemo(() => {
    const addressParts = [trader?.address, trader?.city, trader?.state, trader?.pin_code].filter(Boolean);
    return {
      name: trader?.business_name ?? '',
      about: trader?.category ?? '',
      address: addressParts.join(', '),
      apmcCode: '',
      phone: trader?.mobile ?? '',
      email: trader?.email ?? '',
      gstin: '',
      bank: { name: '', acc: '', ifsc: '', branch: '' },
    };
  }, [trader]);

  useEffect(() => {
    contactApi.list().then(setContacts);
    arrivalsApi.list(0, 500).then(setArrivals);
  }, []);

  useEffect(() => {
    arrivalsApi.listDetail(0, 100).then(setArrivalDetails).catch(() => setArrivalDetails([]));
  }, []);

  useEffect(() => {
    billingApi.getPage({ page: 0, size: 500, sort: 'billDate,desc' }).then((p) => setBills(p.content ?? [])).catch(() => setBills([]));
  }, []);

  useEffect(() => {
    settlementApi.listPattis({ page: 0, size: 500 }).then(setSettlements).catch(() => setSettlements([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await reportsApi.getPartyExposure(dateFrom, dateTo);
        if (!cancelled) {
          setPartyExposure(res);
        }
      } catch (err) {
        if (!cancelled) {
          setPartyExposure([]);
          toast.error((err as Error)?.message ?? 'Failed to load party exposure');
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo]);

  // Backend-backed daily summary for prints reports tab
  useEffect(() => {
    if (!dateFrom || !dateTo) {
      setDailySummary(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setDailySummaryLoading(true);
        const res = await reportsApi.getDailySalesSummary(dateFrom, dateTo);
        if (!cancelled) {
          setDailySummary(res);
        }
      } catch (err) {
        if (!cancelled) {
          setDailySummary(null);
          toast.error((err as Error)?.message ?? 'Failed to load daily sales summary');
        }
      } finally {
        if (!cancelled) {
          setDailySummaryLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  const [partyExposure, setPartyExposure] = useState<any[]>([]);
  const lotReconciliation: { seller: string; arrivalDate: string; commodity: string; arrivedBags: number; soldBags: number; pendingBags: number; avgRate: number; grossSale: number; status: string }[] =
    [];

  const filteredPrints = useMemo(() => {
    if (!search) return printTemplates;
    const q = search.toLowerCase();
    return printTemplates.filter(p => p.name.toLowerCase().includes(q) || p.stage.toLowerCase().includes(q));
  }, [search]);

  const filteredReports = useMemo(() => {
    if (!search) return reportTypes;
    const q = search.toLowerCase();
    return reportTypes.filter(r => r.name.toLowerCase().includes(q));
  }, [search]);

  const printStages = useMemo(() => {
    const stages = [...new Set(filteredPrints.map(p => p.stage))];
    return stages.map(s => ({ stage: s, items: filteredPrints.filter(p => p.stage === s) }));
  }, [filteredPrints]);

  const handlePrint = (template: typeof printTemplates[0]) => {
    setSelectedPrint(template);
    setShowPreview(true);
  };

  const handleExport = (format: 'pdf' | 'excel' | 'tally') => {
    toast.info(`Exports from Prints & Reports will be powered by backend data in a future release (requested: ${format.toUpperCase()}).`);
  };

  const templateHTML = selectedPrint ? generateTemplateHTML(selectedPrint.id, arrivalDetails, firm) : '';

  const handleDoPrint = async () => {
    if (!selectedPrint) return;
    toast.info(`Printing ${selectedPrint.name}…`);
    try {
      await printLogApi.create({
        reference_type: selectedPrint.id.toUpperCase().replace(/-/g, '_'),
        reference_id: undefined,
        print_type: selectedPrint.id.toUpperCase().replace(/-/g, '_'),
      });
    } catch {
      // optional
    }
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;}</style></head><body>${templateHTML}</body></html>`;
    const ok = await directPrint(fullHtml, { mode: "system" });
    if (ok) {
      toast.success('Sent to printer!');
      setShowPreview(false);
    } else {
      toast.error('Printer not connected.');
    }
  };

  const riskColor = (level: string) => {
    if (level === 'Low') return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300';
    if (level === 'Medium') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300';
    if (level === 'High') return 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300';
    return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-200';
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {!isDesktop && (
        <div className="hero-gradient pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => navigate('/home')} aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Printer className="w-5 h-5" /> Prints & Reports
                </h1>
                <p className="text-white/70 text-xs">Templates, analytics & exports</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input aria-label="Search" placeholder="Search prints or reports…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      {isDesktop && (
        <div className="px-8 pt-6 pb-4 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled title="Exports will be enabled once backend export flows are wired.">
              <Download className="w-3 h-3 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" disabled title="Exports will be enabled once backend export flows are wired.">
              <Download className="w-3 h-3 mr-1" /> Excel
            </Button>
            <Button variant="outline" size="sm" disabled title="Exports will be enabled once backend export flows are wired.">
              <Download className="w-3 h-3 mr-1" /> Tally
            </Button>
          </div>
        </div>
      )}

      <div className={cn("px-4", isDesktop ? "lg:px-8" : "mt-4")}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-4 glass-card rounded-xl">
            <TabsTrigger value="prints" className="flex-1 text-sm font-semibold">
              <Printer className="w-4 h-4 mr-1" /> Print Templates
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex-1 text-sm font-semibold">
              <BarChart3 className="w-4 h-4 mr-1" /> Analytics Reports
            </TabsTrigger>
          </TabsList>

          {/* ═══ PRINTS TAB ═══ */}
          <TabsContent value="prints" className="space-y-6">
            {printStages.map(({ stage, items }) => (
              <div key={stage}>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{stage}</h3>
                <div className={cn("grid gap-3", isDesktop ? "grid-cols-3 xl:grid-cols-4" : "grid-cols-2")}>
                  {items.map(t => (
                    <motion.button key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      onClick={() => handlePrint(t)}
                      className="glass-card rounded-xl p-3 text-left hover:primary-glow transition-all group">
                      <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center mb-2", t.color)}>
                        <t.icon className="w-4 h-4 text-white" />
                      </div>
                      <p className="font-semibold text-xs text-foreground leading-tight">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{t.size}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ═══ REPORTS TAB ═══ */}
          <TabsContent value="reports" className="space-y-4">
            {/* Date Range */}
            <div className="glass-card rounded-xl p-3 flex items-center gap-3 flex-wrap">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
            </div>

            {/* Daily Sales Summary Card */}
            <div className="glass-card rounded-2xl p-4">
              <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Daily Sales Summary
              </h3>
              {dailySummaryLoading && (
                <p className="text-xs text-muted-foreground">Loading daily sales summary…</p>
              )}
              {!dailySummaryLoading && !dailySummary && (
                <p className="text-xs text-muted-foreground">No daily sales data for the selected range.</p>
              )}
              {dailySummary && (
                <div className={cn("grid gap-3", isDesktop ? "grid-cols-4" : "grid-cols-2")}>
                  {[
                    { label: 'Total Bills', value: dailySummary.totalBills },
                    { label: 'Total Bags', value: dailySummary.totalBags ?? 0 },
                    { label: 'Gross Sale', value: `₹${dailySummary.grossSale.toLocaleString()}` },
                    { label: 'Commission', value: `₹${dailySummary.commission.toLocaleString()}` },
                    { label: 'User Fee', value: `₹${dailySummary.userFee.toLocaleString()}` },
                    { label: 'Coolie', value: `₹${dailySummary.coolie.toLocaleString()}` },
                    { label: 'Total Collected', value: `₹${dailySummary.totalCollected.toLocaleString()}` },
                    { label: 'Outstanding', value: `₹${dailySummary.outstanding.toLocaleString()}` },
                  ].map(m => (
                    <div key={m.label} className="bg-muted/30 rounded-xl p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                      <p className="text-lg font-bold text-foreground mt-0.5">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Party Exposure */}
            <div className="glass-card rounded-2xl p-4">
              <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Party Exposure Summary
              </h3>
              {isDesktop ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-2 text-muted-foreground font-medium">Party</th>
                      <th className="text-right p-2 text-muted-foreground font-medium">Total Sale</th>
                      <th className="text-right p-2 text-muted-foreground font-medium">Collected</th>
                      <th className="text-right p-2 text-muted-foreground font-medium">Outstanding</th>
                      <th className="text-left p-2 text-muted-foreground font-medium">Oldest Due</th>
                      <th className="text-center p-2 text-muted-foreground font-medium">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partyExposure.map((p, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0">
                        <td className="p-2 font-medium">{p.party}</td>
                        <td className="p-2 text-right">₹{p.totalSale.toLocaleString()}</td>
                        <td className="p-2 text-right">₹{p.totalCollected.toLocaleString()}</td>
                        <td className="p-2 text-right font-semibold">₹{p.outstanding.toLocaleString()}</td>
                        <td className="p-2">{p.oldestDue}</td>
                        <td className="p-2 text-center"><span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", riskColor(p.riskLevel))}>{p.riskLevel}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="space-y-2">
                  {partyExposure.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                      <div>
                        <p className="text-sm font-medium">{p.party}</p>
                        <p className="text-xs text-muted-foreground">Outstanding: ₹{p.outstanding.toLocaleString()}</p>
                      </div>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", riskColor(p.riskLevel))}>{p.riskLevel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lot Reconciliation */}
            <div className="glass-card rounded-2xl p-4">
              <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-500" /> Lot Reconciliation
              </h3>
              <p className="text-xs text-muted-foreground">
                Lot reconciliation analytics will be wired to arrivals, auctions, and billing data. This preview intentionally shows no sample rows.
              </p>
            </div>

            {/* Report Type Cards */}
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4">All Reports</h3>
            <div className={cn("grid gap-3", isDesktop ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
              {filteredReports.map(r => (
                <motion.button key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  onClick={() => { setSelectedReport(r); toast.info(`${r.name} — generating…`); }}
                  className="glass-card rounded-xl p-4 text-left hover:primary-glow transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <r.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</p>
                    </div>
                    <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Export buttons for mobile */}
            {!isDesktop && (
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleExport('pdf')}><Download className="w-3 h-3 mr-1" /> PDF</Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleExport('excel')}><Download className="w-3 h-3 mr-1" /> Excel</Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleExport('tally')}><Download className="w-3 h-3 mr-1" /> Tally</Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Print Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className={cn("max-w-3xl max-h-[90vh] overflow-y-auto", isDesktop && "glass-card border-primary/10")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-primary" /> {selectedPrint?.name}
            </DialogTitle>
            <DialogDescription>{selectedPrint?.size} · {selectedPrint?.stage}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div
              ref={printRef}
              className="border border-border rounded-xl p-4 bg-white text-black min-h-[300px] overflow-auto shadow-inner"
              style={{ colorScheme: 'light' }}
              dangerouslySetInnerHTML={{ __html: templateHTML }}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
            <Button variant="outline" disabled title="Exports will be enabled once backend export flows are wired.">
              <Download className="w-4 h-4 mr-1" /> Export PDF
            </Button>
            <Button onClick={handleDoPrint} className="bg-gradient-to-r from-primary to-accent text-white">
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default PrintsReportsPage;
