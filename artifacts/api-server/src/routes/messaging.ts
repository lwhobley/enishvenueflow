import { Router } from "express";
import { db } from "@workspace/db";
import { messages, notifications, documents, users } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notifyVenue } from "../lib/push";

const router = Router();

router.get("/messages", async (req, res) => {
  try {
    const { venueId, channel } = req.query as { venueId: string; channel: string };
    if (!venueId || !channel) return res.status(400).json({ message: "venueId and channel required" });
    const all = await db.select().from(messages).where(and(eq(messages.venueId, venueId), eq(messages.channel, channel))).orderBy(messages.createdAt);
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.json(all.map(m => ({ ...m, senderName: userMap[m.senderId]?.fullName ?? null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list messages" });
  }
});

router.post("/messages", async (req, res) => {
  try {
    const { venueId, senderId, channel, content } = req.body;
    if (!venueId || !senderId || !channel || !content) return res.status(400).json({ message: "venueId, senderId, channel, content required" });
    const [msg] = await db.insert(messages).values({ venueId, senderId, channel, content }).returning();
    const [user] = await db.select().from(users).where(eq(users.id, senderId));
    const senderName = user?.fullName ?? "Team";
    res.status(201).json({ ...msg, senderName });
    // Fan out a push to every other subscriber in the venue.
    void notifyVenue(
      venueId,
      {
        title: `${senderName} in #${channel}`,
        body: String(content).slice(0, 180),
        url: `/manager/chat`,
        tag: `chat-${venueId}-${channel}`,
      },
      { exceptUserId: senderId },
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

// Notifications
router.get("/notifications", async (req, res) => {
  try {
    const { userId } = req.query as { userId: string };
    if (!userId) return res.status(400).json({ message: "userId required" });
    const all = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.createdAt);
    res.json(all);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list notifications" });
  }
});

router.put("/notifications/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Notification not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to mark read" });
  }
});

router.put("/notifications/read-all", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to mark all read" });
  }
});

// Documents
router.get("/documents", async (req, res) => {
  try {
    const { venueId, userId } = req.query as { venueId: string; userId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    let query = db.select().from(documents).where(eq(documents.venueId, venueId)).$dynamic();
    if (userId) query = query.where(and(eq(documents.venueId, venueId), eq(documents.userId, userId)));
    const all = await query.orderBy(documents.createdAt);
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.json(all.map(d => ({ ...d, userName: d.userId ? (userMap[d.userId]?.fullName ?? null) : null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list documents" });
  }
});

router.get("/documents/expiring", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const cutoff = thirtyDaysFromNow.toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const all = await db.select().from(documents).where(eq(documents.venueId, venueId));
    const expiring = all.filter(d => d.expiryDate && d.expiryDate >= today && d.expiryDate <= cutoff);
    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    res.json(expiring.map(d => ({ ...d, userName: d.userId ? (userMap[d.userId]?.fullName ?? null) : null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list expiring documents" });
  }
});

router.post("/documents", async (req, res) => {
  try {
    const { venueId, userId, title, type, fileUrl, expiryDate } = req.body;
    if (!venueId || !title || !type || !fileUrl) return res.status(400).json({ message: "venueId, title, type, fileUrl required" });
    const today = new Date().toISOString().split("T")[0];
    let status = "active";
    if (expiryDate) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      const cutoff = thirtyDaysFromNow.toISOString().split("T")[0];
      if (expiryDate < today) status = "expired";
      else if (expiryDate <= cutoff) status = "expiring_soon";
    }
    const [doc] = await db.insert(documents).values({ venueId, userId: userId ?? null, title, type, fileUrl, expiryDate: expiryDate ?? null, status }).returning();
    res.status(201).json(doc);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create document" });
  }
});

router.delete("/documents/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(documents).where(eq(documents.id, id));
    res.json({ message: "Document deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete document" });
  }
});

export default router;
