import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shifts = pgTable("shifts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  scheduleId: text("schedule_id").notNull(),
  userId: text("user_id"),
  roleId: text("role_id").notNull(),
  sectionId: text("section_id"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
});

export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true });
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

export const shiftRequests = pgTable("shift_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  shiftId: text("shift_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  requestedWithId: text("requested_with_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShiftRequestSchema = createInsertSchema(shiftRequests).omit({ id: true, createdAt: true });
export type InsertShiftRequest = z.infer<typeof insertShiftRequestSchema>;
export type ShiftRequest = typeof shiftRequests.$inferSelect;
