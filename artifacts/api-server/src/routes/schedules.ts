import { Router } from "express";
import { db } from "@workspace/db";
import { schedules } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/schedules", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const all = await db.select().from(schedules).where(eq(schedules.venueId, venueId)).orderBy(schedules.createdAt);
    res.json(all);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list schedules" });
  }
});

router.post("/schedules", async (req, res) => {
  try {
    const { venueId, weekStart, weekEnd } = req.body;
    if (!venueId || !weekStart || !weekEnd) return res.status(400).json({ message: "venueId, weekStart, weekEnd required" });
    const [schedule] = await db.insert(schedules).values({ venueId, weekStart, weekEnd }).returning();
    res.status(201).json(schedule);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create schedule" });
  }
});

router.put("/schedules/:id/publish", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(schedules).set({ status: "published" }).where(eq(schedules.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Schedule not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to publish schedule" });
  }
});


export default router;
