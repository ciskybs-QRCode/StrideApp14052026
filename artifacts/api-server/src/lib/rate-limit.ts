import { rateLimit } from "express-rate-limit";
import type { Request } from "express";
import type { TokenPayload } from "./auth.js";

type AuthReq = Request & { user?: TokenPayload };

/**
 * Standard rate-limiter for identity routes.
 * Key: authenticated user id + org id — so each user gets their own bucket.
 * Falls back to IP if the request somehow reaches this before auth.
 */
export const identityLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = (req as AuthReq).user;
    return user ? `uid:${user.id}:org:${user.orgId}` : (req.ip ?? "unknown");
  },
  message: { error: "Too many requests. Please wait a moment and try again." },
});

/**
 * Stricter limiter for the import endpoint (file uploads are heavy).
 * Max 10 uploads per user per minute.
 */
export const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = (req as AuthReq).user;
    return user ? `import:${user.id}:org:${user.orgId}` : (req.ip ?? "unknown");
  },
  message: { error: "Too many import requests. Please wait a minute before uploading again." },
});
