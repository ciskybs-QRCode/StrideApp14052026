import {
  pgTable, serial, integer, time, timestamp, unique, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── operator_course_avail ─────────────────────────────────────────────────────
// Operator's recurring weekly course-teaching availability template.
// One record per (operator, discipline, day) — upsert-safe via unique constraint.
// Distinct from `availabilities` which tracks date-specific private lesson slots.

export const operatorCourseAvail = pgTable(
  "operator_course_avail",
  {
    id:             serial("id").primaryKey(),
    operatorId:     integer("operator_id").notNull(),
    organizationId: integer("organization_id").notNull(),
    disciplineId:   integer("discipline_id").notNull(),

    /** ISO weekday: 0=Sunday … 6=Saturday */
    dayOfWeek:      integer("day_of_week").notNull(),

    startTime:      time("start_time").notNull(),
    endTime:        time("end_time").notNull(),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("oca_op_disc_day_uniq").on(t.operatorId, t.disciplineId, t.dayOfWeek),
    index("oca_org_idx").on(t.organizationId),
    index("oca_operator_idx").on(t.operatorId),
    index("oca_discipline_idx").on(t.disciplineId),
  ],
);

export const insertOperatorCourseAvailSchema = createInsertSchema(operatorCourseAvail)
  .omit({ id: true, createdAt: true })
  .extend({
    dayOfWeek: z.number().int().min(0).max(6),
  });

export const selectOperatorCourseAvailSchema = createSelectSchema(operatorCourseAvail);

export type OperatorCourseAvail       = typeof operatorCourseAvail.$inferSelect;
export type InsertOperatorCourseAvail = z.infer<typeof insertOperatorCourseAvailSchema>;
