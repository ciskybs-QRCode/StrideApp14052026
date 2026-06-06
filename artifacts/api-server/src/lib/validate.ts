import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { logAction } from "./audit.js";

/**
 * Zod validation middleware factory.
 * On failure: returns HTTP 400 with field-level errors (safe to expose).
 * On success: attaches `req.validBody` with the typed, coerced payload.
 *
 * Usage:
 *   router.post("/foo", requireAuth, validate(MySchema), async (req, res) => {
 *     const body = validBody<MyType>(req);
 *   });
 */
export function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Invalid request",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    (req as Request & { validBody: T }).validBody = result.data;
    next();
  };
}

/** Retrieve the validated body attached by the `validate()` middleware. */
export function validBody<T>(req: Request): T {
  return (req as Request & { validBody: T }).validBody;
}

/**
 * Generic 500 error handler.
 * Logs the real error to the audit log (never exposed to the client).
 * Returns a safe, generic message to the caller.
 */
export function internalError(
  res: Response,
  err: unknown,
  context: string,
  userId?: string | number | null,
): void {
  // Supabase errors are plain objects with a `message` property, not Error instances
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);

  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;

  logAction({
    userId,
    action: "INTERNAL_ERROR",
    tableAffected: context,
    details: {
      context,
      message,
      ...(code ? { code } : {}),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5).join(" | ") : undefined,
    },
  });
  res.status(500).json({ error: "An internal error occurred. Please try again." });
}

// ── Re-usable Zod primitives ──────────────────────────────────────────────────

export const MEMBERSHIP_STATUSES = ["invited", "active", "suspended", "expired"] as const;
export const MEMBERSHIP_ROLES    = ["parent", "operator", "admin"] as const;

export const JoinSchema = z.object({
  orgId: z.number({ required_error: "orgId is required" }).int().positive(),
});

export const PatchMembershipSchema = z
  .object({
    status: z.enum(MEMBERSHIP_STATUSES).optional(),
    role:   z.enum(MEMBERSHIP_ROLES).optional(),
  })
  .refine((d) => d.status !== undefined || d.role !== undefined, {
    message: "Provide at least one of: status, role",
  });

export const TenantDataSchema = z.object({
  date_of_birth:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  medical_notes:           z.string().max(2000).optional(),
  allergies:               z.string().max(1000).optional(),
  emergency_contact_name:  z.string().max(200).optional(),
  emergency_contact_phone: z.string().max(30).optional(),
  custom_fields:           z.record(z.unknown()).optional(),
});
