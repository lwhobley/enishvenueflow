import { Router } from "express";
import { db } from "@workspace/db";
import { users, roles, loadHires } from "@workspace/db";
import { eq, and, ne, or } from "drizzle-orm";
import { hashPin, lookupHashes } from "@workspace/db";
import { requireManagerForVenue } from "../middlewares/manager-auth";

const router = Router();

// Refuse before storing a hash whose plaintext PIN would collide with
// another active user's. Sign-in matches either the new scrypt hash or
// the legacy SHA-256 hash, so a collision in either format means
// /auth/pin would be ambiguous.
async function isPinTaken(plaintextPin: string, exceptUserId?: string): Promise<boolean> {
  const { newHash, legacyHash } = lookupHashes(plaintextPin);
  const matchHash = or(eq(users.pinHash, newHash), eq(users.pinHash, legacyHash));
  const where = exceptUserId ? and(matchHash, ne(users.id, exceptUserId)) : matchHash;
  const [collision] = await db.select({ id: users.id }).from(users).where(where);
  return !!collision;
}

function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,8}$/.test(pin);
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

    let pinHash: string | null = null;
    if (pin !== undefined && pin !== null && pin !== "") {
      if (!isValidPin(String(pin))) {
        return res.status(400).json({ message: "PIN must be 4–8 digits" });
      }
      if (await isPinTaken(String(pin))) {
        return res.status(409).json({ message: "That PIN is already in use — pick another" });
      }
      pinHash = hashPin(String(pin));
    }

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
      pinHash,
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
    if (pin !== undefined && pin !== "") {
      if (!isValidPin(String(pin))) {
        return res.status(400).json({ message: "PIN must be 4–8 digits" });
      }
      if (await isPinTaken(String(pin), id)) {
        return res.status(409).json({ message: "That PIN is already in use — pick another" });
      }
      updates.pinHash = hashPin(String(pin));
    }

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

// Manager-only: re-run loadHires() against the venue. Same logic that runs
// at api-server boot — upserts the roster (`lib/db/src/hires-roster.ts`),
// re-activates any soft-deleted hire, and inserts anyone who's been
// hard-deleted. Intended for the case where staff get accidentally
// removed and a manager needs them back without waiting for the next
// deploy.
router.post("/users/reload-roster", requireManagerForVenue, async (req, res) => {
  try {
    const venueId = (req.body?.venueId as string | undefined) ?? req.auth?.venueId;
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const results = await loadHires({ venueId });
    const inserted = results.filter((r) => r.action === "inserted").length;
    const updated  = results.filter((r) => r.action === "updated").length;
    const skipped  = results.filter((r) => r.action === "skipped_no_change").length;
    const collisions = results.filter((r) => r.action === "skipped_pin_collision");
    res.json({
      ok: true,
      inserted,
      updated,
      skipped,
      collisions: collisions.map((c) => ({ name: c.hire.fullName, detail: c.detail })),
      total: results.length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to reload roster" });
  }
});

export default router;
