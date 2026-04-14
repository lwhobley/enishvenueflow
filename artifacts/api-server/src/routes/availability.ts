import { Router } from "express";
import { db } from "@workspace/db";
import { availability } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

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

    // Delete existing for this user/venue and re-insert
    await db.delete(availability).where(
      and(eq(availability.userId, userId), eq(availability.venueId, venueId))
    );

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

export default router;
