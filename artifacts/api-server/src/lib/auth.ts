import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { getOwnerEmail } from "./owner-config.js";

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  orgId: number;
  globalUserId?: number;
}

const secret = () => process.env["SESSION_SECRET"] || "stride-fallback-secret";

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, secret()) as TokenPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = verifyToken(header.slice(7));
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

  // Debug log — shows exactly what the server sees for every super-admin request
  console.log(
    "[requireOwnerOrSuperAdmin]",
    "email:", user.email,
    "| role:", user.role,
    "| ownerEmail:", getOwnerEmail(),
    "| isSuperAdmin:", isSuperAdmin,
    "| isOwner:", isOwner,
    "| allowed:", isSuperAdmin || isOwner,
  );

  if (!isSuperAdmin && !isOwner) {
    console.warn(
      "[requireOwnerOrSuperAdmin] DENIED —",
      "email:", user.email,
      "role:", user.role,
    );
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
