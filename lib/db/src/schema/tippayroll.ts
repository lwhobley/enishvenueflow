import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tipPools = pgTable("tip_pools", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  scheduleId: text("schedule_id").notNull(),
  totalTips: numeric("total_tips", { precision: 10, scale: 2 }).notNull(),
  distributionMethod: text("distribution_method").notNull().default("equal"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTipPoolSchema = createInsertSchema(tipPools).omit({ id: true, createdAt: true });
export type InsertTipPool = z.infer<typeof insertTipPoolSchema>;
export type TipPool = typeof tipPools.$inferSelect;

export const tipPoolEntries = pgTable("tip_pool_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  poolId: text("pool_id").notNull(),
  userId: text("user_id").notNull(),
  hoursWorked: numeric("hours_worked", { precision: 8, scale: 2 }).notNull().default("0"),
  points: numeric("points", { precision: 8, scale: 2 }).notNull().default("0"),
  tipAmount: numeric("tip_amount", { precision: 10, scale: 2 }).notNull().default("0"),
});

export const insertTipPoolEntrySchema = createInsertSchema(tipPoolEntries).omit({ id: true });
export type InsertTipPoolEntry = z.infer<typeof insertTipPoolEntrySchema>;
export type TipPoolEntry = typeof tipPoolEntries.$inferSelect;

export const payrollRecords = pgTable("payroll_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  venueId: text("venue_id").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  regularHours: numeric("regular_hours", { precision: 8, scale: 2 }).notNull().default("0"),
  overtimeHours: numeric("overtime_hours", { precision: 8, scale: 2 }).notNull().default("0"),
  regularPay: numeric("regular_pay", { precision: 10, scale: 2 }).notNull().default("0"),
  overtimePay: numeric("overtime_pay", { precision: 10, scale: 2 }).notNull().default("0"),
  tipAmount: numeric("tip_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalPay: numeric("total_pay", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPayrollRecordSchema = createInsertSchema(payrollRecords).omit({ id: true, createdAt: true });
export type InsertPayrollRecord = z.infer<typeof insertPayrollRecordSchema>;
export type PayrollRecord = typeof payrollRecords.$inferSelect;
