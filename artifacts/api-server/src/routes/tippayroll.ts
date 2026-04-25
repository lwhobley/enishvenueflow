import { Router } from "express";
import { db } from "@workspace/db";
import { tipPools, tipPoolEntries, payrollRecords, timeClockEntries, users, schedules } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";

const router = Router();

function formatTipPool(p: typeof tipPools.$inferSelect) {
  return { ...p, totalTips: parseFloat(p.totalTips) };
}

function formatEntry(e: typeof tipPoolEntries.$inferSelect, userName?: string | null) {
  return {
    ...e,
    hoursWorked: parseFloat(e.hoursWorked),
    points: parseFloat(e.points),
    tipAmount: parseFloat(e.tipAmount),
    userName: userName ?? null,
  };
}

function formatPayroll(p: typeof payrollRecords.$inferSelect, userName?: string | null) {
  return {
    ...p,
    regularHours: parseFloat(p.regularHours),
    overtimeHours: parseFloat(p.overtimeHours),
    regularPay: parseFloat(p.regularPay),
    overtimePay: parseFloat(p.overtimePay),
    tipAmount: parseFloat(p.tipAmount),
    totalPay: parseFloat(p.totalPay),
    userName: userName ?? null,
  };
}

router.get("/tip-pools", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const all = await db.select().from(tipPools).where(eq(tipPools.venueId, venueId));
    res.json(all.map(formatTipPool));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list tip pools" });
  }
});

router.post("/tip-pools", async (req, res) => {
  try {
    const { venueId, scheduleId, totalTips, distributionMethod = "equal" } = req.body;
    if (!venueId || !scheduleId || totalTips == null) return res.status(400).json({ message: "venueId, scheduleId, totalTips required" });
    const [pool] = await db.insert(tipPools).values({ venueId, scheduleId, totalTips: String(totalTips), distributionMethod }).returning();
    res.status(201).json(formatTipPool(pool));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create tip pool" });
  }
});

router.post("/tip-pools/:id/distribute", async (req, res) => {
  try {
    const { id } = req.params;
    const [pool] = await db.select().from(tipPools).where(eq(tipPools.id, id));
    if (!pool) return res.status(404).json({ message: "Tip pool not found" });
    if (pool.status === "distributed") return res.status(400).json({ message: "Already distributed" });

    const total = parseFloat(pool.totalTips);

    // Anchor distribution to the actual hours worked during the schedule's
    // week. Previously this was a stub that gave every venue user an equal
    // share regardless of method, hardcoded "8" hours and "1" point — so a
    // dishwasher who worked one shift got the same tips as a server who
    // closed every night. Now: we pull every clock-out for users on the
    // pool's schedule's week, sum their hours, and split by method.
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, pool.scheduleId));
    if (!schedule) return res.status(400).json({ message: "Pool's schedule no longer exists" });
    const weekStart = new Date(`${schedule.weekStart}T00:00:00Z`);
    const weekEndExcl = new Date(`${schedule.weekEnd}T00:00:00Z`);
    weekEndExcl.setUTCDate(weekEndExcl.getUTCDate() + 1);

    const completed = await db.select().from(timeClockEntries).where(and(
      eq(timeClockEntries.venueId, pool.venueId),
      eq(timeClockEntries.status, "completed"),
      gte(timeClockEntries.clockIn, weekStart),
      lte(timeClockEntries.clockIn, weekEndExcl),
    ));

    // Sum hours per user — body-readable distribution-method override on
    // pool.distributionMethod ("equal" / "hours" / "points"). Bodies pass
    // a `pointsByUserId: { [userId]: number }` map for the points method;
    // we ignore unknown user ids and treat missing entries as 0.
    type Row = { userId: string; hours: number; points: number };
    const byUser = new Map<string, Row>();
    for (const e of completed) {
      if (!e.userId || !e.totalHours) continue;
      const hours = parseFloat(e.totalHours);
      if (!Number.isFinite(hours) || hours <= 0) continue;
      const row = byUser.get(e.userId) ?? { userId: e.userId, hours: 0, points: 0 };
      row.hours += hours;
      byUser.set(e.userId, row);
    }
    const pointsByUserId = (req.body?.pointsByUserId ?? {}) as Record<string, number>;
    for (const [userId, points] of Object.entries(pointsByUserId)) {
      const n = Number(points);
      if (!Number.isFinite(n) || n <= 0) continue;
      const row = byUser.get(userId) ?? { userId, hours: 0, points: 0 };
      row.points = n;
      byUser.set(userId, row);
    }

    // Skip users who were rostered but never clocked in — they don't share.
    const rows = [...byUser.values()].filter((r) => r.hours > 0 || r.points > 0);
    const method = pool.distributionMethod === "hours" || pool.distributionMethod === "points"
      ? pool.distributionMethod
      : "equal";

    let totalWeight = 0;
    if (method === "hours") totalWeight = rows.reduce((s, r) => s + r.hours, 0);
    else if (method === "points") totalWeight = rows.reduce((s, r) => s + r.points, 0);
    // "equal" uses count as the weight basis.

    // Delete old entries before inserting fresh distribution.
    await db.delete(tipPoolEntries).where(eq(tipPoolEntries.poolId, id));

    const insertData = rows.map((r) => {
      let amount = 0;
      if (method === "equal") {
        amount = rows.length > 0 ? total / rows.length : 0;
      } else if (method === "hours") {
        amount = totalWeight > 0 ? (r.hours / totalWeight) * total : 0;
      } else if (method === "points") {
        amount = totalWeight > 0 ? (r.points / totalWeight) * total : 0;
      }
      return {
        poolId: id,
        userId: r.userId,
        hoursWorked: r.hours.toFixed(2),
        points: r.points.toFixed(2),
        tipAmount: amount.toFixed(2),
      };
    });

    if (insertData.length > 0) {
      await db.insert(tipPoolEntries).values(insertData);
    }
    const [updated] = await db.update(tipPools).set({ status: "distributed" }).where(eq(tipPools.id, id)).returning();
    res.json(formatTipPool(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to distribute tip pool" });
  }
});

router.get("/tip-pools/:id/entries", async (req, res) => {
  try {
    const { id } = req.params;
    const entries = await db.select().from(tipPoolEntries).where(eq(tipPoolEntries.poolId, id));
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.json(entries.map(e => formatEntry(e, userMap[e.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list tip pool entries" });
  }
});

// Payroll
router.get("/payroll", async (req, res) => {
  try {
    const { venueId, periodStart, periodEnd } = req.query as { venueId: string; periodStart?: string; periodEnd?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    let query = db.select().from(payrollRecords).where(eq(payrollRecords.venueId, venueId)).$dynamic();
    const all = await query.orderBy(payrollRecords.createdAt);
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    let filtered = all;
    if (periodStart) filtered = filtered.filter(p => p.periodStart >= periodStart);
    if (periodEnd) filtered = filtered.filter(p => p.periodEnd <= periodEnd);
    res.json(filtered.map(p => formatPayroll(p, userMap[p.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list payroll" });
  }
});

router.post("/payroll/generate", async (req, res) => {
  try {
    const { venueId, periodStart, periodEnd } = req.body;
    if (!venueId || !periodStart || !periodEnd) return res.status(400).json({ message: "venueId, periodStart, periodEnd required" });
    const venueUsers = await db.select().from(users).where(and(eq(users.venueId, venueId), eq(users.isActive, true)));
    const clockEntries = await db.select().from(timeClockEntries).where(eq(timeClockEntries.venueId, venueId));
    // Filter entries in range
    const inRange = clockEntries.filter(e => {
      const d = e.clockIn.toISOString().split("T")[0];
      return d >= periodStart && d <= periodEnd && e.status === "completed";
    });

    const records = [];
    for (const user of venueUsers) {
      const userEntries = inRange.filter(e => e.userId === user.id);
      const totalHours = userEntries.reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours) : 0), 0);
      const regularHours = Math.min(totalHours, 40);
      const overtimeHours = Math.max(0, totalHours - 40);
      const hourlyRate = user.hourlyRate ? parseFloat(user.hourlyRate) : 15;
      const regularPay = regularHours * hourlyRate;
      const overtimePay = overtimeHours * hourlyRate * 1.5;
      const tipAmount = 0; // Would come from tip pools
      const totalPay = regularPay + overtimePay + tipAmount;

      // Delete existing for this period
      const existing = await db.select().from(payrollRecords).where(and(eq(payrollRecords.userId, user.id), eq(payrollRecords.venueId, venueId)));
      const existingInPeriod = existing.filter(p => p.periodStart === periodStart && p.periodEnd === periodEnd);
      for (const e of existingInPeriod) {
        await db.delete(payrollRecords).where(eq(payrollRecords.id, e.id));
      }

      const [record] = await db.insert(payrollRecords).values({
        userId: user.id,
        venueId,
        periodStart,
        periodEnd,
        regularHours: String(regularHours.toFixed(2)),
        overtimeHours: String(overtimeHours.toFixed(2)),
        regularPay: String(regularPay.toFixed(2)),
        overtimePay: String(overtimePay.toFixed(2)),
        tipAmount: String(tipAmount.toFixed(2)),
        totalPay: String(totalPay.toFixed(2)),
      }).returning();
      records.push(record);
    }

    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.status(201).json(records.map(p => formatPayroll(p, userMap[p.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to generate payroll" });
  }
});

export default router;
