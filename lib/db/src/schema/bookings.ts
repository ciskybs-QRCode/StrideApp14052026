import {
  pgTable, serial, integer, text, date, time,
  numeric, timestamp, check, index, unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ── Booking status lifecycle ──────────────────────────────────────────────────
//
//  pending_operator  → parent has submitted; waiting for operator to confirm
//  in_cart           → operator confirmed; lesson is in parent's cart
//  paid              → parent checked out; payment captured
//  completed         → QR scanned at lesson; attendance + earnings logged
//
// Cancellation is handled by deleting or adding a separate cancelled state;
// keep this enum as the single source of truth for all guards.

export const bookingStatusValues = [
  "pending_operator",
  "in_cart",
  "paid",
  "completed",
] as const;
export type BookingStatus = (typeof bookingStatusValues)[number];

// ── bookings ──────────────────────────────────────────────────────────────────

export const bookings = pgTable(
  "bookings",
  {
    id:             serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),

    /** The parent user who made the booking. */
    parentId:       integer("parent_id").notNull(),

    /** The child (student) attending the lesson. */
    studentId:      integer("student_id").notNull(),

    /** The operator (instructor) delivering the lesson. */
    operatorId:     integer("operator_id").notNull(),

    /** The discipline being taught. */
    disciplineId:   integer("discipline_id").notNull(),

    /** The availability slot being booked. */
    availabilityId: integer("availability_id").notNull(),

    // ── Denormalised snapshot of availability at booking time ─────────────────
    // Stored so the booking remains correct even if availability is later edited.
    slotDate:  date("slot_date").notNull(),
    startTime: time("start_time").notNull(),
    endTime:   time("end_time").notNull(),
    location:  text("location").notNull(),

    // ── Pricing snapshot ──────────────────────────────────────────────────────
    /** What the parent will pay ($/hr × duration). Captured from availability. */
    parentPriceTotal: numeric("parent_price_total", { precision: 10, scale: 2 }).notNull(),

    /** What the operator earns ($/hr × duration). 0 for volunteers. */
    operatorEarningsTotal: numeric("operator_earnings_total", { precision: 10, scale: 2 }).notNull().default("0"),

    // ── Status & confirmation ─────────────────────────────────────────────────
    status: text("status").notNull().default("pending_operator"),

    /** One-time token embedded in the QR code shown to the parent. */
    qrToken: text("qr_token").unique(),

    /** Set when the QR code is scanned by the operator at lesson time. */
    attendedAt: timestamp("attended_at", { withTimezone: true }),

    operatorNotes: text("operator_notes"),
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "bookings_status_check",
      sql`${t.status} IN ('pending_operator','in_cart','paid','completed')`,
    ),
    index("bookings_parent_idx").on(t.parentId),
    index("bookings_operator_idx").on(t.operatorId),
    index("bookings_org_idx").on(t.organizationId),
    index("bookings_availability_idx").on(t.availabilityId),
    unique("bookings_availability_unique").on(t.availabilityId),
  ],
);

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertBookingSchema = createInsertSchema(bookings)
  .omit({
    id: true, createdAt: true,
    qrToken: true, attendedAt: true,
    operatorEarningsTotal: true,
  })
  .extend({
    status: z.enum(bookingStatusValues).optional().default("pending_operator"),
    parentPriceTotal: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid dollar amount"),
  });

/** Thin payload accepted from the parent's UI when first creating a booking. */
export const createBookingRequestSchema = z.object({
  availabilityId: z.number().int().positive(),
  studentId:      z.number().int().positive(),
});

/** Payload for the operator QR-scan / attendance endpoint. */
export const scanQrSchema = z.object({
  qrToken: z.string().min(1),
});

/** Admin / operator status transition. */
export const updateBookingStatusSchema = z.object({
  status:        z.enum(bookingStatusValues),
  operatorNotes: z.string().max(500).optional(),
});

export const selectBookingSchema = createSelectSchema(bookings);

// ── TypeScript types ──────────────────────────────────────────────────────────

export type Booking              = typeof bookings.$inferSelect;
export type InsertBooking        = z.infer<typeof insertBookingSchema>;
export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>;
export type ScanQrRequest        = z.infer<typeof scanQrSchema>;
export type UpdateBookingStatus  = z.infer<typeof updateBookingStatusSchema>;
