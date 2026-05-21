import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, clearToken, getToken } from "../lib/api";

export type UserRole = "parent" | "operator" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = "stride_user";

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
        setUser(JSON.parse(stored) as User);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const { token, user: apiUser } = await api.login(email, password);
    await setToken(token);
    const mapped: User = {
      id: String(apiUser.id),
      name: apiUser.name,
      email: apiUser.email,
      role: apiUser.role as UserRole,
      orgId: apiUser.orgId ?? (apiUser.organization_id as number | undefined),
    };
    try { await AsyncStorage.setItem(USER_KEY, JSON.stringify(mapped)); } catch { /* localStorage blocked */ }
    setUser(mapped);
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

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
