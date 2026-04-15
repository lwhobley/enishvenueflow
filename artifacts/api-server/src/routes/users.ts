import { Router } from "express";
import { db } from "@workspace/db";
import { users, roles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

const router = Router();
const PIN_SALT = "enosh2024";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + PIN_SALT).digest("hex");
}

function mapUser(u: typeof users.$inferSelect, roleMap: Record<string, { name: string; color: string }>) {
  return {
    id: u.id,
    venueId: u.venueId,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone ?? null,
    dateOfBirth: u.dateOfBirth ?? null,
    address: u.address ?? null,
    roleId: u.roleId ?? null,
    roleName: u.roleId ? (roleMap[u.roleId]?.name ?? null) : null,
    roleColor: u.roleId ? (roleMap[u.roleId]?.color ?? null) : null,
    positions: (u.positions as string[]) ?? [],
    isAdmin: u.isAdmin,
    isActive: u.isActive,
    avatarUrl: u.avatarUrl ?? null,
    hireDate: u.hireDate ?? null,
    hourlyRate: u.hourlyRate ? parseFloat(u.hourlyRate) : null,
    externalId: u.externalId ?? null,
    createdAt: u.createdAt,
  };
}

router.get("/users", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const [allUsers, allRoles] = await Promise.all([
      db.select().from(users).where(eq(users.venueId, venueId)),
      db.select().from(roles).where(eq(roles.venueId, venueId)),
    ]);
    const roleMap = Object.fromEntries(allRoles.map(r => [r.id, r])) as Record<string, { name: string; color: string }>;
    res.json(allUsers.map(u => mapUser(u, roleMap)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list users" });
  }
});

router.post("/users", async (req, res) => {
  try {
    const {
      venueId, fullName, email, phone, dateOfBirth, address,
      roleId, positions, isAdmin = false, hireDate, hourlyRate, pin,
    } = req.body;
    if (!venueId || !fullName) return res.status(400).json({ message: "venueId and fullName required" });

    const [user] = await db.insert(users).values({
      venueId,
      fullName,
      email: email || "",
      phone: phone ?? null,
      dateOfBirth: dateOfBirth ?? null,
      address: address ?? null,
      roleId: roleId ?? null,
      positions: positions ?? [],
      isAdmin,
      hireDate: hireDate ?? null,
      hourlyRate: hourlyRate != null ? String(hourlyRate) : null,
      pinHash: pin ? hashPin(String(pin)) : null,
    }).returning();

    const allRoles = await db.select().from(roles).where(eq(roles.venueId, venueId));
    const roleMap = Object.fromEntries(allRoles.map(r => [r.id, r])) as Record<string, { name: string; color: string }>;
    res.status(201).json(mapUser(user, roleMap));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create user" });
  }
});

router.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName, email, phone, dateOfBirth, address,
      roleId, positions, isAdmin, isActive, hireDate, hourlyRate, avatarUrl, pin,
    } = req.body;

    const updates: Record<string, unknown> = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;
    if (address !== undefined) updates.address = address;
    if (roleId !== undefined) updates.roleId = roleId;
    if (positions !== undefined) updates.positions = positions;
    if (isAdmin !== undefined) updates.isAdmin = isAdmin;
    if (isActive !== undefined) updates.isActive = isActive;
    if (hireDate !== undefined) updates.hireDate = hireDate;
    if (hourlyRate !== undefined) updates.hourlyRate = hourlyRate != null ? String(hourlyRate) : null;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (pin !== undefined && pin !== "") updates.pinHash = hashPin(String(pin));

    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "User not found" });

    const allRoles = await db.select().from(roles).where(eq(roles.venueId, updated.venueId));
    const roleMap = Object.fromEntries(allRoles.map(r => [r.id, r])) as Record<string, { name: string; color: string }>;
    res.json(mapUser(updated, roleMap));
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
