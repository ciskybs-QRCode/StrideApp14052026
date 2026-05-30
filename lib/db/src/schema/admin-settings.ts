import { pgTable, serial, integer, boolean, jsonb, timestamp, text, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── admin_settings ────────────────────────────────────────────────────────────
// One row per organisation. Stores global toggles for membership enforcement.

export const adminSettings = pgTable("admin_settings", {
  id:                       serial("id").primaryKey(),
  organizationId:           integer("organization_id").notNull().unique(),
  allowOneTimeGraceAccess:  boolean("allow_one_time_grace_access").notNull().default(false),
  graceUsedChildIds:        jsonb("grace_used_child_ids").$type<number[]>().notNull().default([]),

  /** Payroll payout cycle: weekly | fortnightly | monthly | quarterly | semi-annual | custom */
  payoutFrequency: text("payout_frequency").$type<"weekly" | "fortnightly" | "monthly" | "quarterly" | "semi-annual" | "custom">(),

  /** Minimum amount (cents) above which a receipt is required for reimbursements */
  receiptMandatoryThresholdCents: integer("receipt_mandatory_threshold_cents").notNull().default(0),

  // ── White-Label / Branding ─────────────────────────────────────────────────
  /** Public URL of the organisation's logo (stored in Supabase Storage) */
  appLogoUrl:     text("app_logo_url"),
  /** Brand primary colour — hex string, e.g. "#1E3A8A" */
  primaryColor:   text("primary_color"),
  /** Brand secondary / accent colour — hex string, e.g. "#FBBF24" */
  secondaryColor: text("secondary_color"),

  updatedAt:                timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({ id: true, updatedAt: true });
export const updateAdminSettingsSchema = insertAdminSettingsSchema.partial().required({ organizationId: true });
export const selectAdminSettingsSchema = createSelectSchema(adminSettings);

export type AdminSettings       = typeof adminSettings.$inferSelect;
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type UpdateAdminSettings = z.infer<typeof updateAdminSettingsSchema>;
