import { pgTable, text, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const floorSections = pgTable("floor_sections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(0),
  color: text("color").notNull().default("#6366f1"),
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
});

export const insertTableSchema = createInsertSchema(tables).omit({ id: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tables.$inferSelect;

export const chairs = pgTable("chairs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  x: numeric("x", { precision: 8, scale: 2 }).notNull().default("0"),
  y: numeric("y", { precision: 8, scale: 2 }).notNull().default("0"),
});

export const insertChairSchema = createInsertSchema(chairs).omit({ id: true });
export type InsertChair = z.infer<typeof insertChairSchema>;
export type Chair = typeof chairs.$inferSelect;
