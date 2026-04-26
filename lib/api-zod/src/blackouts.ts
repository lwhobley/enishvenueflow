/**
 * Time-off blackout dates — peak-volume periods when ENISH does NOT accept
 * vacation/personal-day requests. Both the api-server (POST /time-off) and
 * the employee schedule UI consume this list, so a request blocked on one
 * side is also blocked on the other.
 *
 * Each entry is an inclusive [start, end] pair in local-calendar
 * `YYYY-MM-DD` format. We intentionally do NOT use Date objects so timezone
 * offsets can't shift a date by a day — the comparison is pure string math.
 *
 * To extend coverage to a future year (Mother's Day, Thanksgiving, etc.
 * are calendar-floating), append the new ranges with explicit dates.
 */

export interface BlackoutRange {
  start: string;          // YYYY-MM-DD inclusive
  end: string;            // YYYY-MM-DD inclusive
  label: string;          // human-readable reason
}

export const BLACKOUT_RANGES: BlackoutRange[] = [
  // ── 2026 ──────────────────────────────────────────────────────────────
  { start: "2026-02-13", end: "2026-02-14", label: "Valentine's Day" },
  { start: "2026-05-08", end: "2026-05-10", label: "Mother's Day weekend" },
  { start: "2026-05-23", end: "2026-05-25", label: "Memorial Day weekend" },
  // FIFA World Cup — entire month per ownership directive.
  { start: "2026-06-01", end: "2026-06-30", label: "FIFA World Cup (June)" },
  { start: "2026-07-03", end: "2026-07-05", label: "Fourth of July weekend" },
  { start: "2026-09-04", end: "2026-09-07", label: "Labor Day weekend" },
  { start: "2026-10-30", end: "2026-10-31", label: "Halloween" },
  { start: "2026-11-25", end: "2026-11-29", label: "Thanksgiving + Black Friday weekend" },
  { start: "2026-12-24", end: "2026-12-25", label: "Christmas Eve + Christmas Day" },
  { start: "2026-12-31", end: "2027-01-01", label: "New Year's Eve + New Year's Day" },

  // ── 2027 ──────────────────────────────────────────────────────────────
  { start: "2027-02-13", end: "2027-02-14", label: "Valentine's Day" },
  { start: "2027-05-07", end: "2027-05-09", label: "Mother's Day weekend" },
  { start: "2027-05-29", end: "2027-05-31", label: "Memorial Day weekend" },
  { start: "2027-07-03", end: "2027-07-05", label: "Fourth of July weekend" },
  { start: "2027-09-03", end: "2027-09-06", label: "Labor Day weekend" },
  { start: "2027-10-30", end: "2027-10-31", label: "Halloween" },
  { start: "2027-11-24", end: "2027-11-28", label: "Thanksgiving + Black Friday weekend" },
  { start: "2027-12-24", end: "2027-12-25", label: "Christmas Eve + Christmas Day" },
  { start: "2027-12-31", end: "2028-01-01", label: "New Year's Eve + New Year's Day" },
];

/**
 * Returns every blackout that overlaps the inclusive [requestStart, requestEnd]
 * window. Empty array means the window is clear and the request can proceed.
 */
export function findBlackoutOverlaps(requestStart: string, requestEnd: string): BlackoutRange[] {
  if (!requestStart || !requestEnd) return [];
  // String comparison works because dates are zero-padded YYYY-MM-DD.
  const lo = requestStart < requestEnd ? requestStart : requestEnd;
  const hi = requestStart < requestEnd ? requestEnd : requestStart;
  return BLACKOUT_RANGES.filter((b) => !(b.end < lo || b.start > hi));
}

/**
 * Pretty-prints a blackout list for use in toast/error messages.
 *   "FIFA World Cup (June), Fourth of July weekend"
 */
export function describeBlackouts(blackouts: BlackoutRange[]): string {
  if (blackouts.length === 0) return "";
  return blackouts.map((b) => b.label).join(", ");
}

/**
 * Convenience: returns blackouts that haven't ended yet, sorted by start date.
 * The employee schedule UI uses this to show a small banner of "next blackouts."
 */
export function upcomingBlackouts(now: Date = new Date(), limit = 6): BlackoutRange[] {
  const today = now.toISOString().slice(0, 10);
  return BLACKOUT_RANGES
    .filter((b) => b.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, limit);
}
