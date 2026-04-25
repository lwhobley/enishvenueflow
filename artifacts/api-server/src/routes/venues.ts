import { Router } from "express";
import { db } from "@workspace/db";
import { venues } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function serializeVenue(v: typeof venues.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    address: v.address,
    timezone: v.timezone,
    subscriptionTier: v.subscriptionTier,
    isActive: v.isActive,
    latitude: v.latitude != null ? Number(v.latitude) : null,
    longitude: v.longitude != null ? Number(v.longitude) : null,
    clockInRadiusFeet: v.clockInRadiusFeet ?? null,
    createdAt: v.createdAt,
  };
}

// Single-venue app: every authed caller is scoped to their own venue. The
// list endpoint returns a one-element array (kept as an array so the
// generated client and React Query keys don't have to change).
router.get("/venues", async (req, res) => {
  try {
    const venueId = req.auth?.venueId;
    if (!venueId) return res.json([]);
    const rows = await db.select().from(venues).where(eq(venues.id, venueId));
    res.json(rows.map(serializeVenue));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list venues" });
  }
});

router.put("/venues/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (req.auth?.venueId && id !== req.auth.venueId) {
      return res.status(403).json({ message: "Cannot edit another venue" });
    }
    const { name, address, timezone, subscriptionTier, isActive, latitude, longitude, clockInRadiusFeet } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (timezone !== undefined) updates.timezone = timezone;
    if (subscriptionTier !== undefined) updates.subscriptionTier = subscriptionTier;
    if (isActive !== undefined) updates.isActive = isActive;
    if (latitude !== undefined) {
      if (latitude === null) updates.latitude = null;
      else {
        const n = Number(latitude);
        if (Number.isNaN(n) || n < -90 || n > 90) return res.status(400).json({ message: "latitude must be between -90 and 90" });
        updates.latitude = String(n);
      }
    }
    if (longitude !== undefined) {
      if (longitude === null) updates.longitude = null;
      else {
        const n = Number(longitude);
        if (Number.isNaN(n) || n < -180 || n > 180) return res.status(400).json({ message: "longitude must be between -180 and 180" });
        updates.longitude = String(n);
      }
    }
    if (clockInRadiusFeet !== undefined) {
      if (clockInRadiusFeet === null) updates.clockInRadiusFeet = null;
      else {
        const n = Math.round(Number(clockInRadiusFeet));
        if (!Number.isFinite(n) || n < 10 || n > 5000) return res.status(400).json({ message: "clockInRadiusFeet must be between 10 and 5000" });
        updates.clockInRadiusFeet = n;
      }
    }
    const [updated] = await db.update(venues).set(updates).where(eq(venues.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Venue not found" });
    res.json(serializeVenue(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update venue" });
  }
});

export default router;
