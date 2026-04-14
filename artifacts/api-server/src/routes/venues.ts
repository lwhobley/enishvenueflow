import { Router } from "express";
import { db } from "@workspace/db";
import { venues } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/venues", async (req, res) => {
  try {
    const all = await db.select().from(venues).orderBy(venues.createdAt);
    res.json(all.map(v => ({
      id: v.id,
      name: v.name,
      address: v.address,
      timezone: v.timezone,
      subscriptionTier: v.subscriptionTier,
      isActive: v.isActive,
      createdAt: v.createdAt,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list venues" });
  }
});

router.post("/venues", async (req, res) => {
  try {
    const { name, address, timezone = "America/New_York", subscriptionTier = "free" } = req.body;
    if (!name || !address) return res.status(400).json({ message: "name and address required" });
    const [venue] = await db.insert(venues).values({ name, address, timezone, subscriptionTier }).returning();
    res.status(201).json({ ...venue });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create venue" });
  }
});

router.put("/venues/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, timezone, subscriptionTier, isActive } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (timezone !== undefined) updates.timezone = timezone;
    if (subscriptionTier !== undefined) updates.subscriptionTier = subscriptionTier;
    if (isActive !== undefined) updates.isActive = isActive;
    const [updated] = await db.update(venues).set(updates).where(eq(venues.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Venue not found" });
    res.json({ ...updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update venue" });
  }
});

export default router;
