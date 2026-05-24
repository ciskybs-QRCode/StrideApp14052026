import { pgTable, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── admin_settings ────────────────────────────────────────────────────────────
// One row per organisation. Stores global toggles for membership enforcement.

export const adminSettings = pgTable("admin_settings", {
  id:                       serial("id").primaryKey(),
  organizationId:           integer("organization_id").notNull().unique(),
  allowOneTimeGraceAccess:  boolean("allow_one_time_grace_access").notNull().default(false),
  // Array of child IDs that have already consumed the one-time grace entry
  graceUsedChildIds:        jsonb("grace_used_child_ids").$type<number[]>().notNull().default([]),
  updatedAt:                timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({ id: true, updatedAt: true });
export const updateAdminSettingsSchema = insertAdminSettingsSchema.partial().required({ organizationId: true });
export const selectAdminSettingsSchema = createSelectSchema(adminSettings);

export type AdminSettings       = typeof adminSettings.$inferSelect;
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type UpdateAdminSettings = z.infer<typeof updateAdminSettingsSchema>;
