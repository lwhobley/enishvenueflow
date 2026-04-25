import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  venueId: string;
  isAdmin: boolean;
  roleId: string | null;
  /**
   * Bearer session token issued by /auth/pin. Sent as
   * `Authorization: Bearer <token>` on every API call. The server
   * stores only the SHA-256 hash so a leaked DB dump can't be replayed.
   */
  sessionToken?: string;
  sessionExpiresAt?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "enosh-auth-user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) return null;
      const parsed = JSON.parse(s) as AuthUser & { sessionExpiresAt?: string };
      // Treat a saved user without a session token as logged-out — the
      // server requires bearer auth on every /api/* call now, so any
      // pre-token cached profile would just produce a wall of 401s.
      if (!parsed.sessionToken) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      // Drop expired sessions on load.
      if (parsed.sessionExpiresAt && new Date(parsed.sessionExpiresAt).getTime() < Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const { subscribe } = usePushNotifications();

  // Subscribe to push when a user is already logged in on mount
  useEffect(() => {
    if (user) {
      const t = setTimeout(() => subscribe(user.id, user.venueId), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const login = (u: AuthUser) => {
    setUser(u);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    // Request push permission after login (delay allows SW to settle)
    setTimeout(() => subscribe(u.id, u.venueId), 2500);
  };

  const logout = () => {
    // Invalidate the session server-side. Best-effort — even if the
    // request fails we always clear local state so the user is logged
    // out of this device.
    const token = user?.sessionToken;
    if (token) {
      void fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => { /* noop */ });
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
