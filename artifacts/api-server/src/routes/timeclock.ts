import { Router } from "express";
import { db } from "@workspace/db";
import { timeClockEntries, timeOffRequests, users } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

function formatEntry(e: typeof timeClockEntries.$inferSelect, userName?: string | null) {
  return {
    ...e,
    totalHours: e.totalHours ? parseFloat(e.totalHours) : null,
    userName: userName ?? null,
  };
}

router.post("/time-clock/in", async (req, res) => {
  try {
    const { userId, venueId, notes } = req.body;
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });
    // Check if already clocked in
    const [existing] = await db.select().from(timeClockEntries).where(and(eq(timeClockEntries.userId, userId), eq(timeClockEntries.status, "active")));
    if (existing) return res.status(400).json({ message: "Already clocked in" });
    const [entry] = await db.insert(timeClockEntries).values({
      userId, venueId, clockIn: new Date(), status: "active", notes: notes ?? null,
    }).returning();
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    res.status(201).json(formatEntry(entry, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to clock in" });
  }
});

router.post("/time-clock/out", async (req, res) => {
  try {
    const { userId, venueId, breakMinutes = 0, notes } = req.body;
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });
    const [active] = await db.select().from(timeClockEntries).where(and(eq(timeClockEntries.userId, userId), eq(timeClockEntries.status, "active")));
    if (!active) return res.status(400).json({ message: "Not clocked in" });
    const clockOut = new Date();
    const totalMs = clockOut.getTime() - active.clockIn.getTime() - (breakMinutes * 60000);
    const totalHours = String(Math.max(0, totalMs / 3600000).toFixed(2));
    const [updated] = await db.update(timeClockEntries).set({
      clockOut, totalHours, breakMinutes, status: "completed", notes: notes ?? active.notes,
    }).where(eq(timeClockEntries.id, active.id)).returning();
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    res.json(formatEntry(updated, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to clock out" });
  }
});

router.get("/time-clock/active", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const active = await db.select().from(timeClockEntries).where(and(eq(timeClockEntries.venueId, venueId), eq(timeClockEntries.status, "active")));
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.json(active.map(e => formatEntry(e, userMap[e.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list active clock-ins" });
  }
});

router.get("/time-clock/entries", async (req, res) => {
  try {
    const { venueId, userId, startDate, endDate } = req.query as { venueId?: string; userId?: string; startDate?: string; endDate?: string };
    let query = db.select().from(timeClockEntries).$dynamic();
    const conditions = [];
    if (venueId) conditions.push(eq(timeClockEntries.venueId, venueId));
    if (userId) conditions.push(eq(timeClockEntries.userId, userId));
    if (conditions.length) query = query.where(and(...conditions));
    const all = await query.orderBy(timeClockEntries.clockIn);
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.json(all.map(e => formatEntry(e, userMap[e.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list time clock entries" });
  }
});

router.put("/time-clock/entries/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { clockIn, clockOut, breakMinutes, notes } = req.body;
    const updates: Record<string, unknown> = {};
    if (clockIn) {
      updates.clockIn = new Date(clockIn);
    }
    if (clockOut) {
      updates.clockOut = new Date(clockOut);
      updates.status = "completed";
      // Recalculate totalHours if we have both
      const entry = await db.select().from(timeClockEntries).where(eq(timeClockEntries.id, id));
      if (entry[0]) {
        const inTime = clockIn ? new Date(clockIn) : entry[0].clockIn;
        const outTime = new Date(clockOut);
        const break_ = breakMinutes ?? entry[0].breakMinutes ?? 0;
        const totalMs = outTime.getTime() - inTime.getTime() - (break_ * 60000);
        updates.totalHours = String(Math.max(0, totalMs / 3600000).toFixed(2));
      }
    }
    if (breakMinutes !== undefined) updates.breakMinutes = breakMinutes;
    if (notes !== undefined) updates.notes = notes;
    const [updated] = await db.update(timeClockEntries).set(updates).where(eq(timeClockEntries.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Entry not found" });
    const [user] = await db.select().from(users).where(eq(users.id, updated.userId));
    res.json(formatEntry(updated, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update time clock entry" });
  }
});

// Time Off
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
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.json(all.map(r => ({ ...r, userName: userMap[r.userId]?.fullName ?? null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list time-off requests" });
  }
});

router.post("/time-off", async (req, res) => {
  try {
    const { userId, venueId, startDate, endDate, type, notes } = req.body;
    if (!userId || !venueId || !startDate || !endDate || !type) {
      return res.status(400).json({ message: "userId, venueId, startDate, endDate, type required" });
    }
    const [req_] = await db.insert(timeOffRequests).values({ userId, venueId, startDate, endDate, type, notes: notes ?? null }).returning();
    res.status(201).json(req_);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create time-off request" });
  }
});

router.put("/time-off/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(timeOffRequests).set({ status: "approved" }).where(eq(timeOffRequests.id, id)).returning();
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
    const [updated] = await db.update(timeOffRequests).set({ status: "denied" }).where(eq(timeOffRequests.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to deny" });
  }
});

export default router;
