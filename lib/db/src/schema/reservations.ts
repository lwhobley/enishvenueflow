import { pgTable, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
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
  externalId: text("external_id"),
  // Host-stand lifecycle timestamps. Each transition (arrive, seat,
  // complete) writes the matching column once; nulls mean "the party
  // hasn't reached that step yet". Used to compute waited-time +
  // seated-time on the host stand without scanning a separate event log.
  arrivedAt: timestamp("arrived_at"),
  seatedAt: timestamp("seated_at"),
  completedAt: timestamp("completed_at"),
  // Public booking site fields. `kind` discriminates regular dining
  // ("dining") from late-night/event reservations ("nightlife", "event")
  // so reporting and the manager UI can split them cleanly. eventId
  // links the reservation to a row in `events` when the customer was
  // booking against a published event night.
  kind: text("kind").notNull().default("dining"),
  eventId: text("event_id"),
  customerId: text("customer_id"),
  // Money in dollars. depositAmount is what was quoted up-front;
  // depositPaid flips true once the matching `payments` row reaches
  // status="succeeded". totalAmount is the final settled amount (deposit
  // + balance) once the night is closed out.
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  depositPaid: boolean("deposit_paid").notNull().default(false),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }),
  // Short human-readable confirmation code shown to the guest, e.g.
  // "ENISH-7K2QF". Used for guest lookup without an account.
  confirmationCode: text("confirmation_code"),
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
