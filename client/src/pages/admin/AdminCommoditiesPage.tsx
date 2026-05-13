import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Gem, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { commodityApi } from '@/services/api';
import type { Commodity } from '@/types/models';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import AdminForbiddenPage from '@/admin/components/AdminForbiddenPage';

import onionImg from '@/assets/commodities/onion.jpg';
import potatoImg from '@/assets/commodities/potato.jpg';
import dryChiliImg from '@/assets/commodities/dry-chili.jpg';
import tomatoImg from '@/assets/commodities/tomato.jpg';

const commodityImages: Record<string, string> = { 'Onion': onionImg, 'Potato': potatoImg, 'Dry Chili': dryChiliImg, 'Tomato': tomatoImg };

const PAGE_SIZE = 50;

const AdminCommoditiesPage = () => {
  const { canAccessModule } = useAdminPermissions();
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const canView = canAccessModule('Commodities');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!canView) {
      return;
    }

    let active = true;

    const loadCommodities = async () => {
      setLoading(true);
      try {
        const data = await commodityApi.adminListPage({
          page,
          size: PAGE_SIZE,
          q: debouncedSearch,
        });
        if (!active) return;
        setCommodities(Array.isArray(data.commodities) ? data.commodities : []);
        setTotal(Number.isFinite(data.total) ? data.total : 0);
      } catch {
        if (!active) return;
        setCommodities([]);
        setTotal(0);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadCommodities();

    return () => {
      active = false;
    };
  }, [canView, debouncedSearch, page]);

  if (!canView) {
    return <AdminForbiddenPage moduleName="Commodities" />;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstVisible = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastVisible = total === 0 ? 0 : Math.min(total, page * PAGE_SIZE + commodities.length);
  const canGoPrevious = page > 0;
  const canGoNext = page + 1 < totalPages;

  return (
    <div className="space-y-5 relative">
      <div className="fixed pointer-events-none z-0" style={{ left: 0, right: 0, top: 0, bottom: 0 }}>
        <div className="absolute top-1/4 right-0 w-[450px] h-[450px] bg-gradient-to-bl from-amber-400/8 via-orange-400/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-gradient-to-tr from-blue-500/7 via-cyan-400/4 to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Gem className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Commodities Overview</h1>
          <p className="text-sm text-muted-foreground">
            {loading && total === 0 ? 'Loading commodities...' : `${total.toLocaleString()} commodities configured`}
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative max-w-sm z-10">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search commodities…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10 rounded-xl" />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl overflow-hidden relative z-10 border border-white/40 dark:border-white/10">
        <div className="relative z-10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-b border-primary/10">
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commodity</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading && commodities.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-muted-foreground">Loading commodities...</td>
                </tr>
              ) : commodities.map((c, i) => (
                <motion.tr key={c.commodity_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.04 }}
                  className="border-b border-border/20 hover:bg-primary/5 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg border-2 border-white/50 dark:border-white/20 flex-shrink-0">
                        {commodityImages[c.commodity_name] ? (
                          <img src={commodityImages[c.commodity_name]} alt={c.commodity_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                            <span className="text-white font-bold text-xs">{c.commodity_name.charAt(0)}</span>
                          </div>
                        )}
                      </div>
                      <span className="font-semibold text-foreground">{c.commodity_name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-muted-foreground text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && commodities.length === 0 && <div className="p-12 text-center text-muted-foreground">No commodities found</div>}
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

export default AdminCommoditiesPage;
