import { Router } from "express";
import { db } from "@workspace/db";
import { users, shifts, schedules, reservations, waitlistEntries, timeClockEntries, timeOffRequests, shiftRequests } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/analytics/dashboard", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });

    const today = new Date().toISOString().split("T")[0];

    const [allUsers, allSchedules, allReservations, allWaitlist, activeClocks, pendingTimeOff, pendingShiftReqs] = await Promise.all([
      db.select().from(users).where(eq(users.venueId, venueId)),
      db.select().from(schedules).where(eq(schedules.venueId, venueId)),
      db.select().from(reservations).where(eq(reservations.venueId, venueId)),
      db.select().from(waitlistEntries).where(eq(waitlistEntries.venueId, venueId)),
      db.select().from(timeClockEntries).where(and(eq(timeClockEntries.venueId, venueId), eq(timeClockEntries.status, "active"))),
      db.select().from(timeOffRequests).where(and(eq(timeOffRequests.venueId, venueId), eq(timeOffRequests.status, "pending"))),
      db.select().from(shiftRequests),
    ]);

    // Get today's schedule
    const todaySchedule = allSchedules.find(s => s.weekStart <= today && s.weekEnd >= today);
    let todayShifts: typeof shifts.$inferSelect[] = [];
    let openShiftsCount = 0;
    let laborPct = 0;
    if (todaySchedule) {
      const allShifts = await db.select().from(shifts).where(eq(shifts.scheduleId, todaySchedule.id));
      todayShifts = allShifts.filter(s => s.startTime.toISOString().split("T")[0] === today);
      openShiftsCount = allShifts.filter(s => s.status === "open").length;
    }

    // Labor % = scheduled labor cost today / projected sales today.
    // The previous code initialised laborPct to 0 and never touched it,
    // so the dashboard always showed 0%. Without a sales projection
    // wired up yet, we approximate using a daily projection from the
    // schedule (sum of (shift hours * user hourly rate)) over a fixed
    // venue-level target — surfacing actual labor cost in dollars on
    // the way. Once /reports has live POS data we'll replace this with
    // sold $/labor $.
    if (todayShifts.length > 0) {
      const userById: Record<string, typeof allUsers[number]> = Object.fromEntries(
        allUsers.map((u) => [u.id, u]),
      );
      let laborCostUSD = 0;
      let scheduledHours = 0;
      for (const s of todayShifts) {
        const hrs = (s.endTime.getTime() - s.startTime.getTime()) / 3_600_000;
        if (!Number.isFinite(hrs) || hrs <= 0) continue;
        scheduledHours += hrs;
        if (s.userId) {
          const rate = parseFloat(userById[s.userId]?.hourlyRate ?? "0");
          if (Number.isFinite(rate) && rate > 0) laborCostUSD += hrs * rate;
        }
      }
      // Conservative target: $200 per scheduled labor hour. This is a
      // rough industry placeholder for a casual-dining venue; managers
      // care more about the trend than the absolute number until POS
      // is connected.
      const projectedSalesUSD = scheduledHours * 200;
      laborPct = projectedSalesUSD > 0 ? (laborCostUSD / projectedSalesUSD) * 100 : 0;
    }

    const activeStaff = allUsers.filter(u => u.isActive).length;
    const todayRes = allReservations.filter(r => r.date === today && !["cancelled", "no_show"].includes(r.status));
    const waitingList = allWaitlist.filter(w => w.status === "waiting");

    res.json({
      activeStaffCount: activeStaff,
      shiftsToday: todayShifts.length,
      openShifts: openShiftsCount,
      laborPct: Math.round(laborPct * 10) / 10,
      waitlistCount: waitingList.length,
      reservationsToday: todayRes.length,
      clockedInNow: activeClocks.length,
      pendingTimeOff: pendingTimeOff.length,
      pendingShiftRequests: pendingShiftReqs.filter(r => r.status === "pending").length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to get dashboard stats" });
  }
});

router.get("/analytics/labor", async (req, res) => {
  try {
    const { venueId, startDate, endDate } = req.query as { venueId: string; startDate: string; endDate: string };
    if (!venueId || !startDate || !endDate) return res.status(400).json({ message: "venueId, startDate, endDate required" });

    // Generate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days: string[] = [];
    const curr = new Date(start);
    while (curr <= end) {
      days.push(curr.toISOString().split("T")[0]);
      curr.setDate(curr.getDate() + 1);
    }

    const allEntries = await db.select().from(timeClockEntries).where(eq(timeClockEntries.venueId, venueId));
    const allUsers = await db.select().from(users).where(eq(users.venueId, venueId));
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

    const allSchedules = await db.select().from(schedules).where(eq(schedules.venueId, venueId));

    const result = await Promise.all(days.map(async (day) => {
      const dayEntries = allEntries.filter(e => e.clockIn.toISOString().split("T")[0] === day && e.status === "completed");
      const totalHours = dayEntries.reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours) : 0), 0);
      const totalCost = dayEntries.reduce((sum, e) => {
        const user = userMap[e.userId];
        const rate = user?.hourlyRate ? parseFloat(user.hourlyRate) : 15;
        return sum + (e.totalHours ? parseFloat(e.totalHours) * rate : 0);
      }, 0);

      // Count scheduled shifts for the day
      const daySchedule = allSchedules.find(s => s.weekStart <= day && s.weekEnd >= day);
      let scheduledShifts = 0;
      if (daySchedule) {
        const dayShifts = await db.select().from(shifts).where(eq(shifts.scheduleId, daySchedule.id));
        scheduledShifts = dayShifts.filter(s => s.startTime.toISOString().split("T")[0] === day).length;
      }

      return { date: day, totalHours: Math.round(totalHours * 100) / 100, totalCost: Math.round(totalCost * 100) / 100, scheduledShifts };
    }));

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to get labor analytics" });
  }
});

router.get("/analytics/employees", async (req, res) => {
  try {
    const { venueId, startDate, endDate } = req.query as { venueId: string; startDate: string; endDate: string };
    if (!venueId || !startDate || !endDate) return res.status(400).json({ message: "venueId, startDate, endDate required" });

    const allUsers = await db.select().from(users).where(and(eq(users.venueId, venueId), eq(users.isActive, true)));
    const allEntries = await db.select().from(timeClockEntries).where(and(eq(timeClockEntries.venueId, venueId), eq(timeClockEntries.status, "completed")));
    const inRange = allEntries.filter(e => {
      const d = e.clockIn.toISOString().split("T")[0];
      return d >= startDate && d <= endDate;
    });

    const result = allUsers.map(user => {
      const userEntries = inRange.filter(e => e.userId === user.id);
      const totalHours = userEntries.reduce((sum, e) => sum + (e.totalHours ? parseFloat(e.totalHours) : 0), 0);
      const regularHours = Math.min(totalHours, 40);
      const overtimeHours = Math.max(0, totalHours - 40);
      const hourlyRate = user.hourlyRate ? parseFloat(user.hourlyRate) : 15;
      const regularPay = regularHours * hourlyRate;
      const overtimePay = overtimeHours * hourlyRate * 1.5;
      const totalPay = regularPay + overtimePay;

      return {
        userId: user.id,
        userName: user.fullName,
        totalHours: Math.round(totalHours * 100) / 100,
        regularHours: Math.round(regularHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        totalPay: Math.round(totalPay * 100) / 100,
        shiftsWorked: userEntries.length,
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to get employee analytics" });
  }
});

export default router;
