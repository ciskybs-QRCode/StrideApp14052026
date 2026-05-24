import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── blacklist ─────────────────────────────────────────────────────────────────
// Stores identifiers of permanently banned individuals to prevent re-registration.
// A new registration is blocked if ANY of the non-null fields matches.

export const blacklist = pgTable("blacklist", {
  id:               serial("id").primaryKey(),
  organizationId:   integer("organization_id").notNull(),
  email:            text("email"),
  phoneNumber:      text("phone_number"),
  firstName:        text("first_name"),
  lastName:         text("last_name"),
  reason:           text("reason"),
  blockedByUserId:  integer("blocked_by_user_id"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBlacklistSchema = createInsertSchema(blacklist)
  .omit({ id: true, createdAt: true })
  .extend({
    reason: z.string().min(1).max(500).optional(),
  });

export const selectBlacklistSchema = createSelectSchema(blacklist);

export type BlacklistEntry       = typeof blacklist.$inferSelect;
export type InsertBlacklistEntry = z.infer<typeof insertBlacklistSchema>;
