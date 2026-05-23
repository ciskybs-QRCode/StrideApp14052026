import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── disciplines ───────────────────────────────────────────────────────────────
// One row per dance style/discipline offered by an organisation.

export const disciplines = pgTable("disciplines", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name:           text("name").notNull(),
  description:    text("description"),
  active:         boolean("active").notNull().default(true),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDisciplineSchema = createInsertSchema(disciplines).omit({ id: true, createdAt: true });
export const selectDisciplineSchema = createSelectSchema(disciplines);

export type InsertDiscipline = z.infer<typeof insertDisciplineSchema>;
export type Discipline       = typeof disciplines.$inferSelect;
