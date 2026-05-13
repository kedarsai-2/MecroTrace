import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Phone, BookUser, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { contactApi } from '@/services/api';
import type { Contact } from '@/types/models';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import AdminForbiddenPage from '@/admin/components/AdminForbiddenPage';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

const AdminContactsPage = () => {
  const { canAccessModule } = useAdminPermissions();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;

    const loadContacts = async () => {
      setLoading(true);
      try {
        const data = await contactApi.adminListPage({
          page,
          size: PAGE_SIZE,
          q: debouncedSearch,
        });
        if (!active) return;
        setContacts(Array.isArray(data.contacts) ? data.contacts : []);
        setTotal(Number.isFinite(data.total) ? data.total : 0);
      } catch {
        if (!active) return;
        setContacts([]);
        setTotal(0);
        toast.error('Failed to load contacts');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadContacts();

    return () => {
      active = false;
    };
  }, [debouncedSearch, page]);

  if (!canAccessModule('Contacts')) {
    return <AdminForbiddenPage moduleName="Contacts" />;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstVisible = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastVisible = total === 0 ? 0 : Math.min(total, page * PAGE_SIZE + contacts.length);
  const canGoPrevious = page > 0;
  const canGoNext = page + 1 < totalPages;

  return (
    <div className="space-y-5 relative">
      <div className="fixed pointer-events-none z-0" style={{ left: 0, right: 0, top: 0, bottom: 0 }}>
        <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-gradient-to-bl from-emerald-400/8 via-teal-400/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-blue-500/7 via-violet-400/4 to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <BookUser className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Contacts Directory</h1>
          <p className="text-sm text-muted-foreground">
            {loading && total === 0 ? 'Loading contacts...' : `${total.toLocaleString()} contacts across all traders`}
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="flex items-center gap-3 relative z-10">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone or mark…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10 rounded-xl" />
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl overflow-hidden relative z-10 border border-white/40 dark:border-white/10">
        <div className="relative z-10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-b border-primary/10">
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mark</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Address</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Portal</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading && contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">Loading contacts...</td>
                </tr>
              ) : contacts.map((c, i) => {
                const name = typeof c?.name === 'string' ? c.name : 'Unnamed';
                const mark = typeof c?.mark === 'string' ? c.mark : '';
                const phone = typeof c?.phone === 'string' ? c.phone : '';
                const address = typeof c?.address === 'string' ? c.address : '';
                const contactKey = c?.contact_id ? String(c.contact_id) : `contact-${i}`;
                const balanceRaw = Number(c?.current_balance ?? 0);
                const balance = Number.isFinite(balanceRaw) ? balanceRaw : 0;
                const avatarLetter = (mark || name).trim().charAt(0).toUpperCase() || '?';

                return (
                <tr key={contactKey}
                  className="border-b border-border/20 hover:bg-primary/5 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                        <span className="text-white font-bold text-xs">{avatarLetter}</span>
                      </div>
                      <span className="font-semibold text-foreground">{name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {phone || '—'}</td>
                  <td className="py-3.5 px-4 text-foreground font-medium">{mark || '—'}</td>
                  <td className="py-3.5 px-4 text-muted-foreground">{address || '—'}</td>
                  <td className="py-3.5 px-4 text-muted-foreground">
                    {c.can_login ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Enabled
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Disabled</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className={cn('font-semibold', balance >= 0 ? 'text-success' : 'text-destructive')}>
                      ₹{Math.abs(balance).toLocaleString()}
                    </span>
                    <p className="text-[10px] text-muted-foreground">{balance >= 0 ? 'Receivable' : 'Payable'}</p>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && contacts.length === 0 && <div className="p-12 text-center text-muted-foreground">No contacts found</div>}
        <div className="relative z-10 flex flex-col gap-3 border-t border-border/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {firstVisible.toLocaleString()}-{lastVisible.toLocaleString()} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(current => Math.max(0, current - 1))}
              disabled={!canGoPrevious || loading}
              className="h-9 gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="min-w-[92px] text-center text-xs font-medium text-muted-foreground">
              Page {Math.min(page + 1, totalPages)} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(current => current + 1)}
              disabled={!canGoNext || loading}
              className="h-9 gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminContactsPage;
