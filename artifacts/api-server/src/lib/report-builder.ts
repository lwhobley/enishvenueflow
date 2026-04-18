import { db } from "@workspace/db";
import {
  reservations,
  waitlistEntries,
  timeClockEntries,
  users,
  tipPools,
  tipPoolEntries,
  venues,
} from "@workspace/db";
import { and, eq, lte } from "drizzle-orm";

export type ReportKind = "end_of_shift" | "end_of_night";

export type BusinessDayWindow = {
  /** Inclusive UTC start of the window. */
  startUtc: Date;
  /** Exclusive UTC end of the window. */
  endUtc: Date;
  /** Local YYYY-MM-DD label (Central Time) for the business day. */
  businessDate: string;
  /** Time zone label, e.g. "America/Chicago". */
  timeZone: string;
};

const TZ = "America/Chicago";

/**
 * Compute UTC offset (in minutes) for the given instant in the given IANA TZ.
 * Positive when the zone is ahead of UTC, negative when behind. Handles DST.
 */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

function localYmd(at: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(at);
}

function fromLocal(year: number, month: number, day: number, hour: number, timeZone: string, minute = 0): Date {
  // Convert wall-clock (year-month-day hour:minute) in `timeZone` to UTC.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = tzOffsetMinutes(new Date(guessUtc), timeZone);
  return new Date(guessUtc - offset * 60000);
}

function combineDateTimeInZone(ymd: string, hms: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const parts = (hms ?? "00:00").split(":").map(Number);
  const hour = parts[0] ?? 0;
  const minute = parts[1] ?? 0;
  return fromLocal(y, m, d, hour, timeZone, minute);
}

/**
 * End-of-shift window: the local business day so far (4am Central -> now).
 * End-of-night window: the full local business day (4am -> next 4am Central),
 * but capped at "now" so we never query the future.
 */
export function computeWindow(kind: ReportKind, now: Date = new Date()): BusinessDayWindow {
  const ymd = localYmd(now, TZ);
  const [y, m, d] = ymd.split("-").map(Number);

  // Business day starts at 4am local; if "now" is before 4am local, the
  // current business day is yesterday's date.
  const fourAmToday = fromLocal(y, m, d, 4, TZ);
  let businessYear = y;
  let businessMonth = m;
  let businessDay = d;
  if (now.getTime() < fourAmToday.getTime()) {
    const yesterday = new Date(fourAmToday.getTime() - 24 * 60 * 60 * 1000);
    businessYear = yesterday.getUTCFullYear();
    businessMonth = yesterday.getUTCMonth() + 1;
    businessDay = yesterday.getUTCDate();
  }
  const startUtc = fromLocal(businessYear, businessMonth, businessDay, 4, TZ);
  const nextDay = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  const endOfNightUtc = fromLocal(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    4,
    TZ,
  );

  // Both EOS and EON cap at "now" so we never query the future. EON additionally
  // never extends past the next 4am local boundary.
  const endUtc = kind === "end_of_shift" ? now : new Date(Math.min(endOfNightUtc.getTime(), now.getTime()));

  const businessDate = `${String(businessYear).padStart(4, "0")}-${String(businessMonth).padStart(2, "0")}-${String(businessDay).padStart(2, "0")}`;

  return { startUtc, endUtc, businessDate, timeZone: TZ };
}

export type ReservationsSection = {
  totalBookings: number;
  covers: number;
  seated: number;
  noShows: number;
  cancellations: number;
  walkIns: number;
  waitlistAtClose: number;
  byHour: { hour: string; bookings: number; covers: number }[];
};

export type LaborSection = {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  totalCost: number;
  staffStillClockedIn: number;
  byRole: { role: string; hours: number; cost: number }[];
};

export type TipsSection = {
  totalTips: number;
  pools: { poolId: string; totalTips: number; status: string; entries: number }[];
  undistributedPools: number;
};

export type ReportPayload = {
  venueId: string;
  venueName: string;
  reportKind: ReportKind;
  businessDate: string;
  timeZone: string;
  generatedAt: Date;
  reservations: ReservationsSection;
  labor: LaborSection;
  tips: TipsSection;
  pendingPosNote: string;
};

const HOURS = ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];

function parseHourBucket(time: string): string {
  // time is "HH:MM" or "HH:MM:SS"; round to the hour for grouping
  const h = time?.split(":")[0] ?? "00";
  return `${h.padStart(2, "0")}:00`;
}

export async function buildReport(opts: {
  venueId: string;
  kind: ReportKind;
  now?: Date;
}): Promise<ReportPayload> {
  const win = computeWindow(opts.kind, opts.now);

  const [venueRow] = await db.select().from(venues).where(eq(venues.id, opts.venueId));
  const venueName = venueRow?.name ?? "Venue";

  // ── Reservations section ──────────────────────────────────────────────────
  const allDayReservations = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.venueId, opts.venueId), eq(reservations.date, win.businessDate)));

  // For end-of-shift, only include reservations whose seating time has occurred so far
  // (or that are already in a non-pending state like seated/completed/cancelled/no_show).
  const dayReservations =
    opts.kind === "end_of_shift"
      ? allDayReservations.filter((r) => {
          if (["seated", "completed", "cancelled", "no_show"].includes(r.status)) return true;
          const resAt = combineDateTimeInZone(win.businessDate, r.time, win.timeZone);
          return resAt.getTime() <= win.endUtc.getTime();
        })
      : allDayReservations;

  const seated = dayReservations.filter((r) => r.status === "seated" || r.status === "completed").length;
  const noShows = dayReservations.filter((r) => r.status === "no_show").length;
  const cancellations = dayReservations.filter((r) => r.status === "cancelled").length;
  const walkIns = dayReservations.filter((r) => (r.source ?? "").toLowerCase() === "walk_in" || (r.source ?? "").toLowerCase() === "walkin").length;
  const live = dayReservations.filter((r) => !["cancelled", "no_show"].includes(r.status));
  const covers = live.reduce((sum, r) => sum + (r.partySize ?? 0), 0);

  const byHourMap = new Map<string, { bookings: number; covers: number }>();
  for (const r of live) {
    const key = parseHourBucket(r.time);
    const cur = byHourMap.get(key) ?? { bookings: 0, covers: 0 };
    cur.bookings += 1;
    cur.covers += r.partySize ?? 0;
    byHourMap.set(key, cur);
  }
  const knownHours = HOURS.filter((h) => byHourMap.has(h));
  const extras = [...byHourMap.keys()].filter((h) => !HOURS.includes(h)).sort();
  const orderedHours = [...knownHours, ...extras];
  const byHour = orderedHours.map((h) => ({ hour: h, ...(byHourMap.get(h) ?? { bookings: 0, covers: 0 }) }));

  const waitingNow = await db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.venueId, opts.venueId), eq(waitlistEntries.status, "waiting")));

  const reservationsSection: ReservationsSection = {
    totalBookings: dayReservations.length,
    covers,
    seated,
    noShows,
    cancellations,
    walkIns,
    waitlistAtClose: waitingNow.length,
    byHour,
  };

  // ── Labor section ─────────────────────────────────────────────────────────
  // Include any time clock entry whose interval overlaps the window:
  //   clockIn <= window.endUtc AND (clockOut IS NULL OR clockOut >= window.startUtc)
  // (An open shift that started before window still counts toward "still clocked in".)
  const candidateEntries = await db
    .select()
    .from(timeClockEntries)
    .where(and(eq(timeClockEntries.venueId, opts.venueId), lte(timeClockEntries.clockIn, win.endUtc)));
  const allEntries = candidateEntries.filter((e) => {
    if (!e.clockOut) return true;
    return e.clockOut.getTime() >= win.startUtc.getTime();
  });
  const venueUsers = await db.select().from(users).where(eq(users.venueId, opts.venueId));
  const userMap = new Map(venueUsers.map((u) => [u.id, u] as const));

  let totalHours = 0;
  let totalCost = 0;
  const byRoleMap = new Map<string, { hours: number; cost: number }>();
  for (const e of allEntries) {
    const hrs = e.totalHours ? parseFloat(e.totalHours) : 0;
    if (!hrs) continue;
    const u = userMap.get(e.userId);
    const rate = u?.hourlyRate ? parseFloat(u.hourlyRate) : 15;
    const cost = hrs * rate;
    totalHours += hrs;
    totalCost += cost;
    const role = u?.roleId ?? "unassigned";
    const cur = byRoleMap.get(role) ?? { hours: 0, cost: 0 };
    cur.hours += hrs;
    cur.cost += cost;
    byRoleMap.set(role, cur);
  }

  const activeNow = await db
    .select()
    .from(timeClockEntries)
    .where(and(eq(timeClockEntries.venueId, opts.venueId), eq(timeClockEntries.status, "active")));

  // Resolve role IDs to names where possible
  const { roles: rolesTable } = await import("@workspace/db");
  const allRoles = await db.select().from(rolesTable).where(eq(rolesTable.venueId, opts.venueId));
  const roleNameById = new Map(allRoles.map((r) => [r.id, r.name] as const));

  const byRole = [...byRoleMap.entries()]
    .map(([roleId, v]) => ({
      role: roleNameById.get(roleId) ?? (roleId === "unassigned" ? "Unassigned" : roleId),
      hours: Math.round(v.hours * 100) / 100,
      cost: Math.round(v.cost * 100) / 100,
    }))
    .sort((a, b) => b.hours - a.hours);

  const regularHours = Math.min(totalHours, 40);
  const overtimeHours = Math.max(0, totalHours - 40);

  const laborSection: LaborSection = {
    totalHours: Math.round(totalHours * 100) / 100,
    regularHours: Math.round(regularHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    staffStillClockedIn: activeNow.length,
    byRole,
  };

  // ── Tips section ──────────────────────────────────────────────────────────
  const allPools = await db.select().from(tipPools).where(eq(tipPools.venueId, opts.venueId));
  const dayPools = allPools.filter((p) => {
    const created = (p as unknown as { createdAt?: Date }).createdAt ?? new Date(0);
    return created.getTime() >= win.startUtc.getTime() && created.getTime() <= win.endUtc.getTime();
  });

  let totalTips = 0;
  const poolSummaries: TipsSection["pools"] = [];
  for (const p of dayPools) {
    const tot = parseFloat(p.totalTips);
    totalTips += tot;
    const entries = await db.select().from(tipPoolEntries).where(eq(tipPoolEntries.poolId, p.id));
    poolSummaries.push({
      poolId: p.id,
      totalTips: Math.round(tot * 100) / 100,
      status: p.status,
      entries: entries.length,
    });
  }

  const tipsSection: TipsSection = {
    totalTips: Math.round(totalTips * 100) / 100,
    pools: poolSummaries,
    undistributedPools: poolSummaries.filter((p) => p.status !== "distributed").length,
  };

  return {
    venueId: opts.venueId,
    venueName,
    reportKind: opts.kind,
    businessDate: win.businessDate,
    timeZone: win.timeZone,
    generatedAt: new Date(),
    reservations: reservationsSection,
    labor: laborSection,
    tips: tipsSection,
    pendingPosNote: "Sales, comps, and voids will appear here once the POS integration is connected.",
  };
}
