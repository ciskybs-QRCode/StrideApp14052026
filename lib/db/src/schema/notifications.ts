import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Notification types ────────────────────────────────────────────────────────
// 27 production types + 7 legacy types kept for backward compatibility with
// existing notification inserts (reminder-scheduler, private-bookings, etc.)

export const notificationTypeValues = [
  // ── Legacy types (backward compat) ────────────────────────────────────────
  "booking_request",
  "booking_confirmed",
  "booking_cancelled",
  "availability_approved",
  "availability_rejected",
  "lesson_reminder",
  "payment_received",
  // ── Production types ──────────────────────────────────────────────────────
  "promo",
  "attendance_alert",
  "emergency",
  "course_assignment",
  "broadcast",
  "check_in",
  "course_pending_confirmation",
  "feedback",
  "lesson_decision",
  "chat_message",
  "emergency_resolved",
  "lesson_disruption",
  "emergency_medical",
  "document",
  "meeting",
  "achievement",
  "substitute_request",
  "material",
  "compliance",
  "private_lesson_approved",
  "emergency_police",
  "emergency_fire",
  "reimbursement",
  "private_lesson_proposed",
  // ── Sandbox / safety types ─────────────────────────────────────────────────
  "emergency_pulse",
  "ble_timeout",
  "security_escalation",
] as const;

export type NotificationType = (typeof notificationTypeValues)[number];

// ── notifications ─────────────────────────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id:             serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),

    /** The user who should see this notification. */
    recipientId:    integer("recipient_id").notNull(),

    /** The user who triggered the event (may be null for system-generated). */
    senderId:       integer("sender_id"),

    type:      text("type").notNull(),
    title:     text("title").notNull(),
    body:      text("body").notNull(),

    /** Optional back-reference to the relevant booking or workshop. */
    bookingId:  integer("booking_id"),
    workshopId: text("workshop_id"),

    /**
     * Target criteria used for broadcast notifications (workshops, schedule
     * changes). Stored as JSON string: { ageMin, ageMax, level, discipline }.
     */
    targetCriteria: text("target_criteria"),

    read:   boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_recipient_read_idx").on(t.recipientId, t.read),
    index("notifications_org_idx").on(t.organizationId),
    index("notifications_type_idx").on(t.type),
  ],
);

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertNotificationSchema = createInsertSchema(notifications)
  .omit({ id: true, createdAt: true, read: true, readAt: true })
  .extend({
    type:  z.enum(notificationTypeValues),
    title: z.string().min(1).max(200),
    body:  z.string().min(1).max(1000),
  });

export const selectNotificationSchema = createSelectSchema(notifications);

export const markReadSchema = z.object({
  readAt: z.string().datetime().optional(),
});

// ── TypeScript types ──────────────────────────────────────────────────────────

export type Notification       = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
