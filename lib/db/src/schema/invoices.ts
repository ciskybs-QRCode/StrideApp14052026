import {
  pgTable, serial, integer, text, numeric, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── invoices ──────────────────────────────────────────────────────────────────
// One row per operator invoice submission.
// Line items are stored as JSONB for flexibility.

export interface InvoiceLineItem {
  date:          string;
  lessonType:    string;
  timeSlot:      string;
  unitCostCents: number;
  subtotalCents: number;
}

export const invoices = pgTable("invoices", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  operatorUserId: integer("operator_user_id").notNull(),
  operatorName:   text("operator_name").notNull(),

  /** e.g. "2026-05" */
  period:         text("period").notNull(),

  /** Structured line items */
  lineItems:      jsonb("line_items").$type<InvoiceLineItem[]>().notNull().default([]),

  totalCents:     integer("total_cents").notNull().default(0),

  /** pending | approved | paid | rejected */
  status:         text("status").$type<"pending" | "approved" | "paid" | "rejected">().notNull().default("pending"),

  /** URL or file path of attached PDF */
  pdfUri:         text("pdf_uri"),

  submittedAt:    timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, submittedAt: true, updatedAt: true });
export const updateInvoiceSchema = insertInvoiceSchema.partial().required({ organizationId: true });
export const selectInvoiceSchema = createSelectSchema(invoices);

export type Invoice       = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
