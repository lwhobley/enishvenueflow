import { Router } from "express";
import { db } from "@workspace/db";
import { floorSections, tables, chairs } from "@workspace/db";
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
    const { venueId, sectionId, label, capacity, x = 0, y = 0, width = 80, height = 80, shape = "square", rotation = 0 } = req.body;
    if (!venueId || !sectionId || !label || !capacity) {
      return res.status(400).json({ message: "venueId, sectionId, label, capacity required" });
    }
    const [table] = await db.insert(tables).values({
      venueId, sectionId, label, capacity,
      x: String(x), y: String(y), width: String(width), height: String(height), shape,
      rotation: Number(rotation) || 0,
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
    const { label, capacity, status, x, y, width, height, shape, rotation } = req.body;
    if (label !== undefined) updates.label = label;
    if (capacity !== undefined) updates.capacity = capacity;
    if (status !== undefined) updates.status = status;
    if (x !== undefined) updates.x = String(x);
    if (y !== undefined) updates.y = String(y);
    if (width !== undefined) updates.width = String(width);
    if (height !== undefined) updates.height = String(height);
    if (shape !== undefined) updates.shape = shape;
    if (rotation !== undefined) updates.rotation = Number(rotation) || 0;
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

router.post("/floor-layout/seed", async (req, res) => {
  try {
    const { venueId, sections: sectionDefs, tables: tableDefs, chairs: chairDefs } = req.body;
    if (!venueId) return res.status(400).json({ message: "venueId required" });

    await db.delete(chairs).where(eq(chairs.venueId, venueId));
    await db.delete(tables).where(eq(tables.venueId, venueId));
    await db.delete(floorSections).where(eq(floorSections.venueId, venueId));

    const sectionIdMap: Record<string, string> = {};
    for (const sec of sectionDefs) {
      const [s] = await db
        .insert(floorSections)
        .values({ venueId, name: sec.name, capacity: 0, color: sec.color ?? "#6366f1" })
        .returning();
      sectionIdMap[sec.key] = s.id;
    }

    for (const t of tableDefs) {
      await db.insert(tables).values({
        venueId,
        sectionId: sectionIdMap[t.sectionKey],
        label: t.label,
        capacity: t.capacity,
        x: String(t.x),
        y: String(t.y),
        width: String(t.w),
        height: String(t.h),
      });
    }

    if (chairDefs?.length) {
      await db.insert(chairs).values(
        chairDefs.map((c: { x: number; y: number }) => ({
          venueId,
          x: String(c.x),
          y: String(c.y),
        }))
      );
    }

    res.json({ message: "Layout seeded", tables: tableDefs.length, chairs: chairDefs?.length ?? 0 });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to seed layout" });
  }
});

function formatChair(c: typeof chairs.$inferSelect) {
  return {
    ...c,
    x: parseFloat(c.x),
    y: parseFloat(c.y),
    width:  parseFloat(c.width),
    height: parseFloat(c.height),
  };
}

router.get("/chairs", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const all = await db.select().from(chairs).where(eq(chairs.venueId, venueId));
    res.json(all.map(formatChair));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list chairs" });
  }
});

router.post("/chairs", async (req, res) => {
  try {
    const { venueId, x = 0, y = 0, rotation = 0 } = req.body;
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const [chair] = await db.insert(chairs).values({
      venueId, x: String(x), y: String(y), rotation: Number(rotation) || 0,
    }).returning();
    res.status(201).json(formatChair(chair));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create chair" });
  }
});

router.put("/chairs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { x, y, width, height, rotation } = req.body;
    const updates: Record<string, unknown> = {};
    if (x !== undefined) updates.x = String(x);
    if (y !== undefined) updates.y = String(y);
    if (width  !== undefined) updates.width  = String(width);
    if (height !== undefined) updates.height = String(height);
    if (rotation !== undefined) updates.rotation = Number(rotation) || 0;
    const [updated] = await db.update(chairs).set(updates).where(eq(chairs.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Chair not found" });
    res.json(formatChair(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update chair" });
  }
});

router.delete("/chairs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(chairs).where(eq(chairs.id, id));
    res.json({ message: "Chair deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete chair" });
  }
});

export default router;
