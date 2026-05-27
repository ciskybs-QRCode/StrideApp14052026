import {
  pgTable, serial, integer, text, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── reimbursements ─────────────────────────────────────────────────────────────
// Out-of-pocket expense claims submitted by any role.

export const reimbursements = pgTable("reimbursements", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),

  /** User who submitted the claim */
  claimantUserId: integer("claimant_user_id").notNull(),
  claimantName:   text("claimant_name").notNull(),

  /** admin | paid_operator | volunteer | parent */
  claimantRole:   text("claimant_role").$type<"admin" | "paid_operator" | "volunteer" | "parent">().notNull(),

  description:    text("description").notNull(),
  amountCents:    integer("amount_cents").notNull(),

  /** File path (JPG/PDF) or external link (Google Drive / Dropbox) */
  receiptUri:     text("receipt_uri"),

  /** pending | approved | paid | rejected */
  status:         text("status").$type<"pending" | "approved" | "paid" | "rejected">().notNull().default("pending"),

  adminNote:      text("admin_note"),

  submittedAt:    timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow(),
});

export const insertReimbursementSchema = createInsertSchema(reimbursements).omit({ id: true, submittedAt: true, updatedAt: true });
export const updateReimbursementSchema = insertReimbursementSchema.partial().required({ organizationId: true });
export const selectReimbursementSchema = createSelectSchema(reimbursements);

export type Reimbursement       = typeof reimbursements.$inferSelect;
export type InsertReimbursement = z.infer<typeof insertReimbursementSchema>;
