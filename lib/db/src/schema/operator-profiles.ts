import { pgTable, serial, integer, text, boolean, timestamp, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ── operator_profiles ─────────────────────────────────────────────────────────
// One profile per operator user per organisation.
// profile_type: "paid" | "volunteer"

export const operatorProfiles = pgTable(
  "operator_profiles",
  {
    id:             serial("id").primaryKey(),
    userId:         integer("user_id").notNull(),
    organizationId: integer("organization_id").notNull(),
    profileType:    text("profile_type").notNull().default("volunteer"),
    bio:            text("bio"),
    active:         boolean("active").notNull().default(true),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("operator_profiles_user_org_unique").on(t.userId, t.organizationId),
    check("operator_profiles_type_check", sql`${t.profileType} IN ('paid','volunteer')`),
  ],
);

// ── operator_discipline_rates ─────────────────────────────────────────────────
// Per-discipline hourly rate for paid operators.

export const operatorDisciplineRates = pgTable(
  "operator_discipline_rates",
  {
    id:                serial("id").primaryKey(),
    operatorProfileId: integer("operator_profile_id").notNull(),
    disciplineId:      integer("discipline_id").notNull(),
    hourlyRateCents:   integer("hourly_rate_cents").notNull().default(0),
  },
  (t) => [
    unique("operator_discipline_rates_unique").on(t.operatorProfileId, t.disciplineId),
  ],
);

export const insertOperatorProfileSchema = createInsertSchema(operatorProfiles).omit({ id: true, createdAt: true }).extend({
  profileType: z.enum(["paid", "volunteer"]),
});
export const selectOperatorProfileSchema = createSelectSchema(operatorProfiles);

export const insertOperatorDisciplineRateSchema = createInsertSchema(operatorDisciplineRates).omit({ id: true });
export const selectOperatorDisciplineRateSchema = createSelectSchema(operatorDisciplineRates);

export type InsertOperatorProfile       = z.infer<typeof insertOperatorProfileSchema>;
export type OperatorProfile             = typeof operatorProfiles.$inferSelect;
export type InsertOperatorDisciplineRate = z.infer<typeof insertOperatorDisciplineRateSchema>;
export type OperatorDisciplineRate      = typeof operatorDisciplineRates.$inferSelect;
