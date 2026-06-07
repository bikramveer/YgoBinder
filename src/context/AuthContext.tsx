import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  authApi,
  setAuthToken,
  registerAuthCallbacks,
  clearCaches,
  type AuthUser,
} from '../services/api';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// ── Context shape ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoggedIn: boolean;
  isLoading: boolean; // true while checking for an existing session on first mount
  register: (email: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Give api.ts a way to update React state when a token is silently refreshed
  // or when a refresh fails and the session is gone.
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

  // On mount: try to restore a session using the refresh token cookie.
  // The cookie persists across browser sessions so the user stays logged in.
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
          }
        }
      } catch {
        // No valid session — stay as guest, no error needed
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
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token: newToken, user: me } = await authApi.login(email, password);
    setAuthToken(newToken);
    setToken(newToken);
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setToken(null);
    setAuthToken(null);
    clearCaches();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoggedIn: !!user, isLoading, register, verifyEmail, login, logout }}
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
