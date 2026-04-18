import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportSends = pgTable("report_sends", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  reportKind: text("report_kind").notNull(),
  recipients: text("recipients").array().notNull().default([]),
  triggeredByUserId: text("triggered_by_user_id"),
  status: text("status").notNull().default("sent"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReportSendSchema = createInsertSchema(reportSends).omit({ id: true, createdAt: true });
export type InsertReportSend = z.infer<typeof insertReportSendSchema>;
export type ReportSend = typeof reportSends.$inferSelect;

export const reportSettings = pgTable("report_settings", {
  venueId: text("venue_id").primaryKey(),
  recipients: text("recipients").array().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ReportSettings = typeof reportSettings.$inferSelect;
