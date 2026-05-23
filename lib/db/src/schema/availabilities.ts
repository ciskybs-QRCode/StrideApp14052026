import {
  pgTable, serial, integer, text, date, time,
  numeric, timestamp, check, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const availabilityStatusValues = ["pending", "approved", "rejected", "booked"] as const;
export type AvailabilityStatus = (typeof availabilityStatusValues)[number];

/** ISO weekday: 0 = Sunday … 6 = Saturday */
export const dayOfWeekValues = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayOfWeek = (typeof dayOfWeekValues)[number];

export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

// ── availabilities ────────────────────────────────────────────────────────────
// An operator submits a slot; admin approves and sets prices.
//
// Prices stored as NUMERIC(10,2) in dollars (e.g. 85.00) for human-readable
// API responses. Use .toFixed(2) when displaying.

export const availabilities = pgTable(
  "availabilities",
  {
    id:               serial("id").primaryKey(),
    operatorId:       integer("operator_id").notNull(),
    organizationId:   integer("organization_id").notNull(),
    disciplineId:     integer("discipline_id").notNull(),

    /** ISO weekday (0=Sun…6=Sat). Informational — slotDate is authoritative. */
    dayOfWeek:        integer("day_of_week").notNull(),

    /** The exact calendar date of the slot (YYYY-MM-DD). */
    slotDate:         date("slot_date").notNull(),

    startTime:        time("start_time").notNull(),
    endTime:          time("end_time").notNull(),
    location:         text("location").notNull(),

    /** One of: pending | approved | rejected | booked */
    status:           text("status").notNull().default("pending"),

    /** Price the parent will be charged per hour (dollars). Set by admin on approval. */
    parentPricePerHour:  numeric("parent_price_per_hour", { precision: 10, scale: 2 }),

    /** Rate the operator is paid per hour (dollars). Set by admin on approval (paid only). */
    operatorPayPerHour:  numeric("operator_pay_per_hour", { precision: 10, scale: 2 }),

    notes:     text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "availabilities_status_check",
      sql`${t.status} IN ('pending','approved','rejected','booked')`,
    ),
    check(
      "availabilities_day_of_week_check",
      sql`${t.dayOfWeek} BETWEEN 0 AND 6`,
    ),
    index("availabilities_operator_idx").on(t.operatorId),
    index("availabilities_org_idx").on(t.organizationId),
    index("availabilities_slot_date_idx").on(t.slotDate),
  ],
);

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertAvailabilitySchema = createInsertSchema(availabilities)
  .omit({ id: true, createdAt: true, parentPricePerHour: true, operatorPayPerHour: true })
  .extend({
    dayOfWeek: z.number().int().min(0).max(6),
    status:    z.enum(availabilityStatusValues).optional().default("pending"),
    notes:     z.string().max(500).optional(),
  });

/** Payload the admin sends when approving or rejecting a slot. */
export const reviewAvailabilitySchema = z.object({
  status:              z.enum(["approved", "rejected"]),
  parentPricePerHour:  z.number().nonnegative().optional(),
  operatorPayPerHour:  z.number().nonnegative().optional(),
});

export const selectAvailabilitySchema = createSelectSchema(availabilities);

// ── TypeScript types ──────────────────────────────────────────────────────────

export type Availability       = typeof availabilities.$inferSelect;
export type InsertAvailability  = z.infer<typeof insertAvailabilitySchema>;
export type ReviewAvailability  = z.infer<typeof reviewAvailabilitySchema>;
