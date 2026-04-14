import { Router } from "express";
import { db } from "@workspace/db";
import { users, roles } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/users", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const allUsers = await db.select().from(users).where(eq(users.venueId, venueId));
    const allRoles = await db.select().from(roles).where(eq(roles.venueId, venueId));
    const roleMap = Object.fromEntries(allRoles.map(r => [r.id, r]));
    res.json(allUsers.map(u => ({
      id: u.id,
      venueId: u.venueId,
      fullName: u.fullName,
      email: u.email,
      roleId: u.roleId ?? null,
      roleName: u.roleId ? (roleMap[u.roleId]?.name ?? null) : null,
      roleColor: u.roleId ? (roleMap[u.roleId]?.color ?? null) : null,
      isAdmin: u.isAdmin,
      isActive: u.isActive,
      avatarUrl: u.avatarUrl ?? null,
      hireDate: u.hireDate ?? null,
      hourlyRate: u.hourlyRate ? parseFloat(u.hourlyRate) : null,
      createdAt: u.createdAt,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list users" });
  }
});

router.post("/users", async (req, res) => {
  try {
    const { venueId, fullName, email, roleId, isAdmin = false, hireDate, hourlyRate } = req.body;
    if (!venueId || !fullName || !email) return res.status(400).json({ message: "venueId, fullName, email required" });
    const [user] = await db.insert(users).values({
      venueId, fullName, email, roleId, isAdmin,
      hireDate: hireDate ?? null,
      hourlyRate: hourlyRate != null ? String(hourlyRate) : null,
    }).returning();
    res.status(201).json({ ...user, hourlyRate: user.hourlyRate ? parseFloat(user.hourlyRate) : null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create user" });
  }
});

router.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, roleId, isAdmin, isActive, hireDate, hourlyRate, avatarUrl } = req.body;
    const updates: Record<string, unknown> = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (email !== undefined) updates.email = email;
    if (roleId !== undefined) updates.roleId = roleId;
    if (isAdmin !== undefined) updates.isAdmin = isAdmin;
    if (isActive !== undefined) updates.isActive = isActive;
    if (hireDate !== undefined) updates.hireDate = hireDate;
    if (hourlyRate !== undefined) updates.hourlyRate = String(hourlyRate);
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json({ ...updated, hourlyRate: updated.hourlyRate ? parseFloat(updated.hourlyRate) : null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update user" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.update(users).set({ isActive: false }).where(eq(users.id, id));
    res.json({ message: "User deactivated" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to deactivate user" });
  }
});

export default router;
