"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface AuthContextValue {
  isLoggedIn: boolean;
  isAdmin: boolean;
  ready: boolean;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe() {
  return fetch("/api/users/me", { credentials: "include" });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      let response = await fetchMe();

      // A concurrent request may have just rotated the auth cookies.
      if (response.status === 401) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        response = await fetchMe();
      }

      if (!response.ok) {
        setIsLoggedIn(false);
        setIsAdmin(false);
        return false;
      }

      const data = (await response.json().catch(() => null)) as {
        role?: unknown;
      } | null;
      setIsLoggedIn(true);
      setIsAdmin(data?.role === "admin");
      return true;
    } catch {
      setIsLoggedIn(false);
      setIsAdmin(false);
      return false;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ isLoggedIn, isAdmin, ready, refresh }),
    [isLoggedIn, isAdmin, ready, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
