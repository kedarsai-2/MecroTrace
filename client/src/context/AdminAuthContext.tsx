import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/types/models';
import { adminAuthApi } from '@/services/api/adminAuth';
import { setAdminToken } from '@/services/api/tokenStore';

interface AdminAuthState {
  isAuthenticated: boolean;
  user: User | null;
}

interface AdminAuthContextType extends AdminAuthState {
  hasBootstrapped: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  isAuthenticated: false,
  user: null,
  hasBootstrapped: false,
  login: async () => {},
  logout: async () => {},
  isLoading: false,
  error: null,
  clearError: () => {},
});

export const useAdminAuth = () => useContext(AdminAuthContext);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AdminAuthState>({
    isAuthenticated: false,
    user: null,
  });
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        let profile = await adminAuthApi.getProfile();
        if (!cancelled && profile) {
          setState({
            isAuthenticated: true,
            user: profile.user,
          });
        }
      } catch {
        // ignore bootstrap errors; admin will be treated as logged out
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
      const result = await adminAuthApi.login(email, password);
      setState({
        isAuthenticated: true,
        user: result.user,
      });
    } catch (e: any) {
      setError(e.message || 'Login failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminAuthApi.logout();
    } finally {
      setState({ isAuthenticated: false, user: null });
      await setAdminToken(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AdminAuthContext.Provider
      value={{
        ...state,
        hasBootstrapped,
        login,
        logout,
        isLoading,
        error,
        clearError,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};
