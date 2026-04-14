import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const schedules = pgTable("schedules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScheduleSchema = createInsertSchema(schedules).omit({ id: true, createdAt: true });
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedules.$inferSelect;
