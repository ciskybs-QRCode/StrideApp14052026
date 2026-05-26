import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, clearToken, getToken } from "../lib/api";

export type UserRole = "parent" | "operator" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  /** Currently active role — used for routing and UI decisions */
  role: UserRole;
  /** All roles granted to this account. Admins get all three, operators get operator+parent. */
  roles: UserRole[];
  orgId?: number;
  schoolName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUri?: string;
  profilePhotoUri?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  /** Switch the active role (must be in user.roles). Does NOT navigate — caller handles routing. */
  switchRole: (role: UserRole) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = "stride_user";

/** Derive multi-role list from a primary role returned by the API */
function rolesForPrimary(primary: UserRole): UserRole[] {
  if (primary === "admin")    return ["admin", "operator", "parent"];
  if (primary === "operator") return ["operator", "parent"];
  return ["parent"];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const [stored, token] = await Promise.all([
        AsyncStorage.getItem(USER_KEY).catch(() => null),
        getToken(),
      ]);
      if (stored && token) {
        const parsed = JSON.parse(stored) as User;
        // Migrate sessions stored before multi-role was introduced
        if (!parsed.roles || parsed.roles.length === 0) {
          parsed.roles = rolesForPrimary(parsed.role);
        }
        setUser(parsed);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<User> => {
    const { token, user: apiUser } = await api.login(email, password);
    await setToken(token);
    const primaryRole = apiUser.role as UserRole;
    const mapped: User = {
      id:    String(apiUser.id),
      name:  apiUser.name,
      email: apiUser.email,
      role:  primaryRole,
      roles: rolesForPrimary(primaryRole),
      orgId: apiUser.orgId ?? (apiUser.organization_id as number | undefined),
    };
    try { await AsyncStorage.setItem(USER_KEY, JSON.stringify(mapped)); } catch { /* localStorage blocked */ }
    setUser(mapped);
    return mapped;
  };

  const logout = async () => {
    try { await Promise.all([clearToken(), AsyncStorage.removeItem(USER_KEY)]); } catch { /* ignore */ }
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    try { await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated)); } catch { /* localStorage blocked */ }
    setUser(updated);
  };

  const switchRole = async (role: UserRole) => {
    if (!user) return;
    if (!user.roles.includes(role)) return;
    await updateUser({ role });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
