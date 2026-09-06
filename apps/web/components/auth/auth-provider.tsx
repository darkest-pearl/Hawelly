"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { apiFetch, type SessionUser } from "../../lib/api-client";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<SessionUser>;
  register(fullName: string, email: string, password: string): Promise<SessionUser>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/status", { cache: "no-store" })
      .then(async (response) => {
        const status = (await response.json().catch(() => null)) as
          | { hasSession?: boolean }
          | null;
        if (!response.ok || !status?.hasSession) return null;
        return apiFetch<SessionUser>("/me");
      })
      .then((current) => {
        if (active) setUser(current);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const payload = (await response.json().catch(() => null)) as
      | { user?: SessionUser; error?: { message?: string } }
      | null;
    if (!response.ok || !payload?.user) {
      throw new Error(payload?.error?.message || "Sign in failed");
    }
    const current = await apiFetch<SessionUser>("/me");
    setUser(current);
    return current;
  }, []);

  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password })
      });
      const payload = (await response.json().catch(() => null)) as
        | { user?: SessionUser; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.user) {
        throw new Error(payload?.error?.message || "Account creation failed");
      }
      const current = await apiFetch<SessionUser>("/me");
      setUser(current);
      return current;
    },
    []
  );

  const logout = useCallback(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
