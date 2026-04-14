import { pgTable, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guests = pgTable("guests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  birthday: text("birthday"),
  tags: jsonb("tags").$type<string[]>().default([]),
  vipLevel: integer("vip_level").notNull().default(0),
  visitCount: integer("visit_count").notNull().default(0),
  lastVisit: text("last_visit"),
  totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGuestSchema = createInsertSchema(guests).omit({ id: true, createdAt: true });
export type InsertGuest = z.infer<typeof insertGuestSchema>;
export type Guest = typeof guests.$inferSelect;
