import { Router } from "express";
import { db } from "@workspace/db";
import { reservations, waitlistEntries, tables } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

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
      }>;
    };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "reservations[] required" });

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

export default router;
