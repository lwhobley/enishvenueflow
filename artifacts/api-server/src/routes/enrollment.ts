import { Router, type IRouter } from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { db, venues, users, roles, ENROLLABLE_POSITIONS, isEnrollablePosition } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireManagerForVenue } from "../middlewares/manager-auth";

const router: IRouter = Router();
const PIN_SALT = "enosh2024";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + PIN_SALT).digest("hex");
}

function newToken(): string {
  return randomBytes(24).toString("hex");
}

function sameToken(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Manager: fetch (or lazily create) the current enrollment token for a venue.
router.get("/venues/:venueId/enrollment-link", requireManagerForVenue, async (req, res) => {
  try {
    const { venueId } = req.params;
    const [venue] = await db.select().from(venues).where(eq(venues.id, venueId));
    if (!venue) return res.status(404).json({ message: "Venue not found" });

    let token = venue.enrollmentToken ?? null;
    if (!token) {
      token = newToken();
      await db.update(venues).set({ enrollmentToken: token }).where(eq(venues.id, venueId));
    }
    res.json({ venueId, token });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to fetch enrollment link" });
  }
});

// Manager: rotate — invalidates the old token and returns a new one.
router.post("/venues/:venueId/enrollment-link/rotate", requireManagerForVenue, async (req, res) => {
  try {
    const { venueId } = req.params;
    const token = newToken();
    const [updated] = await db
      .update(venues).set({ enrollmentToken: token })
      .where(eq(venues.id, venueId))
      .returning({ id: venues.id });
    if (!updated) return res.status(404).json({ message: "Venue not found" });
    res.json({ venueId, token });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to rotate enrollment link" });
  }
});

// Public: describe what the enrollment link leads to so the page can render
// the venue name and the allowed position list.
router.get("/enroll/:venueId/:token", async (req, res) => {
  try {
    const { venueId, token } = req.params;
    const [venue] = await db.select().from(venues).where(eq(venues.id, venueId));
    if (!venue || !venue.isActive) return res.status(404).json({ message: "Invalid enrollment link" });
    if (!venue.enrollmentToken || !sameToken(venue.enrollmentToken, token)) {
      return res.status(404).json({ message: "Invalid enrollment link" });
    }
    res.json({
      venueId: venue.id,
      venueName: venue.name,
      positions: ENROLLABLE_POSITIONS,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load enrollment link" });
  }
});

// Public: create the user account. isAdmin is forced false and the role is
// derived from the whitelisted position only — the client cannot grant
// itself manager/admin access regardless of what it sends.
router.post("/enroll/:venueId/:token", async (req, res) => {
  try {
    const { venueId, token } = req.params;
    const [venue] = await db.select().from(venues).where(eq(venues.id, venueId));
    if (!venue || !venue.isActive) return res.status(404).json({ message: "Invalid enrollment link" });
    if (!venue.enrollmentToken || !sameToken(venue.enrollmentToken, token)) {
      return res.status(404).json({ message: "Invalid enrollment link" });
    }

    const { fullName, email, phone, position, pin } = req.body ?? {};
    if (!fullName || String(fullName).trim().length < 2) {
      return res.status(400).json({ message: "Full name required" });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) {
      return res.status(400).json({ message: "A valid email is required" });
    }
    if (!isEnrollablePosition(position)) {
      return res.status(400).json({
        message: `Position must be one of: ${ENROLLABLE_POSITIONS.join(", ")}`,
      });
    }
    const pinStr = String(pin ?? "");
    if (!/^\d{4,8}$/.test(pinStr)) {
      return res.status(400).json({ message: "PIN must be 4–8 digits" });
    }

    const pinHash = hashPin(pinStr);
    const [pinCollision] = await db.select({ id: users.id }).from(users).where(eq(users.pinHash, pinHash));
    if (pinCollision) {
      return res.status(409).json({ message: "That PIN is already taken — please pick another" });
    }

    // Email uniqueness per venue: a manager-loaded hire (hires-loader) or an
    // earlier enrollment may already have created this user. Reject instead
    // of silently creating a duplicate row.
    const emailNormalized = String(email).trim().toLowerCase();
    const [emailCollision] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.venueId, venue.id), eq(users.email, emailNormalized)));
    if (emailCollision) {
      return res.status(409).json({
        message: "An account with that email already exists for this venue. Ask your manager to reset your PIN.",
      });
    }

    // Best-effort match to an existing role with the same name so the user
    // shows up correctly in the roster. If no role matches we leave roleId
    // null — they'll still appear with their position set.
    const venueRoles = await db.select().from(roles).where(eq(roles.venueId, venueId));
    const positionLower = String(position).toLowerCase();
    const matchedRole = venueRoles.find((r) => r.name.toLowerCase() === positionLower) ?? null;

    const [created] = await db.insert(users).values({
      venueId: venue.id,
      fullName: String(fullName).trim(),
      email: emailNormalized,
      phone: phone ? String(phone).trim() : null,
      roleId: matchedRole?.id ?? null,
      positions: [positionLower],
      isAdmin: false,
      isActive: true,
      pinHash,
    }).returning({ id: users.id, fullName: users.fullName });

    res.status(201).json({
      id: created.id,
      fullName: created.fullName,
      venueId: venue.id,
      venueName: venue.name,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Enrollment failed" });
  }
});

export default router;
