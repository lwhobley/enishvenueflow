/**
 * Auto-assign engine — fills open shifts in a schedule by matching them
 * against eligible users.
 *
 * Pure function so the route handler can load all the inputs in one
 * batch, hand them off, and write back the results — and so unit tests
 * can lock in behavior without spinning up a DB. Same pattern as
 * `smart-assign.ts` for the host-stand floor plan.
 *
 * Eligibility is hard-filter first (position match, time-off, availability,
 * conflicts, hour caps), then a soft scoring pass picks the best
 * eligible user per shift. Every assignment carries a `reasons[]` array
 * the manager can read before pressing Apply.
 */

export interface AutoAssignConfig {
  /** Hard cap — assignment refuses to push a user past this in a week. */
  maxHoursPerWeek?: number;          // default 40
  /** Hard cap — same, per calendar day. */
  maxHoursPerDay?: number;           // default 12
  /**
   * If a user would land at or over this after the assignment, the
   * assignment goes through but the row carries an OT warning string.
   */
  overtimeWarnAtWeeklyHours?: number; // default 35
  /** When true, fairness scoring is the dominant tiebreaker (default). */
  preferFairness?: boolean;          // default true
}

export interface OpenShiftInput {
  id: string;
  roleId: string;
  /** Display name of the role — matched against users.positions[]. */
  roleName: string;
  startTime: Date;
  endTime: Date;
}

export interface UserInput {
  id: string;
  fullName: string;
  isActive: boolean;
  /** Lower-cased role names this user can fill. */
  positions: string[];
  hourlyRate: number | null;
}

/** Existing assigned shifts in the same scheduling week, used for hour caps + conflicts. */
export interface ExistingShiftInput {
  userId: string;
  startTime: Date;
  endTime: Date;
}

export interface AvailabilityInput {
  userId: string;
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number;
  isAvailable: boolean;
  /** "HH:MM" in the venue's local time; null = "all day". */
  startTime: string | null;
  endTime: string | null;
  /**
   * Optional one-off date override ("YYYY-MM-DD"). When set, this row
   * takes precedence over the recurring (date === null) rule for the
   * same user on that exact calendar day.
   */
  date?: string | null;
}

export interface ApprovedTimeOff {
  userId: string;
  startDate: string;   // YYYY-MM-DD inclusive
  endDate: string;     // YYYY-MM-DD inclusive
}

export interface AssignmentResult {
  shiftId: string;
  userId: string | null;        // null = couldn't assign
  /** Either why the user was picked, or why no one could be assigned. */
  reasons: string[];
  /** Soft warnings (e.g. "near OT cap") — assignment still went through. */
  warnings: string[];
}

const DEFAULTS: Required<AutoAssignConfig> = {
  maxHoursPerWeek: 40,
  maxHoursPerDay: 12,
  overtimeWarnAtWeeklyHours: 35,
  preferFairness: true,
};

const HOURS_PER_MS = 1 / 3_600_000;
const DAY_MS = 86_400_000;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth()    === b.getMonth()
    && a.getDate()     === b.getDate();
}

function dayOfWeek(d: Date): number { return d.getDay(); }
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** "HH:MM" → minutes-from-midnight (NaN-safe; missing → null). */
function hhmmToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Two intervals [a,b] and [c,d] overlap iff each starts before the other ends. */
function overlaps(a: Date, b: Date, c: Date, d: Date): boolean {
  return a.getTime() < d.getTime() && b.getTime() > c.getTime();
}

function hours(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) * HOURS_PER_MS);
}

interface EligibleCandidate {
  user: UserInput;
  reasons: string[];
  warnings: string[];
  /** weekly hours after this assignment lands. */
  projectedWeeklyHours: number;
  /** existing weekly hours before this assignment. */
  existingWeeklyHours: number;
  /** does the user already have a shift today? — used for continuity scoring. */
  alreadyOnThisDay: boolean;
}

export function autoAssign(
  openShifts: OpenShiftInput[],
  users: UserInput[],
  existingShifts: ExistingShiftInput[],
  availability: AvailabilityInput[],
  approvedTimeOff: ApprovedTimeOff[],
  config: AutoAssignConfig = {},
): AssignmentResult[] {
  const cfg = { ...DEFAULTS, ...config };

  // Mutable working set — shifts we assign here count toward subsequent
  // hour caps and conflict checks. Seeded with the existing shifts.
  type LiveShift = { userId: string; startTime: Date; endTime: Date };
  const liveShifts: LiveShift[] = existingShifts.map((s) => ({ ...s }));

  // Index time-off by userId for O(N) lookup per shift.
  const timeOffByUser = new Map<string, ApprovedTimeOff[]>();
  for (const t of approvedTimeOff) {
    const arr = timeOffByUser.get(t.userId) ?? [];
    arr.push(t);
    timeOffByUser.set(t.userId, arr);
  }

  // Two indexes — date-specific overrides win when present; recurring
  // DOW rules are the fallback. Building once up front keeps the inner
  // candidate loop O(1) per lookup.
  const availByUserDate = new Map<string, AvailabilityInput>();   // key: "userId:YYYY-MM-DD"
  const availByUserDow  = new Map<string, AvailabilityInput>();   // key: "userId:dow"
  for (const a of availability) {
    if (a.date) availByUserDate.set(`${a.userId}:${a.date}`, a);
    else        availByUserDow.set(`${a.userId}:${a.dayOfWeek}`, a);
  }

  // Process shifts in start-time order so earlier shifts get the wider
  // pool. Assigning the latest first would force later shifts onto users
  // who hadn't been "used up" yet, which inverts the natural week.
  const ordered = [...openShifts].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const results: AssignmentResult[] = [];

  for (const shift of ordered) {
    const shiftHours = hours(shift.startTime, shift.endTime);
    const shiftDow = dayOfWeek(shift.startTime);
    const shiftDate = isoDate(shift.startTime);
    const shiftStartMin = shift.startTime.getHours() * 60 + shift.startTime.getMinutes();
    const shiftEndMin = shift.endTime.getHours() * 60 + shift.endTime.getMinutes();
    const roleNameLc = shift.roleName.toLowerCase();

    const candidates: EligibleCandidate[] = [];
    const skippedReasons: string[] = [];

    for (const user of users) {
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (!user.isActive) { skippedReasons.push(`${user.fullName}: inactive`); continue; }

      // Position match — case-insensitive against the role's display name.
      const userPositionsLc = user.positions.map((p) => p.toLowerCase());
      if (!userPositionsLc.includes(roleNameLc)) {
        skippedReasons.push(`${user.fullName}: not trained for ${shift.roleName}`);
        continue;
      }
      reasons.push(`Trained for ${shift.roleName}`);

      // Approved time-off blocks the date.
      const tos = timeOffByUser.get(user.id) ?? [];
      const onTimeOff = tos.some((t) => t.startDate <= shiftDate && shiftDate <= t.endDate);
      if (onTimeOff) {
        skippedReasons.push(`${user.fullName}: on approved time-off`);
        continue;
      }

      // Availability resolution: a date-specific override on the shift's
      // exact calendar day wins over the recurring DOW rule. If neither
      // exists, the user is treated as available (no preference). When
      // a row exists with isAvailable=false, the user is blocked. When
      // a window is supplied, the shift must sit inside it.
      const avail =
        availByUserDate.get(`${user.id}:${shiftDate}`) ??
        availByUserDow.get(`${user.id}:${shiftDow}`);
      if (avail) {
        if (!avail.isAvailable) {
          skippedReasons.push(`${user.fullName}: marked unavailable on day ${shiftDow}`);
          continue;
        }
        const aStart = hhmmToMin(avail.startTime);
        const aEnd = hhmmToMin(avail.endTime);
        if (aStart !== null && aEnd !== null) {
          if (shiftStartMin < aStart || shiftEndMin > aEnd) {
            skippedReasons.push(`${user.fullName}: outside availability window`);
            continue;
          }
        }
        reasons.push("Available");
      } else {
        reasons.push("No availability conflict");
      }

      // Existing-shift conflict (overlap check on the live working set).
      const userLive = liveShifts.filter((s) => s.userId === user.id);
      const conflict = userLive.some((s) => overlaps(s.startTime, s.endTime, shift.startTime, shift.endTime));
      if (conflict) {
        skippedReasons.push(`${user.fullName}: overlapping shift`);
        continue;
      }

      // Hour caps. Existing weekly hours = sum of overlap with the
      // full week containing the shift.
      const weekStartMs = shift.startTime.getTime() - shiftDow * DAY_MS;
      const weekEndMs = weekStartMs + 7 * DAY_MS;
      const weeklyHoursSoFar = userLive.reduce((acc, s) => {
        if (s.endTime.getTime() <= weekStartMs) return acc;
        if (s.startTime.getTime() >= weekEndMs) return acc;
        return acc + hours(s.startTime, s.endTime);
      }, 0);
      const dailyHoursSoFar = userLive.reduce((acc, s) => {
        return sameDay(s.startTime, shift.startTime) ? acc + hours(s.startTime, s.endTime) : acc;
      }, 0);

      if (weeklyHoursSoFar + shiftHours > cfg.maxHoursPerWeek) {
        skippedReasons.push(`${user.fullName}: would exceed ${cfg.maxHoursPerWeek}h/week`);
        continue;
      }
      if (dailyHoursSoFar + shiftHours > cfg.maxHoursPerDay) {
        skippedReasons.push(`${user.fullName}: would exceed ${cfg.maxHoursPerDay}h on this day`);
        continue;
      }

      const projectedWeekly = weeklyHoursSoFar + shiftHours;
      if (projectedWeekly >= cfg.overtimeWarnAtWeeklyHours) {
        warnings.push(`Will land at ${projectedWeekly.toFixed(1)}h this week — near OT cap`);
      }

      candidates.push({
        user,
        reasons,
        warnings,
        projectedWeeklyHours: projectedWeekly,
        existingWeeklyHours: weeklyHoursSoFar,
        alreadyOnThisDay: dailyHoursSoFar > 0,
      });
    }

    if (candidates.length === 0) {
      // Surface the most informative skipped reason — favor any
      // venue-level "all out / on time off" reasons so the manager
      // sees actionable text instead of a positions-mismatch noise.
      const summary = skippedReasons[0] ?? "no eligible user";
      results.push({
        shiftId: shift.id,
        userId: null,
        reasons: [`Couldn't assign: ${summary}${skippedReasons.length > 1 ? ` (+${skippedReasons.length - 1} other)` : ""}`],
        warnings: [],
      });
      continue;
    }

    // Soft scoring — pick the best eligible candidate. Highest score wins.
    const scored = candidates.map((c) => {
      let score = 0.5;
      const localReasons: string[] = [];

      // Fairness: lower existing weekly hours = higher score. Range
      // 0..0.5 of the score weight.
      if (cfg.preferFairness) {
        const fairnessBonus = Math.max(0, (cfg.maxHoursPerWeek - c.existingWeeklyHours) / cfg.maxHoursPerWeek) * 0.5;
        score += fairnessBonus;
        if (c.existingWeeklyHours < 10) localReasons.push("under 10h so far this week");
        else if (c.existingWeeklyHours < 25) localReasons.push(`${c.existingWeeklyHours.toFixed(0)}h so far this week`);
      }

      // Continuity: prefer continuing a day they're already working.
      if (c.alreadyOnThisDay) {
        score += 0.2;
        localReasons.push("already on the floor today");
      }

      // Hours-far-from-cap headroom — small bonus.
      const headroom = (cfg.maxHoursPerWeek - c.projectedWeeklyHours) / cfg.maxHoursPerWeek;
      score += Math.max(0, headroom) * 0.15;

      return { ...c, score, extraReasons: localReasons };
    });

    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0];

    // Commit the assignment to the live working set so subsequent shifts
    // in this run see the updated weekly + daily totals.
    liveShifts.push({
      userId: winner.user.id,
      startTime: shift.startTime,
      endTime: shift.endTime,
    });

    results.push({
      shiftId: shift.id,
      userId: winner.user.id,
      reasons: [...winner.reasons, ...winner.extraReasons],
      warnings: winner.warnings,
    });
  }

  return results;
}
