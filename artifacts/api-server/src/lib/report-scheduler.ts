import { db } from "@workspace/db";
import { venues, reportSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendReport } from "./report-send";

/**
 * Schedule for End-of-Shift auto-sends. Times are interpreted in
 * America/Chicago (the venue's reporting timezone). End-of-Night is NOT
 * scheduled — managers send it manually from the dashboard.
 */
const EOS_SCHEDULE: { hour: number; minute: number }[] = [
  { hour: 17, minute: 0 }, // 5:00 PM CT
  { hour: 22, minute: 0 }, // 10:00 PM CT
];

const TZ = "America/Chicago";

/**
 * Track which (slot, calendar-day) pairs we've already fired so a brief
 * minute-window doesn't fire twice on restart-or-tick overlap.
 * Key: `${YYYY-MM-DD}|${HH}:${MM}`
 */
const firedKeys = new Set<string>();

function getCentralParts(now: Date): { date: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

async function venuesToSendTo(): Promise<string[]> {
  // Send for every venue that either has explicit report_settings or is an
  // active venue (so a freshly-seeded org gets the auto-send out of the box).
  const [activeVenues, settingsRows] = await Promise.all([
    db.select({ id: venues.id }).from(venues).where(eq(venues.isActive, true)),
    db.select({ venueId: reportSettings.venueId }).from(reportSettings),
  ]);
  const ids = new Set<string>();
  for (const v of activeVenues) ids.add(v.id);
  for (const s of settingsRows) ids.add(s.venueId);
  return [...ids];
}

async function fireSlot(slotKey: string, label: string) {
  const venueIds = await venuesToSendTo();
  if (venueIds.length === 0) {
    logger.info({ slot: label }, "EOS auto-send: no venues to send for");
    return;
  }
  logger.info({ slot: label, venueCount: venueIds.length }, "EOS auto-send: firing");
  for (const venueId of venueIds) {
    try {
      const result = await sendReport({
        kind: "end_of_shift",
        venueId,
        recipientsOverride: null,
        triggeredByUserId: null,
        source: `scheduled:${label}`,
      });
      if (result.ok) {
        logger.info({ slot: label, venueId, sendId: result.sendId }, "EOS auto-send: sent");
      } else {
        logger.warn(
          { slot: label, venueId, reason: result.reason, message: result.message },
          "EOS auto-send: send failed",
        );
      }
    } catch (err) {
      logger.error({ err, slot: label, venueId }, "EOS auto-send: unexpected error");
    }
  }
  void slotKey;
}

async function tick() {
  try {
    const now = new Date();
    const { date, hour, minute } = getCentralParts(now);
    for (const slot of EOS_SCHEDULE) {
      if (slot.hour !== hour || slot.minute !== minute) continue;
      const key = `${date}|${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
      if (firedKeys.has(key)) continue;
      firedKeys.add(key);
      // Garbage-collect old keys (keep last 8 entries; we only need today's).
      if (firedKeys.size > 8) {
        const arr = [...firedKeys];
        for (const k of arr.slice(0, arr.length - 8)) firedKeys.delete(k);
      }
      await fireSlot(key, `${slot.hour}:${String(slot.minute).padStart(2, "0")} CT`);
    }
  } catch (err) {
    logger.error({ err }, "EOS auto-send tick failed");
  }
}

let started = false;
let intervalHandle: NodeJS.Timeout | null = null;

export function startReportScheduler() {
  if (started) return;
  started = true;
  // Tick once a minute. Aligning to wall-clock minutes is unnecessary because
  // we de-dupe per (date, HH:MM) slot.
  intervalHandle = setInterval(() => {
    void tick();
  }, 60_000);
  logger.info(
    { schedule: EOS_SCHEDULE.map((s) => `${s.hour}:${String(s.minute).padStart(2, "0")} ${TZ}`) },
    "End-of-Shift auto-send scheduler started",
  );
}

export function stopReportScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  started = false;
}

export const __schedulerInternals = { EOS_SCHEDULE, TZ, getCentralParts };
