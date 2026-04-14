import { Router } from "express";
import { db } from "@workspace/db";
import { guests } from "@workspace/db";
import { eq, and, ilike, or } from "drizzle-orm";

const router = Router();

function formatGuest(g: typeof guests.$inferSelect) {
  return {
    ...g,
    totalSpent: g.totalSpent ? parseFloat(g.totalSpent) : 0,
    tags: Array.isArray(g.tags) ? g.tags : [],
  };
}

router.get("/guests", async (req, res) => {
  try {
    const { venueId, search, vipOnly } = req.query as { venueId: string; search?: string; vipOnly?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    let query = db.select().from(guests).where(eq(guests.venueId, venueId)).$dynamic();
    if (vipOnly === "true") query = query.where(and(eq(guests.venueId, venueId)));
    const all = await query.orderBy(guests.createdAt);
    let filtered = all;
    if (search) {
      const s = search.toLowerCase();
      filtered = all.filter(g =>
        g.fullName.toLowerCase().includes(s) ||
        (g.email ?? "").toLowerCase().includes(s) ||
        (g.phone ?? "").includes(s)
      );
    }
    if (vipOnly === "true") {
      filtered = filtered.filter(g => g.vipLevel > 0);
    }
    res.json(filtered.map(formatGuest));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list guests" });
  }
});

router.post("/guests", async (req, res) => {
  try {
    const { venueId, fullName, email, phone, birthday, tags = [], vipLevel = 0, notes } = req.body;
    if (!venueId || !fullName) return res.status(400).json({ message: "venueId and fullName required" });
    const [guest] = await db.insert(guests).values({
      venueId, fullName, email: email ?? null, phone: phone ?? null,
      birthday: birthday ?? null, tags, vipLevel, notes: notes ?? null,
    }).returning();
    res.status(201).json(formatGuest(guest));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create guest" });
  }
});

router.get("/guests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [guest] = await db.select().from(guests).where(eq(guests.id, id));
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    res.json(formatGuest(guest));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to get guest" });
  }
});

router.put("/guests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates: Record<string, unknown> = {};
    const fields = ["fullName", "email", "phone", "birthday", "tags", "vipLevel", "notes", "visitCount", "totalSpent"];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates[f] = f === "totalSpent" ? String(req.body[f]) : req.body[f];
      }
    }
    const [updated] = await db.update(guests).set(updates).where(eq(guests.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Guest not found" });
    res.json(formatGuest(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update guest" });
  }
});

router.delete("/guests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(guests).where(eq(guests.id, id));
    res.json({ message: "Guest deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete guest" });
  }
});

export default router;
