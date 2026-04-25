import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptions, users } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { assertSelf } from "../lib/auth-guards";

const router = Router();

// Configure VAPID
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || "mailto:admin@enish.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

// ── GET /push/vapid-public-key ────────────────────────────────────────────────
router.get("/push/vapid-public-key", (_req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ message: "Push not configured" });
  res.json({ publicKey: VAPID_PUBLIC });
});

// ── POST /push/subscribe ─────────────────────────────────────────────────────
router.post("/push/subscribe", async (req, res) => {
  try {
    const { userId, venueId, subscription } = req.body;
    if (!userId || !venueId || !subscription?.endpoint)
      return res.status(400).json({ message: "userId, venueId, and subscription required" });
    // A user only ever subscribes their own browser/PWA — push tokens are
    // device-specific and shouldn't be writable on someone else's behalf.
    if (!assertSelf(req, res, userId)) return;

    const { endpoint, keys } = subscription;
    if (!keys?.p256dh || !keys?.auth)
      return res.status(400).json({ message: "subscription.keys.p256dh and .auth required" });

    // Upsert — replace if endpoint already exists for this user
    await db
      .insert(pushSubscriptions)
      .values({ userId, venueId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: keys.p256dh, auth: keys.auth, userId, venueId },
      });

    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to save subscription" });
  }
});

// ── DELETE /push/subscribe ────────────────────────────────────────────────────
router.delete("/push/subscribe", async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: "endpoint required" });
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to remove subscription" });
  }
});

// ── POST /push/send ──────────────────────────────────────────────────────────
// Internal — send a notification to one user or all users in a venue
router.post("/push/send", async (req, res) => {
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE)
      return res.status(503).json({ message: "Push not configured" });

    const { venueId, userId, title, body, url } = req.body;
    if (!venueId || !title) return res.status(400).json({ message: "venueId and title required" });

    const conditions = [eq(pushSubscriptions.venueId, venueId)];
    if (userId) conditions.push(eq(pushSubscriptions.userId, userId));

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(and(...conditions));

    const payload = JSON.stringify({ title, body: body ?? "", url: url ?? "/" });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
    );

    // Remove stale subscriptions (410 Gone)
    const stale: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const code = (r.reason as { statusCode?: number })?.statusCode;
        if (code === 410 || code === 404) stale.push(subs[i].endpoint);
      }
    });
    if (stale.length) {
      await Promise.all(stale.map((ep) => db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, ep))));
    }

    const sent = results.filter((r) => r.status === "fulfilled").length;
    res.json({ sent, failed: results.length - sent });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

export default router;
