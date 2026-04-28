/**
 * Fire-and-forget web push helpers for chat/schedule/time-off events.
 *
 * Every caller wraps in .catch so a push failure never blocks the mutation
 * that triggered it. VAPID config is read once from env; if unset the
 * helpers no-op (the /push/send endpoint already does the same).
 */
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptions, users } from "@workspace/db";
import { eq, and, inArray, ne } from "drizzle-orm";
import { logger } from "./logger";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@enish.com";

const pushConfigured = !!VAPID_PUBLIC && !!VAPID_PRIVATE;
if (pushConfigured) {
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (err) {
    logger.warn({ err }, "VAPID setup failed; push disabled");
  }
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

type SubRow = { endpoint: string; p256dh: string; auth: string };

async function sendToSubs(subs: SubRow[], payload: PushPayload): Promise<void> {
  if (!pushConfigured || subs.length === 0) return;
  const json = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        json,
      ),
    ),
  );
  const stale: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) stale.push(subs[i].endpoint);
    }
  });
  if (stale.length) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, stale)).catch(() => { /* noop */ });
  }
}

/** Send to every subscription in the venue (optionally skipping one user). */
export async function notifyVenue(
  venueId: string,
  payload: PushPayload,
  opts: { exceptUserId?: string } = {},
): Promise<void> {
  if (!pushConfigured) return;
  try {
    const conditions = [eq(pushSubscriptions.venueId, venueId)];
    if (opts.exceptUserId) conditions.push(ne(pushSubscriptions.userId, opts.exceptUserId));
    const subs = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(and(...conditions));
    await sendToSubs(subs, payload);
  } catch (err) {
    logger.warn({ err, venueId, title: payload.title }, "notifyVenue failed");
  }
}

/** Send to every subscription tied to a single user. */
export async function notifyUser(userId: string, payload: PushPayload): Promise<void> {
  if (!pushConfigured || !userId) return;
  try {
    const subs = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    await sendToSubs(subs, payload);
  } catch (err) {
    logger.warn({ err, userId, title: payload.title }, "notifyUser failed");
  }
}

/**
 * Send to every active employee in the venue whose `positions[]` array
 * includes `roleName` (case-insensitive). Used to broadcast newly-open
 * shifts to anyone trained for the position. `exceptUserId` lets the
 * caller skip the user who just dropped or got reassigned away from
 * the shift — they don't need a "hey, your old shift is open" push.
 */
export async function notifyEligibleForRole(
  venueId: string,
  roleName: string,
  payload: PushPayload,
  opts: { exceptUserId?: string } = {},
): Promise<void> {
  if (!pushConfigured || !roleName) return;
  try {
    const conditions = [
      eq(users.venueId, venueId),
      eq(users.isActive, true),
    ];
    if (opts.exceptUserId) conditions.push(ne(users.id, opts.exceptUserId));
    const venueUsers = await db
      .select({ id: users.id, positions: users.positions })
      .from(users)
      .where(and(...conditions));
    const targetLc = roleName.toLowerCase();
    const eligibleIds = venueUsers
      .filter((u) => (u.positions ?? []).some((p) => p.toLowerCase() === targetLc))
      .map((u) => u.id);
    if (eligibleIds.length === 0) return;
    const subs = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, eligibleIds));
    await sendToSubs(subs, payload);
  } catch (err) {
    logger.warn({ err, venueId, roleName, title: payload.title }, "notifyEligibleForRole failed");
  }
}

/** Send to every admin user in the venue (managers). */
export async function notifyManagers(venueId: string, payload: PushPayload): Promise<void> {
  if (!pushConfigured) return;
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.venueId, venueId), eq(users.isAdmin, true), eq(users.isActive, true)));
    if (admins.length === 0) return;
    const subs = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, admins.map((a) => a.id)));
    await sendToSubs(subs, payload);
  } catch (err) {
    logger.warn({ err, venueId, title: payload.title }, "notifyManagers failed");
  }
}
