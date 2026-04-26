import { Router } from "express";
import { db } from "@workspace/db";
import { floorSections, tables, chairs } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

// Floor plans split into independent layouts per venue. Anything that
// isn't an explicit known scope falls back to "restaurant" so legacy
// callers (and the employee floor view) keep working.
type Scope = "restaurant" | "nightlife";
function normalizeScope(raw: unknown): Scope {
  return raw === "nightlife" ? "nightlife" : "restaurant";
}

function formatTable(t: typeof tables.$inferSelect, sectionName?: string | null) {
  return {
    ...t,
    x: parseFloat(t.x),
    y: parseFloat(t.y),
    width: parseFloat(t.width),
    height: parseFloat(t.height),
    price: t.price != null ? parseFloat(t.price) : null,
    purchaserName: t.purchaserName ?? null,
    sectionName: sectionName ?? null,
  };
}

router.get("/floor-sections", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const scope = normalizeScope(req.query.scope);
    const all = await db.select().from(floorSections).where(and(
      eq(floorSections.venueId, venueId),
      eq(floorSections.scope, scope),
    ));
    res.json(all);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list floor sections" });
  }
});

router.post("/floor-sections", async (req, res) => {
  try {
    const { venueId, name, capacity, color = "#6366f1", assignedUserId } = req.body;
    if (!venueId || !name) return res.status(400).json({ message: "venueId and name required" });
    const scope = normalizeScope(req.body.scope);
    const [section] = await db.insert(floorSections).values({
      venueId, name, capacity: capacity ?? 0, color, scope,
      assignedUserId: assignedUserId || null,
    }).returning();
    res.status(201).json(section);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create section" });
  }
});

router.put("/floor-sections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, capacity, assignedUserId } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (color !== undefined) updates.color = String(color);
    if (capacity !== undefined) {
      const n = Math.round(Number(capacity));
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "capacity must be a non-negative integer" });
      updates.capacity = n;
    }
    // Clear with null or empty string; otherwise persist the user id.
    if (assignedUserId !== undefined) {
      updates.assignedUserId = assignedUserId === null || assignedUserId === "" ? null : String(assignedUserId);
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "Nothing to update" });
    const [updated] = await db.update(floorSections).set(updates).where(eq(floorSections.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Section not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update section" });
  }
});

router.delete("/floor-sections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Refuse to delete a section that still has tables — the manager should
    // reassign or remove those tables first so we don't orphan them.
    const inUse = await db.select({ id: tables.id }).from(tables).where(eq(tables.sectionId, id));
    if (inUse.length > 0) {
      return res.status(400).json({
        message: `Cannot delete section: ${inUse.length} table${inUse.length === 1 ? "" : "s"} still assigned. Move them to another section first.`,
        tableCount: inUse.length,
      });
    }
    const deleted = await db.delete(floorSections).where(eq(floorSections.id, id)).returning();
    if (deleted.length === 0) return res.status(404).json({ message: "Section not found" });
    res.json({ message: "Section deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete section" });
  }
});

router.get("/tables", async (req, res) => {
  try {
    const { venueId, sectionId } = req.query as { venueId: string; sectionId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const scope = normalizeScope(req.query.scope);
    let query = db.select().from(tables).where(and(
      eq(tables.venueId, venueId),
      eq(tables.scope, scope),
    )).$dynamic();
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
    const scope = normalizeScope(req.body.scope);
    const [table] = await db.insert(tables).values({
      venueId, sectionId, label, capacity,
      x: String(x), y: String(y), width: String(width), height: String(height), shape,
      rotation: Number(rotation) || 0,
      scope,
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
    const { label, capacity, status, x, y, width, height, shape, rotation, price, purchaserName } = req.body;
    if (label !== undefined) updates.label = label;
    if (capacity !== undefined) updates.capacity = capacity;
    if (status !== undefined) updates.status = status;
    if (x !== undefined) updates.x = String(x);
    if (y !== undefined) updates.y = String(y);
    if (width !== undefined) updates.width = String(width);
    if (height !== undefined) updates.height = String(height);
    if (shape !== undefined) updates.shape = shape;
    if (rotation !== undefined) updates.rotation = Number(rotation) || 0;
    if (price !== undefined) {
      if (price === null || price === "") {
        updates.price = null;
      } else {
        const n = Number(price);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "price must be a non-negative number" });
        updates.price = String(n);
      }
    }
    if (purchaserName !== undefined) {
      updates.purchaserName = purchaserName === "" ? null : purchaserName;
    }
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

// POST /tables/renumber — relabels every table in the venue to T1, T2, …
// Sort order: parse a number out of the current label first (so existing
// numeric ordering is preserved when it's there), then fall back to
// position (x then y) so labels still come out left-to-right / top-down.
router.post("/tables/renumber", async (req, res) => {
  try {
    const { venueId } = req.body as { venueId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const scope = normalizeScope(req.body.scope);

    const all = await db.select().from(tables).where(and(
      eq(tables.venueId, venueId),
      eq(tables.scope, scope),
    ));
    const sorted = [...all].sort((a, b) => {
      const an = parseInt((a.label ?? "").match(/\d+/)?.[0] ?? "", 10);
      const bn = parseInt((b.label ?? "").match(/\d+/)?.[0] ?? "", 10);
      // Tables that already have a number sort by it first; non-numeric
      // labels (e.g. "BAR", "VIP") sort to the end.
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      if (Number.isFinite(an) !== Number.isFinite(bn)) return Number.isFinite(an) ? -1 : 1;
      const ax = parseFloat(a.x), bx = parseFloat(b.x);
      if (ax !== bx) return ax - bx;
      const ay = parseFloat(a.y), by = parseFloat(b.y);
      return ay - by;
    });

    await db.transaction(async (tx) => {
      for (let i = 0; i < sorted.length; i++) {
        await tx.update(tables).set({ label: `T${i + 1}` }).where(eq(tables.id, sorted[i].id));
      }
    });

    res.json({ message: "Tables renumbered", count: sorted.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to renumber tables" });
  }
});

// POST /floor-plan/copy — mirror every section, table, and chair from
// `fromScope` into `toScope`, preserving x/y/width/height/rotation/shape/
// label/capacity. Replaces whatever's currently in toScope. Sales data
// (price, purchaserName) intentionally does NOT carry over — those are
// per-event so the new layout starts unsold.
router.post("/floor-plan/copy", async (req, res) => {
  try {
    const { venueId } = req.body as { venueId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const fromScope = normalizeScope(req.body.fromScope);
    const toScope = normalizeScope(req.body.toScope);
    if (fromScope === toScope) {
      return res.status(400).json({ message: "fromScope and toScope must differ" });
    }

    const counts = await db.transaction(async (tx) => {
      // Wipe target scope so the copy is exact, not a merge.
      await tx.delete(chairs).where(and(eq(chairs.venueId, venueId), eq(chairs.scope, toScope)));
      await tx.delete(tables).where(and(eq(tables.venueId, venueId), eq(tables.scope, toScope)));
      await tx.delete(floorSections).where(and(eq(floorSections.venueId, venueId), eq(floorSections.scope, toScope)));

      // Sections need new ids. Build a map from old id → new id so the
      // tables we copy can re-point their sectionId at the duplicate.
      const srcSections = await tx.select().from(floorSections).where(and(
        eq(floorSections.venueId, venueId),
        eq(floorSections.scope, fromScope),
      ));
      const sectionIdMap = new Map<string, string>();
      for (const s of srcSections) {
        const [inserted] = await tx.insert(floorSections).values({
          venueId, name: s.name, capacity: s.capacity, color: s.color, scope: toScope,
        }).returning();
        sectionIdMap.set(s.id, inserted.id);
      }

      const srcTables = await tx.select().from(tables).where(and(
        eq(tables.venueId, venueId),
        eq(tables.scope, fromScope),
      ));
      let copiedTables = 0;
      if (srcTables.length > 0) {
        const rows = srcTables
          .map((t) => {
            const newSectionId = sectionIdMap.get(t.sectionId);
            if (!newSectionId) return null;
            return {
              venueId, sectionId: newSectionId,
              label: t.label, capacity: t.capacity, status: "available",
              x: t.x, y: t.y, width: t.width, height: t.height,
              shape: t.shape, rotation: t.rotation,
              price: null, purchaserName: null,
              scope: toScope,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (rows.length > 0) {
          const inserted = await tx.insert(tables).values(rows).returning();
          copiedTables = inserted.length;
        }
      }

      const srcChairs = await tx.select().from(chairs).where(and(
        eq(chairs.venueId, venueId),
        eq(chairs.scope, fromScope),
      ));
      let copiedChairs = 0;
      if (srcChairs.length > 0) {
        const inserted = await tx.insert(chairs).values(
          srcChairs.map((c) => ({
            venueId, x: c.x, y: c.y, width: c.width, height: c.height,
            rotation: c.rotation, scope: toScope,
          }))
        ).returning();
        copiedChairs = inserted.length;
      }

      return { sections: srcSections.length, tables: copiedTables, chairs: copiedChairs };
    });

    res.json({ message: "Floor plan copied", ...counts });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to copy floor plan" });
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
    const scope = normalizeScope(req.query.scope);
    const all = await db.select().from(chairs).where(and(
      eq(chairs.venueId, venueId),
      eq(chairs.scope, scope),
    ));
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
    const scope = normalizeScope(req.body.scope);
    const [chair] = await db.insert(chairs).values({
      venueId, x: String(x), y: String(y), rotation: Number(rotation) || 0, scope,
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
