import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  authApi,
  setAuthToken,
  registerAuthCallbacks,
  clearCaches,
  type AuthUser,
} from '../services/api';
import type { CurrencyCode } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const GUEST_CURRENCY_KEY = 'preferredCurrency';

// ── Context shape ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  preferredCurrency: CurrencyCode;
  register: (email: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateCurrency: (currency: CurrencyCode) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>(
    () => (localStorage.getItem(GUEST_CURRENCY_KEY) as CurrencyCode | null) ?? 'USD',
  );

  useEffect(() => {
    registerAuthCallbacks(
      (newToken) => {
        setToken(newToken);
        setAuthToken(newToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setAuthToken(null);
        clearCaches();
      },
    );
  }, []);

  // On mount: restore session from refresh token cookie
  useEffect(() => {
    const restore = async () => {
      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (refreshRes.ok) {
          const { token: restored } = (await refreshRes.json()) as { token: string };
          setAuthToken(restored);
          setToken(restored);

          const meRes = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${restored}` },
            credentials: 'include',
          });

          if (meRes.ok) {
            const { user: me } = (await meRes.json()) as { user: AuthUser };
            setUser(me);
            setPreferredCurrency((me.preferred_currency as CurrencyCode) ?? 'USD');
          }
        }
      } catch {
        // No valid session — stay as guest
      } finally {
        setIsLoading(false);
      }
    };

    restore();
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password);
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const { token: newToken, user: me } = await authApi.verifyEmail(email, code);
    setAuthToken(newToken);
    setToken(newToken);
    setUser(me);
    setPreferredCurrency((me.preferred_currency as CurrencyCode) ?? 'USD');
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token: newToken, user: me } = await authApi.login(email, password);
    setAuthToken(newToken);
    setToken(newToken);
    setUser(me);
    setPreferredCurrency((me.preferred_currency as CurrencyCode) ?? 'USD');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setToken(null);
    setAuthToken(null);
    clearCaches();
    // Revert to whatever the guest preference was
    setPreferredCurrency(
      (localStorage.getItem(GUEST_CURRENCY_KEY) as CurrencyCode | null) ?? 'USD',
    );
  }, []);

  const updateCurrency = useCallback(
    async (currency: CurrencyCode) => {
      setPreferredCurrency(currency); // optimistic
      if (user) {
        await authApi.updateSettings(currency);
        setUser((prev) => prev ? { ...prev, preferred_currency: currency } : prev);
      } else {
        localStorage.setItem(GUEST_CURRENCY_KEY, currency);
      }
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoggedIn: !!user,
        isLoading,
        preferredCurrency,
        register,
        verifyEmail,
        login,
        logout,
        updateCurrency,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
