import { Router } from "express";
import { db } from "@workspace/db";
import { roles } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/roles", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const all = await db.select().from(roles).where(eq(roles.venueId, venueId));
    res.json(all);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list roles" });
  }
});

router.post("/roles", async (req, res) => {
  try {
    const { venueId, name, color = "#6366f1", permissions = {} } = req.body;
    if (!venueId || !name) return res.status(400).json({ message: "venueId and name required" });
    const [role] = await db.insert(roles).values({ venueId, name, color, permissions }).returning();
    res.status(201).json(role);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create role" });
  }
});

router.put("/roles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, permissions } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;
    if (permissions !== undefined) updates.permissions = permissions;
    const [updated] = await db.update(roles).set(updates).where(eq(roles.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Role not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update role" });
  }
});

router.delete("/roles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(roles).where(eq(roles.id, id));
    res.json({ message: "Role deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete role" });
  }
});

export default router;
