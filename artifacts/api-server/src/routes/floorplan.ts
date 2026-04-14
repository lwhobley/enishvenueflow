import { Router } from "express";
import { db } from "@workspace/db";
import { floorSections, tables } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function formatTable(t: typeof tables.$inferSelect, sectionName?: string | null) {
  return {
    ...t,
    x: parseFloat(t.x),
    y: parseFloat(t.y),
    width: parseFloat(t.width),
    height: parseFloat(t.height),
    sectionName: sectionName ?? null,
  };
}

router.get("/floor-sections", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const all = await db.select().from(floorSections).where(eq(floorSections.venueId, venueId));
    res.json(all);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list floor sections" });
  }
});

router.post("/floor-sections", async (req, res) => {
  try {
    const { venueId, name, capacity, color = "#6366f1" } = req.body;
    if (!venueId || !name) return res.status(400).json({ message: "venueId and name required" });
    const [section] = await db.insert(floorSections).values({ venueId, name, capacity: capacity ?? 0, color }).returning();
    res.status(201).json(section);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create section" });
  }
});

router.get("/tables", async (req, res) => {
  try {
    const { venueId, sectionId } = req.query as { venueId: string; sectionId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    let query = db.select().from(tables).where(eq(tables.venueId, venueId)).$dynamic();
    if (sectionId) query = query.where(eq(tables.sectionId, sectionId));
    const all = await query;
    const sections = await db.select().from(floorSections).where(eq(floorSections.venueId, venueId));
    const sectionMap = Object.fromEntries(sections.map(s => [s.id, s]));
    res.json(all.map(t => formatTable(t, sectionMap[t.sectionId]?.name)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list tables" });
  }
});

router.post("/tables", async (req, res) => {
  try {
    const { venueId, sectionId, label, capacity, x = 0, y = 0, width = 80, height = 80 } = req.body;
    if (!venueId || !sectionId || !label || !capacity) {
      return res.status(400).json({ message: "venueId, sectionId, label, capacity required" });
    }
    const [table] = await db.insert(tables).values({
      venueId, sectionId, label, capacity,
      x: String(x), y: String(y), width: String(width), height: String(height),
    }).returning();
    res.status(201).json(formatTable(table));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create table" });
  }
});

router.put("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates: Record<string, unknown> = {};
    const { label, capacity, status, x, y, width, height } = req.body;
    if (label !== undefined) updates.label = label;
    if (capacity !== undefined) updates.capacity = capacity;
    if (status !== undefined) updates.status = status;
    if (x !== undefined) updates.x = String(x);
    if (y !== undefined) updates.y = String(y);
    if (width !== undefined) updates.width = String(width);
    if (height !== undefined) updates.height = String(height);
    const [updated] = await db.update(tables).set(updates).where(eq(tables.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Table not found" });
    res.json(formatTable(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update table" });
  }
});

router.delete("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(tables).where(eq(tables.id, id));
    res.json({ message: "Table deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete table" });
  }
});

export default router;
