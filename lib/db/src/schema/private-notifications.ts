import { pgTable, serial, integer, text, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ── private_notifications ─────────────────────────────────────────────────────
// Drives both in-app polling and Supabase Realtime push.
//
// type values:
//   booking_request       — operator notified when parent books
//   booking_confirmed     — parent notified when operator confirms
//   booking_cancelled     — either party notified on cancellation
//   availability_approved — operator notified on admin approval
//   availability_rejected — operator notified on admin rejection
//   lesson_reminder       — pre-lesson reminder (scheduled job)
//   payment_received      — parent/operator notified after checkout

export const notificationTypeEnum = [
  "booking_request",
  "booking_confirmed",
  "booking_cancelled",
  "availability_approved",
  "availability_rejected",
  "lesson_reminder",
  "payment_received",
] as const;

export type NotificationType = (typeof notificationTypeEnum)[number];

export const privateNotifications = pgTable(
  "private_notifications",
  {
    id:             serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),
    recipientId:    integer("recipient_id").notNull(),
    senderId:       integer("sender_id"),
    type:           text("type").notNull(),
    title:          text("title").notNull(),
    body:           text("body").notNull(),
    bookingId:      integer("booking_id"),
    read:           boolean("read").notNull().default(false),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "private_notifications_type_check",
      sql`${t.type} IN ('booking_request','booking_confirmed','booking_cancelled','availability_approved','availability_rejected','lesson_reminder','payment_received')`,
    ),
  ],
);

// ── Schemas ───────────────────────────────────────────────────────────────────

export const insertPrivateNotificationSchema = createInsertSchema(privateNotifications)
  .omit({ id: true, createdAt: true, read: true })
  .extend({
    type: z.enum(notificationTypeEnum),
  });

export const selectPrivateNotificationSchema = createSelectSchema(privateNotifications);

export type InsertPrivateNotification = z.infer<typeof insertPrivateNotificationSchema>;
export type PrivateNotification       = typeof privateNotifications.$inferSelect;
