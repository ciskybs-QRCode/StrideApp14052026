import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── disciplines ───────────────────────────────────────────────────────────────
// Each dance style / lesson type offered by an organisation.

export const disciplines = pgTable("disciplines", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name:           text("name").notNull(),
  description:    text("description"),
  active:         boolean("active").notNull().default(true),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertDisciplineSchema = createInsertSchema(disciplines)
  .omit({ id: true, createdAt: true })
  .extend({
    name: z.string().min(1, "Name is required").max(120),
    description: z.string().max(500).optional(),
  });

export const updateDisciplineSchema = insertDisciplineSchema.partial().required({ organizationId: true });
export const selectDisciplineSchema = createSelectSchema(disciplines);

// ── TypeScript types ──────────────────────────────────────────────────────────

export type Discipline       = typeof disciplines.$inferSelect;
export type InsertDiscipline = z.infer<typeof insertDisciplineSchema>;
export type UpdateDiscipline = z.infer<typeof updateDisciplineSchema>;
