/**
 * 40-hour weekly cap enforcement on manual shift assignment / pickup.
 *
 * The auto-assign engine already understands hour caps; this module
 * enforces the same rule on every manual path that lands a user on a
 * shift (POST /shifts, PUT /shifts/:id, PUT /shifts/:id/assign,
 * PUT /shifts/bulk-assign, POST /shifts/:id/pickup). Pure helpers so
 * the route handler can hand off the inputs and decide what to do
 * with the answer (refuse, override, warn).
 */

import { db } from "@workspace/db";
import { shifts, schedules } from "@workspace/db";
import { eq, and, inArray, ne, gte, lte } from "drizzle-orm";

const HOURS_PER_MS = 1 / 3_600_000;
const DAY_MS = 86_400_000;

export const DEFAULT_WEEKLY_CAP_HOURS = 40;

/**
 * Returns the [start, end) of the calendar week (Sunday 00:00 → next
 * Sunday 00:00) that contains the given instant. Matches the auto-assign
 * engine's week boundary so the two enforcement paths agree.
 */
export function weekBoundsContaining(instant: Date): { start: Date; end: Date } {
  const dow = instant.getDay();
  const startMs = instant.getTime() - dow * DAY_MS;
  const startOfDay = new Date(startMs);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfDay.getTime() + 7 * DAY_MS);
  return { start: startOfDay, end: endOfWeek };
}

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) * HOURS_PER_MS);
}

/**
 * Sum of a user's existing scheduled hours that intersect the given
 * week. `excludeShiftId` lets the caller leave out the row that's about
 * to be reassigned (so the same shift isn't double-counted when the
 * change is "move start time" instead of "add a new shift").
 */
export async function existingWeeklyHoursForUser(
  userId: string,
  venueId: string,
  weekStart: Date,
  weekEnd: Date,
  excludeShiftId?: string,
): Promise<number> {
  const venueScheduleIds = (
    await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.venueId, venueId))
  ).map((s) => s.id);
  if (venueScheduleIds.length === 0) return 0;

  const conditions = [
    eq(shifts.userId, userId),
    inArray(shifts.scheduleId, venueScheduleIds),
    // Shifts that start before the week ends and end after the week starts
    // overlap the bounds — same predicate the auto-assign engine uses.
    lte(shifts.startTime, weekEnd),
    gte(shifts.endTime, weekStart),
  ];
  if (excludeShiftId) conditions.push(ne(shifts.id, excludeShiftId));

  const rows = await db
    .select({ startTime: shifts.startTime, endTime: shifts.endTime })
    .from(shifts)
    .where(and(...conditions));

  return rows.reduce((acc, s) => {
    // Clip to week bounds in case a single shift straddles the boundary —
    // we only want hours inside the target week.
    const start = new Date(Math.max(s.startTime.getTime(), weekStart.getTime()));
    const end = new Date(Math.min(s.endTime.getTime(), weekEnd.getTime()));
    return acc + hoursBetween(start, end);
  }, 0);
}

export interface CapCheckInput {
  userId: string;
  venueId: string;
  start: Date;
  end: Date;
  /** Existing shift id to exclude (when the assignment is in-place). */
  excludeShiftId?: string;
  /** Override the default 40-hour cap. */
  cap?: number;
}

export interface CapCheckResult {
  exceeds: boolean;
  cap: number;
  shiftHours: number;
  existingWeeklyHours: number;
  projectedWeeklyHours: number;
}

/**
 * Returns whether assigning `userId` to a shift spanning [start, end]
 * would push them past the weekly cap. The week is the one containing
 * the shift's start time.
 */
export async function checkWeeklyCap(input: CapCheckInput): Promise<CapCheckResult> {
  const cap = input.cap ?? DEFAULT_WEEKLY_CAP_HOURS;
  const { start: weekStart, end: weekEnd } = weekBoundsContaining(input.start);
  const shiftHours = hoursBetween(input.start, input.end);
  const existingWeeklyHours = await existingWeeklyHoursForUser(
    input.userId,
    input.venueId,
    weekStart,
    weekEnd,
    input.excludeShiftId,
  );
  const projectedWeeklyHours = existingWeeklyHours + shiftHours;
  return {
    exceeds: projectedWeeklyHours > cap,
    cap,
    shiftHours,
    existingWeeklyHours,
    projectedWeeklyHours,
  };
}
