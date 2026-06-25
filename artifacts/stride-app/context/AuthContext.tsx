import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api, setToken, clearToken, getToken, apiSwitchOrgContext } from "../lib/api";

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
  /**
   * Re-fetch GET /user/roles from the server and update allRoles + user.roles
   * in state and AsyncStorage.  Call this after self-provisioning a new role
   * so the switcher reflects the change immediately without forcing a logout.
   */
  refreshAllRoles: () => Promise<void>;
  /**
   * Switch both the org and the role context in one step.
   * Calls POST /auth/switch-context, stores the new JWT, updates state, and routes.
   * Use when a multi-org user wants to act as their role in a different org.
   */
  switchOrgContext: (orgId: number, role: string) => Promise<void>;
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

        // Background refresh — don't block UI startup, but sync fresh roles from
        // the server so allRoles is never permanently stale across deploys.
        fetchAllRoles().then(freshRoles => {
          if (!freshRoles) return;
          setAllRoles(freshRoles);
          const uniqueRoleNames = freshRoles
            .map(r => r.role)
            .filter((v, i, a) => a.indexOf(v) === i);
          setUser(prev => prev ? { ...prev, roles: uniqueRoleNames } : prev);
          AsyncStorage.setItem(ALL_ROLES_KEY, JSON.stringify(freshRoles)).catch(() => {});
        }).catch(() => { /* network errors are non-fatal on startup */ });
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
      id:             String(apiUser.id),
      name:           apiUser.name,
      email:          apiUser.email,
      role:           primaryRole,
      roles:          resolvedRoles.length > 0 ? resolvedRoles : derivedRoles,
      activeRole:     primaryRole,
      orgId:          apiUser.orgId ?? (apiUser.organization_id as number | undefined),
      is_owner:       apiUser.is_owner ?? false,
      profilePhotoUri: ((apiUser as unknown) as Record<string, unknown>).profilePhotoUri as string | undefined ?? undefined,
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

    // Fire-and-forget: register this device's Expo push token so the server
    // can send push notifications to this user (messages, emergencies, etc.)
    void (async () => {
      try {
        if (Platform.OS === "web") return;
        // expo-notifications v55 types don't always expose .granted/.canAskAgain
        // directly — cast like EmergencyService does to stay compatible.
        const existing = await Notifications.getPermissionsAsync() as unknown as { granted?: boolean; canAskAgain?: boolean };
        let granted = existing.granted ?? false;
        if (!granted && existing.canAskAgain !== false) {
          const result = await Notifications.requestPermissionsAsync() as unknown as { granted?: boolean };
          granted = result.granted ?? false;
        }
        if (!granted) return;
        // In production (EAS Build), projectId is required.
        // In Expo Go dev mode it works without — gracefully fall back.
        const expoExtra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
        const projectId = expoExtra?.eas?.projectId;
        const { data: pushToken } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (!pushToken) return;
        const t = await getToken();
        if (!t) return;
        await fetch("/api/notifications/register-token", {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body:    JSON.stringify({ token: pushToken, platform: Platform.OS }),
        });
      } catch {
        // non-blocking — push is best-effort at login
      }
    })();

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

    // Persist profile fields to backend so they sync across devices on login.
    const backendPayload: { profilePhotoUri?: string | null; name?: string } = {};
    if ("profilePhotoUri" in updates) backendPayload.profilePhotoUri = updates.profilePhotoUri ?? null;
    if ("name" in updates && updates.name) backendPayload.name = updates.name;
    if (Object.keys(backendPayload).length > 0) {
      api.updateMyProfile(backendPayload).catch(() => {
        // Fire-and-forget — local state is already updated; backend sync best-effort.
      });
    }
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
      Alert.alert("Role Switch Failed", "No active session. Please log in again.");
      return;
    }

    try {
      // ── 1. Permission check ────────────────────────────────────────────────
      // super_admin holds all 4 roles by design and bypasses the DB check.
      // Check allRoles too — user.role changes when super_admin switches to another role.
      const isSuperAdmin      = user.role === 'super_admin' || allRoles.some(r => r.role === 'super_admin');
      const permittedInAllRoles = allRoles.some(r => r.role === newRole);
      const permittedInDerived  = user.roles.includes(newRole);

      // super_admin without an org cannot switch to admin/operator/parent
      if (isSuperAdmin && (user.orgId === 0 || !user.orgId) && newRole !== 'super_admin') {
        Alert.alert(
          "Role Switch Denied",
          "You are managing the Stride platform. Create an association first to use other roles.",
        );
        return;
      }

      if (!isSuperAdmin && !permittedInAllRoles && !permittedInDerived) {
        console.error(
          `\u274c switchActiveRole DENIED: user ${user.email} does not hold role "${newRole}" in DB.`,
          { allRoles, userRoles: user.roles },
        );
        Alert.alert(
          "Role Switch Denied",
          "This account does not hold the selected role in the database.",
        );
        return;
      }

      // ── 2. Resolve orgId for the new role ──────────────────────────────────
      // Use the first matching org from the real DB allRoles list; fall back to
      // the user's current orgId (handles legacy single-org and bypass accounts).
      const entry       = allRoles.find(r => r.role === newRole);
      const targetOrgId = (entry?.orgId && entry.orgId > 0) ? entry.orgId : user.orgId;

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
        "Role Switch Failed",
        err instanceof Error ? err.message : "Could not switch role. Please try again.",
      );
    }
  };

  /** @deprecated alias for backwards-compat; use switchActiveRole */
  const switchRole = async (role: UserRole) => {
    await switchActiveRole(role);
  };

  // ── switchOrgContext ────────────────────────────────────────────────────────
  /**
   * Switch both org and role context without re-login.
   * 1. Calls POST /auth/switch-context to get a new JWT for targetOrgId + targetRole.
   * 2. Stores the new token (replaces old JWT).
   * 3. Updates user state with new orgId + role.
   * 4. Routes to the correct layout root.
   */
  const switchOrgContext = async (targetOrgId: number, targetRole: string) => {
    if (!user) {
      Alert.alert("Switch Failed", "No active session. Please log in again.");
      return;
    }
    // super_admin without org cannot switch to non-super roles
    if (user.role === "super_admin" && (user.orgId === 0 || !user.orgId) && targetRole !== "super_admin") {
      Alert.alert("Switch Denied", "Create an association first to switch to other roles.");
      return;
    }
    try {
      const { token, orgId, role } = await apiSwitchOrgContext(targetOrgId, targetRole);
      setToken(token);
      await updateUser({
        orgId,
        activeRole: role as UserRole,
        role:       role as UserRole,
      });
      const route = ROLE_ROUTES[role as UserRole] ?? "/(parent)/home";
      router.replace(route as never);
    } catch (err: unknown) {
      console.error("❌ switchOrgContext ERROR:", err);
      Alert.alert(
        "Switch Failed",
        err instanceof Error ? err.message : "Could not switch context. Please try again.",
      );
    }
  };

  // ── refreshAllRoles ────────────────────────────────────────────────────────
  /**
   * Re-fetches GET /user/roles and syncs allRoles + user.roles in state and
   * AsyncStorage.  Called after self-provisioning so the role switcher shows
   * the new role immediately, without forcing a logout/login cycle.
   */
  const refreshAllRoles = async () => {
    if (!user) return;
    const freshRoles = await fetchAllRoles();
    if (!freshRoles) return;

    const roleList = freshRoles
      .map(r => r.role)
      .filter((v, i, a) => a.indexOf(v) === i) as UserRole[];

    setAllRoles(freshRoles);

    const updatedUser: User = { ...user, roles: roleList.length > 0 ? roleList : user.roles };
    try {
      await Promise.all([
        AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser)),
        AsyncStorage.setItem(ALL_ROLES_KEY, JSON.stringify(freshRoles)),
      ]);
    } catch (e) {
      console.error("refreshAllRoles storage error:", e);
    }
    setUser(updatedUser);
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
        refreshAllRoles,
        switchOrgContext,
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
