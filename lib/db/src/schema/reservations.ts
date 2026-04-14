import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reservations = pgTable("reservations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  guestId: text("guest_id"),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email"),
  guestPhone: text("guest_phone"),
  partySize: integer("party_size").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(90),
  tableId: text("table_id"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReservationSchema = createInsertSchema(reservations).omit({ id: true, createdAt: true });
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservations.$inferSelect;

export const waitlistEntries = pgTable("waitlist_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone"),
  partySize: integer("party_size").notNull(),
  quotedWait: integer("quoted_wait"),
  status: text("status").notNull().default("waiting"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries).omit({ id: true, createdAt: true });
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistEntrySchema>;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
