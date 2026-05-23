import { pgTable, serial, integer, text, date, time, timestamp, check } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ── operator_availability ─────────────────────────────────────────────────────
// Operator submits a slot; admin approves + sets parent price.
// status: "pending" | "approved" | "rejected" | "booked"

export const availabilityStatusEnum = ["pending", "approved", "rejected", "booked"] as const;
export type AvailabilityStatus = (typeof availabilityStatusEnum)[number];

export const operatorAvailability = pgTable(
  "operator_availability",
  {
    id:                serial("id").primaryKey(),
    operatorProfileId: integer("operator_profile_id").notNull(),
    organizationId:    integer("organization_id").notNull(),
    disciplineId:      integer("discipline_id").notNull(),
    location:          text("location").notNull(),
    slotDate:          date("slot_date").notNull(),
    startTime:         time("start_time").notNull(),
    endTime:           time("end_time").notNull(),
    status:            text("status").notNull().default("pending"),
    parentPriceCents:  integer("parent_price_cents"),
    notes:             text("notes"),
    createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "operator_availability_status_check",
      sql`${t.status} IN ('pending','approved','rejected','booked')`,
    ),
  ],
);

export const insertAvailabilitySchema = createInsertSchema(operatorAvailability)
  .omit({ id: true, createdAt: true })
  .extend({
    status: z.enum(availabilityStatusEnum).optional().default("pending"),
  });

export const reviewAvailabilitySchema = z.object({
  status:           z.enum(["approved", "rejected"]),
  parentPriceCents: z.number().int().positive().optional(),
});

export const selectAvailabilitySchema = createSelectSchema(operatorAvailability);

export type InsertAvailability  = z.infer<typeof insertAvailabilitySchema>;
export type ReviewAvailability  = z.infer<typeof reviewAvailabilitySchema>;
export type OperatorAvailability = typeof operatorAvailability.$inferSelect;
