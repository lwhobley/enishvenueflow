import { pgTable, text, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const floorSections = pgTable("floor_sections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(0),
  color: text("color").notNull().default("#6366f1"),
  // Floor plans split into independent layouts: "restaurant" (default,
  // daytime dining) and "nightlife" (the bar / club configuration). A
  // venue can edit each independently. Existing rows default to
  // "restaurant" via the column default.
  scope: text("scope").notNull().default("restaurant"),
  // Server / bartender currently responsible for every table in this
  // section. Nullable — a section without an assignee is "unassigned"
  // and can be claimed when the manager builds the night's roster.
  assignedUserId: text("assigned_user_id"),
});

export const insertFloorSectionSchema = createInsertSchema(floorSections).omit({ id: true });
export type InsertFloorSection = z.infer<typeof insertFloorSectionSchema>;
export type FloorSection = typeof floorSections.$inferSelect;

export const tables = pgTable("tables", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  sectionId: text("section_id").notNull(),
  label: text("label").notNull(),
  capacity: integer("capacity").notNull(),
  status: text("status").notNull().default("available"),
  x: numeric("x", { precision: 8, scale: 2 }).notNull().default("0"),
  y: numeric("y", { precision: 8, scale: 2 }).notNull().default("0"),
  width: numeric("width", { precision: 8, scale: 2 }).notNull().default("80"),
  height: numeric("height", { precision: 8, scale: 2 }).notNull().default("80"),
  shape: text("shape").notNull().default("square"),
  rotation: integer("rotation").notNull().default(0),
  // Sales tracking — set from the floor plan legend when a table is sold.
  // Both nullable: a table without a buyer is unsold/available.
  price: numeric("price", { precision: 12, scale: 2 }),
  purchaserName: text("purchaser_name"),
  // Same scope discriminator as floor_sections — "restaurant" (default)
  // or "nightlife".
  scope: text("scope").notNull().default("restaurant"),
});

export const insertTableSchema = createInsertSchema(tables).omit({ id: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tables.$inferSelect;

export const chairs = pgTable("chairs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  x: numeric("x", { precision: 8, scale: 2 }).notNull().default("0"),
  y: numeric("y", { precision: 8, scale: 2 }).notNull().default("0"),
  width: numeric("width", { precision: 8, scale: 2 }).notNull().default("18"),
  height: numeric("height", { precision: 8, scale: 2 }).notNull().default("11"),
  rotation: integer("rotation").notNull().default(0),
  scope: text("scope").notNull().default("restaurant"),
});

export const insertChairSchema = createInsertSchema(chairs).omit({ id: true });
export type InsertChair = z.infer<typeof insertChairSchema>;
export type Chair = typeof chairs.$inferSelect;
