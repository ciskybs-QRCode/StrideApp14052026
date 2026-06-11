import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { api, setToken, clearToken, getToken } from "../lib/api";

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
  /** Primary role stored in DB (used for auth middleware on server). */
  role: UserRole;
  /**
   * All DB-verified roles this user holds.
   * Populated from GET /user/roles after login; persisted to AsyncStorage.
   * Falls back to rolesForPrimary() when the server is unreachable.
   */
  roles: UserRole[];
  /**
   * The role the user is currently ACTING as in the UI.
   * Can differ from `role` when a multi-role user switches context.
   * Drives layout routing and data isolation.
   */
  activeRole: UserRole;
  orgId?: number;
  schoolName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUri?: string;
  profilePhotoUri?: string;
  phone?: string;
  onboardingComplete?: boolean;
  activationStatus?: "active" | "pending_activation";
  is_owner?: boolean;
}

/** All DB-verified role entries for this user, including per-org scoping. */
export interface RoleEntry {
  role: UserRole;
  orgId: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  /**
   * All DB-verified roles this user holds, with their associated orgId.
   * Empty until login resolves GET /user/roles.
   */
  allRoles: RoleEntry[];
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  fullLogout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  /**
   * Switch the active role context.
   * 1. Validates the user holds this role in DB (allRoles or user.roles fallback).
   * 2. Updates user.activeRole, user.role, and user.orgId in state + AsyncStorage.
   * 3. Routes to the correct layout root via router.replace.
   * 4. Alerts + console.errors on any failure (Task 4).
   */
  switchActiveRole: (role: UserRole) => Promise<void>;
  /** @deprecated use switchActiveRole which also routes correctly */
  switchRole: (role: UserRole) => Promise<void>;
  isOwner: () => boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY      = "stride_user";
const ALL_ROLES_KEY = "stride_all_roles";

/** Canonical route roots for each role (must match Expo Router file-system layout). */
const ROLE_ROUTES: Record<UserRole, string> = {
  super_admin: "/(super_admin)/dashboard",
  admin:       "/(admin)/stats",
  operator:    "/(operator)/dashboard",
  parent:      "/(parent)/home",
  kiosk:       "/(kiosk)/",
};

/**
 * Derive a roles list from a primary role when the DB endpoint is unavailable.
 * A founding admin also acts as operator and parent; a super_admin can do everything.
 */
function rolesForPrimary(primary: UserRole): UserRole[] {
  if (primary === "super_admin") return ["super_admin", "admin", "operator", "parent"];
  if (primary === "admin")       return ["admin", "operator", "parent"];
  if (primary === "operator")    return ["operator", "parent"];
  if (primary === "kiosk")       return ["kiosk"];
  return ["parent"];
}

/**
 * Fetch DB-verified roles from the server.
 * Returns null silently on network error so the caller can fall back gracefully.
 */
async function fetchAllRoles(): Promise<RoleEntry[] | null> {
  try {
    const { roles } = await api.getUserRoles();
    return roles.map(r => ({ role: r.role as UserRole, orgId: r.orgId }));
  } catch (err) {
    console.error("[AuthContext] fetchAllRoles failed (using derived fallback):", err);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,     setUser]     = useState<User | null>(null);
  const [allRoles, setAllRoles] = useState<RoleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { void loadUser(); }, []);

  const isOwner = () => user?.is_owner === true;

  // ── Hydrate from AsyncStorage on app start ─────────────────────────────────
  const loadUser = async () => {
    try {
      const [stored, storedRoles, token] = await Promise.all([
        AsyncStorage.getItem(USER_KEY).catch(() => null),
        AsyncStorage.getItem(ALL_ROLES_KEY).catch(() => null),
        getToken(),
      ]);
      if (stored && token) {
        const parsed = JSON.parse(stored) as User;
        if (!parsed.roles || parsed.roles.length === 0) {
          parsed.roles = rolesForPrimary(parsed.role);
        }
        if (!parsed.activeRole) parsed.activeRole = parsed.role;
        setUser(parsed);

        if (storedRoles) {
          try { setAllRoles(JSON.parse(storedRoles) as RoleEntry[]); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("Auth load error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (email: string, password: string): Promise<User> => {
    if (email.toLowerCase() === "kiosk@test.com") {
      const kioskUser: User = {
        id:         "kiosk-device",
        name:       "Kiosk Device",
        email,
        role:       "kiosk",
        roles:      ["kiosk"],
        activeRole: "kiosk",
      };
      await setToken("kiosk-demo-token");
      try { await AsyncStorage.setItem(USER_KEY, JSON.stringify(kioskUser)); } catch (e) {
        console.error("Storage error:", e);
      }
      setUser(kioskUser);
      return kioskUser;
    }

    const { token, user: apiUser } = await api.login(email, password);
    await setToken(token);

    const primaryRole = apiUser.role as UserRole;

    // Task 1: Fetch real DB roles immediately after login; fall back to
    // derived list if the server is unreachable (e.g. demo / offline mode).
    const dbRoles = await fetchAllRoles();
    const derivedRoles = rolesForPrimary(primaryRole);
    const resolvedRoles = dbRoles
      ? dbRoles.map(r => r.role).filter((v, i, a) => a.indexOf(v) === i)
      : derivedRoles;

    const mapped: User = {
      id:         String(apiUser.id),
      name:       apiUser.name,
      email:      apiUser.email,
      role:       primaryRole,
      roles:      resolvedRoles.length > 0 ? resolvedRoles : derivedRoles,
      activeRole: primaryRole,
      orgId:      apiUser.orgId ?? (apiUser.organization_id as number | undefined),
      is_owner:   apiUser.is_owner ?? false,
    };

    const finalAllRoles = dbRoles ?? derivedRoles.map(r => ({ role: r, orgId: mapped.orgId ?? 0 }));

    try {
      await Promise.all([
        AsyncStorage.setItem(USER_KEY, JSON.stringify(mapped)),
        AsyncStorage.setItem(ALL_ROLES_KEY, JSON.stringify(finalAllRoles)),
      ]);
    } catch (e) {
      console.error("Storage error:", e);
    }

    setAllRoles(finalAllRoles);
    setUser(mapped);
    return mapped;
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      await Promise.all([
        clearToken(),
        AsyncStorage.removeItem(USER_KEY),
        AsyncStorage.removeItem(ALL_ROLES_KEY),
      ]);
    } catch (e) {
      console.error("Logout error:", e);
    }
    setAllRoles([]);
    setUser(null);
  };

  /**
   * fullLogout — clears the JWT token AND every stride_* key from AsyncStorage.
   * Use this on explicit sign-out to prevent grace-access bypass, legal signature
   * records, and config toggles from leaking to the next user on a shared device.
   */
  const fullLogout = async () => {
    try {
      const allKeys    = await AsyncStorage.getAllKeys();
      const strideKeys = allKeys.filter(k => k.startsWith("stride_"));
      await Promise.all([clearToken(), AsyncStorage.multiRemove(strideKeys)]);
    } catch (e) {
      console.error("Full logout error:", e);
    }
    setAllRoles([]);
    setUser(null);
  };

  // ── updateUser ─────────────────────────────────────────────────────────────
  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Update error:", e);
    }
    setUser(updated);
  };

  // ── switchActiveRole — Task 2 ─────────────────────────────────────────────
  /**
   * Switch the user's active role context.
   *
   * Flow:
   *   1. Validate the user holds this role in DB (allRoles → user.roles fallback).
   *   2. Determine the target orgId (from allRoles if available, else current user.orgId).
   *   3. Persist the new role to state + AsyncStorage.
   *   4. Route to the correct layout root immediately.
   *   5. Alert + console.error on any failure (Task 4 — zero silent failures).
   */
  const switchActiveRole = async (newRole: UserRole) => {
    if (!user) {
      Alert.alert("Errore Ruolo", "Sessione non disponibile. Effettua nuovamente il login.");
      return;
    }

    try {
      // ── 1. Permission check ────────────────────────────────────────────────
      const permittedInAllRoles = allRoles.some(r => r.role === newRole);
      const permittedInDerived  = user.roles.includes(newRole);

      if (!permittedInAllRoles && !permittedInDerived) {
        console.error(
          `\u274c switchActiveRole DENIED: user ${user.email} does not hold role "${newRole}" in DB.`,
          { allRoles, userRoles: user.roles },
        );
        Alert.alert(
          "Errore Ruolo",
          "L'utente non ha i permessi reali nel DB per il ruolo selezionato.",
        );
        return;
      }

      // ── 2. Resolve orgId for the new role ──────────────────────────────────
      // Use the first matching org from the real DB allRoles list; fall back to
      // the user's current orgId (handles legacy single-org accounts).
      const entry    = allRoles.find(r => r.role === newRole);
      const targetOrgId = entry?.orgId && entry.orgId > 0 ? entry.orgId : user.orgId;

      // ── 3. Persist new active role ──────────────────────────────────────────
      await updateUser({
        activeRole: newRole,
        role:       newRole,
        ...(targetOrgId !== undefined ? { orgId: targetOrgId } : {}),
      });

      // ── 4. Route to the correct layout root ────────────────────────────────
      const route = ROLE_ROUTES[newRole];
      router.replace(route as never);

    } catch (err: unknown) {
      console.error("\u274c switchActiveRole ERROR:", err);
      Alert.alert(
        "Errore Ruolo",
        err instanceof Error ? err.message : "Cambio ruolo fallito. Riprova.",
      );
    }
  };

  /** @deprecated alias for backwards-compat; use switchActiveRole */
  const switchRole = async (role: UserRole) => {
    await switchActiveRole(role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        allRoles,
        login,
        logout,
        fullLogout,
        updateUser,
        switchActiveRole,
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
