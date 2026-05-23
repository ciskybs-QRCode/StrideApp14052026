import { pgTable, serial, integer, text, date, time, timestamp, check } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ── private_bookings ──────────────────────────────────────────────────────────
// One row per booked private lesson.
// status: "pending" | "confirmed" | "cancelled" | "completed"
// qr_token is generated at booking creation and shown to parent for QR scanning.

export const bookingStatusEnum = ["pending", "confirmed", "cancelled", "completed"] as const;
export type BookingStatus = (typeof bookingStatusEnum)[number];

export const privateBookings = pgTable(
  "private_bookings",
  {
    id:              serial("id").primaryKey(),
    organizationId:  integer("organization_id").notNull(),
    availabilityId:  integer("availability_id").notNull(),
    childId:         integer("child_id").notNull(),
    parentUserId:    integer("parent_user_id").notNull(),
    operatorUserId:  integer("operator_user_id").notNull(),
    disciplineId:    integer("discipline_id").notNull(),
    location:        text("location").notNull(),
    slotDate:        date("slot_date").notNull(),
    startTime:       time("start_time").notNull(),
    endTime:         time("end_time").notNull(),
    priceCents:      integer("price_cents").notNull(),
    status:          text("status").notNull().default("pending"),
    qrToken:         text("qr_token").unique(),
    attendedAt:      timestamp("attended_at", { withTimezone: true }),
    earningsCents:   integer("earnings_cents"),
    operatorNotes:   text("operator_notes"),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "private_bookings_status_check",
      sql`${t.status} IN ('pending','confirmed','cancelled','completed')`,
    ),
  ],
);

// ── Schemas ───────────────────────────────────────────────────────────────────

export const insertPrivateBookingSchema = createInsertSchema(privateBookings)
  .omit({ id: true, createdAt: true, qrToken: true, attendedAt: true, earningsCents: true })
  .extend({
    status: z.enum(bookingStatusEnum).optional().default("pending"),
  });

/** Payload accepted from the parent when creating a new booking */
export const createBookingRequestSchema = z.object({
  availabilityId: z.number().int().positive(),
  childId:        z.number().int().positive(),
});

/** Payload for the QR scan / attendance endpoint */
export const scanBookingSchema = z.object({
  qrToken: z.string().min(1),
});

export const selectPrivateBookingSchema = createSelectSchema(privateBookings);

export type InsertPrivateBooking     = z.infer<typeof insertPrivateBookingSchema>;
export type CreateBookingRequest     = z.infer<typeof createBookingRequestSchema>;
export type ScanBookingRequest       = z.infer<typeof scanBookingSchema>;
export type PrivateBooking           = typeof privateBookings.$inferSelect;
