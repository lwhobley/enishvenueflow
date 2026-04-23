import { pgTable, text, boolean, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const venues = pgTable("venues", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  address: text("address").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  isActive: boolean("is_active").notNull().default(true),
  enrollmentToken: text("enrollment_token"),
  // GPS pin for clock-in verification. Copy from Google Maps (right-click the
  // venue's exact spot on the map → "What's here?" to get lat/lng with 6+
  // decimal digits of precision). When null, clock-in fails with "GPS pin
  // not configured".
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  // Allowed distance (in feet) between the device and the pin at clock-in.
  // Falls back to 1000 ft when null.
  clockInRadiusFeet: integer("clock_in_radius_feet"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVenueSchema = createInsertSchema(venues).omit({ id: true, createdAt: true });
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venues.$inferSelect;
