import {
  pgTable, serial, integer, text, time, timestamp, index, check,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const scheduledCourseStatusValues = [
  "pending_confirmation", "active", "declined", "cancelled",
] as const;
export type ScheduledCourseStatus = typeof scheduledCourseStatusValues[number];

export const scheduledCourseSkillLevelValues = [
  "beginner", "intermediate", "advanced", "open",
] as const;
export type ScheduledCourseSkillLevel = typeof scheduledCourseSkillLevelValues[number];

export const scheduledCoursePaymentTypeValues = [
  "single", "package", "monthly_billing",
] as const;
export type ScheduledCoursePaymentType = typeof scheduledCoursePaymentTypeValues[number];

// ── scheduled_courses ─────────────────────────────────────────────────────────
// Admin-created recurring course definitions that require operator confirmation
// before becoming active. Each record represents one weekly recurring slot.

export const scheduledCourses = pgTable(
  "scheduled_courses",
  {
    id:                serial("id").primaryKey(),
    organizationId:    integer("organization_id").notNull(),
    disciplineId:      integer("discipline_id").notNull(),

    /** Operator profile to teach this course. Nullable until admin assigns one. */
    operatorProfileId: integer("operator_profile_id"),

    /** ISO weekday: 0=Sunday … 6=Saturday */
    dayOfWeek:         integer("day_of_week").notNull(),

    startTime:         time("start_time").notNull(),
    endTime:           time("end_time").notNull(),

    /** Minimum age (inclusive) for enrollment targeting */
    ageMin:            integer("age_min").notNull().default(5),

    /** Maximum age (inclusive) for enrollment targeting */
    ageMax:            integer("age_max").notNull().default(18),

    /** Skill level targeting for enrollment notifications */
    skillLevel:        text("skill_level").notNull().default("open"),

    /** pending_confirmation → operator must confirm; active → live; declined / cancelled */
    status:            text("status").notNull().default("pending_confirmation"),

    notes:             text("notes"),
    createdByAdminId:  integer("created_by_admin_id"),
    createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt:       timestamp("confirmed_at", { withTimezone: true }),

    // ── Payment configuration ──────────────────────────────────────────────────
    /** 'single' = pay per lesson; 'package' = fixed block of N lessons; 'monthly_billing' = recurring on a day of month */
    paymentType:          text("payment_type").notNull().default("single"),

    /** Price per single lesson in cents (used when payment_type = 'single') */
    pricePerLessonCents:  integer("price_per_lesson_cents"),

    /** Number of lessons in the package (used when payment_type = 'package') */
    packageSize:          integer("package_size"),

    /** Total price for the package in cents (used when payment_type = 'package') */
    packagePriceCents:    integer("package_price_cents"),

    /** Monthly billing amount in cents (used when payment_type = 'monthly_billing') */
    monthlyPriceCents:    integer("monthly_price_cents"),

    /** Day of month to bill (1–28) (used when payment_type = 'monthly_billing') */
    billingDayOfMonth:    integer("billing_day_of_month"),

    /** Last billing date — academic year end or custom (YYYY-MM-DD) */
    billingEndDate:       text("billing_end_date"),
  },
  (t) => [
    check("sched_courses_day_check",  sql`${t.dayOfWeek} BETWEEN 0 AND 6`),
    check("sched_courses_age_check",  sql`${t.ageMin} <= ${t.ageMax}`),
    check("sched_courses_billing_day_check", sql`${t.billingDayOfMonth} IS NULL OR (${t.billingDayOfMonth} BETWEEN 1 AND 28)`),
    index("sched_courses_org_idx").on(t.organizationId),
    index("sched_courses_op_idx").on(t.operatorProfileId),
    index("sched_courses_status_idx").on(t.status),
  ],
);

export const insertScheduledCourseSchema = createInsertSchema(scheduledCourses)
  .omit({ id: true, createdAt: true, confirmedAt: true })
  .extend({
    dayOfWeek:           z.number().int().min(0).max(6),
    ageMin:              z.number().int().min(0).max(120).default(5),
    ageMax:              z.number().int().min(0).max(120).default(18),
    skillLevel:          z.enum(scheduledCourseSkillLevelValues).default("open"),
    status:              z.enum(scheduledCourseStatusValues).optional().default("pending_confirmation"),
    notes:               z.string().max(500).optional(),
    paymentType:         z.enum(scheduledCoursePaymentTypeValues).optional().default("single"),
    pricePerLessonCents: z.number().int().min(0).optional(),
    packageSize:         z.number().int().min(1).optional(),
    packagePriceCents:   z.number().int().min(0).optional(),
    monthlyPriceCents:   z.number().int().min(0).optional(),
    billingDayOfMonth:   z.number().int().min(1).max(28).optional(),
    billingEndDate:      z.string().optional(),
  });

export const selectScheduledCourseSchema = createSelectSchema(scheduledCourses);

export type ScheduledCourse       = typeof scheduledCourses.$inferSelect;
export type InsertScheduledCourse = z.infer<typeof insertScheduledCourseSchema>;
