import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Printer, Search, FileText, Download, Truck, DollarSign,
  Shield, Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { useDesktopMode } from '@/hooks/use-desktop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { arrivalsApi } from '@/services/api';
import type { ArrivalDetail } from '@/services/api/arrivals';
import { generateTemplateHTML, isFullDocumentPrintTemplate, type FirmInfo } from '@/utils/printPreviewTemplates';

export type { FirmInfo };

/* ── Print Templates from SRS ── */
const printTemplates = [
  { id: 'sale_pad', name: 'Sale Pad Print', stage: 'Pre-Auction', size: 'A5 Portrait', icon: FileText, color: 'from-blue-500 to-cyan-400' },
  { id: 'sales_sticker', name: 'Sales Sticker', stage: 'Pre-Auction', size: '150mm×80mm Thermal', icon: Printer, color: 'from-emerald-500 to-teal-400' },
  { id: 'tender_form', name: 'Tender Form (APMC)', stage: 'Pre-Auction', size: 'A4 Portrait', icon: FileText, color: 'from-violet-500 to-purple-400' },
  { id: 'tender_slip', name: 'Tender Slip for Buyers', stage: 'Pre-Auction', size: 'A4 Landscape (Triplicate)', icon: FileText, color: 'from-amber-500 to-orange-400' },
  { id: 'chiti_buyer', name: 'Chiti for Buyer', stage: 'Post-Auction', size: '80mm Thermal Roll', icon: Printer, color: 'from-pink-500 to-rose-400' },
  { id: 'dispatch_coolie', name: 'Dispatch Control (Coolie)', stage: 'Post-Auction', size: 'A5 Portrait', icon: Truck, color: 'from-indigo-500 to-blue-400' },
  { id: 'buyer_delivery', name: 'Buyer Delivery Report', stage: 'Post-Weighing', size: 'A4 Portrait', icon: FileText, color: 'from-cyan-500 to-blue-400' },
  { id: 'chiti_seller', name: 'Chiti for Seller', stage: 'Post-Weighing', size: '80mm Thermal Roll', icon: Printer, color: 'from-rose-500 to-pink-400' },
  { id: 'gst_bill', name: 'GST Sales Bill (Buyer)', stage: 'Billing', size: 'A4 Portrait', icon: FileText, color: 'from-emerald-500 to-green-400' },
  { id: 'nongst_bill', name: 'Non-GST Sales Bill', stage: 'Billing', size: 'A5 Portrait', icon: FileText, color: 'from-amber-500 to-yellow-400' },
  { id: 'seller_invoice', name: 'Non-GST Sales Invoice (Seller)', stage: 'Settlement', size: 'A4/A5 Portrait', icon: FileText, color: 'from-purple-500 to-violet-400' },
  { id: 'main_invoice', name: 'Main Invoice A4 (Collated)', stage: 'Settlement', size: 'A4 Portrait', icon: FileText, color: 'from-blue-500 to-indigo-400' },
  { id: 'invoice_a5', name: 'Invoice A5 (Single Seller)', stage: 'Settlement', size: 'A5 Portrait', icon: FileText, color: 'from-teal-500 to-cyan-400' },
  { id: 'market_fee', name: 'Market Fee Report', stage: 'Compliance', size: 'A4 Portrait', icon: DollarSign, color: 'from-teal-500 to-emerald-400' },
  { id: 'gst_report', name: 'GST Report', stage: 'Compliance', size: 'A4 Portrait', icon: Shield, color: 'from-red-500 to-rose-400' },
];

const stageColors: Record<string, string> = {
  'Pre-Auction': 'from-blue-500/10 to-blue-400/5 border-blue-200/50 dark:border-blue-800/30',
  'Post-Auction': 'from-pink-500/10 to-pink-400/5 border-pink-200/50 dark:border-pink-800/30',
  'Post-Weighing': 'from-cyan-500/10 to-cyan-400/5 border-cyan-200/50 dark:border-cyan-800/30',
  'Billing': 'from-emerald-500/10 to-emerald-400/5 border-emerald-200/50 dark:border-emerald-800/30',
  'Settlement': 'from-violet-500/10 to-violet-400/5 border-violet-200/50 dark:border-violet-800/30',
  'Compliance': 'from-amber-500/10 to-amber-400/5 border-amber-200/50 dark:border-amber-800/30',
};

const stageBadgeColors: Record<string, string> = {
  'Pre-Auction': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Post-Auction': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  'Post-Weighing': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Billing': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Settlement': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'Compliance': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const PrintsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { trader } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedPrint, setSelectedPrint] = useState<typeof printTemplates[0] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [arrivalDetails, setArrivalDetails] = useState<ArrivalDetail[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

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
    arrivalsApi.listDetail(0, 100).then(setArrivalDetails).catch(() => setArrivalDetails([]));
  }, []);

  const filteredPrints = useMemo(() => {
    if (!search) return printTemplates;
    const q = search.toLowerCase();
    return printTemplates.filter(p => p.name.toLowerCase().includes(q) || p.stage.toLowerCase().includes(q));
  }, [search]);

  const printStages = useMemo(() => {
    const stages = [...new Set(filteredPrints.map(p => p.stage))];
    return stages.map(s => ({ stage: s, items: filteredPrints.filter(p => p.stage === s) }));
  }, [filteredPrints]);

  const handlePrint = (template: typeof printTemplates[0]) => {
    setSelectedPrint(template);
    setShowPreview(true);
  };

  const triggerWindowPrint = () => {
    const fullDoc = selectedPrint && isFullDocumentPrintTemplate(selectedPrint.id);
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) { toast.error('Pop-up blocked. Please allow pop-ups.'); return; }
    if (fullDoc && templateHTML) {
      printWindow.document.open();
      printWindow.document.write(templateHTML);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
      return;
    }
    const content = printRef.current;
    if (!content) return;
    printWindow.document.write(`
      <html><head><title>${selectedPrint?.name || 'Print'}</title>
      <style>body { margin: 0; padding: 0; } @media print { body { margin: 0; } }</style>
      </head><body>${content.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  const exportPDF = () => {
    triggerWindowPrint();
    toast.info('Use "Save as PDF" in the print dialog to export as PDF');
  };

  const templateHTML = selectedPrint ? generateTemplateHTML(selectedPrint.id, arrivalDetails, firm) : '';
  const previewFullDocument = Boolean(selectedPrint && isFullDocumentPrintTemplate(selectedPrint.id));

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
                  <Printer className="w-5 h-5" /> Print Templates
                </h1>
                <p className="text-white/70 text-xs">Stage-wise document printing</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input aria-label="Search" placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      {isDesktop && (
        <div className="px-8 pt-6 pb-4 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>
      )}

      <div className={cn("px-4", isDesktop ? "lg:px-8" : "mt-4")}>
        <div className="space-y-6">
          {printStages.map(({ stage, items }, sIdx) => (
            <motion.div key={stage} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: sIdx * 0.08 }}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className={cn("px-3 py-1 rounded-full text-[11px] font-bold", stageBadgeColors[stage] || 'bg-muted text-muted-foreground')}>
                  {stage}
                </span>
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] text-muted-foreground">{items.length} templates</span>
              </div>
              <div className={cn("grid gap-3", isDesktop ? "grid-cols-3 xl:grid-cols-4" : "grid-cols-2")}>
                {items.map((t, idx) => (
                  <motion.button key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                    onClick={() => handlePrint(t)}
                    className={cn("glass-card rounded-xl p-4 text-left hover:shadow-lg transition-all group border",
                      stageColors[t.stage] || 'border-border/30',
                      "bg-gradient-to-br"
                    )}>
                    <div className={cn("w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 shadow-lg", t.color)}>
                      <t.icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="font-bold text-sm text-foreground leading-tight">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{t.size}</p>
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      <Eye className="w-3 h-3" /> Preview & Print
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Print Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className={cn("max-w-3xl max-h-[90vh] overflow-y-auto", isDesktop && "glass-card border-primary/10")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedPrint && (
                <div className={cn("w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md", selectedPrint.color)}>
                  <selectedPrint.icon className="w-4 h-4 text-white" />
                </div>
              )}
              <div>
                <span className="text-base">{selectedPrint?.name}</span>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">{selectedPrint?.size} · {selectedPrint?.stage}</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Print template preview</DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {previewFullDocument ? (
              <iframe
                title={selectedPrint ? `${selectedPrint.name} preview` : 'Print preview'}
                srcDoc={templateHTML}
                className="w-full min-h-[65vh] border border-border rounded-xl bg-white shadow-inner"
                style={{ colorScheme: 'light' }}
              />
            ) : (
              <div
                ref={printRef}
                className="border border-border rounded-xl p-4 bg-white text-black min-h-[300px] overflow-auto shadow-inner"
                style={{ colorScheme: 'light' }}
                dangerouslySetInnerHTML={{ __html: templateHTML }}
              />
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
            <Button variant="outline" className="gap-1.5 border-red-300 text-red-700 dark:border-red-700 dark:text-red-400" onClick={exportPDF}>
              <Download className="w-4 h-4" /> Export PDF
            </Button>
            <Button onClick={triggerWindowPrint} className="bg-gradient-to-r from-primary to-accent text-white gap-1.5 shadow-lg">
              <Printer className="w-4 h-4" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default PrintsPage;
