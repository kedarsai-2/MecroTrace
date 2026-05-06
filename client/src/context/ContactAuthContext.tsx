import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  contactPortalAuthApi,
  type ContactPortalProfile,
  type ContactPortalSession,
} from '@/services/api/contactPortalAuth';
import { setContactToken } from '@/services/api/tokenStore';

interface ContactAuthState {
  isAuthenticated: boolean;
  contact: ContactPortalProfile | null;
  isGuest: boolean;
}

interface ContactAuthContextType extends ContactAuthState {
  hasBootstrapped: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (data: {
    phone: string;
    password: string;
    email?: string;
    name?: string;
    mark: string;
  }) => Promise<void>;
  loginWithProfile: (profile: ContactPortalProfile) => void;
  /** Mark the current session as guest with a synthetic profile. */
  loginAsGuest: (phone: string) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

const ContactAuthContext = createContext<ContactAuthContextType>({
  isAuthenticated: false,
  contact: null,
  isGuest: false,
  hasBootstrapped: false,
  login: async () => {},
  signup: async () => {},
  loginWithProfile: () => {},
  loginAsGuest: () => {},
  logout: async () => {},
  isLoading: false,
  error: null,
  clearError: () => {},
});

export const useContactAuth = () => useContext(ContactAuthContext);

export const ContactAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ContactAuthState>({
    isAuthenticated: false,
    contact: null,
    isGuest: false,
  });
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Only bootstrap when user is in the contact portal URLs. Do not match trader /contacts.
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const isContactPortalPath = pathname === '/contact' || pathname.startsWith('/contact/');
      if (!isContactPortalPath) {
        setHasBootstrapped(true);
        return () => {
          cancelled = true;
        };
      }
    }

    const bootstrap = async () => {
      try {
        let session: ContactPortalSession | null = await contactPortalAuthApi.getSession();
        if (!cancelled && !session) {
          const refreshed = await contactPortalAuthApi.refreshSession();
          if (refreshed && !cancelled) {
            session = await contactPortalAuthApi.getSession();
          }
        }
        if (!cancelled && session && session.profile) {
          setState({
            isAuthenticated: true,
            contact: session.profile,
            isGuest: !!session.guest,
          });
        }
      } catch {
        // treat as logged out
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

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = await contactPortalAuthApi.login(identifier, password);
      setState({
        isAuthenticated: true,
        contact: profile,
        isGuest: !!profile.is_guest,
      });
    } catch (e: any) {
      setError(e?.message || 'Login failed. Please try again.');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(
    async (data: { phone: string; password: string; email?: string; name?: string; mark: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const profile = await contactPortalAuthApi.signup(data);
        setState({
          isAuthenticated: true,
          contact: profile,
          isGuest: !!profile.is_guest,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Signup failed. Please try again.';
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await contactPortalAuthApi.logout();
    } finally {
      setState({ isAuthenticated: false, contact: null, isGuest: false });
      await setContactToken(null);
    }
  }, []);

  const loginWithProfile = useCallback((profile: ContactPortalProfile) => {
    setState({
      isAuthenticated: true,
      contact: profile,
      isGuest: !!profile.is_guest,
    });
  }, []);

  const loginAsGuest = useCallback((phone: string) => {
    const guestProfile: ContactPortalProfile = {
      contact_id: '',
      name: phone,
      phone,
      email: undefined,
      can_login: false,
      is_guest: true,
    };
    setState({
      isAuthenticated: true,
      contact: guestProfile,
      isGuest: true,
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <ContactAuthContext.Provider
      value={{
        ...state,
        hasBootstrapped,
        login,
        signup,
        loginWithProfile,
        loginAsGuest,
        logout,
        isLoading,
        error,
        clearError,
      }}
    >
      {children}
    </ContactAuthContext.Provider>
  );
};
