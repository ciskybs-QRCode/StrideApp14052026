import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Notification types ────────────────────────────────────────────────────────

export const notificationTypeValues = [
  "booking_request",
  "booking_confirmed",
  "booking_cancelled",
  "availability_approved",
  "availability_rejected",
  "lesson_reminder",
  "payment_received",
  "workshop_created",
  "workshop_approved",
  "workshop_rejected",
  "schedule_change",
  "lesson_cancelled",
  "lesson_postponed",
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
