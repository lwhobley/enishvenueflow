import { Router } from "express";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const SALT = "enosh2024";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + SALT).digest("hex");
}

router.post("/auth/pin", async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || String(pin).length !== 4 || !/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ message: "PIN must be exactly 4 digits" });
    }
    const hash = hashPin(String(pin));
    const [user] = await db.select().from(users).where(eq(users.pinHash, hash));
    if (!user) return res.status(401).json({ message: "Incorrect PIN" });
    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      venueId: user.venueId,
      isAdmin: user.isAdmin,
      roleId: user.roleId ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Auth error" });
  }
});

export default router;
