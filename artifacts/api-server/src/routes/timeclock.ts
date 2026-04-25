import { Router } from "express";
import { db } from "@workspace/db";
import { timeClockEntries, timeOffRequests, users, shifts, venues, schedules } from "@workspace/db";
import { eq, and, gte, lte, or, inArray } from "drizzle-orm";
import { adpStatus, isAdpConfigured, pushTimeEntry, pullRecentEntries } from "../lib/adp";
import { notifyManagers, notifyUser } from "../lib/push";
import { assertSelf } from "../lib/auth-guards";

const router = Router();

// ── Venue anchor fallbacks (used only if the venue record has no GPS pin) ───
// To move the pin: manager → Settings → Clock-in GPS Pin, or PUT
// /api/venues/:id with { latitude, longitude, clockInRadiusFeet }.
const FALLBACK_VENUE_LAT = 29.736002;
const FALLBACK_VENUE_LNG = -95.461831;
const DEFAULT_RADIUS_FEET = 800;
const FEET_PER_METER = 3.28084;
// Any fix claiming worse than this accuracy is almost certainly WiFi /
// cell-tower positioning rather than real GPS. Phone GPS outdoors is
// typically 5–30 m. Keeping this tight (75 m / ~246 ft) — with a bit
// of headroom over the client-side 50 m cap — means the server rejects
// coarse fixes even if the client lets one slip through.
const MAX_ACCEPTABLE_ACCURACY_M = 75;
// Allow a tight cushion for real-GPS jitter on top of the venue radius.
const GPS_ACCURACY_BUFFER_M = 25;
const SHIFT_WINDOW_BEFORE_MS = 30 * 60 * 1000;
const SHIFT_WINDOW_AFTER_MS  = 15 * 60 * 1000;

// Haversine distance in metres
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isSuspiciousLocation(lat: number, lng: number, accuracy: number): boolean {
  if (lat === 0 && lng === 0) return true;
  // Real-phone GPS never reports sub-decimetre accuracy. A value < 0.1 m
  // is the fingerprint of a mocked-location app reporting a perfect fix.
  // (The previous `accuracy !== undefined` guard was dead code because
  // accuracy is always a number by the time we get here — and worse,
  // `Number(accuracy) || 50` swallowed any literal 0 from a spoof.)
  if (Number.isFinite(accuracy) && accuracy < 0.1) return true;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return true;
  return false;
}

function formatEntry(e: typeof timeClockEntries.$inferSelect, userName?: string | null) {
  return {
    ...e,
    totalHours: e.totalHours ? parseFloat(e.totalHours) : null,
    userName: userName ?? null,
  };
}

// ── Fire-and-forget ADP push (handles both create and update) ───────────────
async function syncEntryToAdp(entryId: string) {
  try {
    const [entry] = await db.select().from(timeClockEntries).where(eq(timeClockEntries.id, entryId));
    if (!entry) return;
    // Only skip when already synced with no pending changes.
    if (entry.adpExternalId && entry.adpSyncStatus === "synced") return;
    if (!isAdpConfigured()) return; // leaves adpSyncStatus="pending" for later

    const result = await pushTimeEntry(
      {
        entryId: entry.id,
        userId: entry.userId,
        venueId: entry.venueId,
        clockIn: entry.clockIn,
        clockOut: entry.clockOut,
        source: entry.source,
        biometricVerified: entry.biometricVerified,
        deviceId: entry.deviceId,
        totalHours: entry.totalHours,
        breakMinutes: entry.breakMinutes,
      },
      entry.adpExternalId, // if set -> PUT (update), else POST (create)
    );

    if (result.ok) {
      await db.update(timeClockEntries)
        .set({ adpSyncStatus: "synced", adpSyncedAt: new Date(), adpExternalId: result.externalId, adpSyncError: null })
        .where(eq(timeClockEntries.id, entry.id));
    } else if ("skipped" in result && result.skipped) {
      // leave as pending, do nothing
    } else if (!result.ok) {
      await db.update(timeClockEntries)
        .set({ adpSyncStatus: "failed", adpSyncError: ("error" in result ? result.error : "Unknown error").slice(0, 500) })
        .where(eq(timeClockEntries.id, entry.id));
    }
  } catch (err) {
    // swallow — sync is best-effort
    console.error("ADP sync error:", err);
  }
}

// ── POST /time-clock/in ───────────────────────────────────────────────────────
router.post("/time-clock/in", async (req, res) => {
  try {
    const {
      userId, venueId, notes, lat, lng, accuracy, clientTimestamp,
      source, biometricVerified, deviceId,
    } = req.body;
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });
    // Even admins shouldn't be able to clock IN as someone else — the time
    // record is legally tied to whoever pressed the button.
    if (!assertSelf(req, res, userId)) return;

    const entrySource: string = ["mobile_gps", "phone_biometric"].includes(source) ? source : "mobile_gps";
    const bioVerified = !!biometricVerified;

    if (lat === undefined || lng === undefined) {
      return res.status(403).json({ message: "Location is required to clock in. Please enable GPS." });
    }
    const latN = Number(lat);
    const lngN = Number(lng);
    // Use ?? not ||: a literal 0 is meaningful for the spoof check
    // (perfect-accuracy mocked GPS) and must not be silently rewritten
    // to the 50 m default.
    const accN = Number(accuracy ?? 50);

    if (isSuspiciousLocation(latN, lngN, accN)) {
      return res.status(403).json({ message: "Location appears to be spoofed or invalid. Real GPS required." });
    }
    if (accN > MAX_ACCEPTABLE_ACCURACY_M) {
      // Coarse WiFi / cell-tower fix — refuse before comparing distances,
      // because a ±kilometer accuracy can put the user miles from where
      // they actually are. Better UX than a confusing "too far" error.
      const feet = Math.round(accN * FEET_PER_METER);
      return res.status(403).json({
        message: `GPS isn't accurate enough yet (±${feet} ft). Step outside or wait a few seconds for a better fix, then try again.`,
        accuracyMeters: accN,
      });
    }
    if (clientTimestamp) {
      const ageSeconds = (Date.now() - Number(clientTimestamp)) / 1000;
      if (ageSeconds > 30) return res.status(403).json({ message: "Location data is stale. Please try again." });
    }

    // Resolve the venue's GPS pin + radius. If unset, fall back to the
    // historical constants for backward compatibility.
    const [venueRow] = await db.select().from(venues).where(eq(venues.id, venueId));
    const venueLat = venueRow?.latitude != null ? Number(venueRow.latitude) : FALLBACK_VENUE_LAT;
    const venueLng = venueRow?.longitude != null ? Number(venueRow.longitude) : FALLBACK_VENUE_LNG;
    const radiusFeet = venueRow?.clockInRadiusFeet ?? DEFAULT_RADIUS_FEET;
    const radiusM = radiusFeet / FEET_PER_METER;

    const dist = haversineM(latN, lngN, venueLat, venueLng);
    const allowedDist = radiusM + Math.min(accN, GPS_ACCURACY_BUFFER_M);
    if (dist > allowedDist) {
      const feet = (dist * FEET_PER_METER).toFixed(0);
      return res.status(403).json({
        message: `You must be within ${radiusFeet} feet of ${venueRow?.address ?? "the venue"}. You are currently ${feet} ft away.`,
        distanceMeters: dist, distanceFeet: Number(feet),
      });
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    // shifts has no venueId — venue is reached via shifts.scheduleId →
    // schedules.venueId. Resolve the venue's schedule ids first, then
    // filter today's shifts for this user inside that set.
    const venueScheduleIds = (
      await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.venueId, venueId))
    ).map((s) => s.id);
    const todayShifts = venueScheduleIds.length === 0
      ? []
      : await db.select().from(shifts)
          .where(and(
            eq(shifts.userId, userId),
            inArray(shifts.scheduleId, venueScheduleIds),
            gte(shifts.startTime, todayStart),
            lte(shifts.startTime, todayEnd),
          ));

    if (todayShifts.length === 0) return res.status(403).json({ message: "You are not scheduled to work today." });

    const nowMs = now.getTime();
    const validShift = todayShifts.find((s) => {
      const start = new Date(s.startTime).getTime();
      const end   = new Date(s.endTime).getTime();
      return nowMs >= start - SHIFT_WINDOW_BEFORE_MS && nowMs <= end + SHIFT_WINDOW_AFTER_MS;
    });
    if (!validShift) return res.status(403).json({ message: "Clock-in is only allowed within 30 minutes of your scheduled shift time." });

    const [existing] = await db.select().from(timeClockEntries)
      .where(and(eq(timeClockEntries.userId, userId), eq(timeClockEntries.status, "active")));
    if (existing) return res.status(400).json({ message: "Already clocked in" });

    const [entry] = await db.insert(timeClockEntries).values({
      userId, venueId, clockIn: now, status: "active", notes: notes ?? null,
      source: entrySource, biometricVerified: bioVerified, deviceId: deviceId ?? null,
      // Mark "skipped" when ADP isn't configured so the periodic sync
      // job doesn't keep re-trying entries it can never push. Setting
      // this back to "pending" later (once ADP is configured) is a
      // one-shot DB update.
      adpSyncStatus: isAdpConfigured() ? "pending" : "skipped",
    }).returning();

    // Fire-and-forget ADP sync
    void syncEntryToAdp(entry.id);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    res.status(201).json(formatEntry(entry, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to clock in" });
  }
});

// ── POST /time-clock/out ──────────────────────────────────────────────────────
router.post("/time-clock/out", async (req, res) => {
  try {
    const { userId, venueId, breakMinutes = 0, notes, source, biometricVerified, deviceId } = req.body;
    if (!userId || !venueId) return res.status(400).json({ message: "userId and venueId required" });
    if (!assertSelf(req, res, userId)) return;

    const [active] = await db.select().from(timeClockEntries)
      .where(and(eq(timeClockEntries.userId, userId), eq(timeClockEntries.status, "active")));
    if (!active) return res.status(400).json({ message: "Not clocked in" });

    const clockOut = new Date();
    const totalMs = clockOut.getTime() - active.clockIn.getTime() - breakMinutes * 60000;
    const totalHours = String(Math.max(0, totalMs / 3600000).toFixed(2));

    const outSource: string = ["mobile_gps", "phone_biometric"].includes(source) ? source : active.source;
    const bioVerified = biometricVerified !== undefined ? !!biometricVerified : active.biometricVerified;

    const [updated] = await db.update(timeClockEntries).set({
      clockOut, totalHours, breakMinutes, status: "completed",
      notes: notes ?? active.notes,
      source: outSource,
      biometricVerified: bioVerified,
      deviceId: deviceId ?? active.deviceId,
      // Completing the shift invalidates any prior sync — push again
      adpSyncStatus: "pending",
    }).where(eq(timeClockEntries.id, active.id)).returning();

    void syncEntryToAdp(updated.id);

    const [user] = await db.select().from(users).where(eq(users.id, updated.userId));
    res.json(formatEntry(updated, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to clock out" });
  }
});

// ── POST /time-clock/terminal ────────────────────────────────────────────────
// Webhook for a physical biometric terminal (e.g. ADP time clock device).
// Secured with a shared header `X-Terminal-Key` (env: TERMINAL_API_KEY).
// Body: { userId, venueId, type: "in" | "out", deviceId?, timestamp?, externalId? }
router.post("/time-clock/terminal", async (req, res) => {
  try {
    const expected = process.env.TERMINAL_API_KEY;
    const got = req.header("x-terminal-key");
    if (!expected || !got || got !== expected) {
      return res.status(401).json({ message: "Invalid or missing terminal API key" });
    }

    const { userId, venueId, type, deviceId, timestamp, externalId, notes } = req.body;
    if (!userId || !venueId || !["in", "out"].includes(type)) {
      return res.status(400).json({ message: "userId, venueId, and type ('in'|'out') required" });
    }

    const when = timestamp ? new Date(timestamp) : new Date();

    if (type === "in") {
      const [existing] = await db.select().from(timeClockEntries)
        .where(and(eq(timeClockEntries.userId, userId), eq(timeClockEntries.status, "active")));
      if (existing) return res.status(400).json({ message: "Already clocked in" });

      const [entry] = await db.insert(timeClockEntries).values({
        userId, venueId, clockIn: when, status: "active",
        source: "terminal_biometric", biometricVerified: true,
        deviceId: deviceId ?? null,
        adpExternalId: externalId ?? null,
        adpSyncStatus: externalId ? "synced" : "pending",
        adpSyncedAt: externalId ? new Date() : null,
        notes: notes ?? null,
      }).returning();
      if (!externalId) void syncEntryToAdp(entry.id);
      return res.status(201).json(formatEntry(entry));
    }

    // type === "out"
    const [active] = await db.select().from(timeClockEntries)
      .where(and(eq(timeClockEntries.userId, userId), eq(timeClockEntries.status, "active")));
    if (!active) return res.status(400).json({ message: "Not clocked in" });

    const totalMs = when.getTime() - active.clockIn.getTime();
    const totalHours = String(Math.max(0, totalMs / 3600000).toFixed(2));

    const [updated] = await db.update(timeClockEntries).set({
      clockOut: when, totalHours, status: "completed",
      source: "terminal_biometric", biometricVerified: true,
      deviceId: deviceId ?? active.deviceId,
      adpExternalId: externalId ?? active.adpExternalId,
      adpSyncStatus: externalId ? "synced" : "pending",
      adpSyncedAt: externalId ? new Date() : active.adpSyncedAt,
    }).where(eq(timeClockEntries.id, active.id)).returning();
    if (!externalId) void syncEntryToAdp(updated.id);
    res.json(formatEntry(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to process terminal event" });
  }
});

// ── GET /time-clock/adp-status ───────────────────────────────────────────────
router.get("/time-clock/adp-status", async (req, res) => {
  try {
    const pending = await db.select().from(timeClockEntries).where(eq(timeClockEntries.adpSyncStatus, "pending"));
    const failed  = await db.select().from(timeClockEntries).where(eq(timeClockEntries.adpSyncStatus, "failed"));
    res.json({ ...adpStatus(), pendingCount: pending.length, failedCount: failed.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to get ADP status" });
  }
});

// ── POST /time-clock/sync-adp ────────────────────────────────────────────────
// Admin-triggered: push all pending/failed entries, then pull ADP recent entries.
router.post("/time-clock/sync-adp", async (req, res) => {
  try {
    const { venueId } = req.body as { venueId?: string };
    if (!isAdpConfigured()) {
      return res.status(200).json({
        configured: false,
        message: "ADP credentials not configured. Entries remain pending until configured.",
        pushed: 0, pulled: 0,
      });
    }

    // Push everything that needs pushing — whether first-time (no externalId)
    // or an update to an already-synced entry that has since changed.
    const toPush = await db.select().from(timeClockEntries).where(
      or(eq(timeClockEntries.adpSyncStatus, "pending"), eq(timeClockEntries.adpSyncStatus, "failed"))
    );
    let pushed = 0;
    for (const e of toPush) {
      await syncEntryToAdp(e.id);
      pushed++;
    }

    // Pull last 14 days
    let pulled = 0;
    if (venueId) {
      const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const remote = await pullRecentEntries(venueId, since);
      for (const r of remote) {
        const [existing] = await db.select().from(timeClockEntries).where(eq(timeClockEntries.adpExternalId, r.externalId));
        if (existing) continue;
        await db.insert(timeClockEntries).values({
          userId: r.userId, venueId: r.venueId,
          clockIn: r.clockIn, clockOut: r.clockOut,
          status: r.clockOut ? "completed" : "active",
          source: r.source, biometricVerified: r.source === "terminal_biometric",
          deviceId: r.deviceId,
          adpExternalId: r.externalId,
          adpSyncStatus: "synced",
          adpSyncedAt: new Date(),
        });
        pulled++;
      }
    }

    res.json({ configured: true, pushed, pulled });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to sync with ADP" });
  }
});

// ── GET /time-clock/active ────────────────────────────────────────────────────
router.get("/time-clock/active", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const active = await db.select().from(timeClockEntries)
      .where(and(eq(timeClockEntries.venueId, venueId), eq(timeClockEntries.status, "active")));
    // Only look up the users we actually need — was scanning the whole users
    // table on every poll, which is O(total users across all venues).
    const venueUsers = await db.select().from(users).where(eq(users.venueId, venueId));
    const userMap = Object.fromEntries(venueUsers.map((u) => [u.id, u]));
    res.json(active.map((e) => formatEntry(e, userMap[e.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list active clock-ins" });
  }
});

// ── GET /time-clock/entries ───────────────────────────────────────────────────
router.get("/time-clock/entries", async (req, res) => {
  try {
    const { venueId, userId } = req.query as { venueId?: string; userId?: string };
    let query = db.select().from(timeClockEntries).$dynamic();
    const conditions = [];
    if (venueId) conditions.push(eq(timeClockEntries.venueId, venueId));
    if (userId) conditions.push(eq(timeClockEntries.userId, userId));
    if (conditions.length) query = query.where(and(...conditions));
    const all = await query.orderBy(timeClockEntries.clockIn);
    // Scope the user lookup to the venue so we don't hand the caller a
    // map of every user across every venue. enforceVenueScope already
    // requires venueId to match req.auth, so this is safe and saves a
    // full table scan on each call.
    const userScopeWhere = venueId
      ? eq(users.venueId, venueId)
      : req.auth ? eq(users.venueId, req.auth.venueId) : undefined;
    const venueUsers = userScopeWhere
      ? await db.select().from(users).where(userScopeWhere)
      : [];
    const userMap = Object.fromEntries(venueUsers.map((u) => [u.id, u]));
    res.json(all.map((e) => formatEntry(e, userMap[e.userId]?.fullName)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list time clock entries" });
  }
});

// ── PUT /time-clock/entries/:id ───────────────────────────────────────────────
router.put("/time-clock/entries/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { clockIn, clockOut, breakMinutes, notes } = req.body;
    const updates: Record<string, unknown> = {};
    if (clockIn) updates.clockIn = new Date(clockIn);
    if (clockOut) {
      updates.clockOut = new Date(clockOut);
      updates.status = "completed";
      const [entry] = await db.select().from(timeClockEntries).where(eq(timeClockEntries.id, id));
      if (entry) {
        const inTime = clockIn ? new Date(clockIn) : entry.clockIn;
        const outTime = new Date(clockOut);
        const br = breakMinutes ?? entry.breakMinutes ?? 0;
        const totalMs = outTime.getTime() - inTime.getTime() - br * 60000;
        updates.totalHours = String(Math.max(0, totalMs / 3600000).toFixed(2));
      }
    }
    if (breakMinutes !== undefined) updates.breakMinutes = breakMinutes;
    if (notes !== undefined) updates.notes = notes;
    // Any manager edit invalidates the ADP mirror — repush
    updates.adpSyncStatus = "pending";

    const [updated] = await db.update(timeClockEntries).set(updates).where(eq(timeClockEntries.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Entry not found" });
    void syncEntryToAdp(updated.id);
    const [user] = await db.select().from(users).where(eq(users.id, updated.userId));
    res.json(formatEntry(updated, user?.fullName));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update time clock entry" });
  }
});

// ── Time Off ──────────────────────────────────────────────────────────────────
router.get("/time-off", async (req, res) => {
  try {
    const { venueId, userId, status } = req.query as { venueId?: string; userId?: string; status?: string };
    let query = db.select().from(timeOffRequests).$dynamic();
    const conditions = [];
    if (venueId) conditions.push(eq(timeOffRequests.venueId, venueId));
    if (userId) conditions.push(eq(timeOffRequests.userId, userId));
    if (status) conditions.push(eq(timeOffRequests.status, status));
    if (conditions.length) query = query.where(and(...conditions));
    const all = await query.orderBy(timeOffRequests.createdAt);
    // Scope to the caller's venue — enforceVenueScope guarantees venueId
    // (when provided) matches req.auth.venueId, so this stays correct.
    const userScopeWhere = venueId
      ? eq(users.venueId, venueId)
      : req.auth ? eq(users.venueId, req.auth.venueId) : undefined;
    const venueUsers = userScopeWhere
      ? await db.select().from(users).where(userScopeWhere)
      : [];
    const userMap = Object.fromEntries(venueUsers.map((u) => [u.id, u]));
    res.json(all.map((r) => ({ ...r, userName: userMap[r.userId]?.fullName ?? null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list time-off requests" });
  }
});

router.post("/time-off", async (req, res) => {
  try {
    const { userId, venueId, startDate, endDate, type, notes } = req.body;
    if (!userId || !venueId || !startDate || !endDate || !type)
      return res.status(400).json({ message: "userId, venueId, startDate, endDate, type required" });
    // Time-off requests must be filed by the actual requester. Admins can
    // approve/deny via the dedicated endpoints below but shouldn't create
    // a request "from" someone else.
    if (!assertSelf(req, res, userId)) return;
    const [req_] = await db.insert(timeOffRequests)
      .values({ userId, venueId, startDate, endDate, type, notes: notes ?? null }).returning();
    res.status(201).json(req_);
    const [requester] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId));
    void notifyManagers(venueId, {
      title: "New time-off request",
      body: `${requester?.fullName ?? "An employee"} requested ${type} from ${startDate} to ${endDate}`,
      url: "/manager/time-off",
      tag: `time-off-${req_.id}`,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create time-off request" });
  }
});

router.put("/time-off/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(timeOffRequests).set({ status: "approved" })
      .where(eq(timeOffRequests.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
    void notifyUser(updated.userId, {
      title: "Time-off approved",
      body: `${updated.type} · ${updated.startDate} to ${updated.endDate}`,
      url: "/employee/schedule",
      tag: `time-off-${id}`,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to approve" });
  }
});

router.put("/time-off/:id/deny", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(timeOffRequests).set({ status: "denied" })
      .where(eq(timeOffRequests.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
    void notifyUser(updated.userId, {
      title: "Time-off denied",
      body: `${updated.type} · ${updated.startDate} to ${updated.endDate}`,
      url: "/employee/schedule",
      tag: `time-off-${id}`,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to deny" });
  }
});

export default router;
