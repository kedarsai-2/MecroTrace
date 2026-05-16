import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthState, Trader, User } from '@/types/models';
import { authApi } from '@/services/api';
import type { AuthLoginResult } from '@/services/api/auth';
import { setTraderToken } from '@/services/api/tokenStore';

interface AuthContextType extends AuthState {
  /** True once initial auth check (getProfile) has completed. Used by ProtectedRoute to avoid redirecting before bootstrap. */
  hasBootstrapped: boolean;
  login: (email: string, password: string) => Promise<AuthLoginResult>;
  loginWithOtp: (mobile: string, otp: string) => Promise<AuthLoginResult>;
  selectTrader: (traderId: string) => Promise<{ user: User; trader: Trader }>;
  /** Returns { user, trader } so callers can e.g. upload photos post-register. */
  register: (data: any) => Promise<{ user: User; trader: Trader }>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  trader: null,
  hasBootstrapped: false,
  login: async () => ({ accountSelectionRequired: true, user: null as any, accounts: [] }),
  loginWithOtp: async () => ({ accountSelectionRequired: true, user: null as any, accounts: [] }),
  selectTrader: async () => ({ user: null as any, trader: null as any }),
  register: async () => ({ user: null as any, trader: null as any }),
  refreshProfile: async () => {},
  logout: async () => {},
  isLoading: false,
  error: null,
  clearError: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    trader: null,
  });
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Skip trader bootstrap entirely when user is in the admin or contact portal.
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const isAdminPath = pathname.startsWith('/admin');
      const isContactPortalPath = pathname === '/contact' || pathname.startsWith('/contact/');
      if (!isAdminPath && !isContactPortalPath) {
        // continue with trader bootstrap below
      } else {
      setHasBootstrapped(true);
      return () => {
        cancelled = true;
      };
      }
    }

    const bootstrap = async () => {
      try {
        let profile = await authApi.getProfile();
        if (!cancelled && !profile) {
          const refreshed = await authApi.refreshSession();
          if (refreshed && !cancelled) {
            profile = await authApi.getProfile();
          }
        }
        // Retry once on 401 to avoid redirecting when session cookie is valid but first request was transient (e.g. race)
        if (!cancelled && !profile) {
          await new Promise((r) => setTimeout(r, 400));
          if (!cancelled) profile = await authApi.getProfile();
        }
        if (!cancelled && profile) {
          setState({
            isAuthenticated: true,
            user: profile.user,
            trader: profile.trader,
          });
        }
      } catch {
        // ignore bootstrap errors; user will be treated as logged out
      } finally {
        if (!cancelled) {
          setHasBootstrapped(true);
        }
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.login(email, password);
      if (!('accountSelectionRequired' in result)) {
        setState({
          isAuthenticated: true,
          user: result.user,
          trader: result.trader,
        });
      }
      return result;
    } catch (e: any) {
      setError(e.message || 'Login failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginWithOtp = useCallback(async (mobile: string, otp: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.verifyOtp(mobile, otp);
      if (!('accountSelectionRequired' in result)) {
        setState({
          isAuthenticated: true,
          user: result.user,
          trader: result.trader,
        });
      }
      return result;
    } catch (e: any) {
      setError(e.message || 'Login failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectTrader = useCallback(async (traderId: string): Promise<{ user: User; trader: Trader }> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.selectTrader(traderId);
      setState({
        isAuthenticated: true,
        user: result.user,
        trader: result.trader,
      });
      return result;
    } catch (e: any) {
      setError(e.message || 'Account selection failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: any): Promise<{ user: User; trader: Trader }> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.register({
        business_name: data.businessName || data.business_name || '',
        owner_name: data.ownerName || data.owner_name || '',
        mobile: data.mobile || '',
        email: data.email || '',
        password: data.password || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        pin_code: data.pinCode || data.pin_code || '',
        category: data.categoryName || data.category || '',
        gst_number: data.gstNumber || data.gst_number || undefined,
        rmc_apmc_code: data.rmcApmcCode || data.rmc_apmc_code || undefined,
        shop_photos: data.shopPhotos || data.shop_photos || [],
      });
      setState({
        isAuthenticated: true,
        user: result.user,
        trader: result.trader,
      });
      return result;
    } catch (e: any) {
      setError(e.message || 'Registration failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await authApi.getProfile();
      if (profile) {
        setState({
          isAuthenticated: true,
          user: profile.user,
          trader: profile.trader,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setState({ isAuthenticated: false, user: null, trader: null });
      await setTraderToken(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{ ...state, hasBootstrapped, login, loginWithOtp, selectTrader, register, refreshProfile, logout, isLoading, error, clearError }}>
      {children}
    </AuthContext.Provider>
  );
};
