import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  orgId: number;
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
