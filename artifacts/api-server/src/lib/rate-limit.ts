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
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
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
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const user = (req as AuthReq).user;
    return user ? `import:${user.id}:org:${user.orgId}` : (req.ip ?? "unknown");
  },
  message: { error: "Too many import requests. Please wait a minute before uploading again." },
});

/**
 * Global API limiter — applied to every /api route.
 * Keys by authenticated user+org when possible so multiple browser sessions
 * from the same IP (e.g. dev previews) each get their own bucket.
 * Falls back to IP for unauthenticated requests.
 * 2 000 requests per 15-minute window — generous enough for dev/demo with
 * multiple concurrent iframes while still blocking actual volumetric abuse.
 */
export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const user = (req as AuthReq).user;
    return user ? `global:uid:${user.id}:org:${user.orgId}` : `global:ip:${req.ip ?? "unknown"}`;
  },
  skip: (req) => req.path === "/api/healthz" || (req as AuthReq).user?.role === "super_admin",
  message: { error: "Too many requests from this IP. Please try again later." },
});

/**
 * QR scan / check-in limiter — applied to high-value scan endpoints.
 * 30 scans per minute per IP — prevents brute-force QR enumeration.
 */
export const qrScanLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const user = (req as AuthReq).user;
    return user ? `qr:${user.id}:${user.orgId}` : `qr-ip:${req.ip ?? "unknown"}`;
  },
  message: { error: "Too many scan requests. Please slow down." },
});

/**
 * Auth limiter — applied to login and register endpoints.
 * 10 attempts per 15-minute window per IP — prevents credential stuffing.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => `auth:${req.ip ?? "unknown"}`,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." },
});

/**
 * AI endpoint limiter — applied to all OpenAI/GPT-backed routes.
 * 10 calls per minute per user prevents runaway AI cost and quota exhaustion.
 * super_admin is always exempt.
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  skip: (req) => (req as AuthReq).user?.role === "super_admin",
  keyGenerator: (req) => {
    const user = (req as AuthReq).user;
    return user ? `ai:${user.id}` : `ai:ip:${req.ip ?? "unknown"}`;
  },
  message: { error: "AI request limit reached. Please wait a moment and try again." },
});
