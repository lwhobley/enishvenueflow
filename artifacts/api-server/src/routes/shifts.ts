import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, shiftRequests, users, roles, schedules, availability, timeOffRequests } from "@workspace/db";
import { eq, and, inArray, gte, lte, ne } from "drizzle-orm";
import { notifyUser, notifyManagers } from "../lib/push";
import { assertSelf } from "../lib/auth-guards";
import { autoAssign } from "../lib/auto-assign";

// Build a human-readable shift summary for push bodies.
function describeShift(s: { startTime: Date | string; endTime: Date | string }): string {
  const start = new Date(s.startTime);
  const end = new Date(s.endTime);
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${t(start)}–${t(end)}`;
}

async function venueIdForSchedule(scheduleId: string): Promise<string | null> {
  const [row] = await db.select({ venueId: schedules.venueId }).from(schedules).where(eq(schedules.id, scheduleId));
  return row?.venueId ?? null;
}

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
    if (shift.userId) {
      void notifyUser(shift.userId, {
        title: "New shift scheduled",
        body: `${enriched.roleName ?? "Shift"} · ${describeShift(shift)}`,
        url: "/employee/schedule",
        tag: `shift-${shift.id}`,
      });
    }
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
    // Grab assignees first so we can notify them after the delete.
    const deletedRows = await db
      .select({ id: shifts.id, userId: shifts.userId, startTime: shifts.startTime, endTime: shifts.endTime })
      .from(shifts).where(inArray(shifts.id, ids));
    await db.delete(shifts).where(inArray(shifts.id, ids));
    res.json({ message: "Shifts deleted" });
    for (const r of deletedRows) {
      if (!r.userId) continue;
      void notifyUser(r.userId, {
        title: "Shift removed",
        body: describeShift(r),
        url: "/employee/schedule",
        tag: `shift-${r.id}`,
      });
    }
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
    // Capture prior assignees so we can notify both the new assignee and
    // anyone who got reassigned away.
    const priors = await db.select({ id: shifts.id, userId: shifts.userId }).from(shifts).where(inArray(shifts.id, ids));
    const priorById = new Map(priors.map((p) => [p.id, p.userId]));

    const updated = await db.update(shifts).set({ userId, status: "scheduled" }).where(inArray(shifts.id, ids)).returning();
    const enriched = await enrichShifts(updated);
    res.json(enriched);

    // Bulk-assign was previously silent — staff would just notice the
    // shift on their schedule with no notification. Send the same
    // "Shift assigned to you" / "Shift reassigned" pushes the single-
    // assign path emits.
    for (const row of updated) {
      void notifyUser(row.userId!, {
        title: "Shift assigned to you",
        body: describeShift(row),
        url: "/employee/schedule",
        tag: `shift-${row.id}`,
      });
      const prior = priorById.get(row.id);
      if (prior && prior !== row.userId) {
        void notifyUser(prior, {
          title: "Shift reassigned",
          body: describeShift(row),
          url: "/employee/schedule",
          tag: `shift-${row.id}`,
        });
      }
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to bulk assign" });
  }
});

router.put("/shifts/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const [prior] = await db.select().from(shifts).where(eq(shifts.id, id));
    const [updated] = await db.update(shifts).set({
      userId: userId ?? null,
      status: userId ? "scheduled" : "open",
    }).where(eq(shifts.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Shift not found" });
    const [enriched] = await enrichShifts([updated]);
    res.json(enriched);
    if (userId && userId !== prior?.userId) {
      void notifyUser(userId, {
        title: "Shift assigned to you",
        body: `${enriched.roleName ?? "Shift"} · ${describeShift(updated)}`,
        url: "/employee/schedule",
        tag: `shift-${id}`,
      });
    }
    if (prior?.userId && prior.userId !== userId) {
      void notifyUser(prior.userId, {
        title: "Shift reassigned",
        body: `${enriched.roleName ?? "Shift"} · ${describeShift(updated)}`,
        url: "/employee/schedule",
        tag: `shift-${id}`,
      });
    }
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
    // A user can only pick up an open shift for themselves. Admins use
    // PUT /shifts/:id/assign to reassign on someone else's behalf.
    if (!assertSelf(req, res, userId)) return;
    const [updated] = await db.update(shifts).set({ userId, status: "scheduled" }).where(and(eq(shifts.id, id), eq(shifts.status, "open"))).returning();
    if (!updated) return res.status(400).json({ message: "Shift not available for pickup" });
    const [enriched] = await enrichShifts([updated]);
    res.json(enriched);
    const venueId = await venueIdForSchedule(updated.scheduleId);
    if (venueId) {
      const [picker] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId));
      void notifyManagers(venueId, {
        title: "Shift picked up",
        body: `${picker?.fullName ?? "An employee"} claimed ${enriched.roleName ?? "a shift"} · ${describeShift(updated)}`,
        url: "/manager/schedule",
        tag: `shift-pickup-${id}`,
      });
    }
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
    const [prior] = await db.select().from(shifts).where(eq(shifts.id, id));
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

    // Push: notify anyone affected by the change.
    const priorUser = prior?.userId ?? null;
    const newUser = updated.userId ?? null;
    const timeChanged =
      !!prior &&
      (new Date(prior.startTime).getTime() !== new Date(updated.startTime).getTime() ||
        new Date(prior.endTime).getTime() !== new Date(updated.endTime).getTime());
    const roleChanged = !!prior && prior.roleId !== updated.roleId;

    if (newUser && newUser !== priorUser) {
      void notifyUser(newUser, {
        title: "Shift assigned to you",
        body: `${enriched.roleName ?? "Shift"} · ${describeShift(updated)}`,
        url: "/employee/schedule",
        tag: `shift-${id}`,
      });
    } else if (newUser && (timeChanged || roleChanged)) {
      void notifyUser(newUser, {
        title: "Your shift was updated",
        body: `${enriched.roleName ?? "Shift"} · ${describeShift(updated)}`,
        url: "/employee/schedule",
        tag: `shift-${id}`,
      });
    }
    if (priorUser && priorUser !== newUser) {
      void notifyUser(priorUser, {
        title: "Shift reassigned",
        body: `${enriched.roleName ?? "Shift"} · ${describeShift(updated)}`,
        url: "/employee/schedule",
        tag: `shift-${id}`,
      });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update shift" });
  }
});

router.delete("/shifts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.delete(shifts).where(eq(shifts.id, id)).returning();
    if (deleted.length === 0) return res.status(404).json({ message: "Shift not found" });
    res.json({ message: "Shift deleted" });
    const row = deleted[0];
    if (row?.userId) {
      void notifyUser(row.userId, {
        title: "Shift removed",
        body: describeShift(row),
        url: "/employee/schedule",
        tag: `shift-${id}`,
      });
    }
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
    // Scope users + roles to the caller's venue. enforceVenueScope keeps
    // venueId (when supplied) honest; otherwise we fall back to the
    // session's venueId. Either way we never enrich with rows from a
    // different venue.
    const venueScope = venueId ?? req.auth?.venueId;
    const venueUsers = venueScope
      ? await db.select().from(users).where(eq(users.venueId, venueScope))
      : [];
    const venueRoles = venueScope
      ? await db.select().from(roles).where(eq(roles.venueId, venueScope))
      : [];
    const userMap = Object.fromEntries(venueUsers.map(u => [u.id, u]));
    const roleMap = Object.fromEntries(venueRoles.map(r => [r.id, r]));
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
    // Drop / pickup / trade requests can only be filed by the requesting
    // employee themselves.
    if (!assertSelf(req, res, userId)) return;
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
    if (request.status !== "pending") {
      return res.status(409).json({ message: `Request already ${request.status}` });
    }

    // The shift mutation is the source of truth for who actually has it.
    // Use the affected-row count to decide whether the approval succeeded
    // — previously the update was conditional on status='open' but the
    // caller treated a zero-row no-op as success and still flipped the
    // request to approved, so two managers approving two competing
    // pickups would both report success while only one user got the
    // shift.
    if (request.type === "drop") {
      // Only release the shift if the requester is still the holder; if
      // the schedule has moved on (admin reassigned, etc.) refuse.
      const released = await db
        .update(shifts)
        .set({ userId: null, status: "open" })
        .where(and(eq(shifts.id, request.shiftId), eq(shifts.userId, request.userId)))
        .returning({ id: shifts.id });
      if (released.length === 0) {
        return res.status(409).json({ message: "Shift is no longer assigned to the requester" });
      }
    } else if (request.type === "pickup") {
      const claimed = await db
        .update(shifts)
        .set({ userId: request.userId, status: "scheduled" })
        .where(and(eq(shifts.id, request.shiftId), eq(shifts.status, "open")))
        .returning({ id: shifts.id });
      if (claimed.length === 0) {
        // Reflect reality on the request itself so the UI doesn't keep
        // showing it as actionable.
        await db.update(shiftRequests).set({ status: "rejected" }).where(eq(shiftRequests.id, id));
        return res.status(409).json({ message: "Shift was already taken by someone else" });
      }
      // Reject any other pending pickup requests for the same shift in
      // a single update so the loser sees a final state immediately.
      await db.update(shiftRequests).set({ status: "rejected" }).where(
        and(
          eq(shiftRequests.shiftId, request.shiftId),
          eq(shiftRequests.type, "pickup"),
          eq(shiftRequests.status, "pending"),
          ne(shiftRequests.id, id),
        ),
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

// ── Auto-assign open shifts in a date range ─────────────────────────────────
// Wraps the lib/auto-assign engine. By default this is a dry run — the
// response carries the proposed assignments + reasons + warnings, the
// manager reviews, and a follow-up call with apply=true commits them.
//
// Body: { venueId, from?: ISO, to?: ISO, apply?: boolean, config?: AutoAssignConfig }
// `from`/`to` default to the union of all open shifts' weeks; in
// practice the manager schedule page sends the visible-month range.
router.post("/shifts/auto-assign", async (req, res) => {
  try {
    const { venueId, from, to, apply = false, config = {} } = req.body as {
      venueId?: string;
      from?: string;
      to?: string;
      apply?: boolean;
      config?: { maxHoursPerWeek?: number; maxHoursPerDay?: number; overtimeWarnAtWeeklyHours?: number; preferFairness?: boolean };
    };
    if (!venueId) return res.status(400).json({ message: "venueId required" });

    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const toDate = to ? new Date(to) : new Date(Date.now() + 30 * 86_400_000);

    // Resolve every venue-scoped scheduleId; shifts join through scheduleId.
    const venueScheduleIds = (
      await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.venueId, venueId))
    ).map((s) => s.id);
    if (venueScheduleIds.length === 0) {
      return res.json({ assignments: [], openCount: 0, applied: 0 });
    }

    // Pull all shifts in the window: open ones become candidates,
    // assigned ones feed the conflict + hour-cap state.
    const allShifts = await db.select().from(shifts).where(and(
      inArray(shifts.scheduleId, venueScheduleIds),
      gte(shifts.startTime, fromDate),
      lte(shifts.startTime, toDate),
    ));

    const openShifts = allShifts.filter((s) => s.userId === null);
    const existingShifts = allShifts
      .filter((s) => s.userId !== null)
      .map((s) => ({ userId: s.userId!, startTime: s.startTime, endTime: s.endTime }));

    if (openShifts.length === 0) {
      return res.json({ assignments: [], openCount: 0, applied: 0, message: "No open shifts in range" });
    }

    // Cross-reference role names from the venue's roles table — the
    // engine matches roleName against users.positions[].
    const venueRoles = await db.select().from(roles).where(eq(roles.venueId, venueId));
    const roleNameById = new Map(venueRoles.map((r) => [r.id, r.name]));

    const venueUsers = await db.select().from(users).where(eq(users.venueId, venueId));
    const venueAvailability = await db.select().from(availability).where(eq(availability.venueId, venueId));
    const approvedTimeOff = await db.select().from(timeOffRequests).where(and(
      eq(timeOffRequests.venueId, venueId),
      eq(timeOffRequests.status, "approved"),
    ));

    const assignments = autoAssign(
      openShifts.map((s) => ({
        id: s.id,
        roleId: s.roleId,
        roleName: roleNameById.get(s.roleId) ?? "",
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      venueUsers.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        isActive: u.isActive ?? true,
        positions: Array.isArray(u.positions) ? u.positions : [],
        hourlyRate: u.hourlyRate ? parseFloat(u.hourlyRate) : null,
      })),
      existingShifts,
      venueAvailability.map((a) => ({
        userId: a.userId,
        dayOfWeek: a.dayOfWeek,
        isAvailable: a.isAvailable ?? true,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
      approvedTimeOff.map((t) => ({
        userId: t.userId,
        startDate: t.startDate,
        endDate: t.endDate,
      })),
      config,
    );

    let applied = 0;
    if (apply) {
      // Commit each assignment that resolved to a user. Shifts the
      // engine couldn't fill stay open. Per-row transactions are fine
      // here — these are independent flips and any failure leaves the
      // others in place.
      for (const a of assignments) {
        if (!a.userId) continue;
        await db.update(shifts)
          .set({ userId: a.userId, status: "scheduled" })
          .where(eq(shifts.id, a.shiftId));
        applied++;
        // Push notify the assignee — non-blocking.
        const shiftRow = openShifts.find((s) => s.id === a.shiftId);
        if (shiftRow) {
          void notifyUser(a.userId, {
            title: "New shift assigned",
            body: describeShift(shiftRow),
            url: "/employee/schedule",
            tag: `shift-${a.shiftId}`,
          });
        }
      }
    }

    res.json({
      assignments,
      openCount: openShifts.length,
      assignedCount: assignments.filter((a) => a.userId !== null).length,
      applied,
      dryRun: !apply,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to auto-assign" });
  }
});

export default router;
