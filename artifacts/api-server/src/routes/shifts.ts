import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, shiftRequests, users, roles, schedules } from "@workspace/db";
import { eq, and, inArray, gte, lte } from "drizzle-orm";

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
    const { scheduleId, userId, venueId, from, to } = req.query as {
      scheduleId?: string; userId?: string; venueId?: string;
      from?: string; to?: string;
    };
    let query = db.select().from(shifts).$dynamic();
    const conditions = [];
    if (scheduleId) conditions.push(eq(shifts.scheduleId, scheduleId));
    if (userId) conditions.push(eq(shifts.userId, userId));
    // Cross-schedule listing: when the caller passes venueId (and no
    // scheduleId), resolve all schedule ids for the venue and filter by
    // inArray. Pairs well with from/to for a monthly calendar view.
    if (venueId && !scheduleId) {
      const venueSchedules = await db.select({ id: schedules.id })
        .from(schedules).where(eq(schedules.venueId, venueId));
      if (venueSchedules.length === 0) {
        res.json([]);
        return;
      }
      conditions.push(inArray(shifts.scheduleId, venueSchedules.map((s) => s.id)));
    }
    if (from) conditions.push(gte(shifts.startTime, new Date(from)));
    if (to) conditions.push(lte(shifts.startTime, new Date(to)));
    if (conditions.length) query = query.where(and(...conditions));
    const all = await query;
    res.json(await enrichShifts(all));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list shifts" });
  }
});

// NOTE: single-shift /shifts/:id handlers are registered BELOW the specific
// /shifts/bulk, /shifts/open, /shifts/copy-day, /shifts/bulk-assign, and
// /shifts/:id/* routes so Express doesn't match "bulk" as an :id.

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
    const { venueId, roleId } = req.query as { venueId: string; roleId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const conditions = [eq(shifts.status, "open")];
    if (roleId) conditions.push(eq(shifts.roleId, roleId));
    const all = await db.select().from(shifts).where(and(...conditions));
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

// ── Single-shift /:id handlers registered LAST so they don't shadow
// /shifts/bulk, /shifts/open, /shifts/copy-day, /shifts/bulk-assign, etc.
router.put("/shifts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, roleId, sectionId, startTime, endTime, notes, status } = req.body;
    const updates: Record<string, unknown> = {};
    if (userId !== undefined) {
      updates.userId = userId;
      if (status === undefined) updates.status = userId ? "scheduled" : "open";
    }
    if (roleId !== undefined) updates.roleId = roleId;
    if (sectionId !== undefined) updates.sectionId = sectionId;
    if (startTime !== undefined) updates.startTime = new Date(startTime);
    if (endTime !== undefined) updates.endTime = new Date(endTime);
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) updates.status = status;
    const [updated] = await db.update(shifts).set(updates).where(eq(shifts.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Shift not found" });
    const [enriched] = await enrichShifts([updated]);
    res.json(enriched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update shift" });
  }
});

router.delete("/shifts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.delete(shifts).where(eq(shifts.id, id)).returning({ id: shifts.id });
    if (deleted.length === 0) return res.status(404).json({ message: "Shift not found" });
    res.json({ message: "Shift deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete shift" });
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
    const allRoles = await db.select().from(roles);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    const roleMap = Object.fromEntries(allRoles.map(r => [r.id, r]));
    // Enrich with shift data
    const shiftIds = [...new Set(all.map(r => r.shiftId))];
    let shiftDataMap: Record<string, typeof shifts.$inferSelect> = {};
    if (shiftIds.length) {
      const shiftRows = await db.select().from(shifts).where(inArray(shifts.id, shiftIds));
      shiftDataMap = Object.fromEntries(shiftRows.map(s => [s.id, s]));
    }
    res.json(all.map(r => {
      const shift = shiftDataMap[r.shiftId];
      return {
        ...r,
        userName: userMap[r.userId]?.fullName ?? null,
        shiftStartTime: shift?.startTime ?? null,
        shiftEndTime: shift?.endTime ?? null,
        roleName: shift?.roleId ? (roleMap[shift.roleId]?.name ?? null) : null,
        roleColor: shift?.roleId ? (roleMap[shift.roleId]?.color ?? null) : null,
        shiftUserId: shift?.userId ?? null,
        shiftUserName: shift?.userId ? (userMap[shift.userId]?.fullName ?? null) : null,
      };
    }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list shift requests" });
  }
});

router.post("/shift-requests", async (req, res) => {
  try {
    const { userId, shiftId, type, requestedWithId, notes } = req.body;
    if (!userId || !shiftId || !type) return res.status(400).json({ message: "userId, shiftId, type required" });
    // Prevent duplicate pending requests
    const existing = await db.select().from(shiftRequests).where(
      and(eq(shiftRequests.userId, userId), eq(shiftRequests.shiftId, shiftId), eq(shiftRequests.type, type), eq(shiftRequests.status, "pending"))
    );
    if (existing.length) return res.status(409).json({ message: "You already have a pending request for this shift" });
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
    const [request] = await db.select().from(shiftRequests).where(eq(shiftRequests.id, id));
    if (!request) return res.status(404).json({ message: "Request not found" });

    // Execute business logic based on request type
    if (request.type === "drop") {
      // Unassign the shift — make it open for pickup
      await db.update(shifts).set({ userId: null, status: "open" }).where(eq(shifts.id, request.shiftId));
    } else if (request.type === "pickup") {
      // Assign the shift to the requester
      await db.update(shifts).set({ userId: request.userId, status: "scheduled" }).where(and(eq(shifts.id, request.shiftId), eq(shifts.status, "open")));
      // Reject any other pending pickup requests for the same shift
      await db.update(shiftRequests).set({ status: "rejected" }).where(
        and(eq(shiftRequests.shiftId, request.shiftId), eq(shiftRequests.type, "pickup"), eq(shiftRequests.status, "pending"))
      );
    }

    const [updated] = await db.update(shiftRequests).set({ status: "approved" }).where(eq(shiftRequests.id, id)).returning();
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
