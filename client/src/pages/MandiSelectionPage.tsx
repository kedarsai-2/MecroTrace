import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, Loader2, LogOut, MapPin, RefreshCw, Store, User } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { multiTraderAccountsApi } from '@/services/api';
import type { TraderAccountOption } from '@/services/api/auth';

const loginBg = '/login-bg.webp';

function routeAccounts(state: unknown): TraderAccountOption[] {
  const accounts = (state as { accounts?: unknown } | null)?.accounts;
  if (!Array.isArray(accounts)) return [];
  return accounts.filter((account): account is TraderAccountOption => {
    return Boolean(account && typeof account === 'object' && (account as TraderAccountOption).trader_id);
  });
}

function accountLocation(account: TraderAccountOption): string {
  return [account.city, account.state].filter(Boolean).join(', ');
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

const MandiSelectionPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialAccounts = routeAccounts(location.state);
  const { selectTrader, logout, trader, isLoading: authLoading } = useAuth();

  const [accounts, setAccounts] = useState<TraderAccountOption[]>(initialAccounts);
  const [loading, setLoading] = useState(initialAccounts.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectingTraderId, setSelectingTraderId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAccounts = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    try {
      const nextAccounts = await multiTraderAccountsApi.accounts();
      setAccounts(nextAccounts);
    } catch (e: unknown) {
      const message = errorMessage(e, 'Failed to load mandi profiles');
      setLoadError(message);
      if (!trader && initialAccounts.length === 0) {
        toast.error('Please sign in again.');
        navigate('/login', { replace: true });
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAccounts(initialAccounts.length === 0);
    // Load once on entry. The login route passes accounts immediately, then this refreshes them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = async (account: TraderAccountOption) => {
    setSelectingTraderId(account.trader_id);
    try {
      await selectTrader(account.trader_id);
      queryClient.clear();
      toast.success(`Opened ${account.business_name}`);
      navigate('/home', { replace: true });
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Failed to select mandi profile'));
    } finally {
      setSelectingTraderId(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-slate-950">
      <img src={loginBg} alt="" role="presentation" className="absolute inset-0 z-0 h-full w-full object-cover" />
      <div className="absolute inset-0 z-[1] bg-slate-950/75" />

      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-white backdrop-blur-md">
            <MercotraceIcon size={24} color="white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Mercotrace</p>
            <p className="truncate text-xs text-white/65">Mandi selection</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25"
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-white backdrop-blur-md">
                <Building2 className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Select Mandi</h1>
              <p className="mt-1 text-sm text-white/70">Choose the mandi profile for this session.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadAccounts(false)}
              disabled={loading || refreshing || !!selectingTraderId}
              className="h-10 gap-2 rounded-lg border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="flex min-h-52 items-center justify-center rounded-lg border border-white/15 bg-white/10 backdrop-blur-md">
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>
          ) : accounts.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map(account => {
                const locationLabel = accountLocation(account);
                const isSelecting = selectingTraderId === account.trader_id;
                const isBusy = authLoading || !!selectingTraderId;
                const isLastUsed = account.primary_mapping || account.trader_id === trader?.trader_id;

                return (
                  <button
                    key={account.trader_id}
                    type="button"
                    onClick={() => void handleSelect(account)}
                    disabled={isBusy}
                    className={cn(
                      'group min-h-32 rounded-lg border border-white/20 bg-white/95 p-4 text-left text-slate-950 shadow-xl transition',
                      'hover:-translate-y-0.5 hover:bg-white hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                      'disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-700">
                          <Store className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-base font-bold leading-snug">{account.business_name}</p>
                          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-600">
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{account.owner_name || 'Owner'}</span>
                          </p>
                        </div>
                      </div>
                      {isSelecting ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-700" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 opacity-80 transition group-hover:opacity-100" />
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      {locationLabel ? (
                        <p className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-slate-500">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{locationLabel}</span>
                        </p>
                      ) : (
                        <span />
                      )}
                      {isLastUsed && (
                        <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                          Last used
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-white/15 bg-white/10 p-6 text-center text-white backdrop-blur-md">
              <Building2 className="mx-auto mb-3 h-8 w-8 text-white/80" />
              <h2 className="text-lg font-bold">No approved mandi profiles</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
                {loadError || 'Approved mandi profiles will appear here after admin approval.'}
              </p>
              {trader && (
                <Button
                  type="button"
                  onClick={() => navigate('/home', { replace: true })}
                  className="mt-5 rounded-lg bg-white text-blue-700 hover:bg-white/90"
                >
                  Continue
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MandiSelectionPage;
