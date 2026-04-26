import { Router } from "express";
import { db } from "@workspace/db";
import { reservations, waitlistEntries, tables, floorSections } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { suggestTables, buildServerLoadMap } from "../lib/smart-assign";

const router = Router();

// Status values that occupy a table (used to size up the seated cohort
// for server-load balancing in suggestTables).
const SEATED_STATUSES = new Set(["seated"]);

router.get("/reservations", async (req, res) => {
  try {
    const { venueId, date } = req.query as { venueId: string; date?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    let query = db.select().from(reservations).where(eq(reservations.venueId, venueId)).$dynamic();
    if (date) query = query.where(and(eq(reservations.venueId, venueId), eq(reservations.date, date)));
    const all = await query.orderBy(reservations.createdAt);
    res.json(all);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list reservations" });
  }
});

router.post("/reservations", async (req, res) => {
  try {
    const { venueId, guestName, guestEmail, guestPhone, partySize, date, time, durationMinutes = 90, tableId, notes, source } = req.body;
    if (!venueId || !guestName || !partySize || !date || !time) {
      return res.status(400).json({ message: "venueId, guestName, partySize, date, time required" });
    }
    const [res_] = await db.insert(reservations).values({
      venueId, guestName, guestEmail: guestEmail ?? null, guestPhone: guestPhone ?? null,
      partySize, date, time, durationMinutes,
      tableId: tableId ?? null, notes: notes ?? null, source: source ?? null,
    }).returning();
    res.status(201).json(res_);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create reservation" });
  }
});

// POST /reservations/bulk — CSV-driven import. tableLabel is optional; when
// present we look up the table by venueId+label and stash its id. Rows that
// reference an unknown table label are still inserted (table left null) so a
// typo doesn't drop the whole row.
router.post("/reservations/bulk", async (req, res) => {
  try {
    const { venueId, reservations: rows } = req.body as {
      venueId?: string;
      reservations?: Array<{
        guestName?: string;
        guestEmail?: string | null;
        guestPhone?: string | null;
        partySize?: number;
        date?: string;
        time?: string;
        durationMinutes?: number;
        tableLabel?: string | null;
        notes?: string | null;
        status?: string | null;
      }>;
    };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "reservations[] required" });
    // Match the lifecycle endpoints' canonical statuses. Anything outside
    // this set falls back to "confirmed" since most imported reservations
    // are confirmed bookings exported from another tool.
    const ALLOWED_STATUS = new Set([
      "pending", "confirmed", "arrived", "seated", "completed", "cancelled", "no_show",
    ]);

    // Map any tableLabel strings → tableId once, instead of querying per row.
    const venueTables = await db.select({ id: tables.id, label: tables.label })
      .from(tables).where(eq(tables.venueId, venueId));
    const labelToId = new Map<string, string>();
    for (const t of venueTables) labelToId.set(t.label.trim().toLowerCase(), t.id);

    let inserted = 0;
    const errors: Array<{ row: number; reason: string }> = [];
    const toInsert: typeof reservations.$inferInsert[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const guestName = (r.guestName ?? "").trim();
      if (!guestName) { errors.push({ row: i + 1, reason: "Missing guest name" }); continue; }
      const partySize = Number(r.partySize);
      if (!Number.isFinite(partySize) || partySize < 1) {
        errors.push({ row: i + 1, reason: `Invalid party size: ${r.partySize}` });
        continue;
      }
      const date = (r.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push({ row: i + 1, reason: `Invalid date (need YYYY-MM-DD): ${r.date}` });
        continue;
      }
      const time = (r.time ?? "").trim();
      if (!/^\d{2}:\d{2}$/.test(time)) {
        errors.push({ row: i + 1, reason: `Invalid time (need HH:MM): ${r.time}` });
        continue;
      }

      const tableId = r.tableLabel
        ? labelToId.get(r.tableLabel.trim().toLowerCase()) ?? null
        : null;

      const status = r.status && ALLOWED_STATUS.has(r.status) ? r.status : "confirmed";

      toInsert.push({
        venueId,
        guestName,
        guestEmail: r.guestEmail?.trim() || null,
        guestPhone: r.guestPhone?.trim() || null,
        partySize: Math.round(partySize),
        date, time,
        durationMinutes: Number.isFinite(Number(r.durationMinutes)) && Number(r.durationMinutes) > 0
          ? Number(r.durationMinutes)
          : 90,
        tableId,
        notes: r.notes?.trim() || null,
        source: "csv-import",
        status,
      });
      inserted++;
    }

    if (toInsert.length > 0) {
      await db.insert(reservations).values(toInsert);
    }

    res.json({ inserted, errors, total: rows.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to import reservations" });
  }
});

router.put("/reservations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates: Record<string, unknown> = {};
    const fields = ["guestName", "guestEmail", "guestPhone", "partySize", "date", "time", "tableId", "status", "notes"];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    const [updated] = await db.update(reservations).set(updates).where(eq(reservations.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Reservation not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update reservation" });
  }
});

router.delete("/reservations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, id));
    res.json({ message: "Reservation cancelled" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to cancel reservation" });
  }
});

// Waitlist
router.get("/waitlist", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const all = await db.select().from(waitlistEntries).where(eq(waitlistEntries.venueId, venueId)).orderBy(waitlistEntries.createdAt);
    res.json(all);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list waitlist" });
  }
});

router.post("/waitlist", async (req, res) => {
  try {
    const { venueId, guestName, guestPhone, partySize, quotedWait, notes } = req.body;
    if (!venueId || !guestName || !partySize) return res.status(400).json({ message: "venueId, guestName, partySize required" });
    const [entry] = await db.insert(waitlistEntries).values({
      venueId, guestName, guestPhone: guestPhone ?? null,
      partySize, quotedWait: quotedWait ?? null, notes: notes ?? null,
    }).returning();
    res.status(201).json(entry);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to add to waitlist" });
  }
});

router.put("/waitlist/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, quotedWait, notes } = req.body;
    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (quotedWait !== undefined) updates.quotedWait = quotedWait;
    if (notes !== undefined) updates.notes = notes;
    const [updated] = await db.update(waitlistEntries).set(updates).where(eq(waitlistEntries.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Entry not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update waitlist entry" });
  }
});

// ── Host-stand lifecycle ────────────────────────────────────────────────────
// Each transition writes the matching timestamp on the reservation; the
// seat / complete transitions also flip the assigned table's status so
// the floor plan paints it correctly.

router.post("/reservations/:id/arrive", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(reservations)
      .set({ status: "arrived", arrivedAt: new Date() })
      .where(eq(reservations.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Reservation not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to mark arrived" });
  }
});

router.post("/reservations/:id/seat", async (req, res) => {
  try {
    const { id } = req.params;
    const { tableId: overrideTableId } = req.body as { tableId?: string };

    const [existing] = await db.select().from(reservations).where(eq(reservations.id, id));
    if (!existing) return res.status(404).json({ message: "Reservation not found" });

    const tableId = overrideTableId ?? existing.tableId;
    if (!tableId) return res.status(400).json({ message: "No table — pass tableId in body or pre-assign on the reservation" });

    // Single transaction so reservation + table flip together. If the
    // table flip fails (e.g. table was deleted), the reservation status
    // doesn't latch to "seated" without a corresponding seated table.
    const result = await db.transaction(async (tx) => {
      const [updatedRes] = await tx.update(reservations)
        .set({ status: "seated", seatedAt: new Date(), tableId })
        .where(eq(reservations.id, id)).returning();
      const [updatedTable] = await tx.update(tables)
        .set({ status: "seated", lastStatusAt: new Date() })
        .where(eq(tables.id, tableId)).returning();
      if (!updatedTable) throw new Error("Table not found");
      return { reservation: updatedRes, table: updatedTable };
    });

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to seat reservation" });
  }
});

router.post("/reservations/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.select().from(reservations).where(eq(reservations.id, id));
    if (!existing) return res.status(404).json({ message: "Reservation not found" });

    const result = await db.transaction(async (tx) => {
      const [updatedRes] = await tx.update(reservations)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(reservations.id, id)).returning();
      // Flip the seated table to dirty so the floor plan flags it for
      // the busser. If the reservation never had a tableId, skip — the
      // party was tracked but never seated.
      let updatedTable = null;
      if (existing.tableId) {
        const [tbl] = await tx.update(tables)
          .set({ status: "dirty", lastStatusAt: new Date() })
          .where(eq(tables.id, existing.tableId)).returning();
        updatedTable = tbl ?? null;
      }
      return { reservation: updatedRes, table: updatedTable };
    });

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to complete reservation" });
  }
});

router.post("/reservations/:id/no-show", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(reservations)
      .set({ status: "no_show" })
      .where(eq(reservations.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Reservation not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to mark no-show" });
  }
});

// Smart-assign — returns the top 5 ranked tables for this reservation. The
// host stand fetches it on demand when the user opens the seat picker.
router.get("/reservations/:id/suggested-tables", async (req, res) => {
  try {
    const { id } = req.params;
    const [r] = await db.select().from(reservations).where(eq(reservations.id, id));
    if (!r) return res.status(404).json({ message: "Reservation not found" });

    // Pull the universe of tables + sections + active reservations for the
    // venue once. Smart-assign is pure — it just needs the snapshots.
    const [allTables, allSections, allRes] = await Promise.all([
      db.select().from(tables).where(eq(tables.venueId, r.venueId)),
      db.select().from(floorSections).where(eq(floorSections.venueId, r.venueId)),
      db.select().from(reservations).where(and(
        eq(reservations.venueId, r.venueId),
        eq(reservations.date, r.date),
      )),
    ]);

    const seated = allRes.filter((x) => SEATED_STATUSES.has(x.status));
    const serverLoad = buildServerLoadMap(
      seated.map((x) => ({ partySize: x.partySize, tableId: x.tableId })),
      allTables.map((t) => ({ id: t.id, sectionId: t.sectionId })),
      allSections.map((s) => ({ id: s.id, name: s.name, assignedUserId: s.assignedUserId })),
    );

    const suggestions = suggestTables(
      {
        partySize: r.partySize,
        date: r.date,
        time: r.time,
        durationMinutes: r.durationMinutes,
      },
      allTables.map((t) => ({
        id: t.id, label: t.label, capacity: t.capacity,
        sectionId: t.sectionId, status: t.status,
      })),
      // Exclude this reservation from the conflict set — it's the one we're seating.
      allRes.filter((x) => x.id !== id).map((x) => ({
        tableId: x.tableId,
        date: x.date, time: x.time,
        durationMinutes: x.durationMinutes,
        status: x.status,
      })),
      allSections.map((s) => ({ id: s.id, name: s.name, assignedUserId: s.assignedUserId })),
      serverLoad,
    );

    res.json(suggestions.slice(0, 5));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to compute suggestions" });
  }
});

// Convert a waitlist entry into a seated party in one call. Behind the
// scenes: create a reservation already in `seated` state at the requested
// table, mark the waitlist entry `seated`. Saves the host two clicks.
router.post("/waitlist/:id/seat", async (req, res) => {
  try {
    const { id } = req.params;
    const { tableId, durationMinutes = 90 } = req.body as { tableId?: string; durationMinutes?: number };
    if (!tableId) return res.status(400).json({ message: "tableId required" });

    const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, id));
    if (!entry) return res.status(404).json({ message: "Waitlist entry not found" });

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5);

    const result = await db.transaction(async (tx) => {
      const [reservation] = await tx.insert(reservations).values({
        venueId: entry.venueId,
        guestName: entry.guestName,
        guestPhone: entry.guestPhone,
        partySize: entry.partySize,
        date, time, durationMinutes,
        tableId,
        status: "seated",
        seatedAt: now,
        notes: entry.notes,
        source: "walk-in",
      }).returning();
      const [updatedTable] = await tx.update(tables)
        .set({ status: "seated", lastStatusAt: now })
        .where(eq(tables.id, tableId)).returning();
      if (!updatedTable) throw new Error("Table not found");
      const [updatedEntry] = await tx.update(waitlistEntries)
        .set({ status: "seated" })
        .where(eq(waitlistEntries.id, id)).returning();
      return { reservation, table: updatedTable, waitlist: updatedEntry };
    });

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to seat from waitlist" });
  }
});

export default router;
