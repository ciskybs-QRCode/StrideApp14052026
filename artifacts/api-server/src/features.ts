/**
 * Stride Feature Flags — Server
 *
 * Controls which API route groups are active.
 * When a flag is `false`, all routes in that group return 404.
 * The underlying DB schema, seed data, and business logic remain intact.
 *
 * ENABLE_MARKETPLACE: The Marketplace module is fully built and
 * database-ready. Kept in "shadow mode" until the next product phase
 * (commercial launch). Flip to `true` to open the API to clients.
 */

export const ENABLE_MARKETPLACE = false;
