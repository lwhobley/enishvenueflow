import { Router } from "express";
import { db } from "@workspace/db";
import { timeClockEntries, timeOffRequests, users, shifts } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";

const router = Router();

// ── Venue anchor coordinates ─────────────────────────────────────────────────
const VENUE_LAT = 29.736002;
const VENUE_LNG = -95.461831;
const MAX_DISTANCE_M = 3.048; // 10 feet
const GPS_ACCURACY_BUFFER_M = 25; // phones indoors often have 5–25m accuracy
const SHIFT_WINDOW_BEFORE_MS = 30 * 60 * 1000; // allow clock-in 30 min early
const SHIFT_WINDOW_AFTER_MS  = 15 * 60 * 1000; // allow clock-in 15 min late

// Haversine distance in metres
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Anti-spoofing heuristics (server-side)
function isSuspiciousLocation(lat: number, lng: number, accuracy: number): boolean {
  // Null island or poles
  if (lat === 0 && lng === 0) return true;
  // Impossibly perfect accuracy (< 0.1m — no real phone achieves this outdoors)
  if (accuracy !== undefined && accuracy < 0.1) return true;
  // Coordinates not plausible (lat/lng out of Earth range)
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return true;
  return false;
}

function formatEntry(e: typeof timeClockEntries.$inferSelect, userName?: string | null) {
  return { ...e, totalHours: e.totalHours ? parseFloat(e.totalHours) : null, userName: userName ?? null };
}

// ── POST /time-clock/in ───────────────────────────────────────────────────────
router.post("/time-clock/in", async (req, res) => {
  try {
    const { userId, venueId, notes, lat, lng, accuracy, clientTimestamp } = req.body;
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });

    // 1. Require geolocation
    if (lat === undefined || lng === undefined) {
      return res.status(403).json({ message: "Location is required to clock in. Please enable GPS." });
    }

    const latN = Number(lat);
    const lngN = Number(lng);
    const accN = Number(accuracy) || 50;

    // 2. Anti-spoofing checks
    if (isSuspiciousLocation(latN, lngN, accN)) {
      return res.status(403).json({ message: "Location appears to be spoofed or invalid. Real GPS required." });
    }

    // 3. Timestamp freshness (client must send Date.now())
    if (clientTimestamp) {
      const ageSeconds = (Date.now() - Number(clientTimestamp)) / 1000;
      if (ageSeconds > 30) {
        return res.status(403).json({ message: "Location data is stale. Please try again." });
      }
    }

    // 4. Distance check — allow GPS accuracy buffer (capped at 25 m)
    const dist = haversineM(latN, lngN, VENUE_LAT, VENUE_LNG);
    const allowedDist = MAX_DISTANCE_M + Math.min(accN, GPS_ACCURACY_BUFFER_M);
    if (dist > allowedDist) {
      const feet = (dist * 3.28084).toFixed(0);
      return res.status(403).json({
        message: `You must be within 10 feet of 5851 Westheimer Rd. You are currently ${feet} ft away.`,
        distanceMeters: dist,
        distanceFeet: Number(feet),
      });
    }

    // 5. Scheduled shift check
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const todayShifts = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.userId, userId),
          eq(shifts.venueId, venueId),
          gte(shifts.startTime, todayStart),
          lte(shifts.startTime, todayEnd)
        )
      );

    if (todayShifts.length === 0) {
      return res.status(403).json({ message: "You are not scheduled to work today." });
    }

    const nowMs = now.getTime();
    const validShift = todayShifts.find((s) => {
      const start = new Date(s.startTime).getTime();
      const end   = new Date(s.endTime).getTime();
      return nowMs >= start - SHIFT_WINDOW_BEFORE_MS && nowMs <= end + SHIFT_WINDOW_AFTER_MS;
    });

    if (!validShift) {
      return res.status(403).json({
        message: "Clock-in is only allowed within 30 minutes of your scheduled shift time.",
      });
    }

    // 6. Already clocked in?
    const [existing] = await db
      .select()
      .from(timeClockEntries)
      .where(and(eq(timeClockEntries.userId, userId), eq(timeClockEntries.status, "active")));
    if (existing) return res.status(400).json({ message: "Already clocked in" });

    // 7. Create entry
    const [entry] = await db
      .insert(timeClockEntries)
      .values({ userId, venueId, clockIn: now, status: "active", notes: notes ?? null })
      .returning();

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    res.status(201).json(formatEntry(entry, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to clock in" });
  }
});

// ── POST /time-clock/out ──────────────────────────────────────────────────────
router.post("/time-clock/out", async (req, res) => {
  try {
    const { userId, venueId, breakMinutes = 0, notes } = req.body;
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });
    const [active] = await db
      .select()
      .from(timeClockEntries)
      .where(and(eq(timeClockEntries.userId, userId), eq(timeClockEntries.status, "active")));
    if (!active) return res.status(400).json({ message: "Not clocked in" });
    const clockOut = new Date();
    const totalMs = clockOut.getTime() - active.clockIn.getTime() - breakMinutes * 60000;
    const totalHours = String(Math.max(0, totalMs / 3600000).toFixed(2));
    const [updated] = await db
      .update(timeClockEntries)
      .set({ clockOut, totalHours, breakMinutes, status: "completed", notes: notes ?? active.notes })
      .where(eq(timeClockEntries.id, active.id))
      .returning();
    const [user] = await db.select().from(users).where(eq(users.id, updated.userId));
    res.json(formatEntry(updated, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to clock out" });
  }
});

// ── GET /time-clock/active ────────────────────────────────────────────────────
router.get("/time-clock/active", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const active = await db
      .select()
      .from(timeClockEntries)
      .where(and(eq(timeClockEntries.venueId, venueId), eq(timeClockEntries.status, "active")));
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map((u) => [u.id, u]));
    res.json(active.map((e) => formatEntry(e, userMap[e.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list active clock-ins" });
  }
});

// ── GET /time-clock/entries ───────────────────────────────────────────────────
router.get("/time-clock/entries", async (req, res) => {
  try {
    const { venueId, userId } = req.query as { venueId?: string; userId?: string };
    let query = db.select().from(timeClockEntries).$dynamic();
    const conditions = [];
    if (venueId) conditions.push(eq(timeClockEntries.venueId, venueId));
    if (userId) conditions.push(eq(timeClockEntries.userId, userId));
    if (conditions.length) query = query.where(and(...conditions));
    const all = await query.orderBy(timeClockEntries.clockIn);
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map((u) => [u.id, u]));
    res.json(all.map((e) => formatEntry(e, userMap[e.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list time clock entries" });
  }
});

// ── PUT /time-clock/entries/:id ───────────────────────────────────────────────
router.put("/time-clock/entries/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { clockIn, clockOut, breakMinutes, notes } = req.body;
    const updates: Record<string, unknown> = {};
    if (clockIn) updates.clockIn = new Date(clockIn);
    if (clockOut) {
      updates.clockOut = new Date(clockOut);
      updates.status = "completed";
      const [entry] = await db.select().from(timeClockEntries).where(eq(timeClockEntries.id, id));
      if (entry) {
        const inTime = clockIn ? new Date(clockIn) : entry.clockIn;
        const outTime = new Date(clockOut);
        const br = breakMinutes ?? entry.breakMinutes ?? 0;
        const totalMs = outTime.getTime() - inTime.getTime() - br * 60000;
        updates.totalHours = String(Math.max(0, totalMs / 3600000).toFixed(2));
      }
    }
    if (breakMinutes !== undefined) updates.breakMinutes = breakMinutes;
    if (notes !== undefined) updates.notes = notes;
    const [updated] = await db
      .update(timeClockEntries)
      .set(updates)
      .where(eq(timeClockEntries.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Entry not found" });
    const [user] = await db.select().from(users).where(eq(users.id, updated.userId));
    res.json(formatEntry(updated, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update time clock entry" });
  }
});

// ── Time Off ──────────────────────────────────────────────────────────────────
router.get("/time-off", async (req, res) => {
  try {
    const { venueId, userId, status } = req.query as { venueId?: string; userId?: string; status?: string };
    let query = db.select().from(timeOffRequests).$dynamic();
    const conditions = [];
    if (venueId) conditions.push(eq(timeOffRequests.venueId, venueId));
    if (userId) conditions.push(eq(timeOffRequests.userId, userId));
    if (status) conditions.push(eq(timeOffRequests.status, status));
    if (conditions.length) query = query.where(and(...conditions));
    const all = await query.orderBy(timeOffRequests.createdAt);
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map((u) => [u.id, u]));
    res.json(all.map((r) => ({ ...r, userName: userMap[r.userId]?.fullName ?? null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list time-off requests" });
  }
});

router.post("/time-off", async (req, res) => {
  try {
    const { userId, venueId, startDate, endDate, type, notes } = req.body;
    if (!userId || !venueId || !startDate || !endDate || !type)
      return res.status(400).json({ message: "userId, venueId, startDate, endDate, type required" });
    const [req_] = await db
      .insert(timeOffRequests)
      .values({ userId, venueId, startDate, endDate, type, notes: notes ?? null })
      .returning();
    res.status(201).json(req_);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create time-off request" });
  }
});

router.put("/time-off/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db
      .update(timeOffRequests)
      .set({ status: "approved" })
      .where(eq(timeOffRequests.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to approve" });
  }
});

router.put("/time-off/:id/deny", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db
      .update(timeOffRequests)
      .set({ status: "denied" })
      .where(eq(timeOffRequests.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to deny" });
  }
});

export default router;
