import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  events, customers, payments, reservations, tables, floorSections, venues,
} from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import {
  hashPassword, verifyPassword,
  createCustomerSession, verifyCustomerToken, deleteCustomerSession,
  generateConfirmationCode,
} from "../lib/customer-sessions";

const router = Router();

// All endpoints in this router are publicly reachable — they're allow-listed
// upstream in require-auth and never see req.auth, so they can't trip the
// venue-scope middleware. Customer authentication (when needed) is layered
// on per-route via requireCustomer below.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: { sessionId: string; customerId: string; venueId: string };
    }
  }
}

async function requireCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ message: "Sign in to continue" });
    return;
  }
  const principal = await verifyCustomerToken(header.slice(7).trim());
  if (!principal) {
    res.status(401).json({ message: "Session expired" });
    return;
  }
  req.customer = principal;
  next();
}

// ── Venue ─────────────────────────────────────────────────────────────────
// Returns the public profile for a venue so the booking site can render
// hero/contact info without needing a hard-coded venue id in the SPA.
router.get("/public/venues/:venueId", async (req, res) => {
  try {
    const venueId = String(req.params.venueId);
    const [venue] = await db.select({
      id: venues.id, name: venues.name, address: venues.address, timezone: venues.timezone,
    }).from(venues).where(eq(venues.id, venueId));
    if (!venue) return res.status(404).json({ message: "Venue not found" });
    res.json(venue);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load venue" });
  }
});

// ── Events ────────────────────────────────────────────────────────────────
router.get("/public/events", async (req, res) => {
  try {
    const venueId = String(req.query.venueId ?? "");
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const fromDate = String(req.query.from ?? new Date().toISOString().slice(0, 10));
    const all = await db.select().from(events).where(and(
      eq(events.venueId, venueId),
      eq(events.isPublished, true),
      gte(events.date, fromDate),
    )).orderBy(events.date, events.startTime);
    res.json(all.map((e) => ({
      ...e,
      coverCharge: parseFloat(e.coverCharge),
      depositPerGuest: parseFloat(e.depositPerGuest),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load events" });
  }
});

router.get("/public/events/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const [event] = await db.select().from(events).where(eq(events.id, id));
    if (!event || !event.isPublished) return res.status(404).json({ message: "Event not found" });
    res.json({
      ...event,
      coverCharge: parseFloat(event.coverCharge),
      depositPerGuest: parseFloat(event.depositPerGuest),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load event" });
  }
});

// ── Floor plan availability ──────────────────────────────────────────────
// Returns the nightlife floor plan plus per-table availability for the
// requested date. A table is "booked" when there is a non-cancelled
// reservation for the same date with the table assigned. The customer
// site renders this clickably so the user picks a table by tapping
// directly on the SVG.
router.get("/public/floor-plan", async (req, res) => {
  try {
    const venueId = String(req.query.venueId ?? "");
    const date = String(req.query.date ?? "");
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "date (YYYY-MM-DD) required" });
    }
    const [tableRows, sectionRows, dayReservations] = await Promise.all([
      db.select().from(tables).where(and(
        eq(tables.venueId, venueId),
        eq(tables.scope, "nightlife"),
      )),
      db.select().from(floorSections).where(and(
        eq(floorSections.venueId, venueId),
        eq(floorSections.scope, "nightlife"),
      )),
      db.select({ tableId: reservations.tableId, status: reservations.status })
        .from(reservations)
        .where(and(eq(reservations.venueId, venueId), eq(reservations.date, date))),
    ]);
    const bookedTableIds = new Set<string>();
    for (const r of dayReservations) {
      if (!r.tableId) continue;
      if (r.status === "cancelled" || r.status === "no_show") continue;
      bookedTableIds.add(r.tableId);
    }
    res.json({
      sections: sectionRows.map((s) => ({
        id: s.id, name: s.name, color: s.color, capacity: s.capacity,
      })),
      tables: tableRows.map((t) => ({
        id: t.id,
        sectionId: t.sectionId,
        label: t.label,
        capacity: t.capacity,
        x: parseFloat(t.x),
        y: parseFloat(t.y),
        width: parseFloat(t.width),
        height: parseFloat(t.height),
        shape: t.shape,
        rotation: t.rotation,
        price: t.price != null ? parseFloat(t.price) : null,
        booked: bookedTableIds.has(t.id),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load floor plan" });
  }
});

// ── Customer auth ────────────────────────────────────────────────────────
router.post("/public/customers/register", async (req, res) => {
  try {
    const { venueId, email, fullName, phone, password, marketingOptIn } = req.body ?? {};
    if (!venueId || !email || !fullName || !password) {
      return res.status(400).json({ message: "venueId, email, fullName, password required" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await db.select().from(customers).where(and(
      eq(customers.venueId, venueId),
      eq(customers.email, normalizedEmail),
    ));
    let customer = existing;
    if (existing) {
      if (existing.passwordHash) {
        return res.status(409).json({ message: "An account with this email already exists. Sign in instead." });
      }
      // Account was lazily created from a prior guest booking — promote
      // it by setting the password the user just chose.
      const [updated] = await db.update(customers).set({
        fullName: String(fullName).trim(),
        phone: phone ? String(phone).trim() : existing.phone,
        passwordHash: hashPassword(password),
        marketingOptIn: !!marketingOptIn,
      }).where(eq(customers.id, existing.id)).returning();
      customer = updated;
    } else {
      const [created] = await db.insert(customers).values({
        venueId, email: normalizedEmail, fullName: String(fullName).trim(),
        phone: phone ? String(phone).trim() : null,
        passwordHash: hashPassword(password),
        marketingOptIn: !!marketingOptIn,
      }).returning();
      customer = created;
    }
    const session = await createCustomerSession(customer.id, venueId);
    res.status(201).json({
      customer: {
        id: customer.id, email: customer.email, fullName: customer.fullName,
        phone: customer.phone, venueId: customer.venueId,
      },
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/public/customers/login", async (req, res) => {
  try {
    const { venueId, email, password } = req.body ?? {};
    if (!venueId || !email || !password) {
      return res.status(400).json({ message: "venueId, email, password required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const [customer] = await db.select().from(customers).where(and(
      eq(customers.venueId, venueId),
      eq(customers.email, normalizedEmail),
    ));
    if (!customer || !verifyPassword(password, customer.passwordHash)) {
      return res.status(401).json({ message: "Wrong email or password" });
    }
    const session = await createCustomerSession(customer.id, venueId);
    res.json({
      customer: {
        id: customer.id, email: customer.email, fullName: customer.fullName,
        phone: customer.phone, venueId: customer.venueId,
      },
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/public/customers/logout", requireCustomer, async (req, res) => {
  try {
    const header = req.header("authorization") ?? "";
    await deleteCustomerSession(header.slice(7).trim());
    res.json({ message: "Signed out" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Logout failed" });
  }
});

router.get("/public/customers/me", requireCustomer, async (req, res) => {
  try {
    const [customer] = await db.select({
      id: customers.id, email: customers.email, fullName: customers.fullName,
      phone: customers.phone, venueId: customers.venueId,
    }).from(customers).where(eq(customers.id, req.customer!.customerId));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load customer" });
  }
});

// ── Bookings (reservations created via the public site) ─────────────────
// Both authenticated customers AND walk-up guests can create a booking.
// Guests don't supply a session token; we create a placeholder customer
// row so the booking can still be tied to an email + name and so the
// guest can later claim the row by registering a password.
router.post("/public/bookings", async (req, res) => {
  try {
    const {
      venueId, eventId, tableId, partySize, date, time, durationMinutes,
      guestName, guestEmail, guestPhone, notes, depositAmount,
    } = req.body ?? {};
    if (!venueId || !partySize || !date || !time || !guestName || !guestEmail) {
      return res.status(400).json({
        message: "venueId, partySize, date, time, guestName, guestEmail required",
      });
    }
    const sizeNum = Number(partySize);
    if (!Number.isFinite(sizeNum) || sizeNum < 1) {
      return res.status(400).json({ message: "Invalid party size" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ message: "time must be HH:MM" });
    }
    // Defend against double-booking the same table on the same night —
    // the floor-availability endpoint hides taken tables, but a stale
    // client may still try.
    if (tableId) {
      const conflict = await db.select({ id: reservations.id })
        .from(reservations)
        .where(and(
          eq(reservations.venueId, venueId),
          eq(reservations.date, date),
          eq(reservations.tableId, String(tableId)),
        ));
      const isBlocked = conflict.some((_) => true);
      if (isBlocked) {
        return res.status(409).json({ message: "That table is no longer available for the chosen night." });
      }
    }
    // Resolve / lazily create a customer row for the email so we can
    // tie payment records and future logins to the same identity.
    const normalizedEmail = String(guestEmail).trim().toLowerCase();
    const [existingCustomer] = await db.select().from(customers).where(and(
      eq(customers.venueId, venueId),
      eq(customers.email, normalizedEmail),
    ));
    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const [created] = await db.insert(customers).values({
        venueId, email: normalizedEmail, fullName: String(guestName).trim(),
        phone: guestPhone ? String(guestPhone).trim() : null,
        passwordHash: null, marketingOptIn: false,
      }).returning({ id: customers.id });
      customerId = created.id;
    }
    let kind: "dining" | "nightlife" | "event" = "nightlife";
    if (eventId) kind = "event";
    const code = generateConfirmationCode();
    const deposit = depositAmount != null ? String(depositAmount) : "0";
    const [booking] = await db.insert(reservations).values({
      venueId,
      guestName: String(guestName).trim(),
      guestEmail: normalizedEmail,
      guestPhone: guestPhone ? String(guestPhone).trim() : null,
      partySize: Math.round(sizeNum),
      date, time,
      durationMinutes: durationMinutes ? Math.max(30, Math.round(Number(durationMinutes))) : 180,
      tableId: tableId ? String(tableId) : null,
      eventId: eventId ? String(eventId) : null,
      customerId,
      kind,
      depositAmount: deposit,
      depositPaid: false,
      status: "pending",
      source: "public-site",
      notes: notes ? String(notes) : null,
      confirmationCode: code,
    }).returning();
    res.status(201).json({
      ...booking,
      depositAmount: parseFloat(booking.depositAmount),
      totalAmount: booking.totalAmount != null ? parseFloat(booking.totalAmount) : null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Booking failed" });
  }
});

// Mock payment processor. Real Stripe / Square wiring would replace the
// "succeeded" branch with a webhook-driven flow; for now we accept the
// charge inline and flip the reservation's deposit_paid flag so the
// customer site immediately reflects "Paid" and the manager dashboard
// shows the green check.
router.post("/public/bookings/:id/pay-deposit", async (req, res) => {
  try {
    const id = String(req.params.id);
    const { provider = "mock", amount, providerRef } = req.body ?? {};
    const [booking] = await db.select().from(reservations).where(eq(reservations.id, id));
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.depositPaid) return res.status(409).json({ message: "Deposit already paid" });
    const amt = amount != null ? Number(amount) : parseFloat(booking.depositAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    // Insert the payment row first so we have a paper trail even if the
    // booking update races something else.
    const [payment] = await db.insert(payments).values({
      venueId: booking.venueId,
      reservationId: booking.id,
      customerId: booking.customerId ?? null,
      kind: "deposit",
      amount: String(amt),
      provider: String(provider),
      providerRef: providerRef ? String(providerRef) : `mock_${Date.now()}`,
      status: "succeeded",
    }).returning();
    await db.update(reservations).set({
      depositPaid: true,
      status: "confirmed",
    }).where(eq(reservations.id, booking.id));
    res.json({
      payment: { ...payment, amount: parseFloat(payment.amount) },
      booking: { id: booking.id, depositPaid: true, status: "confirmed" },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Payment failed" });
  }
});

// Lookup a single booking by its short confirmation code — used by guests
// who booked without registering. Returns a sanitized view (no other
// guest's PII).
router.get("/public/bookings/by-code/:code", async (req, res) => {
  try {
    const code = String(req.params.code).toUpperCase();
    const [booking] = await db.select().from(reservations).where(eq(reservations.confirmationCode, code));
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json(sanitizeBooking(booking));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Lookup failed" });
  }
});

// Authenticated customer dashboard — list every booking tied to the
// signed-in customer record, newest first.
router.get("/public/bookings/mine", requireCustomer, async (req, res) => {
  try {
    const list = await db.select().from(reservations)
      .where(eq(reservations.customerId, req.customer!.customerId))
      .orderBy(desc(reservations.createdAt));
    res.json(list.map(sanitizeBooking));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load bookings" });
  }
});

router.post("/public/bookings/:id/cancel", requireCustomer, async (req, res) => {
  try {
    const id = String(req.params.id);
    const [booking] = await db.select().from(reservations).where(eq(reservations.id, id));
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.customerId !== req.customer!.customerId) {
      return res.status(403).json({ message: "Not your booking" });
    }
    if (booking.status === "cancelled") return res.json(sanitizeBooking(booking));
    if (booking.status === "seated" || booking.status === "completed") {
      return res.status(409).json({ message: "Booking is in progress and can't be cancelled online" });
    }
    const [updated] = await db.update(reservations).set({ status: "cancelled" })
      .where(eq(reservations.id, id)).returning();
    res.json(sanitizeBooking(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Cancel failed" });
  }
});

function sanitizeBooking(b: typeof reservations.$inferSelect) {
  return {
    id: b.id,
    venueId: b.venueId,
    eventId: b.eventId,
    tableId: b.tableId,
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestPhone: b.guestPhone,
    partySize: b.partySize,
    date: b.date,
    time: b.time,
    durationMinutes: b.durationMinutes,
    status: b.status,
    kind: b.kind,
    notes: b.notes,
    depositAmount: parseFloat(b.depositAmount),
    depositPaid: b.depositPaid,
    totalAmount: b.totalAmount != null ? parseFloat(b.totalAmount) : null,
    confirmationCode: b.confirmationCode,
    createdAt: b.createdAt,
  };
}

export default router;
