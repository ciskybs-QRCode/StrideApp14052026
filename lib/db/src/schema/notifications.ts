import { pgTable, serial, integer, text, boolean, timestamp, check, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ── Notification types ────────────────────────────────────────────────────────
//
//  booking_request       Operator ← parent books a slot
//  booking_confirmed     Parent  ← operator confirms
//  booking_cancelled     Both    ← either side cancels
//  availability_approved Operator ← admin approves slot
//  availability_rejected Operator ← admin rejects slot
//  lesson_reminder       Parent  ← pre-lesson alert (scheduled)
//  payment_received      Both    ← checkout complete

export const notificationTypeValues = [
  "booking_request",
  "booking_confirmed",
  "booking_cancelled",
  "availability_approved",
  "availability_rejected",
  "lesson_reminder",
  "payment_received",
] as const;
export type NotificationType = (typeof notificationTypeValues)[number];

// ── notifications ─────────────────────────────────────────────────────────────
// Drives both polling and Supabase Realtime push on the client.

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

    /** Optional back-reference to the relevant booking. */
    bookingId: integer("booking_id"),

    read:      boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "notifications_type_check",
      sql`${t.type} IN ('booking_request','booking_confirmed','booking_cancelled','availability_approved','availability_rejected','lesson_reminder','payment_received')`,
    ),
    index("notifications_recipient_read_idx").on(t.recipientId, t.read),
    index("notifications_org_idx").on(t.organizationId),
  ],
);

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertNotificationSchema = createInsertSchema(notifications)
  .omit({ id: true, createdAt: true, read: true })
  .extend({
    type:  z.enum(notificationTypeValues),
    title: z.string().min(1).max(200),
    body:  z.string().min(1).max(1000),
  });

export const selectNotificationSchema = createSelectSchema(notifications);

// ── TypeScript types ──────────────────────────────────────────────────────────

export type Notification       = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
