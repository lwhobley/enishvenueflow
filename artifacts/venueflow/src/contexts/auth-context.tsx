import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  venueId: string;
  isAdmin: boolean;
  roleId: string | null;
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
      return s ? JSON.parse(s) : null;
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
