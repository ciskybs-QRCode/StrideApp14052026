import {
  pgTable, serial, integer, text, boolean, jsonb,
  numeric, timestamp, unique, check,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ── operators ─────────────────────────────────────────────────────────────────
// One profile per operator user per organisation.
//
// isVolunteer=true  → unpaid; disciplineRates ignored for payroll.
// isVolunteer=false → paid;   disciplineRates maps disciplineId → hourlyRate ($).
//
// disciplineRates shape: { "42": 85.00, "7": 60.00 }

export const disciplineRatesSchema = z.record(z.string(), z.number().nonnegative());
export type DisciplineRates = z.infer<typeof disciplineRatesSchema>;

export const operators = pgTable(
  "operators",
  {
    id:             serial("id").primaryKey(),
    userId:         integer("user_id").notNull(),
    organizationId: integer("organization_id").notNull(),

    /** true = volunteer (no payroll), false = paid instructor */
    isVolunteer:    boolean("is_volunteer").notNull().default(false),

    /**
     * Flat jsonb map: disciplineId (as string key) → hourly rate in dollars.
     * Ignored when isVolunteer=true. Null until rates are configured.
     */
    disciplineRates: jsonb("discipline_rates").$type<DisciplineRates>(),

    bio:       text("bio"),

    /** Banking details for payroll */
    bankAccountName:   text("bank_account_name"),
    bankAccountNumber: text("bank_account_number"),
    bankBsb:           text("bank_bsb"),

    active:    boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("operators_user_org_unique").on(t.userId, t.organizationId),
  ],
);

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertOperatorSchema = createInsertSchema(operators)
  .omit({ id: true, createdAt: true })
  .extend({
    isVolunteer:    z.boolean().default(false),
    disciplineRates: disciplineRatesSchema.optional(),
    bio:            z.string().max(1000).optional(),
  });

export const updateOperatorSchema = insertOperatorSchema.partial().required({ organizationId: true });
export const selectOperatorSchema = createSelectSchema(operators);

// ── TypeScript types ──────────────────────────────────────────────────────────

export type Operator       = typeof operators.$inferSelect;
export type InsertOperator = z.infer<typeof insertOperatorSchema>;
export type UpdateOperator = z.infer<typeof updateOperatorSchema>;
