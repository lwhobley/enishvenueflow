import { Router } from "express";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { users, roles } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const SALT = "enosh2024";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + SALT).digest("hex");
}

router.post("/auth/pin", async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(String(pin))) {
      return res.status(400).json({ message: "PIN must be 4–8 digits" });
    }
    const hash = hashPin(String(pin));
    const [user] = await db.select().from(users).where(eq(users.pinHash, hash));
    if (!user) return res.status(401).json({ message: "Incorrect PIN" });
    if (!user.isActive) return res.status(403).json({ message: "Account is inactive" });

    const allRoles = await db.select().from(roles).where(eq(roles.venueId, user.venueId));
    const roleMap = Object.fromEntries(allRoles.map(r => [r.id, r]));

    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? null,
      dateOfBirth: user.dateOfBirth ?? null,
      address: user.address ?? null,
      venueId: user.venueId,
      isAdmin: user.isAdmin,
      isActive: user.isActive,
      roleId: user.roleId ?? null,
      roleName: user.roleId ? (roleMap[user.roleId]?.name ?? null) : null,
      roleColor: user.roleId ? (roleMap[user.roleId]?.color ?? null) : null,
      positions: (user.positions as string[]) ?? [],
      hireDate: user.hireDate ?? null,
      hourlyRate: user.hourlyRate ? parseFloat(user.hourlyRate) : null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Auth error" });
  }
});

export default router;
