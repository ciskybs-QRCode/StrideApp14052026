import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { getOwnerEmail } from "./owner-config.js";
import { supabase } from "./supabase.js";
import { logger } from "./logger.js";

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  orgId: number;
  globalUserId?: number;
}

const secret = () => process.env["SESSION_SECRET"] || "stride-fallback-secret";

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, secret()) as TokenPayload;
}

/**
 * In-memory blocked-status cache.
 * Avoids a DB round-trip on every authenticated request while still revoking
 * suspended accounts within BLOCKED_CACHE_TTL_MS (30 seconds).
 */
const blockedCache = new Map<string, { blocked: boolean; ts: number }>();
const BLOCKED_CACHE_TTL_MS = 30_000;

async function isUserBlocked(userId: string): Promise<boolean> {
  const cached = blockedCache.get(userId);
  if (cached && Date.now() - cached.ts < BLOCKED_CACHE_TTL_MS) return cached.blocked;
  const { data } = await supabase
    .from("users")
    .select("blocked")
    .eq("id", parseInt(userId, 10))
    .maybeSingle();
  const blocked = (data as { blocked?: boolean } | null)?.blocked === true;
  blockedCache.set(userId, { blocked, ts: Date.now() });
  return blocked;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = verifyToken(header.slice(7));
    if (await isUserBlocked(payload.id)) {
      res.status(401).json({ error: "Account suspended" });
      return;
    }
    (req as Request & { user: TokenPayload }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: TokenPayload }).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/**
 * requireOwnerOrSuperAdmin
 *
 * Allows access if EITHER:
 *   - user.role === "super_admin"  (normal super_admin account)
 *   - user.email === OWNER_EMAIL   (platform owner, read dynamically from system_config)
 *
 * OWNER_EMAIL is stored in the system_config table and cached in memory.
 * It can be updated at runtime via the /super-admin/owner-email route.
 */
export function requireOwnerOrSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = (req as Request & { user?: TokenPayload }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const isSuperAdmin = user.role === "super_admin";
  const isOwner      = user.email?.toLowerCase() === getOwnerEmail().toLowerCase();

  logger.debug(
    { email: user.email, role: user.role, isSuperAdmin, isOwner },
    "requireOwnerOrSuperAdmin check",
  );

  if (!isSuperAdmin && !isOwner) {
    logger.warn({ email: user.email, role: user.role }, "requireOwnerOrSuperAdmin DENIED");
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
