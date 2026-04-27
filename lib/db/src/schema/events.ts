import { pgTable, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Public-facing events (themed nights, live performances, holiday parties).
// Customers browse these on the booking site, then reserve a section/table
// against an event. Internally they share the `reservations` table with
// regular dining reservations — the optional `eventId` link is what
// distinguishes "I'm coming for the Afrobeats Friday" from "table for two
// at 7pm".
export const events = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  // YYYY-MM-DD — nightlife events are date-anchored. Multi-day series are
  // represented as separate rows so the calendar UI stays simple.
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),  // HH:MM
  endTime: text("end_time"),                // HH:MM (optional)
  // Cover charge per guest at the door. Tables booked through the floor
  // plan additionally carry their own table minimum (see tables.price).
  coverCharge: numeric("cover_charge", { precision: 10, scale: 2 }).notNull().default("0"),
  // Minimum deposit a customer must pay to lock in a section reservation
  // for this event. 0 = no deposit (free RSVP).
  depositPerGuest: numeric("deposit_per_guest", { precision: 10, scale: 2 }).notNull().default("0"),
  // URL of the hero image — uses a local /assets path or external CDN.
  imageUrl: text("image_url"),
  // Public-facing flag. Set false to draft / pull an event from the
  // booking site without deleting historical bookings.
  isPublished: boolean("is_published").notNull().default(true),
  // Soft cap on total guests across all bookings for this event. Null =
  // unlimited (the floor plan capacity is the real constraint then).
  capacity: integer("capacity"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Customer accounts are separate from staff `users` — staff PIN auth
// can't be reused for the public site (different threat model, different
// flow, different permissions). A customer record is created lazily when
// somebody completes their first booking; if they later set a password
// we promote the row to a real account they can log into.
export const customers = pgTable("customers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Customers can book at multiple venues over time but a row is keyed
  // to the venue that first onboarded them so reporting stays scoped.
  venueId: text("venue_id").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  // bcrypt/scrypt hash. Null until the customer creates a password —
  // until then they can still receive booking confirmation emails by
  // matching on email + booking reference.
  passwordHash: text("password_hash"),
  // Marketing opt-in for the venue's email list.
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// Bearer-token sessions for the customer site, mirroring the staff
// `user_sessions` table. SHA-256 hash stored, never the plaintext token.
export const customerSessions = pgTable("customer_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").notNull(),
  venueId: text("venue_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CustomerSession = typeof customerSessions.$inferSelect;

// Payment records for deposits and final settlement. Each row tracks one
// charge attempt against one booking (reservation). We don't run real
// card-present terminals from this app; the `provider` column distinguishes
// stripe / square / cash / mock so reporting can split them out and the
// manager dashboard can flag bookings whose deposit hasn't cleared.
export const payments = pgTable("payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  // Foreign keys to the reservation (the booking) and the customer who
  // paid. Reservation is required; customer is null for walk-ups paid
  // by staff at the door.
  reservationId: text("reservation_id").notNull(),
  customerId: text("customer_id"),
  // "deposit" — held when the booking is created.
  // "balance" — settled at the venue (or end of night).
  // "refund" — issued for cancellation; stored as a positive amount,
  //            refund vs. charge is the `kind` column.
  kind: text("kind").notNull().default("deposit"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  // "stripe", "square", "cash", "mock" (used in dev / staging).
  provider: text("provider").notNull().default("mock"),
  // Provider's transaction id, e.g. ch_3O… for Stripe. Nullable so cash
  // payments still get a row.
  providerRef: text("provider_ref"),
  // "pending" — initiated, waiting on the gateway.
  // "succeeded" — funds captured.
  // "failed" — gateway declined.
  // "refunded" — original charge was reversed.
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;
