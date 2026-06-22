/**
 * securityGuard.ts
 *
 * Pure, stateless authorisation layer for user-modification operations.
 * No database calls — safe to invoke synchronously before any API handler.
 *
 * Rules (evaluated in strict priority order):
 *
 *  1. Owner lock  — target.email === OWNER_EMAIL → always false, no exceptions.
 *  2. Self-guard  — a user may never modify themselves.
 *  3. Super admin — can modify admin / operator / parent, but CANNOT modify
 *                   another super_admin (prevents privilege coup).
 *  4. Everyone else — may only modify users whose role rank is strictly lower.
 */

import type { TokenPayload } from "../lib/auth.js";
import { getOwnerEmail } from "../lib/owner-config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole =
  | "parent"
  | "operator"
  | "admin"
  | "super_admin"
  | "kiosk";

/** Shape expected by all guard functions. Satisfied by TokenPayload. */
export interface User extends TokenPayload {
  role: string; // kept as string to match TokenPayload; functions narrow via ROLE_RANK
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * The single protected owner account. Every destructive or privilege-changing
 * operation targeting this email is unconditionally rejected.
 * Resolved dynamically from the system_config DB table at runtime.
 */

/**
 * Numeric privilege rank. Used for "non-super_admin" lateral/upward move checks.
 * A requester with rank N may only act on targets with rank < N.
 */
const ROLE_RANK: Record<string, number> = {
  parent:      0,
  kiosk:       1,
  operator:    2,
  admin:       3,
  super_admin: 4,
};

const rank = (role: string): number => ROLE_RANK[role] ?? -1;

// ── Core guard ────────────────────────────────────────────────────────────────

/**
 * Internal helper that encodes the shared rules for both delete and role-update.
 * Returns `true` only if `requester` is permitted to act on `target`.
 *
 * @param ownerEmail - Dynamic owner email (defaults to compile-time constant).
 */
function isPermitted(requester: User, target: User, ownerEmail?: string): boolean {
  const resolved  = (ownerEmail ?? getOwnerEmail()).toLowerCase();
  const ownerLower = resolved;

  // Rule 1 — owner lock: the owner's account is never a valid target for others.
  if (ownerLower && target.email.toLowerCase() === ownerLower) return false;

  // Rule 2 — self-guard: no self-modification.
  if (requester.id === target.id) return false;

  // Rule O — owner privilege: the platform owner may act on any non-owner, non-self account.
  //           This intentionally overrides the peer-SA restriction below.
  if (ownerLower && requester.email.toLowerCase() === ownerLower) return true;

  // Rule 3 — peer-SA protection: a non-owner super_admin cannot touch another super_admin.
  if (requester.role === "super_admin") return target.role !== "super_admin";

  // Rule 4 — all other roles: requester must strictly outrank target.
  return rank(requester.role) > rank(target.role);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns `true` if `requester` is allowed to delete `target`.
 *
 * @example
 * if (!canDelete(req.user, targetUser)) {
 *   return res.status(403).json({ error: "Forbidden" });
 * }
 */
export function canDelete(requester: User, target: User, ownerEmail?: string): boolean {
  return isPermitted(requester, target, ownerEmail);
}

/**
 * Returns `true` if `requester` is allowed to change `target`'s role to `newRole`.
 *
 * Additional constraint: no one may promote a target TO super_admin via the API.
 *
 * @example
 * if (!canUpdateRole(req.user, targetUser, "admin")) {
 *   return res.status(403).json({ error: "Forbidden" });
 * }
 */
export function canUpdateRole(
  requester: User,
  target: User,
  newRole: UserRole,
  ownerEmail?: string,
): boolean {
  // Nobody can promote anyone to super_admin via the API
  if (newRole === "super_admin") return false;

  return isPermitted(requester, target, ownerEmail);
}
