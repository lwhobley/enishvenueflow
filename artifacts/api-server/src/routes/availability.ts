import { Router } from "express";
import { db } from "@workspace/db";
import { availability } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /availability?userId=&venueId=
router.get("/availability", async (req, res) => {
  try {
    const { userId, venueId } = req.query as { userId: string; venueId: string };
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });
    const rows = await db.select().from(availability)
      .where(and(eq(availability.userId, userId), eq(availability.venueId, venueId)));
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to fetch availability" });
  }
});

// GET /availability/venue?venueId= — manager view: all employees' availability
router.get("/availability/venue", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const rows = await db.select().from(availability).where(eq(availability.venueId, venueId));
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to fetch venue availability" });
  }
});

// PUT /availability — upsert full weekly availability for a user
// Body: { userId, venueId, days: [{ dayOfWeek, isAvailable, startTime, endTime, notes }] }
router.put("/availability", async (req, res) => {
  try {
    const { userId, venueId, days } = req.body as {
      userId: string;
      venueId: string;
      days: Array<{
        dayOfWeek: number;
        isAvailable: boolean;
        startTime: string | null;
        endTime: string | null;
        notes?: string;
      }>;
    };

    if (!userId || !venueId || !Array.isArray(days)) {
      return res.status(400).json({ message: "userId, venueId, and days[] required" });
    }

    // Wipe + re-insert ONLY the recurring rules for this user/venue —
    // any one-off date overrides (rows where date IS NOT NULL) survive
    // this call so the weekly form doesn't silently drop them.
    await db.delete(availability).where(and(
      eq(availability.userId, userId),
      eq(availability.venueId, venueId),
      isNull(availability.date),
    ));

    if (days.length > 0) {
      await db.insert(availability).values(
        days.map((d) => ({
          userId,
          venueId,
          dayOfWeek: d.dayOfWeek,
          isAvailable: d.isAvailable,
          startTime: d.startTime || null,
          endTime: d.endTime || null,
          notes: d.notes || null,
          date: null,
        }))
      );
    }

    const updated = await db.select().from(availability)
      .where(and(eq(availability.userId, userId), eq(availability.venueId, venueId)));

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to save availability" });
  }
});

// ── Per-date overrides ──────────────────────────────────────────────────────
// PUT /availability/override — upsert a single-day override
// Body: { userId, venueId, date: "YYYY-MM-DD", isAvailable, startTime?, endTime?, notes? }
router.put("/availability/override", async (req, res) => {
  try {
    const { userId, venueId, date, isAvailable, startTime, endTime, notes } = req.body as {
      userId: string;
      venueId: string;
      date: string;
      isAvailable: boolean;
      startTime?: string | null;
      endTime?: string | null;
      notes?: string | null;
    };
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });
    if (!date || !DATE_RE.test(date)) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    if (typeof isAvailable !== "boolean") return res.status(400).json({ message: "isAvailable required" });

    const dow = new Date(`${date}T00:00:00`).getDay();

    // Manual upsert: drop any existing override on this exact (user, venue, date)
    // and insert fresh. Cleaner than ON CONFLICT against a partial index.
    await db.delete(availability).where(and(
      eq(availability.userId, userId),
      eq(availability.venueId, venueId),
      eq(availability.date, date),
    ));
    const [row] = await db.insert(availability).values({
      userId, venueId,
      dayOfWeek: dow,
      isAvailable,
      startTime: startTime || null,
      endTime: endTime || null,
      notes: notes || null,
      date,
    }).returning();
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to save override" });
  }
});

// DELETE /availability/override?userId=&venueId=&date=
router.delete("/availability/override", async (req, res) => {
  try {
    const { userId, venueId, date } = req.query as { userId?: string; venueId?: string; date?: string };
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });
    if (!date || !DATE_RE.test(date)) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    await db.delete(availability).where(and(
      eq(availability.userId, userId),
      eq(availability.venueId, venueId),
      eq(availability.date, date),
    ));
    res.json({ message: "Override removed" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to remove override" });
  }
});

export default router;
