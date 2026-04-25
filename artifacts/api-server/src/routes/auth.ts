import { Router } from "express";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { users, roles } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { createSession, deleteSession } from "../lib/sessions";

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

    // Issue a bearer session. The plaintext token is returned once here
    // and never persisted; the server keeps only the SHA-256 hash so a
    // leaked DB dump can't be replayed.
    const { token, expiresAt } = await createSession(user.id, user.venueId);

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
      // Session token — frontend stores this and sends as
      // `Authorization: Bearer <token>` on every API call.
      sessionToken: token,
      sessionExpiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Auth error" });
  }
});

// ── POST /auth/logout ──────────────────────────────────────────────────
// Invalidate the bearer token used to make this request. Idempotent —
// missing/invalid tokens just return ok so a stale client never traps
// the user in an error loop.
router.post("/auth/logout", async (req, res) => {
  try {
    const header = req.header("authorization") ?? "";
    if (header.toLowerCase().startsWith("bearer ")) {
      const token = header.slice(7).trim();
      if (token) await deleteSession(token);
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Logout failed" });
  }
});

// ── POST /auth/change-pin ─────────────────────────────────────────────
// Identity comes from req.auth (populated by requireAuth) — never from a
// caller-supplied userId. Requires the current PIN as a confirmation
// factor and refuses collisions with another user's PIN.
router.post("/auth/change-pin", async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    const { currentPin, newPin } = req.body ?? {};
    if (!/^\d{4,8}$/.test(String(currentPin ?? ""))) {
      return res.status(400).json({ message: "Current PIN must be 4–8 digits" });
    }
    if (!/^\d{4,8}$/.test(String(newPin ?? ""))) {
      return res.status(400).json({ message: "New PIN must be 4–8 digits" });
    }
    if (currentPin === newPin) {
      return res.status(400).json({ message: "New PIN must be different from current" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!user || !user.isActive) return res.status(404).json({ message: "Account not found" });

    const currentHash = hashPin(String(currentPin));
    if (!user.pinHash || user.pinHash !== currentHash) {
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }

    const newHash = hashPin(String(newPin));
    const [collision] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.pinHash, newHash), ne(users.id, user.id)));
    if (collision) {
      return res.status(409).json({ message: "That PIN is already in use — pick another" });
    }

    await db.update(users).set({ pinHash: newHash }).where(eq(users.id, user.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to change PIN" });
  }
});

export default router;
