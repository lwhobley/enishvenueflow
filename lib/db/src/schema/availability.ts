import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const availability = pgTable("availability", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  venueId: text("venue_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun, 1=Mon, ..., 6=Sat
  isAvailable: boolean("is_available").notNull().default(true),
  startTime: text("start_time"), // "HH:MM" 24-hr, null = all day
  endTime: text("end_time"),     // "HH:MM" 24-hr, null = all day
  notes: text("notes"),
  // When set, this row is a one-off override for that specific date and
  // takes precedence over the recurring (date IS NULL) rule for the same
  // dayOfWeek. Format: "YYYY-MM-DD". Used by the employee availability
  // page to mark "I'm out on May 15" / "I can only work 5-9pm on June 22".
  date: text("date"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAvailabilitySchema = createInsertSchema(availability).omit({ id: true, updatedAt: true });
export type InsertAvailability = z.infer<typeof insertAvailabilitySchema>;
export type Availability = typeof availability.$inferSelect;
