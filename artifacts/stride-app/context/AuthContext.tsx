import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, clearToken, getToken } from "../lib/api";

// --- INSERISCI QUI LA TUA EMAIL ---
const OWNER_EMAIL = "ciskybs@gmail.com";

export type UserRole =
  | "parent"
  | "operator"
  | "admin"
  | "kiosk"
  | "super_admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  orgId?: number;
  schoolName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUri?: string;
  profilePhotoUri?: string;
  phone?: string;
  onboardingComplete?: boolean;
  activationStatus?: "active" | "pending_activation";
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
  isOwner: () => boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = "stride_user";

/** Derive multi-role list from a primary role returned by the API */
function rolesForPrimary(primary: UserRole): UserRole[] {
  // Super admin inherits all possible capabilities
  if (primary === "super_admin")
    return ["super_admin", "admin", "operator", "parent"];
  if (primary === "admin") return ["admin", "operator", "parent"];
  if (primary === "operator") return ["operator", "parent"];
  if (primary === "kiosk") return ["kiosk"];
  return ["parent"];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const isOwner = () =>
    user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

  const loadUser = async () => {
    try {
      const [stored, token] = await Promise.all([
        AsyncStorage.getItem(USER_KEY).catch(() => null),
        getToken(),
      ]);
      if (stored && token) {
        const parsed = JSON.parse(stored) as User;
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
    if (email.toLowerCase() === "kiosk@test.com") {
      const kioskUser: User = {
        id: "kiosk-device",
        name: "Kiosk Device",
        email,
        role: "kiosk",
        roles: ["kiosk"],
      };
      await setToken("kiosk-demo-token");
      try {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(kioskUser));
      } catch {}
      setUser(kioskUser);
      return kioskUser;
    }

    const { token, user: apiUser } = await api.login(email, password);
    await setToken(token);
    const primaryRole = apiUser.role as UserRole;
    const mapped: User = {
      id: String(apiUser.id),
      name: apiUser.name,
      email: apiUser.email,
      role: primaryRole,
      roles: rolesForPrimary(primaryRole),
      orgId: apiUser.orgId ?? (apiUser.organization_id as number | undefined),
    };
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(mapped));
    } catch {}
    setUser(mapped);
    return mapped;
  };

  const logout = async () => {
    try {
      await Promise.all([clearToken(), AsyncStorage.removeItem(USER_KEY)]);
    } catch {}
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    } catch {}
    setUser(updated);
  };

  const switchRole = async (role: UserRole) => {
    if (!user) return;
    if (!user.roles.includes(role)) return;
    await updateUser({ role });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        updateUser,
        switchRole,
        isOwner,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
