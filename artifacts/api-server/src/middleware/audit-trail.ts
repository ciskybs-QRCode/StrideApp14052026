import type { Request, Response, NextFunction } from "express";
import { logAction } from "../lib/audit.js";
import type { TokenPayload } from "../lib/auth.js";

/**
 * Audit trail middleware — automatically logs all mutating requests.
 * Covers POST, PUT, PATCH, DELETE on /api/* routes.
 * Never blocks the request; failures are silently swallowed.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Path patterns that should be audited (admin/operator critical actions)
const AUDIT_PATTERNS = [
  // Users
  /^\/api\/users/,
  // Courses
  /^\/api\/courses/,
  // Children / Members
  /^\/api\/children/,
  /^\/api\/members/,
  /^\/api\/dependents/,
  // Settings
  /^\/api\/admin-settings/,
  /^\/api\/registration-config/,
  // Communications
  /^\/api\/messages/,
  // Finance
  /^\/api\/checkout/,
  /^\/api\/billing/,
  /^\/api\/reimbursements/,
  /^\/api\/payroll/,
  /^\/api\/expenses/,
  // Organization
  /^\/api\/organizations/,
  /^\/api\/org/,
  // Events
  /^\/api\/events/,
  // Marketplace
  /^\/api\/marketplace/,
  // Blacklist
  /^\/api\/blacklist/,
  // Rescue / Emergency
  /^\/api\/rescue/,
  /^\/api\/emergency/,
  // Documents
  /^\/api\/documents/,
  // Private lessons
  /^\/api\/private-lessons/,
  /^\/api\/private-bookings/,
  // Scheduled courses
  /^\/api\/scheduled-courses/,
  // Attendance
  /^\/api\/attendance/,
  // Certifications
  /^\/api\/certs/,
  // Employment
  /^\/api\/employment/,
  // Super admin
  /^\/api\/super-admin/,
  /^\/api\/system-config/,
  // Waitlist
  /^\/api\/waitlist/,
  // Absences
  /^\/api\/absences/,
  // Promo codes
  /^\/api\/promo-codes/,
  // Locations
  /^\/api\/locations/,
  // Disciplines
  /^\/api\/disciplines/,
  // Import
  /^\/api\/import/,
  // Kiosk
  /^\/api\/kiosk/,
  // QR / Scan
  /^\/api\/scan/,
  /^\/api\/verify-qr/,
  // Proximity
  /^\/api\/proximity/,
  // Availability
  /^\/api\/availability/,
];

// Skip health checks, static assets, and non-sensitive paths
const SKIP_PATTERNS = [
  /^\/api\/healthz/,
  /^\/api\/live-pulse/,
  /^\/api\/admin-settings\/public-branding/,
  /^\/api\/membership-plans/,
  /^\/api\/registration-config/,
  /^\/api\/legal\/view/,
  /^\/api\/legal\/download/,
  /^\/api\/events\/public/,
  /^\/api\/events\/my-tickets/,
  /^\/api\/checkout\/batch-status/,
  /^\/api\/checkout\/receipt/,
];

export function auditTrailMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const path = req.originalUrl ?? req.url ?? "";

  // Skip if matches any skip pattern
  if (SKIP_PATTERNS.some(p => p.test(path))) {
    next();
    return;
  }

  // Only audit if matches an audit pattern
  if (!AUDIT_PATTERNS.some(p => p.test(path))) {
    next();
    return;
  }

  // Get user info from request (set by requireAuth)
  const user = (req as Request & { user?: TokenPayload }).user;
  const userId = user?.id ?? null;
  const orgId = user?.orgId ?? null;

  // Extract action name from path
  const segments = path.replace("/api/", "").split("/");
  const resource = segments[0] ?? "unknown";
  const action = `${req.method}_${resource.toUpperCase()}`;

  // Body snapshot (sanitized — no passwords, tokens, etc.)
  const body = req.body as Record<string, unknown> | undefined;
  const sanitized: Record<string, unknown> = {};
  if (body && typeof body === "object") {
    for (const key of Object.keys(body)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("key") ||
        lower.includes("credit_card") ||
        lower.includes("card_number") ||
        lower.includes("cvv")
      ) {
        sanitized[key] = "[REDACTED]";
      } else {
        const val = body[key];
        sanitized[key] = typeof val === "string" && val.length > 200 ? val.substring(0, 200) + "..." : val;
      }
    }
  }

  // Record ID from URL if present
  const recordId = segments[1] && /^\d+$/.test(segments[1]) ? parseInt(segments[1]) : null;

  // Log after response finishes
  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: any, encoding?: any, cb?: any) {
    res.end = originalEnd;
    const result = res.end(chunk, encoding, cb);

    // Only log if the request succeeded (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      logAction({
        userId,
        action,
        tableAffected: resource,
        recordId: recordId ?? undefined,
        details: {
          method: req.method,
          path,
          orgId,
          body: Object.keys(sanitized).length > 0 ? sanitized : undefined,
        },
      });
    }
    return result;
  } as any;

  next();
}
