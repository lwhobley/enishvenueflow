import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roles = pgTable("roles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  name: text("name").notNull(),
  permissions: jsonb("permissions").$type<Record<string, boolean>>().default({}),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({ id: true, createdAt: true });
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;
