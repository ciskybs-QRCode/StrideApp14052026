import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export type UserRole = "parent" | "operator" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  schoolName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUri?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const MOCK_USERS: User[] = [
  { id: "1", name: "Marco Rossi", email: "genitore@test.com", role: "parent" },
  { id: "2", name: "Sara Bianchi", email: "operatore@test.com", role: "operator" },
  { id: "3", name: "Admin Dance Village", email: "admin@test.com", role: "admin", schoolName: "Dance Village", primaryColor: "#1E3A8A", secondaryColor: "#FBBF24" },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const stored = await AsyncStorage.getItem("stride_user");
      if (stored) setUser(JSON.parse(stored));
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const found = MOCK_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!found) throw new Error("Credenziali non valide");
    await AsyncStorage.setItem("stride_user", JSON.stringify(found));
    setUser(found);
  };

  const logout = async () => {
    await AsyncStorage.removeItem("stride_user");
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    await AsyncStorage.setItem("stride_user", JSON.stringify(updated));
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
