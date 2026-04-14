import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, shiftRequests, users, roles } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router = Router();

async function enrichShifts(rawShifts: typeof shifts.$inferSelect[]) {
  if (!rawShifts.length) return [];
  const allRoles = await db.select().from(roles);
  const allUsers = await db.select().from(users);
  const roleMap = Object.fromEntries(allRoles.map(r => [r.id, r]));
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
  return rawShifts.map(s => ({
    ...s,
    roleName: s.roleId ? (roleMap[s.roleId]?.name ?? null) : null,
    roleColor: s.roleId ? (roleMap[s.roleId]?.color ?? null) : null,
    userName: s.userId ? (userMap[s.userId]?.fullName ?? null) : null,
  }));
}

router.get("/shifts", async (req, res) => {
  try {
    const { scheduleId, userId, venueId } = req.query as { scheduleId?: string; userId?: string; venueId?: string };
    let query = db.select().from(shifts).$dynamic();
    const conditions = [];
    if (scheduleId) conditions.push(eq(shifts.scheduleId, scheduleId));
    if (userId) conditions.push(eq(shifts.userId, userId));
    if (conditions.length) query = query.where(and(...conditions));
    const all = await query;
    res.json(await enrichShifts(all));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list shifts" });
  }
});

router.post("/shifts", async (req, res) => {
  try {
    const { scheduleId, userId, roleId, sectionId, startTime, endTime, notes } = req.body;
    if (!scheduleId || !roleId || !startTime || !endTime) {
      return res.status(400).json({ message: "scheduleId, roleId, startTime, endTime required" });
    }
    const [shift] = await db.insert(shifts).values({
      scheduleId, userId: userId ?? null, roleId,
      sectionId: sectionId ?? null,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: userId ? "scheduled" : "open",
      notes: notes ?? null,
    }).returning();
    const [enriched] = await enrichShifts([shift]);
    res.status(201).json(enriched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create shift" });
  }
});

router.get("/shifts/open", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const all = await db.select().from(shifts).where(eq(shifts.status, "open"));
    res.json(await enrichShifts(all));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list open shifts" });
  }
});

router.post("/shifts/bulk", async (req, res) => {
  try {
    const { shifts: shiftData } = req.body;
    if (!Array.isArray(shiftData) || !shiftData.length) return res.status(400).json({ message: "shifts array required" });
    const inserted = await db.insert(shifts).values(shiftData.map((s: { scheduleId: string; roleId: string; startTime: string; endTime: string; userId?: string; sectionId?: string; notes?: string }) => ({
      scheduleId: s.scheduleId,
      roleId: s.roleId,
      userId: s.userId ?? null,
      sectionId: s.sectionId ?? null,
      startTime: new Date(s.startTime),
      endTime: new Date(s.endTime),
      status: s.userId ? "scheduled" : "open",
      notes: s.notes ?? null,
    }))).returning();
    res.status(201).json(await enrichShifts(inserted));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to bulk create shifts" });
  }
});

router.delete("/shifts/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ message: "ids array required" });
    await db.delete(shifts).where(inArray(shifts.id, ids));
    res.json({ message: "Shifts deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete shifts" });
  }
});

router.post("/shifts/copy-day", async (req, res) => {
  try {
    const { scheduleId, fromDate, toDate } = req.body;
    if (!scheduleId || !fromDate || !toDate) return res.status(400).json({ message: "scheduleId, fromDate, toDate required" });
    const allShifts = await db.select().from(shifts).where(eq(shifts.scheduleId, scheduleId));
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diffMs = to.getTime() - from.getTime();
    const dayShifts = allShifts.filter(s => {
      const d = new Date(s.startTime);
      return d.toISOString().split("T")[0] === fromDate;
    });
    if (!dayShifts.length) return res.status(200).json([]);
    const copied = await db.insert(shifts).values(dayShifts.map(s => ({
      scheduleId: s.scheduleId,
      userId: s.userId,
      roleId: s.roleId,
      sectionId: s.sectionId,
      startTime: new Date(s.startTime.getTime() + diffMs),
      endTime: new Date(s.endTime.getTime() + diffMs),
      status: s.userId ? "scheduled" : "open",
      notes: s.notes,
    }))).returning();
    res.status(201).json(await enrichShifts(copied));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to copy day" });
  }
});

router.put("/shifts/bulk-assign", async (req, res) => {
  try {
    const { ids, userId } = req.body;
    if (!Array.isArray(ids) || !userId) return res.status(400).json({ message: "ids and userId required" });
    const updated = await db.update(shifts).set({ userId, status: "scheduled" }).where(inArray(shifts.id, ids)).returning();
    res.json(await enrichShifts(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to bulk assign" });
  }
});

router.put("/shifts/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const [updated] = await db.update(shifts).set({
      userId: userId ?? null,
      status: userId ? "scheduled" : "open",
    }).where(eq(shifts.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Shift not found" });
    const [enriched] = await enrichShifts([updated]);
    res.json(enriched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to assign shift" });
  }
});

router.post("/shifts/:id/pickup", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });
    const [updated] = await db.update(shifts).set({ userId, status: "scheduled" }).where(and(eq(shifts.id, id), eq(shifts.status, "open"))).returning();
    if (!updated) return res.status(400).json({ message: "Shift not available for pickup" });
    const [enriched] = await enrichShifts([updated]);
    res.json(enriched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to pickup shift" });
  }
});

// Shift Requests
router.get("/shift-requests", async (req, res) => {
  try {
    const { venueId, userId } = req.query as { venueId?: string; userId?: string };
    let query = db.select().from(shiftRequests).$dynamic();
    if (userId) query = query.where(eq(shiftRequests.userId, userId));
    const all = await query.orderBy(shiftRequests.createdAt);
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.json(all.map(r => ({
      ...r,
      userName: userMap[r.userId]?.fullName ?? null,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list shift requests" });
  }
});

router.post("/shift-requests", async (req, res) => {
  try {
    const { userId, shiftId, type, requestedWithId, notes } = req.body;
    if (!userId || !shiftId || !type) return res.status(400).json({ message: "userId, shiftId, type required" });
    const [req_] = await db.insert(shiftRequests).values({ userId, shiftId, type, requestedWithId: requestedWithId ?? null, notes: notes ?? null }).returning();
    res.status(201).json(req_);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create shift request" });
  }
});

router.put("/shift-requests/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(shiftRequests).set({ status: "approved" }).where(eq(shiftRequests.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to approve" });
  }
});

router.put("/shift-requests/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(shiftRequests).set({ status: "rejected" }).where(eq(shiftRequests.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to reject" });
  }
});

export default router;
