import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type UserRole = "super_admin" | "admin" | "moderator" | "support" | "user";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  plan: string;
  avatarUrl?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("xdx_auth");
      if (stored) {
        const { user: u, token: t } = JSON.parse(stored);
        setUser(u);
        setToken(t);
      }
    } catch {
      localStorage.removeItem("xdx_auth");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (u: AuthUser, t: string) => {
    setUser(u);
    setToken(t);
    localStorage.setItem("xdx_auth", JSON.stringify({ user: u, token: t }));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("xdx_auth");
  };

  const isAdmin = !!user && ["super_admin", "admin", "moderator", "support"].includes(user.role);

  return (
    <AuthContext.Provider value={{ user, token, isAdmin, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
