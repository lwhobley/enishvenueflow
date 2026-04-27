import { Router } from "express";
import { db, events } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// Manager-side CRUD for events. The public booking site reads from the
// same `events` table via /public/events; this router is the write
// surface for the venue staff (gated by the global requireAuth +
// venue-scope middleware so each venue only sees its own).

router.get("/events", async (req, res) => {
  try {
    const venueId = String(req.query.venueId ?? "");
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const rows = await db.select().from(events).where(eq(events.venueId, venueId))
      .orderBy(desc(events.date), events.startTime);
    res.json(rows.map((e) => ({
      ...e,
      coverCharge: parseFloat(e.coverCharge),
      depositPerGuest: parseFloat(e.depositPerGuest),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list events" });
  }
});

router.post("/events", async (req, res) => {
  try {
    const {
      venueId, title, description, date, startTime, endTime,
      coverCharge, depositPerGuest, imageUrl, isPublished, capacity,
    } = req.body ?? {};
    if (!venueId || !title || !date || !startTime) {
      return res.status(400).json({ message: "venueId, title, date, startTime required" });
    }
    const [created] = await db.insert(events).values({
      venueId,
      title: String(title).trim(),
      description: description ? String(description) : null,
      date: String(date),
      startTime: String(startTime),
      endTime: endTime ? String(endTime) : null,
      coverCharge: String(coverCharge ?? 0),
      depositPerGuest: String(depositPerGuest ?? 0),
      imageUrl: imageUrl ? String(imageUrl) : null,
      isPublished: isPublished !== false,
      capacity: capacity != null ? Math.round(Number(capacity)) : null,
    }).returning();
    res.status(201).json({
      ...created,
      coverCharge: parseFloat(created.coverCharge),
      depositPerGuest: parseFloat(created.depositPerGuest),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create event" });
  }
});

router.put("/events/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const updates: Record<string, unknown> = {};
    const b = req.body ?? {};
    if (b.title !== undefined) updates.title = String(b.title).trim();
    if (b.description !== undefined) updates.description = b.description ? String(b.description) : null;
    if (b.date !== undefined) updates.date = String(b.date);
    if (b.startTime !== undefined) updates.startTime = String(b.startTime);
    if (b.endTime !== undefined) updates.endTime = b.endTime ? String(b.endTime) : null;
    if (b.coverCharge !== undefined) updates.coverCharge = String(b.coverCharge);
    if (b.depositPerGuest !== undefined) updates.depositPerGuest = String(b.depositPerGuest);
    if (b.imageUrl !== undefined) updates.imageUrl = b.imageUrl ? String(b.imageUrl) : null;
    if (b.isPublished !== undefined) updates.isPublished = !!b.isPublished;
    if (b.capacity !== undefined) updates.capacity = b.capacity != null ? Math.round(Number(b.capacity)) : null;
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "Nothing to update" });
    const [updated] = await db.update(events).set(updates).where(eq(events.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Event not found" });
    res.json({
      ...updated,
      coverCharge: parseFloat(updated.coverCharge),
      depositPerGuest: parseFloat(updated.depositPerGuest),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update event" });
  }
});

router.delete("/events/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const venueId = String(req.query.venueId ?? "");
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const deleted = await db.delete(events).where(and(
      eq(events.id, id), eq(events.venueId, venueId),
    )).returning();
    if (deleted.length === 0) return res.status(404).json({ message: "Event not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete event" });
  }
});

export default router;
