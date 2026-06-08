/**
 * Safely parses an integer ID from user-supplied or token-derived input.
 *
 * Throws a typed error (with statusCode 400) if the value is NaN, non-finite,
 * or ≤ 0, preventing NaN from silently propagating into database queries.
 *
 * Usage:
 *   import { parseId } from "../lib/parseId.js";
 *   const id = parseId(req.params.id);         // throws 400 if invalid
 *   const uid = parseId(user.id, "user ID");   // labelled error message
 */
export function parseId(value: unknown, label = "ID"): number {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw Object.assign(
      new Error(`Invalid ${label}: ${JSON.stringify(value)}`),
      { statusCode: 400 },
    );
  }
  return n;
}
