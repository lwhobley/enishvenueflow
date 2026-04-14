import { pgTable, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const timeClockEntries = pgTable("time_clock_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  venueId: text("venue_id").notNull(),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  totalHours: numeric("total_hours", { precision: 8, scale: 2 }),
  breakMinutes: integer("break_minutes"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
});

export const insertTimeClockEntrySchema = createInsertSchema(timeClockEntries).omit({ id: true });
export type InsertTimeClockEntry = z.infer<typeof insertTimeClockEntrySchema>;
export type TimeClockEntry = typeof timeClockEntries.$inferSelect;

export const timeOffRequests = pgTable("time_off_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  venueId: text("venue_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequests).omit({ id: true, createdAt: true });
export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
