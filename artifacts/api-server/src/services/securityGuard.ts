import type { Request, Response, NextFunction } from "express";
import type { TokenPayload } from "../lib/auth.js";

export type User = TokenPayload;

export type GuardedOperation = "delete" | "update_role";

/**
 * Role hierarchy used to determine downgrade protection.
 * Higher index = higher privilege.
 */
const ROLE_RANK: Record<string, number> = {
  parent:      0,
  kiosk:       1,
  operator:    2,
  admin:       3,
  super_admin: 4,
};

const rank = (role: string): number => ROLE_RANK[role] ?? -1;

/**
 * The protected owner email. Any destructive operation targeting
 * this account is unconditionally blocked, regardless of requester.
 */
const PROTECTED_EMAIL = "ciskybs@gmail.com";

/**
 * Determines whether `requester` is allowed to perform `operation`
 * on `target`.
 *
 * Rules (evaluated in order — first false wins):
 *
 * 1. If target.email === PROTECTED_EMAIL → always false for
 *    delete or update_role that would demote/remove.
 *
 * 2. A super_admin may modify any role EXCEPT another super_admin.
 *
 * 3. Non-super_admin requesters may only modify users whose role
 *    rank is strictly lower than their own (no lateral or upward moves).
 *
 * 4. A user may never modify themselves.
 */
export function canModifyUser(
  requester: User,
  target: User,
  operation: GuardedOperation,
): boolean {
  // Self-modification is never allowed
  if (requester.id === target.id) return false;

  // Hard-coded owner protection
  if (target.email === PROTECTED_EMAIL) return false;

  // super_admin can modify anyone except another super_admin
  if (requester.role === "super_admin") {
    return target.role !== "super_admin";
  }

  // All other roles: requester must outrank the target
  return rank(requester.role) > rank(target.role);
}

/**
 * Resolves the new role from the request body for update_role operations.
 * Returns undefined if the field is absent (e.g. for delete ops).
 */
export function resolveNewRole(req: Request): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  return typeof body?.role === "string" ? body.role : undefined;
}

// ---------------------------------------------------------------------------
// Express middleware factory
// ---------------------------------------------------------------------------

/**
 * `guardOperation(operation, getTarget)`
 *
 * Returns an Express middleware that:
 *   1. Reads `req.user` (set by requireAuth).
 *   2. Fetches the target user via `getTarget(req)` (async).
 *   3. Calls `canModifyUser` — responds 403 if denied, calls next() if allowed.
 *
 * Usage:
 *   router.delete(
 *     "/users/:id",
 *     requireAuth,
 *     guardOperation("delete", (req) => fetchUserById(req.params.id)),
 *     deleteUserHandler,
 *   );
 */
export function guardOperation(
  operation: GuardedOperation,
  getTarget: (req: Request) => Promise<User>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requester = (req as Request & { user?: User }).user;
    if (!requester) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let target: User;
    try {
      target = await getTarget(req);
    } catch {
      res.status(404).json({ error: "Target user not found" });
      return;
    }

    if (!canModifyUser(requester, target, operation)) {
      res.status(403).json({ error: "Forbidden: insufficient privileges for this operation" });
      return;
    }

    next();
  };
}
